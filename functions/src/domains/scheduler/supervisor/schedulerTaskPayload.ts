import type { SchedulerJobKey } from '../../../shared/config/schedulerConfigTypes';
import type { SchedulerTargetScope } from './schedulerTargetScope';

export const SCHEDULER_TASK_PAYLOAD_SCHEMA_VERSION = 1;

const VALID_SCHEDULER_JOB_KEYS: SchedulerJobKey[] = [
  'weeklyPlanner',
  'enqueueTournamentTasksByScheduler',
  'generateRecurringTournamentsByScheduler',
  'scheduledCleanup',
  'scheduleGenerateNextYearBusinessHours',
  'payrollNotificationScheduler',
];

export interface ScheduledJobTaskPayload<K extends SchedulerJobKey = SchedulerJobKey> {
  schemaVersion: number;
  jobKey: K;
  plannedRunAt: string;
  planningDate: string;
  targetScope: SchedulerTargetScope<K>;
  idempotencyKey: string;
  supervisorRunId: string;
  scheduleFingerprint: string;
  projectId: string;
  enqueuedAt: string;
}

export function createIdempotencyKey(jobKey: SchedulerJobKey, plannedRunAt: Date): string {
  return `${jobKey}:${plannedRunAt.toISOString()}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDateTimeString(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isSchedulerJobKey(value: unknown): value is SchedulerJobKey {
  return (
    typeof value === 'string' &&
    VALID_SCHEDULER_JOB_KEYS.includes(value as SchedulerJobKey)
  );
}

export function assertValidScheduledJobTaskPayload(
  payload: ScheduledJobTaskPayload
): void {
  if (
    typeof payload.schemaVersion !== 'number' ||
    !Number.isInteger(payload.schemaVersion) ||
    payload.schemaVersion < 1
  ) {
    throw new Error('Invalid payload.schemaVersion');
  }

  if (!isSchedulerJobKey(payload.jobKey)) {
    throw new Error('Invalid payload.jobKey');
  }

  if (!isIsoDateTimeString(payload.plannedRunAt)) {
    throw new Error('Invalid payload.plannedRunAt');
  }

  if (!isDateKey(payload.planningDate)) {
    throw new Error('Invalid payload.planningDate');
  }

  if (!payload.targetScope || typeof payload.targetScope !== 'object') {
    throw new Error('Invalid payload.targetScope');
  }

  if (!isNonEmptyString(payload.idempotencyKey)) {
    throw new Error('Invalid payload.idempotencyKey');
  }
  if (!isNonEmptyString(payload.supervisorRunId)) {
    throw new Error('Invalid payload.supervisorRunId');
  }
  if (!isNonEmptyString(payload.scheduleFingerprint)) {
    throw new Error('Invalid payload.scheduleFingerprint');
  }
  if (!isNonEmptyString(payload.projectId)) {
    throw new Error('Invalid payload.projectId');
  }
  if (!isIsoDateTimeString(payload.enqueuedAt)) {
    throw new Error('Invalid payload.enqueuedAt');
  }
}

export function assertScheduledJobTaskPayloadMatchesExpectedJobKey(
  payload: ScheduledJobTaskPayload,
  expectedJobKey: SchedulerJobKey
): void {
  if (payload.jobKey !== expectedJobKey) {
    throw new Error(
      `Task payload jobKey mismatch: expected=${expectedJobKey}, actual=${payload.jobKey}`
    );
  }
}
