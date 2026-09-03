/**
 * Phase6.5: 営業管理操作の権限拡張（store_management オプション）の統合テスト。
 *
 * 検証内容:
 * - requireAdmin を利用する Callable: admin / terminal+store_management で通過、terminal のみ・0件・2件・非アクティブで permission-denied
 * - openStoreTerminal / closeStoreTerminal: terminal+store_management で開店・閉店が成功すること
 * - permission-denied 時のメッセージが「営業管理の権限がありません」であること
 *
 * Firestore Emulator 使用（localhost:8081）。
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = 'test-project-phase6-5';

describe('Phase6.5: 営業管理権限（store_management）', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let getUnsettledBillsForClose: typeof import('../../src/domains/storeMeta/services/getUnsettledBillsForClose').getUnsettledBillsForClose;
  let applyCloseSnapshot: typeof import('../../src/domains/storeMeta/services/applyCloseSnapshot').applyCloseSnapshot;
  let openStoreTerminal: typeof import('../../src/domains/storeMeta/callables/openStoreTerminal').openStoreTerminal;
  let closeStoreTerminal: typeof import('../../src/domains/storeMeta/callables/closeStoreTerminal').closeStoreTerminal;

  let emulatorAvailable = true;
  const PERMISSION_DENIED_MESSAGE = '営業管理の権限がありません';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map(a => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();

    const getMod = await import('../../src/domains/storeMeta/services/getUnsettledBillsForClose');
    const applyMod = await import('../../src/domains/storeMeta/services/applyCloseSnapshot');
    const openMod = await import('../../src/domains/storeMeta/callables/openStoreTerminal');
    const closeMod = await import('../../src/domains/storeMeta/callables/closeStoreTerminal');

    getUnsettledBillsForClose = getMod.getUnsettledBillsForClose;
    applyCloseSnapshot = applyMod.applyCloseSnapshot;
    openStoreTerminal = openMod.openStoreTerminal;
    closeStoreTerminal = closeMod.closeStoreTerminal;
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

  describe('getUnsettledBillsForClose（requireAdmin 経由）', () => {
    it('admin デバイスで呼ぶと success と data/returnedCount/truncated が返る', async () => {
      if (!emulatorAvailable) return;
      await db.collection('devices').doc('dev-admin').set({
        uid: 'uid-admin',
        role: 'admin',
      });
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'running',
        currentBusinessDateKey: '2026-02-12',
        lastClosedBusinessDateKey: null,
        updatedAt: Timestamp.now(),
        source: 'test',
        lastError: null,
      });

      const result = await getUnsettledBillsForClose.run({
        auth: { uid: 'uid-admin' },
        data: {},
      } as any);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('returnedCount');
      expect(result).toHaveProperty('truncated');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('terminal + store_management デバイスで呼ぶと success が返る', async () => {
      if (!emulatorAvailable) return;
      await db.collection('devices').doc('dev-terminal-sm').set({
        uid: 'uid-terminal-sm',
        role: 'terminal',
        options: { store_management: true },
        status: 'active',
      });
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'running',
        currentBusinessDateKey: '2026-02-12',
        lastClosedBusinessDateKey: null,
        updatedAt: Timestamp.now(),
        source: 'test',
        lastError: null,
      });

      const result = await getUnsettledBillsForClose.run({
        auth: { uid: 'uid-terminal-sm' },
        data: {},
      } as any);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('terminal（store_management なし）で呼ぶと permission-denied で「営業管理の権限がありません」', async () => {
      if (!emulatorAvailable) return;
      await db.collection('devices').doc('dev-terminal-only').set({
        uid: 'uid-terminal-only',
        role: 'terminal',
        options: {},
        status: 'active',
      });
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'running',
        currentBusinessDateKey: '2026-02-12',
        lastClosedBusinessDateKey: null,
        updatedAt: Timestamp.now(),
        source: 'test',
        lastError: null,
      });

      await expect(
        getUnsettledBillsForClose.run({
          auth: { uid: 'uid-terminal-only' },
          data: {},
        } as any)
      ).rejects.toMatchObject({
        code: 'permission-denied',
        message: PERMISSION_DENIED_MESSAGE,
      });
    });

    it('uid に紐づくデバイスが 0 件のとき permission-denied', async () => {
      if (!emulatorAvailable) return;
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'running',
        currentBusinessDateKey: '2026-02-12',
        lastClosedBusinessDateKey: null,
        updatedAt: Timestamp.now(),
        source: 'test',
        lastError: null,
      });

      await expect(
        getUnsettledBillsForClose.run({
          auth: { uid: 'uid-no-device' },
          data: {},
        } as any)
      ).rejects.toMatchObject({
        code: 'permission-denied',
        message: PERMISSION_DENIED_MESSAGE,
      });
    });

    it('同一 uid でデバイスが 2 件あるとデータ不整合として permission-denied', async () => {
      if (!emulatorAvailable) return;
      await db.collection('devices').doc('dev-dup-1').set({
        uid: 'uid-dup',
        role: 'admin',
      });
      await db.collection('devices').doc('dev-dup-2').set({
        uid: 'uid-dup',
        role: 'admin',
      });
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'running',
        currentBusinessDateKey: '2026-02-12',
        lastClosedBusinessDateKey: null,
        updatedAt: Timestamp.now(),
        source: 'test',
        lastError: null,
      });

      await expect(
        getUnsettledBillsForClose.run({
          auth: { uid: 'uid-dup' },
          data: {},
        } as any)
      ).rejects.toMatchObject({
        code: 'permission-denied',
        message: PERMISSION_DENIED_MESSAGE,
      });
    });

    it('status が active でないデバイスでは permission-denied', async () => {
      if (!emulatorAvailable) return;
      await db.collection('devices').doc('dev-blocked').set({
        uid: 'uid-blocked',
        role: 'admin',
        status: 'blocked',
      });
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'running',
        currentBusinessDateKey: '2026-02-12',
        lastClosedBusinessDateKey: null,
        updatedAt: Timestamp.now(),
        source: 'test',
        lastError: null,
      });

      await expect(
        getUnsettledBillsForClose.run({
          auth: { uid: 'uid-blocked' },
          data: {},
        } as any)
      ).rejects.toMatchObject({
        code: 'permission-denied',
        message: PERMISSION_DENIED_MESSAGE,
      });
    });
  });

  describe('applyCloseSnapshot（requireAdmin 経由）', () => {
    it('terminal + store_management で呼ぶと success', async () => {
      if (!emulatorAvailable) return;
      await db.collection('devices').doc('dev-sm').set({
        uid: 'uid-sm',
        role: 'terminal',
        options: { store_management: true },
        status: 'active',
      });
      await db.collection('users').doc('user-1').set({ displayName: 'User' });
      await db.collection('bills').doc('bill-1').set({
        businessDate: '2026-02-12',
        status: 'open',
        party: { userId: 'user-1', pokerName: 'P' },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      await db.collection('bills').doc('bill-1').collection('items').doc('i1').set({
        totalPriceIncl: 500,
        voided: false,
      });
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'running',
        currentBusinessDateKey: '2026-02-12',
        lastClosedBusinessDateKey: null,
        updatedAt: Timestamp.now(),
        source: 'test',
        lastError: null,
      });

      const result = await applyCloseSnapshot.run({
        auth: { uid: 'uid-sm' },
        data: { billIds: ['bill-1'], amountsByBillId: { 'bill-1': 500 } },
      } as any);

      expect(result.success).toBe(true);
      expect(result.updatedBillIds).toContain('bill-1');
      const bill = await db.collection('bills').doc('bill-1').get();
      expect(bill.data()?.closeSnapshot?.lastCloseRunId).toBeDefined();
    });

    it('terminal（store_management なし）で呼ぶと permission-denied', async () => {
      if (!emulatorAvailable) return;
      await db.collection('devices').doc('dev-no-sm').set({
        uid: 'uid-no-sm',
        role: 'terminal',
        options: {},
        status: 'active',
      });
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'running',
        currentBusinessDateKey: '2026-02-12',
        lastClosedBusinessDateKey: null,
        updatedAt: Timestamp.now(),
        source: 'test',
        lastError: null,
      });

      await expect(
        applyCloseSnapshot.run({
          auth: { uid: 'uid-no-sm' },
          data: { billIds: [], amountsByBillId: {} },
        } as any)
      ).rejects.toMatchObject({
        code: 'permission-denied',
        message: PERMISSION_DENIED_MESSAGE,
      });
    });
  });

  describe('openStoreTerminal / closeStoreTerminal', () => {
    it('terminal + store_management で closeStoreTerminal が成功する', async () => {
      if (!emulatorAvailable) return;
      await db.collection('devices').doc('dev-sm-2').set({
        uid: 'uid-sm-2',
        role: 'terminal',
        options: { store_management: true },
        status: 'active',
      });
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'running',
        currentBusinessDateKey: '2026-02-12',
        lastClosedBusinessDateKey: null,
        updatedAt: Timestamp.now(),
        source: 'test',
        lastError: null,
      });

      const result = await (closeStoreTerminal as any).run({
        auth: { uid: 'uid-sm-2' },
        data: { forceClose: true },
      });

      expect(result.success).toBe(true);
      const snap = await db.collection('storeMeta').doc('currentBusinessDay').get();
      expect(snap.data()?.status).toBe('closed');
      expect(snap.data()?.currentBusinessDateKey).toBeNull();
    });

    it('terminal + store_management で openStoreTerminal が成功する', async () => {
      if (!emulatorAvailable) return;
      await db.collection('devices').doc('dev-sm-3').set({
        uid: 'uid-sm-3',
        role: 'terminal',
        options: { store_management: true },
        status: 'active',
      });
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'closed',
        currentBusinessDateKey: null,
        lastClosedBusinessDateKey: '2026-02-11',
        updatedAt: Timestamp.now(),
        source: 'test',
        lastError: null,
      });

      const result = await (openStoreTerminal as any).run({
        auth: { uid: 'uid-sm-3' },
        data: { businessDateKey: '2026-02-12' },
      });

      expect(result.success).toBe(true);
      const snap = await db.collection('storeMeta').doc('currentBusinessDay').get();
      expect(snap.data()?.status).toBe('running');
      expect(snap.data()?.currentBusinessDateKey).toBe('2026-02-12');
    });

    it('terminal（store_management なし）で closeStoreTerminal を呼ぶと permission-denied', async () => {
      if (!emulatorAvailable) return;
      await db.collection('devices').doc('dev-no-sm-2').set({
        uid: 'uid-no-sm-2',
        role: 'terminal',
        options: {},
        status: 'active',
      });
      await db.collection('storeMeta').doc('currentBusinessDay').set({
        status: 'running',
        currentBusinessDateKey: '2026-02-12',
        lastClosedBusinessDateKey: null,
        updatedAt: Timestamp.now(),
        source: 'test',
        lastError: null,
      });

      await expect(
        (closeStoreTerminal as any).run({
          auth: { uid: 'uid-no-sm-2' },
          data: {},
        })
      ).rejects.toMatchObject({
        code: 'permission-denied',
        message: PERMISSION_DENIED_MESSAGE,
      });

      const snap = await db.collection('storeMeta').doc('currentBusinessDay').get();
      expect(snap.data()?.status).toBe('running');
      expect(snap.data()?.currentBusinessDateKey).toBe('2026-02-12');
      const runs = await db.collection('storeMeta').doc('closeRuns').collection('runs').get();
      expect(runs.empty).toBe(true);
    });
  });
});
