/**
 * postEventReopen の統合テスト
 * 
 * ChangeSpec P1-07 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path（正常な再開）
 * - invalid-argument（billId未指定、idempotencyKey未指定）
 * - not-found（billId不存在）
 * - failed-precondition（status != 'settled'）
 * - idempotent-replay（reused: true、既存docを再利用）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { postEventReopen } from '../../../src/domains/bills/repos/postEventReopen';

describe('postEventReopen', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-post-event-reopen';

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

  // テスト用のヘルパ関数: settled 伝票を作成
  async function createSettledBill(
    billId: string,
    userId: string,
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
        totalRefundedIncl: 0,
        totalAdjustmentsIncl: 0,
        netSalesIncl: 10000,
      },
      paymentsSummary: {
        paidTotalIncl: 10000,
        balanceDueIncl: 0,
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
    it('正常な再開ができること（status=in_progress）', async () => {
      const billId = 'bill_test_happy_001';
      const userId = 'user_test_happy_001';
      const idempotencyKey = `${billId}:event:reopen:nonce_001`;
      const createdBy = 'admin_test_001';

      await createSettledBill(billId, userId);

      const result = await postEventReopen({
        billId,
        idempotencyKey,
        reason: 'テスト再開',
        createdBy,
      });

      expect(result.success).toBe(true);
      expect(result.billId).toBe(billId);
      expect(result.eventId).toBe(idempotencyKey);
      expect(result.status).toBe('in_progress');
      expect(result.diagnostics?.reused).toBeUndefined();

      // /bills/{billId}/events/{eventId} が作成されている
      const eventDoc = await db.collection('bills').doc(billId)
        .collection('events').doc(idempotencyKey).get();
      expect(eventDoc.exists).toBe(true);
      const eventData = eventDoc.data()!;
      expect(eventData.type).toBe('reopen');
    });
  });

  describe('invalid-argument', () => {
    it('billId 未指定 → invalid-argument', async () => {
      try {
        await postEventReopen({
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
        await postEventReopen({
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
        await postEventReopen({
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
    it('status != settled → failed-precondition', async () => {
      const billId = 'bill_test_failed_001';
      const userId = 'user_test_failed_001';

      await createSettledBill(billId, userId, 'open');

      try {
        await postEventReopen({
          billId,
          idempotencyKey: 'idem_test_001',
          createdBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('status=partially_refunded → failed-precondition', async () => {
      const billId = 'bill_test_failed_002';
      const userId = 'user_test_failed_002';

      await createSettledBill(billId, userId, 'partially_refunded');

      try {
        await postEventReopen({
          billId,
          idempotencyKey: 'idem_test_001',
          createdBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('status=in_progress に対する postEventReopen は failed-precondition', async () => {
      const billId = 'bill_test_failed_003';
      const userId = 'user_test_failed_003';

      await createSettledBill(billId, userId, 'in_progress');

      try {
        await postEventReopen({
          billId,
          idempotencyKey: 'idem_test_001',
          createdBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('status=settling に対する postEventReopen は failed-precondition', async () => {
      const billId = 'bill_test_failed_004';
      const userId = 'user_test_failed_004';

      await createSettledBill(billId, userId, 'settling');

      try {
        await postEventReopen({
          billId,
          idempotencyKey: 'idem_test_001',
          createdBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('status=refunded に対する postEventReopen は failed-precondition', async () => {
      const billId = 'bill_test_failed_005';
      const userId = 'user_test_failed_005';

      await createSettledBill(billId, userId, 'refunded');

      try {
        await postEventReopen({
          billId,
          idempotencyKey: 'idem_test_001',
          createdBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('status=voided に対する postEventReopen は failed-precondition', async () => {
      const billId = 'bill_test_failed_006';
      const userId = 'user_test_failed_006';

      await createSettledBill(billId, userId, 'voided');

      try {
        await postEventReopen({
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
      const idempotencyKey = `${billId}:event:reopen:nonce_idem_001`;
      const createdBy = 'admin_test_001';

      await createSettledBill(billId, userId);

      // 1回目
      const result1 = await postEventReopen({
        billId,
        idempotencyKey,
        createdBy,
      });

      expect(result1.diagnostics?.reused).toBeUndefined();

      // 2回目（同一 idempotencyKey）
      const result2 = await postEventReopen({
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

