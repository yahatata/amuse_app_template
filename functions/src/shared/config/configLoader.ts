/**
 * storeMeta/config 取得層
 *
 * 読み取り優先度: ① storeMeta/config → ② defaults.ts
 * 未存在時・読み取り失敗時は defaults にフォールバック。デフォルトが正である場合が大多数であり、
 * 取得失敗時にエラーを出すよりデフォルトを返した方が蓄積データの観点で適切なため。
 *
 * 2-2 不具合対応: フォールバック時・読み取り失敗時にエラーコード（code）をログに含める。
 * クエリ例: jsonPayload.code=CONFIG_FALLBACK AND jsonPayload.configKey=features.settlementAggregatorEnabled
 *
 * 参照: docs/config_migration/phase1/PHASE1_FALLBACK_BEHAVIOR.md
 *       docs/運用時資料/設定/設定の不具合時の対応.md
 */

/** 設定関連ログのエラーコード（プロジェクト横断でクエリしやすくするため統一） */
export const CONFIG_ERROR_CODES = {
  /** フォールバック使用時（document_missing, field_missing, read_error_after_retries, invalid_value） */
  CONFIG_FALLBACK: 'CONFIG_FALLBACK',
  /** Firestore 読み取り失敗時 */
  CONFIG_READ_ERROR: 'CONFIG_READ_ERROR',
  /** 処理スキップ時（デフォルトで実行できず、画面警告表示する場合） */
  CONFIG_SKIP: 'CONFIG_SKIP',
} as const;

import type { Firestore } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

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
  DEFAULT_TOURNAMENT_PRIZE_DISTRIBUTION,
  DEFAULT_DUAL_WRITE_ENABLED,
  DEFAULT_ENQUEUE_SCHEDULER_ENABLED,
  DEFAULT_TEMPLATE_BUSINESSDATE_CHECK,
  DEFAULT_SETTLEMENT_AGGREGATOR_ENABLED,
  DEFAULT_TABLE_DEVICE_REGISTRATION_ENABLED,
} from './defaults';

import type { StoreConfig, StoreConfigRaw } from './types';

const MAX_RETRIES = 2;

/**
 * storeMeta/config を取得する。
 * 未存在時・読み取り失敗時は defaults にフォールバック（リトライ後も失敗時は defaults を返す）。
 */
export async function getStoreConfig(db?: Firestore): Promise<StoreConfig> {
  const firestore = db ?? getFirestore();
  const docRef = firestore.collection('storeMeta').doc('config');

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const doc = await docRef.get();
      if (!doc.exists) {
        logger.warn('config_fallback', {
          code: CONFIG_ERROR_CODES.CONFIG_FALLBACK,
          configKey: '*',
          fallbackSource: 'defaults.ts',
          reason: 'document_missing',
        });
        return buildFromDefaults();
      }
      const data = doc.data() as StoreConfigRaw | undefined;
      return mergeWithDefaults(data ?? {});
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        continue;
      }
      logger.error('config_read_error', {
        code: CONFIG_ERROR_CODES.CONFIG_READ_ERROR,
        reason: 'read_error',
        message: String(err instanceof Error ? err.message : err),
        error: String(lastError),
      });
      logger.warn('config_fallback', {
        code: CONFIG_ERROR_CODES.CONFIG_FALLBACK,
        configKey: '*',
        fallbackSource: 'defaults.ts',
        reason: 'read_error_after_retries',
      });
      return buildFromDefaults();
    }
  }
  return buildFromDefaults();
}

export function buildFromDefaults(): StoreConfig {
  return {
    features: {
      dualWriteEnabled: DEFAULT_DUAL_WRITE_ENABLED,
      enqueueSchedulerEnabled: DEFAULT_ENQUEUE_SCHEDULER_ENABLED,
      templateBusinessDateCheck: DEFAULT_TEMPLATE_BUSINESSDATE_CHECK,
      settlementAggregatorEnabled: DEFAULT_SETTLEMENT_AGGREGATOR_ENABLED,
      tableDeviceRegistrationEnabled: DEFAULT_TABLE_DEVICE_REGISTRATION_ENABLED,
    },
    autoOpenClose: {
      enabled: DEFAULT_AUTO_OPEN_CLOSE_ENABLED,
      taskCloseOffsetMinutes: DEFAULT_TASK_CLOSE_OFFSET_MINUTES,
      taskOpenOffsetMinutes: DEFAULT_TASK_OPEN_OFFSET_MINUTES,
    },
    businessDay: {
      calcBufferMinutes: DEFAULT_CALC_BUSINESS_DATE_BUFFER_MINUTES,
    },
    businessHoursStyles: { ...DEFAULT_BUSINESS_HOURS_STYLES },
    billing: {
      entranceFee: DEFAULT_ENTRANCE_FEE,
      entranceFeeDescription: DEFAULT_ENTRANCE_FEE_DESCRIPTION,
      chargeEntranceFeeOnReentry: DEFAULT_CHARGE_ENTRANCE_FEE_ON_REENTRY,
      sideGameChipRate: DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE,
      paymentPolicy: {
        categoryPaymentMethods: { ...DEFAULT_CATEGORY_PAYMENT_METHODS },
        pointPriority: [...DEFAULT_POINT_PRIORITY],
        roundingUnits: {
          pointAB: DEFAULT_POINT_AB_ROUNDING_UNIT,
          sideGameChip: DEFAULT_SIDE_GAME_CHIP_ROUNDING_UNIT,
        },
      },
    },
    linePlan: DEFAULT_LINE_PLAN,
    shift: {
      submissionStartDay: DEFAULT_SHIFT_SUBMISSION_START_DAY,
      submissionEndDay: DEFAULT_SHIFT_SUBMISSION_END_DAY,
      schedulingStartDay: DEFAULT_SHIFT_SCHEDULING_START_DAY,
    },
    payroll: {
      startDay: DEFAULT_PAYROLL_START_DAY,
      endDay: DEFAULT_PAYROLL_END_DAY,
    },
    menuCategories: [...DEFAULT_MENU_CATEGORIES],
    sideGameTypes: [...DEFAULT_SIDE_GAME_TYPES],
    tournament: {
      defaultPrizeRatio: DEFAULT_TOURNAMENT_PRIZE_RATIO,
      prizeReceiverPercentage: DEFAULT_TOURNAMENT_PRIZE_RECEIVER_PERCENTAGE,
      prizeRoundingMethod: DEFAULT_TOURNAMENT_PRIZE_ROUNDING_METHOD,
      prizeRoundingUnit: DEFAULT_TOURNAMENT_PRIZE_ROUNDING_UNIT,
      prizeDistribution: Object.fromEntries(
        Object.entries(DEFAULT_TOURNAMENT_PRIZE_DISTRIBUTION).map(([k, v]) => [String(k), v])
      ),
    },
  };
}

function mergeWithDefaults(raw: StoreConfigRaw): StoreConfig {
  const result = buildFromDefaults();

  // features
  const features = raw.features as Record<string, unknown> | undefined;
  if (features && typeof features === 'object') {
    if (typeof features.dualWriteEnabled === 'boolean') result.features!.dualWriteEnabled = features.dualWriteEnabled;
    else logFallback('features.dualWriteEnabled', 'field_missing', result.features!.dualWriteEnabled);
    if (typeof features.enqueueSchedulerEnabled === 'boolean') result.features!.enqueueSchedulerEnabled = features.enqueueSchedulerEnabled;
    else logFallback('features.enqueueSchedulerEnabled', 'field_missing', result.features!.enqueueSchedulerEnabled);
    if (typeof features.templateBusinessDateCheck === 'boolean') result.features!.templateBusinessDateCheck = features.templateBusinessDateCheck;
    else logFallback('features.templateBusinessDateCheck', 'field_missing', result.features!.templateBusinessDateCheck);
    if (typeof features.settlementAggregatorEnabled === 'boolean') result.features!.settlementAggregatorEnabled = features.settlementAggregatorEnabled;
    else logFallback('features.settlementAggregatorEnabled', 'field_missing', result.features!.settlementAggregatorEnabled);
    if (typeof features.tableDeviceRegistrationEnabled === 'boolean') result.features!.tableDeviceRegistrationEnabled = features.tableDeviceRegistrationEnabled;
    else logFallback('features.tableDeviceRegistrationEnabled', 'field_missing', result.features!.tableDeviceRegistrationEnabled);
  } else {
    logFallback('features', 'field_missing', result.features);
  }

  // autoOpenClose
  const autoOpenClose = raw.autoOpenClose as Record<string, unknown> | undefined;
  if (autoOpenClose && typeof autoOpenClose === 'object') {
    if (typeof autoOpenClose.enabled === 'boolean') result.autoOpenClose!.enabled = autoOpenClose.enabled;
    else logFallback('autoOpenClose.enabled', 'field_missing', result.autoOpenClose!.enabled);
    if (typeof autoOpenClose.taskCloseOffsetMinutes === 'number') result.autoOpenClose!.taskCloseOffsetMinutes = autoOpenClose.taskCloseOffsetMinutes;
    else logFallback('autoOpenClose.taskCloseOffsetMinutes', 'field_missing', result.autoOpenClose!.taskCloseOffsetMinutes);
    if (typeof autoOpenClose.taskOpenOffsetMinutes === 'number') result.autoOpenClose!.taskOpenOffsetMinutes = autoOpenClose.taskOpenOffsetMinutes;
    else logFallback('autoOpenClose.taskOpenOffsetMinutes', 'field_missing', result.autoOpenClose!.taskOpenOffsetMinutes);
  } else {
    logFallback('autoOpenClose', 'field_missing', result.autoOpenClose);
  }

  // businessDay
  const businessDay = raw.businessDay as Record<string, unknown> | undefined;
  if (businessDay && typeof businessDay === 'object' && typeof businessDay.calcBufferMinutes === 'number') {
    result.businessDay!.calcBufferMinutes = businessDay.calcBufferMinutes;
  } else if (!businessDay || typeof businessDay?.calcBufferMinutes !== 'number') {
    logFallback('businessDay.calcBufferMinutes', 'field_missing', result.businessDay!.calcBufferMinutes);
  }

  // businessHoursStyles - 複雑なため一旦デフォルトを優先（部分マージは省略）
  const bhs = raw.businessHoursStyles as Record<string, unknown> | undefined;
  if (bhs && typeof bhs === 'object' && Object.keys(bhs).length > 0) {
    const merged: Record<string, { styleId: string; openMinute: number; closeMinute: number; isClosed: boolean }> = { ...DEFAULT_BUSINESS_HOURS_STYLES };
    for (const k of ['weekday', 'weekendHoliday', 'event', 'allDay', 'closed']) {
      const v = bhs[k] as Record<string, unknown> | undefined;
      if (v && typeof v.styleId === 'string' && typeof v.openMinute === 'number' && typeof v.closeMinute === 'number' && typeof v.isClosed === 'boolean') {
        merged[k] = { styleId: v.styleId, openMinute: v.openMinute, closeMinute: v.closeMinute, isClosed: v.isClosed };
      }
    }
    result.businessHoursStyles = merged;
  }

  // billing
  const billing = raw.billing as Record<string, unknown> | undefined;
  if (billing && typeof billing === 'object') {
    if (typeof billing.entranceFee === 'number') result.billing!.entranceFee = billing.entranceFee;
    else logFallback('billing.entranceFee', 'field_missing', result.billing!.entranceFee);
    if (typeof billing.entranceFeeDescription === 'string') result.billing!.entranceFeeDescription = billing.entranceFeeDescription;
    else logFallback('billing.entranceFeeDescription', 'field_missing', result.billing!.entranceFeeDescription);
    if (typeof billing.chargeEntranceFeeOnReentry === 'boolean') result.billing!.chargeEntranceFeeOnReentry = billing.chargeEntranceFeeOnReentry;
    else logFallback('billing.chargeEntranceFeeOnReentry', 'field_missing', result.billing!.chargeEntranceFeeOnReentry);
    if (typeof billing.sideGameChipRate === 'number') result.billing!.sideGameChipRate = billing.sideGameChipRate;
    else logFallback('billing.sideGameChipRate', 'field_missing', result.billing!.sideGameChipRate);
    const pp = billing.paymentPolicy as Record<string, unknown> | undefined;
    if (pp && typeof pp === 'object') {
      if (pp.categoryPaymentMethods && typeof pp.categoryPaymentMethods === 'object') {
        result.billing!.paymentPolicy!.categoryPaymentMethods = pp.categoryPaymentMethods as Record<string, string[]>;
      } else logFallback('billing.paymentPolicy.categoryPaymentMethods', 'field_missing', result.billing!.paymentPolicy!.categoryPaymentMethods);
      if (Array.isArray(pp.pointPriority)) result.billing!.paymentPolicy!.pointPriority = pp.pointPriority as string[];
      else logFallback('billing.paymentPolicy.pointPriority', 'field_missing', result.billing!.paymentPolicy!.pointPriority);
      const ru = pp.roundingUnits as Record<string, unknown> | undefined;
      if (ru && typeof ru === 'object') {
        if (typeof ru.pointAB === 'number') result.billing!.paymentPolicy!.roundingUnits!.pointAB = ru.pointAB;
        if (typeof ru.sideGameChip === 'number') result.billing!.paymentPolicy!.roundingUnits!.sideGameChip = ru.sideGameChip;
      }
    }
  } else {
    logFallback('billing', 'field_missing', result.billing);
  }

  // linePlan
  if (typeof raw.linePlan === 'string' && ['communication', 'light', 'standard'].includes(raw.linePlan)) {
    result.linePlan = raw.linePlan;
  } else if (raw.linePlan !== undefined && raw.linePlan !== null) {
    logFallback('linePlan', 'invalid_value', result.linePlan);
  } else {
    logFallback('linePlan', 'field_missing', result.linePlan);
  }

  // shift
  const shift = raw.shift as Record<string, unknown> | undefined;
  if (shift && typeof shift === 'object') {
    if (typeof shift.submissionStartDay === 'number') result.shift!.submissionStartDay = shift.submissionStartDay;
    else logFallback('shift.submissionStartDay', 'field_missing', result.shift!.submissionStartDay);
    if (typeof shift.submissionEndDay === 'number') result.shift!.submissionEndDay = shift.submissionEndDay;
    else logFallback('shift.submissionEndDay', 'field_missing', result.shift!.submissionEndDay);
    if (typeof shift.schedulingStartDay === 'number') result.shift!.schedulingStartDay = shift.schedulingStartDay;
    else logFallback('shift.schedulingStartDay', 'field_missing', result.shift!.schedulingStartDay);
  } else {
    logFallback('shift', 'field_missing', result.shift);
  }

  // payroll
  const payroll = raw.payroll as Record<string, unknown> | undefined;
  if (payroll && typeof payroll === 'object') {
    if (typeof payroll.startDay === 'number') result.payroll!.startDay = payroll.startDay;
    else logFallback('payroll.startDay', 'field_missing', result.payroll!.startDay);
    if (typeof payroll.endDay === 'number') result.payroll!.endDay = payroll.endDay;
    else logFallback('payroll.endDay', 'field_missing', result.payroll!.endDay);
  } else {
    logFallback('payroll', 'field_missing', result.payroll);
  }

  // menuCategories
  if (Array.isArray(raw.menuCategories) && raw.menuCategories.length > 0) {
    result.menuCategories = raw.menuCategories.filter((x): x is string => typeof x === 'string');
  } else {
    logFallback('menuCategories', 'field_missing', result.menuCategories);
  }

  // sideGameTypes
  if (Array.isArray(raw.sideGameTypes) && raw.sideGameTypes.length > 0) {
    result.sideGameTypes = raw.sideGameTypes.filter((x): x is string => typeof x === 'string');
  } else {
    logFallback('sideGameTypes', 'field_missing', result.sideGameTypes);
  }

  // tournament
  const tRaw = raw.tournament as Record<string, unknown> | undefined;
  if (tRaw && typeof tRaw === 'object') {
    if (typeof tRaw.defaultPrizeRatio === 'number' && tRaw.defaultPrizeRatio >= 0 && tRaw.defaultPrizeRatio <= 1) {
      result.tournament!.defaultPrizeRatio = tRaw.defaultPrizeRatio;
    } else {
      logFallback('tournament.defaultPrizeRatio', 'field_missing', result.tournament!.defaultPrizeRatio);
    }
    if (typeof tRaw.prizeReceiverPercentage === 'number' && tRaw.prizeReceiverPercentage >= 1 && tRaw.prizeReceiverPercentage <= 100) {
      result.tournament!.prizeReceiverPercentage = tRaw.prizeReceiverPercentage;
    } else {
      logFallback('tournament.prizeReceiverPercentage', 'field_missing', result.tournament!.prizeReceiverPercentage);
    }
    if (typeof tRaw.prizeRoundingMethod === 'string' && ['floor', 'ceil', 'round'].includes(tRaw.prizeRoundingMethod)) {
      result.tournament!.prizeRoundingMethod = tRaw.prizeRoundingMethod;
    } else {
      logFallback('tournament.prizeRoundingMethod', 'field_missing', result.tournament!.prizeRoundingMethod);
    }
    const validRoundingUnits = [1, 10, 100, 1000];
    if (typeof tRaw.prizeRoundingUnit === 'number' && validRoundingUnits.includes(tRaw.prizeRoundingUnit)) {
      result.tournament!.prizeRoundingUnit = tRaw.prizeRoundingUnit;
    } else {
      logFallback('tournament.prizeRoundingUnit', 'field_missing', result.tournament!.prizeRoundingUnit);
    }
    const pd = tRaw.prizeDistribution as Record<string, unknown> | undefined;
    if (pd && typeof pd === 'object' && Object.keys(pd).length > 0) {
      const parsed: Record<string, number[]> = {};
      for (const [k, v] of Object.entries(pd)) {
        if (Array.isArray(v) && v.every((x) => typeof x === 'number')) {
          parsed[String(k)] = v as number[];
        }
      }
      if (Object.keys(parsed).length > 0) {
        result.tournament!.prizeDistribution = parsed;
      } else {
        logFallback('tournament.prizeDistribution', 'field_missing', result.tournament!.prizeDistribution);
      }
    } else {
      logFallback('tournament.prizeDistribution', 'field_missing', result.tournament!.prizeDistribution);
    }
  } else {
    logFallback('tournament', 'field_missing', result.tournament);
  }

  return result;
}

/**
 * 既存 config に不足フィールドを defaults から補完する（上書きしない）。
 * initializeStoreConfigCallable で config が既存の場合に使用。存在しないフィールドのみデフォルトで追加。
 */
export function mergeConfigForUpsert(
  existing: Record<string, unknown> | undefined,
  defaults: StoreConfig
): Record<string, unknown> {
  const ex = existing ?? {};
  const out: Record<string, unknown> = {};

  // features
  const featDef = defaults.features!;
  const featEx = ex.features as Record<string, unknown> | undefined;
  out.features = {
    dualWriteEnabled: typeof featEx?.dualWriteEnabled === 'boolean' ? featEx.dualWriteEnabled : featDef.dualWriteEnabled,
    enqueueSchedulerEnabled: typeof featEx?.enqueueSchedulerEnabled === 'boolean' ? featEx.enqueueSchedulerEnabled : featDef.enqueueSchedulerEnabled,
    templateBusinessDateCheck: typeof featEx?.templateBusinessDateCheck === 'boolean' ? featEx.templateBusinessDateCheck : featDef.templateBusinessDateCheck,
    settlementAggregatorEnabled: typeof featEx?.settlementAggregatorEnabled === 'boolean' ? featEx.settlementAggregatorEnabled : featDef.settlementAggregatorEnabled,
    tableDeviceRegistrationEnabled: typeof featEx?.tableDeviceRegistrationEnabled === 'boolean' ? featEx.tableDeviceRegistrationEnabled : featDef.tableDeviceRegistrationEnabled,
  };

  // autoOpenClose
  const aocDef = defaults.autoOpenClose!;
  const aocEx = ex.autoOpenClose as Record<string, unknown> | undefined;
  out.autoOpenClose = {
    enabled: typeof aocEx?.enabled === 'boolean' ? aocEx.enabled : aocDef.enabled,
    taskCloseOffsetMinutes: typeof aocEx?.taskCloseOffsetMinutes === 'number' ? aocEx.taskCloseOffsetMinutes : aocDef.taskCloseOffsetMinutes,
    taskOpenOffsetMinutes: typeof aocEx?.taskOpenOffsetMinutes === 'number' ? aocEx.taskOpenOffsetMinutes : aocDef.taskOpenOffsetMinutes,
  };

  // businessDay
  const bdDef = defaults.businessDay!;
  const bdEx = ex.businessDay as Record<string, unknown> | undefined;
  out.businessDay = {
    calcBufferMinutes: typeof bdEx?.calcBufferMinutes === 'number' ? bdEx.calcBufferMinutes : bdDef.calcBufferMinutes,
  };

  // businessHoursStyles
  const bhsDef = defaults.businessHoursStyles!;
  const bhsEx = ex.businessHoursStyles as Record<string, unknown> | undefined;
  const bhsMerged: Record<string, unknown> = {};
  for (const k of ['weekday', 'weekendHoliday', 'event', 'allDay', 'closed']) {
    const vEx = bhsEx?.[k] as Record<string, unknown> | undefined;
    const vDef = bhsDef[k] as { styleId: string; openMinute: number; closeMinute: number; isClosed: boolean };
    if (vEx && typeof vEx.styleId === 'string' && typeof vEx.openMinute === 'number' && typeof vEx.closeMinute === 'number' && typeof vEx.isClosed === 'boolean') {
      bhsMerged[k] = vEx;
    } else {
      bhsMerged[k] = vDef;
    }
  }
  out.businessHoursStyles = bhsMerged;

  // billing
  const bilDef = defaults.billing!;
  const bilEx = ex.billing as Record<string, unknown> | undefined;
  const ppDef = bilDef.paymentPolicy!;
  const ppEx = bilEx?.paymentPolicy as Record<string, unknown> | undefined;
  const ruDef = ppDef.roundingUnits!;
  const ruEx = ppEx?.roundingUnits as Record<string, unknown> | undefined;
  out.billing = {
    entranceFee: typeof bilEx?.entranceFee === 'number' ? bilEx.entranceFee : bilDef.entranceFee,
    entranceFeeDescription: typeof bilEx?.entranceFeeDescription === 'string' ? bilEx.entranceFeeDescription : bilDef.entranceFeeDescription,
    chargeEntranceFeeOnReentry: typeof bilEx?.chargeEntranceFeeOnReentry === 'boolean' ? bilEx.chargeEntranceFeeOnReentry : bilDef.chargeEntranceFeeOnReentry,
    sideGameChipRate: typeof bilEx?.sideGameChipRate === 'number' ? bilEx.sideGameChipRate : bilDef.sideGameChipRate,
    paymentPolicy: {
      categoryPaymentMethods: ppEx && ppEx.categoryPaymentMethods && typeof ppEx.categoryPaymentMethods === 'object'
        ? ppEx.categoryPaymentMethods
        : ppDef.categoryPaymentMethods,
      pointPriority: ppEx && Array.isArray(ppEx.pointPriority) ? ppEx.pointPriority : ppDef.pointPriority,
      roundingUnits: {
        pointAB: typeof ruEx?.pointAB === 'number' ? ruEx.pointAB : ruDef.pointAB,
        sideGameChip: typeof ruEx?.sideGameChip === 'number' ? ruEx.sideGameChip : ruDef.sideGameChip,
      },
    },
  };

  // linePlan
  out.linePlan = typeof ex.linePlan === 'string' && ['communication', 'light', 'standard'].includes(ex.linePlan)
    ? ex.linePlan
    : defaults.linePlan;

  // shift（requiredStaffByTimeSlot は storeMeta/requiredStaffByTimeSlot に分離済みのため config には含めない）
  const shiftDef = defaults.shift!;
  const shiftEx = ex.shift as Record<string, unknown> | undefined;
  out.shift = {
    submissionStartDay: typeof shiftEx?.submissionStartDay === 'number' ? shiftEx.submissionStartDay : shiftDef.submissionStartDay,
    submissionEndDay: typeof shiftEx?.submissionEndDay === 'number' ? shiftEx.submissionEndDay : shiftDef.submissionEndDay,
    schedulingStartDay: typeof shiftEx?.schedulingStartDay === 'number' ? shiftEx.schedulingStartDay : shiftDef.schedulingStartDay,
  };

  // payroll
  const prDef = defaults.payroll!;
  const prEx = ex.payroll as Record<string, unknown> | undefined;
  out.payroll = {
    startDay: typeof prEx?.startDay === 'number' ? prEx.startDay : prDef.startDay,
    endDay: typeof prEx?.endDay === 'number' ? prEx.endDay : prDef.endDay,
  };

  // menuCategories
  const menuCatEx = ex.menuCategories;
  out.menuCategories =
    Array.isArray(menuCatEx) && menuCatEx.length > 0
      ? menuCatEx
      : (defaults.menuCategories ?? DEFAULT_MENU_CATEGORIES);

  // sideGameTypes
  const sideGameEx = ex.sideGameTypes;
  out.sideGameTypes =
    Array.isArray(sideGameEx) && sideGameEx.length > 0
      ? sideGameEx
      : (defaults.sideGameTypes ?? DEFAULT_SIDE_GAME_TYPES);

  // tournament
  const tourDef = defaults.tournament!;
  const tourEx = ex.tournament as Record<string, unknown> | undefined;
  const pdEx = tourEx?.prizeDistribution as Record<string, unknown> | undefined;
  const pdValid =
    pdEx &&
    typeof pdEx === 'object' &&
    Object.keys(pdEx).length > 0 &&
    Object.entries(pdEx).every(
      ([, v]) => Array.isArray(v) && (v as unknown[]).every((x) => typeof x === 'number')
    );
  out.tournament = {
    defaultPrizeRatio:
      typeof tourEx?.defaultPrizeRatio === 'number' &&
      tourEx.defaultPrizeRatio >= 0 &&
      tourEx.defaultPrizeRatio <= 1
        ? tourEx.defaultPrizeRatio
        : tourDef.defaultPrizeRatio,
    prizeReceiverPercentage:
      typeof tourEx?.prizeReceiverPercentage === 'number' &&
      tourEx.prizeReceiverPercentage >= 1 &&
      tourEx.prizeReceiverPercentage <= 100
        ? tourEx.prizeReceiverPercentage
        : tourDef.prizeReceiverPercentage,
    prizeRoundingMethod:
      typeof tourEx?.prizeRoundingMethod === 'string' &&
      ['floor', 'ceil', 'round'].includes(tourEx.prizeRoundingMethod)
        ? tourEx.prizeRoundingMethod
        : tourDef.prizeRoundingMethod,
    prizeRoundingUnit:
      typeof tourEx?.prizeRoundingUnit === 'number' &&
      [1, 10, 100, 1000].includes(tourEx.prizeRoundingUnit)
        ? tourEx.prizeRoundingUnit
        : tourDef.prizeRoundingUnit,
    prizeDistribution: pdValid ? (pdEx as Record<string, number[]>) : tourDef.prizeDistribution,
  };

  return out;
}

function logFallback(configKey: string, reason: string, fallbackValue?: unknown): void {
  logger.warn('config_fallback', {
    code: CONFIG_ERROR_CODES.CONFIG_FALLBACK,
    configKey,
    fallbackSource: 'defaults.ts',
    fallbackValue,
    reason,
  });
}

// ---------------------------------------------------------------------------
// getter 関数群（利便性のため）
// ---------------------------------------------------------------------------

export function getAutoOpenCloseEnabled(config: StoreConfig): boolean {
  return config.autoOpenClose?.enabled ?? DEFAULT_AUTO_OPEN_CLOSE_ENABLED;
}

export function getTaskCloseOffsetMinutes(config: StoreConfig): number {
  return config.autoOpenClose?.taskCloseOffsetMinutes ?? DEFAULT_TASK_CLOSE_OFFSET_MINUTES;
}

export function getTaskOpenOffsetMinutes(config: StoreConfig): number {
  return config.autoOpenClose?.taskOpenOffsetMinutes ?? DEFAULT_TASK_OPEN_OFFSET_MINUTES;
}

export function getCalcBufferMinutes(config: StoreConfig): number {
  return config.businessDay?.calcBufferMinutes ?? DEFAULT_CALC_BUSINESS_DATE_BUFFER_MINUTES;
}

export function getDualWriteEnabled(config: StoreConfig): boolean {
  return config.features?.dualWriteEnabled ?? DEFAULT_DUAL_WRITE_ENABLED;
}

export function getEntranceFee(config: StoreConfig): number {
  return config.billing?.entranceFee ?? DEFAULT_ENTRANCE_FEE;
}

export function getLinePlan(config: StoreConfig): string {
  return config.linePlan ?? DEFAULT_LINE_PLAN;
}
