import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
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
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { DEFAULT_ALREADY_RUNNING_DIFFERENT_DATE_RECHECK_MINUTES } from '../../../shared/config/defaults';

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

function resolveRecheckMinutes(configMinutes: unknown): number {
  if (
    typeof configMinutes === 'number' &&
    Number.isInteger(configMinutes) &&
    configMinutes >= 1 &&
    configMinutes <= 180
  ) {
    return configMinutes;
  }
  return DEFAULT_ALREADY_RUNNING_DIFFERENT_DATE_RECHECK_MINUTES;
}

export const temporaryUnlockAlreadyRunningDifferentDateTerminal = onCall(
  { region: 'asia-northeast1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '認証が必要です');
    }

    const adminId = request.auth.uid;
    const db = getFirestore();
    await requireAdmin(db, adminId);

    const storeConfig = await getStoreConfig(db);
    const recheckMinutes = resolveRecheckMinutes(
      storeConfig.autoOpenClose?.alreadyRunningDifferentDateRecheckMinutes
    );

    const callerDevice = await getCallerDeviceByUid(adminId);
    const now = new Date();
    const scheduleAt = new Date(now.getTime() + recheckMinutes * 60 * 1000);
    const scheduledAtIso = scheduleAt.toISOString();
    const unlockLogId = `temporary_unlock_open_${scheduleAt.getTime()}`;

    const stateRef = db.collection('storeMeta').doc('currentBusinessDay');
    let intendedBusinessDateKey = '';

    await db.runTransaction(async (transaction) => {
      const stateDoc = await transaction.get(stateRef);
      if (!stateDoc.exists) {
        throw new HttpsError('failed-precondition', 'storeMeta/currentBusinessDay が存在しません。');
      }

      const stateData = stateDoc.data()!;
      const status = stateData.status as string | undefined;
      if (status !== 'running') {
        throw new HttpsError(
          'failed-precondition',
          `緊急一時解除は status が running のときのみ実行できます。現在: ${status}`
        );
      }

      const openAssessment = stateData.openAssessment as OpenAssessmentLike | null | undefined;
      const blockers = Array.isArray(openAssessment?.blockers)
        ? (openAssessment?.blockers as string[])
        : [];
      const isAlreadyRunningDifferentDate =
        openAssessment?.result === 'skipped' &&
        blockers.includes('already_running_different_date');
      const intended = openAssessment?.intendedBusinessDateKey?.trim();

      if (!isAlreadyRunningDifferentDate || !intended) {
        throw new HttpsError(
          'failed-precondition',
          'already_running_different_date の強警告が発生していないため、緊急一時解除は実行できません。'
        );
      }
      intendedBusinessDateKey = intended;

      const overrideUntil = Timestamp.fromMillis(scheduleAt.getTime());
      const decidedAt = Timestamp.now();
      const currentManualOverrides = stateData.manualOverrides as
        | Record<string, unknown>
        | null
        | undefined;
      const manualOverrides: Record<string, unknown> = {
        ...(currentManualOverrides && typeof currentManualOverrides === 'object'
          ? currentManualOverrides
          : {}),
        open: {
          type: 'open_skip',
          intendedBusinessDateKey: intendedBusinessDateKey,
          overrideUntil,
        },
      };

      transaction.update(stateRef, {
        manualOverrides,
        manualOverride: FieldValue.delete(),
        openAssessment: {
          ...openAssessment,
          lastSuppressedAt: decidedAt,
          suppressedByOverride: true,
        },
        updatedAt: FieldValue.serverTimestamp(),
      });

      const unlockLogRef = stateRef.collection('assessmentLogs').doc(unlockLogId);
      transaction.set(unlockLogRef, {
        type: 'open_temporary_unlock',
        action: 'temporary_unlock_already_running_different_date_terminal',
        intendedBusinessDateKey,
        recheckMinutes,
        scheduledAt: scheduledAtIso,
        overrideUntil,
        decidedAt,
        source: 'terminal',
        createdAt: decidedAt,
        performedByUid: adminId,
        performedByRole: callerDevice?.role ?? null,
        performedByDeviceId: callerDevice?.id ?? null,
      });
    });

    const projectId = getRequiredProjectId();
    const { openAssessmentUrl } = await getTaskEndpoints();
    const tasksQueue = OPENCLOSE_TASKS_QUEUE;
    const tasksLocation = OPENCLOSE_TASKS_REGION;
    const tasksInvokerSa = buildInvokerSaEmail(
      OPENCLOSE_INVOKER_SA_PREFIX,
      projectId
    );

    const tasksClient = new CloudTasksClient();
    const scheduleTimeEpochSeconds = Math.floor(scheduleAt.getTime() / 1000);
    const openTaskId = `open_assessment_recheck_${intendedBusinessDateKey}_${scheduleTimeEpochSeconds}`;
    const openTaskPayload = {
      action: 'open_assessment_recheck',
      intendedBusinessDateKey,
      scheduledAt: scheduledAtIso,
    };

    let cloudTaskOutcome: 'created' | 'already_exists' = 'created';
    try {
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
    } catch (error: unknown) {
      const err = error as { code?: number };
      if (err?.code === 6) {
        // ALREADY_EXISTS: 同一タスクが既に存在する場合は成功扱い
        cloudTaskOutcome = 'already_exists';
      } else {
        logOpsError({
          message: 'temporaryUnlockAlreadyRunningDifferentDateTerminal: createTask failed',
          functionEntry: 'temporaryUnlockAlreadyRunningDifferentDateTerminal',
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
          `緊急一時解除後の再評価予約に失敗しました。${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    logOpsSuccess({
      message: 'temporaryUnlockAlreadyRunningDifferentDateTerminal 成功',
      functionEntry: 'temporaryUnlockAlreadyRunningDifferentDateTerminal',
      operation: 'cloudTasksCreateTask',
      context: {
        intendedBusinessDateKey,
        scheduledAt: scheduledAtIso,
        cloudTaskOutcome,
      },
    });

    return {
      success: true,
      intendedBusinessDateKey,
      recheckMinutes,
      scheduledAt: scheduledAtIso,
      message: `${recheckMinutes}分後に再評価を予約しました。`,
    };
  }
);
