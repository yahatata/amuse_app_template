/**
 * getActiveBillByUser の統合テスト
 * 
 * ChangeSpec P1-02 に準拠
 * Firestore Emulator を使用
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getActiveBillByUser } from '../../../src/domains/bills/repos/getActiveBillByUser';

describe('getActiveBillByUser', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-bills';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    
    testEnv = await initializeTestEnvironment({
      projectId,
    });
    
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map(a => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({
      projectId,
    });
    
    db = getFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map(a => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  describe('happy path', () => {
    it('activeStays/{userId} から billId を取得できること', async () => {
      const userId = 'user_test_001';
      const billId = 'bill_test_001';
      
      // activeStays を作成
      await db.collection('activeStays').doc(userId).set({
        uid: userId,
        billId,
        isActive: true,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // bills を作成
      await db.collection('bills').doc(billId).set({
        businessDate: '2025-11-15',
        status: 'open',
        party: {
          userId,
          pokerName: 'テスト太郎',
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        meta: {
          schemaVersion: '1.3',
        },
      });

      const result = await getActiveBillByUser(userId);

      expect(result.billId).toBe(billId);
      expect(result.billData.status).toBe('open');
      expect(result.billData.party.userId).toBe(userId);
    });

    it('activeStays が存在しない場合、bills を直接クエリで取得できること（フォールバック）', async () => {
      const userId = 'user_test_002';
      const billId = 'bill_test_002';
      
      // activeStays は作成しない
      // bills のみ作成
      await db.collection('bills').doc(billId).set({
        businessDate: '2025-11-15',
        status: 'in_progress',
        party: {
          userId,
          pokerName: 'テスト花子',
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        meta: {
          schemaVersion: '1.3',
        },
      });

      const result = await getActiveBillByUser(userId);

      expect(result.billId).toBe(billId);
      expect(result.billData.status).toBe('in_progress');
      expect(result.billData.party.userId).toBe(userId);
    });
  });

  describe('not-found', () => {
    it('アクティブな billId なし → not-found', async () => {
      const userId = 'user_test_notfound';

      try {
        await getActiveBillByUser(userId);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('not-found');
        expect(error.message).toContain('No active bill found');
      }
    });

    it('bills の status が settled の場合、フォールバックでも取得されないこと', async () => {
      const userId = 'user_test_settled';
      const billId = 'bill_test_settled';
      
      // activeStays は作成しない
      // bills を settled で作成
      await db.collection('bills').doc(billId).set({
        businessDate: '2025-11-15',
        status: 'settled', // settled は取得されない
        party: {
          userId,
          pokerName: 'テスト太郎',
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        meta: {
          schemaVersion: '1.3',
        },
      });

      try {
        await getActiveBillByUser(userId);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('not-found');
      }
    });

    it('activeStays/{userId} に billId があり、そのbillが open → それが返る', async () => {
      const userId = 'user_test_activeStays_open_001';
      const billId = 'bill_test_activeStays_open_001';
      
      // activeStays を作成
      await db.collection('activeStays').doc(userId).set({
        uid: userId,
        billId,
        isActive: true,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // bills を open で作成
      await db.collection('bills').doc(billId).set({
        businessDate: '2025-11-15',
        status: 'open',
        party: {
          userId,
          pokerName: 'テスト太郎',
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        meta: {
          schemaVersion: '1.3',
        },
      });

      const result = await getActiveBillByUser(userId);

      expect(result.billId).toBe(billId);
      expect(result.billData.status).toBe('open');
    });

    it('activeStays にあるが該当billが settled → statusに関係なくそのbillを返す（appendItemのstatusガードで拒否される）', async () => {
      const userId = 'user_test_activeStays_settled_001';
      const billId1 = 'bill_test_activeStays_settled_001_1';
      
      // activeStays に settled の billId を設定
      await db.collection('activeStays').doc(userId).set({
        uid: userId,
        billId: billId1, // settled の billId
        isActive: true,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // bills を settled で作成
      await db.collection('bills').doc(billId1).set({
        businessDate: '2025-11-15',
        status: 'settled',
        party: {
          userId,
          pokerName: 'テスト太郎',
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        meta: {
          schemaVersion: '1.3',
        },
      });

      const result = await getActiveBillByUser(userId);

      // activeStays に billId がある場合は、status に関係なく返す
      // （appendItem の status ガードで拒否される）
      expect(result.billId).toBe(billId1);
      expect(result.billData.status).toBe('settled');
    });
  });

  describe('invalid-argument', () => {
    it('userId 未指定 → invalid-argument', async () => {
      try {
        await getActiveBillByUser('');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });
  });
});

