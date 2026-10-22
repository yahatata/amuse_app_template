/**
 * 分散実行で使用するヘルパー関数群 — Firestore 非依存
 *
 * テスタブルなロジックを抽出。
 * 参照: 04_CALLABLE_API_SPEC §3-5, DISTRIBUTED_EXECUTION_DESIGN.md
 */

import type { PayrollRunSnapshot } from '../types/payrollRunTypes';
import type { CalcConfigInput } from '../types/payrollCalcTypes';
import type { PayrollConfig } from '../../../shared/config/payrollConfigTypes';

/** attendance ドキュメントの最小情報 */
export interface AttendanceForRun {
  id: string;
  staffId: string;
  paymentPeriodKey: string;
  clockOut: unknown;
  isDeleted: boolean;
}

/** 通常/キャリーオーバー分類結果 */
export interface ClassifiedAttendances {
  normal: AttendanceForRun[];
  carryOver: AttendanceForRun[];
}

/**
 * attendance を通常/キャリーオーバーに分類する。
 * paymentPeriodKey == currentPeriodKey → 通常、それ以外 → キャリーオーバー
 */
export function classifyAttendancesForRun(
  attendances: AttendanceForRun[],
  currentPeriodKey: string
): ClassifiedAttendances {
  const normal: AttendanceForRun[] = [];
  const carryOver: AttendanceForRun[] = [];

  for (const att of attendances) {
    if (att.paymentPeriodKey === currentPeriodKey) {
      normal.push(att);
    } else {
      carryOver.push(att);
    }
  }

  return { normal, carryOver };
}

/**
 * attendance を staffId ごとにグルーピングする。
 * 各 staff に通常 attendanceIds と carryOver attendanceIds を分離して格納。
 */
export interface StaffAttendanceGroup {
  staffId: string;
  assignedAttendanceIds: string[];
  assignedCarryOverAttendanceIds: string[];
}

export function groupByStaffId(
  classified: ClassifiedAttendances
): StaffAttendanceGroup[] {
  const map = new Map<string, StaffAttendanceGroup>();

  for (const att of classified.normal) {
    let group = map.get(att.staffId);
    if (!group) {
      group = { staffId: att.staffId, assignedAttendanceIds: [], assignedCarryOverAttendanceIds: [] };
      map.set(att.staffId, group);
    }
    group.assignedAttendanceIds.push(att.id);
  }

  for (const att of classified.carryOver) {
    let group = map.get(att.staffId);
    if (!group) {
      group = { staffId: att.staffId, assignedAttendanceIds: [], assignedCarryOverAttendanceIds: [] };
      map.set(att.staffId, group);
    }
    group.assignedCarryOverAttendanceIds.push(att.id);
  }

  return [...map.values()];
}

/**
 * payrollConfig + storeConfig から PayrollRunSnapshot を構築する。
 */
export function buildRunSnapshot(
  payrollConfig: PayrollConfig,
  periodKey: string,
  periodStart: string,
  periodEnd: string
): PayrollRunSnapshot {
  return {
    paymentPeriodKey: periodKey,
    paymentPeriodStart: periodStart,
    paymentPeriodEnd: periodEnd,
    weekStartDaySnapshot: payrollConfig.weekStartDay,
    weeklyLegalLimitMinutesSnapshot: payrollConfig.weeklyLegalLimitMinutes,
    legalHolidayWeekdaySnapshot: payrollConfig.legalHolidayWeekday,
    nightPremiumRateSnapshot: payrollConfig.nightPremiumRate,
    overtimePremiumRateSnapshot: payrollConfig.overtimePremiumRate,
    over60PremiumRateSnapshot: payrollConfig.over60PremiumRate,
    legalHolidayPremiumRateSnapshot: payrollConfig.legalHolidayPremiumRate,
    roundingMethodSnapshot: payrollConfig.roundingMethod,
    roundingPrecisionSnapshot: payrollConfig.roundingPrecision,
    calcVersion: payrollConfig.calcVersion,
  };
}

/**
 * PayrollRunSnapshot + 時給 → CalcConfigInput を構築する。
 */
export function buildCalcConfigFromSnapshot(
  snapshot: PayrollRunSnapshot,
  baseHourlyWage: number
): CalcConfigInput {
  return {
    currentPeriodKey: snapshot.paymentPeriodKey,
    weeklyLegalLimitMinutes: snapshot.weeklyLegalLimitMinutesSnapshot,
    legalHolidayWeekday: snapshot.legalHolidayWeekdaySnapshot,
    nightPremiumRate: snapshot.nightPremiumRateSnapshot,
    overtimePremiumRate: snapshot.overtimePremiumRateSnapshot,
    over60PremiumRate: snapshot.over60PremiumRateSnapshot,
    legalHolidayPremiumRate: snapshot.legalHolidayPremiumRateSnapshot,
    roundingMethod: snapshot.roundingMethodSnapshot,
    roundingPrecision: snapshot.roundingPrecisionSnapshot,
    baseHourlyWage,
  };
}

/**
 * staffResults からサマリを集計する。
 */
export interface StaffResultForAggregation {
  taskStatus: string;
  status?: string;
  basePay?: number;
  lateNightPremiumPay?: number;
  overtimePremiumPay?: number;
  over60PremiumPay?: number;
  legalHolidayPremiumPay?: number;
  grossPay?: number;
}

export interface RunSummary {
  totalBasePay: number;
  totalPremiumPay: number;
  totalGrossPay: number;
  warningCount: number;
  completedStaffCount: number;
  failedStaffCount: number;
}

export function aggregateStaffResults(
  staffResults: StaffResultForAggregation[]
): RunSummary {
  let totalBasePay = 0;
  let totalPremiumPay = 0;
  let totalGrossPay = 0;
  let warningCount = 0;
  let completedStaffCount = 0;
  let failedStaffCount = 0;

  for (const sr of staffResults) {
    if (sr.taskStatus === 'completed') {
      completedStaffCount++;
      totalBasePay += sr.basePay ?? 0;
      totalPremiumPay +=
        (sr.lateNightPremiumPay ?? 0) +
        (sr.overtimePremiumPay ?? 0) +
        (sr.over60PremiumPay ?? 0) +
        (sr.legalHolidayPremiumPay ?? 0);
      totalGrossPay += sr.grossPay ?? 0;
      if (sr.status === 'warning') {
        warningCount++;
      }
    } else if (sr.taskStatus === 'failed') {
      failedStaffCount++;
    }
  }

  return { totalBasePay, totalPremiumPay, totalGrossPay, warningCount, completedStaffCount, failedStaffCount };
}

/**
 * run の完了判定。
 */
export function isRunComplete(
  completedCount: number,
  failedCount: number,
  targetCount: number
): boolean {
  return completedCount + failedCount >= targetCount;
}
