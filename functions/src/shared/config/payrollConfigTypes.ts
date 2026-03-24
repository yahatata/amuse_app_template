/**
 * storeMeta/payrollConfig の型定義
 *
 * 参照: docs/config_migration/phase4_3/specs/02_CONFIG_SPEC.md
 */

export interface PayrollConfig {
  // phase4_2 から継承
  paymentDate: string | null;
  bulkPaymentRegistrationEnabled: boolean;
  expectedRange: ExpectedRange | null;
  maxCandidatesCount: number;

  // 計算制御
  weekStartDay: number;
  weeklyLegalLimitMinutes: number;
  legalHolidayWeekday: number | null;
  calcVersion: string;

  // 割増率（basePay 1.0 に加算する割増分）
  nightPremiumRate: number;
  overtimePremiumRate: number;
  over60PremiumRate: number;
  legalHolidayPremiumRate: number;

  // 端数処理
  roundingMethod: RoundingMethod;
  roundingPrecision: number;

  // 通知・スケジューラー（snapshot 対象外）
  schedulerNotificationHour: number;
  reminderStartDaysAfterPeriodEnd: number;
}

export interface ExpectedRange {
  attendanceCountMin?: number;
  attendanceCountMax?: number;
  estimatedAmountMin?: number;
  estimatedAmountMax?: number;
  totalHoursMin?: number;
  totalHoursMax?: number;
}

export type RoundingMethod = 'ceil' | 'floor' | 'round';
