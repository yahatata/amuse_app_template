/**
 * C-2.5 / B-3: recordPostSettlementCashAction - ポイント/チップ対応 テスト
 *
 * 確認観点:
 * 1. [collection] sideGameChip: happy path → users.sideGameChip が chipDelta 分減算される
 * 2. [collection] sideGameChip: 残高不足 → ACCOUNTING_CASH_ACTION_INVALID で拒否
 * 3. [collection] pointA: happy path → users.pointA が yen 分減算される
 * 4. [collection] special method + userId なし → ACCOUNTING_CASH_ACTION_INVALID で拒否
 * 5. [refund] sideGameChip: happy path → users.sideGameChip が chipDelta 分加算される
 * 6. [refund] pointA: happy path → users.pointA が yen 分加算される
 * 7. [refund] cash: paymentTotals.cash を超える返金 → ACCOUNTING_CASH_ACTION_INVALID で拒否
 * 8. [refund] sideGameChip: paymentTotals.sideGameChip を超える返金 → 拒否
 * 9. [refund] 2回目返金が残額を超える → 拒否（累積チェック）
 * 10. [refund] cash: paymentTotals.cash 以内なら通る（non-special バリデーション正常系）
 * 11. [refund] cash: 追加徴収後は（original + collected）まで返金可能
 * 12. [refund] cash: 追加徴収後でも（original + collected）を超えたら拒否
 * 13. [refund] sideGameChip: 追加徴収後は（original + collected）まで返金可能
 * 14. [refund] pointA: 追加徴収後は（original + collected）まで返金可能
 * 15. [refund] pointB: 追加徴収後は（original + collected）まで返金可能
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

describe('recordPostSettlementCashAction: special methods (C-2.5)', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  // admin SDK の projectId に合わせることで clearFirestore が正しく機能する
  const projectId = 'test-default';

  // A-7 a7StoreConfig: sideGameChip 100円 = 1枚
  const CHIP_REF_PER_BALANCE = 100;

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

  // ─── helpers ──────────────────────────────────────────────────────────────

  async function createAdminDevice(uid: string) {
    await db.collection('devices').add({
      uid,
      role: 'admin',
      status: 'active',
      name: 'Test Device',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  /**
   * 会計済み bill を作成する。
   * @param userId null を渡すとユーザー未紐付け bill になる
   * @param paymentTotals 支払い手段別合計（円）
   */
  async function createSettledBill(
    billId: string,
    opts: {
      userId?: string | null;
      paymentTotals?: Record<string, number>;
      paymentMethodDetails?: Record<string, unknown>;
    } = {}
  ) {
    const userId = opts.userId !== undefined ? opts.userId : 'user-special-1';
    const paymentTotals = opts.paymentTotals ?? { cash: 5000 };
    const paymentMethodDetails =
      opts.paymentMethodDetails ??
      Object.fromEntries(
        Object.entries(paymentTotals)
          .filter(([m]) => ['pointA', 'pointB', 'sideGameChip'].includes(m))
          .map(([method, referenceAmount]) => {
            if (method === 'sideGameChip') {
              return [
                method,
                {
                  referenceAmount,
                  balanceAmount: Math.floor(referenceAmount / CHIP_REF_PER_BALANCE),
                  conversion: { referenceUnits: CHIP_REF_PER_BALANCE, balanceUnits: 1 },
                  usageUnit: CHIP_REF_PER_BALANCE,
                  refundedBalanceAmount: 0,
                },
              ];
            }
            return [
              method,
              {
                referenceAmount,
                balanceAmount: referenceAmount,
                conversion: { referenceUnits: 1, balanceUnits: 1 },
                usageUnit: 1,
                refundedBalanceAmount: 0,
              },
            ];
          }),
      );

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

    const party = userId ? { userId, pokerName: 'taro' } : { pokerName: 'taro' };

    await db.collection('bills').doc(billId).set({
      businessDate: '2026-05-29',
      status: 'settled',
      party,
      amounts: { grandTotalRounded: 5000 },
      paymentTotals,
      currentSummary: initialCurrentSummary,
      postSettlementState: buildInitialPostSettlementState(),
      reopenSummary: initialReopenSummary,
      meta: {
        schemaVersion: '1.3',
        ...(Object.keys(paymentMethodDetails).length > 0
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

  async function createUser(
    userId: string,
    balances: { sideGameChip?: number; pointA?: number; pointB?: number }
  ) {
    await db.collection('users').doc(userId).set({
      sideGameChip: balances.sideGameChip ?? 0,
      pointA: balances.pointA ?? 0,
      pointB: balances.pointB ?? 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  function callableRequest(adminId: string, data: any) {
    return { auth: { uid: adminId }, data };
  }

  async function createCollectionAdjustment(
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

  async function createRefundAdjustment(
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

  // ─── テストケース ──────────────────────────────────────────────────────────

  describe('[collection] sideGameChip 追加徴収', () => {
    it('happy path: 3,000円 → 30枚分 users.sideGameChip が減算される', async () => {
      const billId = 'bill-col-chip-1';
      const adminId = 'admin-col-chip-1';
      const userId = 'user-col-chip-1';

      await createAdminDevice(adminId);
      await createSettledBill(billId, { userId });
      await createUser(userId, { sideGameChip: 500 });
      const adjustmentId = await createCollectionAdjustment(billId, adminId, 3000, 'col-chip-1');

      const result: any = await (recordPostSettlementCollection as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'col-chip-1-key',
          amountIncl: 3000,
          methodBreakdown: [{ method: 'sideGameChip', amountIncl: 3000 }],
          allocations: [{ adjustmentId, amountIncl: 3000 }],
          cashflowBusinessDate: '2026-05-29',
        })
      );

      expect(result.success).toBe(true);

      // users.sideGameChip が 500 - 30 = 470
      const userDoc = await db.collection('users').doc(userId).get();
      expect(userDoc.data()?.sideGameChip).toBe(500 - 3000 / CHIP_REF_PER_BALANCE);
    });

    it('残高不足: users.sideGameChip が 10枚 しかない場合 30枚要求を拒否', async () => {
      const billId = 'bill-col-chip-insuf';
      const adminId = 'admin-col-chip-insuf';
      const userId = 'user-col-chip-insuf';

      await createAdminDevice(adminId);
      await createSettledBill(billId, { userId });
      await createUser(userId, { sideGameChip: 10 });
      const adjustmentId = await createCollectionAdjustment(billId, adminId, 3000, 'col-chip-insuf');

      await expect(
        (recordPostSettlementCollection as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'col-chip-insuf-key',
            amountIncl: 3000,
            methodBreakdown: [{ method: 'sideGameChip', amountIncl: 3000 }],
            allocations: [{ adjustmentId, amountIncl: 3000 }],
            cashflowBusinessDate: '2026-05-29',
          })
        )
      ).rejects.toMatchObject({ code: 'failed-precondition' });

      const userDoc = await db.collection('users').doc(userId).get();
      expect(userDoc.data()?.sideGameChip).toBe(10);
    });

    it('pointA: 1,000円 → users.pointA が 1,000 減算される', async () => {
      const billId = 'bill-col-pa-1';
      const adminId = 'admin-col-pa-1';
      const userId = 'user-col-pa-1';

      await createAdminDevice(adminId);
      await createSettledBill(billId, { userId });
      await createUser(userId, { pointA: 5000 });
      const adjustmentId = await createCollectionAdjustment(billId, adminId, 1000, 'col-pa-1');

      const result: any = await (recordPostSettlementCollection as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'col-pa-1-key',
          amountIncl: 1000,
          methodBreakdown: [{ method: 'pointA', amountIncl: 1000 }],
          allocations: [{ adjustmentId, amountIncl: 1000 }],
          cashflowBusinessDate: '2026-05-29',
        })
      );

      expect(result.success).toBe(true);

      const userDoc = await db.collection('users').doc(userId).get();
      expect(userDoc.data()?.pointA).toBe(4000); // 5000 - 1000
    });

    it('userId なし bill に special method → 拒否', async () => {
      const billId = 'bill-col-nouse';
      const adminId = 'admin-col-nouse';

      await createAdminDevice(adminId);
      await createSettledBill(billId, { userId: null }); // userId なし
      const adjustmentId = await createCollectionAdjustment(billId, adminId, 1000, 'col-nouse');

      await expect(
        (recordPostSettlementCollection as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'col-nouse-key',
            amountIncl: 1000,
            methodBreakdown: [{ method: 'sideGameChip', amountIncl: 1000 }],
            allocations: [{ adjustmentId, amountIncl: 1000 }],
            cashflowBusinessDate: '2026-05-29',
          })
        )
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });
  });

  describe('[refund] sideGameChip / pointA 返金', () => {
    it('sideGameChip 返金: 3,000円 → 30枚分 users.sideGameChip が加算される', async () => {
      const billId = 'bill-ref-chip-1';
      const adminId = 'admin-ref-chip-1';
      const userId = 'user-ref-chip-1';

      await createAdminDevice(adminId);
      await createSettledBill(billId, {
        userId,
        paymentTotals: { sideGameChip: 3000 },
      });
      await createUser(userId, { sideGameChip: 100 }); // 返金後に増える
      const adjustmentId = await createRefundAdjustment(billId, adminId, 3000, 'ref-chip-1');

      const result: any = await (recordPostSettlementRefund as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'ref-chip-1-key',
          amountIncl: 3000,
          methodBreakdown: [{ method: 'sideGameChip', amountIncl: 3000 }],
          allocations: [{ adjustmentId, amountIncl: 3000 }],
          cashflowBusinessDate: '2026-05-29',
        })
      );

      expect(result.success).toBe(true);

      // users.sideGameChip が 100 + 300 = 400 になっていること
      const userDoc = await db.collection('users').doc(userId).get();
      expect(userDoc.data()?.sideGameChip).toBe(100 + 3000 / CHIP_REF_PER_BALANCE);
    });

    it('pointA 返金: 2,000円 → users.pointA が 2,000 加算される', async () => {
      const billId = 'bill-ref-pa-1';
      const adminId = 'admin-ref-pa-1';
      const userId = 'user-ref-pa-1';

      await createAdminDevice(adminId);
      await createSettledBill(billId, {
        userId,
        paymentTotals: { pointA: 2000 },
      });
      await createUser(userId, { pointA: 500 });
      const adjustmentId = await createRefundAdjustment(billId, adminId, 2000, 'ref-pa-1');

      const result: any = await (recordPostSettlementRefund as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'ref-pa-1-key',
          amountIncl: 2000,
          methodBreakdown: [{ method: 'pointA', amountIncl: 2000 }],
          allocations: [{ adjustmentId, amountIncl: 2000 }],
          cashflowBusinessDate: '2026-05-29',
        })
      );

      expect(result.success).toBe(true);

      const userDoc = await db.collection('users').doc(userId).get();
      expect(userDoc.data()?.pointA).toBe(2500); // 500 + 2000
    });
  });

  describe('[refund] 返金バリデーション', () => {
    it('cash 返金: paymentTotals.cash (4,000円) 以内なら通る', async () => {
      const billId = 'bill-val-ok-1';
      const adminId = 'admin-val-ok-1';

      await createAdminDevice(adminId);
      await createSettledBill(billId, {
        paymentTotals: { cash: 4000, sideGameChip: 3000 },
      });
      const adjustmentId = await createRefundAdjustment(billId, adminId, 3000, 'val-ok-1');

      const result: any = await (recordPostSettlementRefund as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'val-ok-1-key',
          amountIncl: 3000,
          methodBreakdown: [{ method: 'cash', amountIncl: 3000 }],
          allocations: [{ adjustmentId, amountIncl: 3000 }],
          cashflowBusinessDate: '2026-05-29',
        })
      );

      expect(result.success).toBe(true);
    });

    it('cash 返金: paymentTotals.cash (4,000円) を超える 5,000円 返金 → 拒否', async () => {
      const billId = 'bill-val-over-1';
      const adminId = 'admin-val-over-1';

      await createAdminDevice(adminId);
      await createSettledBill(billId, {
        paymentTotals: { cash: 4000, sideGameChip: 3000 },
      });
      const adjustmentId = await createRefundAdjustment(billId, adminId, 5000, 'val-over-1');

      await expect(
        (recordPostSettlementRefund as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'val-over-1-key',
            amountIncl: 5000,
            methodBreakdown: [{ method: 'cash', amountIncl: 5000 }],
            allocations: [{ adjustmentId, amountIncl: 5000 }],
            cashflowBusinessDate: '2026-05-29',
          })
        )
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });

    it('sideGameChip 返金: paymentTotals.sideGameChip (3,000円) を超える返金 → 拒否', async () => {
      const billId = 'bill-val-chip-over';
      const adminId = 'admin-val-chip-over';
      const userId = 'user-val-chip-over';

      await createAdminDevice(adminId);
      await createSettledBill(billId, {
        userId,
        paymentTotals: { sideGameChip: 3000 },
      });
      await createUser(userId, { sideGameChip: 1000 });
      const adjustmentId = await createRefundAdjustment(billId, adminId, 4000, 'val-chip-over');

      await expect(
        (recordPostSettlementRefund as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'val-chip-over-key',
            amountIncl: 4000,
            methodBreakdown: [{ method: 'sideGameChip', amountIncl: 4000 }],
            allocations: [{ adjustmentId, amountIncl: 4000 }],
            cashflowBusinessDate: '2026-05-29',
          })
        )
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });

    it('2回目の返金が累積上限を超える → 拒否', async () => {
      const billId = 'bill-val-2nd-over';
      const adminId = 'admin-val-2nd-over';

      await createAdminDevice(adminId);
      await createSettledBill(billId, {
        paymentTotals: { cash: 4000 },
      });

      // 1回目: 3,000円返金（上限4,000円内）
      const adj1 = await createRefundAdjustment(billId, adminId, 3000, 'val-2nd-1');
      await (recordPostSettlementRefund as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'val-2nd-1-key',
          amountIncl: 3000,
          methodBreakdown: [{ method: 'cash', amountIncl: 3000 }],
          allocations: [{ adjustmentId: adj1, amountIncl: 3000 }],
          cashflowBusinessDate: '2026-05-29',
        })
      );

      // 2回目: 2,000円返金を試みる → 残額 1,000円なので拒否
      const adj2 = await createRefundAdjustment(billId, adminId, 2000, 'val-2nd-2');
      await expect(
        (recordPostSettlementRefund as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'val-2nd-2-key',
            amountIncl: 2000,
            methodBreakdown: [{ method: 'cash', amountIncl: 2000 }],
            allocations: [{ adjustmentId: adj2, amountIncl: 2000 }],
            cashflowBusinessDate: '2026-05-29',
          })
        )
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });

    it('2回目の返金が残額以内なら通る', async () => {
      const billId = 'bill-val-2nd-ok';
      const adminId = 'admin-val-2nd-ok';

      await createAdminDevice(adminId);
      await createSettledBill(billId, {
        paymentTotals: { cash: 4000 },
      });

      // 1回目: 2,000円返金
      const adj1 = await createRefundAdjustment(billId, adminId, 2000, 'val-2nd-ok-1');
      await (recordPostSettlementRefund as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'val-2nd-ok-1-key',
          amountIncl: 2000,
          methodBreakdown: [{ method: 'cash', amountIncl: 2000 }],
          allocations: [{ adjustmentId: adj1, amountIncl: 2000 }],
          cashflowBusinessDate: '2026-05-29',
        })
      );

      // 2回目: 残額 2,000円以内の 1,500円 → 通る
      const adj2 = await createRefundAdjustment(billId, adminId, 1500, 'val-2nd-ok-2');
      const result: any = await (recordPostSettlementRefund as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'val-2nd-ok-2-key',
          amountIncl: 1500,
          methodBreakdown: [{ method: 'cash', amountIncl: 1500 }],
          allocations: [{ adjustmentId: adj2, amountIncl: 1500 }],
          cashflowBusinessDate: '2026-05-29',
        })
      );

      expect(result.success).toBe(true);
    });
  });

  // ─── 追加徴収後の返金上限拡張テスト ──────────────────────────────────────────

  describe('[refund] 追加徴収後の返金可能額拡張', () => {
    /**
     * cash: paymentTotals.cash=4,000 + collection 1,000 = 5,000 まで返金可能
     * 4,500 円の返金 → 通る
     */
    it('cash: 追加徴収 1,000円後は合計 5,000円まで返金可能（4,500円返金が通る）', async () => {
      const billId = 'bill-col-then-ref-cash';
      const adminId = 'admin-col-then-ref-cash';

      await createAdminDevice(adminId);
      await createSettledBill(billId, { paymentTotals: { cash: 4000 } });

      // 追加徴収 1,000円（cash）
      const colAdj = await createCollectionAdjustment(billId, adminId, 1000, 'ctr-col-1');
      await (recordPostSettlementCollection as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'ctr-col-1-key',
          amountIncl: 1000,
          methodBreakdown: [{ method: 'cash', amountIncl: 1000 }],
          allocations: [{ adjustmentId: colAdj, amountIncl: 1000 }],
          cashflowBusinessDate: '2026-05-29',
        })
      );

      // 4,500円返金（original 4,000 + collected 1,000 = 5,000 以内）→ 通る
      const refAdj = await createRefundAdjustment(billId, adminId, 4500, 'ctr-ref-1');
      const result: any = await (recordPostSettlementRefund as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'ctr-ref-1-key',
          amountIncl: 4500,
          methodBreakdown: [{ method: 'cash', amountIncl: 4500 }],
          allocations: [{ adjustmentId: refAdj, amountIncl: 4500 }],
          cashflowBusinessDate: '2026-05-29',
        })
      );

      expect(result.success).toBe(true);
    });

    /**
     * cash: paymentTotals.cash=4,000 + collection 1,000 = 5,000 が上限
     * 5,001 円の返金 → 拒否
     */
    it('cash: 追加徴収後でも合計 5,000円を超える 5,001円返金は拒否', async () => {
      const billId = 'bill-col-then-ref-cash-over';
      const adminId = 'admin-col-then-ref-cash-over';

      await createAdminDevice(adminId);
      await createSettledBill(billId, { paymentTotals: { cash: 4000 } });

      // 追加徴収 1,000円
      const colAdj = await createCollectionAdjustment(billId, adminId, 1000, 'ctr-col-over');
      await (recordPostSettlementCollection as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'ctr-col-over-key',
          amountIncl: 1000,
          methodBreakdown: [{ method: 'cash', amountIncl: 1000 }],
          allocations: [{ adjustmentId: colAdj, amountIncl: 1000 }],
          cashflowBusinessDate: '2026-05-29',
        })
      );

      // 5,001円返金 → 上限 5,000 を超えるので拒否
      const refAdj = await createRefundAdjustment(billId, adminId, 5001, 'ctr-ref-over');
      await expect(
        (recordPostSettlementRefund as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: 'ctr-ref-over-key',
            amountIncl: 5001,
            methodBreakdown: [{ method: 'cash', amountIncl: 5001 }],
            allocations: [{ adjustmentId: refAdj, amountIncl: 5001 }],
            cashflowBusinessDate: '2026-05-29',
          })
        )
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });

    /**
     * sideGameChip: paymentTotals.sideGameChip=600円 + collection 300円 = 900円 まで返金可能
     * 800 円返金 → 通る
     */
    it('sideGameChip: 追加徴収 300円後は合計 900円まで返金可能（800円返金が通る）', async () => {
      const billId = 'bill-col-then-ref-chip';
      const adminId = 'admin-col-then-ref-chip';
      const userId = 'user-col-then-ref-chip';

      await createAdminDevice(adminId);
      await createSettledBill(billId, { userId, paymentTotals: { sideGameChip: 600 } });
      await createUser(userId, { sideGameChip: 500 }); // 追加徴収 + 残高確認用

      // 追加徴収 300円 sideGameChip（30枚）
      const colAdj = await createCollectionAdjustment(billId, adminId, 300, 'ctr-chip-col');
      await (recordPostSettlementCollection as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'ctr-chip-col-key',
          amountIncl: 300,
          methodBreakdown: [{ method: 'sideGameChip', amountIncl: 300 }],
          allocations: [{ adjustmentId: colAdj, amountIncl: 300 }],
          cashflowBusinessDate: '2026-05-29',
        })
      );

      // 800円返金（600 + 300 = 900 以内）→ 通る
      const refAdj = await createRefundAdjustment(billId, adminId, 800, 'ctr-chip-ref');
      const result: any = await (recordPostSettlementRefund as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'ctr-chip-ref-key',
          amountIncl: 800,
          methodBreakdown: [{ method: 'sideGameChip', amountIncl: 800 }],
          allocations: [{ adjustmentId: refAdj, amountIncl: 800 }],
          cashflowBusinessDate: '2026-05-29',
        })
      );

      expect(result.success).toBe(true);

      // users.sideGameChip: 500 - 30(col) + 80(ref) = 550
      const userDoc = await db.collection('users').doc(userId).get();
      expect(userDoc.data()?.sideGameChip).toBe(500 - 300 / CHIP_REF_PER_BALANCE + 800 / CHIP_REF_PER_BALANCE);
    });

    /**
     * pointA: paymentTotals.pointA=2,000 + collection 500 = 2,500 まで返金可能
     * 2,300 円返金 → 通る
     */
    it('pointA: 追加徴収 500円後は合計 2,500円まで返金可能（2,300円返金が通る）', async () => {
      const billId = 'bill-col-then-ref-pa';
      const adminId = 'admin-col-then-ref-pa';
      const userId = 'user-col-then-ref-pa';

      await createAdminDevice(adminId);
      await createSettledBill(billId, { userId, paymentTotals: { pointA: 2000 } });
      await createUser(userId, { pointA: 3000 });

      // 追加徴収 500円 pointA
      const colAdj = await createCollectionAdjustment(billId, adminId, 500, 'ctr-pa-col');
      await (recordPostSettlementCollection as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'ctr-pa-col-key',
          amountIncl: 500,
          methodBreakdown: [{ method: 'pointA', amountIncl: 500 }],
          allocations: [{ adjustmentId: colAdj, amountIncl: 500 }],
          cashflowBusinessDate: '2026-05-29',
        })
      );

      // 2,300円返金（2,000 + 500 = 2,500 以内）→ 通る
      const refAdj = await createRefundAdjustment(billId, adminId, 2300, 'ctr-pa-ref');
      const result: any = await (recordPostSettlementRefund as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'ctr-pa-ref-key',
          amountIncl: 2300,
          methodBreakdown: [{ method: 'pointA', amountIncl: 2300 }],
          allocations: [{ adjustmentId: refAdj, amountIncl: 2300 }],
          cashflowBusinessDate: '2026-05-29',
        })
      );

      expect(result.success).toBe(true);

      // users.pointA: 3000 - 500(col) + 2300(ref) = 4800
      const userDoc = await db.collection('users').doc(userId).get();
      expect(userDoc.data()?.pointA).toBe(3000 - 500 + 2300);
    });

    /**
     * pointB: paymentTotals.pointB=1,000 + collection 200 = 1,200 まで返金可能
     * 1,100 円返金 → 通る
     */
    it('pointB: 追加徴収 200円後は合計 1,200円まで返金可能（1,100円返金が通る）', async () => {
      const billId = 'bill-col-then-ref-pb';
      const adminId = 'admin-col-then-ref-pb';
      const userId = 'user-col-then-ref-pb';

      await createAdminDevice(adminId);
      await createSettledBill(billId, { userId, paymentTotals: { pointB: 1000 } });
      await createUser(userId, { pointB: 2000 });

      // 追加徴収 200円 pointB
      const colAdj = await createCollectionAdjustment(billId, adminId, 200, 'ctr-pb-col');
      await (recordPostSettlementCollection as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'ctr-pb-col-key',
          amountIncl: 200,
          methodBreakdown: [{ method: 'pointB', amountIncl: 200 }],
          allocations: [{ adjustmentId: colAdj, amountIncl: 200 }],
          cashflowBusinessDate: '2026-05-29',
        })
      );

      // 1,100円返金（1,000 + 200 = 1,200 以内）→ 通る
      const refAdj = await createRefundAdjustment(billId, adminId, 1100, 'ctr-pb-ref');
      const result: any = await (recordPostSettlementRefund as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: 'ctr-pb-ref-key',
          amountIncl: 1100,
          methodBreakdown: [{ method: 'pointB', amountIncl: 1100 }],
          allocations: [{ adjustmentId: refAdj, amountIncl: 1100 }],
          cashflowBusinessDate: '2026-05-29',
        })
      );

      expect(result.success).toBe(true);

      // users.pointB: 2000 - 200(col) + 1100(ref) = 2900
      const userDoc = await db.collection('users').doc(userId).get();
      expect(userDoc.data()?.pointB).toBe(2000 - 200 + 1100);
    });
  });
});
