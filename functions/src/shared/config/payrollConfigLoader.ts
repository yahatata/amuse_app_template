/**
 * storeMeta/payrollConfig 取得層
 *
 * configLoader.ts と同一パターン。
 * 読み取り優先度: ① storeMeta/payrollConfig → ② payrollConfigDefaults.ts
 *
 * 参照: docs/config_migration/phase4_3/specs/02_CONFIG_SPEC.md
 */

import type { Firestore } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { logOpsError, logOpsSuccess } from '../logging/logOpsError';
import { CONFIG_ERROR_CODES } from './configLoader';

import {
  DEFAULT_PAYROLL_CONFIG_PAYMENT_DAY_OF_MONTH,
  DEFAULT_PAYROLL_CONFIG_PAYMENT_MONTH_OFFSET,
  DEFAULT_PAYROLL_CONFIG_BULK_PAYMENT_REGISTRATION_ENABLED,
  DEFAULT_PAYROLL_CONFIG_EXPECTED_RANGE,
  DEFAULT_PAYROLL_CONFIG_MAX_CANDIDATES_COUNT,
  DEFAULT_PAYROLL_CONFIG_WEEK_START_DAY,
  DEFAULT_PAYROLL_CONFIG_WEEKLY_LEGAL_LIMIT_MINUTES,
  DEFAULT_PAYROLL_CONFIG_LEGAL_HOLIDAY_WEEKDAY,
  DEFAULT_PAYROLL_CONFIG_CALC_VERSION,
  DEFAULT_PAYROLL_CONFIG_NIGHT_PREMIUM_RATE,
  DEFAULT_PAYROLL_CONFIG_OVERTIME_PREMIUM_RATE,
  DEFAULT_PAYROLL_CONFIG_OVER_60_PREMIUM_RATE,
  DEFAULT_PAYROLL_CONFIG_LEGAL_HOLIDAY_PREMIUM_RATE,
  DEFAULT_PAYROLL_CONFIG_ROUNDING_METHOD,
  DEFAULT_PAYROLL_CONFIG_ROUNDING_PRECISION,
  DEFAULT_PAYROLL_CONFIG_SCHEDULER_NOTIFICATION_HOUR,
  DEFAULT_PAYROLL_CONFIG_REMINDER_START_DAYS_AFTER_PERIOD_END,
} from './payrollConfigDefaults';

import type { PayrollConfig, ExpectedRange, RoundingMethod } from './payrollConfigTypes';

const MAX_RETRIES = 2;

const VALID_ROUNDING_METHODS: RoundingMethod[] = ['ceil', 'floor', 'round'];
const VALID_ROUNDING_PRECISIONS = [1, 10, 100, 1000];
const VALID_PAYMENT_MONTH_OFFSETS = [0, 1, 2] as const;

function normalizePaymentDayOfMonth(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (!/^\d{1,2}$/.test(raw)) return null;
  const day = Number(raw);
  if (!Number.isInteger(day) || day < 0 || day > 31) return null;
  return String(day);
}

function parseLegacyPaymentDate(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return null;

  const normalizedDay = normalizePaymentDayOfMonth(raw);
  if (normalizedDay !== null) return normalizedDay;

  const match = raw.match(/^\d{4}-\d{2}-(\d{2})$/);
  if (!match) return null;

  const day = Number(match[1]);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  return String(day);
}

function normalizePaymentMonthOffset(raw: unknown): 0 | 1 | 2 | null {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return null;
  return VALID_PAYMENT_MONTH_OFFSETS.includes(raw as 0 | 1 | 2)
    ? (raw as 0 | 1 | 2)
    : null;
}

/**
 * storeMeta/payrollConfig を取得する。
 * 未存在時・読み取り失敗時は defaults にフォールバック。
 */
export async function getPayrollConfig(db?: Firestore): Promise<PayrollConfig> {
  const firestore = db ?? getFirestore();
  const docRef = firestore.collection('storeMeta').doc('payrollConfig');

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const doc = await docRef.get();
      if (!doc.exists) {
        logger.warn('config_fallback', {
          code: CONFIG_ERROR_CODES.CONFIG_FALLBACK,
          configKey: 'payrollConfig.*',
          fallbackSource: 'payrollConfigDefaults.ts',
          reason: 'document_missing',
        });
        logOpsSuccess({
          message: 'getPayrollConfig 成功',
          functionEntry: 'getPayrollConfig',
          operation: 'config_read',
          context: {
            code: CONFIG_ERROR_CODES.CONFIG_FALLBACK,
            reason: 'document_missing',
            fromConfig: [] as string[],
            fromDefaults: ['*'] as string[],
          },
        });
        return buildPayrollConfigFromDefaults();
      }
      const data = doc.data() as Record<string, unknown> | undefined;
      return mergePayrollConfigWithDefaults(data ?? {});
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        continue;
      }
      logOpsError({
        message: 'config_read_error',
        functionEntry: 'getPayrollConfig',
        operation: 'config_read',
        cause: lastError,
        context: {
          code: CONFIG_ERROR_CODES.CONFIG_READ_ERROR,
          reason: 'read_error',
          message: String(err instanceof Error ? err.message : err),
        },
      });
      logger.warn('config_fallback', {
        code: CONFIG_ERROR_CODES.CONFIG_FALLBACK,
        configKey: 'payrollConfig.*',
        fallbackSource: 'payrollConfigDefaults.ts',
        reason: 'read_error_after_retries',
      });
      logOpsSuccess({
        message: 'getPayrollConfig 成功',
        functionEntry: 'getPayrollConfig',
        operation: 'config_read',
        context: {
          code: CONFIG_ERROR_CODES.CONFIG_FALLBACK,
          reason: 'read_error_after_retries',
          fromConfig: [] as string[],
          fromDefaults: ['*'] as string[],
        },
      });
      return buildPayrollConfigFromDefaults();
    }
  }
  return buildPayrollConfigFromDefaults();
}

export function buildPayrollConfigFromDefaults(): PayrollConfig {
  return {
    paymentDayOfMonth: DEFAULT_PAYROLL_CONFIG_PAYMENT_DAY_OF_MONTH,
    paymentMonthOffset: DEFAULT_PAYROLL_CONFIG_PAYMENT_MONTH_OFFSET,
    bulkPaymentRegistrationEnabled: DEFAULT_PAYROLL_CONFIG_BULK_PAYMENT_REGISTRATION_ENABLED,
    expectedRange: DEFAULT_PAYROLL_CONFIG_EXPECTED_RANGE,
    maxCandidatesCount: DEFAULT_PAYROLL_CONFIG_MAX_CANDIDATES_COUNT,
    weekStartDay: DEFAULT_PAYROLL_CONFIG_WEEK_START_DAY,
    weeklyLegalLimitMinutes: DEFAULT_PAYROLL_CONFIG_WEEKLY_LEGAL_LIMIT_MINUTES,
    legalHolidayWeekday: DEFAULT_PAYROLL_CONFIG_LEGAL_HOLIDAY_WEEKDAY,
    calcVersion: DEFAULT_PAYROLL_CONFIG_CALC_VERSION,
    nightPremiumRate: DEFAULT_PAYROLL_CONFIG_NIGHT_PREMIUM_RATE,
    overtimePremiumRate: DEFAULT_PAYROLL_CONFIG_OVERTIME_PREMIUM_RATE,
    over60PremiumRate: DEFAULT_PAYROLL_CONFIG_OVER_60_PREMIUM_RATE,
    legalHolidayPremiumRate: DEFAULT_PAYROLL_CONFIG_LEGAL_HOLIDAY_PREMIUM_RATE,
    roundingMethod: DEFAULT_PAYROLL_CONFIG_ROUNDING_METHOD as RoundingMethod,
    roundingPrecision: DEFAULT_PAYROLL_CONFIG_ROUNDING_PRECISION,
    schedulerNotificationHour: DEFAULT_PAYROLL_CONFIG_SCHEDULER_NOTIFICATION_HOUR,
    reminderStartDaysAfterPeriodEnd: DEFAULT_PAYROLL_CONFIG_REMINDER_START_DAYS_AFTER_PERIOD_END,
  };
}

function logFallback(configKey: string, reason: string, fallbackValue?: unknown): void {
  logger.warn('config_fallback', {
    code: CONFIG_ERROR_CODES.CONFIG_FALLBACK,
    configKey: `payrollConfig.${configKey}`,
    fallbackSource: 'payrollConfigDefaults.ts',
    fallbackValue,
    reason,
  });
}

export function mergePayrollConfigWithDefaults(raw: Record<string, unknown>): PayrollConfig {
  const result = buildPayrollConfigFromDefaults();
  const fromConfig: string[] = [];
  const fromDefaults: string[] = [];
  const fb = (key: string, reason: string) => {
    fromDefaults.push(key);
    logFallback(key, reason, (result as unknown as Record<string, unknown>)[key]);
  };

  // paymentDayOfMonth (string | null) with legacy paymentDate fallback
  const normalizedPaymentDay = normalizePaymentDayOfMonth(raw.paymentDayOfMonth);
  if (normalizedPaymentDay !== null) {
    result.paymentDayOfMonth = normalizedPaymentDay;
    fromConfig.push('paymentDayOfMonth');
  } else if (raw.paymentDayOfMonth === null) {
    result.paymentDayOfMonth = null;
    fromConfig.push('paymentDayOfMonth');
  } else {
    const legacyPaymentDay = parseLegacyPaymentDate(raw.paymentDate);
    if (legacyPaymentDay !== null) {
      result.paymentDayOfMonth = legacyPaymentDay;
      fromConfig.push('paymentDate');
    } else if (raw.paymentDate === null) {
      result.paymentDayOfMonth = null;
      fromConfig.push('paymentDate');
    } else if (
      raw.paymentDayOfMonth === undefined &&
      raw.paymentDate === undefined
    ) {
      fb('paymentDayOfMonth', 'field_missing');
    } else {
      fb('paymentDayOfMonth', 'invalid_value');
    }
  }

  // paymentMonthOffset (0 | 1 | 2)
  const paymentMonthOffset = normalizePaymentMonthOffset(raw.paymentMonthOffset);
  if (paymentMonthOffset !== null) {
    result.paymentMonthOffset = paymentMonthOffset;
    fromConfig.push('paymentMonthOffset');
  } else if (raw.paymentMonthOffset === undefined) {
    fb('paymentMonthOffset', 'field_missing');
  } else {
    fb('paymentMonthOffset', 'invalid_value');
  }

  // bulkPaymentRegistrationEnabled
  if (typeof raw.bulkPaymentRegistrationEnabled === 'boolean') {
    result.bulkPaymentRegistrationEnabled = raw.bulkPaymentRegistrationEnabled;
    fromConfig.push('bulkPaymentRegistrationEnabled');
  } else if (raw.bulkPaymentRegistrationEnabled !== undefined) {
    fb('bulkPaymentRegistrationEnabled', 'invalid_value');
  } else {
    fb('bulkPaymentRegistrationEnabled', 'field_missing');
  }

  // expectedRange (object | null)
  if (raw.expectedRange === null) {
    result.expectedRange = null;
    fromConfig.push('expectedRange');
  } else if (raw.expectedRange && typeof raw.expectedRange === 'object') {
    const er = raw.expectedRange as Record<string, unknown>;
    const parsed: ExpectedRange = {};
    if (typeof er.attendanceCountMin === 'number') parsed.attendanceCountMin = er.attendanceCountMin;
    if (typeof er.attendanceCountMax === 'number') parsed.attendanceCountMax = er.attendanceCountMax;
    if (typeof er.estimatedAmountMin === 'number') parsed.estimatedAmountMin = er.estimatedAmountMin;
    if (typeof er.estimatedAmountMax === 'number') parsed.estimatedAmountMax = er.estimatedAmountMax;
    if (typeof er.totalHoursMin === 'number') parsed.totalHoursMin = er.totalHoursMin;
    if (typeof er.totalHoursMax === 'number') parsed.totalHoursMax = er.totalHoursMax;
    result.expectedRange = parsed;
    fromConfig.push('expectedRange');
  } else if (raw.expectedRange !== undefined) {
    fb('expectedRange', 'invalid_value');
  } else {
    fb('expectedRange', 'field_missing');
  }

  // maxCandidatesCount
  if (typeof raw.maxCandidatesCount === 'number' && raw.maxCandidatesCount > 0) {
    result.maxCandidatesCount = raw.maxCandidatesCount;
    fromConfig.push('maxCandidatesCount');
  } else if (raw.maxCandidatesCount !== undefined) {
    fb('maxCandidatesCount', 'invalid_value');
  } else {
    fb('maxCandidatesCount', 'field_missing');
  }

  // weekStartDay (0-6)
  if (typeof raw.weekStartDay === 'number' && raw.weekStartDay >= 0 && raw.weekStartDay <= 6) {
    result.weekStartDay = raw.weekStartDay;
    fromConfig.push('weekStartDay');
  } else if (raw.weekStartDay !== undefined) {
    fb('weekStartDay', 'invalid_value');
  } else {
    fb('weekStartDay', 'field_missing');
  }

  // weeklyLegalLimitMinutes
  if (typeof raw.weeklyLegalLimitMinutes === 'number' && raw.weeklyLegalLimitMinutes > 0) {
    result.weeklyLegalLimitMinutes = raw.weeklyLegalLimitMinutes;
    fromConfig.push('weeklyLegalLimitMinutes');
  } else if (raw.weeklyLegalLimitMinutes !== undefined) {
    fb('weeklyLegalLimitMinutes', 'invalid_value');
  } else {
    fb('weeklyLegalLimitMinutes', 'field_missing');
  }

  // legalHolidayWeekday (number 0-6 | null)
  if (raw.legalHolidayWeekday === null) {
    result.legalHolidayWeekday = null;
    fromConfig.push('legalHolidayWeekday');
  } else if (typeof raw.legalHolidayWeekday === 'number' && raw.legalHolidayWeekday >= 0 && raw.legalHolidayWeekday <= 6) {
    result.legalHolidayWeekday = raw.legalHolidayWeekday;
    fromConfig.push('legalHolidayWeekday');
  } else if (raw.legalHolidayWeekday !== undefined) {
    fb('legalHolidayWeekday', 'invalid_value');
  } else {
    fb('legalHolidayWeekday', 'field_missing');
  }

  // calcVersion
  if (typeof raw.calcVersion === 'string' && raw.calcVersion.length > 0) {
    result.calcVersion = raw.calcVersion;
    fromConfig.push('calcVersion');
  } else if (raw.calcVersion !== undefined) {
    fb('calcVersion', 'invalid_value');
  } else {
    fb('calcVersion', 'field_missing');
  }

  // nightPremiumRate
  if (typeof raw.nightPremiumRate === 'number' && raw.nightPremiumRate >= 0) {
    result.nightPremiumRate = raw.nightPremiumRate;
    fromConfig.push('nightPremiumRate');
  } else if (raw.nightPremiumRate !== undefined) {
    fb('nightPremiumRate', 'invalid_value');
  } else {
    fb('nightPremiumRate', 'field_missing');
  }

  // overtimePremiumRate
  if (typeof raw.overtimePremiumRate === 'number' && raw.overtimePremiumRate >= 0) {
    result.overtimePremiumRate = raw.overtimePremiumRate;
    fromConfig.push('overtimePremiumRate');
  } else if (raw.overtimePremiumRate !== undefined) {
    fb('overtimePremiumRate', 'invalid_value');
  } else {
    fb('overtimePremiumRate', 'field_missing');
  }

  // over60PremiumRate
  if (typeof raw.over60PremiumRate === 'number' && raw.over60PremiumRate >= 0) {
    result.over60PremiumRate = raw.over60PremiumRate;
    fromConfig.push('over60PremiumRate');
  } else if (raw.over60PremiumRate !== undefined) {
    fb('over60PremiumRate', 'invalid_value');
  } else {
    fb('over60PremiumRate', 'field_missing');
  }

  // legalHolidayPremiumRate
  if (typeof raw.legalHolidayPremiumRate === 'number' && raw.legalHolidayPremiumRate >= 0) {
    result.legalHolidayPremiumRate = raw.legalHolidayPremiumRate;
    fromConfig.push('legalHolidayPremiumRate');
  } else if (raw.legalHolidayPremiumRate !== undefined) {
    fb('legalHolidayPremiumRate', 'invalid_value');
  } else {
    fb('legalHolidayPremiumRate', 'field_missing');
  }

  // roundingMethod
  if (typeof raw.roundingMethod === 'string' && VALID_ROUNDING_METHODS.includes(raw.roundingMethod as RoundingMethod)) {
    result.roundingMethod = raw.roundingMethod as RoundingMethod;
    fromConfig.push('roundingMethod');
  } else if (raw.roundingMethod !== undefined) {
    fb('roundingMethod', 'invalid_value');
  } else {
    fb('roundingMethod', 'field_missing');
  }

  // roundingPrecision: 有効値は 1 / 10 / 100 / 1000（10 の冪）のみ
  if (typeof raw.roundingPrecision === 'number' && VALID_ROUNDING_PRECISIONS.includes(raw.roundingPrecision)) {
    result.roundingPrecision = raw.roundingPrecision;
    fromConfig.push('roundingPrecision');
  } else if (raw.roundingPrecision !== undefined) {
    fb('roundingPrecision', 'invalid_value');
  } else {
    fb('roundingPrecision', 'field_missing');
  }

  // schedulerNotificationHour (0-23)
  if (typeof raw.schedulerNotificationHour === 'number' && raw.schedulerNotificationHour >= 0 && raw.schedulerNotificationHour <= 23) {
    result.schedulerNotificationHour = raw.schedulerNotificationHour;
    fromConfig.push('schedulerNotificationHour');
  } else if (raw.schedulerNotificationHour !== undefined) {
    fb('schedulerNotificationHour', 'invalid_value');
  } else {
    fb('schedulerNotificationHour', 'field_missing');
  }

  // reminderStartDaysAfterPeriodEnd
  if (typeof raw.reminderStartDaysAfterPeriodEnd === 'number' && raw.reminderStartDaysAfterPeriodEnd >= 0) {
    result.reminderStartDaysAfterPeriodEnd = raw.reminderStartDaysAfterPeriodEnd;
    fromConfig.push('reminderStartDaysAfterPeriodEnd');
  } else if (raw.reminderStartDaysAfterPeriodEnd !== undefined) {
    fb('reminderStartDaysAfterPeriodEnd', 'invalid_value');
  } else {
    fb('reminderStartDaysAfterPeriodEnd', 'field_missing');
  }

  logOpsSuccess({
    message: 'getPayrollConfig 成功',
    functionEntry: 'getPayrollConfig',
    operation: 'config_read',
    context: {
      fromConfig: fromConfig.sort(),
      fromDefaults: fromDefaults.sort(),
    },
  });
  return result;
}

/**
 * 既存 payrollConfig に不足フィールドを defaults から補完する（上書きしない）。
 * initializeStoreConfigCallable で payrollConfig が既存の場合に使用。
 */
export function mergePayrollConfigForUpsert(
  existing: Record<string, unknown> | undefined,
  defaults: PayrollConfig
): Record<string, unknown> {
  const ex = existing ?? {};

  const numOrDefault = (key: string, def: number): number =>
    typeof ex[key] === 'number' ? (ex[key] as number) : def;
  const boolOrDefault = (key: string, def: boolean): boolean =>
    typeof ex[key] === 'boolean' ? (ex[key] as boolean) : def;
  const strOrDefault = (key: string, def: string): string =>
    typeof ex[key] === 'string' ? (ex[key] as string) : def;

  return {
    paymentDayOfMonth:
      normalizePaymentDayOfMonth(ex.paymentDayOfMonth) ??
      (ex.paymentDayOfMonth === null
        ? null
        : (parseLegacyPaymentDate(ex.paymentDate) ?? defaults.paymentDayOfMonth)),
    paymentMonthOffset:
      normalizePaymentMonthOffset(ex.paymentMonthOffset) ??
      defaults.paymentMonthOffset,
    bulkPaymentRegistrationEnabled: boolOrDefault('bulkPaymentRegistrationEnabled', defaults.bulkPaymentRegistrationEnabled),
    expectedRange:
      ex.expectedRange !== undefined ? ex.expectedRange : defaults.expectedRange,
    maxCandidatesCount: numOrDefault('maxCandidatesCount', defaults.maxCandidatesCount),
    weekStartDay: numOrDefault('weekStartDay', defaults.weekStartDay),
    weeklyLegalLimitMinutes: numOrDefault('weeklyLegalLimitMinutes', defaults.weeklyLegalLimitMinutes),
    legalHolidayWeekday:
      ex.legalHolidayWeekday === null || typeof ex.legalHolidayWeekday === 'number'
        ? ex.legalHolidayWeekday
        : defaults.legalHolidayWeekday,
    calcVersion: strOrDefault('calcVersion', defaults.calcVersion),
    nightPremiumRate: numOrDefault('nightPremiumRate', defaults.nightPremiumRate),
    overtimePremiumRate: numOrDefault('overtimePremiumRate', defaults.overtimePremiumRate),
    over60PremiumRate: numOrDefault('over60PremiumRate', defaults.over60PremiumRate),
    legalHolidayPremiumRate: numOrDefault('legalHolidayPremiumRate', defaults.legalHolidayPremiumRate),
    roundingMethod:
      typeof ex.roundingMethod === 'string' && VALID_ROUNDING_METHODS.includes(ex.roundingMethod as RoundingMethod)
        ? ex.roundingMethod
        : defaults.roundingMethod,
    roundingPrecision: (() => {
      const v = numOrDefault('roundingPrecision', defaults.roundingPrecision);
      return VALID_ROUNDING_PRECISIONS.includes(v) ? v : defaults.roundingPrecision;
    })(),
    schedulerNotificationHour: numOrDefault('schedulerNotificationHour', defaults.schedulerNotificationHour),
    reminderStartDaysAfterPeriodEnd: numOrDefault('reminderStartDaysAfterPeriodEnd', defaults.reminderStartDaysAfterPeriodEnd),
  };
}
