/**
 * 仕様書 [04_仕様書/07_analyticsMonthly更新と日付帰属とline配賦.md] §10.2 / §13 / §14 / §15 / §16 と
 * [02_changeSpec.md §5.2.3] / [04_確認観点と確認方法.md §2.1] に基づく Emulator integration test。
 *
 * テスト観点:
 * - 5 sub-collection（top-level / days / byCategory / byUser / byTemplateTournaments）の increment
 * - marker 冪等性（adj_{adjustmentId}）
 * - userId 無し / tournament line 無し / 増減両方 sign の挙動
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { processAdjustmentAnalyticsAtomically } from '../../src/domains/analytics/services/applyAdjustmentToAnalytics';
import {
  buildAdjustmentAnalyticsDelta,
  AdjustmentAnalyticsDelta,
} from '../../src/domains/analytics/services/aggregator/adjustmentDelta';
import type { AdjustmentLine } from '../../src/domains/bills/services/adjustments';

const PROJECT_ID = 'test-apply-adjustment-analytics';
const MONTH = '2026-05';
const BUSINESS_DATE = '2026-05-09';

function makeLine(partial: Partial<AdjustmentLine> & Pick<AdjustmentLine, 'targetCategory' | 'amountInclDelta'>): AdjustmentLine {
  return {
    lineNo: partial.lineNo ?? 1,
    targetCategory: partial.targetCategory,
    targetId: partial.targetId ?? null,
    targetName: partial.targetName ?? '',
    operationType: partial.operationType ?? 'sale',
    qtyDelta: partial.qtyDelta ?? 0,
    amountInclDelta: partial.amountInclDelta,
    note: partial.note ?? '',
  };
}

describe('processAdjustmentAnalyticsAtomically', () => {
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
    await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  describe('初回呼び出し: 5 sub-collection 全更新', () => {
    it('item line（増額） → top-level / days / byCategory / byUser / marker が更新される', async () => {
      const delta: AdjustmentAnalyticsDelta = buildAdjustmentAnalyticsDelta({
        lines: [makeLine({ targetCategory: 'item', operationType: 'sale', amountInclDelta: 1000, targetName: 'A' })],
        billUserId: 'u1',
      });

      await processAdjustmentAnalyticsAtomically(db, {
        monthKey: MONTH,
        businessDate: BUSINESS_DATE,
        billId: 'bill-1',
        adjustmentId: 'adj-1',
        delta,
      });

      const monthlyDoc = await db.collection('analyticsMonthly').doc(MONTH).get();
      expect(monthlyDoc.exists).toBe(true);
      expect(monthlyDoc.data()?.grossSales).toBe(1000);
      expect(monthlyDoc.data()?.itemsSales).toBe(1000);
      expect(monthlyDoc.data()?.dailySales[BUSINESS_DATE]).toBe(1000);

      const dailyDoc = await db
        .collection('analyticsMonthly')
        .doc(MONTH)
        .collection('days')
        .doc(BUSINESS_DATE)
        .get();
      expect(dailyDoc.exists).toBe(true);
      expect(dailyDoc.data()?.grossSales).toBe(1000);
      expect(dailyDoc.data()?.itemsSales).toBe(1000);
      expect(dailyDoc.data()?.byCategory.items).toBe(1000);

      const byCategoryDoc = await db
        .collection('analyticsMonthly')
        .doc(MONTH)
        .collection('byCategory')
        .doc('summary')
        .get();
      expect(byCategoryDoc.exists).toBe(true);
      expect(byCategoryDoc.data()?.totals.items).toBe(1000);

      const byUserDoc = await db
        .collection('analyticsMonthly')
        .doc(MONTH)
        .collection('byUser')
        .doc('u1')
        .get();
      expect(byUserDoc.exists).toBe(true);
      expect(byUserDoc.data()?.grossSales).toBe(1000);
      expect(byUserDoc.data()?.itemsSales).toBe(1000);

      const markerDoc = await db
        .collection('analyticsMonthly')
        .doc(MONTH)
        .collection('aggregationMarkers')
        .doc('adj_adj-1')
        .get();
      expect(markerDoc.exists).toBe(true);
      expect(markerDoc.data()?.type).toBe('adjustment');
      expect(markerDoc.data()?.billId).toBe('bill-1');
      expect(markerDoc.data()?.adjustmentId).toBe('adj-1');
    });

    it('tournament line（増額） → byTemplateTournaments も更新される', async () => {
      const delta = buildAdjustmentAnalyticsDelta({
        lines: [
          makeLine({
            targetCategory: 'tournament',
            targetId: 'tmpl-A',
            targetName: 'Daily',
            operationType: 'entry',
            qtyDelta: 1,
            amountInclDelta: 5000,
          }),
        ],
        billUserId: 'u1',
      });

      await processAdjustmentAnalyticsAtomically(db, {
        monthKey: MONTH,
        businessDate: BUSINESS_DATE,
        billId: 'bill-2',
        adjustmentId: 'adj-2',
        delta,
      });

      const tmplDoc = await db
        .collection('analyticsMonthly')
        .doc(MONTH)
        .collection('byTemplateTournaments')
        .doc('tmpl-A')
        .get();
      expect(tmplDoc.exists).toBe(true);
      expect(tmplDoc.data()?.templateName).toBe('Daily');
      expect(tmplDoc.data()?.daily[BUSINESS_DATE].entryCount).toBe(1);
      expect(tmplDoc.data()?.daily[BUSINESS_DATE].entrySales).toBe(5000);
      expect(tmplDoc.data()?.daily[BUSINESS_DATE].totalTournamentSales).toBe(5000);
      expect(tmplDoc.data()?.totals.entryCount).toBe(1);
      expect(tmplDoc.data()?.totals.entrySales).toBe(5000);
      expect(tmplDoc.data()?.totals.totalTournamentSales).toBe(5000);
    });

    it('userId 無し（billUserId=null） → byUser 更新なし、他は更新あり', async () => {
      const delta = buildAdjustmentAnalyticsDelta({
        lines: [makeLine({ targetCategory: 'item', operationType: 'sale', amountInclDelta: 500, targetName: 'A' })],
        billUserId: null,
      });

      await processAdjustmentAnalyticsAtomically(db, {
        monthKey: MONTH,
        businessDate: BUSINESS_DATE,
        billId: 'bill-3',
        adjustmentId: 'adj-3',
        delta,
      });

      const byUserDocs = await db.collection('analyticsMonthly').doc(MONTH).collection('byUser').get();
      expect(byUserDocs.size).toBe(0);

      const monthlyDoc = await db.collection('analyticsMonthly').doc(MONTH).get();
      expect(monthlyDoc.data()?.grossSales).toBe(500);
    });
  });

  describe('減額 (sign 負方向)', () => {
    it('item line で amountInclDelta=-1000 → grossSales=-1000、items=-1000', async () => {
      const delta = buildAdjustmentAnalyticsDelta({
        lines: [makeLine({ targetCategory: 'item', operationType: 'sale', amountInclDelta: -1000, targetName: 'A' })],
        billUserId: 'u1',
      });

      await processAdjustmentAnalyticsAtomically(db, {
        monthKey: MONTH,
        businessDate: BUSINESS_DATE,
        billId: 'bill-4',
        adjustmentId: 'adj-4',
        delta,
      });

      const monthlyDoc = await db.collection('analyticsMonthly').doc(MONTH).get();
      expect(monthlyDoc.data()?.grossSales).toBe(-1000);
      expect(monthlyDoc.data()?.itemsSales).toBe(-1000);
    });
  });

  describe('冪等性: 同 adjustmentId で 2 回呼び出し', () => {
    it('2 回目は marker check で early return、各 sub-collection は変化なし', async () => {
      const delta = buildAdjustmentAnalyticsDelta({
        lines: [makeLine({ targetCategory: 'item', operationType: 'sale', amountInclDelta: 1000, targetName: 'A' })],
        billUserId: 'u1',
      });

      await processAdjustmentAnalyticsAtomically(db, {
        monthKey: MONTH,
        businessDate: BUSINESS_DATE,
        billId: 'bill-5',
        adjustmentId: 'adj-5',
        delta,
      });
      await processAdjustmentAnalyticsAtomically(db, {
        monthKey: MONTH,
        businessDate: BUSINESS_DATE,
        billId: 'bill-5',
        adjustmentId: 'adj-5',
        delta,
      });

      const monthlyDoc = await db.collection('analyticsMonthly').doc(MONTH).get();
      expect(monthlyDoc.data()?.grossSales).toBe(1000); // 1000 のまま、二重計上なし
      expect(monthlyDoc.data()?.itemsSales).toBe(1000);
    });
  });

  describe('複合 line: items + extra + tournament 混在', () => {
    it('全 sub-collection に正しく配賦される', async () => {
      const delta = buildAdjustmentAnalyticsDelta({
        lines: [
          makeLine({ lineNo: 1, targetCategory: 'item', operationType: 'sale', amountInclDelta: 200, targetName: 'A' }),
          makeLine({ lineNo: 2, targetCategory: 'extra', operationType: 'extra', amountInclDelta: 300, targetName: 'B' }),
          makeLine({
            lineNo: 3,
            targetCategory: 'tournament',
            targetId: 'tmpl-B',
            targetName: 'Hyper',
            operationType: 'addon',
            qtyDelta: 1,
            amountInclDelta: 1000,
          }),
        ],
        billUserId: 'u2',
      });

      await processAdjustmentAnalyticsAtomically(db, {
        monthKey: MONTH,
        businessDate: BUSINESS_DATE,
        billId: 'bill-6',
        adjustmentId: 'adj-6',
        delta,
      });

      const monthlyDoc = await db.collection('analyticsMonthly').doc(MONTH).get();
      expect(monthlyDoc.data()?.grossSales).toBe(1500);
      expect(monthlyDoc.data()?.itemsSales).toBe(200);
      expect(monthlyDoc.data()?.extraCostSales).toBe(300);
      expect(monthlyDoc.data()?.tournamentsSales).toBe(1000);

      const byCategoryDoc = await db
        .collection('analyticsMonthly')
        .doc(MONTH)
        .collection('byCategory')
        .doc('summary')
        .get();
      expect(byCategoryDoc.data()?.totals.items).toBe(200);
      expect(byCategoryDoc.data()?.totals.extraCost).toBe(300);
      expect(byCategoryDoc.data()?.totals.tournaments).toBe(1000);

      const tmplDoc = await db
        .collection('analyticsMonthly')
        .doc(MONTH)
        .collection('byTemplateTournaments')
        .doc('tmpl-B')
        .get();
      expect(tmplDoc.data()?.totals.addonCount).toBe(1);
      expect(tmplDoc.data()?.totals.addonSales).toBe(1000);

      const byUserDoc = await db
        .collection('analyticsMonthly')
        .doc(MONTH)
        .collection('byUser')
        .doc('u2')
        .get();
      expect(byUserDoc.data()?.grossSales).toBe(1500);
      expect(byUserDoc.data()?.itemsSales).toBe(200);
    });
  });

  describe('既存 doc 上に追加 increment', () => {
    it('既存 doc に + で 2 回 adjustment 反映 → 累積される', async () => {
      const delta1 = buildAdjustmentAnalyticsDelta({
        lines: [makeLine({ targetCategory: 'item', operationType: 'sale', amountInclDelta: 500, targetName: 'A' })],
        billUserId: 'u3',
      });
      await processAdjustmentAnalyticsAtomically(db, {
        monthKey: MONTH,
        businessDate: BUSINESS_DATE,
        billId: 'bill-7',
        adjustmentId: 'adj-7',
        delta: delta1,
      });

      const delta2 = buildAdjustmentAnalyticsDelta({
        lines: [makeLine({ targetCategory: 'item', operationType: 'sale', amountInclDelta: 300, targetName: 'A' })],
        billUserId: 'u3',
      });
      await processAdjustmentAnalyticsAtomically(db, {
        monthKey: MONTH,
        businessDate: BUSINESS_DATE,
        billId: 'bill-7',
        adjustmentId: 'adj-7-2',
        delta: delta2,
      });

      const monthlyDoc = await db.collection('analyticsMonthly').doc(MONTH).get();
      expect(monthlyDoc.data()?.grossSales).toBe(800);
      expect(monthlyDoc.data()?.itemsSales).toBe(800);
    });
  });
});
