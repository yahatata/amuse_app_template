/**
 * A-7 Emulator 一連フロー統合テスト（Phase 1〜6 回帰）
 *
 * 前提: Firestore Emulator が localhost:8081 で起動していること
 *   firebase emulators:start --only firestore
 *
 * 個別 Phase テストの再実装ではなく、同一データを引き継ぐ業務連続性を検証する。
 */

jest.mock('../../src/domains/user/services/qrCodeUtils', () => ({
  generateQRData: jest.fn().mockResolvedValue({ timestamp: 1_700_000_000_000 }),
  generateQRImage: jest.fn().mockResolvedValue('qr-image-base64'),
  saveQRCodeToStorage: jest.fn().mockResolvedValue('https://example.com/qr.png'),
}));

jest.mock('../../src/domains/user/services/logUtils', () => ({
  initializeUserLogs: jest.fn().mockResolvedValue(undefined),
}));

import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import { startAccounting, completeAccountingV2 } from '../../src/domains/bills/callables/accounting';
import { createPostSettlementAdjustment } from '../../src/domains/bills/callables/createPostSettlementAdjustment';
import { recordPostSettlementCollection } from '../../src/domains/bills/callables/recordPostSettlementCollection';
import { recordPostSettlementRefund } from '../../src/domains/bills/callables/recordPostSettlementRefund';
import { appendItem } from '../../src/domains/bills/repos/appendItem';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';
import { calculateA7PaymentSplit } from '../../src/domains/bills/services/a7PaymentSplit';
import { billsOnSettle } from '../../src/domains/bills/triggers/billsOnSettle';
import { processBillAnalyticsAtomically } from '../../src/domains/analytics/services/updateAnalyticsForBill';
import { distributePaymentMethodsWithIssues } from '../../src/domains/analytics/services/helpers';
import { setRankingData } from '../../src/domains/tournament_activeTournament/callables/setRankingData';
import { undoSetRankingData } from '../../src/domains/logs/services/undoSetRankingData';
import { createTournamentTemplate } from '../../src/domains/tournament_createTournament/callables/createTournamentTemplate';
import { depositChip } from '../../src/domains/sideGame/callables/depositChip';
import { withdrawChip } from '../../src/domains/sideGame/callables/withdrawChip';
import { createUserAccount } from '../../src/domains/user/callables/createUserAccount';
import { setInitialUserBalances } from '../../src/domains/user/callables/setInitialUserBalances';
import { migrateStoreManagedUserToLine } from '../../src/domains/user/callables/migrateStoreManagedUserToLine';
import { enabledBalanceIds } from '../../src/domains/user/helpers/userBalances';
import {
  depositSideGameChipLogId,
  rewardPointLogId,
  rewardReversalPointLogId,
  withdrawSideGameChipLogId,
} from '../../src/domains/user/services/pointLog';
import { validatePointConfigFromStoreConfig } from '../../src/shared/config/validatePointConfig';
import {
  a7E2EFlowStoreConfigDocument,
  seedA7E2EFlowStoreConfig,
} from '../helpers/a7StoreConfig';
import { __setMockConfig, __resetMockConfig } from '../helpers/mockStoreConfig';

const PROJECT_ID = 'test-default';
const BUSINESS_DATE = '2026-07-25';

async function waitFor(
  predicate: () => Promise<boolean>,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 10000;
  const intervalMs = opts.intervalMs ?? 100;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor timeout: ${opts.label ?? 'condition'}`);
}

describe('A-7 Emulator E2E flows', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    process.env.GCLOUD_PROJECT = PROJECT_ID;
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    delete process.env.WRITE_TODAYS_BILLS_IN_PARALLEL;
    await seedA7E2EFlowStoreConfig(db);
    __setMockConfig(a7E2EFlowStoreConfigDocument());
  });

  afterEach(() => {
    __resetMockConfig();
  });

  async function createAdminDevice(uid: string) {
    await db.collection('devices').add({
      uid,
      role: 'admin',
      status: 'active',
      name: 'A7 E2E Admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function createMenuItem(menuItemId: string, price: number) {
    await db.collection('menuItems').doc(menuItemId).set({
      name: 'E2Eメニュー',
      category: 'Food',
      price,
      description: '',
      imageUrl: '',
      isArchive: false,
      isSoldOut: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  function flowConfig() {
    return validatePointConfigFromStoreConfig(a7E2EFlowStoreConfigDocument() as any);
  }

  async function settleBillViaV2AndTrigger(billId: string, adminId: string) {
    const billRef = db.collection('bills').doc(billId);
    const beforeSnap = await billRef.get();
    const beforeData = beforeSnap.data()!;
    expect(beforeData.status).toBe('settling');

    await (completeAccountingV2 as any).run({
      auth: { uid: adminId },
      data: { billId },
    });

    const afterSnap = await billRef.get();
    const afterData = afterSnap.data()!;
    expect(afterData.status).toBe('settled');

    await (billsOnSettle as any).run({
      data: {
        before: {
          data: () => ({ ...beforeData, status: 'settling' }),
          ref: billRef,
          exists: true,
        },
        after: {
          data: () => afterData,
          ref: billRef,
          exists: true,
        },
      },
      params: { billId },
    });
  }

  async function firstEffectiveAdjustmentId(billId: string): Promise<string> {
    await waitFor(
      async () => {
        const snap = await db
          .collection('bills')
          .doc(billId)
          .collection('settlementCycles')
          .doc('1')
          .collection('adjustments')
          .where('adjustmentState', '==', 'effective')
          .get();
        return snap.size > 0;
      },
      { label: 'effective adjustment' },
    );
    const snap = await db
      .collection('bills')
      .doc(billId)
      .collection('settlementCycles')
      .doc('1')
      .collection('adjustments')
      .where('adjustmentState', '==', 'effective')
      .get();
    return snap.docs[0].id;
  }

  async function createRefundPending(billId: string, amount: number, adminUid: string) {
    await (createPostSettlementAdjustment as any).run({
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
    });
  }

  async function createCollectionPending(billId: string, amount: number, adminUid: string) {
    await (createPostSettlementAdjustment as any).run({
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
    });
  }

  // -------------------------------------------------------------------------
  // フローA: ユーザー作成 → 初期残高 → 自動会計 → settle → 返金 → 追加徴収
  // -------------------------------------------------------------------------
  describe('フローA: 作成〜会計〜settle〜返金〜追加徴収', () => {
    it('同一ユーザー・billで残高・bill・ログ・cashAction・analyticsが一貫する', async () => {
      const adminId = 'admin_e2e_a';
      const userId = 'user_e2e_a';
      const billId = 'bill_e2e_a';
      const menuId = 'menu_e2e_a';
      const itemPrice = 2500;

      await createAdminDevice(adminId);

      // 1) ユーザー作成（Callable）→ 6残高 0
      const created = await (createUserAccount as any).run({
        auth: { uid: userId },
        data: {
          pokerName: 'E2EFlowA',
          email: 'e2e-a@example.com',
          pin: '1234',
          birthMonth: '07',
          birthDay: '25',
        },
      });
      expect(created.success).toBe(true);
      let user = (await db.collection('users').doc(userId).get()).data()!;
      expect(user.pointA).toBe(0);
      expect(user.pointB).toBe(0);
      expect(user.pointC).toBe(0);
      expect(user.pointD).toBe(0);
      expect(user.pointE).toBe(0);
      expect(user.sideGameChip).toBe(0);

      // 無効残高を fixture で保持確認用にセット
      await db.collection('users').doc(userId).update({
        pointD: 777,
        pointE: 888,
      });

      // 2) A-6 初期残高（有効のみ）
      const enabled = enabledBalanceIds(a7E2EFlowStoreConfigDocument() as any);
      expect(enabled).toEqual(['pointA', 'pointB', 'pointC', 'sideGameChip']);

      const initResult = await (setInitialUserBalances as any).run({
        auth: { uid: adminId },
        data: {
          targetUserId: userId,
          balances: {
            pointA: 800,
            pointB: 50,
            pointC: 400,
            sideGameChip: 30,
          },
          confirmOverwrite: true,
          clientNonce: 'e2e_a_init',
          note: 'E2E初期',
        },
      });
      expect(initResult.success).toBe(true);

      user = (await db.collection('users').doc(userId).get()).data()!;
      expect(user.pointA).toBe(800);
      expect(user.pointB).toBe(50);
      expect(user.pointC).toBe(400);
      expect(user.sideGameChip).toBe(30);
      expect(user.pointD).toBe(777);
      expect(user.pointE).toBe(888);

      const migLogs = await db
        .collection('users')
        .doc(userId)
        .collection('balanceMigrationLogs')
        .get();
      expect(migLogs.size).toBe(1);
      expect(migLogs.docs[0].data().balances).toEqual({
        pointA: 800,
        pointB: 50,
        pointC: 400,
        pointD: 777,
        pointE: 888,
        sideGameChip: 30,
      });

      // 3) bill + item → 自動会計（ポイント全額充当は不可 → cash 残す）
      await createMenuItem(menuId, itemPrice);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'E2EFlowA',
        idempotencyKey: 'idem_e2e_a_bill',
      });
      // businessDate を固定（analytics 検証用）
      await db.collection('bills').doc(billId).update({ businessDate: BUSINESS_DATE });

      await appendItem({
        billId,
        item: {
          menuItemId: menuId,
          quantity: 1,
          clientNonce: 'e2e_a_item',
        },
        idempotencyKey: `appendItem:${billId}:e2e_a_item`,
      });

      const cfg = flowConfig();
      const expectedSplit = calculateA7PaymentSplit({
        selectedBaseMethod: 'cash',
        bill: {
          extraCost: 0,
          sideGameChip: 0,
          tournaments: 0,
          items: itemPrice,
        },
        balances: {
          pointA: 800,
          pointB: 50,
          pointC: 400,
          pointD: 777,
          pointE: 888,
          sideGameChip: 30,
        },
        pointPriority: cfg.pointPriority,
        categoryPaymentMethods: cfg.categoryPaymentMethods,
        categoryOrder: cfg.categoryOrder,
        balancePaymentSettings: cfg.balancePaymentSettings,
      });

      // 800 + 500 + 300 + cash 900 = 2500
      expect(expectedSplit.paymentMethodsByAmount).toEqual({
        pointA: 800,
        pointB: 500,
        sideGameChip: 300,
        cash: 900,
      });
      expect(expectedSplit.usedBalanceAmounts).toEqual({
        pointA: 800,
        pointB: 50,
        sideGameChip: 30,
      });
      // pointC は priority 外 → 自動未使用
      expect(expectedSplit.usedBalanceAmounts.pointC).toBeUndefined();
      expect(expectedSplit.cashLikeAmount).toBe(900);

      const accountingReq = {
        auth: { uid: adminId },
        data: {
          billId,
          clientNonce: 'e2e_a_acct',
          accountingMode: 'auto',
          selectedBaseMethod: 'cash',
          // Flutter 相当: クライアントが自動充当結果を送り、Functions が再計算照合する
          paymentMethodsByCategory: expectedSplit.paymentMethodsByCategory,
          paymentMethodsByAmount: expectedSplit.paymentMethodsByAmount,
        },
      };
      await (startAccounting as any).run(accountingReq);

      // 二重会計（同一 nonce）で二重減算しない
      const replayAcct = await (startAccounting as any).run(accountingReq);
      expect(replayAcct.success).toBe(true);

      user = (await db.collection('users').doc(userId).get()).data()!;
      expect(user.pointA).toBe(0);
      expect(user.pointB).toBe(0);
      expect(user.pointC).toBe(400);
      expect(user.sideGameChip).toBe(0);
      expect(user.pointD).toBe(777);
      expect(user.pointE).toBe(888);

      let bill = (await db.collection('bills').doc(billId).get()).data()!;
      expect(bill.status).toBe('settling');
      expect(bill.meta.paymentMethodsByAmount).toEqual(expectedSplit.paymentMethodsByAmount);
      expect(bill.meta.paymentMethodsByCategory).toBeDefined();
      expect(bill.meta.paymentMethodDetails.pointA).toMatchObject({
        referenceAmount: 800,
        balanceAmount: 800,
        conversion: { referenceUnits: 1, balanceUnits: 1 },
        refundedBalanceAmount: 0,
      });
      expect(bill.meta.paymentMethodDetails.pointB).toMatchObject({
        referenceAmount: 500,
        balanceAmount: 50,
        conversion: { referenceUnits: 10, balanceUnits: 1 },
      });
      expect(bill.meta.paymentMethodDetails.sideGameChip).toMatchObject({
        referenceAmount: 300,
        balanceAmount: 30,
        conversion: { referenceUnits: 10, balanceUnits: 1 },
      });
      expect(bill.meta.paymentMethodDetails.pointC).toBeUndefined();

      // Flutter 相当: ByCategory から再集計した ByAmount と一致
      const byCat = bill.meta.paymentMethodsByCategory as Record<string, any>;
      const recomputed: Record<string, number> = {};
      for (const entries of Object.values(byCat)) {
        const list = Array.isArray(entries)
          ? entries
          : [{ method: entries, amount: itemPrice }];
        for (const e of list as Array<{ method: string; amount: number }>) {
          if (typeof e === 'object' && e.method) {
            recomputed[e.method] = (recomputed[e.method] ?? 0) + e.amount;
          } else if (typeof entries === 'string') {
            recomputed[entries] = (recomputed[entries] ?? 0) + itemPrice;
          }
        }
      }
      // string-only category case already handled; normalize empty categories
      expect(recomputed).toEqual(expectedSplit.paymentMethodsByAmount);

      const pointLogsAfterPay = await db
        .collection('users')
        .doc(userId)
        .collection('pointLogs')
        .get();
      expect(pointLogsAfterPay.size).toBeGreaterThanOrEqual(2);
      const chipLogsAfterPay = await db
        .collection('users')
        .doc(userId)
        .collection('sideGameChipLogs')
        .get();
      expect(chipLogsAfterPay.size).toBe(1);

      // 会計後に換算率を変更（返金は保存済み conversion を使う）
      const mutated = a7E2EFlowStoreConfigDocument();
      (mutated.billing as any).paymentPolicy.balancePaymentSettings.pointA = {
        conversion: { referenceUnits: 2, balanceUnits: 1 },
        usageUnit: 2,
      };
      await db.collection('storeMeta').doc('config').set(mutated, { merge: true });
      __setMockConfig(mutated);

      // 4) settle（V2 + trigger 手動発火）
      await settleBillViaV2AndTrigger(billId, adminId);
      await waitFor(
        async () => {
          const b = (await db.collection('bills').doc(billId).get()).data();
          return !!b?.paymentTotals && Object.keys(b.paymentTotals).length > 0;
        },
        { label: 'paymentTotals after settle' },
      );

      bill = (await db.collection('bills').doc(billId).get()).data()!;
      expect(bill.paymentTotals).toEqual({
        pointA: 800,
        pointB: 500,
        sideGameChip: 300,
        cash: 900,
      });
      // settle は ByCategory 推論しない（既存 meta を維持）
      expect(bill.meta.paymentMethodsByCategory).toEqual(byCat);

      // analytics（Cloud Tasks enqueue 代替: 本番 atomic 更新を直接）
      const monthKey = BUSINESS_DATE.slice(0, 7);
      await processBillAnalyticsAtomically(db, {
        month: monthKey,
        businessDate: BUSINESS_DATE,
        billId,
        cycleNo: 1,
        billData: bill,
        logInvocation: { functionEntry: 'billsOnSettle' },
      });
      const monthly = (await db.collection('analyticsMonthly').doc(monthKey).get()).data()!;
      expect(monthly.paymentTotals.pointA).toBe(800);
      expect(monthly.paymentTotals.pointB).toBe(500);
      expect(monthly.paymentTotals.sideGameChip).toBe(300);
      expect(monthly.paymentTotals.cash).toBe(900);

      // 未知 method が cash へ混入しない（helpers）
      const unknown = distributePaymentMethodsWithIssues({
        cash: 100,
        bitcoin: 50,
        pointA: 10,
      });
      expect(unknown.paymentTotalsMap.get('cash')).toBe(100);
      expect(unknown.paymentTotalsMap.has('bitcoin')).toBe(false);
      expect(unknown.issues[0]?.kind).toBe('PAYMENT_TOTALS_UNKNOWN_METHODS');

      // pointLogs query（index 定義と一致: pointType ASC + createdAt DESC）
      const typedLogs = await db
        .collection('users')
        .doc(userId)
        .collection('pointLogs')
        .where('pointType', '==', 'pointA')
        .orderBy('createdAt', 'desc')
        .get();
      expect(typedLogs.empty).toBe(false);

      // 5) 部分返金 → 残額返金（残高系のみ。cash は残す）
      const paymentTotalsBeforeRefund = { ...bill.paymentTotals };
      const balanceRefundTotal = 800 + 500 + 300; // 1600
      await createRefundPending(billId, balanceRefundTotal, adminId);
      let adjId = await firstEffectiveAdjustmentId(billId);

      const partialRefundReq = {
        auth: { uid: adminId },
        data: {
          billId,
          amountIncl: 400,
          methodBreakdown: [{ method: 'pointA', amountIncl: 400 }],
          allocations: [{ adjustmentId: adjId, amountIncl: 400 }],
          clientNonce: 'e2e_a_refund_partial',
        },
      };
      await (recordPostSettlementRefund as any).run(partialRefundReq);
      // 二重返金防止
      const refundReplay = await (recordPostSettlementRefund as any).run(partialRefundReq);
      expect(refundReplay.reused === true || refundReplay.success === true).toBe(true);

      user = (await db.collection('users').doc(userId).get()).data()!;
      // 保存済み 1:1（現行 config は 2:1 でも 400 残高復元）
      expect(user.pointA).toBe(400);

      bill = (await db.collection('bills').doc(billId).get()).data()!;
      expect(bill.meta.paymentMethodDetails.pointA.refundedBalanceAmount).toBe(400);
      expect(bill.paymentTotals).toEqual(paymentTotalsBeforeRefund);

      const remaining = bill.postSettlementState.requiredActionIncl as number;
      expect(remaining).toBe(1200);
      adjId = await firstEffectiveAdjustmentId(billId);

      await (recordPostSettlementRefund as any).run({
        auth: { uid: adminId },
        data: {
          billId,
          amountIncl: remaining,
          methodBreakdown: [
            { method: 'pointA', amountIncl: 400 },
            { method: 'pointB', amountIncl: 500 },
            { method: 'sideGameChip', amountIncl: 300 },
          ],
          allocations: [{ adjustmentId: adjId, amountIncl: remaining }],
          clientNonce: 'e2e_a_refund_rest',
        },
      });

      user = (await db.collection('users').doc(userId).get()).data()!;
      expect(user.pointA).toBe(800);
      expect(user.pointB).toBe(50);
      expect(user.sideGameChip).toBe(30);
      expect(user.pointC).toBe(400);

      bill = (await db.collection('bills').doc(billId).get()).data()!;
      expect(bill.meta.paymentMethodDetails.pointA.refundedBalanceAmount).toBe(800);
      expect(bill.meta.paymentMethodDetails.pointB.refundedBalanceAmount).toBe(50);
      expect(bill.meta.paymentMethodDetails.sideGameChip.refundedBalanceAmount).toBe(30);
      // 過剰返金なし・paymentTotals 非減算
      expect(bill.paymentTotals).toEqual(paymentTotalsBeforeRefund);

      // 6) 追加徴収（現在 config = pointA 2:1）
      await createCollectionPending(billId, 200, adminId);
      adjId = await firstEffectiveAdjustmentId(billId);
      const collectionReq = {
        auth: { uid: adminId },
        data: {
          billId,
          amountIncl: 200,
          methodBreakdown: [{ method: 'pointA', amountIncl: 200 }],
          allocations: [{ adjustmentId: adjId, amountIncl: 200 }],
          clientNonce: 'e2e_a_collect',
        },
      };
      await (recordPostSettlementCollection as any).run(collectionReq);
      const collectReplay = await (recordPostSettlementCollection as any).run(collectionReq);
      expect(collectReplay.reused === true || collectReplay.success === true).toBe(true);

      user = (await db.collection('users').doc(userId).get()).data()!;
      // 現行 2:1 → 残高 100 減算
      expect(user.pointA).toBe(700);

      const cashActions = await db
        .collection('bills')
        .doc(billId)
        .collection('settlementCycles')
        .doc('1')
        .collection('cashActions')
        .get();
      const collectionCa = cashActions.docs
        .map((d) => d.data())
        .find((d) => d.cashActionType === 'collection');
      expect(collectionCa).toBeDefined();
      expect(collectionCa!.methodBreakdown?.[0] ?? collectionCa!.balanceMovements).toBeTruthy();

      // collection analytics: pointA が残る / cash 誤集計なし
      const monthlyAfter = (
        await db.collection('analyticsMonthly').doc(monthKey).get()
      ).data()!;
      expect(monthlyAfter.paymentTotals.pointA).toBeGreaterThanOrEqual(800);
      // refund では paymentTotals 減算しない（settle 分は維持）
      expect(monthlyAfter.paymentTotals.pointB).toBe(500);
      expect(monthlyAfter.paymentTotals.cash).toBe(900);
    }, 60000);
  });

  // -------------------------------------------------------------------------
  // フローB: 手動支払い（priority 外 pointC）
  // -------------------------------------------------------------------------
  describe('フローB: 手動 pointC', () => {
    it('自動充当されず、手動 ByCategory を上書きせず会計できる', async () => {
      const adminId = 'admin_e2e_b';
      const userId = 'user_e2e_b';
      const billId = 'bill_e2e_b';
      const menuId = 'menu_e2e_b';
      const itemPrice = 100;

      await createAdminDevice(adminId);
      await db.collection('users').doc(userId).set({
        userType: 'line',
        pokerName: 'E2EFlowB',
        pointA: 5000,
        pointB: 500,
        pointC: 400, // 残高2=基準1 → 200円分
        pointD: 0,
        pointE: 0,
        sideGameChip: 100,
      });
      await createMenuItem(menuId, itemPrice);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'E2EFlowB',
        idempotencyKey: 'idem_e2e_b',
      });
      await appendItem({
        billId,
        item: { menuItemId: menuId, quantity: 1, clientNonce: 'e2e_b_item' },
        idempotencyKey: `appendItem:${billId}:e2e_b_item`,
      });

      // 手動: items 全額を pointC（基準100 → 残高200）
      await (startAccounting as any).run({
        auth: { uid: adminId },
        data: {
          billId,
          clientNonce: 'e2e_b_acct',
          accountingMode: 'custom',
          paymentMethodsByCategory: {
            items: [{ method: 'pointC', amount: 100 }],
          },
        },
      });

      const user = (await db.collection('users').doc(userId).get()).data()!;
      expect(user.pointC).toBe(200); // 400-200
      expect(user.pointA).toBe(5000); // 自動充当されていない
      expect(user.pointB).toBe(500);
      expect(user.sideGameChip).toBe(100);

      const bill = (await db.collection('bills').doc(billId).get()).data()!;
      expect(bill.meta.paymentMethodsByCategory.items).toEqual([
        { method: 'pointC', amount: 100 },
      ]);
      expect(bill.meta.paymentMethodsByAmount).toEqual({ pointC: 100 });
      expect(bill.meta.paymentMethodDetails.pointC).toMatchObject({
        referenceAmount: 100,
        balanceAmount: 200,
        conversion: { referenceUnits: 1, balanceUnits: 2 },
      });

      await settleBillViaV2AndTrigger(billId, adminId);
      await waitFor(async () => {
        const b = (await db.collection('bills').doc(billId).get()).data();
        return b?.paymentTotals?.pointC === 100;
      }, { label: 'flowB paymentTotals' });

      const settled = (await db.collection('bills').doc(billId).get()).data()!;
      expect(settled.paymentTotals).toEqual({ pointC: 100 });
    });
  });

  // -------------------------------------------------------------------------
  // フローC: トーナメント報酬・取消
  // -------------------------------------------------------------------------
  describe('フローC: トーナメント報酬', () => {
    it('テンプレ作成→個別生成相当→付与→無効化後も取消', async () => {
      const adminId = 'admin_e2e_c';
      const userId = 'user_e2e_c';
      const tournamentId = 't_e2e_c';
      const grantKey = `${tournamentId}:e2e`;
      const prize = 300;

      await createAdminDevice(adminId);
      await db.collection('users').doc(userId).set({
        userType: 'line',
        pointA: 50,
        pointB: 0,
        pointC: 0,
        pointD: 0,
        pointE: 0,
        sideGameChip: 0,
      });

      // ブラインドテンプレ（createTournamentTemplate 必須）
      await db.collection('blindTemplates').doc('blind_e2e').set({
        name: 'E2E Blind',
        isArchive: false,
        structure: [{ level: 1, sb: 100, bb: 200, ante: 0, time: 10 }],
      });

      const tpl = await (createTournamentTemplate as any).run({
        auth: { uid: adminId },
        data: {
          name: 'E2E Template',
          entryFee: 1000,
          isReentry: false,
          startStack: 10000,
          isAddon: false,
          blindStructure: 'blind_e2e',
          prizeRatio: 0.7,
          color: '#112233',
          pointType: 'pointA',
        },
      });
      expect(tpl.success).toBe(true);
      const templateId = tpl.tournamentTemplateId as string;
      const templateDoc = (
        await db.collection('tournamentTemplates').doc(templateId).get()
      ).data()!;
      expect(templateDoc.pointType).toBe('pointA');

      // sideGameChip 指定は拒否
      await expect(
        (createTournamentTemplate as any).run({
          auth: { uid: adminId },
          data: {
            name: 'Bad Chip Reward',
            entryFee: 1000,
            isReentry: false,
            startStack: 10000,
            isAddon: false,
            blindStructure: 'blind_e2e',
            prizeRatio: 0.7,
            color: '#445566',
            pointType: 'sideGameChip',
          },
        }),
      ).rejects.toBeInstanceOf(Error);

      // 個別トーナメント生成（テンプレ pointType を引き継ぎ）
      await db.collection('scheduledTournaments').doc(tournamentId).set({
        status: 'running',
        templateId,
        SetedRanking: false,
        snapshot: { pointType: templateDoc.pointType, name: templateDoc.name },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .set({
          pointType: templateDoc.pointType,
          prizeReceiverCount: 1,
          '1stPrize': prize,
          prizePool: prize,
          prizeConversion: { referenceUnits: 1, balanceUnits: 1 },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      const grantReq = {
        auth: { uid: adminId },
        data: {
          tournamentId,
          grantIdempotencyKey: grantKey,
          rankingData: { '1stPlayerUid': userId, '1stPlayerName': 'C' },
        },
      };
      await (setRankingData as any).run(grantReq);
      const grantReplay = await (setRankingData as any).run(grantReq);
      expect(grantReplay.reused === true || grantReplay.success === true).toBe(true);

      let user = (await db.collection('users').doc(userId).get()).data()!;
      expect(user.pointA).toBe(50 + prize);

      const rewardLog = await db
        .collection('users')
        .doc(userId)
        .collection('pointLogs')
        .doc(rewardPointLogId(grantKey, 'pointA'))
        .get();
      expect(rewardLog.exists).toBe(true);
      expect(rewardLog.data()!.reasonType).toBe('tournament_reward');

      // 無効化後も取消可能
      const disabled = a7E2EFlowStoreConfigDocument();
      (disabled.pointSettings as any).pointA.enabled = false;
      (disabled.tournament as any).rankingRewardPointTypes = ['pointB'];
      await db.collection('storeMeta').doc('config').set(disabled, { merge: true });
      __setMockConfig(disabled);

      await undoSetRankingData({
        tournamentId,
        grantIdempotencyKey: grantKey,
        beforeMainView: {
          pointType: 'pointA',
          prizeReceiverCount: 1,
          '1stPrize': prize,
          prizeConversion: { referenceUnits: 1, balanceUnits: 1 },
        },
        rankingEntries: [
          {
            playerUid: userId,
            awardedBalanceAmount: prize,
            prizeReferenceAmount: prize,
            entryId: 'e1',
            pointType: 'pointA',
          },
        ],
      });

      user = (await db.collection('users').doc(userId).get()).data()!;
      expect(user.pointA).toBe(50);
      expect(rewardLog.exists).toBe(true);
      const reversal = await db
        .collection('users')
        .doc(userId)
        .collection('pointLogs')
        .doc(rewardReversalPointLogId(grantKey, 'pointA'))
        .get();
      expect(reversal.exists).toBe(true);
      expect(reversal.data()!.reasonType).toBe('tournament_reward_reversal');

      // 二重取消
      await undoSetRankingData({
        tournamentId,
        grantIdempotencyKey: grantKey,
        beforeMainView: {
          pointType: 'pointA',
          prizeReceiverCount: 1,
          '1stPrize': prize,
          prizeConversion: { referenceUnits: 1, balanceUnits: 1 },
        },
        rankingEntries: [
          {
            playerUid: userId,
            awardedBalanceAmount: prize,
            prizeReferenceAmount: prize,
            entryId: 'e1',
            pointType: 'pointA',
          },
        ],
      });
      user = (await db.collection('users').doc(userId).get()).data()!;
      expect(user.pointA).toBe(50);
    });
  });

  // -------------------------------------------------------------------------
  // フローD: sideGameChip 預入・引出
  // -------------------------------------------------------------------------
  describe('フローD: sideGameChip 預入・引出', () => {
    it('増減・ログ・冪等・disabled 拒否', async () => {
      const adminId = 'admin_e2e_d';
      const userId = 'user_e2e_d';
      const billId = 'bill_e2e_d';

      await createAdminDevice(adminId);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'E2EFlowD',
        idempotencyKey: 'idem_e2e_d',
      });
      await db.collection('users').doc(userId).set({
        userType: 'line',
        sideGameChip: 100,
        pointA: 0,
        pointB: 0,
        pointC: 0,
        pointD: 0,
        pointE: 0,
      });

      const depositReq = {
        auth: { uid: adminId },
        data: { userId, amount: 40, clientNonce: 'e2e_d_dep' },
      };
      const dep = await (depositChip as any).run(depositReq);
      expect(dep.data.newBalance).toBe(140);
      const depReplay = await (depositChip as any).run(depositReq);
      expect(depReplay.data.reused).toBe(true);
      expect((await db.collection('users').doc(userId).get()).data()!.sideGameChip).toBe(140);

      const depLog = await db
        .collection('users')
        .doc(userId)
        .collection('sideGameChipLogs')
        .doc(depositSideGameChipLogId(dep.data.chipId))
        .get();
      expect(depLog.data()).toMatchObject({
        reasonType: 'deposit',
        balanceBefore: 100,
        changeAmount: 40,
        balanceAfter: 140,
      });

      const withdrawReq = {
        auth: { uid: adminId },
        data: { userId, amount: 30, clientNonce: 'e2e_d_wd' },
      };
      const wd = await (withdrawChip as any).run(withdrawReq);
      expect(wd.data.newBalance).toBe(110);
      const wdReplay = await (withdrawChip as any).run(withdrawReq);
      expect(wdReplay.data.reused).toBe(true);
      expect((await db.collection('users').doc(userId).get()).data()!.sideGameChip).toBe(110);

      const wdLog = await db
        .collection('users')
        .doc(userId)
        .collection('sideGameChipLogs')
        .doc(withdrawSideGameChipLogId(wd.data.chipId))
        .get();
      expect(wdLog.data()).toMatchObject({
        reasonType: 'withdraw',
        balanceBefore: 140,
        changeAmount: -30,
        balanceAfter: 110,
      });

      // disabled
      const disabled = a7E2EFlowStoreConfigDocument();
      (disabled.sideGameChipSettings as any).enabled = false;
      await db.collection('storeMeta').doc('config').set(disabled, { merge: true });
      __setMockConfig(disabled);

      await expect(
        (depositChip as any).run({
          auth: { uid: adminId },
          data: { userId, amount: 1, clientNonce: 'e2e_d_dep_off' },
        }),
      ).rejects.toBeInstanceOf(Error);
      await expect(
        (withdrawChip as any).run({
          auth: { uid: adminId },
          data: { userId, amount: 1, clientNonce: 'e2e_d_wd_off' },
        }),
      ).rejects.toBeInstanceOf(Error);
      expect((await db.collection('users').doc(userId).get()).data()!.sideGameChip).toBe(110);
    });
  });

  // -------------------------------------------------------------------------
  // フローE: 店舗管理 → LINE 移行
  // -------------------------------------------------------------------------
  describe('フローE: LINE 移行', () => {
    it('全6残高をコピーし冪等・source 保護', async () => {
      const adminId = 'admin_e2e_e';
      const sourceId = 'src_e2e_e';
      const targetId = 'tgt_e2e_e';
      await createAdminDevice(adminId);

      await db.collection('users').doc(sourceId).set({
        userType: 'store_managed',
        isMigrated: false,
        pokerName: 'StoreSrc',
        pointA: 11,
        pointB: 22,
        pointC: 33,
        pointD: 44,
        pointE: 55,
        sideGameChip: 66,
      });
      await db.collection('users').doc(targetId).set({
        userType: 'line',
        pokerName: 'LineTgt',
        pointA: 1,
        pointB: 2,
        pointC: 3,
        pointD: 4,
        pointE: 5,
        sideGameChip: 6,
      });

      const migReq = {
        auth: { uid: adminId },
        data: {
          sourceUserId: sourceId,
          targetUserId: targetId,
          confirmSamePerson: true,
          confirmOverwrite: true,
          clientNonce: 'e2e_e_mig',
        },
      };
      const result = await (migrateStoreManagedUserToLine as any).run(migReq);
      expect(result.balances).toEqual({
        pointA: 11,
        pointB: 22,
        pointC: 33,
        pointD: 44,
        pointE: 55,
        sideGameChip: 66,
      });

      const replay = await (migrateStoreManagedUserToLine as any).run(migReq);
      expect(replay.reused).toBe(true);

      const source = (await db.collection('users').doc(sourceId).get()).data()!;
      expect(source.isMigrated).toBe(true);
      expect(source.migratedToUserId).toBe(targetId);
      expect(source.migratedAt).toBeTruthy();
      expect(source.pointA).toBe(11);
      expect(source.pointD).toBe(44);

      const target = (await db.collection('users').doc(targetId).get()).data()!;
      expect(target.pointA).toBe(11);
      expect(target.pointD).toBe(44);
      expect(target.pointE).toBe(55);
      expect(target.sideGameChip).toBe(66);

      const logs = await db
        .collection('users')
        .doc(targetId)
        .collection('balanceMigrationLogs')
        .get();
      expect(logs.size).toBe(1);
      expect(logs.docs[0].data().balances).toEqual(result.balances);

      // 同一 clientNonce 再実行は二重移行しない（reused）
      expect(replay.reused).toBe(true);
      expect(replay.migrationId).toBe(result.migrationId);

      // 既移行 source は通常候補から除外される条件を満たす
      expect(source.isMigrated).toBe(true);
      expect(source.migratedToUserId).toBe(targetId);
    });
  });

  // -------------------------------------------------------------------------
  // Firestore index / 表示前提
  // -------------------------------------------------------------------------
  describe('表示・index 前提', () => {
    it('firestore.indexes.json に pointLogs(pointType ASC, createdAt DESC) がある', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const indexes = require('../../../firestore.indexes.json');
      const found = (indexes.indexes as any[]).some(
        (idx) =>
          idx.collectionGroup === 'pointLogs' &&
          idx.queryScope === 'COLLECTION' &&
          Array.isArray(idx.fields) &&
          idx.fields.length === 2 &&
          idx.fields[0].fieldPath === 'pointType' &&
          idx.fields[0].order === 'ASCENDING' &&
          idx.fields[1].fieldPath === 'createdAt' &&
          idx.fields[1].order === 'DESCENDING',
      );
      expect(found).toBe(true);
    });

    it('config 表示名・enabled・欠損0・corrupt 非扱い', async () => {
      const cfg = a7E2EFlowStoreConfigDocument() as any;
      expect(cfg.pointSettings.pointA.displayName).toBe('E2EポイントA');
      expect(cfg.pointSettings.pointC.displayName).toBe('E2EポイントC手動');
      expect(enabledBalanceIds(cfg)).toEqual([
        'pointA',
        'pointB',
        'pointC',
        'sideGameChip',
      ]);

      const { readBalanceOrZeroIfMissing, assertUsableBalanceValue } = await import(
        '../../src/domains/user/helpers/userBalances'
      );
      expect(readBalanceOrZeroIfMissing({ pointA: undefined }, 'pointA')).toBe(0);
      expect(() => assertUsableBalanceValue(null as any, { balanceId: 'pointA' })).toThrow();
    });
  });
});
