/**
 * payrollRuns / staffResults の snapshot 型定義
 *
 * 計算実行時に外部設定・参照値を固定し、計算の再現性を保証する。
 * 実際の書き込みは Step 05 (executeMonthlyPayroll / processStaffPayroll) で実装。
 *
 * 参照: docs/config_migration/phase4_3/specs/02_CONFIG_SPEC.md セクション8
 */

import type { RoundingMethod } from '../../../shared/config/payrollConfigTypes';

/** payrollRuns ドキュメントの run レベル snapshot */
export interface PayrollRunSnapshot {
  paymentPeriodKey: string;
  paymentPeriodStart: string;
  paymentPeriodEnd: string;
  weekStartDaySnapshot: number;
  weeklyLegalLimitMinutesSnapshot: number;
  legalHolidayWeekdaySnapshot: number | null;
  nightPremiumRateSnapshot: number;
  overtimePremiumRateSnapshot: number;
  over60PremiumRateSnapshot: number;
  legalHolidayPremiumRateSnapshot: number;
  roundingMethodSnapshot: RoundingMethod;
  roundingPrecisionSnapshot: number;
  calcVersion: string;
}

/** staffResults の staff レベル snapshot */
export interface StaffResultSnapshot {
  baseHourlyWageSnapshot: number;
  staffNameSnapshot: string;
}
