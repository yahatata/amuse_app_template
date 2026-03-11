/**
 * updateAccounting の統合テスト（新世界版）
 * 
 * ChangeSpec P1-07 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path（postEventAdjustment / postEventCancel / postEventReopen の使用確認）
 * - エラーハンドリング（権限不足、billId不存在、eventType不正）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { updateAccounting } from '../../src/domains/bills/callables/updateAccounting';

describe('updateAccounting (新世界版)', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-default';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
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
      status: 'active',
      name: 'Test Admin Device',
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
    it('postEventAdjustment が呼び出されること（追加徴収）', async () => {
      const userId = 'user_test_happy_001';
      const billId = 'bill_test_happy_001';
      const adminId = 'admin_test_001';
      const idempotencyKey = `${billId}:event:adjustment:nonce_001`;

      await createAdminDevice(adminId);
      await createSettledBill(billId, userId, 10000, 10000, 0);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
          idempotencyKey,
          eventType: 'adjustment',
          eventPayload: {
            sign: 1,
            amountIncl: 1000,
            reason: '追加徴収',
          },
        },
      };

      const result = await (updateAccounting as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.billId).toBe(billId);
      expect(result.eventId).toBe(idempotencyKey);

      // /bills/{billId}/events/{eventId} が作成されている
      const eventDoc = await db.collection('bills').doc(billId)
        .collection('events').doc(idempotencyKey).get();
      expect(eventDoc.exists).toBe(true);
      const eventData = eventDoc.data()!;
      expect(eventData.type).toBe('adjustment');
    });

    it('postEventCancel が呼び出されること', async () => {
      const userId = 'user_test_happy_002';
      const billId = 'bill_test_happy_002';
      const adminId = 'admin_test_002';
      const idempotencyKey = `${billId}:event:cancel:nonce_002`;

      await createAdminDevice(adminId);
      await createSettledBill(billId, userId, 10000, 0, 0); // 支払い・返金なし

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
          idempotencyKey,
          eventType: 'cancel',
          reason: 'キャンセル',
        },
      };

      const result = await (updateAccounting as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.billId).toBe(billId);
      expect(result.eventId).toBe(idempotencyKey);
      expect(result.status).toBe('voided');

      // /bills/{billId}/events/{eventId} が作成されている
      const eventDoc = await db.collection('bills').doc(billId)
        .collection('events').doc(idempotencyKey).get();
      expect(eventDoc.exists).toBe(true);
      const eventData = eventDoc.data()!;
      expect(eventData.type).toBe('cancel');
    });

    it('postEventReopen が呼び出されること', async () => {
      const userId = 'user_test_happy_003';
      const billId = 'bill_test_happy_003';
      const adminId = 'admin_test_003';
      const idempotencyKey = `${billId}:event:reopen:nonce_003`;

      await createAdminDevice(adminId);
      await createSettledBill(billId, userId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
          idempotencyKey,
          eventType: 'reopen',
          reason: '再開',
        },
      };

      const result = await (updateAccounting as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.billId).toBe(billId);
      expect(result.eventId).toBe(idempotencyKey);
      expect(result.status).toBe('in_progress');

      // /bills/{billId}/events/{eventId} が作成されている
      const eventDoc = await db.collection('bills').doc(billId)
        .collection('events').doc(idempotencyKey).get();
      expect(eventDoc.exists).toBe(true);
      const eventData = eventDoc.data()!;
      expect(eventData.type).toBe('reopen');
    });
  });

  describe('エラーハンドリング', () => {
    it('認証なし → unauthenticated', async () => {
      const mockRequest = {
        auth: null,
        data: {
          billId: 'bill_test_001',
          idempotencyKey: 'idem_test_001',
          eventType: 'adjustment',
          eventPayload: {
            sign: 1,
            amountIncl: 1000,
          },
        },
      };

      try {
        await (updateAccounting as any).run(mockRequest);
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
          eventType: 'adjustment',
          eventPayload: {
            sign: 1,
            amountIncl: 1000,
          },
        },
      };

      // 管理者デバイスを作成しない

      try {
        await (updateAccounting as any).run(mockRequest);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('permission-denied');
      }
    });

    it('eventType が不正 → invalid-argument', async () => {
      const adminId = 'admin_test_001';
      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId: 'bill_test_001',
          idempotencyKey: 'idem_test_001',
          eventType: 'invalid_type',
        },
      };

      try {
        await (updateAccounting as any).run(mockRequest);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });

    it('adjustment で sign/amountIncl が未指定 → invalid-argument', async () => {
      const adminId = 'admin_test_001';
      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId: 'bill_test_001',
          idempotencyKey: 'idem_test_001',
          eventType: 'adjustment',
          eventPayload: {},
        },
      };

      try {
        await (updateAccounting as any).run(mockRequest);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });
  });
});

