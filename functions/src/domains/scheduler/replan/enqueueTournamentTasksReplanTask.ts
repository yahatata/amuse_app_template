import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import { logger } from 'firebase-functions';
import { getScheduledJobQueueName } from '../../../shared/config/cloudTasksConfig';
import { getRequiredProjectId } from '../../../shared/runtime/projectId';
import { getRegionalTaskQueue } from '../../../shared/tasks/getRegionalTaskQueue';
import {
  assertValidScheduledJobTaskPayload,
  createIdempotencyKey,
  SCHEDULER_TASK_PAYLOAD_SCHEMA_VERSION,
  type ScheduledJobTaskPayload,
} from '../supervisor/schedulerTaskPayload';
import { buildScheduledJobTaskId } from '../supervisor/schedulerTaskName';
import {
  ENQUEUE_TOURNAMENT_REPLAN_REQUEST_DOC_ID,
  ENQUEUE_TOURNAMENT_REPLAN_REQUESTS_COLLECTION,
} from './enqueueTournamentTasksReplanRequest';
import { logOpsError } from '../../../shared/logging/logOpsError';

const REPLAN_DELAY_SECONDS = 60;

function toJstDateKey(baseUtcDate: Date): string {
  const jstDate = new Date(baseUtcDate.getTime() + 9 * 60 * 60 * 1000);
  const y = jstDate.getUTCFullYear();
  const m = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jstDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildScheduleFingerprint(source: Record<string, unknown>): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(source))
    .digest('hex')
    .substring(0, 32);
}

function isTaskAlreadyExistsError(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown };
  const code = typeof err?.code === 'string' ? err.code : String(err?.code ?? '');
  const message = typeof err?.message === 'string' ? err.message : '';

  return (
    code === 'functions/task-already-exists' ||
    code === '6' ||
    message.includes('task-already-exists') ||
    message.includes('ALREADY_EXISTS')
  );
}

export async function enqueueTournamentTasksReplanTask(now: Date = new Date()): Promise<void> {
  const db = getFirestore();
  const projectId = getRequiredProjectId();
  const requestRef = db
    .collection(ENQUEUE_TOURNAMENT_REPLAN_REQUESTS_COLLECTION)
    .doc(ENQUEUE_TOURNAMENT_REPLAN_REQUEST_DOC_ID);
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists) return;

  const requestData = requestSnap.data() as Record<string, unknown>;
  if (requestData.isProcessing === true) {
    logger.info('enqueueTournamentTasksReplanTask: skip because request is processing');
    return;
  }

  const aggregateVersion =
    typeof requestData.aggregateVersion === 'number' &&
    Number.isInteger(requestData.aggregateVersion)
      ? requestData.aggregateVersion
      : 0;

  const plannedRunAt = new Date(now.getTime() + REPLAN_DELAY_SECONDS * 1000);
  const planningDate = toJstDateKey(now);
  const taskId = buildScheduledJobTaskId('enqueueTournamentTasksByScheduler', plannedRunAt);
  const idempotencyKey = createIdempotencyKey(
    'enqueueTournamentTasksByScheduler',
    plannedRunAt
  );
  const scheduleFingerprint = buildScheduleFingerprint({
    aggregateVersion,
    requestedBy: requestData.requestedBy ?? 'unknown',
    reason: requestData.reason ?? 'unknown',
  });

  const payload: ScheduledJobTaskPayload<'enqueueTournamentTasksByScheduler'> = {
    schemaVersion: SCHEDULER_TASK_PAYLOAD_SCHEMA_VERSION,
    jobKey: 'enqueueTournamentTasksByScheduler',
    plannedRunAt: plannedRunAt.toISOString(),
    planningDate,
    targetScope: {
      rangeStartAt:
        requestData.targetRangeStartAt &&
        typeof (requestData.targetRangeStartAt as { toDate?: () => Date }).toDate ===
          'function'
          ? (requestData.targetRangeStartAt as { toDate: () => Date })
              .toDate()
              .toISOString()
          : new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
      rangeEndAt:
        requestData.targetRangeEndAt &&
        typeof (requestData.targetRangeEndAt as { toDate?: () => Date }).toDate ===
          'function'
          ? (requestData.targetRangeEndAt as { toDate: () => Date })
              .toDate()
              .toISOString()
          : new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
    idempotencyKey,
    supervisorRunId: `replan_${now.toISOString()}`,
    scheduleFingerprint,
    projectId,
    enqueuedAt: now.toISOString(),
  };

  assertValidScheduledJobTaskPayload(payload);

  const queueName = getScheduledJobQueueName('enqueueTournamentTasksByScheduler');
  const queue = getRegionalTaskQueue(queueName);
  try {
    await queue.enqueue(payload, {
      id: taskId,
      scheduleDelaySeconds: REPLAN_DELAY_SECONDS,
      dispatchDeadlineSeconds: 300,
    });
  } catch (error) {
    if (isTaskAlreadyExistsError(error)) {
      logger.info('enqueueTournamentTasksReplanTask: duplicate task skipped', {
        taskId,
      });
      return;
    }
    logOpsError({
      message: 'enqueueTournamentTasksReplanTask: cloud task enqueue failed',
      functionEntry: 'enqueueTournamentTasksByScheduler',
      operation: 'cloudTasksCreateTask',
      cause: error,
      errorKey: 'TOURNAMENT_REPLAN_ENQUEUE_FAILED',
      sourceProductHint: 'cloud_tasks',
      context: {
        taskId,
        queueName,
        projectId,
      },
    });
    throw error;
  }

  await requestRef.set(
    {
      isProcessing: true,
      lastTriggeredAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
