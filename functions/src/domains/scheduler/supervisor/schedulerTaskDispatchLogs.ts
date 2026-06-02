import type { SchedulerJobKey } from '../../../shared/config/schedulerConfigTypes';
import { logger } from 'firebase-functions';
import { writeCentralSchedulerTaskDispatchLog } from '../../../shared/centralFirestore/writeToCentralFirestore';
import type { SchedulerTaskDispatchParentContext } from './schedulerCorrelation';

export interface SchedulerTaskDispatchLogEntry {
  storeId: string;
  parentJobKey: SchedulerJobKey;
  parentPlanningDate: string;
  parentPlannedRunAt: string;
  parentSchedulerIdempotencyKey: string;
  parentSupervisorRunId: string;
  childFunctionEntry: string;
  childUnitKey: string;
  childScheduledAt: string;
  childTargetSummary: Record<string, unknown>;
  eventType: 'enqueued' | 'skip' | 'error';
  reason?: string;
  context?: Record<string, unknown>;
}

export interface SchedulerTaskDispatchEvent {
  childFunctionEntry: string;
  childUnitKey: string;
  childScheduledAt: string;
  childTargetSummary: Record<string, unknown>;
  eventType: 'enqueued' | 'skip' | 'error';
  reason?: string;
  context?: Record<string, unknown>;
}

export async function writeSchedulerTaskDispatchLogBestEffort(
  entry: SchedulerTaskDispatchLogEntry
): Promise<void> {
  try {
    await writeCentralSchedulerTaskDispatchLog(entry.storeId, {
      parentJobKey: entry.parentJobKey,
      parentPlanningDate: entry.parentPlanningDate,
      parentPlannedRunAt: entry.parentPlannedRunAt,
      parentSchedulerIdempotencyKey: entry.parentSchedulerIdempotencyKey,
      parentSupervisorRunId: entry.parentSupervisorRunId,
      childFunctionEntry: entry.childFunctionEntry,
      childUnitKey: entry.childUnitKey,
      childScheduledAt: entry.childScheduledAt,
      childTargetSummary: entry.childTargetSummary,
      eventType: entry.eventType,
      ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
      ...(entry.context !== undefined ? { context: entry.context } : {}),
    });
  } catch (error) {
    logger.warn('writeSchedulerTaskDispatchLogBestEffort failed', {
      storeId: entry.storeId,
      parentJobKey: entry.parentJobKey,
      childFunctionEntry: entry.childFunctionEntry,
      childUnitKey: entry.childUnitKey,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function writeSchedulerTaskDispatchLogFromParentBestEffort(
  parent: SchedulerTaskDispatchParentContext,
  entry: SchedulerTaskDispatchEvent
): Promise<void> {
  await writeSchedulerTaskDispatchLogBestEffort({
    storeId: parent.storeId,
    parentJobKey: parent.schedulerParentJobKey,
    parentPlanningDate: parent.schedulerParentPlanningDate,
    parentPlannedRunAt: parent.schedulerParentPlannedRunAt,
    parentSchedulerIdempotencyKey: parent.schedulerParentIdempotencyKey,
    parentSupervisorRunId: parent.schedulerParentSupervisorRunId,
    childFunctionEntry: entry.childFunctionEntry,
    childUnitKey: entry.childUnitKey,
    childScheduledAt: entry.childScheduledAt,
    childTargetSummary: entry.childTargetSummary,
    eventType: entry.eventType,
    ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
    ...(entry.context !== undefined ? { context: entry.context } : {}),
  });
}
