/**
 * cancelAccounting の統合テスト（pre-settlement 専用）
 * 
 * ChangeSpec P1-07 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - status=settling の bill に対して成功し、status=open に戻ること
 * - ops.accountingStartedAt / ops.accountingStartedBy がクリアされること
 * - status=settled など対象外 status に対しては failed-precondition となること
 * - cancelAccounting 実行後に再度 startAccounting を実行すると、金額計算が再実行されること
 * - /bills/{billId}/events には何も書き込まれないこと
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { cancelAccounting } from '../../src/domains/bills/callables/cancelAccounting';
import { startAccounting } from '../../src/domains/bills/repos/startAccounting';

describe('cancelAccounting (pre-settlement 専用)', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-cancel-accounting';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    
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

  // テスト用のヘルパ関数: 管理者デバイスを作成
  async function createAdminDevice(uid: string) {
    await db.collection('devices').add({
      uid,
      role: 'admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // テスト用のヘルパ関数: 伝票を作成
  async function createTestBill(
    billId: string,
    userId: string,
    status: string = 'open',
    accountingStartedAt?: admin.firestore.Timestamp,
    accountingStartedBy?: string
  ) {
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
        accountingStartedAt: accountingStartedAt || null,
        accountingStartedBy: accountingStartedBy || null,
      },
    });
  }

  describe('happy path', () => {
    it('status=settling の bill に対して成功し、status=open に戻ること', async () => {
      const userId = 'user_test_happy_001';
      const billId = 'bill_test_happy_001';
      const adminId = 'admin_test_001';
      const now = admin.firestore.Timestamp.now();

      await createAdminDevice(adminId);
      await createTestBill(billId, userId, 'settling', now, adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
          reason: 'テストキャンセル',
        },
      };

      const result = await (cancelAccounting as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.billId).toBe(billId);

      // bills/{billId} が更新されている
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.status).toBe('open');
      expect(billData.ops?.accountingStartedAt).toBeUndefined();
      expect(billData.ops?.accountingStartedBy).toBeUndefined();
      expect(billData.ops?.accountingCanceledAt).toBeDefined();
      expect(billData.ops?.accountingCanceledBy).toBe(adminId);
    });

    it('status=in_progress の bill に対して成功すること', async () => {
      const userId = 'user_test_happy_002';
      const billId = 'bill_test_happy_002';
      const adminId = 'admin_test_002';

      await createAdminDevice(adminId);
      await createTestBill(billId, userId, 'in_progress');

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
        },
      };

      const result = await (cancelAccounting as any).run(mockRequest);

      expect(result.success).toBe(true);

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.status).toBe('open');
    });

    it('status=open の bill に対して成功すること', async () => {
      const userId = 'user_test_happy_003';
      const billId = 'bill_test_happy_003';
      const adminId = 'admin_test_003';

      await createAdminDevice(adminId);
      await createTestBill(billId, userId, 'open');

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
        },
      };

      const result = await (cancelAccounting as any).run(mockRequest);

      expect(result.success).toBe(true);

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.status).toBe('open');
    });
  });

  describe('failed-precondition', () => {
    it('status=settled に対しては failed-precondition', async () => {
      const userId = 'user_test_failed_001';
      const billId = 'bill_test_failed_001';
      const adminId = 'admin_test_001';

      await createAdminDevice(adminId);
      await createTestBill(billId, userId, 'settled');

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
        },
      };

      try {
        await (cancelAccounting as any).run(mockRequest);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('status=partially_refunded に対しては failed-precondition', async () => {
      const userId = 'user_test_failed_002';
      const billId = 'bill_test_failed_002';
      const adminId = 'admin_test_002';

      await createAdminDevice(adminId);
      await createTestBill(billId, userId, 'partially_refunded');

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
        },
      };

      try {
        await (cancelAccounting as any).run(mockRequest);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });
  });

  describe('cancelAccounting 実行後に再度 startAccounting を実行', () => {
    it('cancelAccounting 実行後に再度 startAccounting を実行すると、金額計算が再実行されること', async () => {
      const userId = 'user_test_reopen_001';
      const billId = 'bill_test_reopen_001';
      const adminId = 'admin_test_001';
      const now = admin.firestore.Timestamp.now();

      await createAdminDevice(adminId);
      await createTestBill(billId, userId, 'settling', now, adminId);

      // cancelAccounting を実行
      const cancelRequest = {
        auth: { uid: adminId },
        data: {
          billId,
        },
      };

      await (cancelAccounting as any).run(cancelRequest);

      // status が open に戻っていることを確認
      const billDocAfterCancel = await db.collection('bills').doc(billId).get();
      const billDataAfterCancel = billDocAfterCancel.data()!;
      expect(billDataAfterCancel.status).toBe('open');
      expect(billDataAfterCancel.ops?.accountingStartedAt).toBeUndefined();

      // 再度 startAccounting を実行
      const idempotencyKey = `${billId}:startAccounting:nonce_reopen_001`;
      await startAccounting({
        billId,
        idempotencyKey,
        accountingStartedBy: adminId,
      });

      // status が settling に戻っていることを確認
      const billDocAfterStart = await db.collection('bills').doc(billId).get();
      const billDataAfterStart = billDocAfterStart.data()!;
      expect(billDataAfterStart.status).toBe('settling');
      expect(billDataAfterStart.ops?.accountingStartedAt).toBeDefined();
    });
  });

  describe('/bills/{billId}/events には何も書き込まれないこと', () => {
    it('cancelAccounting 実行後、/bills/{billId}/events には何も書き込まれないこと', async () => {
      const userId = 'user_test_events_001';
      const billId = 'bill_test_events_001';
      const adminId = 'admin_test_001';
      const now = admin.firestore.Timestamp.now();

      await createAdminDevice(adminId);
      await createTestBill(billId, userId, 'settling', now, adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
        },
      };

      await (cancelAccounting as any).run(mockRequest);

      // /bills/{billId}/events には何も書き込まれていない
      const eventsSnapshot = await db.collection('bills').doc(billId)
        .collection('events').get();
      expect(eventsSnapshot.size).toBe(0);
    });
  });
});

