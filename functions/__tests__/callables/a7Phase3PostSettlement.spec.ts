/**
 * A-7 Phase 3: 返金・追加徴収 Emulator 統合テスト
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import { createPostSettlementAdjustment } from '../../src/domains/bills/callables/createPostSettlementAdjustment';
import { recordPostSettlementCollection } from '../../src/domains/bills/callables/recordPostSettlementCollection';
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
import { seedA7StoreConfig, a7StoreConfigDocument } from '../helpers/a7StoreConfig';
import { __setMockConfig, __resetMockConfig } from '../helpers/mockStoreConfig';

describe('A-7 Phase3 post-settlement refund/collection', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-default';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    process.env.GCLOUD_PROJECT = projectId;
    testEnv = await initializeTestEnvironment({ projectId });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map((app) => app?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedA7StoreConfig(db);
    __setMockConfig(a7StoreConfigDocument());
  });

  afterEach(() => {
    __resetMockConfig();
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

  async function createUser(uid: string, balances: Record<string, number>) {
    await db.collection('users').doc(uid).set({
      pointA: 0,
      pointB: 0,
      pointC: 0,
      pointD: 0,
      pointE: 0,
      sideGameChip: 0,
      ...balances,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function createSettledBill(params: {
    billId: string;
    userId: string;
    paymentTotals: Record<string, number>;
    paymentMethodDetails?: Record<string, unknown>;
  }) {
    const { billId, userId, paymentTotals, paymentMethodDetails } = params;
    const claim = Object.values(paymentTotals).reduce((s, v) => s + v, 0);
    await db.collection('bills').doc(billId).set({
      businessDate: '2026-07-23',
      status: 'settled',
      party: { userId, pokerName: 'taro' },
      amounts: { grandTotalRounded: claim },
      paymentTotals,
      currentSummary: {
        ...buildInitialCurrentSummary(),
        claimTotalIncl: claim,
        receivedTotalIncl: claim,
        netSalesIncl: claim,
      },
      postSettlementState: buildInitialPostSettlementState(),
      reopenSummary: {
        ...buildInitialReopenSummary(),
        currentSettlementCycle: INITIAL_SETTLEMENT_CYCLE,
        latestSettledCycle: INITIAL_SETTLEMENT_CYCLE,
      },
      meta: {
        schemaVersion: '1.3',
        ...(paymentMethodDetails
          ? { paymentMethodDetails }
          : {}),
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db
      .collection('bills')
      .doc(billId)
      .collection('settlementCycles')
      .doc(String(INITIAL_SETTLEMENT_CYCLE))
      .set(buildInitialCycleDoc({ cycleNo: INITIAL_SETTLEMENT_CYCLE }));
  }

  async function createRefundPending(billId: string, amount: number, adminUid: string) {
    await (createPostSettlementAdjustment as any).run(
      {
        data: {
          billId,
          adjustmentType: 'decrease_refund_pending',
          adjustmentAmountIncl: amount,
          lines: [
            {
              targetCategory: 'item',
              targetName: '返金調整',
              operationType: 'sale',
              qtyDelta: -1,
              amountInclDelta: -amount,
            },
          ],
        },
        auth: { uid: adminUid },
      },
      {},
    );
  }

  async function createCollectionPending(
    billId: string,
    amount: number,
    adminUid: string,
  ) {
    await (createPostSettlementAdjustment as any).run(
      {
        data: {
          billId,
          adjustmentType: 'increase_collection_pending',
          adjustmentAmountIncl: amount,
          lines: [
            {
              targetCategory: 'extra',
              targetName: '追加徴収調整',
              operationType: 'extra',
              qtyDelta: 1,
              amountInclDelta: amount,
            },
          ],
        },
        auth: { uid: adminUid },
      },
      {},
    );
  }

  async function firstEffectiveAdjustmentId(billId: string): Promise<string> {
    const snap = await db
      .collection('bills')
      .doc(billId)
      .collection('settlementCycles')
      .doc('1')
      .collection('adjustments')
      .where('adjustmentState', '==', 'effective')
      .get();
    expect(snap.size).toBeGreaterThan(0);
    return snap.docs[0].id;
  }

  it('pointA full refund restores balance and updates refundedBalanceAmount', async () => {
    const adminUid = 'admin-p3-1';
    const userId = 'user-p3-1';
    const billId = 'bill-p3-full-refund';
    await createAdminDevice(adminUid);
    await createUser(userId, { pointA: 0 });
    await createSettledBill({
      billId,
      userId,
      paymentTotals: { pointA: 1000 },
      paymentMethodDetails: {
        pointA: {
          referenceAmount: 1000,
          balanceAmount: 1000,
          conversion: { referenceUnits: 1, balanceUnits: 1 },
          usageUnit: 1,
          refundedBalanceAmount: 0,
        },
      },
    });
    await createRefundPending(billId, 1000, adminUid);
    const adjId = await firstEffectiveAdjustmentId(billId);

    const result: any = await (recordPostSettlementRefund as any).run(
      {
        data: {
          billId,
          amountIncl: 1000,
          methodBreakdown: [{ method: 'pointA', amountIncl: 1000 }],
          allocations: [{ adjustmentId: adjId, amountIncl: 1000 }],
        },
        auth: { uid: adminUid },
      },
      {},
    );
    expect(result.success).toBe(true);

    const user = (await db.collection('users').doc(userId).get()).data()!;
    expect(user.pointA).toBe(1000);

    const bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(bill.meta.paymentMethodDetails.pointA.refundedBalanceAmount).toBe(1000);

    const logs = await db
      .collection('users')
      .doc(userId)
      .collection('pointLogs')
      .get();
    expect(logs.size).toBe(1);
    expect(logs.docs[0].data().reasonType).toBe('post_settlement_refund');
    expect(logs.docs[0].data().changeAmount).toBe(1000);
  });

  it('pointA partial refund then remaining refund', async () => {
    const adminUid = 'admin-p3-2';
    const userId = 'user-p3-2';
    const billId = 'bill-p3-partial';
    await createAdminDevice(adminUid);
    await createUser(userId, { pointA: 100 });
    await createSettledBill({
      billId,
      userId,
      paymentTotals: { pointA: 1000 },
      paymentMethodDetails: {
        pointA: {
          referenceAmount: 1000,
          balanceAmount: 1000,
          conversion: { referenceUnits: 1, balanceUnits: 1 },
          usageUnit: 1,
          refundedBalanceAmount: 0,
        },
      },
    });
    await createRefundPending(billId, 1000, adminUid);
    let adjId = await firstEffectiveAdjustmentId(billId);

    await (recordPostSettlementRefund as any).run(
      {
        data: {
          billId,
          amountIncl: 400,
          methodBreakdown: [{ method: 'pointA', amountIncl: 400 }],
          allocations: [{ adjustmentId: adjId, amountIncl: 400 }],
        },
        auth: { uid: adminUid },
      },
      {},
    );

    let user = (await db.collection('users').doc(userId).get()).data()!;
    expect(user.pointA).toBe(500);
    let bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(bill.meta.paymentMethodDetails.pointA.refundedBalanceAmount).toBe(400);

    // remaining pending may still be on same or need new adj — reopen remaining
    const remaining = bill.postSettlementState.requiredActionIncl as number;
    if (remaining > 0) {
      adjId = await firstEffectiveAdjustmentId(billId);
      await (recordPostSettlementRefund as any).run(
        {
          data: {
            billId,
            amountIncl: remaining,
            methodBreakdown: [{ method: 'pointA', amountIncl: remaining }],
            allocations: [{ adjustmentId: adjId, amountIncl: remaining }],
          },
          auth: { uid: adminUid },
        },
        {},
      );
    }

    user = (await db.collection('users').doc(userId).get()).data()!;
    expect(user.pointA).toBe(1100);
    bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(bill.meta.paymentMethodDetails.pointA.refundedBalanceAmount).toBe(1000);
  });

  it('rejects non-integer refund against saved conversion', async () => {
    const adminUid = 'admin-p3-3';
    const userId = 'user-p3-3';
    const billId = 'bill-p3-nonint';
    await createAdminDevice(adminUid);
    await createUser(userId, { pointB: 0 });
    await createSettledBill({
      billId,
      userId,
      paymentTotals: { pointB: 100 },
      paymentMethodDetails: {
        pointB: {
          referenceAmount: 100,
          balanceAmount: 10,
          conversion: { referenceUnits: 10, balanceUnits: 1 },
          usageUnit: 10,
          refundedBalanceAmount: 0,
        },
      },
    });
    await createRefundPending(billId, 15, adminUid);
    const adjId = await firstEffectiveAdjustmentId(billId);

    await expect(
      (recordPostSettlementRefund as any).run(
        {
          data: {
            billId,
            amountIncl: 15,
            methodBreakdown: [{ method: 'pointB', amountIncl: 15 }],
            allocations: [{ adjustmentId: adjId, amountIncl: 15 }],
          },
          auth: { uid: adminUid },
        },
        {},
      ),
    ).rejects.toThrow();
  });

  it('refunds with saved conversion even if current config differs', async () => {
    const adminUid = 'admin-p3-4';
    const userId = 'user-p3-4';
    const billId = 'bill-p3-saved-conv';
    await createAdminDevice(adminUid);
    await createUser(userId, { pointA: 0 });
    // saved: 2 ref = 1 bal (different from current config 1:1)
    await createSettledBill({
      billId,
      userId,
      paymentTotals: { pointA: 200 },
      paymentMethodDetails: {
        pointA: {
          referenceAmount: 200,
          balanceAmount: 100,
          conversion: { referenceUnits: 2, balanceUnits: 1 },
          usageUnit: 2,
          refundedBalanceAmount: 0,
        },
      },
    });
    await createRefundPending(billId, 200, adminUid);
    const adjId = await firstEffectiveAdjustmentId(billId);

    await (recordPostSettlementRefund as any).run(
      {
        data: {
          billId,
          amountIncl: 200,
          methodBreakdown: [{ method: 'pointA', amountIncl: 200 }],
          allocations: [{ adjustmentId: adjId, amountIncl: 200 }],
        },
        auth: { uid: adminUid },
      },
      {},
    );

    const user = (await db.collection('users').doc(userId).get()).data()!;
    expect(user.pointA).toBe(100); // not 200
  });

  it('collection deducts with current config and writes snapshot + log', async () => {
    const adminUid = 'admin-p3-5';
    const userId = 'user-p3-5';
    const billId = 'bill-p3-collection';
    await createAdminDevice(adminUid);
    await createUser(userId, { pointA: 500 });
    await createSettledBill({
      billId,
      userId,
      paymentTotals: { cash: 1000 },
    });
    await createCollectionPending(billId, 200, adminUid);
    const adjId = await firstEffectiveAdjustmentId(billId);

    const result: any = await (recordPostSettlementCollection as any).run(
      {
        data: {
          billId,
          amountIncl: 200,
          methodBreakdown: [{ method: 'pointA', amountIncl: 200 }],
          allocations: [{ adjustmentId: adjId, amountIncl: 200 }],
        },
        auth: { uid: adminUid },
      },
      {},
    );
    expect(result.success).toBe(true);

    const user = (await db.collection('users').doc(userId).get()).data()!;
    expect(user.pointA).toBe(300);

    const ca = await db
      .collection('bills')
      .doc(billId)
      .collection('settlementCycles')
      .doc('1')
      .collection('cashActions')
      .doc(result.cashActionId)
      .get();
    expect(ca.data()?.balanceMethodDetails?.pointA?.balanceAmount).toBe(200);
    expect(ca.data()?.balanceMethodDetails?.pointA?.mergedIntoBillDetails).toBe(
      true,
    );

    const bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(bill.meta.paymentMethodDetails.pointA.referenceAmount).toBe(200);

    const logs = await db
      .collection('users')
      .doc(userId)
      .collection('pointLogs')
      .get();
    expect(logs.docs[0].data().reasonType).toBe('post_settlement_collection');
    expect(logs.docs[0].data().changeAmount).toBe(-200);
  });

  it('rejects double refund via remaining balance', async () => {
    const adminUid = 'admin-p3-6';
    const userId = 'user-p3-6';
    const billId = 'bill-p3-double';
    await createAdminDevice(adminUid);
    await createUser(userId, { pointA: 0 });
    await createSettledBill({
      billId,
      userId,
      paymentTotals: { pointA: 500 },
      paymentMethodDetails: {
        pointA: {
          referenceAmount: 500,
          balanceAmount: 500,
          conversion: { referenceUnits: 1, balanceUnits: 1 },
          usageUnit: 1,
          refundedBalanceAmount: 0,
        },
      },
    });
    await createRefundPending(billId, 500, adminUid);
    const adjId = await firstEffectiveAdjustmentId(billId);

    await (recordPostSettlementRefund as any).run(
      {
        data: {
          billId,
          amountIncl: 500,
          methodBreakdown: [{ method: 'pointA', amountIncl: 500 }],
          allocations: [{ adjustmentId: adjId, amountIncl: 500 }],
          idempotencyKey: 'once',
        },
        auth: { uid: adminUid },
      },
      {},
    );

    // same key succeeds idempotently
    const again: any = await (recordPostSettlementRefund as any).run(
      {
        data: {
          billId,
          amountIncl: 500,
          methodBreakdown: [{ method: 'pointA', amountIncl: 500 }],
          allocations: [{ adjustmentId: adjId, amountIncl: 500 }],
          idempotencyKey: 'once',
        },
        auth: { uid: adminUid },
      },
      {},
    );
    expect(again.diagnostics?.reused).toBe(true);

    const user = (await db.collection('users').doc(userId).get()).data()!;
    expect(user.pointA).toBe(500);
  });

  it('idempotency conflict on same key different payload', async () => {
    const adminUid = 'admin-p3-7';
    const userId = 'user-p3-7';
    const billId = 'bill-p3-conflict';
    await createAdminDevice(adminUid);
    await createUser(userId, { pointA: 0 });
    await createSettledBill({
      billId,
      userId,
      paymentTotals: { pointA: 500 },
      paymentMethodDetails: {
        pointA: {
          referenceAmount: 500,
          balanceAmount: 500,
          conversion: { referenceUnits: 1, balanceUnits: 1 },
          usageUnit: 1,
          refundedBalanceAmount: 0,
        },
      },
    });
    await createRefundPending(billId, 500, adminUid);
    const adjId = await firstEffectiveAdjustmentId(billId);

    await (recordPostSettlementRefund as any).run(
      {
        data: {
          billId,
          amountIncl: 200,
          methodBreakdown: [{ method: 'pointA', amountIncl: 200 }],
          allocations: [{ adjustmentId: adjId, amountIncl: 200 }],
          idempotencyKey: 'conflict-key',
        },
        auth: { uid: adminUid },
      },
      {},
    );

    await expect(
      (recordPostSettlementRefund as any).run(
        {
          data: {
            billId,
            amountIncl: 300,
            methodBreakdown: [{ method: 'pointA', amountIncl: 300 }],
            allocations: [{ adjustmentId: adjId, amountIncl: 300 }],
            idempotencyKey: 'conflict-key',
          },
          auth: { uid: adminUid },
        },
        {},
      ),
    ).rejects.toThrow();
  });

  it('point + sideGameChip combined refund', async () => {
    const adminUid = 'admin-p3-8';
    const userId = 'user-p3-8';
    const billId = 'bill-p3-combo';
    await createAdminDevice(adminUid);
    await createUser(userId, { pointA: 0, sideGameChip: 0 });
    await createSettledBill({
      billId,
      userId,
      paymentTotals: { pointA: 300, sideGameChip: 200 },
      paymentMethodDetails: {
        pointA: {
          referenceAmount: 300,
          balanceAmount: 300,
          conversion: { referenceUnits: 1, balanceUnits: 1 },
          usageUnit: 1,
          refundedBalanceAmount: 0,
        },
        sideGameChip: {
          referenceAmount: 200,
          balanceAmount: 2,
          conversion: { referenceUnits: 100, balanceUnits: 1 },
          usageUnit: 100,
          refundedBalanceAmount: 0,
        },
      },
    });
    await createRefundPending(billId, 500, adminUid);
    const adjId = await firstEffectiveAdjustmentId(billId);

    // two operations (UI contract: one method per call)
    await (recordPostSettlementRefund as any).run(
      {
        data: {
          billId,
          amountIncl: 300,
          methodBreakdown: [{ method: 'pointA', amountIncl: 300 }],
          allocations: [{ adjustmentId: adjId, amountIncl: 300 }],
        },
        auth: { uid: adminUid },
      },
      {},
    );
    const adjId2 = await firstEffectiveAdjustmentId(billId);
    await (recordPostSettlementRefund as any).run(
      {
        data: {
          billId,
          amountIncl: 200,
          methodBreakdown: [{ method: 'sideGameChip', amountIncl: 200 }],
          allocations: [{ adjustmentId: adjId2, amountIncl: 200 }],
        },
        auth: { uid: adminUid },
      },
      {},
    );

    const user = (await db.collection('users').doc(userId).get()).data()!;
    expect(user.pointA).toBe(300);
    expect(user.sideGameChip).toBe(2);

    const chipLogs = await db
      .collection('users')
      .doc(userId)
      .collection('sideGameChipLogs')
      .get();
    expect(chipLogs.size).toBe(1);
    expect(chipLogs.docs[0].data().reasonType).toBe('post_settlement_refund');
  });
});
