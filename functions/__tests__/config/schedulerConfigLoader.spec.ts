/**
 * schedulerConfigLoader のテスト
 *
 * - buildSchedulerConfigFromDefaults: v2 デフォルト値が返ること
 * - getSchedulerConfig: 未存在時フォールバック、v2 正規化読み取り
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import {
  getSchedulerConfig,
  buildSchedulerConfigFromDefaults,
} from '../../src/shared/config/schedulerConfigLoader';
import {
  DEFAULT_SCHEDULER_SCHEMA_VERSION,
  DEFAULT_SCHEDULER_SUPERVISOR_ENABLED,
  DEFAULT_SCHEDULER_PLANNING_HORIZON_DAYS,
} from '../../src/shared/config/schedulerConfigDefaults';

const PROJECT_ID = 'test-scheduler-config';

describe('schedulerConfigLoader', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST =
      process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';
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
        return;
      }
      throw e;
    }
  });

  describe('buildSchedulerConfigFromDefaults', () => {
    it('v2デフォルト値が返ること', () => {
      const config = buildSchedulerConfigFromDefaults();

      expect(config.schemaVersion).toBe(DEFAULT_SCHEDULER_SCHEMA_VERSION);
      expect(config.supervisorEnabled).toBe(DEFAULT_SCHEDULER_SUPERVISOR_ENABLED);
      expect(config.planningHorizonDays).toBe(DEFAULT_SCHEDULER_PLANNING_HORIZON_DAYS);

      expect(config.jobs.weeklyPlanner.scheduleKind).toBe('weekly');
      expect(config.jobs.weeklyPlanner.runAtJst).toBe('04:40');
      expect(config.jobs.weeklyPlanner.dayOfWeek).toBe(4);

      expect(config.jobs.enqueueTournamentTasksByScheduler.scheduleKind).toBe('daily');
      expect(config.jobs.scheduledCleanup.scheduleKind).toBe('daily');
      expect(config.jobs.scheduleGenerateNextYearBusinessHours.scheduleKind).toBe(
        'yearly'
      );
      expect(config.jobs.scheduledCleanup.enabled).toBe(true);
    });
  });

  describe('getSchedulerConfig', () => {
    const itWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? it : it.skip;

    itWithEmulator('未存在時はv2デフォルトを返す', async () => {
      if (!emulatorAvailable) return;
      const config = await getSchedulerConfig(db);
      expect(config.schemaVersion).toBe(DEFAULT_SCHEDULER_SCHEMA_VERSION);
      expect(config.supervisorEnabled).toBe(DEFAULT_SCHEDULER_SUPERVISOR_ENABLED);
      expect(config.planningHorizonDays).toBe(DEFAULT_SCHEDULER_PLANNING_HORIZON_DAYS);
      expect(config.jobs.scheduledCleanup.enabled).toBe(true);
    });

    itWithEmulator('v2ドキュメントを読み取り、妥当値を反映する', async () => {
      if (!emulatorAvailable) return;
      await db.collection('storeMeta').doc('schedulerConfig').set({
        schemaVersion: 2,
        supervisorEnabled: false,
        planningHorizonDays: 10,
        jobs: {
          weeklyPlanner: {
            enabled: true,
            scheduleKind: 'weekly',
            runAtJst: '04:45',
            dayOfWeek: 5,
            timezone: 'Asia/Tokyo',
          },
          enqueueTournamentTasksByScheduler: {
            enabled: false,
            scheduleKind: 'daily',
            runAtJst: '05:10',
            timezone: 'Asia/Tokyo',
          },
        },
      });

      const config = await getSchedulerConfig(db);
      expect(config.schemaVersion).toBe(2);
      expect(config.supervisorEnabled).toBe(false);
      expect(config.planningHorizonDays).toBe(10);
      expect(config.jobs.weeklyPlanner.runAtJst).toBe('04:45');
      expect(config.jobs.weeklyPlanner.dayOfWeek).toBe(5);
      expect(config.jobs.enqueueTournamentTasksByScheduler.enabled).toBe(false);
      expect(config.jobs.enqueueTournamentTasksByScheduler.runAtJst).toBe('05:10');
    });

    itWithEmulator('jobs.enabled の指定を読み取りできる', async () => {
      if (!emulatorAvailable) return;
      await db.collection('storeMeta').doc('schedulerConfig').set({
        jobs: {
          scheduledCleanup: {
            enabled: false,
            scheduleKind: 'daily',
            runAtJst: '05:00',
            timezone: 'Asia/Tokyo',
          },
          scheduleGenerateNextYearBusinessHours: {
            enabled: false,
            scheduleKind: 'yearly',
            runAtJst: '05:10',
            month: 1,
            dayOfMonth: 29,
            timezone: 'Asia/Tokyo',
          },
        },
      });

      const config = await getSchedulerConfig(db);
      expect(config.jobs.scheduledCleanup.enabled).toBe(false);
      expect(config.jobs.scheduleGenerateNextYearBusinessHours.enabled).toBe(false);
    });
  });
});
