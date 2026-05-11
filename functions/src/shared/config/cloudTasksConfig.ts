export const TOURNAMENT_TASKS_REGION = 'asia-northeast1';
export const OPENCLOSE_TASKS_REGION = 'asia-northeast1';
export const SCHEDULED_JOB_TASKS_REGION = 'asia-northeast1';

export const TOURNAMENT_TASKS_QUEUE = 'tournament-queue';
export const OPENCLOSE_TASKS_QUEUE = 'business-date-assessment-queue';

export const SCHEDULED_JOB_QUEUE_BY_KEY = {
  weeklyPlanner: 'scheduled-job-weekly-planner',
  enqueueTournamentTasksByScheduler:
    'scheduled-job-enqueue-tournament-tasks-by-scheduler',
  generateRecurringTournamentsByScheduler:
    'scheduled-job-generate-recurring-tournaments-by-scheduler',
  scheduledCleanup: 'scheduled-job-scheduled-cleanup',
  scheduleGenerateNextYearBusinessHours:
    'scheduled-job-schedule-generate-next-year-business-hours',
  payrollNotificationScheduler: 'scheduled-job-payroll-notification-scheduler',
} as const;

export type ScheduledJobKey = keyof typeof SCHEDULED_JOB_QUEUE_BY_KEY;

export const TOURNAMENT_INVOKER_SA_PREFIX = 'tasks-invoker';
export const OPENCLOSE_INVOKER_SA_PREFIX = 'tasks-invoker';

export function getScheduledJobQueueName(jobKey: ScheduledJobKey): string {
  const queue = SCHEDULED_JOB_QUEUE_BY_KEY[jobKey];
  if (!queue) {
    throw new Error(`Unsupported scheduled job key: ${String(jobKey)}`);
  }
  return queue;
}

export function buildInvokerSaEmail(
  prefix: string,
  projectId: string
): string {
  return `${prefix}@${projectId}.iam.gserviceaccount.com`;
}
