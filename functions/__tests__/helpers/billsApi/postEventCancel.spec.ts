/**
 * postEventCancel の統合テスト
 * 
 * ChangeSpec P1-07 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path（正常なキャンセル）
 * - invalid-argument（billId未指定、idempotencyKey未指定）
 * - not-found（billId不存在）
 * - failed-precondition（status が 'settled' 以外、または paidTotalIncl != 0、または totalRefundedIncl != 0 の場合）
 * - idempotent-replay（reused: true、既存docを再利用）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { postEventCancel } from '../../../src/helpers/billsApi/postEventCancel';

describe('postEventCancel', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-post-event-cancel';

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
  });

  // テスト用のヘルパ関数: settled 伝票を作成（支払い・返金なし）
  async function createSettledBill(
    billId: string,
    userId: string,
    paidTotalIncl: number = 0,
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
        grandTotalRounded: 10000,
      },
      postEvents: {
        totalRefundedIncl,
        totalAdjustmentsIncl: 0,
        netSalesIncl: 10000 - totalRefundedIncl,
      },
      paymentsSummary: {
        paidTotalIncl,
        balanceDueIncl: 10000 - paidTotalIncl - totalRefundedIncl,
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
    it('正常なキャンセルができること（status=voided）', async () => {
      const billId = 'bill_test_happy_001';
      const userId = 'user_test_happy_001';
      const idempotencyKey = `${billId}:event:cancel:nonce_001`;
      const createdBy = 'admin_test_001';

      await createSettledBill(billId, userId, 0, 0);

      const result = await postEventCancel({
        billId,
        idempotencyKey,
        reason: 'テストキャンセル',
        createdBy,
      });

      expect(result.success).toBe(true);
      expect(result.billId).toBe(billId);
      expect(result.eventId).toBe(idempotencyKey);
      expect(result.status).toBe('voided');
      expect(result.diagnostics?.reused).toBeUndefined();

      // /bills/{billId}/events/{eventId} が作成されている
      const eventDoc = await db.collection('bills').doc(billId)
        .collection('events').doc(idempotencyKey).get();
      expect(eventDoc.exists).toBe(true);
      const eventData = eventDoc.data()!;
      expect(eventData.type).toBe('cancel');
    });
  });

  describe('invalid-argument', () => {
    it('billId 未指定 → invalid-argument', async () => {
      try {
        await postEventCancel({
          billId: '',
          idempotencyKey: 'idem_test_001',
          createdBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });

    it('idempotencyKey 未指定 → invalid-argument', async () => {
      try {
        await postEventCancel({
          billId: 'bill_test_001',
          idempotencyKey: '',
          createdBy: 'admin_test_001',
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
        await postEventCancel({
          billId: 'bill_not_exist',
          idempotencyKey: 'idem_test_001',
          createdBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('not-found');
      }
    });
  });

  describe('failed-precondition', () => {
    it('status が settled 以外 → failed-precondition', async () => {
      const billId = 'bill_test_failed_001';
      const userId = 'user_test_failed_001';

      await createSettledBill(billId, userId, 0, 0, 'open');

      try {
        await postEventCancel({
          billId,
          idempotencyKey: 'idem_test_001',
          createdBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('status=in_progress に対する postEventCancel は failed-precondition', async () => {
      const billId = 'bill_test_failed_006';
      const userId = 'user_test_failed_006';

      await createSettledBill(billId, userId, 0, 0, 'in_progress');

      try {
        await postEventCancel({
          billId,
          idempotencyKey: 'idem_test_001',
          createdBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('status=settling に対する postEventCancel は failed-precondition', async () => {
      const billId = 'bill_test_failed_007';
      const userId = 'user_test_failed_007';

      await createSettledBill(billId, userId, 0, 0, 'settling');

      try {
        await postEventCancel({
          billId,
          idempotencyKey: 'idem_test_001',
          createdBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('status=voided に対する postEventCancel は failed-precondition', async () => {
      const billId = 'bill_test_failed_008';
      const userId = 'user_test_failed_008';

      await createSettledBill(billId, userId, 0, 0, 'voided');

      try {
        await postEventCancel({
          billId,
          idempotencyKey: 'idem_test_001',
          createdBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('paidTotalIncl != 0 → failed-precondition', async () => {
      const billId = 'bill_test_failed_002';
      const userId = 'user_test_failed_002';

      await createSettledBill(billId, userId, 5000, 0); // 支払い済み

      try {
        await postEventCancel({
          billId,
          idempotencyKey: 'idem_test_001',
          createdBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('totalRefundedIncl != 0 → failed-precondition', async () => {
      const billId = 'bill_test_failed_003';
      const userId = 'user_test_failed_003';

      await createSettledBill(billId, userId, 0, 5000); // 返金済み

      try {
        await postEventCancel({
          billId,
          idempotencyKey: 'idem_test_001',
          createdBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('partially_refunded から postEventCancel 不可 → failed-precondition', async () => {
      const billId = 'bill_test_failed_004';
      const userId = 'user_test_failed_004';

      await createSettledBill(billId, userId, 0, 0, 'partially_refunded');

      try {
        await postEventCancel({
          billId,
          idempotencyKey: 'idem_test_001',
          createdBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('refunded から postEventCancel 不可 → failed-precondition', async () => {
      const billId = 'bill_test_failed_005';
      const userId = 'user_test_failed_005';

      await createSettledBill(billId, userId, 0, 0, 'refunded');

      try {
        await postEventCancel({
          billId,
          idempotencyKey: 'idem_test_001',
          createdBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });
  });

  describe('idempotent-replay', () => {
    it('同一 idempotencyKey で再送 → reused: true', async () => {
      const billId = 'bill_test_idem_001';
      const userId = 'user_test_idem_001';
      const idempotencyKey = `${billId}:event:cancel:nonce_idem_001`;
      const createdBy = 'admin_test_001';

      await createSettledBill(billId, userId, 0, 0);

      // 1回目
      const result1 = await postEventCancel({
        billId,
        idempotencyKey,
        createdBy,
      });

      expect(result1.diagnostics?.reused).toBeUndefined();

      // 2回目（同一 idempotencyKey）
      const result2 = await postEventCancel({
        billId,
        idempotencyKey,
        createdBy,
      });

      expect(result2.diagnostics?.reused).toBe(true);

      // /bills/{billId}/events の doc 数は1つのまま
      const eventsSnapshot = await db.collection('bills').doc(billId)
        .collection('events').get();
      expect(eventsSnapshot.size).toBe(1);
    });
  });
});

