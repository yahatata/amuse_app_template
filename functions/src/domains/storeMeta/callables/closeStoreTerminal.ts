/**
 * Phase6 Step3: 閉店ターミナル Callable。
 * 未会計付与・closeRuns 記録・reset/cleanup/migrate・finalize を順次実行する。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { CloudTasksClient } from '@google-cloud/tasks';
import { requireAdmin } from '../../../shared/devices';
import { acquireProcessing, extendProcessing, releaseProcessing } from '../services/processingLease';
import { applyCloseSnapshotCore } from '../services/applyCloseSnapshot';
import { computeDisplayAmount } from '../services/computeDisplayAmount';
import { runResetAllSideGames } from '../services/resetAllSideGames';
import { runResetAllTables } from '../services/resetAllTables';
import { runCleanupActiveStays } from '../services/cleanupActiveStaysOnClose';
import { runMigrateSettledBillsForBusinessDay } from '../../analytics/callables/migrateSettledBillsForBusinessDay';
import { getUnclosedTournamentsForCloseCore } from '../services/getUnclosedTournamentsForClose';
import { endActiveBreaksForClockOut } from '../../attendance/helpers/recalculateAttendanceFromBreaks';
import { writeAttendanceLog } from '../../attendance/helpers/attendanceLogs';
import {
  OPENCLOSE_TASKS_QUEUE,
  OPENCLOSE_TASKS_REGION,
  OPENCLOSE_INVOKER_SA_PREFIX,
  buildInvokerSaEmail,
} from '../../../shared/config/cloudTasksConfig';
import { getRequiredProjectId } from '../../../shared/runtime/projectId';
import { getTaskEndpoints } from '../../../shared/secrets/secretManager';
import { generateJstDateKey } from '../../../shared/time';
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';
import { logOpsError } from '../../../shared/logging/logOpsError';

const CLOSE_STEPS = [
  'UNSETTLED_MARK',
  'markUnclockedAndForceEnd',
  'resetSideGames',
  'resetTables',
  'cleanupActiveStays',
  'migrateMissedSettlements',
  'finalizeCloseStateDoc',
] as const;

async function enqueueOpenAssessmentRecheckTask(params: {
  projectId: string;
  intendedBusinessDateKey: string;
  scheduledAtIso: string;
}): Promise<void> {
  const { projectId, intendedBusinessDateKey, scheduledAtIso } = params;
  const tasksClient = new CloudTasksClient();
  const queuePath = tasksClient.queuePath(
    projectId,
    OPENCLOSE_TASKS_REGION,
    OPENCLOSE_TASKS_QUEUE
  );
  const scheduleTimeEpochSeconds = Math.floor(new Date(scheduledAtIso).getTime() / 1000);
  const taskId = `open_assessment_recheck_after_close_${intendedBusinessDateKey}_${scheduleTimeEpochSeconds}`;
  const taskName = tasksClient.taskPath(
    projectId,
    OPENCLOSE_TASKS_REGION,
    OPENCLOSE_TASKS_QUEUE,
    taskId
  );
  const tasksInvokerSa = buildInvokerSaEmail(
    OPENCLOSE_INVOKER_SA_PREFIX,
    projectId
  );
  const { openAssessmentUrl } = await getTaskEndpoints();
  const taskPayload = {
    action: 'open_assessment_recheck',
    intendedBusinessDateKey,
    scheduledAt: scheduledAtIso,
  };

  try {
    await tasksClient.createTask({
      parent: queuePath,
      task: {
        name: taskName,
        httpRequest: {
          httpMethod: 'POST',
          url: openAssessmentUrl,
          headers: {
            'Content-Type': 'application/json',
          },
          body: Buffer.from(JSON.stringify(taskPayload)).toString('base64'),
          oidcToken: {
            serviceAccountEmail: tasksInvokerSa,
          },
        },
        scheduleTime: {
          seconds: scheduleTimeEpochSeconds,
        },
      },
    });
  } catch (error: unknown) {
    const err = error as { code?: number };
    if (err?.code === 6) {
      // ALREADY_EXISTS: 同一タスクが既に存在する場合は成功扱い
      return;
    }
    throw error;
  }
}

export const closeStoreTerminal = onCall(
  { region: 'asia-northeast1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '認証が必要です');
    }

    const adminId = request.auth.uid;
    const db = getFirestore();
    await requireAdmin(db, adminId);

    const stateRef = db.collection('storeMeta').doc('currentBusinessDay');
    const stateSnap = await stateRef.get();
    let closedBusinessDate: string;
    try {
      if (!stateSnap.exists) {
        throw new FunctionCustomError({
          errorKey: 'STORE_STATE_DOC_MISSING',
          message: 'storeMeta/currentBusinessDay が存在しません。初期化を実行してください。',
          context: { phase: 'close_terminal_preflight' },
        });
      }

      const stateData = stateSnap.data()!;
      const status = stateData.status as string | undefined;
      const currentBusinessDateKey = stateData.currentBusinessDateKey as string | null | undefined;

      if (status !== 'running') {
        throw new FunctionCustomError({
          errorKey: 'STORE_NOT_RUNNING',
          message: `閉店可能な状態ではありません。status: ${status}`,
          context: { status, phase: 'close_terminal_preflight' },
        });
      }
      if (currentBusinessDateKey == null || typeof currentBusinessDateKey !== 'string' || currentBusinessDateKey.trim() === '') {
        throw new FunctionCustomError({
          errorKey: 'STORE_BUSINESS_DATE_UNAVAILABLE',
          message: 'currentBusinessDateKey が設定されていません。',
          context: { status, phase: 'close_terminal_preflight' },
        });
      }

      closedBusinessDate = currentBusinessDateKey.trim();
    } catch (e) {
      if (e instanceof FunctionCustomError) {
        logOpsError({
          message: 'closeStoreTerminal preflight failed',
          functionEntry: 'closeStoreTerminal',
          operation: 'closeTerminalPreflight',
          cause: e,
        });
        throw new HttpsError(mapFunctionCustomErrorToHttpsCode(e.errorKey), e.message);
      }
      throw e;
    }
    const reqData = request.data != null && typeof request.data === 'object' ? (request.data as { runId?: string; forceClose?: boolean }) : {};
    const requestRunId = typeof reqData.runId === 'string' ? reqData.runId.trim() : undefined;
    const forceClose = reqData.forceClose === true;
    const runId =
      requestRunId && requestRunId.length > 0
        ? requestRunId
        : `close_${closedBusinessDate}_${Date.now()}`;

    try {
      await acquireProcessing(db, { runId, kind: 'close', requestRunId: requestRunId ?? null });
    } catch (e) {
      if (e instanceof FunctionCustomError) {
        logOpsError({
          message: 'acquireProcessing failed',
          functionEntry: 'closeStoreTerminal',
          operation: 'acquireProcessingLease',
          cause: e,
        });
        throw new HttpsError(mapFunctionCustomErrorToHttpsCode(e.errorKey), e.message);
      }
      if (e instanceof HttpsError) throw e;
      throw new HttpsError('internal', `processing 獲得に失敗しました: ${e}`);
    }

    // 仕様: storeMeta/closeRuns/{runId}。Firestore は col/doc/col/doc のため closeRuns を doc とし、その下に runs サブコレで run を格納。
    const closeRunsRef = db.collection('storeMeta').doc('closeRuns').collection('runs').doc(runId);
    const runDocSnap = await closeRunsRef.get();
    if (!runDocSnap.exists) {
      await closeRunsRef.set({
        status: 'running',
        closedBusinessDate,
        forceClose,
        startedAt: Timestamp.now(),
        lastCompletedStep: null,
        failedStep: null,
        lastErrorSummary: null,
        unsettledCount: 0,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      await closeRunsRef.update({
        status: 'running',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const runDocData = (await closeRunsRef.get()).data();
    const effectiveForceClose = runDocData?.forceClose === true || forceClose;

    const runDocAfter = await closeRunsRef.get();
    const lastCompleted = (runDocAfter.data()?.lastCompletedStep as string | null) ?? null;
    const startStepIndex = lastCompleted
      ? Math.min(CLOSE_STEPS.indexOf(lastCompleted as (typeof CLOSE_STEPS)[number]) + 1, CLOSE_STEPS.length)
      : 0;

    let markResult: { writtenBillIds: string[]; usersIncremented: Array<{ userId: string; inc: number }> } | null = null;
    /** §4.8 閉店処理完了後のダイアログ表示用 */
    let displaySummary: {
      unsettledMark: { count: number; pokerNames: string[] };
      cleanupActiveStays: { deleted: number; failed: number };
      migrateMissedSettlements: { processedCount: number; pokerNames: string[] };
      storeMeta: string;
    } = {
      unsettledMark: { count: 0, pokerNames: [] },
      cleanupActiveStays: { deleted: 0, failed: 0 },
      migrateMissedSettlements: { processedCount: 0, pokerNames: [] },
      storeMeta: '',
    };

    for (let i = startStepIndex; i < CLOSE_STEPS.length; i++) {
      const stepName = CLOSE_STEPS[i];
      const attemptId = `attempt_${Date.now()}`;
      const attemptRef = closeRunsRef.collection('steps').doc(stepName).collection('attempts').doc(attemptId);

      await attemptRef.set({
        attemptId,
        startedAt: Timestamp.now(),
        result: null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      try {
        if (stepName === 'UNSETTLED_MARK') {
          const billsSnap = await db
            .collection('bills')
            .where('businessDate', '==', closedBusinessDate)
            .where('status', 'in', ['open', 'in_progress', 'settling'])
            .get();

          const billIds = billsSnap.docs.map((d) => d.id);
          const amountsByBillId: Record<string, number> = {};
          for (const doc of billsSnap.docs) {
            const amount = await computeDisplayAmount(db, doc.id);
            amountsByBillId[doc.id] = amount;
          }

          const coreResult = await applyCloseSnapshotCore(db, {
            billIds,
            amountsByBillId,
            closedBusinessDate,
            closeRunId: runId,
          });

          markResult = {
            writtenBillIds: coreResult.writtenBillIds,
            usersIncremented: coreResult.usersIncremented,
          };

          await closeRunsRef.update({
            unsettledCount: coreResult.writtenBillIds.length,
            lastCompletedStep: stepName,
            updatedAt: FieldValue.serverTimestamp(),
          });

          const batch = db.batch();
          for (const billId of coreResult.writtenBillIds) {
            const unRef = closeRunsRef.collection('unsettledBills').doc(billId);
            batch.set(unRef, { billId, updatedAt: FieldValue.serverTimestamp() });
          }
          if (coreResult.writtenBillIds.length > 0) await batch.commit();

          const pokerNames: string[] = [];
          for (const billId of coreResult.writtenBillIds) {
            const billSnap = await db.collection('bills').doc(billId).get();
            const name = (billSnap.data()?.party?.pokerName as string) ?? '';
            pokerNames.push(name.trim() || '—');
          }
          displaySummary.unsettledMark = { count: coreResult.writtenBillIds.length, pokerNames };
        } else if (stepName === 'markUnclockedAndForceEnd') {
          // Phase4 03/01: 未退勤 attendance に closedStoreWithoutClockOut + closedAt を付与（営業日フィルタなし・決定4,5）
          const attendancesSnap = await db
            .collection('attendances')
            .where('clockOut', '==', null)
            .get();

          // Phase4.1-E2: 休憩中（isOnBreak: true）の attendance に endActiveBreaksForClockOut 相当の処理を追加
          const closedAtTs = Timestamp.now();
          for (const doc of attendancesSnap.docs) {
            const d = doc.data();
            if (d.isOnBreak === true) {
              await endActiveBreaksForClockOut(doc.ref, closedAtTs);
            }
          }

          const batch = db.batch();
          const updatedAttendanceIds: string[] = [];
          for (const doc of attendancesSnap.docs) {
            const d = doc.data();
            if (d.clockIn != null) {
              batch.update(doc.ref, {
                closedStoreWithoutClockOut: true,
                closedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
              });
              updatedAttendanceIds.push(doc.id);
            }
          }
          if (!attendancesSnap.empty) await batch.commit();

          // Phase4.1-E2: attendanceLogs に close_store_unclocked を書き込み
          for (const attendanceId of updatedAttendanceIds) {
            await writeAttendanceLog({
              db,
              attendanceId,
              actionType: 'close_store_unclocked',
              performedByUid: adminId,
              performedByDeviceId: null,
            });
          }

          // Phase4 03: 強制閉店時は未 close トーナメントを force_ended に更新
          if (effectiveForceClose) {
            const unclosed = await getUnclosedTournamentsForCloseCore(db, closedBusinessDate);
            for (const t of unclosed) {
              const tournamentRef = db.collection('scheduledTournaments').doc(t.tournamentId);
              const tablesSeatSnap = await db
                .collection('scheduledTournaments')
                .doc(t.tournamentId)
                .collection('tablesSeat')
                .get();

              const tableNames: string[] = [];
              tablesSeatSnap.forEach((doc) => {
                if (doc.id !== 'waiting' && doc.id !== 'busted') tableNames.push(doc.id);
              });

              await tournamentRef.update({
                status: 'force_ended',
                endedAt: new Date(),
                updatedAt: FieldValue.serverTimestamp(),
              });

              for (const tableName of tableNames) {
                const tableRef = db.collection('tables').doc(tableName);
                const tableDoc = await tableRef.get();
                if (tableDoc.exists) {
                  await tableRef.update({ status: 'open' });
                }
              }
            }
          }

          await closeRunsRef.update({
            lastCompletedStep: stepName,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else if (stepName === 'resetSideGames') {
          await runResetAllSideGames(db);
          await closeRunsRef.update({
            lastCompletedStep: stepName,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else if (stepName === 'resetTables') {
          await runResetAllTables(db);
          await closeRunsRef.update({
            lastCompletedStep: stepName,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else if (stepName === 'cleanupActiveStays') {
          const cleanupResult = await runCleanupActiveStays(db);
          displaySummary.cleanupActiveStays = {
            deleted: cleanupResult.deleted,
            failed: cleanupResult.failed,
          };
          await closeRunsRef.update({
            lastCompletedStep: stepName,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else if (stepName === 'migrateMissedSettlements') {
          const migrateResult = await runMigrateSettledBillsForBusinessDay(db, closedBusinessDate);
          displaySummary.migrateMissedSettlements = {
            processedCount: migrateResult.processedCount,
            pokerNames: migrateResult.processedPokerNames ?? [],
          };
          await closeRunsRef.update({
            lastCompletedStep: stepName,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else if (stepName === 'finalizeCloseStateDoc') {
          await attemptRef.update({
            result: 'success',
            completedAt: Timestamp.now(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          // 正常閉店後は openAssessment を直接編集せず、即時再評価 task で上書きする。
          const latestState = (await stateRef.get()).data() as
            | { openAssessment?: { intendedBusinessDateKey?: string | null } | null }
            | undefined;
          const intendedFromAssessment =
            latestState?.openAssessment?.intendedBusinessDateKey?.trim();
          const intendedBusinessDateKeyForRecheck =
            intendedFromAssessment && /^\d{4}-\d{2}-\d{2}$/.test(intendedFromAssessment)
              ? intendedFromAssessment
              : generateJstDateKey();
          const recheckScheduledAtIso = new Date().toISOString();
          let recheckEnqueued = false;
          let recheckEnqueueError: string | null = null;

          try {
            await enqueueOpenAssessmentRecheckTask({
              projectId: getRequiredProjectId(),
              intendedBusinessDateKey: intendedBusinessDateKeyForRecheck,
              scheduledAtIso: recheckScheduledAtIso,
            });
            recheckEnqueued = true;
          } catch (enqueueError) {
            recheckEnqueueError = enqueueError instanceof Error
              ? enqueueError.message
              : String(enqueueError);
            logOpsError({
              message: 'openAssessment recheck enqueue failed after close',
              functionEntry: 'closeStoreTerminal',
              operation: 'finalizeCloseStateDoc.enqueueOpenAssessmentRecheck',
              cause: enqueueError,
              errorKey: 'STORE_OPEN_ASSESSMENT_RECHECK_ENQUEUE_FAILED',
              sourceProductHint: 'cloud_tasks',
              context: {
                runId,
                closedBusinessDate,
                intendedBusinessDateKeyForRecheck,
                recheckEnqueueError,
              },
            });
          }

          await stateRef.update({
            status: 'closed',
            lastClosedBusinessDateKey: closedBusinessDate,
            currentBusinessDateKey: null,
            updatedAt: FieldValue.serverTimestamp(),
            source: 'terminal',
            lastError: null,
            processing: FieldValue.delete(),
            // 正常閉店時は閉店認定のみクリアする（openAssessment はクリアしない）
            closeAssessment: null,
            manualOverrides: FieldValue.delete(),
            manualOverride: FieldValue.delete(),
          });
          const recheckLogRef = stateRef
            .collection('assessmentLogs')
            .doc(`open_recheck_after_close_${Date.now()}`);
          await recheckLogRef.set({
            type: 'open_recheck_after_close',
            action: 'open_assessment_recheck',
            intendedBusinessDateKey: intendedBusinessDateKeyForRecheck,
            scheduledAt: recheckScheduledAtIso,
            source: 'terminal',
            enqueueSucceeded: recheckEnqueued,
            enqueueError: recheckEnqueueError,
            createdAt: Timestamp.now(),
          });
          await closeRunsRef.update({
            status: 'completed',
            completedAt: Timestamp.now(),
            lastCompletedStep: stepName,
            updatedAt: FieldValue.serverTimestamp(),
          });
          await releaseProcessing(db, { runId });

          displaySummary.storeMeta = `status=closed, 営業日 ${closedBusinessDate} を閉店しました。`;
          return {
            success: true,
            runId,
            status: 'completed',
            closedBusinessDate,
            message: `${closedBusinessDate} の営業を閉店しました。`,
            displaySummary: displaySummary,
          };
        }

        await attemptRef.update({
          result: 'success',
          completedAt: Timestamp.now(),
          summaryCounts: stepName === 'UNSETTLED_MARK' && markResult
            ? { writtenCount: markResult.writtenBillIds.length }
            : {},
          updatedAt: FieldValue.serverTimestamp(),
        });
        await extendProcessing(db, { runId, kind: 'close' });
      } catch (stepError) {
        const err = stepError instanceof Error ? stepError : new Error(String(stepError));
        const errMsg = err.message.slice(0, 200);
        const errCode = err instanceof HttpsError ? err.code : 'internal';
        logOpsError({
          message: 'closeStoreTerminal: close step failed',
          functionEntry: 'closeStoreTerminal',
          operation: `runCloseStep.${stepName}`,
          cause: stepError,
          errorKey: 'STORE_CLOSE_STEP_FAILED',
          context: {
            runId,
            closedBusinessDate,
            stepName,
          },
        });

        await attemptRef.update({
          result: 'failed',
          completedAt: Timestamp.now(),
          error: { code: errCode, message: errMsg },
          updatedAt: FieldValue.serverTimestamp(),
        });
        await closeRunsRef.update({
          status: 'failed',
          failedStep: stepName,
          lastErrorSummary: errMsg,
          lastCompletedStep: i > 0 ? CLOSE_STEPS[i - 1] : null,
          updatedAt: FieldValue.serverTimestamp(),
        });

        if (stepName === 'UNSETTLED_MARK' && markResult) {
          let rollbackResult: 'success' | 'failed' = 'success';
          let rollbackErrorSummary: string | undefined;

          try {
            for (const billId of markResult.writtenBillIds) {
              await db.collection('bills').doc(billId).update({
                closeSnapshot: FieldValue.delete(),
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
            for (const { userId, inc } of markResult.usersIncremented) {
              await db.collection('users').doc(userId).update({
                unsettledBillsCount: FieldValue.increment(-inc),
              });
            }
            for (const billId of markResult.writtenBillIds) {
              await closeRunsRef.collection('unsettledBills').doc(billId).delete();
            }
          } catch (rbErr) {
            rollbackResult = 'failed';
            rollbackErrorSummary = (rbErr instanceof Error ? rbErr.message : String(rbErr)).slice(0, 200);
            logOpsError({
              message: 'closeStoreTerminal: UNSETTLED_MARK rollback failed',
              functionEntry: 'closeStoreTerminal',
              operation: 'rollbackUnsettledMark',
              cause: rbErr,
              errorKey: 'STORE_CLOSE_ROLLBACK_FAILED',
              context: {
                runId,
                rollbackErrorSummary,
              },
            });
          }

          await attemptRef.update({
            summaryCounts: {
              writtenCount: markResult.writtenBillIds.length,
              rollbackResult,
              ...(rollbackErrorSummary && { rollbackErrorSummary }),
            },
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        await releaseProcessing(db, { runId });

        throw new HttpsError(
          err instanceof HttpsError ? err.code : 'internal',
          `閉店処理がステップ「${stepName}」で失敗しました。再開可能です。${errMsg}`,
          { runId }
        );
      }
    }

    displaySummary.storeMeta = `status=closed, 営業日 ${closedBusinessDate} を閉店しました。`;
    return {
      success: true,
      runId,
      status: 'completed',
      closedBusinessDate,
      message: `${closedBusinessDate} の営業を閉店しました。`,
      displaySummary: displaySummary,
    };
  }
);
