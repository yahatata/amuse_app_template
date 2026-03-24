/**
 * 給与計算で使用する定数・型定義
 *
 * 参照: docs/config_migration/phase4_3/specs/01_CALC_SPEC.md セクション1
 */

import type { RoundingMethod } from '../../../shared/config/payrollConfigTypes';

/** 1日の法定労働時間上限（分）= 8時間 */
export const DAILY_LEGAL_LIMIT_MINUTES = 480;

/** 月60時間超の閾値（分）= 60時間 */
export const MONTHLY_OVER60_THRESHOLD_MINUTES = 3600;

/** attendance の給与反映ステータス */
export type PayrollStatus = 'unreflected' | 'reflected' | 'corrected_after_reflection';

/** getPayrollCandidates の属性 */
export type CandidateReasonType = 'in_period' | 'carry_over' | 'other';

/** staffResults の支払いステータス */
export type PaymentStatus = 'unpaid' | 'paid' | 'hold';

/** payrollRuns のステータス */
export type PayrollRunStatus =
  | 'preparing'
  | 'processing'
  | 'aggregating'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'cancelled';

/** monthlyPayroll のステータス */
export type MonthlyPayrollStatus = 'draft' | 'confirmed' | 'hold' | 'paid';

// ────────────────────────────────────────────
// Step 04: コア計算エンジン用の型定義
// ────────────────────────────────────────────

/** 計算エンジンへの attendance 入力 */
export interface CalcAttendanceInput {
  attendanceId: string;
  staffId: string;
  date: string;
  weekday: number;
  weekStartDate: string;
  paymentPeriodKey: string;
  payrollStatus: PayrollStatus;
  actualWorkMinutes: number;
  nightWorkMinutes: number;
  clockIn: string;
  createdAt: string;
}

/** 計算エンジンへの config snapshot 入力 */
export interface CalcConfigInput {
  currentPeriodKey: string;
  weeklyLegalLimitMinutes: number;
  legalHolidayWeekday: number | null;
  nightPremiumRate: number;
  overtimePremiumRate: number;
  over60PremiumRate: number;
  legalHolidayPremiumRate: number;
  roundingMethod: RoundingMethod;
  roundingPrecision: number;
  baseHourlyWage: number;
}

/** attendance 明細の計算結果 */
export interface AttendanceItemResult {
  attendanceId: string;
  attendanceRefPath: string;
  workDate: string;
  weekday: number;
  weekStartDate: string;
  paymentPeriodKey: string;
  isCarryOver: boolean;
  originalPaymentPeriodKey: string | null;
  includedInCurrentRun: boolean;
  actualWorkMinutes: number;
  nightWorkMinutes: number;
  isLegalHoliday: boolean;
  isNonLegalHoliday: boolean;
  dailyOverMinutes: number;
  dailyRegularMinutes: number;
  weeklyRegularBefore: number;
  weeklyRegularAfter: number;
  weeklyOnlyOverMinutes: number;
  legalOvertimeMinutes: number;
}

/** staff 単位の集計結果 */
export interface StaffCalcResult {
  staffId: string;
  totalActualWorkMinutes: number;
  totalNightWorkMinutes: number;
  totalLegalOvertimeMinutes: number;
  over60OvertimeMinutes: number;
  totalLegalHolidayWorkMinutes: number;
  totalNonLegalHolidayWorkMinutes: number;
  basePay: number;
  lateNightPremiumPay: number;
  overtimePremiumPay: number;
  over60PremiumPay: number;
  legalHolidayPremiumPay: number;
  grossPay: number;
  attendanceItems: AttendanceItemResult[];
  carryOverGrossPay: number;
  carryOverAttendanceCount: number;
}
