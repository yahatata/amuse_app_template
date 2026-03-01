/**
 * bills.events.onCreate トリガの統合テスト
 * 
 * ChangeSpec P1-07 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - refund イベント作成時に postEvents.totalRefundedIncl と paymentsSummary が正しく更新されること
 * - adjustment イベント作成時に postEvents.totalAdjustmentsIncl と paymentsSummary が正しく更新されること
 * - cancel イベント作成時に status = 'voided' に更新されること
 * - reopen イベント作成時に status = 'in_progress' に更新されること
 * - 複数イベントの累積処理が正しく動作すること
 * - バリデーション違反時に failed-precondition が返ること
 * 
 * 注意: トリガは直接テストできないため、/bills/{billId}/events/{eventId} を作成し、
 * トリガが発火して親docが更新されることを確認する
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { billsEventsOnCreate } from '../../src/domains/bills/triggers/billsEventsOnCreate';

describe('bills.events.onCreate', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-bills-events-oncreate';

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
    grandTotalRounded: number = 10000,
    paidTotalIncl: number = 10000,
    totalRefundedIncl: number = 0,
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
        totalRefundedIncl,
        totalAdjustmentsIncl,
        netSalesIncl: grandTotalRounded - totalRefundedIncl + totalAdjustmentsIncl,
      },
      paymentsSummary: {
        paidTotalIncl,
        balanceDueIncl: grandTotalRounded - paidTotalIncl - totalRefundedIncl + totalAdjustmentsIncl,
        byMethod: {},
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      meta: {
        schemaVersion: '1.3',
      },
    });
  }

  // テスト用のヘルパ関数: イベントを作成してトリガを手動で発火させる
  async function createEventAndTrigger(
    billId: string,
    eventId: string,
    eventData: any
  ) {
    const eventRef = db.collection('bills').doc(billId).collection('events').doc(eventId);
    
    // イベントドキュメントを作成
    await eventRef.set(eventData);
    
    // トリガ関数を手動で呼び出す（Firestore Emulatorでは自動発火しないため）
    const eventDoc = await eventRef.get();
    const mockEvent = {
      data: {
        data: () => eventDoc.data(),
        ref: eventRef,
        exists: eventDoc.exists,
      },
      params: {
        billId,
        eventId,
      },
    };
    
    // v2のonDocumentCreatedのハンドラを直接呼び出す
    // billsEventsOnCreate は onDocumentCreated の戻り値で、run メソッドを持つ
    await (billsEventsOnCreate as any).run(mockEvent);
    
    return eventRef;
  }

  describe('refund イベント', () => {
    it('refund イベント作成時に postEvents.totalRefundedIncl と paymentsSummary が正しく更新されること', async () => {
      const billId = 'bill_test_refund_001';
      const userId = 'user_test_refund_001';
      const eventId = 'event_refund_001';
      const refundAmount = 3000;

      await createSettledBill(billId, userId, 10000, 10000, 0);

      await createEventAndTrigger(billId, eventId, {
        type: 'refund',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'admin_test_001',
        idempotencyKey: eventId,
        originBusinessDate: '2025-11-15',
        eventBusinessDate: '2025-11-15',
        refund: {
          amountIncl: refundAmount,
        },
      });

      // 親docが更新されている
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.postEvents?.totalRefundedIncl).toBe(refundAmount);
      expect(billData.postEvents?.netSalesIncl).toBe(10000 - refundAmount);
      // balanceDueIncl = max(0, grandTotalRounded - paidTotalIncl - totalRefundedIncl + totalAdjustmentsIncl)
      // = max(0, 10000 - 10000 - 3000 + 0) = max(0, -3000) = 0
      expect(billData.paymentsSummary?.balanceDueIncl).toBe(0);
      expect(billData.status).toBe('partially_refunded');

      // event に appliedAt が設定されている
      const eventDoc = await db.collection('bills').doc(billId)
        .collection('events').doc(eventId).get();
      const eventData = eventDoc.data()!;
      expect(eventData.appliedAt).toBeDefined();
    });

    it('全額返金の場合、status が refunded になること', async () => {
      const billId = 'bill_test_refund_002';
      const userId = 'user_test_refund_002';
      const eventId = 'event_refund_002';
      const refundAmount = 10000;

      await createSettledBill(billId, userId, 10000, 10000, 0);

      await createEventAndTrigger(billId, eventId, {
        type: 'refund',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'admin_test_001',
        idempotencyKey: eventId,
        originBusinessDate: '2025-11-15',
        eventBusinessDate: '2025-11-15',
        refund: {
          amountIncl: refundAmount,
        },
      });

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.status).toBe('refunded');
    });
  });

  describe('adjustment イベント', () => {
    it('adjustment イベント作成時に postEvents.totalAdjustmentsIncl と paymentsSummary が正しく更新されること', async () => {
      const billId = 'bill_test_adjustment_001';
      const userId = 'user_test_adjustment_001';
      const eventId = 'event_adjustment_001';
      const adjustmentAmount = 1000;

      await createSettledBill(billId, userId, 10000, 10000, 0);

      await createEventAndTrigger(billId, eventId, {
        type: 'adjustment',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'admin_test_001',
        idempotencyKey: eventId,
        originBusinessDate: '2025-11-15',
        eventBusinessDate: '2025-11-15',
        adjustment: {
          sign: 1,
          amountIncl: adjustmentAmount,
        },
      });

      // 親docが更新されている
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.postEvents?.totalAdjustmentsIncl).toBe(adjustmentAmount);
      expect(billData.postEvents?.netSalesIncl).toBe(10000 + adjustmentAmount);
      expect(billData.paymentsSummary?.balanceDueIncl).toBe(10000 - 10000 + adjustmentAmount);

      // event に appliedAt が設定されている
      const eventDoc = await db.collection('bills').doc(billId)
        .collection('events').doc(eventId).get();
      const eventData = eventDoc.data()!;
      expect(eventData.appliedAt).toBeDefined();
    });
  });

  describe('cancel イベント', () => {
    it('cancel イベント作成時に status = voided に更新されること', async () => {
      const billId = 'bill_test_cancel_001';
      const userId = 'user_test_cancel_001';
      const eventId = 'event_cancel_001';

      await createSettledBill(billId, userId, 10000, 0, 0); // 支払い・返金なし

      await createEventAndTrigger(billId, eventId, {
        type: 'cancel',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'admin_test_001',
        idempotencyKey: eventId,
        originBusinessDate: '2025-11-15',
        eventBusinessDate: '2025-11-15',
      });

      // 親docが更新されている
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.status).toBe('voided');

      // event に appliedAt が設定されている
      const eventDoc = await db.collection('bills').doc(billId)
        .collection('events').doc(eventId).get();
      const eventData = eventDoc.data()!;
      expect(eventData.appliedAt).toBeDefined();
    });
  });

  describe('reopen イベント', () => {
    it('reopen イベント作成時に status = in_progress に更新されること', async () => {
      const billId = 'bill_test_reopen_001';
      const userId = 'user_test_reopen_001';
      const eventId = 'event_reopen_001';

      await createSettledBill(billId, userId);

      await createEventAndTrigger(billId, eventId, {
        type: 'reopen',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'admin_test_001',
        idempotencyKey: eventId,
        originBusinessDate: '2025-11-15',
        eventBusinessDate: '2025-11-15',
      });

      // 親docが更新されている
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.status).toBe('in_progress');

      // event に appliedAt が設定されている
      const eventDoc = await db.collection('bills').doc(billId)
        .collection('events').doc(eventId).get();
      const eventData = eventDoc.data()!;
      expect(eventData.appliedAt).toBeDefined();
    });
  });

  describe('複数イベントの累積処理', () => {
    it('複数の refund イベントが累積されること', async () => {
      const billId = 'bill_test_accumulate_001';
      const userId = 'user_test_accumulate_001';
      const firstRefund = 3000;
      const secondRefund = 2000;

      await createSettledBill(billId, userId, 10000, 10000, 0);

      // 1回目の返金
      await createEventAndTrigger(billId, 'event_refund_001', {
        type: 'refund',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'admin_test_001',
        idempotencyKey: 'event_refund_001',
        originBusinessDate: '2025-11-15',
        eventBusinessDate: '2025-11-15',
        refund: {
          amountIncl: firstRefund,
        },
      });

      // 2回目の返金
      await createEventAndTrigger(billId, 'event_refund_002', {
        type: 'refund',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'admin_test_001',
        idempotencyKey: 'event_refund_002',
        originBusinessDate: '2025-11-15',
        eventBusinessDate: '2025-11-15',
        refund: {
          amountIncl: secondRefund,
        },
      });

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.postEvents?.totalRefundedIncl).toBe(firstRefund + secondRefund);
      expect(billData.status).toBe('partially_refunded');
    });
  });

  describe('バリデーション違反', () => {
    it('pre-settlement status のイベントは適用されないこと（no-op）', async () => {
      const billId = 'bill_test_validation_001';
      const userId = 'user_test_validation_001';
      const eventId = 'event_validation_001';

      await createSettledBill(billId, userId, 10000, 10000, 0, 0, 'open');

      const billDocBefore = await db.collection('bills').doc(billId).get();
      const billDataBefore = billDocBefore.data()!;
      const updatedAtBefore = billDataBefore.updatedAt;

      await createEventAndTrigger(billId, eventId, {
        type: 'refund',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'admin_test_001',
        idempotencyKey: eventId,
        originBusinessDate: '2025-11-15',
        eventBusinessDate: '2025-11-15',
        refund: {
          amountIncl: 1000,
        },
      });

      // 親docが更新されていない（no-op）
      const billDocAfter = await db.collection('bills').doc(billId).get();
      const billDataAfter = billDocAfter.data()!;
      expect(billDataAfter.postEvents?.totalRefundedIncl).toBe(0);
      expect(billDataAfter.updatedAt).toEqual(updatedAtBefore);

      // event に appliedAt が設定されていない
      const eventDoc = await db.collection('bills').doc(billId)
        .collection('events').doc(eventId).get();
      const eventData = eventDoc.data()!;
      expect(eventData.appliedAt).toBeUndefined();
    });

    it('voided status のイベントは適用されないこと（no-op）', async () => {
      const billId = 'bill_test_validation_002';
      const userId = 'user_test_validation_002';
      const eventId = 'event_validation_002';

      await createSettledBill(billId, userId, 10000, 10000, 0, 0, 'voided');

      const billDocBefore = await db.collection('bills').doc(billId).get();
      const billDataBefore = billDocBefore.data()!;
      const updatedAtBefore = billDataBefore.updatedAt;

      await createEventAndTrigger(billId, eventId, {
        type: 'refund',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'admin_test_001',
        idempotencyKey: eventId,
        originBusinessDate: '2025-11-15',
        eventBusinessDate: '2025-11-15',
        refund: {
          amountIncl: 1000,
        },
      });

      // 親docが更新されていない（no-op）
      const billDocAfter = await db.collection('bills').doc(billId).get();
      const billDataAfter = billDocAfter.data()!;
      expect(billDataAfter.postEvents?.totalRefundedIncl).toBe(0);
      expect(billDataAfter.updatedAt).toEqual(updatedAtBefore);
    });
  });
});

