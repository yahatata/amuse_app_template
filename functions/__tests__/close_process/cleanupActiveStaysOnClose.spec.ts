/**
 * runCleanupActiveStays テスト
 *
 * Firestore Emulator を使用した統合テスト（public callable wrapper 削除後）
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

describe('runCleanupActiveStays', () => {
  let testEnv: any;
  let db: admin.firestore.Firestore;
  let runCleanupActiveStays: typeof import('../../src/domains/storeMeta/services/cleanupActiveStaysOnClose').runCleanupActiveStays;
  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';

    testEnv = await initializeTestEnvironment({
      projectId: 'test-project-cleanup',
    });

    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map(a => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: 'test-project-cleanup' });

    db = getFirestore();
    const mod = await import('../../src/domains/storeMeta/services/cleanupActiveStaysOnClose');
    runCleanupActiveStays = mod.runCleanupActiveStays;
  });

  afterAll(async () => {
    await testEnv.cleanup();
    if (admin.apps.length) {
      await Promise.all(admin.apps.map(a => a?.delete()).filter(Boolean));
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

  describe('正常系', () => {
    it('isActive==true の doc を3件 → 実行 → 3件削除・二回目は0件（冪等）', async () => {
      if (!emulatorAvailable) return;
      await db.collection('activeStays').doc('uid-1').set({
        uid: 'uid-1',
        billId: 'bill-1',
        pokerName: 'Player 1',
        table: 'Table 1',
        seat: 1,
        isActive: true,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection('activeStays').doc('uid-2').set({
        uid: 'uid-2',
        billId: 'bill-2',
        pokerName: 'Player 2',
        table: 'Table 2',
        seat: 2,
        isActive: true,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection('activeStays').doc('uid-3').set({
        uid: 'uid-3',
        billId: 'bill-3',
        pokerName: 'Player 3',
        table: 'Table 3',
        seat: 3,
        isActive: true,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const doc1 = await db.collection('activeStays').doc('uid-1').get();
      expect(doc1.data()?.expiresAt).toBeUndefined();

      const result = await runCleanupActiveStays(db);

      expect(result.deleted).toBe(3);
      expect(result.failed).toBe(0);

      const doc1After = await db.collection('activeStays').doc('uid-1').get();
      const doc2After = await db.collection('activeStays').doc('uid-2').get();
      const doc3After = await db.collection('activeStays').doc('uid-3').get();

      expect(doc1After.exists).toBe(false);
      expect(doc2After.exists).toBe(false);
      expect(doc3After.exists).toBe(false);

      const result2 = await runCleanupActiveStays(db);
      expect(result2.deleted).toBe(0);
      expect(result2.failed).toBe(0);
    });
  });

  describe('異常系', () => {
    it('対象が無い場合は deleted=0 / failed=0', async () => {
      if (!emulatorAvailable) return;
      await db.collection('activeStays').doc('uid-1').set({
        uid: 'uid-1',
        billId: 'bill-1',
        pokerName: 'Player 1',
        table: 'Table 1',
        seat: 1,
        isActive: true,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection('activeStays').doc('uid-1').delete();

      const result = await runCleanupActiveStays(db);

      expect(result.deleted).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe('TTL撤廃確認', () => {
    it('expiresAt フィールドが無くても削除できる', async () => {
      if (!emulatorAvailable) return;
      await db.collection('activeStays').doc('uid-1').set({
        uid: 'uid-1',
        billId: 'bill-1',
        pokerName: 'Player 1',
        table: 'Table 1',
        seat: 1,
        isActive: true,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const result = await runCleanupActiveStays(db);

      expect(result.deleted).toBe(1);
      expect(result.failed).toBe(0);
    });
  });
});
