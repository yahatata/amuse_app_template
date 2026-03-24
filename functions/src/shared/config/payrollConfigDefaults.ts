/**
 * storeMeta/payrollConfig のデフォルト値
 *
 * payrollConfig 未設定時のフォールバック値。
 * 新規フィールド追加時は payrollConfigLoader の buildPayrollConfigFromDefaults() にもマッピングを追加すること。
 *
 * 参照: docs/config_migration/phase4_3/specs/02_CONFIG_SPEC.md
 */

// phase4_2 から継承
export const DEFAULT_PAYROLL_CONFIG_PAYMENT_DATE: string | null = null;
export const DEFAULT_PAYROLL_CONFIG_BULK_PAYMENT_REGISTRATION_ENABLED = false;
export const DEFAULT_PAYROLL_CONFIG_EXPECTED_RANGE = null;
export const DEFAULT_PAYROLL_CONFIG_MAX_CANDIDATES_COUNT = 1000;

// 計算制御
/** 法定週の開始曜日（0=日曜〜6=土曜）*/
export const DEFAULT_PAYROLL_CONFIG_WEEK_START_DAY = 0;
/** 週の法定労働時間上限（分）。2400=40h、特例措置 2640=44h */
export const DEFAULT_PAYROLL_CONFIG_WEEKLY_LEGAL_LIMIT_MINUTES = 2400;
/** 法定休日の曜日。null=法定休日判定なし */
export const DEFAULT_PAYROLL_CONFIG_LEGAL_HOLIDAY_WEEKDAY: number | null = null;
export const DEFAULT_PAYROLL_CONFIG_CALC_VERSION = '1.0';

// 割増率
export const DEFAULT_PAYROLL_CONFIG_NIGHT_PREMIUM_RATE = 0.25;
export const DEFAULT_PAYROLL_CONFIG_OVERTIME_PREMIUM_RATE = 0.25;
export const DEFAULT_PAYROLL_CONFIG_OVER_60_PREMIUM_RATE = 0.25;
export const DEFAULT_PAYROLL_CONFIG_LEGAL_HOLIDAY_PREMIUM_RATE = 0.35;

// 端数処理
export const DEFAULT_PAYROLL_CONFIG_ROUNDING_METHOD = 'floor';
export const DEFAULT_PAYROLL_CONFIG_ROUNDING_PRECISION = 1;

// 通知・スケジューラー
/** スケジューラー通知の配信時刻（JST、0〜23） */
export const DEFAULT_PAYROLL_CONFIG_SCHEDULER_NOTIFICATION_HOUR = 10;
/** リマインド開始日（periodEnd から何日後） */
export const DEFAULT_PAYROLL_CONFIG_REMINDER_START_DAYS_AFTER_PERIOD_END = 3;
