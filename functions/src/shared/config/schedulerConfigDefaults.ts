/**
 * storeMeta/schedulerConfig のデフォルト値
 *
 * schedulerConfig 未設定時や不足項目補完時の既定値。
 * `defaults.ts` とは分離し、scheduler 専用の初期値をここへ集約する。
 */

import type { SchedulerJobConfig, SchedulerJobKey } from './schedulerConfigTypes';

export const DEFAULT_SCHEDULER_SCHEMA_VERSION = 1;
export const DEFAULT_SCHEDULER_SUPERVISOR_ENABLED = true;
export const DEFAULT_SCHEDULER_PLANNING_HORIZON_DAYS = 7;
export const DEFAULT_SCHEDULER_TIMEZONE: SchedulerJobConfig['timezone'] = 'Asia/Tokyo';

export const DEFAULT_SCHEDULER_JOB_CONFIG_BY_KEY: Record<
  SchedulerJobKey,
  SchedulerJobConfig
> = {
  weeklyPlanner: {
    enabled: true,
    scheduleKind: 'weekly',
    runAtJst: '04:40',
    dayOfWeek: 4,
    timezone: DEFAULT_SCHEDULER_TIMEZONE,
  },
  enqueueTournamentTasksByScheduler: {
    enabled: true,
    scheduleKind: 'daily',
    runAtJst: '05:00',
    timezone: DEFAULT_SCHEDULER_TIMEZONE,
  },
  generateRecurringTournamentsByScheduler: {
    enabled: true,
    scheduleKind: 'weekly',
    runAtJst: '04:50',
    dayOfWeek: 4,
    timezone: DEFAULT_SCHEDULER_TIMEZONE,
  },
  scheduledCleanup: {
    enabled: true,
    scheduleKind: 'daily',
    runAtJst: '05:00',
    timezone: DEFAULT_SCHEDULER_TIMEZONE,
  },
  scheduleGenerateNextYearBusinessHours: {
    enabled: true,
    scheduleKind: 'yearly',
    runAtJst: '05:10',
    month: 1,
    dayOfMonth: 29,
    timezone: DEFAULT_SCHEDULER_TIMEZONE,
  },
  payrollNotificationScheduler: {
    enabled: true,
    scheduleKind: 'daily',
    runAtJst: '05:00',
    timezone: DEFAULT_SCHEDULER_TIMEZONE,
  },
};

export function cloneDefaultSchedulerJobConfigByKey(): Record<
  SchedulerJobKey,
  SchedulerJobConfig
> {
  return {
    weeklyPlanner: { ...DEFAULT_SCHEDULER_JOB_CONFIG_BY_KEY.weeklyPlanner },
    enqueueTournamentTasksByScheduler: {
      ...DEFAULT_SCHEDULER_JOB_CONFIG_BY_KEY.enqueueTournamentTasksByScheduler,
    },
    generateRecurringTournamentsByScheduler: {
      ...DEFAULT_SCHEDULER_JOB_CONFIG_BY_KEY.generateRecurringTournamentsByScheduler,
    },
    scheduledCleanup: { ...DEFAULT_SCHEDULER_JOB_CONFIG_BY_KEY.scheduledCleanup },
    scheduleGenerateNextYearBusinessHours: {
      ...DEFAULT_SCHEDULER_JOB_CONFIG_BY_KEY.scheduleGenerateNextYearBusinessHours,
    },
    payrollNotificationScheduler: {
      ...DEFAULT_SCHEDULER_JOB_CONFIG_BY_KEY.payrollNotificationScheduler,
    },
  };
}
