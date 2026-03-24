/**
 * コア計算エンジン — 単体テスト
 *
 * 01_CALC_SPEC 検証テーブル 1〜6 をそのままテストデータに変換。
 * Firestore 非依存のため、モックなしで実行可能。
 */

import {
  isLegalHoliday,
  processAttendanceDay,
  calcOver60,
  calcAmount,
  calculateStaffPayroll,
  calculateCarryOverPayroll,
} from '../../src/domains/attendance/helpers/payrollCalcEngine';
import { payrollRound } from '../../src/domains/attendance/helpers/payrollRoundingUtils';
import type {
  CalcAttendanceInput,
  CalcConfigInput,
  AttendanceItemResult,
} from '../../src/domains/attendance/types/payrollCalcTypes';

/** テスト用のデフォルト config */
function defaultConfig(overrides: Partial<CalcConfigInput> = {}): CalcConfigInput {
  return {
    currentPeriodKey: '2026-02-26_2026-03-25',
    weeklyLegalLimitMinutes: 2400,
    legalHolidayWeekday: null,
    nightPremiumRate: 0.25,
    overtimePremiumRate: 0.25,
    over60PremiumRate: 0.25,
    legalHolidayPremiumRate: 0.35,
    roundingMethod: 'floor',
    roundingPrecision: 0,
    baseHourlyWage: 1200,
    ...overrides,
  };
}

/** テスト用の attendance 入力を簡便に生成 */
function makeAtt(
  id: string,
  date: string,
  weekday: number,
  weekStartDate: string,
  actualWorkMinutes: number,
  overrides: Partial<CalcAttendanceInput> = {}
): CalcAttendanceInput {
  return {
    attendanceId: id,
    staffId: 'staff-1',
    date,
    weekday,
    weekStartDate,
    paymentPeriodKey: '2026-02-26_2026-03-25',
    payrollStatus: 'unreflected',
    actualWorkMinutes,
    nightWorkMinutes: 0,
    clockIn: `${date}T09:00:00Z`,
    createdAt: `${date}T09:00:00Z`,
    ...overrides,
  };
}

// ═══════════════════════════════════════
// 端数処理テスト (R1〜R5)
// ═══════════════════════════════════════

describe('payrollRound', () => {
  it('R1: ceil precision=0', () => {
    expect(payrollRound(123.456, 'ceil', 0)).toBe(124);
  });

  it('R2: floor precision=0', () => {
    expect(payrollRound(123.456, 'floor', 0)).toBe(123);
  });

  it('R3: round precision=0 (123.456 → 123)', () => {
    expect(payrollRound(123.456, 'round', 0)).toBe(123);
  });

  it('R4: round precision=0 (123.5 → 124)', () => {
    expect(payrollRound(123.5, 'round', 0)).toBe(124);
  });

  it('R5: floor precision=-1 (1234 → 1230)', () => {
    expect(payrollRound(1234, 'floor', -1)).toBe(1230);
  });

  it('R6: ceil precision=-1 (1234 → 1240)', () => {
    expect(payrollRound(1234, 'ceil', -1)).toBe(1240);
  });
});

// ═══════════════════════════════════════
// ユニットテスト (U1〜U11)
// ═══════════════════════════════════════

describe('isLegalHoliday', () => {
  it('U1: weekday == legalHolidayWeekday → true', () => {
    expect(isLegalHoliday(0, 0)).toBe(true);
    expect(isLegalHoliday(3, 3)).toBe(true);
  });

  it('U2: legalHolidayWeekday = null → false', () => {
    expect(isLegalHoliday(0, null)).toBe(false);
    expect(isLegalHoliday(6, null)).toBe(false);
  });

  it('U2b: weekday != legalHolidayWeekday → false', () => {
    expect(isLegalHoliday(1, 0)).toBe(false);
  });
});

describe('processAttendanceDay', () => {
  const config = defaultConfig({ legalHolidayWeekday: 0 });

  it('U3: 法定休日 → dailyOver/weeklyOver=0, weeklyRegularRunning 不変', () => {
    const att = makeAtt('att-1', '2026-03-01', 0, '2026-03-01', 600);
    const { item, weeklyRegularAfter } = processAttendanceDay(att, config, 0, true, false, null);

    expect(item.isLegalHoliday).toBe(true);
    expect(item.dailyOverMinutes).toBe(0);
    expect(item.dailyRegularMinutes).toBe(0);
    expect(item.weeklyOnlyOverMinutes).toBe(0);
    expect(item.legalOvertimeMinutes).toBe(0);
    expect(weeklyRegularAfter).toBe(0);
  });

  it('U4: 通常 9h勤務 → dailyOver=60', () => {
    const att = makeAtt('att-2', '2026-03-02', 1, '2026-03-01', 540);
    const { item } = processAttendanceDay(att, config, 0, true, false, null);

    expect(item.dailyOverMinutes).toBe(60);
    expect(item.dailyRegularMinutes).toBe(480);
    expect(item.legalOvertimeMinutes).toBe(60);
  });

  it('U5: weeklyRegularRunning が正しく更新される', () => {
    const att = makeAtt('att-3', '2026-03-02', 1, '2026-03-01', 480);
    const { weeklyRegularAfter } = processAttendanceDay(att, config, 960, true, false, null);
    expect(weeklyRegularAfter).toBe(1440);
  });

  it('U10: isNonLegalHoliday は常に false', () => {
    const att = makeAtt('att-4', '2026-03-07', 6, '2026-03-01', 480);
    const { item } = processAttendanceDay(att, config, 0, true, false, null);
    expect(item.isNonLegalHoliday).toBe(false);
  });
});

describe('calcOver60', () => {
  it('U6: 累計 3600 超の寄与分が正しい', () => {
    const items: AttendanceItemResult[] = [];
    // 60h = 3600分。80日 × 480分 = 38400分 中、法定時間外60分/日とする
    // シンプルに: legalOvertimeMinutes の合計が 3700 になるケース
    for (let i = 0; i < 37; i++) {
      items.push({
        legalOvertimeMinutes: 100,
        isLegalHoliday: false,
      } as AttendanceItemResult);
    }
    // 合計 3700、60h(3600)超は 100分
    expect(calcOver60(items)).toBe(100);
  });

  it('U7: 法定休日はスキップ', () => {
    const items: AttendanceItemResult[] = [
      { legalOvertimeMinutes: 3700, isLegalHoliday: false } as AttendanceItemResult,
      { legalOvertimeMinutes: 500, isLegalHoliday: true } as AttendanceItemResult,
    ];
    // 3700 - 3600 = 100（法定休日の 500 はスキップ）
    expect(calcOver60(items)).toBe(100);
  });

  it('U6b: 累計が 3600 以下なら 0', () => {
    const items: AttendanceItemResult[] = [
      { legalOvertimeMinutes: 100, isLegalHoliday: false } as AttendanceItemResult,
    ];
    expect(calcOver60(items)).toBe(0);
  });
});

describe('calcAmount', () => {
  it('U8: 各金額項目の計算', () => {
    const config = defaultConfig();
    const totals = {
      totalActualWorkMinutes: 2700,
      totalNightWorkMinutes: 120,
      totalLegalOvertimeMinutes: 300,
      over60OvertimeMinutes: 0,
      totalLegalHolidayWorkMinutes: 0,
    };

    const result = calcAmount(totals, config);

    // basePay = floor(2700/60 * 1200) = floor(54000) = 54000
    expect(result.basePay).toBe(54000);
    // lateNightPremiumPay = floor(120/60 * 1200 * 0.25) = floor(600) = 600
    expect(result.lateNightPremiumPay).toBe(600);
    // overtimePremiumPay = floor(300/60 * 1200 * 0.25) = floor(1500) = 1500
    expect(result.overtimePremiumPay).toBe(1500);
    expect(result.over60PremiumPay).toBe(0);
    expect(result.legalHolidayPremiumPay).toBe(0);
    expect(result.grossPay).toBe(56100);
  });

  it('U9: roundingMethod の違い', () => {
    const totals = {
      totalActualWorkMinutes: 100,
      totalNightWorkMinutes: 0,
      totalLegalOvertimeMinutes: 0,
      over60OvertimeMinutes: 0,
      totalLegalHolidayWorkMinutes: 0,
    };

    // 100/60 * 1200 = 2000.0 → 端数なし
    // 端数が出るケース: 100/60 * 1000 = 1666.666...
    const ceilResult = calcAmount(totals, defaultConfig({ baseHourlyWage: 1000, roundingMethod: 'ceil' }));
    expect(ceilResult.basePay).toBe(1667);

    const floorResult = calcAmount(totals, defaultConfig({ baseHourlyWage: 1000, roundingMethod: 'floor' }));
    expect(floorResult.basePay).toBe(1666);

    const roundResult = calcAmount(totals, defaultConfig({ baseHourlyWage: 1000, roundingMethod: 'round' }));
    expect(roundResult.basePay).toBe(1667);
  });

  it('U11: 空の attendance → 全集計値 0', () => {
    const config = defaultConfig();
    const result = calculateStaffPayroll([], config);

    expect(result.totalActualWorkMinutes).toBe(0);
    expect(result.totalNightWorkMinutes).toBe(0);
    expect(result.totalLegalOvertimeMinutes).toBe(0);
    expect(result.over60OvertimeMinutes).toBe(0);
    expect(result.grossPay).toBe(0);
    expect(result.attendanceItems).toHaveLength(0);
  });
});

// ═══════════════════════════════════════
// 検証テーブルテスト (V1〜V6)
// ═══════════════════════════════════════

describe('検証テーブル', () => {
  // weekStartDate は全て 2026-03-02（月曜始まり）とする
  const WSD = '2026-03-02';
  const config = defaultConfig();

  it('V1: 月〜金 各9時間（週45時間）→ legalOvertimeMinutes=300', () => {
    const atts = [
      makeAtt('m', '2026-03-02', 1, WSD, 540),
      makeAtt('t', '2026-03-03', 2, WSD, 540),
      makeAtt('w', '2026-03-04', 3, WSD, 540),
      makeAtt('th', '2026-03-05', 4, WSD, 540),
      makeAtt('f', '2026-03-06', 5, WSD, 540),
    ];

    const result = calculateStaffPayroll(atts, config);

    expect(result.totalActualWorkMinutes).toBe(2700);
    expect(result.totalLegalOvertimeMinutes).toBe(300);
    expect(result.totalLegalHolidayWorkMinutes).toBe(0);

    // 各日の明細を検証
    const items = result.attendanceItems;
    expect(items).toHaveLength(5);
    expect(items[0].dailyOverMinutes).toBe(60);
    expect(items[0].weeklyOnlyOverMinutes).toBe(0);
    expect(items[0].legalOvertimeMinutes).toBe(60);
  });

  it('V2: 月〜金 各7時間 + 土10時間 → legalOvertimeMinutes=300', () => {
    const atts = [
      makeAtt('m', '2026-03-02', 1, WSD, 420),
      makeAtt('t', '2026-03-03', 2, WSD, 420),
      makeAtt('w', '2026-03-04', 3, WSD, 420),
      makeAtt('th', '2026-03-05', 4, WSD, 420),
      makeAtt('f', '2026-03-06', 5, WSD, 420),
      makeAtt('sa', '2026-03-07', 6, WSD, 600),
    ];

    const result = calculateStaffPayroll(atts, config);

    expect(result.totalActualWorkMinutes).toBe(2700);
    expect(result.totalLegalOvertimeMinutes).toBe(300);

    const sat = result.attendanceItems[5];
    expect(sat.dailyOverMinutes).toBe(120);
    expect(sat.weeklyOnlyOverMinutes).toBe(180);
    expect(sat.legalOvertimeMinutes).toBe(300);
  });

  it('V3: 月10h + 火〜金8h + 土6h → legalOvertimeMinutes=480', () => {
    const atts = [
      makeAtt('m', '2026-03-02', 1, WSD, 600),
      makeAtt('t', '2026-03-03', 2, WSD, 480),
      makeAtt('w', '2026-03-04', 3, WSD, 480),
      makeAtt('th', '2026-03-05', 4, WSD, 480),
      makeAtt('f', '2026-03-06', 5, WSD, 480),
      makeAtt('sa', '2026-03-07', 6, WSD, 360),
    ];

    const result = calculateStaffPayroll(atts, config);

    expect(result.totalActualWorkMinutes).toBe(2880);
    expect(result.totalLegalOvertimeMinutes).toBe(480);

    const items = result.attendanceItems;
    expect(items[0].dailyOverMinutes).toBe(120);
    expect(items[0].legalOvertimeMinutes).toBe(120);
    expect(items[5].dailyOverMinutes).toBe(0);
    expect(items[5].weeklyOnlyOverMinutes).toBe(360);
    expect(items[5].legalOvertimeMinutes).toBe(360);
  });

  it('V4: 月〜土 各7時間（週42時間）→ legalOvertimeMinutes=120', () => {
    const atts = [
      makeAtt('m', '2026-03-02', 1, WSD, 420),
      makeAtt('t', '2026-03-03', 2, WSD, 420),
      makeAtt('w', '2026-03-04', 3, WSD, 420),
      makeAtt('th', '2026-03-05', 4, WSD, 420),
      makeAtt('f', '2026-03-06', 5, WSD, 420),
      makeAtt('sa', '2026-03-07', 6, WSD, 420),
    ];

    const result = calculateStaffPayroll(atts, config);

    expect(result.totalActualWorkMinutes).toBe(2520);
    expect(result.totalLegalOvertimeMinutes).toBe(120);

    const sat = result.attendanceItems[5];
    expect(sat.dailyOverMinutes).toBe(0);
    expect(sat.weeklyOnlyOverMinutes).toBe(120);
    expect(sat.legalOvertimeMinutes).toBe(120);
  });

  it('V5: 月〜金 各8h + 日(法定休日)10h → legalOvertime=0, legalHolidayWork=600', () => {
    const cfgWithHoliday = defaultConfig({ legalHolidayWeekday: 0 });

    const atts = [
      makeAtt('su', '2026-03-01', 0, WSD, 600),
      makeAtt('m', '2026-03-02', 1, WSD, 480),
      makeAtt('t', '2026-03-03', 2, WSD, 480),
      makeAtt('w', '2026-03-04', 3, WSD, 480),
      makeAtt('th', '2026-03-05', 4, WSD, 480),
      makeAtt('f', '2026-03-06', 5, WSD, 480),
    ];

    const result = calculateStaffPayroll(atts, cfgWithHoliday);

    expect(result.totalActualWorkMinutes).toBe(3000);
    expect(result.totalLegalOvertimeMinutes).toBe(0);
    expect(result.totalLegalHolidayWorkMinutes).toBe(600);

    // 月〜金の累計は 2400 で収まり、週超過は発生しない
    const fri = result.attendanceItems.find((i) => i.attendanceId === 'f')!;
    expect(fri.weeklyRegularAfter).toBe(2400);
    expect(fri.weeklyOnlyOverMinutes).toBe(0);

    const sun = result.attendanceItems.find((i) => i.attendanceId === 'su')!;
    expect(sun.isLegalHoliday).toBe(true);
    expect(sun.dailyOverMinutes).toBe(0);
  });

  it('V6: 月跨ぎ週（3/29-3/31 計上, 4/1-4/2 参照）→ legalOvertimeMinutes=60', () => {
    const crossWeekConfig = defaultConfig({
      currentPeriodKey: '2026-03-01_2026-03-31',
    });

    const WSD_CROSS = '2026-03-29';

    const atts = [
      makeAtt('3/29', '2026-03-29', 0, WSD_CROSS, 480, {
        paymentPeriodKey: '2026-03-01_2026-03-31',
      }),
      makeAtt('3/30', '2026-03-30', 1, WSD_CROSS, 480, {
        paymentPeriodKey: '2026-03-01_2026-03-31',
      }),
      makeAtt('3/31', '2026-03-31', 2, WSD_CROSS, 540, {
        paymentPeriodKey: '2026-03-01_2026-03-31',
      }),
      makeAtt('4/1', '2026-04-01', 3, WSD_CROSS, 480, {
        paymentPeriodKey: '2026-04-01_2026-04-30',
        payrollStatus: 'unreflected',
      }),
      makeAtt('4/2', '2026-04-02', 4, WSD_CROSS, 480, {
        paymentPeriodKey: '2026-04-01_2026-04-30',
        payrollStatus: 'unreflected',
      }),
    ];

    const result = calculateStaffPayroll(atts, crossWeekConfig);

    // 3月の計上対象: 3/29(0), 3/30(0), 3/31(60) = 60
    expect(result.totalLegalOvertimeMinutes).toBe(60);
    expect(result.totalActualWorkMinutes).toBe(480 + 480 + 540); // 3月分のみ

    // 4月分は集計に含まれないが weeklyRegularRunning の更新には使われる
    expect(result.attendanceItems).toHaveLength(3);
  });
});

// ═══════════════════════════════════════
// 金額の統合テスト
// ═══════════════════════════════════════

describe('金額計算 統合テスト', () => {
  it('V1 のケースで金額を検証', () => {
    const WSD = '2026-03-02';
    const config = defaultConfig({ baseHourlyWage: 1200 });

    const atts = [
      makeAtt('m', '2026-03-02', 1, WSD, 540),
      makeAtt('t', '2026-03-03', 2, WSD, 540),
      makeAtt('w', '2026-03-04', 3, WSD, 540),
      makeAtt('th', '2026-03-05', 4, WSD, 540),
      makeAtt('f', '2026-03-06', 5, WSD, 540),
    ];

    const result = calculateStaffPayroll(atts, config);

    // basePay = floor(2700/60 * 1200) = 54000
    expect(result.basePay).toBe(54000);
    // overtimePremiumPay = floor(300/60 * 1200 * 0.25) = floor(1500) = 1500
    expect(result.overtimePremiumPay).toBe(1500);
    expect(result.grossPay).toBe(54000 + 1500);
  });

  it('法定休日ありのケースで金額を検証', () => {
    const WSD = '2026-03-02';
    const config = defaultConfig({ legalHolidayWeekday: 0, baseHourlyWage: 1000 });

    const atts = [
      makeAtt('su', '2026-03-01', 0, WSD, 480, { nightWorkMinutes: 0 }),
      makeAtt('m', '2026-03-02', 1, WSD, 480, { nightWorkMinutes: 0 }),
    ];

    const result = calculateStaffPayroll(atts, config);

    // totalActualWorkMinutes = 960
    // totalLegalHolidayWorkMinutes = 480
    // basePay = floor(960/60 * 1000) = 16000
    // legalHolidayPremiumPay = floor(480/60 * 1000 * 0.35) = floor(2800) = 2800
    expect(result.basePay).toBe(16000);
    expect(result.legalHolidayPremiumPay).toBe(2800);
    expect(result.grossPay).toBe(16000 + 2800);
  });

  it('深夜労働のケースで金額を検証', () => {
    const WSD = '2026-03-02';
    const config = defaultConfig({ baseHourlyWage: 1000 });

    const atts = [
      makeAtt('m', '2026-03-02', 1, WSD, 480, { nightWorkMinutes: 120 }),
    ];

    const result = calculateStaffPayroll(atts, config);

    // basePay = floor(480/60 * 1000) = 8000
    // lateNightPremiumPay = floor(120/60 * 1000 * 0.25) = floor(500) = 500
    expect(result.basePay).toBe(8000);
    expect(result.lateNightPremiumPay).toBe(500);
    expect(result.grossPay).toBe(8500);
  });
});

// ═══════════════════════════════════════
// キャリーオーバーテスト (C1〜C3)
// ═══════════════════════════════════════

describe('calculateCarryOverPayroll', () => {
  it('C1: キャリーオーバー attendance が元期間のコンテキストで計算される', () => {
    const originalPeriodKey = '2026-01-26_2026-02-25';
    const config = defaultConfig({
      currentPeriodKey: '2026-02-26_2026-03-25',
    });

    // 元期間の attendance: 月〜金 8h（reflected）
    const WSD_ORIG = '2026-02-02';
    const originalAtts = [
      makeAtt('orig-m', '2026-02-02', 1, WSD_ORIG, 480, {
        paymentPeriodKey: originalPeriodKey,
        payrollStatus: 'reflected',
      }),
      makeAtt('orig-t', '2026-02-03', 2, WSD_ORIG, 480, {
        paymentPeriodKey: originalPeriodKey,
        payrollStatus: 'reflected',
      }),
      makeAtt('orig-w', '2026-02-04', 3, WSD_ORIG, 480, {
        paymentPeriodKey: originalPeriodKey,
        payrollStatus: 'reflected',
      }),
      makeAtt('orig-th', '2026-02-05', 4, WSD_ORIG, 480, {
        paymentPeriodKey: originalPeriodKey,
        payrollStatus: 'reflected',
      }),
      makeAtt('orig-f', '2026-02-06', 5, WSD_ORIG, 480, {
        paymentPeriodKey: originalPeriodKey,
        payrollStatus: 'reflected',
      }),
    ];

    // キャリーオーバー: 土曜 7h（未反映だったもの）
    const coAtt = makeAtt('co-sa', '2026-02-07', 6, WSD_ORIG, 420, {
      paymentPeriodKey: originalPeriodKey,
      payrollStatus: 'unreflected',
    });

    const coResult = calculateCarryOverPayroll(
      [coAtt],
      originalAtts,
      originalPeriodKey,
      config
    );

    // 元期間の weeklyRegularRunning: 月〜金で 2400
    // 土7h(420) → dailyOver=0, dailyRegular=420
    // weeklyRegularAfter=2820, weeklyOnlyOver = max(2820-2400,0) - max(2400-2400,0) = 420
    // legalOvertime = 0 + 420 = 420
    expect(coResult.items).toHaveLength(1);
    expect(coResult.items[0].isCarryOver).toBe(true);
    expect(coResult.items[0].originalPaymentPeriodKey).toBe(originalPeriodKey);
    expect(coResult.items[0].legalOvertimeMinutes).toBe(420);
    expect(coResult.totalLegalOvertimeMinutes).toBe(420);
  });

  it('C2: キャリーオーバー分が正しい grossPay を算出', () => {
    const originalPeriodKey = '2026-01-26_2026-02-25';
    const config = defaultConfig({
      currentPeriodKey: '2026-02-26_2026-03-25',
      baseHourlyWage: 1000,
    });

    const WSD_ORIG = '2026-02-02';
    const coAtt = makeAtt('co-1', '2026-02-02', 1, WSD_ORIG, 540, {
      paymentPeriodKey: originalPeriodKey,
      payrollStatus: 'unreflected',
    });

    const coResult = calculateCarryOverPayroll(
      [coAtt],
      [],
      originalPeriodKey,
      config
    );

    // actualWorkMinutes=540, legalOvertime=60(dailyOver)
    // basePay = floor(540/60*1000) = 9000
    // overtimePremiumPay = floor(60/60*1000*0.25) = 250
    // grossPay = 9250
    expect(coResult.grossPay).toBe(9250);
  });

  it('C3: 当月 attendance とキャリーオーバーは独立計算', () => {
    const config = defaultConfig();
    const WSD = '2026-03-02';

    // 当月の attendance
    const currentAtts = [
      makeAtt('cur-m', '2026-03-02', 1, WSD, 480),
    ];
    const currentResult = calculateStaffPayroll(currentAtts, config);

    // キャリーオーバー（別の weekStartDate）
    const originalPeriodKey = '2026-01-26_2026-02-25';
    const WSD_ORIG = '2026-02-02';
    const coAtt = makeAtt('co-1', '2026-02-02', 1, WSD_ORIG, 480, {
      paymentPeriodKey: originalPeriodKey,
      payrollStatus: 'unreflected',
    });

    const coResult = calculateCarryOverPayroll(
      [coAtt],
      [],
      originalPeriodKey,
      config
    );

    // 各計算の weeklyRegularRunning が独立
    expect(currentResult.attendanceItems[0].weeklyRegularBefore).toBe(0);
    expect(coResult.items[0].weeklyRegularBefore).toBe(0);
  });
});

// ═══════════════════════════════════════
// 月60時間超の統合テスト
// ═══════════════════════════════════════

describe('月60時間超 統合テスト', () => {
  it('月60時間超の法定時間外がある場合', () => {
    const config = defaultConfig({ baseHourlyWage: 1000 });

    // 10週 × 週5日 × 9h = 法定時間外 10週 × 300分 = 3000分 + もう少し必要
    // 60h = 3600分が閾値。各日 dailyOver=60分 × 61日 = 3660分
    // シンプルに: 各週に1日だけ計上、dailyOver=60分/日 を十分な日数作る
    const atts: CalcAttendanceInput[] = [];
    for (let week = 0; week < 10; week++) {
      const weekStart = `2026-03-${String(2 + week * 7).padStart(2, '0')}`;
      for (let day = 0; day < 7; day++) {
        const dayNum = 2 + week * 7 + day;
        if (dayNum > 25) break; // periodEnd
        const dateStr = `2026-03-${String(dayNum).padStart(2, '0')}`;
        const weekday = (1 + day) % 7; // 月=1 始まり
        atts.push(
          makeAtt(`att-${dayNum}`, dateStr, weekday, weekStart, 540)
        );
      }
    }

    // ここでは確認用に実際にシンプルなケースで検証
    // 4週 × 6日 × 10h = 24日 × 600分
    // dailyOver = 120分/日 × 24 = 2880分、週超過 = 各週 (480*6=2880, 2880-2400=480)
    // でも重複があるので正確に計算...

    // もっとシンプルなテスト: 直接 items を作って calcOver60 だけテスト
    // これは U6 でカバー済み。ここでは calculateStaffPayroll を通した統合テストを行う

    // 週5日 × 9h × 12週 = 60日
    // 各日 dailyOver=60, weeklyOnly=0 → legalOvertime=60/日
    // 60日 × 60 = 3600 → ちょうど 60h、超過なし
    // 61日目で 60 → 合計3660 → 超過60
    const simpleAtts: CalcAttendanceInput[] = [];
    for (let i = 0; i < 13; i++) {
      const weekStart = `w${String(i).padStart(2, '0')}`;
      for (let d = 0; d < 5; d++) {
        const dayIdx = i * 5 + d;
        if (dayIdx >= 61) break;
        const dateStr = `2026-03-${String(dayIdx + 1).padStart(2, '0')}`;
        simpleAtts.push(
          makeAtt(`s-${dayIdx}`, dateStr, d + 1, weekStart, 540)
        );
      }
    }

    const result = calculateStaffPayroll(simpleAtts, config);

    // 61日 × 60分 = 3660分 法定時間外
    expect(result.totalLegalOvertimeMinutes).toBe(3660);
    // 3660 - 3600 = 60分
    expect(result.over60OvertimeMinutes).toBe(60);

    // over60PremiumPay = floor(60/60 * 1000 * 0.25) = 250
    expect(result.over60PremiumPay).toBe(250);
  });
});
