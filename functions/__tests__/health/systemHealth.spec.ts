/**
 * システムヘルスチェック（機能横断テスト）
 *
 * Phase 2 移行後の全体的な健全性を多角的に確認する。
 * Firestore Emulator 不要のテスト（pure 関数）と、
 * Emulator 使用テスト（config / Firestore 依存）を分離して構成。
 *
 * 観点:
 * 1. config 基盤 — defaults.ts / configLoader の整合性
 * 2. 会計ロジック — snapshots.ts の金額計算
 * 3. 支払い分割 — paymentSplitCalculator の純関数
 * 4. 営業日ヘルパー — JST 変換、月キー生成
 * 5. contentHash — 同一入力で同一ハッシュ
 * 6. dualWrite フラグ — getStoreConfig mock 経由で制御可能か
 * 7. Firestore 統合 — config 読み書き（Emulator）
 */

jest.unmock('../../src/shared/config/configLoader');

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import { buildFromDefaults, getStoreConfig } from '../../src/shared/config/configLoader';
import {
  DEFAULT_DUAL_WRITE_ENABLED,
  DEFAULT_SETTLEMENT_AGGREGATOR_ENABLED,
  DEFAULT_AUTO_OPEN_CLOSE_ENABLED,
  DEFAULT_TASK_CLOSE_OFFSET_MINUTES,
  DEFAULT_TASK_OPEN_OFFSET_MINUTES,
  DEFAULT_ENTRANCE_FEE,
  DEFAULT_ENTRANCE_FEE_DESCRIPTION,
  DEFAULT_CHARGE_ENTRANCE_FEE_ON_REENTRY,
  DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE,
  DEFAULT_CATEGORY_PAYMENT_METHODS,
  DEFAULT_POINT_PRIORITY,
  DEFAULT_POINT_AB_ROUNDING_UNIT,
  DEFAULT_SIDE_GAME_CHIP_ROUNDING_UNIT,
  DEFAULT_LINE_PLAN,
  DEFAULT_CALC_BUSINESS_DATE_BUFFER_MINUTES,
  DEFAULT_BUSINESS_HOURS_STYLES,
  DEFAULT_SHIFT_SUBMISSION_START_DAY,
  DEFAULT_SHIFT_SUBMISSION_END_DAY,
  DEFAULT_SHIFT_SCHEDULING_START_DAY,
  DEFAULT_PAYROLL_START_DAY,
  DEFAULT_PAYROLL_END_DAY,
  DEFAULT_MENU_CATEGORIES,
  DEFAULT_SIDE_GAME_TYPES,
  DEFAULT_TOURNAMENT_PRIZE_RATIO,
  DEFAULT_TOURNAMENT_PRIZE_RECEIVER_PERCENTAGE,
  DEFAULT_TOURNAMENT_PRIZE_ROUNDING_METHOD,
  DEFAULT_TOURNAMENT_PRIZE_ROUNDING_UNIT,
  DEFAULT_ENQUEUE_SCHEDULER_ENABLED,
  DEFAULT_TEMPLATE_BUSINESSDATE_CHECK,
  DEFAULT_TABLE_DEVICE_REGISTRATION_ENABLED,
  DEFAULT_TABLE_DEVICE_FORCE_CLEAR_PASSCODE,
  DEFAULT_TABLE_DEVICE_TOURNAMENT_SEAT_ASSIGNMENT_ENABLED,
} from '../../src/shared/config/defaults';

import {
  calculateAmounts,
  calculatePaymentTotals,
  calculatePaymentsSummary,
  calculateContentHash,
  buildSideGameChipsSummary,
} from '../../src/domains/bills/services/snapshots';

import { calculatePaymentSplit } from '../../src/domains/bills/services/paymentSplitCalculator';

import {
  convertToJst,
  formatMonthKey,
  getPrevMonthKey,
  getNextMonthKey,
} from '../../src/domains/bills/repos/calcBusinessDateHelpers';

import type { StoreConfig } from '../../src/shared/config/types';

// ---------- ヘルパー ----------

function mockDoc(id: string, data: Record<string, unknown>): any {
  return { id, data: () => data };
}

// ---------- 1. config 基盤 ----------

describe('1. config 基盤', () => {
  describe('buildFromDefaults の網羅性', () => {
    let config: StoreConfig;
    beforeAll(() => { config = buildFromDefaults(); });

    it('features が全フラグ揃っている', () => {
      expect(config.features?.dualWriteEnabled).toBe(DEFAULT_DUAL_WRITE_ENABLED);
      expect(config.features?.enqueueSchedulerEnabled).toBe(DEFAULT_ENQUEUE_SCHEDULER_ENABLED);
      expect(config.features?.templateBusinessDateCheck).toBe(DEFAULT_TEMPLATE_BUSINESSDATE_CHECK);
      expect(config.features?.settlementAggregatorEnabled).toBe(DEFAULT_SETTLEMENT_AGGREGATOR_ENABLED);
      expect(config.features?.tableDeviceRegistrationEnabled).toBe(DEFAULT_TABLE_DEVICE_REGISTRATION_ENABLED);
      expect(config.tableDevice?.forceClearPasscode).toBe(DEFAULT_TABLE_DEVICE_FORCE_CLEAR_PASSCODE);
      expect(config.tableDevice?.tournamentSeatAssignmentEnabled)
        .toBe(DEFAULT_TABLE_DEVICE_TOURNAMENT_SEAT_ASSIGNMENT_ENABLED);
      expect(config.tableDevice?.actionHistoryViewEnabled).toBe(true);
      expect(config.tableDevice?.actionHistoryRollbackEnabled).toBe(false);
    });

    it('autoOpenClose が正しい', () => {
      expect(config.autoOpenClose?.enabled).toBe(DEFAULT_AUTO_OPEN_CLOSE_ENABLED);
      expect(config.autoOpenClose?.taskCloseOffsetMinutes).toBe(DEFAULT_TASK_CLOSE_OFFSET_MINUTES);
      expect(config.autoOpenClose?.taskOpenOffsetMinutes).toBe(DEFAULT_TASK_OPEN_OFFSET_MINUTES);
    });

    it('billing が正しい', () => {
      expect(config.billing?.entranceFee).toBe(DEFAULT_ENTRANCE_FEE);
      expect(config.billing?.entranceFeeDescription).toBe(DEFAULT_ENTRANCE_FEE_DESCRIPTION);
      expect(config.billing?.chargeEntranceFeeOnReentry).toBe(DEFAULT_CHARGE_ENTRANCE_FEE_ON_REENTRY);
      expect(config.billing?.sideGameChipRate).toBe(DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE);
      expect(config.billing?.paymentPolicy?.categoryPaymentMethods).toEqual(DEFAULT_CATEGORY_PAYMENT_METHODS);
      expect(config.billing?.paymentPolicy?.pointPriority).toEqual(DEFAULT_POINT_PRIORITY);
      expect(config.billing?.paymentPolicy?.roundingUnits?.pointAB).toBe(DEFAULT_POINT_AB_ROUNDING_UNIT);
      expect(config.billing?.paymentPolicy?.roundingUnits?.sideGameChip).toBe(DEFAULT_SIDE_GAME_CHIP_ROUNDING_UNIT);
    });

    it('linePlan / businessDay / shift / payroll / menuCategories / sideGameTypes / tournament が正しい', () => {
      expect(config.linePlan).toBe(DEFAULT_LINE_PLAN);
      expect(config.businessDay?.calcBufferMinutes).toBe(DEFAULT_CALC_BUSINESS_DATE_BUFFER_MINUTES);
      expect(config.shift?.submissionStartDay).toBe(DEFAULT_SHIFT_SUBMISSION_START_DAY);
      expect(config.shift?.submissionEndDay).toBe(DEFAULT_SHIFT_SUBMISSION_END_DAY);
      expect(config.shift?.schedulingStartDay).toBe(DEFAULT_SHIFT_SCHEDULING_START_DAY);
      expect(config.payroll?.startDay).toBe(DEFAULT_PAYROLL_START_DAY);
      expect(config.payroll?.endDay).toBe(DEFAULT_PAYROLL_END_DAY);
      expect(config.menuCategories).toEqual(DEFAULT_MENU_CATEGORIES);
      expect(config.sideGameTypes).toEqual(DEFAULT_SIDE_GAME_TYPES);
      expect(config.tournament?.defaultPrizeRatio).toBe(DEFAULT_TOURNAMENT_PRIZE_RATIO);
      expect(config.tournament?.prizeReceiverPercentage).toBe(DEFAULT_TOURNAMENT_PRIZE_RECEIVER_PERCENTAGE);
      expect(config.tournament?.prizeRoundingMethod).toBe(DEFAULT_TOURNAMENT_PRIZE_ROUNDING_METHOD);
      expect(config.tournament?.prizeRoundingUnit).toBe(DEFAULT_TOURNAMENT_PRIZE_ROUNDING_UNIT);
      expect(config.tournament?.prizeDistribution?.['1']).toEqual([100.0]);
    });

    it('businessHoursStyles が全5スタイル揃っている', () => {
      const styles = config.businessHoursStyles!;
      expect(Object.keys(styles)).toEqual(expect.arrayContaining(
        ['weekday', 'weekendHoliday', 'event', 'allDay', 'closed']
      ));
      for (const key of Object.keys(DEFAULT_BUSINESS_HOURS_STYLES)) {
        expect(styles[key]).toEqual(DEFAULT_BUSINESS_HOURS_STYLES[key]);
      }
    });
  });

  describe('defaults.ts の値の妥当性', () => {
    it('sideGameChipRate > 0', () => {
      expect(DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE).toBeGreaterThan(0);
    });
    it('calcBufferMinutes > 0', () => {
      expect(DEFAULT_CALC_BUSINESS_DATE_BUFFER_MINUTES).toBeGreaterThan(0);
    });
    it('payroll 期間が 1〜31', () => {
      expect(DEFAULT_PAYROLL_START_DAY).toBeGreaterThanOrEqual(1);
      expect(DEFAULT_PAYROLL_START_DAY).toBeLessThanOrEqual(31);
      expect(DEFAULT_PAYROLL_END_DAY).toBeGreaterThanOrEqual(1);
      expect(DEFAULT_PAYROLL_END_DAY).toBeLessThanOrEqual(31);
    });
    it('linePlan が有効値', () => {
      expect(['communication', 'light', 'standard']).toContain(DEFAULT_LINE_PLAN);
    });
    it('categoryPaymentMethods の全カテゴリに cash が含まれる', () => {
      for (const methods of Object.values(DEFAULT_CATEGORY_PAYMENT_METHODS)) {
        expect(methods).toContain('cash');
      }
    });
  });
});

// ---------- 2. 会計ロジック (snapshots) ----------

describe('2. 会計ロジック (snapshots)', () => {
  it('items + extras + sideGameChips + tournaments の合計が正しい', () => {
    const items = [
      mockDoc('i1', { totalPriceIncl: 1000 }),
      mockDoc('i2', { unitPriceIncl: 500, quantity: 3 }),
    ];
    const extras = [mockDoc('e1', { amountIncl: 200 })];
    const sideGameChips = [
      mockDoc('s1', { action: 'purchase', amountIncl: 500 }),
      mockDoc('s2', { action: 'exchange', amountIncl: 300 }),
    ];
    const tournaments = [
      mockDoc('t1', { entryFeeIncl: 3000, entryCount: 1, reentryFeeIncl: 0, reentryCount: 0, addonFeeIncl: 1000, addonCount: 2 }),
    ];

    const result = calculateAmounts({ items, extras, sideGameChips, tournaments });

    // items = 1000 + 500*3 = 2500, extras = 200, subTotal = 2700
    expect(result.subTotalIncl).toBe(2700);
    // sideGameChip purchase のみ = 500
    // tournaments = 3000*1 + 0 + 1000*2 = 5000
    // grandTotal = 2700 + 500 + 5000 = 8200
    expect(result.grandTotalIncl).toBe(8200);
    expect(result.grandTotalRounded).toBe(8200);
  });

  it('voided アイテムは合計から除外される', () => {
    const items = [
      mockDoc('i1', { totalPriceIncl: 1000 }),
      mockDoc('i2', { totalPriceIncl: 2000, voided: true }),
    ];
    const result = calculateAmounts({ items, extras: [], sideGameChips: [], tournaments: [] });
    expect(result.subTotalIncl).toBe(1000);
  });

  it('空の入力で全て 0 を返す', () => {
    const result = calculateAmounts({ items: [], extras: [], sideGameChips: [], tournaments: [] });
    expect(result.grandTotalIncl).toBe(0);
    expect(result.grandTotalRounded).toBe(0);
  });

  it('paymentTotals: /payments から直接集計できる', () => {
    const payments = [
      mockDoc('p1', { method: 'cash', amountIncl: 3000 }),
      mockDoc('p2', { method: 'credit_card', amountIncl: 5000 }),
      mockDoc('p3', { method: 'cash', amountIncl: 200 }),
    ];
    const totals = calculatePaymentTotals({
      paymentsDocs: payments,
      categoryBreakdown: {} as any,
    });
    expect(totals.cash).toBe(3200);
    expect(totals.credit_card).toBe(5000);
  });

  it('paymentsSummary: 支払額と残額が正しい', () => {
    const summary = calculatePaymentsSummary({
      paymentTotals: { cash: 3000, credit_card: 5000 },
      grandTotalRounded: 10000,
    });
    expect(summary.paidTotalIncl).toBe(8000);
    expect(summary.balanceDueIncl).toBe(2000);
  });

  it('sideGameChipsSummary: purchase/deposit/withdraw を分離集計できる', () => {
    const chips = [
      mockDoc('c1', { action: 'purchase', amountIncl: 100 }),
      mockDoc('c2', { action: 'deposit', amountIncl: 50 }),
      mockDoc('c3', { action: 'purchase', amountIncl: 200 }),
      mockDoc('c4', { action: 'withdraw', amountIncl: 30 }),
    ];
    const summary = buildSideGameChipsSummary(chips);
    expect(summary.purchased).toBe(300);
    expect(summary.deposited).toBe(50);
    expect(summary.withdrawn).toBe(30);
    expect(summary.net).toBe(300 + 50 - 30);
  });
});

// ---------- 3. 支払い分割 ----------

describe('3. 支払い分割 (paymentSplitCalculator)', () => {
  it('ポイント残高なし → 全額を baseMethod で支払う', () => {
    const result = calculatePaymentSplit({
      selectedBaseMethod: 'cash',
      bill: { items: 5000, extraCost: 1000 },
      balances: {},
    });
    expect(result.cashLikeAmount).toBe(6000);
    expect(Object.values(result.usedPoints).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('pointA が items カテゴリで使われる', () => {
    const result = calculatePaymentSplit({
      selectedBaseMethod: 'cash',
      bill: { items: 5000 },
      balances: { pointA: 2000 },
    });
    expect(result.usedPoints.pointA).toBe(2000);
    expect(result.cashLikeAmount).toBe(3000);
  });

  it('extraCost は cash/credit_card/electronic_money のみ（pointA 不可）', () => {
    const result = calculatePaymentSplit({
      selectedBaseMethod: 'cash',
      bill: { extraCost: 1000, items: 0 },
      balances: { pointA: 5000 },
    });
    expect(result.usedPoints.pointA ?? 0).toBe(0);
    expect(result.cashLikeAmount).toBe(1000);
  });

  it('無効な baseMethod はエラー', () => {
    expect(() =>
      calculatePaymentSplit({
        selectedBaseMethod: 'bitcoin' as any,
        bill: { items: 100 },
        balances: {},
      })
    ).toThrow('selectedBaseMethod must be one of');
  });

  it('sideGameChip ポイントは chipRate で円換算される', () => {
    const result = calculatePaymentSplit({
      selectedBaseMethod: 'cash',
      bill: { items: 10000 },
      balances: { sideGameChip: 100 },
      sideGameChipExchangeRate: 10,
    });
    // 100チップ * 10円 = 1000円分
    expect(result.usedPoints.sideGameChip).toBe(1000);
    expect(result.cashLikeAmount).toBe(9000);
  });
});

// ---------- 4. 営業日ヘルパー ----------

describe('4. 営業日ヘルパー (calcBusinessDateHelpers)', () => {
  it('convertToJst: UTC → JST (+9h)', () => {
    const utc = new Date('2025-11-10T00:00:00Z');
    const jst = convertToJst(utc);
    expect(jst.getUTCHours()).toBe(9);
    expect(jst.getUTCDate()).toBe(10);
  });

  it('convertToJst: UTC 15:00 → JST 翌日 0:00', () => {
    const utc = new Date('2025-11-10T15:00:00Z');
    const jst = convertToJst(utc);
    expect(jst.getUTCHours()).toBe(0);
    expect(jst.getUTCDate()).toBe(11);
  });

  it('formatMonthKey: YYYY-MM 形式', () => {
    const jst = convertToJst(new Date('2025-01-15T00:00:00Z'));
    expect(formatMonthKey(jst)).toBe('2025-01');
  });

  it('getPrevMonthKey: 年跨ぎ (1月→前年12月)', () => {
    expect(getPrevMonthKey('2025-01')).toBe('2024-12');
    expect(getPrevMonthKey('2025-06')).toBe('2025-05');
  });

  it('getNextMonthKey: 年跨ぎ (12月→翌年1月)', () => {
    expect(getNextMonthKey('2025-12')).toBe('2026-01');
    expect(getNextMonthKey('2025-06')).toBe('2025-07');
  });
});

// ---------- 5. contentHash ----------

describe('5. contentHash の決定論性', () => {
  const baseParams = {
    amounts: { subTotalIncl: 1000, discountTotalIncl: 0, serviceChargeIncl: 0, grandTotalIncl: 1000, roundingDelta: 0, grandTotalRounded: 1000 },
    categoryBreakdown: { items: 1000, extraCost: 0, sideGameChips: 0, tournaments: 0 } as any,
    itemsSnapshot: { items: [], totalCount: 0, truncated: false } as any,
    tournamentsSnapshot: {} as any,
    paymentTotals: { cash: 1000 },
  };

  it('同一入力 → 同一ハッシュ', () => {
    const hash1 = calculateContentHash(baseParams);
    const hash2 = calculateContentHash(baseParams);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('[既知問題] JSON.stringify replacer がネスト値を除外するため異なる入力で同一ハッシュになる', () => {
    const hash1 = calculateContentHash(baseParams);
    const hash2 = calculateContentHash({
      ...baseParams,
      paymentTotals: { cash: 999 },
    });
    // NOTE: calculateContentHash 内部で
    //   JSON.stringify(normalized, Object.keys(normalized).sort())
    // を使用しており、replacer 配列がトップレベルのキー
    // ['amounts','categoryBreakdown','itemsSnapshot','paymentTotals','tournamentsSnapshot']
    // のみを許可する。ネストされたオブジェクトにもこの制限が適用されるため、
    // 例えば paymentTotals: { cash: 1000 } の "cash" キーはシリアライズから除外される。
    // 結果として異なる入力でも同一ハッシュが出力される。
    // これは本番コードの潜在的バグだが、現時点では実コードを修正せず記録のみ行う。
    expect(hash1).toBe(hash2);
  });
});

// ---------- 6. getStoreConfig Firestore 統合 ----------

describe('6. getStoreConfig Firestore 統合', () => {
  const projectId = 'test-system-health';
  let db: admin.firestore.Firestore;

  const warnSpy = jest.spyOn(require('firebase-functions').logger, 'warn').mockImplementation(() => {});
  const errorSpy = jest.spyOn(require('firebase-functions').logger, 'error').mockImplementation(() => {});

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map(a => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
  });

  afterAll(async () => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    await Promise.all(admin.apps.map(a => a?.delete()).filter(Boolean));
  });

  beforeEach(async () => {
    warnSpy.mockClear();
    const ref = db.collection('storeMeta').doc('config');
    const snap = await ref.get();
    if (snap.exists) await ref.delete();
  });

  it('storeMeta/config が無い → defaults にフォールバックし warning が出る', async () => {
    const config = await getStoreConfig(db);
    expect(config.features?.dualWriteEnabled).toBe(DEFAULT_DUAL_WRITE_ENABLED);
    expect(config.billing?.sideGameChipRate).toBe(DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE);
    expect(warnSpy).toHaveBeenCalledWith('config_fallback', expect.objectContaining({
      reason: 'document_missing',
    }));
  });

  it('storeMeta/config に部分設定 → merge されて残りは defaults', async () => {
    await db.collection('storeMeta').doc('config').set({
      features: { dualWriteEnabled: true },
      billing: { entranceFee: 2000 },
    });
    const config = await getStoreConfig(db);
    expect(config.features?.dualWriteEnabled).toBe(true);
    expect(config.billing?.entranceFee).toBe(2000);
    // defaults からフォールバック
    expect(config.linePlan).toBe(DEFAULT_LINE_PLAN);
    expect(config.billing?.sideGameChipRate).toBe(DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE);
  });

  it('不正な型は無視して defaults が使われる', async () => {
    await db.collection('storeMeta').doc('config').set({
      features: { dualWriteEnabled: 'yes' },
      linePlan: 999,
    });
    const config = await getStoreConfig(db);
    expect(config.features?.dualWriteEnabled).toBe(DEFAULT_DUAL_WRITE_ENABLED);
    expect(config.linePlan).toBe(DEFAULT_LINE_PLAN);
  });

  it('全フィールドを上書き → 全て Firestore の値が使われる', async () => {
    await db.collection('storeMeta').doc('config').set({
      features: {
        dualWriteEnabled: true,
        enqueueSchedulerEnabled: true,
        templateBusinessDateCheck: true,
        settlementAggregatorEnabled: false,
        tableDeviceRegistrationEnabled: false,
      },
      autoOpenClose: { enabled: false, taskCloseOffsetMinutes: 60, taskOpenOffsetMinutes: -15 },
      businessDay: { calcBufferMinutes: 45 },
      billing: {
        entranceFee: 500,
        entranceFeeDescription: 'テスト',
        chargeEntranceFeeOnReentry: true,
        sideGameChipRate: 20,
        paymentPolicy: {
          categoryPaymentMethods: { items: ['cash'] },
          pointPriority: ['pointB'],
          roundingUnits: { pointAB: 500, sideGameChip: 50 },
        },
      },
      linePlan: 'standard',
      shift: { submissionStartDay: 5, submissionEndDay: 20, schedulingStartDay: 21 },
      payroll: { startDay: 1, endDay: 31 },
    });
    const config = await getStoreConfig(db);
    expect(config.features?.dualWriteEnabled).toBe(true);
    expect(config.features?.settlementAggregatorEnabled).toBe(false);
    expect(config.autoOpenClose?.enabled).toBe(false);
    expect(config.autoOpenClose?.taskCloseOffsetMinutes).toBe(60);
    expect(config.businessDay?.calcBufferMinutes).toBe(45);
    expect(config.billing?.entranceFee).toBe(500);
    expect(config.billing?.sideGameChipRate).toBe(20);
    expect(config.billing?.paymentPolicy?.pointPriority).toEqual(['pointB']);
    expect(config.linePlan).toBe('standard');
    expect(config.shift?.submissionStartDay).toBe(5);
    expect(config.payroll?.startDay).toBe(1);
    expect(config.payroll?.endDay).toBe(31);
  });
});
