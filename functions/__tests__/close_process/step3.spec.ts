/**
 * Phase6 Step3: close_process 関連の検証。
 * - Step2 applyCloseSnapshot: closeRunId=step2-manual、返却に writtenBillIds を含まない
 * - getUnsettledBillsForClose: 返却形式（success, data, returnedCount, truncated）
 * - closeStore / openStore が export されていること
 * Firestore Emulator 使用。
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = 'test-project-close-process-step3';

describe('Phase6 Step3: close_process', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let applyCloseSnapshot: typeof import('../../src/domains/storeMeta/services/applyCloseSnapshot').applyCloseSnapshot;
  let getUnsettledBillsForClose: typeof import('../../src/domains/storeMeta/services/getUnsettledBillsForClose').getUnsettledBillsForClose;
  let finalizeUnsettledBillAfterAccounting: typeof import('../../src/domains/storeMeta/services/finalizeUnsettledBillAfterAccounting').finalizeUnsettledBillAfterAccounting;

  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map(a => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();
    const applyMod = await import('../../src/domains/storeMeta/services/applyCloseSnapshot');
    const getMod = await import('../../src/domains/storeMeta/services/getUnsettledBillsForClose');
    const finalizeMod = await import('../../src/domains/storeMeta/services/finalizeUnsettledBillAfterAccounting');
    applyCloseSnapshot = applyMod.applyCloseSnapshot;
    getUnsettledBillsForClose = getMod.getUnsettledBillsForClose;
    finalizeUnsettledBillAfterAccounting = finalizeMod.finalizeUnsettledBillAfterAccounting;
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
    await db.collection('users').doc('user-1').set({ displayName: 'Test User' });
    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'running',
      currentBusinessDateKey: '2026-02-09',
      lastClosedBusinessDateKey: null,
      updatedAt: Timestamp.now(),
      source: 'test',
      lastError: null,
    });
  });

  describe('Step2 applyCloseSnapshot の入出力維持', () => {
    it('Callable は core を closeRunId=step2-manual で呼び、返却に writtenBillIds を含まない', async () => {
      if (!emulatorAvailable) return;
      const businessDate = '2026-02-09';
      await db.collection('bills').doc('bill-1').set({
        businessDate,
        status: 'open',
        party: { userId: 'user-1', pokerName: 'Test' },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      await db.collection('bills').doc('bill-1').collection('items').doc('i1').set({
        totalPriceIncl: 1000,
        voided: false,
      });

      const result = await applyCloseSnapshot.run({
        auth: { uid: 'admin-uid-1' },
        data: { billIds: ['bill-1'], amountsByBillId: { 'bill-1': 1000 } },
      } as any);

      expect(result.success).toBe(true);
      expect(result.updatedBillIds).toContain('bill-1');
      expect(result.updatedCount).toBe(1);
      expect(result).not.toHaveProperty('writtenBillIds');

      const bill = await db.collection('bills').doc('bill-1').get();
      expect(bill.data()?.closeSnapshot?.lastCloseRunId).toBe('step2-manual');
      expect(bill.data()?.closeSummary?.lastCloseRunId).toBe('step2-manual');
      expect(bill.data()?.closeSummary?.unresolved).toBe(true);
    });

    it('finalizeUnsettledBillAfterAccounting で closeSummary / closeSnapshot の unresolved が false になる', async () => {
      if (!emulatorAvailable) return;
      const businessDate = '2026-02-09';
      await db.collection('bills').doc('bill-2').set({
        businessDate,
        status: 'settled',
        party: { userId: 'user-1', pokerName: 'Test' },
        closeSummary: {
          lastCloseRunId: 'step2-manual',
          markedAt: Timestamp.now(),
          closedBusinessDate: businessDate,
          unresolved: true,
          displayAmountAtMark: 1000,
        },
        closeSnapshot: {
          lastCloseRunId: 'step2-manual',
          markedAt: Timestamp.now(),
          closedBusinessDate: businessDate,
          unresolved: true,
          displayAmountAtMark: 1000,
        },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const result = await finalizeUnsettledBillAfterAccounting.run({
        auth: { uid: 'admin-uid-1' },
        data: { billId: 'bill-2' },
      } as any);

      expect(result.success).toBe(true);

      const bill = await db.collection('bills').doc('bill-2').get();
      expect(bill.data()?.closeSummary?.unresolved).toBe(false);
      expect(bill.data()?.closeSnapshot?.unresolved).toBe(false);
    });
  });

  describe('getUnsettledBillsForClose の返却形式', () => {
    it('success, data, returnedCount, truncated のキーがある', async () => {
      if (!emulatorAvailable) return;
      const result = await getUnsettledBillsForClose.run({
        auth: { uid: 'admin-uid-1' },
        data: {},
      } as any);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('returnedCount');
      expect(result).toHaveProperty('truncated');
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('closeStore / openStore が残存している', () => {
    it('storeManagement から openStore / closeStore が import でき、.run が存在する', async () => {
      if (!emulatorAvailable) return;
      const storeMeta = await import('../../src/domains/storeMeta');
      expect(storeMeta.openStore).toBeDefined();
      expect(storeMeta.closeStore).toBeDefined();
      expect(typeof storeMeta.openStore.run).toBe('function');
      expect(typeof storeMeta.closeStore.run).toBe('function');
    });
  });
});
