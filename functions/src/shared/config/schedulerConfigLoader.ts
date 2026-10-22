/**
 * storeMeta/schedulerConfig 取得層
 *
 * 読み取り優先度: ① storeMeta/schedulerConfig → ② schedulerConfigDefaults.ts
 */

import type { Firestore } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { logOpsError, logOpsSuccess } from '../logging/logOpsError';
import { CONFIG_ERROR_CODES } from './configLoader';
import {
  DEFAULT_SCHEDULER_SCHEMA_VERSION,
  DEFAULT_SCHEDULER_SUPERVISOR_ENABLED,
  DEFAULT_SCHEDULER_PLANNING_HORIZON_DAYS,
  DEFAULT_SCHEDULER_TIMEZONE,
  cloneDefaultSchedulerJobConfigByKey,
} from './schedulerConfigDefaults';
import type {
  SchedulerConfig,
  SchedulerJobConfig,
  SchedulerJobKey,
  SchedulerScheduleKind,
} from './schedulerConfigTypes';

const MAX_RETRIES = 2;
const MIN_PLANNING_HORIZON_DAYS = 1;
const MAX_PLANNING_HORIZON_DAYS = 14;

const JOB_KEYS: SchedulerJobKey[] = [
  'weeklyPlanner',
  'enqueueTournamentTasksByScheduler',
  'generateRecurringTournamentsByScheduler',
  'scheduledCleanup',
  'scheduleGenerateNextYearBusinessHours',
  'payrollNotificationScheduler',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidRunAtJst(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^([01]\d|2[0-3]):([0-5]\d)$/.test(value)
  );
}

function isValidScheduleKind(value: unknown): value is SchedulerScheduleKind {
  return value === 'daily' || value === 'weekly' || value === 'yearly';
}

function isValidDayOfWeek(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;
}

function isValidMonth(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12;
}

function isValidDayOfMonth(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31;
}

function normalizePlanningHorizonDays(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    return DEFAULT_SCHEDULER_PLANNING_HORIZON_DAYS;
  }
  if (raw < MIN_PLANNING_HORIZON_DAYS || raw > MAX_PLANNING_HORIZON_DAYS) {
    return DEFAULT_SCHEDULER_PLANNING_HORIZON_DAYS;
  }
  return raw;
}

function normalizeSchedulerJobConfig(
  raw: unknown,
  fallback: SchedulerJobConfig
): SchedulerJobConfig {
  if (!isRecord(raw)) {
    return { ...fallback };
  }

  const scheduleKind = isValidScheduleKind(raw.scheduleKind)
    ? raw.scheduleKind
    : fallback.scheduleKind;
  const runAtJst = isValidRunAtJst(raw.runAtJst) ? raw.runAtJst : fallback.runAtJst;
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled;
  const timezone =
    raw.timezone === DEFAULT_SCHEDULER_TIMEZONE
      ? DEFAULT_SCHEDULER_TIMEZONE
      : fallback.timezone;

  const normalized: SchedulerJobConfig = {
    enabled,
    scheduleKind,
    runAtJst,
    timezone,
  };

  if (scheduleKind === 'weekly') {
    normalized.dayOfWeek = isValidDayOfWeek(raw.dayOfWeek)
      ? raw.dayOfWeek
      : fallback.dayOfWeek;
  }

  if (scheduleKind === 'yearly') {
    normalized.month = isValidMonth(raw.month) ? raw.month : fallback.month;
    normalized.dayOfMonth = isValidDayOfMonth(raw.dayOfMonth)
      ? raw.dayOfMonth
      : fallback.dayOfMonth;
  }

  return normalized;
}

/**
 * schedulerConfig のデフォルト値を返す。
 */
export function buildSchedulerConfigFromDefaults(): SchedulerConfig {
  const jobs = cloneDefaultSchedulerJobConfigByKey();
  return {
    schemaVersion: DEFAULT_SCHEDULER_SCHEMA_VERSION,
    supervisorEnabled: DEFAULT_SCHEDULER_SUPERVISOR_ENABLED,
    planningHorizonDays: DEFAULT_SCHEDULER_PLANNING_HORIZON_DAYS,
    jobs,
  };
}

export function mergeSchedulerConfigWithDefaults(
  raw: Record<string, unknown>
): SchedulerConfig {
  const base = buildSchedulerConfigFromDefaults();
  const jobs = cloneDefaultSchedulerJobConfigByKey();

  // v2 jobs
  if (isRecord(raw.jobs)) {
    for (const jobKey of JOB_KEYS) {
      jobs[jobKey] = normalizeSchedulerJobConfig(raw.jobs[jobKey], base.jobs[jobKey]);
    }
  }

  const schemaVersion =
    typeof raw.schemaVersion === 'number' &&
    Number.isInteger(raw.schemaVersion) &&
    raw.schemaVersion >= 1
      ? raw.schemaVersion
      : DEFAULT_SCHEDULER_SCHEMA_VERSION;

  const supervisorEnabled =
    typeof raw.supervisorEnabled === 'boolean'
      ? raw.supervisorEnabled
      : DEFAULT_SCHEDULER_SUPERVISOR_ENABLED;

  const planningHorizonDays = normalizePlanningHorizonDays(raw.planningHorizonDays);

  const merged: SchedulerConfig = {
    schemaVersion,
    supervisorEnabled,
    planningHorizonDays,
    jobs,
  };

  if (raw.updatedAt) {
    merged.updatedAt = raw.updatedAt as
      | FirebaseFirestore.Timestamp
      | FirebaseFirestore.FieldValue;
  }

  return merged;
}

/**
 * initializeStoreConfigCallable で upsert するための正規化済みオブジェクトを返す。
 */
export function mergeSchedulerConfigForUpsert(
  existing: Record<string, unknown> | undefined
): Record<string, unknown> {
  const merged = mergeSchedulerConfigWithDefaults(existing ?? {});
  return {
    schemaVersion: merged.schemaVersion,
    supervisorEnabled: merged.supervisorEnabled,
    planningHorizonDays: merged.planningHorizonDays,
    jobs: merged.jobs,
  };
}

/**
 * storeMeta/schedulerConfig を取得する。
 * 未存在時・読み取り失敗時は defaults にフォールバックする。
 */
export async function getSchedulerConfig(db?: Firestore): Promise<SchedulerConfig> {
  const firestore = db ?? getFirestore();
  const docRef = firestore.collection('storeMeta').doc('schedulerConfig');

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const doc = await docRef.get();
      if (!doc.exists) {
        logger.warn('config_fallback', {
          code: CONFIG_ERROR_CODES.CONFIG_FALLBACK,
          configKey: 'schedulerConfig.*',
          fallbackSource: 'schedulerConfigDefaults.ts',
          reason: 'document_missing',
        });
        logOpsSuccess({
          message: 'getSchedulerConfig 成功',
          functionEntry: 'getSchedulerConfig',
          operation: 'config_read',
          context: {
            code: CONFIG_ERROR_CODES.CONFIG_FALLBACK,
            reason: 'document_missing',
          },
        });
        return buildSchedulerConfigFromDefaults();
      }

      const data = doc.data() as Record<string, unknown> | undefined;
      logOpsSuccess({
        message: 'getSchedulerConfig 成功',
        functionEntry: 'getSchedulerConfig',
        operation: 'config_read',
      });
      return mergeSchedulerConfigWithDefaults(data ?? {});
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        continue;
      }

      logOpsError({
        message: 'config_read_error',
        functionEntry: 'getSchedulerConfig',
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
        configKey: 'schedulerConfig.*',
        fallbackSource: 'schedulerConfigDefaults.ts',
        reason: 'read_error_after_retries',
      });
      return buildSchedulerConfigFromDefaults();
    }
  }

  return buildSchedulerConfigFromDefaults();
}
