import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { SchedulerJobKey } from '../../../shared/config/schedulerConfigTypes';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import type { SchedulerTargetScope } from './schedulerTargetScope';
import {
  writeCentralSchedulerLog,
} from '../../../shared/centralFirestore/writeToCentralFirestore';

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
  phase: 'dispatch';
  eventType: 'enqueued' | 'skip' | 'error';
  rawEventType: 'enqueued' | 'skip' | 'error';
  isSuccess: boolean;
  reason?: string;
  jobKey: SchedulerJobKey;
  functionName: string;
  queueName: string;
  plannedRunAt: string;
  planningDate: string;
  targetScope: SchedulerTargetScope;
  projectId: string;
  idempotencyKey: string;
  supervisorRunId: string;
  scheduleFingerprint: string;
  decisionSnapshot?: Record<string, boolean | number | string>;
}

export interface SchedulerExecutionLogByCloudTask {
  phase: 'execution';
  eventType: 'started' | 'completed' | 'skip' | 'error';
  rawEventType: 'started' | 'completed' | 'skip' | 'error';
  isSuccess: boolean;
  reason?: string;
  jobKey: SchedulerJobKey;
  functionName: string;
  planningDate: string;
  plannedRunAt: string;
  targetScope: SchedulerTargetScope;
  projectId: string;
  idempotencyKey: string;
  supervisorRunId?: string;
  decisionSnapshot?: Record<string, boolean | number | string>;
}

function toLegacySchedulerEventType(
  phase: SchedulerDispatchLog['phase'] | SchedulerExecutionLogByCloudTask['phase'],
  rawEventType:
    | SchedulerDispatchLog['rawEventType']
    | SchedulerExecutionLogByCloudTask['rawEventType']
): 'start' | 'skip' | 'error' | 'success' {
  if (phase === 'dispatch' && rawEventType === 'enqueued') {
    return 'start';
  }
  if (phase === 'execution' && rawEventType === 'started') {
    return 'start';
  }
  if (phase === 'execution' && rawEventType === 'completed') {
    return 'success';
  }
  if (rawEventType === 'skip') {
    return 'skip';
  }
  return 'error';
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
    logOpsSuccess({
      message: 'writeSchedulerDispatchLogBestEffort 成功',
      functionEntry: 'writeSchedulerDispatchLogBestEffort',
      operation: 'dispatchLogWrite',
      context: {
        jobKey: entry.jobKey,
        functionName: entry.functionName,
        projectId: entry.projectId,
        idempotencyKey: entry.idempotencyKey,
      },
    });

    void writeCentralSchedulerLog(entry.projectId, {
      jobKey: entry.jobKey,
      planningDate: entry.planningDate,
      plannedRunAt: entry.plannedRunAt,
      targetScope: entry.targetScope,
      phase: entry.phase,
      rawEventType: entry.rawEventType,
      eventType: toLegacySchedulerEventType(entry.phase, entry.rawEventType),
      idempotencyKey: entry.idempotencyKey,
      supervisorRunId: entry.supervisorRunId,
      functionEntry: entry.functionName,
      ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
      ...(entry.decisionSnapshot !== undefined ? { decisionSnapshot: entry.decisionSnapshot } : {}),
    });
  } catch (error) {
    logOpsError({
      message: 'schedulerDispatchLogs write failed',
      functionEntry: 'writeSchedulerDispatchLogBestEffort',
      operation: 'dispatchLogWrite',
      cause: error,
      context: {
        reason: 'dispatch_log_write_failed',
        jobKey: entry.jobKey,
        functionName: entry.functionName,
        projectId: entry.projectId,
      },
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
    logOpsSuccess({
      message: 'writeSchedulerExecutionLogByCloudTaskBestEffort 成功',
      functionEntry: 'writeSchedulerExecutionLogByCloudTaskBestEffort',
      operation: 'executionLogWrite',
      context: {
        jobKey: entry.jobKey,
        functionName: entry.functionName,
        projectId: entry.projectId,
        idempotencyKey: entry.idempotencyKey,
        supervisorRunId: entry.supervisorRunId,
      },
    });

    void writeCentralSchedulerLog(entry.projectId, {
      jobKey: entry.jobKey,
      planningDate: entry.planningDate,
      plannedRunAt: entry.plannedRunAt,
      targetScope: entry.targetScope,
      phase: entry.phase,
      rawEventType: entry.rawEventType,
      eventType: toLegacySchedulerEventType(entry.phase, entry.rawEventType),
      idempotencyKey: entry.idempotencyKey,
      functionEntry: entry.functionName,
      ...(entry.supervisorRunId !== undefined ? { supervisorRunId: entry.supervisorRunId } : {}),
      ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
      ...(entry.decisionSnapshot !== undefined ? { decisionSnapshot: entry.decisionSnapshot } : {}),
    });
  } catch (error) {
    logOpsError({
      message: 'schedulerExecutionLogsByCloudTask write failed',
      functionEntry: 'writeSchedulerExecutionLogByCloudTaskBestEffort',
      operation: 'executionLogWrite',
      cause: error,
      context: {
        reason: 'execution_log_write_failed',
        jobKey: entry.jobKey,
        functionName: entry.functionName,
        projectId: entry.projectId,
        idempotencyKey: entry.idempotencyKey,
        supervisorRunId: entry.supervisorRunId,
      },
    });
  }
}
