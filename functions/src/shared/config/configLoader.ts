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

import { logOpsError, logOpsSuccess } from '../logging/logOpsError';

import {
  DEFAULT_AUTO_OPEN_CLOSE_ENABLED,
  DEFAULT_TASK_CLOSE_OFFSET_MINUTES,
  DEFAULT_TASK_OPEN_OFFSET_MINUTES,
  DEFAULT_ALREADY_RUNNING_DIFFERENT_DATE_RECHECK_MINUTES,
  DEFAULT_BUSINESS_HOURS_STYLES,
  DEFAULT_CATEGORY_PAYMENT_METHODS,
  DEFAULT_CATEGORY_ORDER,
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
  DEFAULT_NIGHT_WORK_START_HOUR,
  DEFAULT_NIGHT_WORK_END_HOUR,
  DEFAULT_MENU_CATEGORIES,
  DEFAULT_SIDE_GAME_TYPES,
  DEFAULT_TOURNAMENT_PRIZE_RATIO,
  DEFAULT_TOURNAMENT_PRIZE_RECEIVER_PERCENTAGE,
  DEFAULT_TOURNAMENT_PRIZE_ROUNDING_METHOD,
  DEFAULT_TOURNAMENT_PRIZE_ROUNDING_UNIT,
  DEFAULT_TOURNAMENT_PRIZE_DISTRIBUTION,
  DEFAULT_TOURNAMENT_LIFF_REGISTRATION_ENABLED,
  DEFAULT_TOURNAMENT_LIFF_CALENDAR_ENABLED,
  DEFAULT_DUAL_WRITE_ENABLED,
  DEFAULT_ENQUEUE_SCHEDULER_ENABLED,
  DEFAULT_TEMPLATE_BUSINESSDATE_CHECK,
  DEFAULT_SETTLEMENT_AGGREGATOR_ENABLED,
  DEFAULT_TABLE_DEVICE_REGISTRATION_ENABLED,
  DEFAULT_CREATE_ATTENDANCE_BY_MANUAL,
  DEFAULT_REPORTING_AGGREGATOR_ENABLED,
  DEFAULT_ATTENDANCE_TIME_ADJUSTMENT_ENABLED,
  DEFAULT_ATTENDANCE_TIME_ADJUSTMENT_MAX_FUTURE_MINUTES,
  DEFAULT_ATTENDANCE_TIME_ADJUSTMENT_MAX_PAST_MINUTES,
  DEFAULT_OKIBAKE_LOGIN_PROMPT_MODE,
} from './defaults';

import type { OkibakeLoginPromptMode, StoreConfig, StoreConfigRaw } from './types';

const MAX_RETRIES = 2;

/**
 * storeMeta/config を取得する。
 * 未存在時・読み取り失敗時は defaults にフォールバック（リトライ後も失敗時は defaults を返す）。
 */
export async function getStoreConfig(db?: Firestore): Promise<StoreConfig> {
  logger.info('getStoreConfig: storeMeta/config の取得を開始');
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
        logOpsSuccess({
          message: 'getStoreConfig 成功',
          functionEntry: 'getStoreConfig',
          operation: 'config_read',
          context: {
            code: CONFIG_ERROR_CODES.CONFIG_FALLBACK,
            reason: 'document_missing',
            fromConfig: [] as string[],
            fromDefaults: ['*'] as string[],
          },
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
      logOpsError({
        message: 'config_read_error',
        functionEntry: 'getStoreConfig',
        operation: 'config_read',
        cause: lastError,
        sourceProductHint: 'firestore',
        context: {
          code: CONFIG_ERROR_CODES.CONFIG_READ_ERROR,
          reason: 'read_error',
          message: String(err instanceof Error ? err.message : err),
        },
      });
      logger.warn('config_fallback', {
        code: CONFIG_ERROR_CODES.CONFIG_FALLBACK,
        configKey: '*',
        fallbackSource: 'defaults.ts',
        reason: 'read_error_after_retries',
      });
      logOpsSuccess({
        message: 'getStoreConfig 成功',
        functionEntry: 'getStoreConfig',
        operation: 'config_read',
        context: {
          code: CONFIG_ERROR_CODES.CONFIG_FALLBACK,
          reason: 'read_error_after_retries',
          fromConfig: [] as string[],
          fromDefaults: ['*'] as string[],
        },
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
      createAttendanceByManual: DEFAULT_CREATE_ATTENDANCE_BY_MANUAL,
      reportingAggregatorEnabled: DEFAULT_REPORTING_AGGREGATOR_ENABLED,
    },
    attendanceTimeAdjustment: {
      enabled: DEFAULT_ATTENDANCE_TIME_ADJUSTMENT_ENABLED,
      maxFutureMinutes: DEFAULT_ATTENDANCE_TIME_ADJUSTMENT_MAX_FUTURE_MINUTES,
      maxPastMinutes: DEFAULT_ATTENDANCE_TIME_ADJUSTMENT_MAX_PAST_MINUTES,
    },
    autoOpenClose: {
      enabled: DEFAULT_AUTO_OPEN_CLOSE_ENABLED,
      taskCloseOffsetMinutes: DEFAULT_TASK_CLOSE_OFFSET_MINUTES,
      taskOpenOffsetMinutes: DEFAULT_TASK_OPEN_OFFSET_MINUTES,
      alreadyRunningDifferentDateRecheckMinutes:
        DEFAULT_ALREADY_RUNNING_DIFFERENT_DATE_RECHECK_MINUTES,
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
        categoryOrder: [...DEFAULT_CATEGORY_ORDER],
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
    attendance: {
      nightWorkStartHour: DEFAULT_NIGHT_WORK_START_HOUR,
      nightWorkEndHour: DEFAULT_NIGHT_WORK_END_HOUR,
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
      liffRegistrationEnabled: DEFAULT_TOURNAMENT_LIFF_REGISTRATION_ENABLED,
      liffCalendarEnabled: DEFAULT_TOURNAMENT_LIFF_CALENDAR_ENABLED,
    },
    okibake: {
      loginPromptMode: DEFAULT_OKIBAKE_LOGIN_PROMPT_MODE as OkibakeLoginPromptMode,
    },
  };
}

/**
 * Firestore の生ドキュメント断片と defaults をマージする内部処理。
 *
 * 【export している理由】Jest 等での config フォールバック単体テストが、Emulator に依存せず
 * `mergeWithDefaults(raw)` を直接検証できるようにするため。**ドメインの業務ロジックや
 * Callable から import して使うことを想定していない**（正規経路は getStoreConfig や
 * mergeConfigForUpsert）。
 */
export function mergeWithDefaults(raw: StoreConfigRaw): StoreConfig {
  const result = buildFromDefaults();
  const fromConfig: string[] = [];
  const fromDefaults: string[] = [];
  const fb = (key: string, reason: string, val?: unknown) => {
    fromDefaults.push(key);
    logFallback(key, reason, val);
  };

  // features
  const features = raw.features as Record<string, unknown> | undefined;
  if (features && typeof features === 'object') {
    if (typeof features.dualWriteEnabled === 'boolean') {
      result.features!.dualWriteEnabled = features.dualWriteEnabled;
      fromConfig.push('features.dualWriteEnabled');
    } else fb('features.dualWriteEnabled', 'field_missing', result.features!.dualWriteEnabled);
    if (typeof features.enqueueSchedulerEnabled === 'boolean') {
      result.features!.enqueueSchedulerEnabled = features.enqueueSchedulerEnabled;
      fromConfig.push('features.enqueueSchedulerEnabled');
    } else fb('features.enqueueSchedulerEnabled', 'field_missing', result.features!.enqueueSchedulerEnabled);
    if (typeof features.templateBusinessDateCheck === 'boolean') {
      result.features!.templateBusinessDateCheck = features.templateBusinessDateCheck;
      fromConfig.push('features.templateBusinessDateCheck');
    } else fb('features.templateBusinessDateCheck', 'field_missing', result.features!.templateBusinessDateCheck);
    if (typeof features.settlementAggregatorEnabled === 'boolean') {
      result.features!.settlementAggregatorEnabled = features.settlementAggregatorEnabled;
      fromConfig.push('features.settlementAggregatorEnabled');
    } else fb('features.settlementAggregatorEnabled', 'field_missing', result.features!.settlementAggregatorEnabled);
    if (typeof features.tableDeviceRegistrationEnabled === 'boolean') {
      result.features!.tableDeviceRegistrationEnabled = features.tableDeviceRegistrationEnabled;
      fromConfig.push('features.tableDeviceRegistrationEnabled');
    } else fb('features.tableDeviceRegistrationEnabled', 'field_missing', result.features!.tableDeviceRegistrationEnabled);
    if (typeof features.createAttendanceByManual === 'boolean') {
      result.features!.createAttendanceByManual = features.createAttendanceByManual;
      fromConfig.push('features.createAttendanceByManual');
    } else fb('features.createAttendanceByManual', 'field_missing', result.features!.createAttendanceByManual);
    if (typeof features.reportingAggregatorEnabled === 'boolean') {
      result.features!.reportingAggregatorEnabled = features.reportingAggregatorEnabled;
      fromConfig.push('features.reportingAggregatorEnabled');
    } else fb('features.reportingAggregatorEnabled', 'field_missing', result.features!.reportingAggregatorEnabled);
  } else {
    fb('features', 'field_missing', result.features);
  }

  // attendanceTimeAdjustment
  const attendanceTimeAdjustment = raw.attendanceTimeAdjustment as Record<string, unknown> | undefined;
  if (attendanceTimeAdjustment && typeof attendanceTimeAdjustment === 'object') {
    if (typeof attendanceTimeAdjustment.enabled === 'boolean') {
      result.attendanceTimeAdjustment!.enabled = attendanceTimeAdjustment.enabled;
      fromConfig.push('attendanceTimeAdjustment.enabled');
    } else fb('attendanceTimeAdjustment.enabled', 'field_missing', result.attendanceTimeAdjustment!.enabled);

    if (
      typeof attendanceTimeAdjustment.maxFutureMinutes === 'number' ||
      attendanceTimeAdjustment.maxFutureMinutes === null
    ) {
      result.attendanceTimeAdjustment!.maxFutureMinutes =
        (attendanceTimeAdjustment.maxFutureMinutes as number | null);
      fromConfig.push('attendanceTimeAdjustment.maxFutureMinutes');
    } else {
      fb('attendanceTimeAdjustment.maxFutureMinutes', 'field_missing', result.attendanceTimeAdjustment!.maxFutureMinutes);
    }

    if (
      typeof attendanceTimeAdjustment.maxPastMinutes === 'number' ||
      attendanceTimeAdjustment.maxPastMinutes === null
    ) {
      result.attendanceTimeAdjustment!.maxPastMinutes =
        (attendanceTimeAdjustment.maxPastMinutes as number | null);
      fromConfig.push('attendanceTimeAdjustment.maxPastMinutes');
    } else {
      fb('attendanceTimeAdjustment.maxPastMinutes', 'field_missing', result.attendanceTimeAdjustment!.maxPastMinutes);
    }
  } else {
    fb('attendanceTimeAdjustment', 'field_missing', result.attendanceTimeAdjustment);
  }

  // autoOpenClose
  const autoOpenClose = raw.autoOpenClose as Record<string, unknown> | undefined;
  if (autoOpenClose && typeof autoOpenClose === 'object') {
    if (typeof autoOpenClose.enabled === 'boolean') {
      result.autoOpenClose!.enabled = autoOpenClose.enabled;
      fromConfig.push('autoOpenClose.enabled');
    } else fb('autoOpenClose.enabled', 'field_missing', result.autoOpenClose!.enabled);
    if (typeof autoOpenClose.taskCloseOffsetMinutes === 'number') {
      result.autoOpenClose!.taskCloseOffsetMinutes = autoOpenClose.taskCloseOffsetMinutes;
      fromConfig.push('autoOpenClose.taskCloseOffsetMinutes');
    } else fb('autoOpenClose.taskCloseOffsetMinutes', 'field_missing', result.autoOpenClose!.taskCloseOffsetMinutes);
    if (typeof autoOpenClose.taskOpenOffsetMinutes === 'number') {
      result.autoOpenClose!.taskOpenOffsetMinutes = autoOpenClose.taskOpenOffsetMinutes;
      fromConfig.push('autoOpenClose.taskOpenOffsetMinutes');
    } else fb('autoOpenClose.taskOpenOffsetMinutes', 'field_missing', result.autoOpenClose!.taskOpenOffsetMinutes);
    if (
      typeof autoOpenClose.alreadyRunningDifferentDateRecheckMinutes === 'number' &&
      Number.isInteger(autoOpenClose.alreadyRunningDifferentDateRecheckMinutes) &&
      autoOpenClose.alreadyRunningDifferentDateRecheckMinutes >= 1 &&
      autoOpenClose.alreadyRunningDifferentDateRecheckMinutes <= 180
    ) {
      result.autoOpenClose!.alreadyRunningDifferentDateRecheckMinutes =
        autoOpenClose.alreadyRunningDifferentDateRecheckMinutes;
      fromConfig.push('autoOpenClose.alreadyRunningDifferentDateRecheckMinutes');
    } else {
      const hasField = Object.prototype.hasOwnProperty.call(
        autoOpenClose,
        'alreadyRunningDifferentDateRecheckMinutes'
      );
      fb(
        'autoOpenClose.alreadyRunningDifferentDateRecheckMinutes',
        hasField ? 'invalid_value' : 'field_missing',
        result.autoOpenClose!.alreadyRunningDifferentDateRecheckMinutes
      );
    }
  } else {
    fb('autoOpenClose', 'field_missing', result.autoOpenClose);
  }

  // businessDay
  const businessDay = raw.businessDay as Record<string, unknown> | undefined;
  if (businessDay && typeof businessDay === 'object' && typeof businessDay.calcBufferMinutes === 'number') {
    result.businessDay!.calcBufferMinutes = businessDay.calcBufferMinutes;
    fromConfig.push('businessDay.calcBufferMinutes');
  } else if (!businessDay || typeof businessDay?.calcBufferMinutes !== 'number') {
    fb('businessDay.calcBufferMinutes', 'field_missing', result.businessDay!.calcBufferMinutes);
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
    fromConfig.push('businessHoursStyles');
  }

  // billing
  const billing = raw.billing as Record<string, unknown> | undefined;
  if (billing && typeof billing === 'object') {
    if (typeof billing.entranceFee === 'number') {
      result.billing!.entranceFee = billing.entranceFee;
      fromConfig.push('billing.entranceFee');
    } else fb('billing.entranceFee', 'field_missing', result.billing!.entranceFee);
    if (typeof billing.entranceFeeDescription === 'string') {
      result.billing!.entranceFeeDescription = billing.entranceFeeDescription;
      fromConfig.push('billing.entranceFeeDescription');
    } else fb('billing.entranceFeeDescription', 'field_missing', result.billing!.entranceFeeDescription);
    if (typeof billing.chargeEntranceFeeOnReentry === 'boolean') {
      result.billing!.chargeEntranceFeeOnReentry = billing.chargeEntranceFeeOnReentry;
      fromConfig.push('billing.chargeEntranceFeeOnReentry');
    } else fb('billing.chargeEntranceFeeOnReentry', 'field_missing', result.billing!.chargeEntranceFeeOnReentry);
    if (typeof billing.sideGameChipRate === 'number') {
      result.billing!.sideGameChipRate = billing.sideGameChipRate;
      fromConfig.push('billing.sideGameChipRate');
    } else fb('billing.sideGameChipRate', 'field_missing', result.billing!.sideGameChipRate);
    const pp = billing.paymentPolicy as Record<string, unknown> | undefined;
    if (pp && typeof pp === 'object') {
      if (pp.categoryPaymentMethods && typeof pp.categoryPaymentMethods === 'object') {
        result.billing!.paymentPolicy!.categoryPaymentMethods = pp.categoryPaymentMethods as Record<string, string[]>;
        fromConfig.push('billing.paymentPolicy.categoryPaymentMethods');
      } else fb('billing.paymentPolicy.categoryPaymentMethods', 'field_missing', result.billing!.paymentPolicy!.categoryPaymentMethods);
      if (Array.isArray(pp.pointPriority)) {
        result.billing!.paymentPolicy!.pointPriority = pp.pointPriority as string[];
        fromConfig.push('billing.paymentPolicy.pointPriority');
      } else fb('billing.paymentPolicy.pointPriority', 'field_missing', result.billing!.paymentPolicy!.pointPriority);
      if (Array.isArray(pp.categoryOrder)) {
        result.billing!.paymentPolicy!.categoryOrder = pp.categoryOrder as string[];
        fromConfig.push('billing.paymentPolicy.categoryOrder');
      } else fb('billing.paymentPolicy.categoryOrder', 'field_missing', result.billing!.paymentPolicy!.categoryOrder);
      const ru = pp.roundingUnits as Record<string, unknown> | undefined;
      if (ru && typeof ru === 'object') {
        if (typeof ru.pointAB === 'number') {
          result.billing!.paymentPolicy!.roundingUnits!.pointAB = ru.pointAB;
          fromConfig.push('billing.paymentPolicy.roundingUnits.pointAB');
        }
        if (typeof ru.sideGameChip === 'number') {
          result.billing!.paymentPolicy!.roundingUnits!.sideGameChip = ru.sideGameChip;
          fromConfig.push('billing.paymentPolicy.roundingUnits.sideGameChip');
        }
      }
    }
  } else {
    fb('billing', 'field_missing', result.billing);
  }

  // linePlan
  if (typeof raw.linePlan === 'string' && ['communication', 'light', 'standard'].includes(raw.linePlan)) {
    result.linePlan = raw.linePlan;
    fromConfig.push('linePlan');
  } else if (raw.linePlan !== undefined && raw.linePlan !== null) {
    fb('linePlan', 'invalid_value', result.linePlan);
  } else {
    fb('linePlan', 'field_missing', result.linePlan);
  }

  // shift
  const shift = raw.shift as Record<string, unknown> | undefined;
  if (shift && typeof shift === 'object') {
    if (typeof shift.submissionStartDay === 'number') {
      result.shift!.submissionStartDay = shift.submissionStartDay;
      fromConfig.push('shift.submissionStartDay');
    } else fb('shift.submissionStartDay', 'field_missing', result.shift!.submissionStartDay);
    if (typeof shift.submissionEndDay === 'number') {
      result.shift!.submissionEndDay = shift.submissionEndDay;
      fromConfig.push('shift.submissionEndDay');
    } else fb('shift.submissionEndDay', 'field_missing', result.shift!.submissionEndDay);
    if (typeof shift.schedulingStartDay === 'number') {
      result.shift!.schedulingStartDay = shift.schedulingStartDay;
      fromConfig.push('shift.schedulingStartDay');
    } else fb('shift.schedulingStartDay', 'field_missing', result.shift!.schedulingStartDay);
  } else {
    fb('shift', 'field_missing', result.shift);
  }

  // payroll
  const payroll = raw.payroll as Record<string, unknown> | undefined;
  if (payroll && typeof payroll === 'object') {
    if (typeof payroll.startDay === 'number') {
      result.payroll!.startDay = payroll.startDay;
      fromConfig.push('payroll.startDay');
    } else fb('payroll.startDay', 'field_missing', result.payroll!.startDay);
    if (typeof payroll.endDay === 'number') {
      result.payroll!.endDay = payroll.endDay;
      fromConfig.push('payroll.endDay');
    } else fb('payroll.endDay', 'field_missing', result.payroll!.endDay);
  } else {
    fb('payroll', 'field_missing', result.payroll);
  }

  // attendance
  const attendance = raw.attendance as Record<string, unknown> | undefined;
  if (attendance && typeof attendance === 'object') {
    if (typeof attendance.nightWorkStartHour === 'number') {
      result.attendance!.nightWorkStartHour = attendance.nightWorkStartHour;
      fromConfig.push('attendance.nightWorkStartHour');
    } else fb('attendance.nightWorkStartHour', 'field_missing', result.attendance!.nightWorkStartHour);
    if (typeof attendance.nightWorkEndHour === 'number') {
      result.attendance!.nightWorkEndHour = attendance.nightWorkEndHour;
      fromConfig.push('attendance.nightWorkEndHour');
    } else fb('attendance.nightWorkEndHour', 'field_missing', result.attendance!.nightWorkEndHour);
  } else {
    fb('attendance', 'field_missing', result.attendance);
  }

  // menuCategories
  if (Array.isArray(raw.menuCategories) && raw.menuCategories.length > 0) {
    result.menuCategories = raw.menuCategories.filter((x): x is string => typeof x === 'string');
    fromConfig.push('menuCategories');
  } else {
    fb('menuCategories', 'field_missing', result.menuCategories);
  }

  // sideGameTypes
  if (Array.isArray(raw.sideGameTypes) && raw.sideGameTypes.length > 0) {
    result.sideGameTypes = raw.sideGameTypes.filter((x): x is string => typeof x === 'string');
    fromConfig.push('sideGameTypes');
  } else {
    fb('sideGameTypes', 'field_missing', result.sideGameTypes);
  }

  // tournament
  const tRaw = raw.tournament as Record<string, unknown> | undefined;
  if (tRaw && typeof tRaw === 'object') {
    if (typeof tRaw.defaultPrizeRatio === 'number' && tRaw.defaultPrizeRatio >= 0 && tRaw.defaultPrizeRatio <= 1) {
      result.tournament!.defaultPrizeRatio = tRaw.defaultPrizeRatio;
      fromConfig.push('tournament.defaultPrizeRatio');
    } else fb('tournament.defaultPrizeRatio', 'field_missing', result.tournament!.defaultPrizeRatio);
    if (typeof tRaw.prizeReceiverPercentage === 'number' && tRaw.prizeReceiverPercentage >= 1 && tRaw.prizeReceiverPercentage <= 100) {
      result.tournament!.prizeReceiverPercentage = tRaw.prizeReceiverPercentage;
      fromConfig.push('tournament.prizeReceiverPercentage');
    } else fb('tournament.prizeReceiverPercentage', 'field_missing', result.tournament!.prizeReceiverPercentage);
    if (typeof tRaw.prizeRoundingMethod === 'string' && ['floor', 'ceil', 'round'].includes(tRaw.prizeRoundingMethod)) {
      result.tournament!.prizeRoundingMethod = tRaw.prizeRoundingMethod;
      fromConfig.push('tournament.prizeRoundingMethod');
    } else fb('tournament.prizeRoundingMethod', 'field_missing', result.tournament!.prizeRoundingMethod);
    const validRoundingUnits = [1, 10, 100, 1000];
    if (typeof tRaw.prizeRoundingUnit === 'number' && validRoundingUnits.includes(tRaw.prizeRoundingUnit)) {
      result.tournament!.prizeRoundingUnit = tRaw.prizeRoundingUnit;
      fromConfig.push('tournament.prizeRoundingUnit');
    } else fb('tournament.prizeRoundingUnit', 'field_missing', result.tournament!.prizeRoundingUnit);
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
        fromConfig.push('tournament.prizeDistribution');
      } else {
        fb('tournament.prizeDistribution', 'field_missing', result.tournament!.prizeDistribution);
      }
    } else {
      fb('tournament.prizeDistribution', 'field_missing', result.tournament!.prizeDistribution);
    }
    if (typeof tRaw.liffRegistrationEnabled === 'boolean') {
      result.tournament!.liffRegistrationEnabled = tRaw.liffRegistrationEnabled;
      fromConfig.push('tournament.liffRegistrationEnabled');
    } else {
      fb(
        'tournament.liffRegistrationEnabled',
        'field_missing',
        result.tournament!.liffRegistrationEnabled
      );
    }
    if (typeof tRaw.liffCalendarEnabled === 'boolean') {
      result.tournament!.liffCalendarEnabled = tRaw.liffCalendarEnabled;
      fromConfig.push('tournament.liffCalendarEnabled');
    } else {
      fb('tournament.liffCalendarEnabled', 'field_missing', result.tournament!.liffCalendarEnabled);
    }
  } else {
    fb('tournament', 'field_missing', result.tournament);
  }

  // okibake (storeMeta/config.okibake.loginPromptMode)。不正値・欠損は notice_only にフォールバック
  const okibakeRaw = raw.okibake as Record<string, unknown> | undefined;
  if (okibakeRaw && typeof okibakeRaw === 'object') {
    const mode = okibakeRaw.loginPromptMode;
    if (
      mode === 'none' ||
      mode === 'notice_only' ||
      mode === 'link_prompt'
    ) {
      result.okibake!.loginPromptMode = mode as OkibakeLoginPromptMode;
      fromConfig.push('okibake.loginPromptMode');
    } else {
      const hasOwnMode = Object.prototype.hasOwnProperty.call(okibakeRaw, 'loginPromptMode');
      fb(
        'okibake.loginPromptMode',
        hasOwnMode ? 'invalid_value' : 'field_missing',
        DEFAULT_OKIBAKE_LOGIN_PROMPT_MODE
      );
      result.okibake!.loginPromptMode = DEFAULT_OKIBAKE_LOGIN_PROMPT_MODE as OkibakeLoginPromptMode;
    }
  } else {
    fb('okibake', 'field_missing', result.okibake);
    result.okibake!.loginPromptMode = DEFAULT_OKIBAKE_LOGIN_PROMPT_MODE as OkibakeLoginPromptMode;
  }

  logOpsSuccess({
    message: 'getStoreConfig 成功',
    functionEntry: 'getStoreConfig',
    operation: 'config_read',
    context: {
      fromConfig: fromConfig.sort(),
      fromDefaults: fromDefaults.sort(),
    },
  });
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
    createAttendanceByManual: typeof featEx?.createAttendanceByManual === 'boolean' ? featEx.createAttendanceByManual : featDef.createAttendanceByManual,
    reportingAggregatorEnabled: typeof featEx?.reportingAggregatorEnabled === 'boolean' ? featEx.reportingAggregatorEnabled : featDef.reportingAggregatorEnabled,
  };

  // attendanceTimeAdjustment
  const ataDef = defaults.attendanceTimeAdjustment!;
  const ataEx = ex.attendanceTimeAdjustment as Record<string, unknown> | undefined;
  out.attendanceTimeAdjustment = {
    enabled: typeof ataEx?.enabled === 'boolean' ? ataEx.enabled : ataDef.enabled,
    maxFutureMinutes:
      typeof ataEx?.maxFutureMinutes === 'number' || ataEx?.maxFutureMinutes === null
        ? (ataEx.maxFutureMinutes as number | null)
        : ataDef.maxFutureMinutes,
    maxPastMinutes:
      typeof ataEx?.maxPastMinutes === 'number' || ataEx?.maxPastMinutes === null
        ? (ataEx.maxPastMinutes as number | null)
        : ataDef.maxPastMinutes,
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
      categoryOrder: ppEx && Array.isArray(ppEx.categoryOrder) ? ppEx.categoryOrder : ppDef.categoryOrder,
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

  // attendance
  const attDef = defaults.attendance!;
  const attEx = ex.attendance as Record<string, unknown> | undefined;
  out.attendance = {
    nightWorkStartHour: typeof attEx?.nightWorkStartHour === 'number' ? attEx.nightWorkStartHour : attDef.nightWorkStartHour,
    nightWorkEndHour: typeof attEx?.nightWorkEndHour === 'number' ? attEx.nightWorkEndHour : attDef.nightWorkEndHour,
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
    liffRegistrationEnabled:
      typeof tourEx?.liffRegistrationEnabled === 'boolean'
        ? tourEx.liffRegistrationEnabled
        : tourDef.liffRegistrationEnabled,
    liffCalendarEnabled:
      typeof tourEx?.liffCalendarEnabled === 'boolean'
        ? tourEx.liffCalendarEnabled
        : tourDef.liffCalendarEnabled,
  };

  // okibake（詳細仕様書 §14.15）。不正値は defaults / notice_only に寄せる
  const okDef = defaults.okibake!;
  const okEx = ex.okibake as Record<string, unknown> | undefined;
  const modeEx = okEx && typeof okEx === 'object' ? okEx.loginPromptMode : undefined;
  let loginPromptMode: OkibakeLoginPromptMode = okDef.loginPromptMode;
  if (modeEx === 'none' || modeEx === 'notice_only' || modeEx === 'link_prompt') {
    loginPromptMode = modeEx as OkibakeLoginPromptMode;
  }
  out.okibake = { loginPromptMode };

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
