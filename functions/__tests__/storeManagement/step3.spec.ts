/**
 * Phase6 Step3: 閉店・開店ターミナルと既存 openStore/closeStore の統合テスト。
 * - 入口で status 不備なら invalid-argument
 * - ロック中（processing 有効で runId なし）→ failed-precondition
 * - 既存 openStore / closeStore で state が更新されること
 * Firestore Emulator 使用。
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = 'test-project-store-mgmt-step3';

describe('Phase6 Step3: storeManagement 統合', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let closeStoreTerminal: typeof import('../../src/domains/storeMeta/callables/closeStoreTerminal').closeStoreTerminal;
  let openStore: typeof import('../../src/domains/storeMeta/callables/openStore').openStore;
  let closeStore: typeof import('../../src/domains/storeMeta/callables/closeStore').closeStore;

  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map(a => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();
    closeStoreTerminal = (await import('../../src/domains/storeMeta/callables/closeStoreTerminal')).closeStoreTerminal;
    openStore = (await import('../../src/domains/storeMeta/callables/openStore')).openStore;
    closeStore = (await import('../../src/domains/storeMeta/callables/closeStore')).closeStore;
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
    await db.collection('devices').doc('admin-1').set({ uid: 'admin-uid-1', role: 'admin' });
  });

  describe('closeStoreTerminal 入口チェック', () => {
    it('status が running でないと invalid-argument', async () => {
      if (!emulatorAvailable) return;
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'closed',
        currentBusinessDateKey: null,
        lastClosedBusinessDateKey: '2026-02-09',
        updatedAt: Timestamp.now(),
        source: 'test',
        lastError: null,
      });
      await expect(
        closeStoreTerminal.run({ auth: { uid: 'admin-uid-1' }, data: {} } as any)
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    });

    it('currentBusinessDateKey が空だと invalid-argument', async () => {
      if (!emulatorAvailable) return;
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'running',
        currentBusinessDateKey: null,
        lastClosedBusinessDateKey: null,
        updatedAt: Timestamp.now(),
        source: 'test',
        lastError: null,
      });
      await expect(
        closeStoreTerminal.run({ auth: { uid: 'admin-uid-1' }, data: {} } as any)
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    });
  });

  describe('ロック中（failed-precondition）', () => {
    it('processing が有効なときに runId なしで閉店を呼ぶと failed-precondition', async () => {
      if (!emulatorAvailable) return;
      const now = Timestamp.now();
      const expires = Timestamp.fromMillis(now.toMillis() + 120 * 1000);
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'running',
        currentBusinessDateKey: '2026-02-09',
        lastClosedBusinessDateKey: null,
        updatedAt: now,
        source: 'test',
        lastError: null,
        processing: {
          runId: 'close_2026-02-09_1',
          startedAt: now,
          leaseExpiresAt: expires,
          kind: 'close',
        },
      });
      await expect(
        closeStoreTerminal.run({ auth: { uid: 'admin-uid-1' }, data: {} } as any)
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });
  });

  describe('既存 openStore / closeStore', () => {
    it('closeStore で status=running, currentBusinessDateKey あり → closed に更新される', async () => {
      if (!emulatorAvailable) return;
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'running',
        currentBusinessDateKey: '2026-02-09',
        lastClosedBusinessDateKey: null,
        updatedAt: Timestamp.now(),
        source: 'test',
        lastError: null,
      });
      const result = await closeStore.run({ auth: { uid: 'admin-uid-1' }, data: {} } as any);
      expect(result.success).toBe(true);
      expect(result.lastClosedBusinessDateKey).toBe('2026-02-09');
      const snap = await db.collection('storeMeta').doc('currentBusinessDay').get();
      expect(snap.data()?.status).toBe('closed');
      expect(snap.data()?.currentBusinessDateKey).toBeNull();
    });

    it('openStore で status=closed → running に更新される', async () => {
      if (!emulatorAvailable) return;
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'closed',
        currentBusinessDateKey: null,
        lastClosedBusinessDateKey: '2026-02-09',
        updatedAt: Timestamp.now(),
        source: 'test',
        lastError: null,
      });
      const result = await openStore.run({
        auth: { uid: 'admin-uid-1' },
        data: { businessDateKey: '2026-02-10' },
      } as any);
      expect(result.success).toBe(true);
      const snap = await db.collection('storeMeta').doc('currentBusinessDay').get();
      expect(snap.data()?.status).toBe('running');
      expect(snap.data()?.currentBusinessDateKey).toBe('2026-02-10');
    });
  });
});
