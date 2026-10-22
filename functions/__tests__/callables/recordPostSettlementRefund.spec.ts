/**
 * recordPostSettlementRefund callable の Emulator 統合テスト。
 *
 * Step04 changeSpec §3.2.4 / 04_確認観点と確認方法.md §2.3.1 に対応する。
 *
 * 観点:
 * 1. happy path（refund cashAction 作成 / adjustment remaining 解消 / parent 反映）
 * 2. multi method
 * 3. multi allocation
 * 4. partial allocation（remaining 部分減）
 * 5. validation 失敗（over-allocation / methodBreakdown 不一致 / direction 不整合 / completed adjustment への allocate / allocations 空）
 * 6. status precondition（settled / post_settlement_pending 以外を弾く）
 * 7. idempotent replay
 * 8. permission denied
 *
 * 旧 events 経路（postEventRefund / refundProcessing）はこのテストでは触らない。
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import { createPostSettlementAdjustment } from '../../src/domains/bills/callables/createPostSettlementAdjustment';
import { recordPostSettlementRefund } from '../../src/domains/bills/callables/recordPostSettlementRefund';
import {
  buildInitialCurrentSummary,
  buildInitialPostSettlementState,
  buildInitialReopenSummary,
} from '../../src/domains/bills/services/parentSummary';
import {
  buildInitialCycleDoc,
  INITIAL_SETTLEMENT_CYCLE,
} from '../../src/domains/bills/services/settlementCycles';

describe('recordPostSettlementRefund (Emulator)', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-rps-refund';

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

  async function createAdminDevice(uid: string, options?: {
    status?: 'active' | 'inactive' | 'pending';
    role?: 'admin' | 'terminal';
    accountingOption?: boolean;
  }) {
    await db.collection('devices').add({
      uid,
      role: options?.role ?? 'admin',
      status: options?.status ?? 'active',
      name: 'Test Device',
      options: options?.accountingOption ? { accounting: true } : {},
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

  /**
   * refund pending adjustment を 1 件作る helper（adjustmentId を返す）
   */
  async function createRefundPendingAdjustment(
    billId: string,
    adminId: string,
    amountIncl: number,
    nonce: string
  ): Promise<string> {
    const result: any = await (createPostSettlementAdjustment as any).run(
      callableRequest(adminId, {
        billId,
        clientNonce: nonce,
        adjustmentType: 'decrease_refund_pending',
        adjustmentAmountIncl: amountIncl,
        lines: [
          {
            targetCategory: 'item',
            targetName: 'item-x',
            operationType: 'sale',
            qtyDelta: -1,
            amountInclDelta: -amountIncl,
          },
        ],
      })
    );
    return result.adjustmentId;
  }

  describe('happy path', () => {
    it('refund pending 1 件を 1 cashAction で全額解消', async () => {
      const billId = 'bill-rp-h1';
      const adminId = 'admin-rp-h1';
      await createAdminDevice(adminId);
      await createSettledBill(billId);
      const adjustmentId = await createRefundPendingAdjustment(billId, adminId, 1000, 'h1-adj');

      const result: any = await (recordPostSettlementRefund as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'h1-cash-1',
          amountIncl: 1000,
          methodBreakdown: [{ method: 'cash', amountIncl: 1000 }],
          allocations: [{ adjustmentId, amountIncl: 1000 }],
          cashflowBusinessDate: '2026-05-09',
        })
      );

      expect(result.success).toBe(true);
      expect(result.cashAction).toMatchObject({
        sequenceNo: 2, // adjustment が 1 を消費したので、cashAction は 2
        cashActionType: 'refund',
        amountIncl: 1000,
        cashflowBusinessDate: '2026-05-09',
      });
      expect(result.parent.status).toBe('settled');
      expect(result.parent.requiredActionType).toBe('none');
      expect(result.parent.requiredActionIncl).toBe(0);
      expect(result.resolvedAdjustments).toEqual([
        {
          adjustmentId,
          requiredActionRemainingIncl: 0,
          adjustmentState: 'completed_by_cash_action',
        },
      ]);

      // cashAction doc
      const cashDoc = await db
        .collection('bills').doc(billId)
        .collection('settlementCycles').doc(String(INITIAL_SETTLEMENT_CYCLE))
        .collection('cashActions').doc(result.cashActionId).get();
      expect(cashDoc.exists).toBe(true);
      expect(cashDoc.data()).toMatchObject({
        sequenceNo: 2,
        cashActionType: 'refund',
        amountIncl: 1000,
        cashflowBusinessDate: '2026-05-09',
      });
      expect(cashDoc.data()?.methodBreakdown).toEqual([{ method: 'cash', amountIncl: 1000 }]);
      expect(cashDoc.data()?.allocations).toEqual([{ adjustmentId, amountIncl: 1000 }]);

      // adjustment doc が completed_by_cash_action / remaining=0
      const adjDoc = await db
        .collection('bills').doc(billId)
        .collection('settlementCycles').doc(String(INITIAL_SETTLEMENT_CYCLE))
        .collection('adjustments').doc(adjustmentId).get();
      expect(adjDoc.data()?.adjustmentState).toBe('completed_by_cash_action');
      expect(adjDoc.data()?.requiredActionRemainingIncl).toBe(0);

      // cycle.nextSequenceNo: 2 → 3
      const cycleDoc = await db
        .collection('bills').doc(billId)
        .collection('settlementCycles').doc(String(INITIAL_SETTLEMENT_CYCLE)).get();
      expect(cycleDoc.data()?.nextSequenceNo).toBe(3);

      // parent 反映
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.status).toBe('settled');
      expect(billData.currentSummary.refundedTotalIncl).toBe(1000);
      expect(billData.currentSummary.claimTotalIncl).toBe(4000); // adjustment で -1000
      expect(billData.postSettlementState.totalRefundedIncl).toBe(1000);
      expect(billData.postSettlementState.requiredActionType).toBe('none');
      expect(billData.postSettlementState.requiredActionIncl).toBe(0);
      expect(billData.postSettlementState.lastRecordType).toBe('cash_action');
      expect(billData.postSettlementState.lastRecordId).toBe(result.cashActionId);
    });
  });

  describe('multi method', () => {
    it('1000 を cash 600 + credit_card 400 で支払う', async () => {
      const billId = 'bill-rp-mm';
      const adminId = 'admin-rp-mm';
      await createAdminDevice(adminId);
      await createSettledBill(billId);
      const adjustmentId = await createRefundPendingAdjustment(billId, adminId, 1000, 'mm-adj');

      const result: any = await (recordPostSettlementRefund as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'mm-cash-1',
          amountIncl: 1000,
          methodBreakdown: [
            { method: 'cash', amountIncl: 600 },
            { method: 'credit_card', amountIncl: 400 },
          ],
          allocations: [{ adjustmentId, amountIncl: 1000 }],
          cashflowBusinessDate: '2026-05-09',
        })
      );

      expect(result.success).toBe(true);
      const cashDoc = await db
        .collection('bills').doc(billId)
        .collection('settlementCycles').doc(String(INITIAL_SETTLEMENT_CYCLE))
        .collection('cashActions').doc(result.cashActionId).get();
      expect(cashDoc.data()?.methodBreakdown).toEqual([
        { method: 'cash', amountIncl: 600 },
        { method: 'credit_card', amountIncl: 400 },
      ]);
      expect(cashDoc.data()?.amountIncl).toBe(1000);
    });
  });

  describe('multi allocation', () => {
    it('refund pending 600 + refund pending 400 を 1 cashAction で同時解消', async () => {
      const billId = 'bill-rp-ma';
      const adminId = 'admin-rp-ma';
      await createAdminDevice(adminId);
      await createSettledBill(billId);
      const adjA = await createRefundPendingAdjustment(billId, adminId, 600, 'ma-adj-1');
      const adjB = await createRefundPendingAdjustment(billId, adminId, 400, 'ma-adj-2');

      const result: any = await (recordPostSettlementRefund as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'ma-cash-1',
          amountIncl: 1000,
          methodBreakdown: [{ method: 'cash', amountIncl: 1000 }],
          allocations: [
            { adjustmentId: adjA, amountIncl: 600 },
            { adjustmentId: adjB, amountIncl: 400 },
          ],
          cashflowBusinessDate: '2026-05-09',
        })
      );

      expect(result.success).toBe(true);
      expect(result.parent.status).toBe('settled');
      expect(result.resolvedAdjustments).toEqual(
        expect.arrayContaining([
          {
            adjustmentId: adjA,
            requiredActionRemainingIncl: 0,
            adjustmentState: 'completed_by_cash_action',
          },
          {
            adjustmentId: adjB,
            requiredActionRemainingIncl: 0,
            adjustmentState: 'completed_by_cash_action',
          },
        ])
      );

      const billDoc = await db.collection('bills').doc(billId).get();
      expect(billDoc.data()?.postSettlementState.totalRefundedIncl).toBe(1000);
    });
  });

  describe('partial allocation', () => {
    it('refund pending 1000 のうち 500 のみ解消', async () => {
      const billId = 'bill-rp-pa';
      const adminId = 'admin-rp-pa';
      await createAdminDevice(adminId);
      await createSettledBill(billId);
      const adjustmentId = await createRefundPendingAdjustment(billId, adminId, 1000, 'pa-adj');

      const result: any = await (recordPostSettlementRefund as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'pa-cash-1',
          amountIncl: 500,
          methodBreakdown: [{ method: 'cash', amountIncl: 500 }],
          allocations: [{ adjustmentId, amountIncl: 500 }],
          cashflowBusinessDate: '2026-05-09',
        })
      );

      expect(result.parent.status).toBe('post_settlement_pending');
      expect(result.parent.requiredActionType).toBe('refund');
      expect(result.parent.requiredActionIncl).toBe(500);

      const adjDoc = await db
        .collection('bills').doc(billId)
        .collection('settlementCycles').doc(String(INITIAL_SETTLEMENT_CYCLE))
        .collection('adjustments').doc(adjustmentId).get();
      expect(adjDoc.data()?.adjustmentState).toBe('effective');
      expect(adjDoc.data()?.requiredActionRemainingIncl).toBe(500);
    });
  });

  describe('validation 失敗', () => {
    it('over-allocation で failed-precondition', async () => {
      const billId = 'bill-rp-over';
      const adminId = 'admin-rp-over';
      await createAdminDevice(adminId);
      await createSettledBill(billId);
      const adjustmentId = await createRefundPendingAdjustment(billId, adminId, 500, 'over-adj');

      await expect(
        (recordPostSettlementRefund as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'over-1',
            amountIncl: 1000,
            methodBreakdown: [{ method: 'cash', amountIncl: 1000 }],
            allocations: [{ adjustmentId, amountIncl: 1000 }],
            cashflowBusinessDate: '2026-05-09',
          })
        )
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });

    it('methodBreakdown 合計不一致で failed-precondition', async () => {
      const billId = 'bill-rp-mm-bad';
      const adminId = 'admin-rp-mm-bad';
      await createAdminDevice(adminId);
      await createSettledBill(billId);
      const adjustmentId = await createRefundPendingAdjustment(billId, adminId, 1000, 'mmbad-adj');

      await expect(
        (recordPostSettlementRefund as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'mmbad-1',
            amountIncl: 1000,
            methodBreakdown: [{ method: 'cash', amountIncl: 999 }],
            allocations: [{ adjustmentId, amountIncl: 1000 }],
            cashflowBusinessDate: '2026-05-09',
          })
        )
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });

    it('collection 系 adjustment への refund cashAction allocate で failed-precondition', async () => {
      const billId = 'bill-rp-dir';
      const adminId = 'admin-rp-dir';
      await createAdminDevice(adminId);
      await createSettledBill(billId);

      // collection pending adjustment を作成
      const adjResult: any = await (createPostSettlementAdjustment as any).run(
        callableRequest(adminId, {
          billId,
          clientNonce: 'dir-adj-collection',
          adjustmentType: 'increase_collection_pending',
          adjustmentAmountIncl: 500,
          lines: [
            {
              targetCategory: 'extra',
              targetName: 'fee',
              operationType: 'extra',
              qtyDelta: 1,
              amountInclDelta: 500,
            },
          ],
        })
      );

      await expect(
        (recordPostSettlementRefund as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'dir-1',
            amountIncl: 500,
            methodBreakdown: [{ method: 'cash', amountIncl: 500 }],
            allocations: [{ adjustmentId: adjResult.adjustmentId, amountIncl: 500 }],
            cashflowBusinessDate: '2026-05-09',
          })
        )
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });

    it('allocations が空だと callable 段階で invalid-argument', async () => {
      const billId = 'bill-rp-empty';
      const adminId = 'admin-rp-empty';
      await createAdminDevice(adminId);
      await createSettledBill(billId);

      await expect(
        (recordPostSettlementRefund as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'empty-1',
            amountIncl: 1000,
            methodBreakdown: [{ method: 'cash', amountIncl: 1000 }],
            allocations: [],
            cashflowBusinessDate: '2026-05-09',
          })
        )
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    });

    it('completed_by_cash_action 済 adjustment への allocate で failed-precondition', async () => {
      const billId = 'bill-rp-comp';
      const adminId = 'admin-rp-comp';
      await createAdminDevice(adminId);
      await createSettledBill(billId);
      const adjustmentId = await createRefundPendingAdjustment(billId, adminId, 500, 'comp-adj');

      // 一度全額解消
      await (recordPostSettlementRefund as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'comp-cash-1',
          amountIncl: 500,
          methodBreakdown: [{ method: 'cash', amountIncl: 500 }],
          allocations: [{ adjustmentId, amountIncl: 500 }],
          cashflowBusinessDate: '2026-05-09',
        })
      );

      // 同じ adjustment にもう一度 allocate しようとすると弾かれる
      await expect(
        (recordPostSettlementRefund as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'comp-cash-2',
            amountIncl: 100,
            methodBreakdown: [{ method: 'cash', amountIncl: 100 }],
            allocations: [{ adjustmentId, amountIncl: 100 }],
            cashflowBusinessDate: '2026-05-09',
          })
        )
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });
  });

  describe('status precondition', () => {
    it('status=open の bill では failed-precondition', async () => {
      const billId = 'bill-rp-open';
      const adminId = 'admin-rp-open';
      await createAdminDevice(adminId);

      await db.collection('bills').doc(billId).set({
        status: 'open',
        businessDate: '2026-05-09',
        meta: { schemaVersion: '1.3' },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await expect(
        (recordPostSettlementRefund as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'open-1',
            amountIncl: 100,
            methodBreakdown: [{ method: 'cash', amountIncl: 100 }],
            allocations: [{ adjustmentId: 'any', amountIncl: 100 }],
            cashflowBusinessDate: '2026-05-09',
          })
        )
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });
  });

  describe('idempotent replay', () => {
    it('同 idempotencyKey で再実行すると同じ結果を返し、cycle.nextSequenceNo が再進行しない', async () => {
      const billId = 'bill-rp-idem';
      const adminId = 'admin-rp-idem';
      await createAdminDevice(adminId);
      await createSettledBill(billId);
      const adjustmentId = await createRefundPendingAdjustment(billId, adminId, 1000, 'idem-adj');

      const first: any = await (recordPostSettlementRefund as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'idem-cash-1',
          amountIncl: 1000,
          methodBreakdown: [{ method: 'cash', amountIncl: 1000 }],
          allocations: [{ adjustmentId, amountIncl: 1000 }],
          cashflowBusinessDate: '2026-05-09',
        })
      );

      const second: any = await (recordPostSettlementRefund as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'idem-cash-1',
          amountIncl: 1000,
          methodBreakdown: [{ method: 'cash', amountIncl: 1000 }],
          allocations: [{ adjustmentId, amountIncl: 1000 }],
          cashflowBusinessDate: '2026-05-09',
        })
      );

      expect(second.cashActionId).toBe(first.cashActionId);
      expect(second.diagnostics?.reused).toBe(true);

      // cycle.nextSequenceNo は 1 回分だけ進行（adj=1, cash=2 → 3）
      const cycleDoc = await db
        .collection('bills').doc(billId)
        .collection('settlementCycles').doc(String(INITIAL_SETTLEMENT_CYCLE)).get();
      expect(cycleDoc.data()?.nextSequenceNo).toBe(3);
    });
  });

  describe('permission denied', () => {
    it('device が active でないと permission-denied', async () => {
      const billId = 'bill-rp-perm1';
      const adminId = 'admin-rp-perm1';
      await createAdminDevice(adminId, { status: 'inactive' });
      await createSettledBill(billId);
      const adjustmentId = await createRefundPendingAdjustment('bill-rp-perm-pre', 'admin-rp-perm-pre', 100, 'perm-pre').catch(() => 'unused');

      await expect(
        (recordPostSettlementRefund as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'perm-1',
            amountIncl: 100,
            methodBreakdown: [{ method: 'cash', amountIncl: 100 }],
            allocations: [{ adjustmentId, amountIncl: 100 }],
            cashflowBusinessDate: '2026-05-09',
          })
        )
      ).rejects.toMatchObject({ code: 'permission-denied' });
    });

    it('terminal で options.accounting なしだと permission-denied', async () => {
      const billId = 'bill-rp-perm2';
      const adminId = 'admin-rp-perm2';
      await createAdminDevice(adminId, { role: 'terminal', accountingOption: false });
      await createSettledBill(billId);

      await expect(
        (recordPostSettlementRefund as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'perm2-1',
            amountIncl: 100,
            methodBreakdown: [{ method: 'cash', amountIncl: 100 }],
            allocations: [{ adjustmentId: 'any', amountIncl: 100 }],
            cashflowBusinessDate: '2026-05-09',
          })
        )
      ).rejects.toMatchObject({ code: 'permission-denied' });
    });
  });
});
