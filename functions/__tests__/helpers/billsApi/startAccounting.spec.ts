/**
 * startAccounting の統合テスト
 * 
 * ChangeSpec P1-06 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path（正常な会計開始、status='settling'、ops.accountingStartedAt設定）
 * - invalid-argument（billId未指定、idempotencyKey未指定）
 * - not-found（billId不存在）
 * - failed-precondition（statusがopen/in_progress以外、requestHash不一致）
 * - idempotent-replay（reused: true、updatedAt不変）
 * - DualWrite ON/OFF（todaysBills.statusの更新確認、idempotent replay時のDualWriteスキップ）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { startAccounting } from '../../../src/helpers/billsApi/startAccounting';

describe('startAccounting', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-start-accounting';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    
    testEnv = await initializeTestEnvironment({
      projectId,
    });
    
    if (admin.apps.length > 0) {
      await admin.app().delete();
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
    delete process.env.WRITE_TODAYS_BILLS_IN_PARALLEL;
  });

  // テスト用のヘルパ関数: 伝票を作成
  async function createTestBill(billId: string, userId: string, status: string = 'open') {
    await db.collection('bills').doc(billId).set({
      businessDate: '2025-11-15',
      status,
      party: {
        userId,
        pokerName: 'テスト太郎',
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      meta: {
        schemaVersion: '1.3',
      },
      ops: {
        accountingStartedAt: null,
        accountingStartedBy: null,
      },
    });
  }

  describe('happy path', () => {
    it('正常な会計開始ができること（status=settling、ops.accountingStartedAt設定）', async () => {
      const billId = 'bill_test_happy_001';
      const userId = 'user_test_happy_001';
      const accountingStartedBy = 'admin_test_001';
      const idempotencyKey = `${billId}:startAccounting:nonce_001`;

      await createTestBill(billId, userId, 'open');

      const result = await startAccounting({
        billId,
        idempotencyKey,
        accountingStartedBy,
      });

      expect(result.success).toBe(true);
      expect(result.billId).toBe(billId);
      expect(result.status).toBe('settling');
      expect(result.ops.accountingStartedAt).toBeDefined();
      expect(result.ops.accountingStartedBy).toBe(accountingStartedBy);
      expect(result.diagnostics?.reused).toBeUndefined();

      // bills/{billId} が更新されている
      const billDoc = await db.collection('bills').doc(billId).get();
      expect(billDoc.exists).toBe(true);
      const billData = billDoc.data()!;
      expect(billData.status).toBe('settling');
      expect(billData.ops?.accountingStartedAt).toBeDefined();
      expect(billData.ops?.accountingStartedBy).toBe(accountingStartedBy);
      expect(billData.updatedAt).toBeDefined();

      // idempotency/{key} が作成されている
      const idemDoc = await db.collection('bills').doc(billId)
        .collection('idempotency').doc(idempotencyKey).get();
      expect(idemDoc.exists).toBe(true);
      const idemData = idemDoc.data()!;
      expect(idemData.requestHash).toBeDefined();
    });

    it('status=in_progress の場合も会計開始できること', async () => {
      const billId = 'bill_test_happy_002';
      const userId = 'user_test_happy_002';
      const accountingStartedBy = 'admin_test_002';
      const idempotencyKey = `${billId}:startAccounting:nonce_002`;

      await createTestBill(billId, userId, 'in_progress');

      const result = await startAccounting({
        billId,
        idempotencyKey,
        accountingStartedBy,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('settling');

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.status).toBe('settling');
    });
  });

  describe('invalid-argument', () => {
    it('billId 未指定 → invalid-argument', async () => {
      try {
        await startAccounting({
          billId: '',
          idempotencyKey: 'idem_test_001',
          accountingStartedBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });

    it('idempotencyKey 未指定 → invalid-argument', async () => {
      try {
        await startAccounting({
          billId: 'bill_test_001',
          idempotencyKey: '',
          accountingStartedBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });

    it('accountingStartedBy 未指定 → invalid-argument', async () => {
      try {
        await startAccounting({
          billId: 'bill_test_001',
          idempotencyKey: 'idem_test_001',
          accountingStartedBy: '',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });
  });

  describe('not-found', () => {
    it('billId 不存在 → not-found', async () => {
      try {
        await startAccounting({
          billId: 'bill_not_exist',
          idempotencyKey: 'idem_test_001',
          accountingStartedBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('not-found');
      }
    });
  });

  describe('failed-precondition', () => {
    it('status が settled の場合 → failed-precondition', async () => {
      const billId = 'bill_test_failed_001';
      const userId = 'user_test_failed_001';
      const accountingStartedBy = 'admin_test_001';
      const idempotencyKey = `${billId}:startAccounting:nonce_001`;

      await createTestBill(billId, userId, 'settled');

      try {
        await startAccounting({
          billId,
          idempotencyKey,
          accountingStartedBy,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('status が settling の場合 → failed-precondition', async () => {
      const billId = 'bill_test_failed_002';
      const userId = 'user_test_failed_002';
      const accountingStartedBy = 'admin_test_001';
      const idempotencyKey = `${billId}:startAccounting:nonce_002`;

      await createTestBill(billId, userId, 'settling');

      try {
        await startAccounting({
          billId,
          idempotencyKey,
          accountingStartedBy,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('requestHash 不一致 → failed-precondition', async () => {
      const billId = 'bill_test_failed_003';
      const userId = 'user_test_failed_003';
      const accountingStartedBy = 'admin_test_001';
      const idempotencyKey = `${billId}:startAccounting:nonce_003`;

      await createTestBill(billId, userId, 'open');

      // 初回実行
      await startAccounting({
        billId,
        idempotencyKey,
        accountingStartedBy,
        requestHash: 'hash_001',
      });

      // 異なる requestHash で再実行
      try {
        await startAccounting({
          billId,
          idempotencyKey,
          accountingStartedBy,
          requestHash: 'hash_002',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });
  });

  describe('idempotent-replay', () => {
    it('同一 idempotencyKey で再送した場合、reused: true を返し、updatedAt を変更しない', async () => {
      const billId = 'bill_test_idempotent_001';
      const userId = 'user_test_idempotent_001';
      const accountingStartedBy = 'admin_test_001';
      const idempotencyKey = `${billId}:startAccounting:nonce_001`;

      await createTestBill(billId, userId, 'open');

      // 初回実行
      const result1 = await startAccounting({
        billId,
        idempotencyKey,
        accountingStartedBy,
      });

      expect(result1.success).toBe(true);
      expect(result1.diagnostics?.reused).toBeUndefined();

      const billDoc1 = await db.collection('bills').doc(billId).get();
      const billData1 = billDoc1.data()!;
      const updatedAt1 = billData1.updatedAt;

      // 2回目実行（idempotent replay）
      const result2 = await startAccounting({
        billId,
        idempotencyKey,
        accountingStartedBy,
      });

      expect(result2.success).toBe(true);
      expect(result2.diagnostics?.reused).toBe(true);

      const billDoc2 = await db.collection('bills').doc(billId).get();
      const billData2 = billDoc2.data()!;
      const updatedAt2 = billData2.updatedAt;

      // updatedAt が変更されていないことを確認
      expect(updatedAt2).toEqual(updatedAt1);
    });
  });

  describe('DualWrite', () => {
    it('DualWrite ON の場合、todaysBills.status が更新されること', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'true';

      const billId = 'bill_test_dualwrite_001';
      const userId = 'user_test_dualwrite_001';
      const accountingStartedBy = 'admin_test_001';
      const idempotencyKey = `${billId}:startAccounting:nonce_001`;

      await createTestBill(billId, userId, 'open');

      // todaysBills を作成
      await db.collection('todaysBills').doc(billId).set({
        status: 'open',
        userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await startAccounting({
        billId,
        idempotencyKey,
        accountingStartedBy,
      });

      // todaysBills.status が更新されている
      const legacyDoc = await db.collection('todaysBills').doc(billId).get();
      expect(legacyDoc.exists).toBe(true);
      const legacyData = legacyDoc.data()!;
      expect(legacyData.status).toBe('settling');
    });

    it('DualWrite OFF の場合、todaysBills.status が更新されないこと', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'false';

      const billId = 'bill_test_dualwrite_002';
      const userId = 'user_test_dualwrite_002';
      const accountingStartedBy = 'admin_test_001';
      const idempotencyKey = `${billId}:startAccounting:nonce_002`;

      await createTestBill(billId, userId, 'open');

      // todaysBills を作成
      await db.collection('todaysBills').doc(billId).set({
        status: 'open',
        userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await startAccounting({
        billId,
        idempotencyKey,
        accountingStartedBy,
      });

      // todaysBills.status が更新されていない
      const legacyDoc = await db.collection('todaysBills').doc(billId).get();
      expect(legacyDoc.exists).toBe(true);
      const legacyData = legacyDoc.data()!;
      expect(legacyData.status).toBe('open');
    });

    it('idempotent replay 時は DualWrite をスキップすること', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'true';

      const billId = 'bill_test_dualwrite_003';
      const userId = 'user_test_dualwrite_003';
      const accountingStartedBy = 'admin_test_001';
      const idempotencyKey = `${billId}:startAccounting:nonce_003`;

      await createTestBill(billId, userId, 'open');

      // todaysBills を作成
      await db.collection('todaysBills').doc(billId).set({
        status: 'open',
        userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 初回実行
      await startAccounting({
        billId,
        idempotencyKey,
        accountingStartedBy,
      });

      const legacyDoc1 = await db.collection('todaysBills').doc(billId).get();
      const legacyData1 = legacyDoc1.data()!;
      const updatedAt1 = legacyData1.updatedAt;

      // 2回目実行（idempotent replay）
      await startAccounting({
        billId,
        idempotencyKey,
        accountingStartedBy,
      });

      // todaysBills.updatedAt が変更されていないことを確認（DualWrite がスキップされた）
      const legacyDoc2 = await db.collection('todaysBills').doc(billId).get();
      const legacyData2 = legacyDoc2.data()!;
      const updatedAt2 = legacyData2.updatedAt;

      expect(updatedAt2).toEqual(updatedAt1);
    });
  });
});

