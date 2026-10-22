/**
 * storeMeta/schedulerConfig の型定義
 *
 * 参照: docs/環境変数きれい化/仕様書/scheduler_ToBe_詳細仕様.md
 */

export type SchedulerScheduleKind = 'daily' | 'weekly' | 'yearly';

export type SchedulerJobKey =
  | 'weeklyPlanner'
  | 'enqueueTournamentTasksByScheduler'
  | 'generateRecurringTournamentsByScheduler'
  | 'scheduledCleanup'
  | 'scheduleGenerateNextYearBusinessHours'
  | 'payrollNotificationScheduler';

export interface SchedulerJobConfig {
  enabled: boolean;
  scheduleKind: SchedulerScheduleKind;
  runAtJst: string;
  dayOfWeek?: number;
  month?: number;
  dayOfMonth?: number;
  timezone: 'Asia/Tokyo';
}

/**
 * v2 以降の schedulerConfig 本体。
 * `*_Enabled` 3項目は phaseB〜C の互換維持用（旧onSchedule参照向け）。
 */
export interface SchedulerConfig {
  schemaVersion: number;
  supervisorEnabled: boolean;
  planningHorizonDays: number;
  jobs: Record<SchedulerJobKey, SchedulerJobConfig>;
  updatedAt?: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
}
