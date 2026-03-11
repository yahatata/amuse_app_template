/**
 * Phase2 全量移行テスト
 *
 * storeMeta/config への参照切替が正しく動作することを検証する。
 * - configLoader.mergeWithDefaults: Firestore 値 + defaults.ts マージ
 * - buildFromDefaults: 全フィールドが defaults.ts の値で埋まること
 * - getter 関数群: nullable 対応とフォールバック
 * - 各移行先の呼び出しパターン: getStoreConfig() 経由で正しい値が取れること
 *
 * 参照: docs/config_migration/phase2/ALL_ID_STATUS.md
 */

jest.unmock('../../src/shared/config/configLoader');

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getStoreConfig, buildFromDefaults, getCalcBufferMinutes, getDualWriteEnabled, getLinePlan } from '../../src/shared/config/configLoader';
import {
  DEFAULT_AUTO_OPEN_CLOSE_ENABLED,
  DEFAULT_TASK_CLOSE_OFFSET_MINUTES,
  DEFAULT_TASK_OPEN_OFFSET_MINUTES,
  DEFAULT_BUSINESS_HOURS_STYLES,
  DEFAULT_CATEGORY_PAYMENT_METHODS,
  DEFAULT_POINT_PRIORITY,
  DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE,
  DEFAULT_POINT_AB_ROUNDING_UNIT,
  DEFAULT_SIDE_GAME_CHIP_ROUNDING_UNIT,
  DEFAULT_LINE_PLAN,
  DEFAULT_CALC_BUSINESS_DATE_BUFFER_MINUTES,
  DEFAULT_ENTRANCE_FEE,
  DEFAULT_ENTRANCE_FEE_DESCRIPTION,
  DEFAULT_CHARGE_ENTRANCE_FEE_ON_REENTRY,
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
  DEFAULT_DUAL_WRITE_ENABLED,
  DEFAULT_ENQUEUE_SCHEDULER_ENABLED,
  DEFAULT_TEMPLATE_BUSINESSDATE_CHECK,
  DEFAULT_SETTLEMENT_AGGREGATOR_ENABLED,
  DEFAULT_TABLE_DEVICE_REGISTRATION_ENABLED,
} from '../../src/shared/config/defaults';

if (admin.apps.length > 0) {
  for (const app of admin.apps) { if (app) app.delete(); }
}
admin.initializeApp({ projectId: 'test-phase2' });

const warnSpy = jest.spyOn(require('firebase-functions').logger, 'warn').mockImplementation(() => {});
const errorSpy = jest.spyOn(require('firebase-functions').logger, 'error').mockImplementation(() => {});

afterAll(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

// =====================================================================
// 1. buildFromDefaults: 全フィールドが defaults.ts の値で構築される
// =====================================================================
describe('buildFromDefaults: 全フィールド網羅チェック', () => {
  const config = buildFromDefaults();

  test('features フラグが defaults と一致', () => {
    expect(config.features?.dualWriteEnabled).toBe(DEFAULT_DUAL_WRITE_ENABLED);
    expect(config.features?.enqueueSchedulerEnabled).toBe(DEFAULT_ENQUEUE_SCHEDULER_ENABLED);
    expect(config.features?.templateBusinessDateCheck).toBe(DEFAULT_TEMPLATE_BUSINESSDATE_CHECK);
    expect(config.features?.settlementAggregatorEnabled).toBe(DEFAULT_SETTLEMENT_AGGREGATOR_ENABLED);
    expect(config.features?.tableDeviceRegistrationEnabled).toBe(DEFAULT_TABLE_DEVICE_REGISTRATION_ENABLED);
  });

  test('autoOpenClose が defaults と一致', () => {
    expect(config.autoOpenClose?.enabled).toBe(DEFAULT_AUTO_OPEN_CLOSE_ENABLED);
    expect(config.autoOpenClose?.taskCloseOffsetMinutes).toBe(DEFAULT_TASK_CLOSE_OFFSET_MINUTES);
    expect(config.autoOpenClose?.taskOpenOffsetMinutes).toBe(DEFAULT_TASK_OPEN_OFFSET_MINUTES);
  });

  test('businessDay.calcBufferMinutes が defaults と一致', () => {
    expect(config.businessDay?.calcBufferMinutes).toBe(DEFAULT_CALC_BUSINESS_DATE_BUFFER_MINUTES);
  });

  test('businessHoursStyles が defaults と一致', () => {
    expect(config.businessHoursStyles).toBeDefined();
    expect(config.businessHoursStyles!.weekday.openMinute).toBe(DEFAULT_BUSINESS_HOURS_STYLES.weekday.openMinute);
    expect(config.businessHoursStyles!.closed.isClosed).toBe(true);
    expect(Object.keys(config.businessHoursStyles!)).toEqual(Object.keys(DEFAULT_BUSINESS_HOURS_STYLES));
  });

  test('billing 系が defaults と一致', () => {
    expect(config.billing?.entranceFee).toBe(DEFAULT_ENTRANCE_FEE);
    expect(config.billing?.entranceFeeDescription).toBe(DEFAULT_ENTRANCE_FEE_DESCRIPTION);
    expect(config.billing?.chargeEntranceFeeOnReentry).toBe(DEFAULT_CHARGE_ENTRANCE_FEE_ON_REENTRY);
    expect(config.billing?.sideGameChipRate).toBe(DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE);
    expect(config.billing?.paymentPolicy?.categoryPaymentMethods).toEqual(DEFAULT_CATEGORY_PAYMENT_METHODS);
    expect(config.billing?.paymentPolicy?.pointPriority).toEqual(DEFAULT_POINT_PRIORITY);
    expect(config.billing?.paymentPolicy?.roundingUnits?.pointAB).toBe(DEFAULT_POINT_AB_ROUNDING_UNIT);
    expect(config.billing?.paymentPolicy?.roundingUnits?.sideGameChip).toBe(DEFAULT_SIDE_GAME_CHIP_ROUNDING_UNIT);
  });

  test('linePlan が defaults と一致', () => {
    expect(config.linePlan).toBe(DEFAULT_LINE_PLAN);
  });

  test('shift 系が defaults と一致', () => {
    expect(config.shift?.submissionStartDay).toBe(DEFAULT_SHIFT_SUBMISSION_START_DAY);
    expect(config.shift?.submissionEndDay).toBe(DEFAULT_SHIFT_SUBMISSION_END_DAY);
    expect(config.shift?.schedulingStartDay).toBe(DEFAULT_SHIFT_SCHEDULING_START_DAY);
  });

  test('payroll 系が defaults と一致', () => {
    expect(config.payroll?.startDay).toBe(DEFAULT_PAYROLL_START_DAY);
    expect(config.payroll?.endDay).toBe(DEFAULT_PAYROLL_END_DAY);
  });

  test('menuCategories が defaults と一致', () => {
    expect(config.menuCategories).toEqual(DEFAULT_MENU_CATEGORIES);
  });

  test('sideGameTypes が defaults と一致', () => {
    expect(config.sideGameTypes).toEqual(DEFAULT_SIDE_GAME_TYPES);
  });

  test('tournament が defaults と一致', () => {
    expect(config.tournament?.defaultPrizeRatio).toBe(DEFAULT_TOURNAMENT_PRIZE_RATIO);
    expect(config.tournament?.prizeReceiverPercentage).toBe(DEFAULT_TOURNAMENT_PRIZE_RECEIVER_PERCENTAGE);
    expect(config.tournament?.prizeRoundingMethod).toBe(DEFAULT_TOURNAMENT_PRIZE_ROUNDING_METHOD);
    expect(config.tournament?.prizeRoundingUnit).toBe(DEFAULT_TOURNAMENT_PRIZE_ROUNDING_UNIT);
    expect(config.tournament?.prizeDistribution?.['3']).toEqual([50.0, 30.0, 20.0]);
  });
});

// =====================================================================
// 2. getter 関数: nullable config からのフォールバック
// =====================================================================
describe('getter 関数: nullable 対応', () => {
  test('getCalcBufferMinutes: 値あり → その値', () => {
    expect(getCalcBufferMinutes({ businessDay: { calcBufferMinutes: 90 } })).toBe(90);
  });

  test('getCalcBufferMinutes: undefined → default', () => {
    expect(getCalcBufferMinutes({})).toBe(DEFAULT_CALC_BUSINESS_DATE_BUFFER_MINUTES);
  });

  test('getDualWriteEnabled: 値あり → その値', () => {
    expect(getDualWriteEnabled({ features: { dualWriteEnabled: true } })).toBe(true);
  });

  test('getDualWriteEnabled: undefined → default (false)', () => {
    expect(getDualWriteEnabled({})).toBe(DEFAULT_DUAL_WRITE_ENABLED);
  });

  test('getLinePlan: 値あり → その値', () => {
    expect(getLinePlan({ linePlan: 'standard' })).toBe('standard');
  });

  test('getLinePlan: undefined → default', () => {
    expect(getLinePlan({})).toBe(DEFAULT_LINE_PLAN);
  });
});

// =====================================================================
// 3. Emulator テスト: Firestore 値のマージ
// =====================================================================
describe('getStoreConfig with Firestore (emulator)', () => {
  const itWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? it : it.skip;
  const db = getFirestore();

  beforeEach(async () => {
    warnSpy.mockClear();
    const configRef = db.collection('storeMeta').doc('config');
    const snap = await configRef.get();
    if (snap.exists) await configRef.delete();
  });

  itWithEmulator('features フラグを Firestore から上書きできる', async () => {
    await db.collection('storeMeta').doc('config').set({
      features: {
        dualWriteEnabled: true,
        enqueueSchedulerEnabled: true,
        templateBusinessDateCheck: true,
        settlementAggregatorEnabled: false,
        tableDeviceRegistrationEnabled: false,
      },
    });

    const config = await getStoreConfig(db);
    expect(config.features?.dualWriteEnabled).toBe(true);
    expect(config.features?.enqueueSchedulerEnabled).toBe(true);
    expect(config.features?.templateBusinessDateCheck).toBe(true);
    expect(config.features?.settlementAggregatorEnabled).toBe(false);
    expect(config.features?.tableDeviceRegistrationEnabled).toBe(false);
  });

  itWithEmulator('autoOpenClose を Firestore から上書きできる', async () => {
    await db.collection('storeMeta').doc('config').set({
      autoOpenClose: {
        enabled: false,
        taskCloseOffsetMinutes: 90,
        taskOpenOffsetMinutes: -15,
      },
    });

    const config = await getStoreConfig(db);
    expect(config.autoOpenClose?.enabled).toBe(false);
    expect(config.autoOpenClose?.taskCloseOffsetMinutes).toBe(90);
    expect(config.autoOpenClose?.taskOpenOffsetMinutes).toBe(-15);
  });

  itWithEmulator('billing 系の部分上書き: 指定値のみ上書き・残りはデフォルト', async () => {
    await db.collection('storeMeta').doc('config').set({
      billing: {
        entranceFee: 2500,
        sideGameChipRate: 20.0,
      },
    });

    const config = await getStoreConfig(db);
    expect(config.billing?.entranceFee).toBe(2500);
    expect(config.billing?.sideGameChipRate).toBe(20.0);
    expect(config.billing?.entranceFeeDescription).toBe(DEFAULT_ENTRANCE_FEE_DESCRIPTION);
    expect(config.billing?.chargeEntranceFeeOnReentry).toBe(DEFAULT_CHARGE_ENTRANCE_FEE_ON_REENTRY);
  });

  itWithEmulator('billing.paymentPolicy を Firestore から上書きできる', async () => {
    await db.collection('storeMeta').doc('config').set({
      billing: {
        paymentPolicy: {
          categoryPaymentMethods: {
            extraCost: ['cash'],
            sideGameChip: ['cash', 'credit_card'],
            items: ['cash'],
            tournaments: ['cash'],
          },
          pointPriority: ['pointB', 'pointA'],
          roundingUnits: { pointAB: 500, sideGameChip: 50 },
        },
      },
    });

    const config = await getStoreConfig(db);
    expect(config.billing?.paymentPolicy?.categoryPaymentMethods?.extraCost).toEqual(['cash']);
    expect(config.billing?.paymentPolicy?.pointPriority).toEqual(['pointB', 'pointA']);
    expect(config.billing?.paymentPolicy?.roundingUnits?.pointAB).toBe(500);
    expect(config.billing?.paymentPolicy?.roundingUnits?.sideGameChip).toBe(50);
  });

  itWithEmulator('linePlan を Firestore から上書きできる（有効値のみ）', async () => {
    await db.collection('storeMeta').doc('config').set({ linePlan: 'standard' });
    const config = await getStoreConfig(db);
    expect(config.linePlan).toBe('standard');
  });

  itWithEmulator('linePlan: 無効値はデフォルトにフォールバック', async () => {
    await db.collection('storeMeta').doc('config').set({ linePlan: 'invalid_plan' });
    const config = await getStoreConfig(db);
    expect(config.linePlan).toBe(DEFAULT_LINE_PLAN);
    expect(warnSpy).toHaveBeenCalledWith('config_fallback', expect.objectContaining({
      configKey: 'linePlan',
      reason: 'invalid_value',
    }));
  });

  itWithEmulator('shift 系を Firestore から上書きできる', async () => {
    await db.collection('storeMeta').doc('config').set({
      shift: {
        submissionStartDay: 5,
        submissionEndDay: 20,
        schedulingStartDay: 21,
      },
    });

    const config = await getStoreConfig(db);
    expect(config.shift?.submissionStartDay).toBe(5);
    expect(config.shift?.submissionEndDay).toBe(20);
    expect(config.shift?.schedulingStartDay).toBe(21);
  });

  itWithEmulator('payroll 系を Firestore から上書きできる', async () => {
    await db.collection('storeMeta').doc('config').set({
      payroll: { startDay: 1, endDay: 31 },
    });

    const config = await getStoreConfig(db);
    expect(config.payroll?.startDay).toBe(1);
    expect(config.payroll?.endDay).toBe(31);
  });

  itWithEmulator('menuCategories を Firestore から上書きできる', async () => {
    await db.collection('storeMeta').doc('config').set({
      menuCategories: ['ドリンク', 'フード', 'デザート'],
    });

    const config = await getStoreConfig(db);
    expect(config.menuCategories).toEqual(['ドリンク', 'フード', 'デザート']);
  });

  itWithEmulator('menuCategories が空配列の場合はデフォルトにフォールバック', async () => {
    await db.collection('storeMeta').doc('config').set({
      menuCategories: [],
    });

    const config = await getStoreConfig(db);
    expect(config.menuCategories).toEqual(DEFAULT_MENU_CATEGORIES);
    // フォールバック時に config_fallback が menuCategories で呼ばれる
    const fallbackCalls = warnSpy.mock.calls.filter(
      (c) => c[0] === 'config_fallback' && (c[1] as any)?.configKey === 'menuCategories'
    );
    expect(fallbackCalls.length).toBeGreaterThanOrEqual(1);
  });

  itWithEmulator('sideGameTypes を Firestore から上書きできる', async () => {
    await db.collection('storeMeta').doc('config').set({
      sideGameTypes: ['ポーカー', 'バカラ'],
    });

    const config = await getStoreConfig(db);
    expect(config.sideGameTypes).toEqual(['ポーカー', 'バカラ']);
  });

  itWithEmulator('sideGameTypes が空配列の場合はデフォルトにフォールバック', async () => {
    await db.collection('storeMeta').doc('config').set({
      sideGameTypes: [],
    });

    const config = await getStoreConfig(db);
    expect(config.sideGameTypes).toEqual(DEFAULT_SIDE_GAME_TYPES);
  });

  itWithEmulator('businessDay.calcBufferMinutes を上書きできる', async () => {
    await db.collection('storeMeta').doc('config').set({
      businessDay: { calcBufferMinutes: 120 },
    });

    const config = await getStoreConfig(db);
    expect(config.businessDay?.calcBufferMinutes).toBe(120);
  });

  itWithEmulator('businessHoursStyles を Firestore から上書きできる', async () => {
    await db.collection('storeMeta').doc('config').set({
      businessHoursStyles: {
        weekday: { styleId: 'weekday', openMinute: 600, closeMinute: 1440, isClosed: false },
        closed: { styleId: 'closed', openMinute: 0, closeMinute: 0, isClosed: true },
      },
    });

    const config = await getStoreConfig(db);
    expect(config.businessHoursStyles?.weekday.openMinute).toBe(600);
    expect(config.businessHoursStyles?.weekday.closeMinute).toBe(1440);
    expect(config.businessHoursStyles?.closed.isClosed).toBe(true);
  });

  itWithEmulator('全フィールド同時上書き: config 全体が正しくマージされる', async () => {
    await db.collection('storeMeta').doc('config').set({
      features: { dualWriteEnabled: true, settlementAggregatorEnabled: false },
      autoOpenClose: { enabled: false, taskCloseOffsetMinutes: 60 },
      businessDay: { calcBufferMinutes: 30 },
      billing: { entranceFee: 0, sideGameChipRate: 5.0 },
      linePlan: 'light',
      shift: { submissionStartDay: 10 },
      payroll: { startDay: 1 },
      menuCategories: ['ドリンク', 'フード'],
      sideGameTypes: ['ポーカー', 'バカラ'],
    });

    const config = await getStoreConfig(db);
    expect(config.features?.dualWriteEnabled).toBe(true);
    expect(config.features?.settlementAggregatorEnabled).toBe(false);
    expect(config.features?.enqueueSchedulerEnabled).toBe(DEFAULT_ENQUEUE_SCHEDULER_ENABLED);
    expect(config.autoOpenClose?.enabled).toBe(false);
    expect(config.autoOpenClose?.taskCloseOffsetMinutes).toBe(60);
    expect(config.autoOpenClose?.taskOpenOffsetMinutes).toBe(DEFAULT_TASK_OPEN_OFFSET_MINUTES);
    expect(config.businessDay?.calcBufferMinutes).toBe(30);
    expect(config.billing?.entranceFee).toBe(0);
    expect(config.billing?.sideGameChipRate).toBe(5.0);
    expect(config.billing?.entranceFeeDescription).toBe(DEFAULT_ENTRANCE_FEE_DESCRIPTION);
    expect(config.linePlan).toBe('light');
    expect(config.shift?.submissionStartDay).toBe(10);
    expect(config.shift?.submissionEndDay).toBe(DEFAULT_SHIFT_SUBMISSION_END_DAY);
    expect(config.payroll?.startDay).toBe(1);
    expect(config.payroll?.endDay).toBe(DEFAULT_PAYROLL_END_DAY);
    expect(config.menuCategories).toEqual(['ドリンク', 'フード']);
    expect(config.sideGameTypes).toEqual(['ポーカー', 'バカラ']);
  });

  itWithEmulator('不正な型のフィールドはデフォルトにフォールバック', async () => {
    await db.collection('storeMeta').doc('config').set({
      billing: {
        entranceFee: 'not_a_number',
        sideGameChipRate: 'bad',
      },
      autoOpenClose: {
        enabled: 'not_bool',
      },
    });

    const config = await getStoreConfig(db);
    expect(config.billing?.entranceFee).toBe(DEFAULT_ENTRANCE_FEE);
    expect(config.billing?.sideGameChipRate).toBe(DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE);
    expect(config.autoOpenClose?.enabled).toBe(DEFAULT_AUTO_OPEN_CLOSE_ENABLED);
  });
});

// =====================================================================
// 4. businessHoursStyles 個別テスト
// =====================================================================
describe('getBusinessHoursByStyleId (styles.ts)', () => {
  const itWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? it : it.skip;
  const db = getFirestore();

  beforeEach(async () => {
    const configRef = db.collection('storeMeta').doc('config');
    const snap = await configRef.get();
    if (snap.exists) await configRef.delete();
  });

  itWithEmulator('storeMeta/config 未存在時、デフォルト styles から取得できる', async () => {
    const { getBusinessHoursByStyleId } = await import('../../src/shared/businessHours/services/styles');
    const style = await getBusinessHoursByStyleId('weekday');
    expect(style.styleId).toBe('weekday');
    expect(style.openMinute).toBe(DEFAULT_BUSINESS_HOURS_STYLES.weekday.openMinute);
  });

  itWithEmulator('存在しない styleId で throw', async () => {
    const { getBusinessHoursByStyleId } = await import('../../src/shared/businessHours/services/styles');
    await expect(getBusinessHoursByStyleId('nonexistent')).rejects.toThrow('Unknown styleId');
  });
});
