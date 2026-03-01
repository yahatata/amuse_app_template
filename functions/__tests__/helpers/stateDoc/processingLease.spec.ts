/**
 * Phase6 Step3: processingLease の獲得・延長・解放のテスト。
 * §6.5 の分岐（新規獲得 / failed-precondition / resume / stale takeover）を検証。
 * Firestore Emulator 使用。
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = 'test-project-processing-lease';

describe('processingLease (Phase6 Step3)', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let acquireProcessing: typeof import('../../../src/domains/storeMeta/services/processingLease').acquireProcessing;

  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length === 0) {
      admin.initializeApp({ projectId: PROJECT_ID });
    }
    db = getFirestore();
    const mod = await import('../../../src/domains/storeMeta/services/processingLease');
    acquireProcessing = mod.acquireProcessing;
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
    await db.doc('storeMeta/currentBusinessDay').set({
      status: 'running',
      currentBusinessDateKey: '2026-02-09',
      lastClosedBusinessDateKey: null,
      updatedAt: Timestamp.now(),
      source: 'test',
      lastError: null,
    });
  });

  describe('acquireProcessing §6.5', () => {
    it('(1) processing なし → 新規獲得できる', async () => {
      if (!emulatorAvailable) return;
      const result = await acquireProcessing(db, {
        runId: 'close_2026-02-09_1',
        kind: 'close',
      });
      expect(result.acquired).toBe(true);
      expect(result.resumed).toBeFalsy();
      expect(result.staleTakeover).toBeFalsy();
      const snap = await db.doc('storeMeta/currentBusinessDay').get();
      expect(snap.data()?.processing?.runId).toBe('close_2026-02-09_1');
      expect(snap.data()?.processing?.kind).toBe('close');
    });

    it('(2-1) processing 有効で requestRunId なし → failed-precondition', async () => {
      if (!emulatorAvailable) return;
      await acquireProcessing(db, { runId: 'close_2026-02-09_1', kind: 'close' });
      await expect(
        acquireProcessing(db, { runId: 'close_2026-02-09_2', kind: 'close' })
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });

    it('(2-2) processing 有効で requestRunId 一致 → resume OK', async () => {
      if (!emulatorAvailable) return;
      await acquireProcessing(db, { runId: 'close_2026-02-09_1', kind: 'close' });
      const result = await acquireProcessing(db, {
        runId: 'close_2026-02-09_1',
        kind: 'close',
        requestRunId: 'close_2026-02-09_1',
      });
      expect(result.acquired).toBe(true);
      expect(result.resumed).toBe(true);
    });

    it('(2-3) processing 有効で requestRunId 不一致 → failed-precondition', async () => {
      if (!emulatorAvailable) return;
      await acquireProcessing(db, { runId: 'close_2026-02-09_1', kind: 'close' });
      await expect(
        acquireProcessing(db, {
          runId: 'close_2026-02-09_2',
          kind: 'close',
          requestRunId: 'close_2026-02-09_2',
        })
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });

    it('(3) processing 期限切れ → stale takeover、旧 run が stale になる', async () => {
      if (!emulatorAvailable) return;
      const past = Date.now() - 130 * 1000;
      await db.doc('storeMeta/currentBusinessDay').update({
        processing: {
          runId: 'close_2026-02-09_old',
          startedAt: Timestamp.fromMillis(past),
          leaseExpiresAt: Timestamp.fromMillis(past + 120 * 1000),
          kind: 'close',
        },
        updatedAt: Timestamp.now(),
      });
      const result = await acquireProcessing(db, {
        runId: 'close_2026-02-09_new',
        kind: 'close',
      });
      expect(result.acquired).toBe(true);
      expect(result.staleTakeover).toBe(true);
      expect((await db.doc('storeMeta/currentBusinessDay').get()).data()?.processing?.runId).toBe(
        'close_2026-02-09_new'
      );
      const oldRunSnap = await db.collection('storeMeta').doc('closeRuns').collection('runs').doc('close_2026-02-09_old').get();
      expect(oldRunSnap.exists).toBe(true);
      expect(oldRunSnap.data()?.status).toBe('stale');
    });
  });
});
