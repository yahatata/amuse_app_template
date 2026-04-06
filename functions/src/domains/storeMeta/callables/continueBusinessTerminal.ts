/**
 * Phase6 Step8: 営業継続 Callable。
 * 強警告表示時に「営業継続」を選択した場合、manualOverride（close_skip）の設定・
 * closeAssessment の needs_manual_close_suppressed への更新・指定時間後の closeAssessmentTask の enqueue を 1 操作で実行する。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { CloudTasksClient } from '@google-cloud/tasks';
import { getCallerDeviceByUid, requireAdmin } from '../../../shared/devices';
import {
  OPENCLOSE_TASKS_QUEUE,
  OPENCLOSE_TASKS_REGION,
  OPENCLOSE_INVOKER_SA_PREFIX,
  buildInvokerSaEmail,
} from '../../../shared/config/cloudTasksConfig';
import { getRequiredProjectId } from '../../../shared/runtime/projectId';
import { getTaskEndpoints } from '../../../shared/secrets/secretManager';
import { logOpsError } from '../../../shared/logging/logOpsError';
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';

type OpenAssessmentLike = {
  result?: string;
  blockers?: unknown;
  intendedBusinessDateKey?: string;
  [k: string]: unknown;
};

async function createAssessmentTask(params: {
  tasksClient: CloudTasksClient;
  projectId: string;
  tasksLocation: string;
  tasksQueue: string;
  tasksInvokerSa: string;
  url: string;
  taskId: string;
  payload: Record<string, unknown>;
  scheduleTimeEpochSeconds: number;
}): Promise<void> {
  const {
    tasksClient,
    projectId,
    tasksLocation,
    tasksQueue,
    tasksInvokerSa,
    url,
    taskId,
    payload,
    scheduleTimeEpochSeconds,
  } = params;
  const queuePath = tasksClient.queuePath(projectId, tasksLocation, tasksQueue);
  const taskName = tasksClient.taskPath(projectId, tasksLocation, tasksQueue, taskId);

  try {
    await tasksClient.createTask({
      parent: queuePath,
      task: {
        name: taskName,
        httpRequest: {
          httpMethod: 'POST',
          url,
          headers: {
            'Content-Type': 'application/json',
          },
          body: Buffer.from(JSON.stringify(payload)).toString('base64'),
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

export const continueBusinessTerminal = onCall(
  { region: 'asia-northeast1' },
  async (request) => {
    try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '認証が必要です');
    }

    const adminId = request.auth.uid;
    const db = getFirestore();
    await requireAdmin(db, adminId);

    const data = request.data as { intendedBusinessDateKey?: string; hours?: number } | undefined;
    const intendedBusinessDateKey =
      data?.intendedBusinessDateKey != null && typeof data.intendedBusinessDateKey === 'string'
        ? data.intendedBusinessDateKey.trim()
        : null;
    const hours = data?.hours != null && typeof data.hours === 'number' ? data.hours : null;

    if (intendedBusinessDateKey == null || intendedBusinessDateKey === '') {
      throw new HttpsError('invalid-argument', 'intendedBusinessDateKey は必須です。');
    }
    const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateKeyPattern.test(intendedBusinessDateKey)) {
      throw new HttpsError('invalid-argument', 'intendedBusinessDateKey は YYYY-MM-DD 形式である必要があります。');
    }
    if (hours == null || !Number.isInteger(hours) || hours < 1 || hours > 8) {
      throw new HttpsError('invalid-argument', 'hours は 1 以上 8 以下の整数である必要があります。');
    }

    const stateRef = db.collection('storeMeta').doc('currentBusinessDay');
    const stateSnap = await stateRef.get();
    if (!stateSnap.exists) {
      throw new FunctionCustomError({
        errorKey: 'STORE_STATE_DOC_MISSING',
        message: 'storeMeta/currentBusinessDay が存在しません。',
        context: { phase: 'continue_business' },
      });
    }

    const stateData = stateSnap.data()!;
    const status = stateData.status as string | undefined;
    if (status !== 'running') {
      throw new FunctionCustomError({
        errorKey: 'STORE_NOT_RUNNING',
        message: `営業継続は status が running のときのみ実行できます。現在: ${status}`,
        context: { status, phase: 'continue_business' },
      });
    }

    const now = new Date();
    const scheduleAt = new Date(now.getTime() + hours * 60 * 60 * 1000);
    const scheduledAtIso = scheduleAt.toISOString();
    const idempotencyKey = `close_assessment_${intendedBusinessDateKey}_${scheduledAtIso}`;
    const continueLogId = `continue_business_${intendedBusinessDateKey}_${scheduledAtIso}`;

    const projectId = getRequiredProjectId();
    const { closeAssessmentUrl, openAssessmentUrl } = await getTaskEndpoints();
    const tasksQueue = OPENCLOSE_TASKS_QUEUE;
    const tasksLocation = OPENCLOSE_TASKS_REGION;
    const tasksInvokerSa = buildInvokerSaEmail(
      OPENCLOSE_INVOKER_SA_PREFIX,
      projectId
    );
    const callerDevice = await getCallerDeviceByUid(adminId);

    let openOverrideIntendedBusinessDateKey: string | null = null;

    await db.runTransaction(async (transaction) => {
      const stateDoc = await transaction.get(stateRef);
      if (!stateDoc.exists) {
        throw new FunctionCustomError({
          errorKey: 'STORE_STATE_DOC_MISSING',
          message: 'storeMeta/currentBusinessDay が存在しません。',
          context: { phase: 'continue_business_tx' },
        });
      }

      const blockers: string[] = [];
      const activeStaysSnapshot = await db
        .collection('activeStays')
        .where('isActive', '==', true)
        .limit(1)
        .get();
      if (!activeStaysSnapshot.empty) {
        blockers.push('activeStaysNotEmpty');
      }

      const overrideUntil = Timestamp.fromMillis(scheduleAt.getTime());
      const decidedAt = Timestamp.now();
      const currentManualOverrides = stateDoc.data()?.manualOverrides as
        | Record<string, unknown>
        | null
        | undefined;
      const manualOverrides: Record<string, unknown> = {
        ...(currentManualOverrides && typeof currentManualOverrides === 'object'
          ? currentManualOverrides
          : {}),
        close: {
          type: 'close_skip',
          intendedBusinessDateKey,
          overrideUntil,
        },
      };

      const openAssessment = stateDoc.data()?.openAssessment as OpenAssessmentLike | null | undefined;
      const openBlockers = Array.isArray(openAssessment?.blockers)
        ? (openAssessment?.blockers as string[])
        : [];
      const shouldAlsoSuppressOpen =
        openAssessment?.result === 'skipped' &&
        openBlockers.includes('already_running_different_date') &&
        typeof openAssessment?.intendedBusinessDateKey === 'string' &&
        openAssessment.intendedBusinessDateKey.trim().length > 0;
      if (shouldAlsoSuppressOpen) {
        openOverrideIntendedBusinessDateKey =
          openAssessment!.intendedBusinessDateKey!.trim();
        manualOverrides.open = {
          type: 'open_skip',
          intendedBusinessDateKey: openOverrideIntendedBusinessDateKey,
          overrideUntil,
        };
      }

      transaction.update(stateRef, {
        manualOverrides,
        manualOverride: FieldValue.delete(),
        closeAssessment: {
          idempotencyKey,
          intendedBusinessDateKey,
          decidedAt,
          result: 'needs_manual_close_suppressed',
          blockers,
          source: 'terminal',
          scheduledAt: scheduledAtIso,
          lastSuppressedAt: decidedAt,
          suppressedByOverride: true,
        },
        ...(shouldAlsoSuppressOpen
          ? {
              openAssessment: {
                ...openAssessment,
                lastSuppressedAt: decidedAt,
                suppressedByOverride: true,
              },
            }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const continueLogRef = stateRef.collection('assessmentLogs').doc(continueLogId);
      transaction.set(continueLogRef, {
        type: 'continue_business',
        action: 'continue_business_terminal',
        intendedBusinessDateKey,
        hours,
        scheduledAt: scheduledAtIso,
        overrideUntil,
        decidedAt,
        source: 'terminal',
        createdAt: decidedAt,
        performedByUid: adminId,
        performedByRole: callerDevice?.role ?? null,
        performedByDeviceId: callerDevice?.id ?? null,
        openOverrideApplied: shouldAlsoSuppressOpen,
        openOverrideIntendedBusinessDateKey: shouldAlsoSuppressOpen
          ? openOverrideIntendedBusinessDateKey
          : null,
      });
    });

    const tasksClient = new CloudTasksClient();
    const scheduleTimeEpochSeconds = Math.floor(scheduleAt.getTime() / 1000);
    const closeTaskId = `close_assessment_reminder_${intendedBusinessDateKey}_${scheduleTimeEpochSeconds}`;
    const closeTaskPayload = {
      action: 'close_assessment',
      intendedBusinessDateKey,
      scheduledAt: scheduledAtIso,
    };

    try {
      await createAssessmentTask({
        tasksClient,
        projectId,
        tasksLocation,
        tasksQueue,
        tasksInvokerSa,
        url: closeAssessmentUrl,
        taskId: closeTaskId,
        payload: closeTaskPayload,
        scheduleTimeEpochSeconds,
      });

      if (openOverrideIntendedBusinessDateKey != null) {
        const openTaskId = `open_assessment_recheck_${openOverrideIntendedBusinessDateKey}_${scheduleTimeEpochSeconds}`;
        const openTaskPayload = {
          action: 'open_assessment_recheck',
          intendedBusinessDateKey: openOverrideIntendedBusinessDateKey,
          scheduledAt: scheduledAtIso,
        };
        await createAssessmentTask({
          tasksClient,
          projectId,
          tasksLocation,
          tasksQueue,
          tasksInvokerSa,
          url: openAssessmentUrl,
          taskId: openTaskId,
          payload: openTaskPayload,
          scheduleTimeEpochSeconds,
        });
      }
    } catch (error: unknown) {
      const err = error as { code?: number };
      if (err?.code === 6) {
        // ALREADY_EXISTS: 同一タスクが既に存在する場合は成功扱い
      } else {
        logOpsError({
          message: 'continueBusinessTerminal: createTask failed',
          functionEntry: 'continueBusinessTerminal',
          operation: 'cloudTasksCreateTask',
          cause: error,
          sourceProductHint: 'cloud_tasks',
          context: {
            intendedBusinessDateKey,
            scheduledAt: scheduledAtIso,
          },
        });
        throw new HttpsError(
          'internal',
          `営業継続のリマインド予約に失敗しました。${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return {
      success: true,
      intendedBusinessDateKey,
      openOverrideIntendedBusinessDateKey,
      hours,
      scheduledAt: scheduledAtIso,
      message: `${hours} 時間後に閉店確認のリマインドを予約しました。`,
    };
    } catch (error) {
      if (error instanceof FunctionCustomError) {
        logOpsError({
          message: 'continueBusinessTerminal failed',
          functionEntry: 'continueBusinessTerminal',
          cause: error,
        });
        throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
      }
      throw error;
    }
  }
);
