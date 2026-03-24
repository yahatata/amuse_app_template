/**
 * コア計算エンジン — Firestore 非依存の純粋関数モジュール
 *
 * 入力: CalcAttendanceInput[] + CalcConfigInput
 * 出力: StaffCalcResult（集計値 + 金額 + attendanceItems 明細）
 *
 * 参照: 01_CALC_SPEC セクション 2〜14
 */

import {
  DAILY_LEGAL_LIMIT_MINUTES,
  MONTHLY_OVER60_THRESHOLD_MINUTES,
} from '../types/payrollCalcTypes';
import type {
  CalcAttendanceInput,
  CalcConfigInput,
  AttendanceItemResult,
  StaffCalcResult,
} from '../types/payrollCalcTypes';
import { payrollRound } from './payrollRoundingUtils';

// ─── 01_CALC_SPEC §3: 法定休日判定 ───

export function isLegalHoliday(
  weekday: number,
  legalHolidayWeekday: number | null
): boolean {
  if (legalHolidayWeekday === null) return false;
  return weekday === legalHolidayWeekday;
}

// ─── 計上対象判定 ───

function isTarget(
  attendance: CalcAttendanceInput,
  currentPeriodKey: string
): boolean {
  return (
    attendance.paymentPeriodKey === currentPeriodKey &&
    (attendance.payrollStatus === 'unreflected' ||
      attendance.payrollStatus === 'corrected_after_reflection')
  );
}

// ─── 安定ソート（clockIn ASC → createdAt ASC → docId ASC）───

function stableSort(attendances: CalcAttendanceInput[]): CalcAttendanceInput[] {
  return [...attendances].sort((a, b) => {
    if (a.clockIn !== b.clockIn) return a.clockIn < b.clockIn ? -1 : 1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.attendanceId < b.attendanceId ? -1 : a.attendanceId > b.attendanceId ? 1 : 0;
  });
}

// ─── 01_CALC_SPEC §4,5: 1件の attendance を処理 ───

export interface DayResult {
  item: AttendanceItemResult;
  weeklyRegularAfter: number;
}

export function processAttendanceDay(
  attendance: CalcAttendanceInput,
  config: CalcConfigInput,
  weeklyRegularRunning: number,
  isTargetAttendance: boolean,
  isCarryOver: boolean,
  originalPaymentPeriodKey: string | null
): DayResult {
  const legalHoliday = isLegalHoliday(attendance.weekday, config.legalHolidayWeekday);

  let dailyOverMinutes = 0;
  let dailyRegularMinutes = 0;
  let weeklyOnlyOverMinutes = 0;
  let legalOvertimeMinutes = 0;
  let newWeeklyRegularRunning = weeklyRegularRunning;

  if (legalHoliday) {
    // §4: 法定休日 → 残業計算から完全除外、weeklyRegularRunning に加算しない
    dailyOverMinutes = 0;
    dailyRegularMinutes = 0;
    weeklyOnlyOverMinutes = 0;
    legalOvertimeMinutes = 0;
  } else {
    // §5: 通常の attendance
    dailyOverMinutes = Math.max(attendance.actualWorkMinutes - DAILY_LEGAL_LIMIT_MINUTES, 0);
    dailyRegularMinutes = attendance.actualWorkMinutes - dailyOverMinutes;

    const weeklyRegularBefore = weeklyRegularRunning;
    const weeklyRegularAfter = weeklyRegularRunning + dailyRegularMinutes;

    weeklyOnlyOverMinutes =
      Math.max(weeklyRegularAfter - config.weeklyLegalLimitMinutes, 0) -
      Math.max(weeklyRegularBefore - config.weeklyLegalLimitMinutes, 0);

    legalOvertimeMinutes = dailyOverMinutes + weeklyOnlyOverMinutes;

    // 状態更新（全 attendance で実行）
    newWeeklyRegularRunning = weeklyRegularAfter;
  }

  const item: AttendanceItemResult = {
    attendanceId: attendance.attendanceId,
    attendanceRefPath: `attendances/${attendance.attendanceId}`,
    workDate: attendance.date,
    weekday: attendance.weekday,
    weekStartDate: attendance.weekStartDate,
    paymentPeriodKey: attendance.paymentPeriodKey,
    isCarryOver,
    originalPaymentPeriodKey,
    includedInCurrentRun: isTargetAttendance,
    actualWorkMinutes: attendance.actualWorkMinutes,
    nightWorkMinutes: attendance.nightWorkMinutes,
    isLegalHoliday: legalHoliday,
    isNonLegalHoliday: false, // §6: 初期リリースでは常に false
    dailyOverMinutes,
    dailyRegularMinutes,
    weeklyRegularBefore: weeklyRegularRunning,
    weeklyRegularAfter: legalHoliday ? weeklyRegularRunning : weeklyRegularRunning + dailyRegularMinutes,
    weeklyOnlyOverMinutes,
    legalOvertimeMinutes,
  };

  return { item, weeklyRegularAfter: newWeeklyRegularRunning };
}

// ─── 01_CALC_SPEC §5,7: 1週分の attendance を処理 ───

export interface WeekResult {
  items: AttendanceItemResult[];
  targetItems: AttendanceItemResult[];
}

export function calcWeek(
  weekAttendances: CalcAttendanceInput[],
  config: CalcConfigInput,
  currentPeriodKey: string
): WeekResult {
  const sorted = stableSort(weekAttendances);
  let weeklyRegularRunning = 0;
  const items: AttendanceItemResult[] = [];
  const targetItems: AttendanceItemResult[] = [];

  for (const att of sorted) {
    const target = isTarget(att, currentPeriodKey);
    const { item, weeklyRegularAfter } = processAttendanceDay(
      att,
      config,
      weeklyRegularRunning,
      target,
      false,
      null
    );
    weeklyRegularRunning = weeklyRegularAfter;
    items.push(item);
    if (target) {
      targetItems.push(item);
    }
  }

  return { items, targetItems };
}

// ─── 01_CALC_SPEC §8: 月60時間超 ───

export function calcOver60(
  targetItems: AttendanceItemResult[]
): number {
  let cumulativeOvertime = 0;
  let over60OvertimeMinutes = 0;

  for (const item of targetItems) {
    if (item.isLegalHoliday) continue;

    cumulativeOvertime += item.legalOvertimeMinutes;

    if (cumulativeOvertime > MONTHLY_OVER60_THRESHOLD_MINUTES) {
      const over60Contribution = Math.min(
        item.legalOvertimeMinutes,
        cumulativeOvertime - MONTHLY_OVER60_THRESHOLD_MINUTES
      );
      over60OvertimeMinutes += over60Contribution;
    }
  }

  return over60OvertimeMinutes;
}

// ─── 01_CALC_SPEC §10: 金額計算 ───

export interface AmountResult {
  basePay: number;
  lateNightPremiumPay: number;
  overtimePremiumPay: number;
  over60PremiumPay: number;
  legalHolidayPremiumPay: number;
  grossPay: number;
}

export function calcAmount(
  totals: {
    totalActualWorkMinutes: number;
    totalNightWorkMinutes: number;
    totalLegalOvertimeMinutes: number;
    over60OvertimeMinutes: number;
    totalLegalHolidayWorkMinutes: number;
  },
  config: CalcConfigInput
): AmountResult {
  const { roundingMethod, roundingPrecision, baseHourlyWage } = config;
  const r = (v: number) => payrollRound(v, roundingMethod, roundingPrecision);

  const basePay = r(totals.totalActualWorkMinutes / 60 * baseHourlyWage);
  const lateNightPremiumPay = r(totals.totalNightWorkMinutes / 60 * baseHourlyWage * config.nightPremiumRate);
  const overtimePremiumPay = r(totals.totalLegalOvertimeMinutes / 60 * baseHourlyWage * config.overtimePremiumRate);
  const over60PremiumPay = r(totals.over60OvertimeMinutes / 60 * baseHourlyWage * config.over60PremiumRate);
  const legalHolidayPremiumPay = r(totals.totalLegalHolidayWorkMinutes / 60 * baseHourlyWage * config.legalHolidayPremiumRate);

  const grossPay = basePay + lateNightPremiumPay + overtimePremiumPay + over60PremiumPay + legalHolidayPremiumPay;

  return { basePay, lateNightPremiumPay, overtimePremiumPay, over60PremiumPay, legalHolidayPremiumPay, grossPay };
}

// ─── 01_CALC_SPEC §2,12: staff 1人分の全計算 ───

export function calculateStaffPayroll(
  allAttendances: CalcAttendanceInput[],
  config: CalcConfigInput
): StaffCalcResult {
  const staffId = allAttendances.length > 0 ? allAttendances[0].staffId : '';

  // weekStartDate でグループ化
  const weekGroups = new Map<string, CalcAttendanceInput[]>();
  for (const att of allAttendances) {
    const group = weekGroups.get(att.weekStartDate) || [];
    group.push(att);
    weekGroups.set(att.weekStartDate, group);
  }

  // 各週を処理
  let totalActualWorkMinutes = 0;
  let totalNightWorkMinutes = 0;
  let totalLegalOvertimeMinutes = 0;
  let totalLegalHolidayWorkMinutes = 0;
  let totalNonLegalHolidayWorkMinutes = 0;
  const allTargetItems: AttendanceItemResult[] = [];
  const allItems: AttendanceItemResult[] = [];

  // weekStartDate 順に処理（時系列順を保証）
  const sortedWeekKeys = [...weekGroups.keys()].sort();

  for (const weekKey of sortedWeekKeys) {
    const weekAtts = weekGroups.get(weekKey)!;
    const { items, targetItems } = calcWeek(weekAtts, config, config.currentPeriodKey);

    allItems.push(...items);

    for (const item of targetItems) {
      totalActualWorkMinutes += item.actualWorkMinutes;
      totalNightWorkMinutes += item.nightWorkMinutes;
      totalLegalOvertimeMinutes += item.legalOvertimeMinutes;
      if (item.isLegalHoliday) {
        totalLegalHolidayWorkMinutes += item.actualWorkMinutes;
      }
      if (item.isNonLegalHoliday) {
        totalNonLegalHolidayWorkMinutes += item.actualWorkMinutes;
      }
      allTargetItems.push(item);
    }
  }

  // §8: 月60時間超（時系列順の targetItems で計算）
  const targetItemsSorted = allTargetItems.sort((a, b) =>
    a.workDate < b.workDate ? -1 : a.workDate > b.workDate ? 1 : 0
  );
  const over60OvertimeMinutes = calcOver60(targetItemsSorted);

  // §10: 金額計算
  const amounts = calcAmount(
    {
      totalActualWorkMinutes,
      totalNightWorkMinutes,
      totalLegalOvertimeMinutes,
      over60OvertimeMinutes,
      totalLegalHolidayWorkMinutes,
    },
    config
  );

  return {
    staffId,
    totalActualWorkMinutes,
    totalNightWorkMinutes,
    totalLegalOvertimeMinutes,
    over60OvertimeMinutes,
    totalLegalHolidayWorkMinutes,
    totalNonLegalHolidayWorkMinutes,
    ...amounts,
    attendanceItems: allItems.filter((i) => i.includedInCurrentRun),
    carryOverGrossPay: 0,
    carryOverAttendanceCount: 0,
  };
}

// ─── 01_CALC_SPEC §13-1: キャリーオーバー計算 ───

export function calculateCarryOverPayroll(
  carryOverAttendances: CalcAttendanceInput[],
  originalPeriodAllAttendances: CalcAttendanceInput[],
  originalPeriodKey: string,
  config: CalcConfigInput
): {
  items: AttendanceItemResult[];
  totalActualWorkMinutes: number;
  totalNightWorkMinutes: number;
  totalLegalOvertimeMinutes: number;
  over60OvertimeMinutes: number;
  totalLegalHolidayWorkMinutes: number;
  grossPay: number;
} {
  const carryOverIds = new Set(carryOverAttendances.map((a) => a.attendanceId));

  // 元期間の attendance を weekStartDate でグループ化
  const allAttsForPeriod = [...originalPeriodAllAttendances];
  // キャリーオーバー対象も含める（元期間に無い場合）
  for (const co of carryOverAttendances) {
    if (!allAttsForPeriod.some((a) => a.attendanceId === co.attendanceId)) {
      allAttsForPeriod.push(co);
    }
  }

  const weekGroups = new Map<string, CalcAttendanceInput[]>();
  for (const att of allAttsForPeriod) {
    const group = weekGroups.get(att.weekStartDate) || [];
    group.push(att);
    weekGroups.set(att.weekStartDate, group);
  }

  let totalActualWorkMinutes = 0;
  let totalNightWorkMinutes = 0;
  let totalLegalOvertimeMinutes = 0;
  let totalLegalHolidayWorkMinutes = 0;
  const coTargetItems: AttendanceItemResult[] = [];
  const allItems: AttendanceItemResult[] = [];

  const sortedWeekKeys = [...weekGroups.keys()].sort();

  for (const weekKey of sortedWeekKeys) {
    const weekAtts = weekGroups.get(weekKey)!;
    const sorted = stableSort(weekAtts);
    let weeklyRegularRunning = 0;

    for (const att of sorted) {
      const isCoTarget = carryOverIds.has(att.attendanceId);
      const { item, weeklyRegularAfter } = processAttendanceDay(
        att,
        config,
        weeklyRegularRunning,
        isCoTarget,
        isCoTarget,
        isCoTarget ? originalPeriodKey : null
      );
      weeklyRegularRunning = weeklyRegularAfter;
      allItems.push(item);

      if (isCoTarget) {
        totalActualWorkMinutes += item.actualWorkMinutes;
        totalNightWorkMinutes += item.nightWorkMinutes;
        totalLegalOvertimeMinutes += item.legalOvertimeMinutes;
        if (item.isLegalHoliday) {
          totalLegalHolidayWorkMinutes += item.actualWorkMinutes;
        }
        coTargetItems.push(item);
      }
    }
  }

  const coTargetItemsSorted = coTargetItems.sort((a, b) =>
    a.workDate < b.workDate ? -1 : a.workDate > b.workDate ? 1 : 0
  );
  const over60OvertimeMinutes = calcOver60(coTargetItemsSorted);

  const amounts = calcAmount(
    {
      totalActualWorkMinutes,
      totalNightWorkMinutes,
      totalLegalOvertimeMinutes,
      over60OvertimeMinutes,
      totalLegalHolidayWorkMinutes,
    },
    config
  );

  return {
    items: allItems.filter((i) => i.isCarryOver),
    totalActualWorkMinutes,
    totalNightWorkMinutes,
    totalLegalOvertimeMinutes,
    over60OvertimeMinutes,
    totalLegalHolidayWorkMinutes,
    grossPay: amounts.grossPay,
  };
}
