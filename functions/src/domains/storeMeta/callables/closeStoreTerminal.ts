/**
 * Phase6 Step3: 閉店ターミナル Callable。
 * 未会計付与・closeRuns 記録・reset/cleanup/migrate・finalize を順次実行する。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { requireAdmin } from '../../../shared/devices';
import { acquireProcessing, extendProcessing, releaseProcessing } from '../services/processingLease';
import { applyCloseSnapshotCore } from '../services/applyCloseSnapshot';
import { computeDisplayAmount } from '../services/computeDisplayAmount';
import { runResetAllSideGames } from '../services/resetAllSideGames';
import { runResetAllTables } from '../services/resetAllTables';
import { runCleanupActiveStays } from '../services/cleanupActiveStaysOnClose';
import { runMigrateSettledBillsForBusinessDay } from '../../analytics/callables/migrateSettledBillsForBusinessDay';
import { getUnclosedTournamentsForCloseCore } from '../services/getUnclosedTournamentsForClose';

const CLOSE_STEPS = [
  'UNSETTLED_MARK',
  'markUnclockedAndForceEnd',
  'resetSideGames',
  'resetTables',
  'cleanupActiveStays',
  'migrateMissedSettlements',
  'finalizeCloseStateDoc',
] as const;

export const closeStoreTerminal = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '認証が必要です');
    }

    const adminId = request.auth.uid;
    const db = getFirestore();
    await requireAdmin(db, adminId);

    const stateRef = db.collection('storeMeta').doc('currentBusinessDay');
    const stateSnap = await stateRef.get();
    if (!stateSnap.exists) {
      throw new HttpsError(
        'invalid-argument',
        'storeMeta/currentBusinessDay が存在しません。初期化を実行してください。'
      );
    }

    const stateData = stateSnap.data()!;
    const status = stateData.status as string | undefined;
    const currentBusinessDateKey = stateData.currentBusinessDateKey as string | null | undefined;

    if (status !== 'running') {
      throw new HttpsError(
        'invalid-argument',
        `閉店可能な状態ではありません。status: ${status}`
      );
    }
    if (currentBusinessDateKey == null || typeof currentBusinessDateKey !== 'string' || currentBusinessDateKey.trim() === '') {
      throw new HttpsError(
        'invalid-argument',
        'currentBusinessDateKey が設定されていません。'
      );
    }

    const closedBusinessDate = currentBusinessDateKey.trim();
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

          const batch = db.batch();
          for (const doc of attendancesSnap.docs) {
            const d = doc.data();
            if (d.clockIn != null) {
              batch.update(doc.ref, {
                closedStoreWithoutClockOut: true,
                closedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
          }
          if (!attendancesSnap.empty) await batch.commit();

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
          // openAssessment の blockers に already_running_different_date がある場合のみ、
          // そのブロッカーを削除し result を ready_to_open にする（強警告ゲート解消）。
          // 閉店時 null にする assessment は closeAssessment のみという仕様は変えない。
          const openAssessment = stateData.openAssessment as
            | { result?: string; blockers?: string[]; [k: string]: unknown }
            | null
            | undefined;
          const hasAlreadyRunningDifferentDate =
            openAssessment &&
            Array.isArray(openAssessment.blockers) &&
            (openAssessment.blockers as string[]).includes('already_running_different_date');
          const openAssessmentUpdate = hasAlreadyRunningDifferentDate
            ? {
                ...openAssessment,
                result: 'ready_to_open',
                blockers: (openAssessment!.blockers as string[]).filter(
                  (b: string) => b !== 'already_running_different_date'
                ),
              }
            : undefined;

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
            ...(openAssessmentUpdate !== undefined && { openAssessment: openAssessmentUpdate }),
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
            logger.warn('UNSETTLED_MARK rollback failed', { runId, rollbackErrorSummary });
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
