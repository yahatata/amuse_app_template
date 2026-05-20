/**
 * createPostSettlementAdjustment callable の Emulator 統合テスト。
 *
 * Step03 changeSpec §3.3 / 04_確認観点と確認方法.md §1.5 に対応する。
 *
 * 観点:
 * 1. 4 パターン happy path（adjustment doc / parent / status / cycle.nextSequenceNo の検証）
 * 2. opposite-direction offset（差額残し / 完全相殺）
 * 3. validation 失敗（line 合計不一致 / tournament line targetId 不足 / line-less）
 * 4. status precondition（settled / post_settlement_pending 以外を弾く）
 * 5. idempotent replay（同 key で同じ結果が返り、cycle.nextSequenceNo が再進行しない）
 * 6. permission denied
 *
 * 旧 events 経路（postEventAdjustment / billsEventsOnCreate）はこのテストでは触らない。
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import { createPostSettlementAdjustment } from '../../src/domains/bills/callables/createPostSettlementAdjustment';
import {
  buildInitialCurrentSummary,
  buildInitialPostSettlementState,
  buildInitialReopenSummary,
} from '../../src/domains/bills/services/parentSummary';
import {
  buildInitialCycleDoc,
  INITIAL_SETTLEMENT_CYCLE,
} from '../../src/domains/bills/services/settlementCycles';

describe('createPostSettlementAdjustment (Emulator)', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-cps-adjustment';

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
      name: 'Test Admin Device',
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
      .collection('bills')
      .doc(billId)
      .collection('settlementCycles')
      .doc(String(INITIAL_SETTLEMENT_CYCLE))
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

  describe('4 patterns happy path', () => {
    it('decrease_refund_pending: adjustment 作成 + parent requiredActionType=refund / status=post_settlement_pending', async () => {
      const billId = 'bill-pat1';
      const adminId = 'admin-pat1';
      await createAdminDevice(adminId);
      await createSettledBill(billId);

      const result: any = await (createPostSettlementAdjustment as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'pat1-key-1',
          adjustmentType: 'decrease_refund_pending',
          adjustmentAmountIncl: 1000,
          lines: [
            {
              targetCategory: 'item',
              targetName: 'apple',
              operationType: 'sale',
              qtyDelta: -1,
              amountInclDelta: -1000,
            },
          ],
        })
      );

      expect(result.success).toBe(true);
      expect(result.cycleNo).toBe(INITIAL_SETTLEMENT_CYCLE);
      expect(result.cashActionId).toBeNull();
      expect(result.adjustment).toMatchObject({
        sequenceNo: 1,
        adjustmentType: 'decrease_refund_pending',
        adjustmentDirection: 'decrease',
        adjustmentAmountIncl: 1000,
        requiredActionRemainingIncl: 1000,
        adjustmentState: 'effective',
      });
      expect(result.parent).toMatchObject({
        status: 'post_settlement_pending',
        requiredActionType: 'refund',
        requiredActionIncl: 1000,
      });

      // adjustment doc 確認
      const adjDoc = await db
        .collection('bills').doc(billId)
        .collection('settlementCycles').doc(String(INITIAL_SETTLEMENT_CYCLE))
        .collection('adjustments').doc(result.adjustmentId)
        .get();
      expect(adjDoc.exists).toBe(true);
      expect(adjDoc.data()).toMatchObject({
        sequenceNo: 1,
        adjustmentType: 'decrease_refund_pending',
        cashActionTypeAtCreation: 'refund',
        cashActionHandledAtCreation: false,
        adjustmentState: 'effective',
        requiredActionRemainingIncl: 1000,
        supersededByAdjustmentId: null,
      });

      // cycle.nextSequenceNo: 1 → 2
      const cycleDoc = await db
        .collection('bills').doc(billId)
        .collection('settlementCycles').doc(String(INITIAL_SETTLEMENT_CYCLE)).get();
      expect(cycleDoc.data()?.nextSequenceNo).toBe(2);

      // cashActions は作成されていない
      const cashActions = await db
        .collection('bills').doc(billId)
        .collection('settlementCycles').doc(String(INITIAL_SETTLEMENT_CYCLE))
        .collection('cashActions').get();
      expect(cashActions.size).toBe(0);

      // parent 反映
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.status).toBe('post_settlement_pending');
      expect(billData.currentSummary.claimTotalIncl).toBe(4000);
      expect(billData.currentSummary.netSalesIncl).toBe(4000);
      expect(billData.postSettlementState.requiredActionType).toBe('refund');
      expect(billData.postSettlementState.requiredActionIncl).toBe(1000);
      expect(billData.postSettlementState.totalAdjustmentsIncl).toBe(-1000);
      expect(billData.postSettlementState.lastRecordType).toBe('adjustment');
      expect(billData.postSettlementState.hasPostSettlementActivity).toBe(true);
    });

    it('decrease_refunded: adjustment + immediate refund cashAction、status=settled、cycle.nextSequenceNo=3', async () => {
      const billId = 'bill-pat2';
      const adminId = 'admin-pat2';
      await createAdminDevice(adminId);
      await createSettledBill(billId);

      const result: any = await (createPostSettlementAdjustment as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'pat2-key-1',
          adjustmentType: 'decrease_refunded',
          adjustmentAmountIncl: 1000,
          lines: [
            {
              targetCategory: 'item',
              targetName: 'apple',
              operationType: 'sale',
              qtyDelta: -1,
              amountInclDelta: -1000,
            },
          ],
          immediateCashAction: { method: 'cash' },
        })
      );

      expect(result.adjustment).toMatchObject({
        sequenceNo: 1,
        adjustmentType: 'decrease_refunded',
        requiredActionRemainingIncl: 0,
        adjustmentState: 'completed_by_cash_action',
      });
      expect(result.parent.status).toBe('settled');
      expect(result.parent.requiredActionType).toBe('none');
      expect(result.cashActionId).not.toBeNull();

      // adjustment doc
      const adjDoc = await db
        .collection('bills').doc(billId)
        .collection('settlementCycles').doc(String(INITIAL_SETTLEMENT_CYCLE))
        .collection('adjustments').doc(result.adjustmentId).get();
      expect(adjDoc.data()?.adjustmentState).toBe('completed_by_cash_action');
      expect(adjDoc.data()?.requiredActionRemainingIncl).toBe(0);

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
      expect(cashDoc.data()?.allocations).toEqual([
        { adjustmentId: result.adjustmentId, amountIncl: 1000 },
      ]);
      expect(cashDoc.data()?.methodBreakdown).toEqual([{ method: 'cash', amountIncl: 1000 }]);

      // cycle.nextSequenceNo: 1 → 3 (adjustment + cashAction で 2 つ消費)
      const cycleDoc = await db
        .collection('bills').doc(billId)
        .collection('settlementCycles').doc(String(INITIAL_SETTLEMENT_CYCLE)).get();
      expect(cycleDoc.data()?.nextSequenceNo).toBe(3);

      // parent 反映（Step04: cashAction が作られたら lastRecordType='cash_action' / lastRecordId=cashActionId）
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.status).toBe('settled');
      expect(billData.currentSummary.claimTotalIncl).toBe(4000);
      expect(billData.currentSummary.refundedTotalIncl).toBe(1000);
      expect(billData.postSettlementState.totalRefundedIncl).toBe(1000);
      expect(billData.postSettlementState.requiredActionType).toBe('none');
      expect(billData.postSettlementState.requiredActionIncl).toBe(0);
      expect(billData.postSettlementState.lastRecordType).toBe('cash_action');
      expect(billData.postSettlementState.lastRecordId).toBe(result.cashActionId);
    });

    it('increase_collection_pending: parent requiredActionType=collection / status=post_settlement_pending', async () => {
      const billId = 'bill-pat3';
      const adminId = 'admin-pat3';
      await createAdminDevice(adminId);
      await createSettledBill(billId);

      const result: any = await (createPostSettlementAdjustment as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'pat3-key-1',
          adjustmentType: 'increase_collection_pending',
          adjustmentAmountIncl: 500,
          lines: [
            {
              targetCategory: 'extra',
              targetName: 'late-fee',
              operationType: 'extra',
              qtyDelta: 1,
              amountInclDelta: 500,
            },
          ],
        })
      );

      expect(result.parent).toMatchObject({
        status: 'post_settlement_pending',
        requiredActionType: 'collection',
        requiredActionIncl: 500,
      });
      expect(result.cashActionId).toBeNull();

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.currentSummary.claimTotalIncl).toBe(5500);
      expect(billData.currentSummary.netSalesIncl).toBe(5500);
      expect(billData.postSettlementState.totalAdjustmentsIncl).toBe(500);
    });

    it('increase_collected: adjustment + immediate collection cashAction', async () => {
      const billId = 'bill-pat4';
      const adminId = 'admin-pat4';
      await createAdminDevice(adminId);
      await createSettledBill(billId);

      const result: any = await (createPostSettlementAdjustment as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'pat4-key-1',
          adjustmentType: 'increase_collected',
          adjustmentAmountIncl: 700,
          lines: [
            {
              targetCategory: 'tournament',
              targetId: 'tpl-A',
              targetName: 'tour-A',
              operationType: 'addon',
              qtyDelta: 1,
              amountInclDelta: 700,
            },
          ],
          immediateCashAction: { method: 'credit_card' },
        })
      );

      expect(result.adjustment.adjustmentState).toBe('completed_by_cash_action');
      expect(result.parent.status).toBe('settled');
      expect(result.cashActionId).not.toBeNull();

      const cashDoc = await db
        .collection('bills').doc(billId)
        .collection('settlementCycles').doc(String(INITIAL_SETTLEMENT_CYCLE))
        .collection('cashActions').doc(result.cashActionId).get();
      expect(cashDoc.data()?.cashActionType).toBe('collection');
      expect(cashDoc.data()?.methodBreakdown).toEqual([
        { method: 'credit_card', amountIncl: 700 },
      ]);

      const billDoc = await db.collection('bills').doc(billId).get();
      expect(billDoc.data()?.currentSummary.receivedTotalIncl).toBe(5700);
      expect(billDoc.data()?.postSettlementState.totalCollectedIncl).toBe(700);
      // Step04: cashAction が作られたら lastRecordType='cash_action' / lastRecordId=cashActionId
      expect(billDoc.data()?.postSettlementState.lastRecordType).toBe('cash_action');
      expect(billDoc.data()?.postSettlementState.lastRecordId).toBe(result.cashActionId);
    });
  });

  describe('opposite-direction offset', () => {
    it('refund pending 1000 → collection pending 1500 で collection 残 500', async () => {
      const billId = 'bill-off1';
      const adminId = 'admin-off1';
      await createAdminDevice(adminId);
      await createSettledBill(billId);

      // 1) refund 1000
      const r1: any = await (createPostSettlementAdjustment as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'off1-key-a',
          adjustmentType: 'decrease_refund_pending',
          adjustmentAmountIncl: 1000,
          lines: [
            {
              targetCategory: 'item',
              targetName: 'apple',
              operationType: 'sale',
              qtyDelta: -1,
              amountInclDelta: -1000,
            },
          ],
        })
      );

      // 2) collection 1500 → 1) を completed_by_offset、2) 残 500 / state=effective / parent=collection 500
      const r2: any = await (createPostSettlementAdjustment as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'off1-key-b',
          adjustmentType: 'increase_collection_pending',
          adjustmentAmountIncl: 1500,
          lines: [
            {
              targetCategory: 'extra',
              targetName: 'late-fee',
              operationType: 'extra',
              qtyDelta: 1,
              amountInclDelta: 1500,
            },
          ],
        })
      );

      expect(r2.adjustment.requiredActionRemainingIncl).toBe(500);
      expect(r2.adjustment.adjustmentState).toBe('effective');
      expect(r2.parent.status).toBe('post_settlement_pending');
      expect(r2.parent.requiredActionType).toBe('collection');
      expect(r2.parent.requiredActionIncl).toBe(500);

      // 1) の adjustment が completed_by_offset に遷移している
      const adj1Doc = await db
        .collection('bills').doc(billId)
        .collection('settlementCycles').doc(String(INITIAL_SETTLEMENT_CYCLE))
        .collection('adjustments').doc(r1.adjustmentId).get();
      expect(adj1Doc.data()).toMatchObject({
        adjustmentState: 'completed_by_offset',
        requiredActionRemainingIncl: 0,
      });
    });

    it('refund pending 1000 → collection pending 1000 で完全相殺、parent.status=settled', async () => {
      const billId = 'bill-off2';
      const adminId = 'admin-off2';
      await createAdminDevice(adminId);
      await createSettledBill(billId);

      const r1: any = await (createPostSettlementAdjustment as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'off2-key-a',
          adjustmentType: 'decrease_refund_pending',
          adjustmentAmountIncl: 1000,
          lines: [
            {
              targetCategory: 'item',
              targetName: 'apple',
              operationType: 'sale',
              qtyDelta: -1,
              amountInclDelta: -1000,
            },
          ],
        })
      );

      const r2: any = await (createPostSettlementAdjustment as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'off2-key-b',
          adjustmentType: 'increase_collection_pending',
          adjustmentAmountIncl: 1000,
          lines: [
            {
              targetCategory: 'extra',
              targetName: 'late-fee',
              operationType: 'extra',
              qtyDelta: 1,
              amountInclDelta: 1000,
            },
          ],
        })
      );

      expect(r2.adjustment.requiredActionRemainingIncl).toBe(0);
      expect(r2.adjustment.adjustmentState).toBe('completed_by_offset');
      expect(r2.parent.status).toBe('settled');
      expect(r2.parent.requiredActionType).toBe('none');

      const adj1Doc = await db
        .collection('bills').doc(billId)
        .collection('settlementCycles').doc(String(INITIAL_SETTLEMENT_CYCLE))
        .collection('adjustments').doc(r1.adjustmentId).get();
      expect(adj1Doc.data()?.adjustmentState).toBe('completed_by_offset');
    });
  });

  describe('validation 失敗', () => {
    it('lines 合計が adjustmentAmountIncl と一致しないと弾かれる', async () => {
      const billId = 'bill-inv1';
      const adminId = 'admin-inv1';
      await createAdminDevice(adminId);
      await createSettledBill(billId);

      await expect(
        (createPostSettlementAdjustment as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'inv1-key',
            adjustmentType: 'decrease_refund_pending',
            adjustmentAmountIncl: 1000,
            lines: [
              {
                targetCategory: 'item',
                targetName: 'apple',
                operationType: 'sale',
                qtyDelta: -1,
                amountInclDelta: -800,
              },
            ],
          })
        )
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });

    it('tournament line で targetId 不足だと弾かれる', async () => {
      const billId = 'bill-inv2';
      const adminId = 'admin-inv2';
      await createAdminDevice(adminId);
      await createSettledBill(billId);

      await expect(
        (createPostSettlementAdjustment as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'inv2-key',
            adjustmentType: 'increase_collection_pending',
            adjustmentAmountIncl: 1000,
            lines: [
              {
                targetCategory: 'tournament',
                targetName: 'tour-A',
                operationType: 'entry',
                qtyDelta: 1,
                amountInclDelta: 1000,
              },
            ],
          })
        )
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });

    it('lines が空だと callable 段階で弾かれる', async () => {
      const billId = 'bill-inv3';
      const adminId = 'admin-inv3';
      await createAdminDevice(adminId);
      await createSettledBill(billId);

      await expect(
        (createPostSettlementAdjustment as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'inv3-key',
            adjustmentType: 'decrease_refund_pending',
            adjustmentAmountIncl: 1000,
            lines: [],
          })
        )
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    });
  });

  describe('status precondition', () => {
    it('status=open の bill では failed-precondition', async () => {
      const billId = 'bill-pre1';
      const adminId = 'admin-pre1';
      await createAdminDevice(adminId);
      await db.collection('bills').doc(billId).set({
        businessDate: '2026-05-09',
        status: 'open',
        amounts: { grandTotalRounded: 0 },
        currentSummary: buildInitialCurrentSummary(),
        postSettlementState: buildInitialPostSettlementState(),
        reopenSummary: buildInitialReopenSummary(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await expect(
        (createPostSettlementAdjustment as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'pre1-key',
            adjustmentType: 'decrease_refund_pending',
            adjustmentAmountIncl: 100,
            lines: [
              {
                targetCategory: 'item',
                targetName: 'apple',
                operationType: 'sale',
                qtyDelta: -1,
                amountInclDelta: -100,
              },
            ],
          })
        )
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });
  });

  describe('idempotent replay', () => {
    it('同 idempotencyKey で再実行すると同じ結果を返し、cycle.nextSequenceNo が再進行しない', async () => {
      const billId = 'bill-idem1';
      const adminId = 'admin-idem1';
      await createAdminDevice(adminId);
      await createSettledBill(billId);

      const payload = {
        billId,
        idempotencyKey: 'idem1-key',
        adjustmentType: 'decrease_refund_pending',
        adjustmentAmountIncl: 1000,
        lines: [
          {
            targetCategory: 'item',
            targetName: 'apple',
            operationType: 'sale',
            qtyDelta: -1,
            amountInclDelta: -1000,
          },
        ],
      };

      const r1: any = await (createPostSettlementAdjustment as any).run(
        callableRequest(adminId, payload)
      );
      const r2: any = await (createPostSettlementAdjustment as any).run(
        callableRequest(adminId, payload)
      );

      expect(r1.adjustmentId).toBe(r2.adjustmentId);
      expect(r2.diagnostics?.reused).toBe(true);

      const cycleDoc = await db
        .collection('bills').doc(billId)
        .collection('settlementCycles').doc(String(INITIAL_SETTLEMENT_CYCLE)).get();
      expect(cycleDoc.data()?.nextSequenceNo).toBe(2); // 1 回しか進まない

      const adjustments = await db
        .collection('bills').doc(billId)
        .collection('settlementCycles').doc(String(INITIAL_SETTLEMENT_CYCLE))
        .collection('adjustments').get();
      expect(adjustments.size).toBe(1);
    });
  });

  describe('permission denied', () => {
    it('device が active でないと permission-denied', async () => {
      const billId = 'bill-perm1';
      const adminId = 'admin-perm1';
      await db.collection('devices').add({
        uid: adminId,
        role: 'admin',
        status: 'inactive',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await createSettledBill(billId);

      await expect(
        (createPostSettlementAdjustment as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'perm1-key',
            adjustmentType: 'decrease_refund_pending',
            adjustmentAmountIncl: 100,
            lines: [
              {
                targetCategory: 'item',
                targetName: 'apple',
                operationType: 'sale',
                qtyDelta: -1,
                amountInclDelta: -100,
              },
            ],
          })
        )
      ).rejects.toMatchObject({ code: 'permission-denied' });
    });

    it('terminal で options.accounting なしだと permission-denied', async () => {
      const billId = 'bill-perm2';
      const adminId = 'admin-perm2';
      await db.collection('devices').add({
        uid: adminId,
        role: 'terminal',
        status: 'active',
        options: {},
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await createSettledBill(billId);

      await expect(
        (createPostSettlementAdjustment as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'perm2-key',
            adjustmentType: 'decrease_refund_pending',
            adjustmentAmountIncl: 100,
            lines: [
              {
                targetCategory: 'item',
                targetName: 'apple',
                operationType: 'sale',
                qtyDelta: -1,
                amountInclDelta: -100,
              },
            ],
          })
        )
      ).rejects.toMatchObject({ code: 'permission-denied' });
    });
  });
});
