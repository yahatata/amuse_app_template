import type { SchedulerJobKey } from '../../../shared/config/schedulerConfigTypes';

export type SchedulerTargetScopeByJobKey = {
  weeklyPlanner: {
    targetWeekStartDate: string;
  };
  enqueueTournamentTasksByScheduler: {
    rangeStartAt: string;
    rangeEndAt: string;
  };
  generateRecurringTournamentsByScheduler: {
    evaluationDate: string;
    windowEndDate: string;
  };
  scheduledCleanup: {
    cutoffDate: string;
  };
  scheduleGenerateNextYearBusinessHours: {
    targetYear: number;
  };
  payrollNotificationScheduler: {
    targetDate: string;
  };
};

export type SchedulerTargetScope<K extends SchedulerJobKey = SchedulerJobKey> =
  SchedulerTargetScopeByJobKey[K];

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toJstDate(baseUtcDate: Date): Date {
  return new Date(baseUtcDate.getTime() + JST_OFFSET_MS);
}

function toDateKeyJst(baseUtcDate: Date): string {
  const jst = toJstDate(baseUtcDate);
  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jst.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(baseDate: Date, days: number): Date {
  return new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMonthsByJstDateKey(dateKey: string, months: number): string {
  const [yearStr, monthStr, dayStr] = dateKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCMonth(date.getUTCMonth() + months);
  const targetYear = date.getUTCFullYear();
  const targetMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
  const targetDay = String(date.getUTCDate()).padStart(2, '0');
  return `${targetYear}-${targetMonth}-${targetDay}`;
}

function buildWeeklyPlannerTargetScope(
  plannedRunAt: Date
): SchedulerTargetScopeByJobKey['weeklyPlanner'] {
  const jst = toJstDate(plannedRunAt);
  const dayOfWeek = jst.getUTCDay();
  const daysUntilNextSunday = ((7 - dayOfWeek) % 7) || 7;
  const nextSunday = addDays(jst, daysUntilNextSunday);

  const year = nextSunday.getUTCFullYear();
  const month = String(nextSunday.getUTCMonth() + 1).padStart(2, '0');
  const day = String(nextSunday.getUTCDate()).padStart(2, '0');

  return { targetWeekStartDate: `${year}-${month}-${day}` };
}

function buildEnqueueTournamentTasksTargetScope(
  plannedRunAt: Date
): SchedulerTargetScopeByJobKey['enqueueTournamentTasksByScheduler'] {
  const rangeStartAt = new Date(plannedRunAt.getTime() - 6 * 60 * 60 * 1000);
  const rangeEndAt = new Date(plannedRunAt.getTime() + 14 * 24 * 60 * 60 * 1000);
  return {
    rangeStartAt: rangeStartAt.toISOString(),
    rangeEndAt: rangeEndAt.toISOString(),
  };
}

function buildGenerateRecurringTargetScope(
  plannedRunAt: Date
): SchedulerTargetScopeByJobKey['generateRecurringTournamentsByScheduler'] {
  const evaluationDate = toDateKeyJst(plannedRunAt);
  const windowEndDate = addMonthsByJstDateKey(evaluationDate, 3);
  return {
    evaluationDate,
    windowEndDate,
  };
}

function buildScheduledCleanupTargetScope(
  plannedRunAt: Date
): SchedulerTargetScopeByJobKey['scheduledCleanup'] {
  const cutoff = addDays(plannedRunAt, -7);
  return { cutoffDate: toDateKeyJst(cutoff) };
}

function buildNextYearBusinessHoursTargetScope(
  plannedRunAt: Date
): SchedulerTargetScopeByJobKey['scheduleGenerateNextYearBusinessHours'] {
  const jst = toJstDate(plannedRunAt);
  return { targetYear: jst.getUTCFullYear() + 1 };
}

function buildPayrollNotificationTargetScope(
  plannedRunAt: Date
): SchedulerTargetScopeByJobKey['payrollNotificationScheduler'] {
  return { targetDate: toDateKeyJst(plannedRunAt) };
}

export function buildSchedulerTargetScope<K extends SchedulerJobKey>(
  jobKey: K,
  plannedRunAt: Date
): SchedulerTargetScope<K> {
  switch (jobKey) {
    case 'weeklyPlanner':
      return buildWeeklyPlannerTargetScope(plannedRunAt) as SchedulerTargetScope<K>;
    case 'enqueueTournamentTasksByScheduler':
      return buildEnqueueTournamentTasksTargetScope(
        plannedRunAt
      ) as SchedulerTargetScope<K>;
    case 'generateRecurringTournamentsByScheduler':
      return buildGenerateRecurringTargetScope(plannedRunAt) as SchedulerTargetScope<K>;
    case 'scheduledCleanup':
      return buildScheduledCleanupTargetScope(plannedRunAt) as SchedulerTargetScope<K>;
    case 'scheduleGenerateNextYearBusinessHours':
      return buildNextYearBusinessHoursTargetScope(
        plannedRunAt
      ) as SchedulerTargetScope<K>;
    case 'payrollNotificationScheduler':
      return buildPayrollNotificationTargetScope(plannedRunAt) as SchedulerTargetScope<K>;
    default: {
      const exhaustive: never = jobKey;
      throw new Error(`Unsupported jobKey: ${String(exhaustive)}`);
    }
  }
}

