/**
 * storeMeta/schedulerConfig 取得層
 *
 * スケジューラーの ON/OFF を制御する。
 * 未存在時・読み取り失敗時は defaults にフォールバック。
 */

import type { Firestore } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import {
  DEFAULT_MONTHLY_PAYROLL_TRIGGER_ENABLED,
  DEFAULT_SCHEDULED_CLEANUP_ENABLED,
  DEFAULT_SCHEDULE_GENERATE_NEXT_YEAR_BUSINESS_HOURS_ENABLED,
} from './defaults';
import type { SchedulerConfig } from './schedulerConfigTypes';

const MAX_RETRIES = 2;

/**
 * storeMeta/schedulerConfig を取得する。
 * 未存在時・読み取り失敗時は defaults にフォールバック。
 */
export async function getSchedulerConfig(db?: Firestore): Promise<SchedulerConfig> {
  const firestore = db ?? getFirestore();
  const docRef = firestore.collection('storeMeta').doc('schedulerConfig');

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const doc = await docRef.get();
      if (!doc.exists) {
        logger.info('schedulerConfig: document_missing, using defaults');
        return buildSchedulerConfigFromDefaults();
      }
      const data = doc.data() as Record<string, unknown> | undefined;
      return mergeSchedulerConfigWithDefaults(data ?? {});
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        continue;
      }
      logger.warn('schedulerConfig: read_error_after_retries, using defaults', {
        message: err instanceof Error ? err.message : String(err),
      });
      return buildSchedulerConfigFromDefaults();
    }
  }
  return buildSchedulerConfigFromDefaults();
}

export function buildSchedulerConfigFromDefaults(): SchedulerConfig {
  return {
    monthlyPayrollTriggerEnabled: DEFAULT_MONTHLY_PAYROLL_TRIGGER_ENABLED,
    scheduledCleanupEnabled: DEFAULT_SCHEDULED_CLEANUP_ENABLED,
    scheduleGenerateNextYearBusinessHoursEnabled:
      DEFAULT_SCHEDULE_GENERATE_NEXT_YEAR_BUSINESS_HOURS_ENABLED,
  };
}

function mergeSchedulerConfigWithDefaults(raw: Record<string, unknown>): SchedulerConfig {
  return {
    monthlyPayrollTriggerEnabled:
      typeof raw.monthlyPayrollTriggerEnabled === 'boolean'
        ? raw.monthlyPayrollTriggerEnabled
        : DEFAULT_MONTHLY_PAYROLL_TRIGGER_ENABLED,
    scheduledCleanupEnabled:
      typeof raw.scheduledCleanupEnabled === 'boolean'
        ? raw.scheduledCleanupEnabled
        : DEFAULT_SCHEDULED_CLEANUP_ENABLED,
    scheduleGenerateNextYearBusinessHoursEnabled:
      typeof raw.scheduleGenerateNextYearBusinessHoursEnabled === 'boolean'
        ? raw.scheduleGenerateNextYearBusinessHoursEnabled
        : DEFAULT_SCHEDULE_GENERATE_NEXT_YEAR_BUSINESS_HOURS_ENABLED,
  };
}
