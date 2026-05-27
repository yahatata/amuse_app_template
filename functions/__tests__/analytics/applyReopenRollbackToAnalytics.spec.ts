/**
 * Step07 Phase E: applyReopenRollbackToAnalytics の Emulator 統合テスト。
 *
 * 観点（[02_changeSpec.md] §5.2.5 / [04_確認観点と確認方法.md] §3 / §5）:
 * 1. 反映済 settle baseline を rollback すると monthly / daily / byCategory / byUser / byTemplateTournaments / paymentTotals が 0 に戻る
 * 2. adjustments / collection cashActions も含めて一括 rollback できる
 * 3. 同一 reopen marker の二度目呼び出しは no-op（idempotent）
 * 4. settle marker 自体は残ったまま（audit 証跡）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import {
  processReopenRollbackAnalyticsAtomically,
  ReopenRollbackInput,
} from '../../src/domains/analytics/services/applyReopenRollbackToAnalytics';
import { processBillAnalyticsAtomically } from '../../src/domains/analytics/services/updateAnalyticsForBill';
import { processAdjustmentAnalyticsAtomically } from '../../src/domains/analytics/services/applyAdjustmentToAnalytics';
import { processCashActionAnalyticsAtomically } from '../../src/domains/analytics/services/applyCashActionToAnalytics';
import { buildAdjustmentAnalyticsDelta } from '../../src/domains/analytics/services/aggregator/adjustmentDelta';
import { buildCashActionAnalyticsDelta } from '../../src/domains/analytics/services/aggregator/cashActionDelta';
import type { AdjustmentLine } from '../../src/domains/bills/services/adjustments';

const PROJECT_ID = 'test-step07-rollback';

describe('processReopenRollbackAnalyticsAtomically (Emulator)', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
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

  const monthKey = '2026-05';
  const businessDate = '2026-05-09';

  function buildSettleBillData(overrides?: Record<string, any>) {
    return {
      billId: 'bill-r1',
      businessDate,
      cycleNo: 1,
      amounts: { grandTotalRounded: 5000 },
      categoryBreakdown: {
        items: 3000,
        extraCost: 0,
        sideGameChips: 0,
        tournaments: 2000,
      },
      tournamentsSnapshot: {
        'tpl-1': {
          templateName: 'A Tournament',
          entryCount: 2,
          entrySalesIncl: 2000,
          reentryCount: 0,
          reentrySalesIncl: 0,
          addonCount: 0,
          addonSalesIncl: 0,
          totalTournamentSalesIncl: 2000,
        },
      },
      paymentTotals: { cash: 5000 },
      paymentsSummary: {
        paidTotalIncl: 5000,
        balanceDueIncl: 0,
        byMethod: { cash: 5000 },
      },
      party: { userId: 'user-X', pokerName: 'taro' },
      postEvents: { totalAdjustmentsIncl: 0 },
      ...overrides,
    };
  }

  it('settle のみ → reopen rollback で monthly / daily / paymentTotals / byUser が 0 に戻る', async () => {
    const billData = buildSettleBillData();

    // 1) settle baseline を反映
    await processBillAnalyticsAtomically(db, {
      month: monthKey,
      businessDate,
      billId: 'bill-r1',
      cycleNo: 1,
      billData,
      logInvocation: { functionEntry: 'billsOnSettle' },
    });

    // 2) reopen rollback を実施
    const input: ReopenRollbackInput = {
      billDataAtSettle: billData,
      adjustmentsLines: [],
      collectionCashActionsMethodBreakdown: [],
    };
    await processReopenRollbackAnalyticsAtomically(db, {
      monthKey,
      businessDate,
      billId: 'bill-r1',
      oldCycleNo: 1,
      billUserId: 'user-X',
      input,
    });

    // 3) monthly が 0 に戻ること
    const monthlyDoc = await db.collection('analyticsMonthly').doc(monthKey).get();
    const m = monthlyDoc.data()!;
    expect(m.grossSales).toBe(0);
    expect(m.itemsSales).toBe(0);
    expect(m.tournamentsSales).toBe(0);
    expect(m.orderCount).toBe(0);
    expect(m.dailySales[businessDate]).toBe(0);
    expect(m.paymentTotals.cash).toBe(0);

    // 4) daily / byUser も 0
    const dayDoc = await db
      .collection('analyticsMonthly').doc(monthKey)
      .collection('days').doc(businessDate).get();
    expect(dayDoc.data()?.grossSales).toBe(0);
    expect(dayDoc.data()?.orderCount).toBe(0);

    const byUserDoc = await db
      .collection('analyticsMonthly').doc(monthKey)
      .collection('byUser').doc('user-X').get();
    expect(byUserDoc.data()?.grossSales).toBe(0);
    expect(byUserDoc.data()?.paymentTotals.cash).toBe(0);

    // 5) byTemplateTournaments も 0
    const tplDoc = await db
      .collection('analyticsMonthly').doc(monthKey)
      .collection('byTemplateTournaments').doc('tpl-1').get();
    const tpl = tplDoc.data()!;
    expect(tpl.totals.entryCount).toBe(0);
    expect(tpl.totals.entrySales).toBe(0);

    // 6) settle marker は audit 証跡として残る
    const settleMarker = await db
      .collection('analyticsMonthly').doc(monthKey)
      .collection('aggregationMarkers').doc('bill-r1_cycle1_settle').get();
    expect(settleMarker.exists).toBe(true);

    // 7) reopen rollback marker が作成されている
    const rollbackMarker = await db
      .collection('analyticsMonthly').doc(monthKey)
      .collection('aggregationMarkers').doc('reopen_bill-r1_cycle1').get();
    expect(rollbackMarker.exists).toBe(true);
    expect(rollbackMarker.data()?.type).toBe('reopen_rollback');
  });

  it('settle + adjustment + collection cashAction → 全部 rollback で 0 に戻る', async () => {
    const billData = buildSettleBillData();

    await processBillAnalyticsAtomically(db, {
      month: monthKey,
      businessDate,
      billId: 'bill-r2',
      cycleNo: 1,
      billData: { ...billData, billId: 'bill-r2' },
      logInvocation: { functionEntry: 'billsOnSettle' },
    });

    // adjustment: tournament line を 1 entry 追加（+500）
    const adjLines: AdjustmentLine[] = [
      {
        lineNo: 1,
        targetCategory: 'tournament',
        targetId: 'tpl-1',
        targetName: 'A Tournament',
        operationType: 'entry',
        qtyDelta: 1,
        amountInclDelta: 500,
        note: '',
      },
    ];
    const adjDelta = buildAdjustmentAnalyticsDelta({
      lines: adjLines,
      billUserId: 'user-X',
    });
    await processAdjustmentAnalyticsAtomically(db, {
      monthKey,
      businessDate,
      billId: 'bill-r2',
      adjustmentId: 'adj-1',
      delta: adjDelta,
    });

    // collection cashAction: cash で 500 を回収
    const cashMethodBreakdown = [{ method: 'cash', amountIncl: 500 }];
    const cashDelta = buildCashActionAnalyticsDelta({
      cashActionType: 'collection',
      methodBreakdown: cashMethodBreakdown,
    });
    await processCashActionAnalyticsAtomically(db, {
      monthKey,
      businessDate,
      billId: 'bill-r2',
      cashActionId: 'cash-1',
      cashActionType: 'collection',
      delta: cashDelta,
      billUserId: 'user-X',
    });

    // sanity: settle + adj + cash が反映されている
    const before = await db.collection('analyticsMonthly').doc(monthKey).get();
    const b = before.data()!;
    expect(b.grossSales).toBe(5000 + 500); // settle + adj
    expect(b.tournamentsSales).toBe(2000 + 500);
    expect(b.paymentTotals.cash).toBe(5000 + 500); // settle + collection

    // rollback
    const input: ReopenRollbackInput = {
      billDataAtSettle: billData,
      adjustmentsLines: [adjLines],
      collectionCashActionsMethodBreakdown: [cashMethodBreakdown],
    };
    await processReopenRollbackAnalyticsAtomically(db, {
      monthKey,
      businessDate,
      billId: 'bill-r2',
      oldCycleNo: 1,
      billUserId: 'user-X',
      input,
    });

    const after = await db.collection('analyticsMonthly').doc(monthKey).get();
    const a = after.data()!;
    expect(a.grossSales).toBe(0);
    expect(a.tournamentsSales).toBe(0);
    expect(a.itemsSales).toBe(0);
    expect(a.orderCount).toBe(0);
    expect(a.paymentTotals.cash).toBe(0);
  });

  it('idempotent: reopen marker 既存時は no-op', async () => {
    const billData = buildSettleBillData();
    await processBillAnalyticsAtomically(db, {
      month: monthKey,
      businessDate,
      billId: 'bill-r3',
      cycleNo: 1,
      billData: { ...billData, billId: 'bill-r3' },
      logInvocation: { functionEntry: 'billsOnSettle' },
    });

    const input: ReopenRollbackInput = {
      billDataAtSettle: billData,
      adjustmentsLines: [],
      collectionCashActionsMethodBreakdown: [],
    };

    // 1 回目
    await processReopenRollbackAnalyticsAtomically(db, {
      monthKey,
      businessDate,
      billId: 'bill-r3',
      oldCycleNo: 1,
      billUserId: 'user-X',
      input,
    });

    const afterFirst = await db.collection('analyticsMonthly').doc(monthKey).get();
    expect(afterFirst.data()?.grossSales).toBe(0);

    // 2 回目（marker 既存 → no-op）
    await processReopenRollbackAnalyticsAtomically(db, {
      monthKey,
      businessDate,
      billId: 'bill-r3',
      oldCycleNo: 1,
      billUserId: 'user-X',
      input,
    });

    const afterSecond = await db.collection('analyticsMonthly').doc(monthKey).get();
    // 二重 rollback が走っていれば負値になるはずだが、marker により stop されているので 0 のまま
    expect(afterSecond.data()?.grossSales).toBe(0);
  });
});
