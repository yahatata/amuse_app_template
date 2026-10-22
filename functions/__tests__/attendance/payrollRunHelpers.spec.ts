/**
 * payrollRunHelpers のユニットテスト
 *
 * Firestore 非依存のヘルパー関数群をテストする。
 */

import {
  classifyAttendancesForRun,
  groupByStaffId,
  buildRunSnapshot,
  buildCalcConfigFromSnapshot,
  aggregateStaffResults,
  isRunComplete,
} from '../../src/domains/attendance/helpers/payrollRunHelpers';
import type {
  AttendanceForRun,
  StaffResultForAggregation,
} from '../../src/domains/attendance/helpers/payrollRunHelpers';
import type { PayrollConfig } from '../../src/shared/config/payrollConfigTypes';
import type { PayrollRunSnapshot } from '../../src/domains/attendance/types/payrollRunTypes';

function makeAtt(overrides: Partial<AttendanceForRun> = {}): AttendanceForRun {
  return {
    id: 'att-1',
    staffId: 'staff-1',
    paymentPeriodKey: '2025-01-26_2025-02-25',
    clockOut: null,
    isDeleted: false,
    ...overrides,
  };
}

// ──────────────────────────────────────────
// classifyAttendancesForRun
// ──────────────────────────────────────────

describe('classifyAttendancesForRun', () => {
  const periodKey = '2025-01-26_2025-02-25';

  it('normal に当期間、carryOver に別期間を振り分ける', () => {
    const atts = [
      makeAtt({ id: 'a1', paymentPeriodKey: periodKey }),
      makeAtt({ id: 'a2', paymentPeriodKey: '2024-12-26_2025-01-25' }),
      makeAtt({ id: 'a3', paymentPeriodKey: periodKey }),
    ];
    const result = classifyAttendancesForRun(atts, periodKey);
    expect(result.normal.map((a) => a.id)).toEqual(['a1', 'a3']);
    expect(result.carryOver.map((a) => a.id)).toEqual(['a2']);
  });

  it('空配列の場合、両方空', () => {
    const result = classifyAttendancesForRun([], periodKey);
    expect(result.normal).toHaveLength(0);
    expect(result.carryOver).toHaveLength(0);
  });
});

// ──────────────────────────────────────────
// groupByStaffId
// ──────────────────────────────────────────

describe('groupByStaffId', () => {
  it('staffId ごとにグルーピングし、normal/carryOver を分離する', () => {
    const classified = {
      normal: [
        makeAtt({ id: 'a1', staffId: 'sA' }),
        makeAtt({ id: 'a2', staffId: 'sB' }),
        makeAtt({ id: 'a3', staffId: 'sA' }),
      ],
      carryOver: [
        makeAtt({ id: 'a4', staffId: 'sA', paymentPeriodKey: 'old' }),
        makeAtt({ id: 'a5', staffId: 'sC', paymentPeriodKey: 'old' }),
      ],
    };
    const groups = groupByStaffId(classified);

    expect(groups).toHaveLength(3);

    const sA = groups.find((g) => g.staffId === 'sA')!;
    expect(sA.assignedAttendanceIds).toEqual(['a1', 'a3']);
    expect(sA.assignedCarryOverAttendanceIds).toEqual(['a4']);

    const sB = groups.find((g) => g.staffId === 'sB')!;
    expect(sB.assignedAttendanceIds).toEqual(['a2']);
    expect(sB.assignedCarryOverAttendanceIds).toEqual([]);

    const sC = groups.find((g) => g.staffId === 'sC')!;
    expect(sC.assignedAttendanceIds).toEqual([]);
    expect(sC.assignedCarryOverAttendanceIds).toEqual(['a5']);
  });

  it('carryOver のみの staffId が正しくグルーピングされる', () => {
    const classified = {
      normal: [],
      carryOver: [
        makeAtt({ id: 'a1', staffId: 'sX', paymentPeriodKey: 'old' }),
      ],
    };
    const groups = groupByStaffId(classified);
    expect(groups).toHaveLength(1);
    expect(groups[0].staffId).toBe('sX');
    expect(groups[0].assignedAttendanceIds).toEqual([]);
    expect(groups[0].assignedCarryOverAttendanceIds).toEqual(['a1']);
  });
});

// ──────────────────────────────────────────
// buildRunSnapshot
// ──────────────────────────────────────────

describe('buildRunSnapshot', () => {
  it('PayrollConfig から正しく snapshot を構築する', () => {
    const pc: PayrollConfig = {
      weekStartDay: 1,
      weeklyLegalLimitMinutes: 2400,
      legalHolidayWeekday: 0,
      nightPremiumRate: 0.25,
      overtimePremiumRate: 0.25,
      over60PremiumRate: 0.5,
      legalHolidayPremiumRate: 0.35,
      roundingMethod: 'floor',
      roundingPrecision: 0,
      calcVersion: '1.0.0',
      maxCandidatesCount: 2000,
      paymentDayOfMonth: '25',
      paymentMonthOffset: 1,
      bulkPaymentRegistrationEnabled: false,
      schedulerNotificationHour: 9,
      reminderStartDaysAfterPeriodEnd: 3,
      expectedRange: {
        attendanceCountMin: 10,
        attendanceCountMax: 500,
      },
    };

    const snap = buildRunSnapshot(pc, '2025-01-26_2025-02-25', '2025-01-26', '2025-02-25');

    expect(snap.paymentPeriodKey).toBe('2025-01-26_2025-02-25');
    expect(snap.paymentPeriodStart).toBe('2025-01-26');
    expect(snap.paymentPeriodEnd).toBe('2025-02-25');
    expect(snap.weekStartDaySnapshot).toBe(1);
    expect(snap.weeklyLegalLimitMinutesSnapshot).toBe(2400);
    expect(snap.legalHolidayWeekdaySnapshot).toBe(0);
    expect(snap.nightPremiumRateSnapshot).toBe(0.25);
    expect(snap.roundingMethodSnapshot).toBe('floor');
    expect(snap.roundingPrecisionSnapshot).toBe(0);
    expect(snap.calcVersion).toBe('1.0.0');
  });
});

// ──────────────────────────────────────────
// buildCalcConfigFromSnapshot
// ──────────────────────────────────────────

describe('buildCalcConfigFromSnapshot', () => {
  it('PayrollRunSnapshot + 時給 → CalcConfigInput を正しく変換する', () => {
    const snap: PayrollRunSnapshot = {
      paymentPeriodKey: '2025-01-26_2025-02-25',
      paymentPeriodStart: '2025-01-26',
      paymentPeriodEnd: '2025-02-25',
      weekStartDaySnapshot: 1,
      weeklyLegalLimitMinutesSnapshot: 2400,
      legalHolidayWeekdaySnapshot: 0,
      nightPremiumRateSnapshot: 0.25,
      overtimePremiumRateSnapshot: 0.25,
      over60PremiumRateSnapshot: 0.5,
      legalHolidayPremiumRateSnapshot: 0.35,
      roundingMethodSnapshot: 'floor',
      roundingPrecisionSnapshot: 0,
      calcVersion: '1.0.0',
    };

    const calcConfig = buildCalcConfigFromSnapshot(snap, 1200);

    expect(calcConfig.currentPeriodKey).toBe('2025-01-26_2025-02-25');
    expect(calcConfig.weeklyLegalLimitMinutes).toBe(2400);
    expect(calcConfig.baseHourlyWage).toBe(1200);
    expect(calcConfig.nightPremiumRate).toBe(0.25);
    expect(calcConfig.roundingMethod).toBe('floor');
  });
});

// ──────────────────────────────────────────
// aggregateStaffResults
// ──────────────────────────────────────────

describe('aggregateStaffResults', () => {
  it('completed の staffResults を正しく集計する', () => {
    const results: StaffResultForAggregation[] = [
      {
        taskStatus: 'completed',
        basePay: 100000,
        lateNightPremiumPay: 5000,
        overtimePremiumPay: 3000,
        over60PremiumPay: 0,
        legalHolidayPremiumPay: 2000,
        grossPay: 110000,
      },
      {
        taskStatus: 'completed',
        basePay: 80000,
        lateNightPremiumPay: 4000,
        overtimePremiumPay: 2000,
        over60PremiumPay: 1000,
        legalHolidayPremiumPay: 0,
        grossPay: 87000,
      },
      { taskStatus: 'failed' },
    ];

    const summary = aggregateStaffResults(results);
    expect(summary.totalBasePay).toBe(180000);
    expect(summary.totalPremiumPay).toBe(17000);
    expect(summary.totalGrossPay).toBe(197000);
    expect(summary.completedStaffCount).toBe(2);
    expect(summary.failedStaffCount).toBe(1);
    expect(summary.warningCount).toBe(0);
  });

  it('warning ステータスをカウントする', () => {
    const results: StaffResultForAggregation[] = [
      {
        taskStatus: 'completed',
        status: 'warning',
        basePay: 50000,
        grossPay: 50000,
      },
      {
        taskStatus: 'completed',
        status: 'success',
        basePay: 50000,
        grossPay: 50000,
      },
    ];

    const summary = aggregateStaffResults(results);
    expect(summary.warningCount).toBe(1);
  });

  it('空配列の場合、全てゼロ', () => {
    const summary = aggregateStaffResults([]);
    expect(summary.totalBasePay).toBe(0);
    expect(summary.totalGrossPay).toBe(0);
    expect(summary.completedStaffCount).toBe(0);
    expect(summary.failedStaffCount).toBe(0);
  });
});

// ──────────────────────────────────────────
// isRunComplete
// ──────────────────────────────────────────

describe('isRunComplete', () => {
  it('completed + failed >= target で true', () => {
    expect(isRunComplete(3, 2, 5)).toBe(true);
  });

  it('完了数が足りない場合 false', () => {
    expect(isRunComplete(2, 1, 5)).toBe(false);
  });

  it('targetCount = 0 のとき true', () => {
    expect(isRunComplete(0, 0, 0)).toBe(true);
  });
});
