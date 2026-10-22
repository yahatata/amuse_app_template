import type { SchedulerJobKey } from '../../../shared/config/schedulerConfigTypes';
import type { ScheduledJobTaskPayload } from './schedulerTaskPayload';

export interface SchedulerParentMetadata {
  schedulerParentJobKey: SchedulerJobKey;
  schedulerParentPlanningDate: string;
  schedulerParentPlannedRunAt: string;
  schedulerParentIdempotencyKey: string;
  schedulerParentSupervisorRunId: string;
}

export interface SchedulerTaskDispatchParentContext extends SchedulerParentMetadata {
  storeId: string;
}

export interface SchedulerChildExecutionMetadata extends SchedulerParentMetadata {
  schedulerChildUnitKey: string;
  schedulerChildFunctionEntry: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function buildSchedulerParentMetadata(
  payload: Pick<
    ScheduledJobTaskPayload,
    'jobKey' | 'planningDate' | 'plannedRunAt' | 'idempotencyKey' | 'supervisorRunId'
  >
): SchedulerParentMetadata {
  return {
    schedulerParentJobKey: payload.jobKey,
    schedulerParentPlanningDate: payload.planningDate,
    schedulerParentPlannedRunAt: payload.plannedRunAt,
    schedulerParentIdempotencyKey: payload.idempotencyKey,
    schedulerParentSupervisorRunId: payload.supervisorRunId,
  };
}

export function buildSchedulerTaskDispatchParentContext(
  payload: Pick<
    ScheduledJobTaskPayload,
    'jobKey' | 'planningDate' | 'plannedRunAt' | 'idempotencyKey' | 'supervisorRunId' | 'projectId'
  >
): SchedulerTaskDispatchParentContext {
  return {
    storeId: payload.projectId,
    ...buildSchedulerParentMetadata(payload),
  };
}

export function buildSchedulerChildExecutionMetadata(
  parent: SchedulerParentMetadata,
  childFunctionEntry: string,
  childUnitKey: string
): SchedulerChildExecutionMetadata {
  return {
    schedulerParentJobKey: parent.schedulerParentJobKey,
    schedulerParentPlanningDate: parent.schedulerParentPlanningDate,
    schedulerParentPlannedRunAt: parent.schedulerParentPlannedRunAt,
    schedulerParentIdempotencyKey: parent.schedulerParentIdempotencyKey,
    schedulerParentSupervisorRunId: parent.schedulerParentSupervisorRunId,
    schedulerChildUnitKey: childUnitKey,
    schedulerChildFunctionEntry: childFunctionEntry,
  };
}

export function extractSchedulerChildExecutionMetadata(
  value: unknown
): Partial<SchedulerChildExecutionMetadata> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const record = value as Record<string, unknown>;
  const context: Partial<SchedulerChildExecutionMetadata> = {};

  if (isNonEmptyString(record.schedulerParentJobKey)) {
    context.schedulerParentJobKey = record.schedulerParentJobKey as SchedulerJobKey;
  }
  if (isNonEmptyString(record.schedulerParentPlanningDate)) {
    context.schedulerParentPlanningDate = record.schedulerParentPlanningDate;
  }
  if (isNonEmptyString(record.schedulerParentPlannedRunAt)) {
    context.schedulerParentPlannedRunAt = record.schedulerParentPlannedRunAt;
  }
  if (isNonEmptyString(record.schedulerParentIdempotencyKey)) {
    context.schedulerParentIdempotencyKey = record.schedulerParentIdempotencyKey;
  }
  if (isNonEmptyString(record.schedulerParentSupervisorRunId)) {
    context.schedulerParentSupervisorRunId = record.schedulerParentSupervisorRunId;
  }
  if (isNonEmptyString(record.schedulerChildUnitKey)) {
    context.schedulerChildUnitKey = record.schedulerChildUnitKey;
  }
  if (isNonEmptyString(record.schedulerChildFunctionEntry)) {
    context.schedulerChildFunctionEntry = record.schedulerChildFunctionEntry;
  }

  return context;
}
