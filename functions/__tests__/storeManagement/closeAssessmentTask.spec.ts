/**
 * closeAssessmentTask: stale close_assessment タスク無害化
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  closeAssessmentTask,
  isTargetDayAlreadyClosed,
} from '../../src/domains/storeMeta/callables/closeAssessmentTask';

const PROJECT_ID = 'test-project-close-assessment-task';

function getJstDateKeys(): { todayKey: string; yesterdayKey: string } {
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const d = new Date(jstNow);
  d.setHours(0, 0, 0, 0);
  const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const yesterday = new Date(d);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  return { todayKey, yesterdayKey };
}

async function runCloseAssessmentTask(params: {
  intendedBusinessDateKey: string;
  scheduledAt?: string;
}) {
  const scheduledAt = params.scheduledAt ?? new Date().toISOString();
  const req = {
    body: {
      action: 'close_assessment',
      intendedBusinessDateKey: params.intendedBusinessDateKey,
      scheduledAt,
    },
    method: 'POST',
  };
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.body = data;
      return this;
    },
  };
  await (closeAssessmentTask as unknown as (req: unknown, res: unknown) => Promise<void>)(
    req,
    res
  );
  return res;
}

describe('isTargetDayAlreadyClosed', () => {
  it('lastClosedBusinessDateKey == intendedBusinessDateKey なら true', () => {
    expect(isTargetDayAlreadyClosed('2026-05-26', '2026-05-26')).toBe(true);
  });

  it('lastClosedBusinessDateKey > intendedBusinessDateKey なら true', () => {
    expect(isTargetDayAlreadyClosed('2026-05-27', '2026-05-26')).toBe(true);
  });

  it('lastClosedBusinessDateKey < intendedBusinessDateKey なら false', () => {
    expect(isTargetDayAlreadyClosed('2026-05-25', '2026-05-26')).toBe(false);
  });

  it('lastClosedBusinessDateKey が null / 空なら false', () => {
    expect(isTargetDayAlreadyClosed(null, '2026-05-26')).toBe(false);
    expect(isTargetDayAlreadyClosed('', '2026-05-26')).toBe(false);
  });
});

describe('closeAssessmentTask stale close_assessment', () => {
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
        console.warn('Firestore Emulator 未起動のためスキップします。');
        return;
      }
      throw e;
    }
  });

  async function seedState(data: Record<string, unknown>) {
    await db.collection('storeMeta').doc('currentBusinessDay').set({
      updatedAt: Timestamp.now(),
      source: 'test',
      lastError: null,
      ...data,
    });
  }

  it('対象日閉店済み・翌日開店済みで古いタスク実行 → skipped（next_day_started にならない）', async () => {
    if (!emulatorAvailable) return;
    const { todayKey, yesterdayKey } = getJstDateKeys();
    await seedState({
      status: 'running',
      currentBusinessDateKey: todayKey,
      lastClosedBusinessDateKey: yesterdayKey,
    });

    const scheduledAt = new Date().toISOString();
    const res = await runCloseAssessmentTask({
      intendedBusinessDateKey: yesterdayKey,
      scheduledAt,
    });

    expect(res.statusCode).toBe(200);
    const snap = await db.collection('storeMeta').doc('currentBusinessDay').get();
    const closeAssessment = snap.data()?.closeAssessment as Record<string, unknown>;
    expect(closeAssessment.result).toBe('skipped');
    expect(closeAssessment.blockers).toEqual(['target_day_already_closed']);
    expect(closeAssessment.intendedBusinessDateKey).toBe(yesterdayKey);
    expect(closeAssessment.currentBusinessDateKey).toBe(todayKey);
    expect(closeAssessment.lastClosedBusinessDateKey).toBe(yesterdayKey);
    expect(closeAssessment.result).not.toBe('next_day_started');
  });

  it('lastClosedBusinessDateKey > intendedBusinessDateKey でも stale skipped', async () => {
    if (!emulatorAvailable) return;
    const { todayKey, yesterdayKey } = getJstDateKeys();
    await seedState({
      status: 'running',
      currentBusinessDateKey: todayKey,
      lastClosedBusinessDateKey: todayKey,
    });

    const res = await runCloseAssessmentTask({
      intendedBusinessDateKey: yesterdayKey,
    });

    expect(res.statusCode).toBe(200);
    const snap = await db.collection('storeMeta').doc('currentBusinessDay').get();
    const closeAssessment = snap.data()?.closeAssessment as Record<string, unknown>;
    expect(closeAssessment.result).toBe('skipped');
    expect(closeAssessment.blockers).toEqual(['target_day_already_closed']);
  });

  it('本当に未閉店なら next_day_started のまま', async () => {
    if (!emulatorAvailable) return;
    const { todayKey, yesterdayKey } = getJstDateKeys();
    await seedState({
      status: 'running',
      currentBusinessDateKey: todayKey,
      lastClosedBusinessDateKey: null,
    });

    const res = await runCloseAssessmentTask({
      intendedBusinessDateKey: yesterdayKey,
    });

    expect(res.statusCode).toBe(200);
    const snap = await db.collection('storeMeta').doc('currentBusinessDay').get();
    const closeAssessment = snap.data()?.closeAssessment as Record<string, unknown>;
    expect(closeAssessment.result).toBe('next_day_started');
  });

  it('status == closed && lastClosed == intended は既存どおり already_closed', async () => {
    if (!emulatorAvailable) return;
    const { yesterdayKey } = getJstDateKeys();
    await seedState({
      status: 'closed',
      currentBusinessDateKey: null,
      lastClosedBusinessDateKey: yesterdayKey,
    });

    const res = await runCloseAssessmentTask({
      intendedBusinessDateKey: yesterdayKey,
    });

    expect(res.statusCode).toBe(200);
    const snap = await db.collection('storeMeta').doc('currentBusinessDay').get();
    const closeAssessment = snap.data()?.closeAssessment as Record<string, unknown>;
    expect(closeAssessment.result).toBe('already_closed');
  });
});
