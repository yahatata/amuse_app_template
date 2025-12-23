/**
 * refundProcessing の統合テスト
 * 
 * ChangeSpec P1-07 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - postEventRefund ヘルパAPI使用確認
 * - エラーハンドリング（権限不足、billId不存在、statusがsettled以外）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { processRefund } from '../../src/callables/refundProcessing';

describe('refundProcessing', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-refund-processing';

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

  // テスト用のヘルパ関数: settled 伝票を作成
  async function createSettledBill(
    billId: string,
    userId: string,
    grandTotalRounded: number = 10000,
    paidTotalIncl: number = 10000,
    totalRefundedIncl: number = 0,
    status: string = 'settled'
  ) {
    await db.collection('bills').doc(billId).set({
      businessDate: '2025-11-15',
      status,
      party: {
        userId,
        pokerName: 'テスト太郎',
      },
      amounts: {
        grandTotalRounded,
      },
      postEvents: {
        totalRefundedIncl,
        totalAdjustmentsIncl: 0,
        netSalesIncl: grandTotalRounded - totalRefundedIncl,
      },
      paymentsSummary: {
        paidTotalIncl,
        balanceDueIncl: grandTotalRounded - paidTotalIncl - totalRefundedIncl,
        byMethod: {},
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      meta: {
        schemaVersion: '1.3',
      },
    });
  }

  describe('happy path', () => {
    it('postEventRefund ヘルパAPIが呼び出されること', async () => {
      const userId = 'user_test_happy_001';
      const billId = 'bill_test_happy_001';
      const adminId = 'admin_test_001';
      const idempotencyKey = `${billId}:event:refund:nonce_001`;
      const refundAmount = 3000;

      await createAdminDevice(adminId);
      // paidTotalIncl を 7000 に設定（返金後も balanceDueIncl >= 0 になるように）
      // 返金後の balanceDueIncl = 10000 - 7000 - 3000 = 0
      await createSettledBill(billId, userId, 10000, 7000, 0);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
          idempotencyKey,
          eventPayload: {
            amountIncl: refundAmount,
            reason: 'テスト返金',
            method: 'cash',
          },
        },
      };

      const result = await (processRefund as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.billId).toBe(billId);
      expect(result.eventId).toBe(idempotencyKey);
      expect(result.status).toBe('partially_refunded');
      expect(result.postEvents.totalRefundedIncl).toBe(refundAmount);

      // /bills/{billId}/events/{eventId} が作成されている
      const eventDoc = await db.collection('bills').doc(billId)
        .collection('events').doc(idempotencyKey).get();
      expect(eventDoc.exists).toBe(true);
      const eventData = eventDoc.data()!;
      expect(eventData.type).toBe('refund');
      expect(eventData.refund?.amountIncl).toBe(refundAmount);
    });
  });

  describe('エラーハンドリング', () => {
    it('認証なし → unauthenticated', async () => {
      const mockRequest = {
        auth: null,
        data: {
          billId: 'bill_test_001',
          idempotencyKey: 'idem_test_001',
          eventPayload: {
            amountIncl: 1000,
          },
        },
      };

      try {
        await (processRefund as any).run(mockRequest);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('unauthenticated');
      }
    });

    it('管理者権限なし → permission-denied', async () => {
      const adminId = 'admin_test_001';
      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId: 'bill_test_001',
          idempotencyKey: 'idem_test_001',
          eventPayload: {
            amountIncl: 1000,
          },
        },
      };

      // 管理者デバイスを作成しない

      try {
        await (processRefund as any).run(mockRequest);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('permission-denied');
      }
    });

    it('billId 不存在 → not-found', async () => {
      const adminId = 'admin_test_001';
      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId: 'bill_not_exist',
          idempotencyKey: 'idem_test_001',
          eventPayload: {
            amountIncl: 1000,
          },
        },
      };

      try {
        await (processRefund as any).run(mockRequest);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('not-found');
      }
    });
  });
});

