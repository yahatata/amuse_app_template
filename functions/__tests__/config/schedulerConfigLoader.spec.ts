/**
 * schedulerConfigLoader のテスト
 *
 * - buildSchedulerConfigFromDefaults: デフォルト値が返ること
 * - getSchedulerConfig: Firestore 未存在時はデフォルト、存在時はマージ結果
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import {
  getSchedulerConfig,
  buildSchedulerConfigFromDefaults,
} from '../../src/shared/config/schedulerConfigLoader';
import {
  DEFAULT_MONTHLY_PAYROLL_TRIGGER_ENABLED,
  DEFAULT_SCHEDULED_CLEANUP_ENABLED,
  DEFAULT_SCHEDULE_GENERATE_NEXT_YEAR_BUSINESS_HOURS_ENABLED,
} from '../../src/shared/config/defaults';

const PROJECT_ID = 'test-scheduler-config';

describe('schedulerConfigLoader', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
    if (admin.apps.length) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    if (!emulatorAvailable) return;
    try {
      await testEnv.clearFirestore();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
        emulatorAvailable = false;
        console.warn('Firestore Emulator 未起動のためスキップします。');
        return;
      }
      throw e;
    }
  });

  describe('buildSchedulerConfigFromDefaults', () => {
    it('デフォルト値が返ること', () => {
      const config = buildSchedulerConfigFromDefaults();
      expect(config.monthlyPayrollTriggerEnabled).toBe(DEFAULT_MONTHLY_PAYROLL_TRIGGER_ENABLED);
      expect(config.scheduledCleanupEnabled).toBe(DEFAULT_SCHEDULED_CLEANUP_ENABLED);
      expect(config.scheduleGenerateNextYearBusinessHoursEnabled).toBe(
        DEFAULT_SCHEDULE_GENERATE_NEXT_YEAR_BUSINESS_HOURS_ENABLED
      );
    });
  });

  describe('getSchedulerConfig', () => {
    const itWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? it : it.skip;

    itWithEmulator('storeMeta/schedulerConfig が存在しない場合はデフォルトを返す', async () => {
      if (!emulatorAvailable) return;
      const config = await getSchedulerConfig(db);
      expect(config.monthlyPayrollTriggerEnabled).toBe(DEFAULT_MONTHLY_PAYROLL_TRIGGER_ENABLED);
      expect(config.scheduledCleanupEnabled).toBe(DEFAULT_SCHEDULED_CLEANUP_ENABLED);
      expect(config.scheduleGenerateNextYearBusinessHoursEnabled).toBe(
        DEFAULT_SCHEDULE_GENERATE_NEXT_YEAR_BUSINESS_HOURS_ENABLED
      );
    });

    itWithEmulator('storeMeta/schedulerConfig が存在する場合はマージ結果を返す', async () => {
      if (!emulatorAvailable) return;
      await db.collection('storeMeta').doc('schedulerConfig').set({
        monthlyPayrollTriggerEnabled: false,
        scheduledCleanupEnabled: true,
      });

      const config = await getSchedulerConfig(db);
      expect(config.monthlyPayrollTriggerEnabled).toBe(false);
      expect(config.scheduledCleanupEnabled).toBe(true);
      expect(config.scheduleGenerateNextYearBusinessHoursEnabled).toBe(
        DEFAULT_SCHEDULE_GENERATE_NEXT_YEAR_BUSINESS_HOURS_ENABLED
      );
    });
  });
});
