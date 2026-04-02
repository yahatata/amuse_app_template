import type { SchedulerJobKey } from '../../../shared/config/schedulerConfigTypes';

function formatPlannedRunAtForTaskId(plannedRunAt: Date): string {
  const iso = plannedRunAt.toISOString();
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildScheduledJobTaskId(
  jobKey: SchedulerJobKey,
  plannedRunAt: Date
): string {
  return `${jobKey}_${formatPlannedRunAtForTaskId(plannedRunAt)}`;
}

