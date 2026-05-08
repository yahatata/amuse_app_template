import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import type { SchedulerJobKey } from '../../../shared/config/schedulerConfigTypes';

const DISPATCH_LOG_COLLECTION = 'schedulerDispatchLogs';
const EXECUTION_LOG_COLLECTION = 'schedulerExecutionLogsByCloudTask';

function omitUndefinedFields(
  value: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  );
}

export interface SchedulerDispatchLog {
  eventType: 'enqueued' | 'skip' | 'error';
  isSuccess: boolean;
  reason?: string;
  jobKey: SchedulerJobKey;
  functionName: string;
  queueName: string;
  plannedRunAt: string;
  planningDate: string;
  projectId: string;
  idempotencyKey: string;
  supervisorRunId: string;
  scheduleFingerprint: string;
  decisionSnapshot?: Record<string, boolean | number | string>;
}

export interface SchedulerExecutionLogByCloudTask {
  eventType: 'started' | 'completed' | 'skip' | 'error';
  isSuccess: boolean;
  reason?: string;
  jobKey: SchedulerJobKey;
  functionName: string;
  projectId: string;
  idempotencyKey: string;
  supervisorRunId?: string;
  decisionSnapshot?: Record<string, boolean | number | string>;
}

export async function writeSchedulerDispatchLogBestEffort(
  entry: SchedulerDispatchLog
): Promise<void> {
  try {
    const db = getFirestore();
    const safeEntry = omitUndefinedFields(entry as unknown as Record<string, unknown>);
    await db.collection(DISPATCH_LOG_COLLECTION).add({
      ...safeEntry,
      occurredAt: new Date().toISOString(),
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.error('schedulerDispatchLogs write failed', {
      failureType: 'internal',
      reason: 'dispatch_log_write_failed',
      jobKey: entry.jobKey,
      functionName: entry.functionName,
      projectId: entry.projectId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function writeSchedulerExecutionLogByCloudTaskBestEffort(
  entry: SchedulerExecutionLogByCloudTask
): Promise<void> {
  try {
    const db = getFirestore();
    const safeEntry = omitUndefinedFields(entry as unknown as Record<string, unknown>);
    await db.collection(EXECUTION_LOG_COLLECTION).add({
      ...safeEntry,
      occurredAt: new Date().toISOString(),
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.error('schedulerExecutionLogsByCloudTask write failed', {
      failureType: 'internal',
      reason: 'execution_log_write_failed',
      jobKey: entry.jobKey,
      functionName: entry.functionName,
      projectId: entry.projectId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}
