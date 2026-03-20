/**
 * storeMeta/schedulerConfig の型定義
 *
 * スケジューラーの ON/OFF を制御する。
 * 実行時間は環境変数で変更する。
 */

export interface SchedulerConfig {
  monthlyPayrollTriggerEnabled?: boolean;
  scheduledCleanupEnabled?: boolean;
  scheduleGenerateNextYearBusinessHoursEnabled?: boolean;
}
