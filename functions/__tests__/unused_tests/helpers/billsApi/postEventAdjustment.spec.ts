/**
 * postEventAdjustment の統合テスト
 * 
 * ChangeSpec P1-07 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path（追加徴収、減額）
 * - invalid-argument（billId未指定、idempotencyKey未指定、amountIncl <= 0、signが+1/-1以外）
 * - not-found（billId不存在）
 * - failed-precondition（status=voided、反映後にbalanceDueIncl < 0、反映後にnetSalesIncl < 0）
 * - idempotent-replay（reused: true、既存docを再利用）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { postEventAdjustment } from '../../../src/domains/bills/repos/postEventAdjustment';

describe('postEventAdjustment', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-post-event-adjustment';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    
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
    grandTotalRounded: number = 10000,
    paidTotalIncl: number = 10000,
    totalAdjustmentsIncl: number = 0,
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
        totalRefundedIncl: 0,
        totalAdjustmentsIncl,
        netSalesIncl: grandTotalRounded + totalAdjustmentsIncl,
      },
      paymentsSummary: {
        paidTotalIncl,
        balanceDueIncl: grandTotalRounded - paidTotalIncl + totalAdjustmentsIncl,
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
    it('追加徴収ができること（sign=+1）', async () => {
      const billId = 'bill_test_happy_001';
      const userId = 'user_test_happy_001';
      const idempotencyKey = `${billId}:event:adjustment:nonce_001`;
      const createdBy = 'admin_test_001';
      const adjustmentAmount = 1000;

      await createSettledBill(billId, userId, 10000, 10000, 0);

      const result = await postEventAdjustment({
        billId,
        idempotencyKey,
        eventPayload: {
          amountIncl: adjustmentAmount,
          sign: 1,
          reason: '追加徴収',
        },
        createdBy,
        eventBusinessDate: '2025-11-15',
      });

      expect(result.success).toBe(true);
      expect(result.billId).toBe(billId);
      expect(result.eventId).toBe(idempotencyKey);
      expect(result.postEvents.totalAdjustmentsIncl).toBe(adjustmentAmount);
      expect(result.diagnostics?.reused).toBeUndefined();

      // /bills/{billId}/events/{eventId} が作成されている
      const eventDoc = await db.collection('bills').doc(billId)
        .collection('events').doc(idempotencyKey).get();
      expect(eventDoc.exists).toBe(true);
      const eventData = eventDoc.data()!;
      expect(eventData.type).toBe('adjustment');
      expect(eventData.adjustment?.sign).toBe(1);
      expect(eventData.adjustment?.amountIncl).toBe(adjustmentAmount);
    });

    it('減額ができること（sign=-1）', async () => {
      const billId = 'bill_test_happy_002';
      const userId = 'user_test_happy_002';
      const idempotencyKey = `${billId}:event:adjustment:nonce_002`;
      const createdBy = 'admin_test_002';
      const adjustmentAmount = 1000;

      // grandTotalRounded = 10000, paidTotalIncl = 9000, totalAdjustmentsIncl = 0
      // balanceDueIncl = 10000 - 9000 - 0 + 0 = 1000
      // 1000円減額後: balanceDueIncl = 10000 - 9000 - 0 + (-1000) = 0 (負にならない)
      await createSettledBill(billId, userId, 10000, 9000, 0);

      const result = await postEventAdjustment({
        billId,
        idempotencyKey,
        eventPayload: {
          amountIncl: adjustmentAmount,
          sign: -1,
          reason: '減額',
        },
        createdBy,
        eventBusinessDate: '2025-11-15',
      });

      expect(result.success).toBe(true);
      expect(result.postEvents.totalAdjustmentsIncl).toBe(-adjustmentAmount);
    });
  });

  describe('invalid-argument', () => {
    it('billId 未指定 → invalid-argument', async () => {
      try {
        await postEventAdjustment({
          billId: '',
          idempotencyKey: 'idem_test_001',
          eventPayload: {
            amountIncl: 1000,
            sign: 1,
          },
          createdBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });

    it('idempotencyKey 未指定 → invalid-argument', async () => {
      try {
        await postEventAdjustment({
          billId: 'bill_test_001',
          idempotencyKey: '',
          eventPayload: {
            amountIncl: 1000,
            sign: 1,
          },
          createdBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });

    it('amountIncl <= 0 → invalid-argument', async () => {
      try {
        await postEventAdjustment({
          billId: 'bill_test_001',
          idempotencyKey: 'idem_test_001',
          eventPayload: {
            amountIncl: 0,
            sign: 1,
          },
          createdBy: 'admin_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });

    it('sign が+1/-1以外 → invalid-argument', async () => {
      try {
        await postEventAdjustment({
          billId: 'bill_test_001',
          idempotencyKey: 'idem_test_001',
          eventPayload: {
            amountIncl: 1000,
            sign: 2 as any,
          },
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
        await postEventAdjustment({
          billId: 'bill_not_exist',
          idempotencyKey: 'idem_test_001',
          eventPayload: {
            amountIncl: 1000,
            sign: 1,
          },
          createdBy: 'admin_test_001',
          eventBusinessDate: '2025-11-15',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('not-found');
      }
    });
  });

  describe('failed-precondition', () => {
    it('status=voided で調整不可 → failed-precondition', async () => {
      const billId = 'bill_test_failed_001';
      const userId = 'user_test_failed_001';

      await createSettledBill(billId, userId, 10000, 10000, 0, 'voided');

      try {
        await postEventAdjustment({
          billId,
          idempotencyKey: 'idem_test_001',
          eventPayload: {
            amountIncl: 1000,
            sign: 1,
          },
          createdBy: 'admin_test_001',
          eventBusinessDate: '2025-11-15',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('反映後にnetSalesIncl < 0 になる場合 → failed-precondition', async () => {
      const billId = 'bill_test_failed_002';
      const userId = 'user_test_failed_002';
      const grandTotalRounded = 10000;
      const totalRefundedIncl = 5000; // 既に5000円返金済み

      await db.collection('bills').doc(billId).set({
        businessDate: '2025-11-15',
        status: 'settled',
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

      // 減額で netSalesIncl が負になる
      try {
        await postEventAdjustment({
          billId,
          idempotencyKey: 'idem_test_001',
          eventPayload: {
            amountIncl: 6000, // 5000円返金済みなので、6000円減額すると netSalesIncl = -1000
            sign: -1,
          },
          createdBy: 'admin_test_001',
          eventBusinessDate: '2025-11-15',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('pre-settlement status で調整不可 → failed-precondition', async () => {
      const billId = 'bill_test_failed_003';
      const userId = 'user_test_failed_003';

      await createSettledBill(billId, userId, 10000, 10000, 0, 'open');

      try {
        await postEventAdjustment({
          billId,
          idempotencyKey: 'idem_test_001',
          eventPayload: {
            amountIncl: 1000,
            sign: 1,
          },
          createdBy: 'admin_test_001',
          eventBusinessDate: '2025-11-15',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('status=in_progress で調整不可 → failed-precondition', async () => {
      const billId = 'bill_test_failed_004';
      const userId = 'user_test_failed_004';

      await createSettledBill(billId, userId, 10000, 10000, 0, 'in_progress');

      try {
        await postEventAdjustment({
          billId,
          idempotencyKey: 'idem_test_001',
          eventPayload: {
            amountIncl: 1000,
            sign: 1,
          },
          createdBy: 'admin_test_001',
          eventBusinessDate: '2025-11-15',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('status=settling で調整不可 → failed-precondition', async () => {
      const billId = 'bill_test_failed_005';
      const userId = 'user_test_failed_005';

      await createSettledBill(billId, userId, 10000, 10000, 0, 'settling');

      try {
        await postEventAdjustment({
          billId,
          idempotencyKey: 'idem_test_001',
          eventPayload: {
            amountIncl: 1000,
            sign: 1,
          },
          createdBy: 'admin_test_001',
          eventBusinessDate: '2025-11-15',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('反映後に balanceDueIncl < 0 になる場合 → failed-precondition', async () => {
      const billId = 'bill_test_failed_006';
      const userId = 'user_test_failed_006';

      // grandTotalRounded = 10000, paidTotalIncl = 10000, totalAdjustmentsIncl = 0
      // 現在の balanceDueIncl = 10000 - 10000 + 0 = 0
      await createSettledBill(billId, userId, 10000, 10000, 0, 'settled');

      try {
        await postEventAdjustment({
          billId,
          idempotencyKey: 'idem_test_001',
          eventPayload: {
            amountIncl: 1000,
            sign: -1, // 減額
          },
          createdBy: 'admin_test_001',
          eventBusinessDate: '2025-11-15',
        });
        // 反映後の balanceDueIncl = 10000 - 10000 + (-1000) = -1000 < 0
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('status=refunded に対する調整は failed-precondition になること', async () => {
      const billId = 'bill_test_failed_007';
      const userId = 'user_test_failed_007';
      const grandTotalRounded = 10000;
      const totalRefundedIncl = 10000;

      await db.collection('bills').doc(billId).set({
        businessDate: '2025-11-15',
        status: 'refunded',
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

      // 減額で netSalesIncl が負になる
      try {
        await postEventAdjustment({
          billId,
          idempotencyKey: 'idem_test_001',
          eventPayload: {
            amountIncl: 1000,
            sign: -1, // 減額すると netSalesIncl = 0 - 1000 = -1000 < 0
          },
          createdBy: 'admin_test_001',
          eventBusinessDate: '2025-11-15',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });
  });

  describe('post-settlement status ごとの正常系', () => {
    it('status=partially_refunded で追加徴収が成功すること', async () => {
      const billId = 'bill_test_partial_001';
      const userId = 'user_test_partial_001';
      const idempotencyKey = `${billId}:event:adjustment:nonce_partial_001`;
      const createdBy = 'admin_test_001';
      const grandTotalRounded = 10000;
      const totalRefundedIncl = 3000;
      const paidTotalIncl = 7000; // balanceDueIncl = 10000 - 7000 - 3000 + 0 = 0

      await db.collection('bills').doc(billId).set({
        businessDate: '2025-11-15',
        status: 'partially_refunded',
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

      const result = await postEventAdjustment({
        billId,
        idempotencyKey,
        eventPayload: {
          amountIncl: 1000,
          sign: 1, // 追加徴収
        },
        createdBy,
        eventBusinessDate: '2025-11-15',
      });

      expect(result.success).toBe(true);
      expect(result.postEvents.totalAdjustmentsIncl).toBe(1000);
      // balanceDue の計算: 10000 - 7000 - 3000 + 1000 = 1000 (負にはならない)
    });
  });

  describe('idempotent-replay', () => {
    it('同一 idempotencyKey で再送 → reused: true', async () => {
      const billId = 'bill_test_idem_001';
      const userId = 'user_test_idem_001';
      const idempotencyKey = `${billId}:event:adjustment:nonce_idem_001`;
      const createdBy = 'admin_test_001';
      const adjustmentAmount = 1000;

      await createSettledBill(billId, userId, 10000, 10000, 0);

      // 1回目
      const result1 = await postEventAdjustment({
        billId,
        idempotencyKey,
        eventPayload: {
          amountIncl: adjustmentAmount,
          sign: 1,
        },
        createdBy,
        eventBusinessDate: '2025-11-15',
      });

      expect(result1.diagnostics?.reused).toBeUndefined();

      // 2回目（同一 idempotencyKey）
      const result2 = await postEventAdjustment({
        billId,
        idempotencyKey,
        eventPayload: {
          amountIncl: adjustmentAmount,
          sign: 1,
        },
        createdBy,
        eventBusinessDate: '2025-11-15',
      });

      expect(result2.diagnostics?.reused).toBe(true);

      // /bills/{billId}/events の doc 数は1つのまま
      const eventsSnapshot = await db.collection('bills').doc(billId)
        .collection('events').get();
      expect(eventsSnapshot.size).toBe(1);
    });
  });
});

