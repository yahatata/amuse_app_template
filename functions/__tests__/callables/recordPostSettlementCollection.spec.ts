/**
 * recordPostSettlementCollection callable の Emulator 統合テスト。
 *
 * Step04 changeSpec §3.2.5 / 04_確認観点と確認方法.md §2.3.2 に対応する。
 *
 * `recordPostSettlementRefund` と内部 repo を共有しているため、
 * direction 整合 / collection 派生の reflection を中心に最小限の確認を行う。
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import { createPostSettlementAdjustment } from '../../src/domains/bills/callables/createPostSettlementAdjustment';
import { recordPostSettlementCollection } from '../../src/domains/bills/callables/recordPostSettlementCollection';
import {
  buildInitialCurrentSummary,
  buildInitialPostSettlementState,
  buildInitialReopenSummary,
} from '../../src/domains/bills/services/parentSummary';
import {
  buildInitialCycleDoc,
  INITIAL_SETTLEMENT_CYCLE,
} from '../../src/domains/bills/services/settlementCycles';

describe('recordPostSettlementCollection (Emulator)', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-rps-collection';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
    db = getFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map((app) => app?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  async function createAdminDevice(uid: string) {
    await db.collection('devices').add({
      uid,
      role: 'admin',
      status: 'active',
      name: 'Test Device',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function createSettledBill(billId: string) {
    const initialCurrentSummary = {
      ...buildInitialCurrentSummary(),
      claimTotalIncl: 5000,
      receivedTotalIncl: 5000,
      netSalesIncl: 5000,
    };
    const initialReopenSummary = {
      ...buildInitialReopenSummary(),
      currentSettlementCycle: INITIAL_SETTLEMENT_CYCLE,
      latestSettledCycle: INITIAL_SETTLEMENT_CYCLE,
    };
    await db.collection('bills').doc(billId).set({
      businessDate: '2026-05-09',
      status: 'settled',
      party: { userId: 'user-A', pokerName: 'taro' },
      amounts: { grandTotalRounded: 5000 },
      currentSummary: initialCurrentSummary,
      postSettlementState: buildInitialPostSettlementState(),
      reopenSummary: initialReopenSummary,
      meta: { schemaVersion: '1.3' },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db
      .collection('bills').doc(billId)
      .collection('settlementCycles').doc(String(INITIAL_SETTLEMENT_CYCLE))
      .set({
        ...buildInitialCycleDoc({
          cycleNo: INITIAL_SETTLEMENT_CYCLE,
          openedAt: admin.firestore.FieldValue.serverTimestamp(),
          openedBy: null,
          openedReason: 'initial',
          openedFromCycleNo: null,
        }),
        cycleState: 'settled',
        settledAt: admin.firestore.FieldValue.serverTimestamp(),
        closedReason: 'settle',
      });
  }

  function callableRequest(adminId: string, data: any) {
    return { auth: { uid: adminId }, data };
  }

  async function createCollectionPendingAdjustment(
    billId: string,
    adminId: string,
    amountIncl: number,
    nonce: string
  ): Promise<string> {
    const result: any = await (createPostSettlementAdjustment as any).run(
      callableRequest(adminId, {
        billId,
        clientNonce: nonce,
        adjustmentType: 'increase_collection_pending',
        adjustmentAmountIncl: amountIncl,
        lines: [
          {
            targetCategory: 'extra',
            targetName: 'late-fee',
            operationType: 'extra',
            qtyDelta: 1,
            amountInclDelta: amountIncl,
          },
        ],
      })
    );
    return result.adjustmentId;
  }

  describe('happy path', () => {
    it('collection pending 1 件を 1 cashAction で全額解消、parent に collection 派生反映', async () => {
      const billId = 'bill-cp-h1';
      const adminId = 'admin-cp-h1';
      await createAdminDevice(adminId);
      await createSettledBill(billId);
      const adjustmentId = await createCollectionPendingAdjustment(
        billId,
        adminId,
        500,
        'cp-h1-adj'
      );

      const result: any = await (recordPostSettlementCollection as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'cp-h1-cash-1',
          amountIncl: 500,
          methodBreakdown: [{ method: 'cash', amountIncl: 500 }],
          allocations: [{ adjustmentId, amountIncl: 500 }],
          cashflowBusinessDate: '2026-05-09',
        })
      );

      expect(result.success).toBe(true);
      expect(result.cashAction).toMatchObject({
        cashActionType: 'collection',
        amountIncl: 500,
        cashflowBusinessDate: '2026-05-09',
      });
      expect(result.parent.status).toBe('settled');

      // cashAction doc
      const cashDoc = await db
        .collection('bills').doc(billId)
        .collection('settlementCycles').doc(String(INITIAL_SETTLEMENT_CYCLE))
        .collection('cashActions').doc(result.cashActionId).get();
      expect(cashDoc.data()?.cashActionType).toBe('collection');

      // adjustment doc
      const adjDoc = await db
        .collection('bills').doc(billId)
        .collection('settlementCycles').doc(String(INITIAL_SETTLEMENT_CYCLE))
        .collection('adjustments').doc(adjustmentId).get();
      expect(adjDoc.data()?.adjustmentState).toBe('completed_by_cash_action');

      // parent 反映: collection 派生
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.currentSummary.receivedTotalIncl).toBe(5500);
      expect(billData.currentSummary.refundedTotalIncl).toBe(0);
      expect(billData.currentSummary.claimTotalIncl).toBe(5500); // adjustment +500
      expect(billData.postSettlementState.totalCollectedIncl).toBe(500);
      expect(billData.postSettlementState.totalRefundedIncl).toBe(0);
      expect(billData.postSettlementState.requiredActionType).toBe('none');
      expect(billData.postSettlementState.lastRecordType).toBe('cash_action');
    });
  });

  describe('direction 不整合', () => {
    it('refund 系 adjustment（decrease）への collection cashAction allocate で failed-precondition', async () => {
      const billId = 'bill-cp-dir';
      const adminId = 'admin-cp-dir';
      await createAdminDevice(adminId);
      await createSettledBill(billId);

      const refundResult: any = await (createPostSettlementAdjustment as any).run(
        callableRequest(adminId, {
          billId,
          clientNonce: 'cp-dir-refund',
          adjustmentType: 'decrease_refund_pending',
          adjustmentAmountIncl: 1000,
          lines: [
            {
              targetCategory: 'item',
              targetName: 'item-x',
              operationType: 'sale',
              qtyDelta: -1,
              amountInclDelta: -1000,
            },
          ],
        })
      );

      await expect(
        (recordPostSettlementCollection as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'cp-dir-1',
            amountIncl: 1000,
            methodBreakdown: [{ method: 'cash', amountIncl: 1000 }],
            allocations: [{ adjustmentId: refundResult.adjustmentId, amountIncl: 1000 }],
            cashflowBusinessDate: '2026-05-09',
          })
        )
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });
  });
});
