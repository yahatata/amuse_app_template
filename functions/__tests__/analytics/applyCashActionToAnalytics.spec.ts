/**
 * 仕様書 [04_仕様書/07_analyticsMonthly更新と日付帰属とline配賦.md] §10.3 / §11 / §8.4 と
 * [02_changeSpec.md §5.2.4] / [04_確認観点と確認方法.md §2.2] に基づく Emulator integration test。
 *
 * テスト観点:
 * - collection: paymentTotals / days.byPaymentMethod / byUser.paymentTotals が increment
 * - refund: 全 sub-collection に変化なし、marker 作成なし
 * - userId 無し: byUser 更新なし
 * - 冪等性: 同 cashActionId で 2 回呼び出しても一度のみ反映
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { processCashActionAnalyticsAtomically } from '../../src/domains/analytics/services/applyCashActionToAnalytics';
import { buildCashActionAnalyticsDelta } from '../../src/domains/analytics/services/aggregator/cashActionDelta';

const PROJECT_ID = 'test-apply-cash-action-analytics';
const MONTH = '2026-05';
const BUSINESS_DATE = '2026-05-09';

describe('processCashActionAnalyticsAtomically', () => {
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

  describe('collection（仕様書 §11 増額系 + 追加徴収完了）', () => {
    it('単一 method (cash 1000) → paymentTotals.cash += 1000、days.byPaymentMethod.cash += 1000、byUser.paymentTotals.cash += 1000、marker 作成', async () => {
      const delta = buildCashActionAnalyticsDelta({
        cashActionType: 'collection',
        methodBreakdown: [{ method: 'cash', amountIncl: 1000 }],
      });
      await processCashActionAnalyticsAtomically(db, {
        monthKey: MONTH,
        businessDate: BUSINESS_DATE,
        billId: 'bill-1',
        cashActionId: 'cash-1',
        cashActionType: 'collection',
        delta,
        billUserId: 'u1',
      });

      const monthlyDoc = await db.collection('analyticsMonthly').doc(MONTH).get();
      expect(monthlyDoc.data()?.paymentTotals.cash).toBe(1000);

      const dailyDoc = await db
        .collection('analyticsMonthly')
        .doc(MONTH)
        .collection('days')
        .doc(BUSINESS_DATE)
        .get();
      expect(dailyDoc.data()?.byPaymentMethod.cash).toBe(1000);

      const byUserDoc = await db
        .collection('analyticsMonthly')
        .doc(MONTH)
        .collection('byUser')
        .doc('u1')
        .get();
      expect(byUserDoc.data()?.paymentTotals.cash).toBe(1000);

      const markerDoc = await db
        .collection('analyticsMonthly')
        .doc(MONTH)
        .collection('aggregationMarkers')
        .doc('cash_cash-1')
        .get();
      expect(markerDoc.exists).toBe(true);
      expect(markerDoc.data()?.type).toBe('cashAction');
      expect(markerDoc.data()?.cashActionType).toBe('collection');
    });

    it('複数 method (cash 600 + credit_card 400) → 両方 increment', async () => {
      const delta = buildCashActionAnalyticsDelta({
        cashActionType: 'collection',
        methodBreakdown: [
          { method: 'cash', amountIncl: 600 },
          { method: 'credit_card', amountIncl: 400 },
        ],
      });
      await processCashActionAnalyticsAtomically(db, {
        monthKey: MONTH,
        businessDate: BUSINESS_DATE,
        billId: 'bill-2',
        cashActionId: 'cash-2',
        cashActionType: 'collection',
        delta,
        billUserId: 'u1',
      });

      const monthlyDoc = await db.collection('analyticsMonthly').doc(MONTH).get();
      expect(monthlyDoc.data()?.paymentTotals.cash).toBe(600);
      expect(monthlyDoc.data()?.paymentTotals.credit_card).toBe(400);
    });

    it('userId 無し（billUserId=null） → byUser 更新なし、他は更新あり', async () => {
      const delta = buildCashActionAnalyticsDelta({
        cashActionType: 'collection',
        methodBreakdown: [{ method: 'cash', amountIncl: 500 }],
      });
      await processCashActionAnalyticsAtomically(db, {
        monthKey: MONTH,
        businessDate: BUSINESS_DATE,
        billId: 'bill-3',
        cashActionId: 'cash-3',
        cashActionType: 'collection',
        delta,
        billUserId: null,
      });

      const byUserDocs = await db.collection('analyticsMonthly').doc(MONTH).collection('byUser').get();
      expect(byUserDocs.size).toBe(0);

      const monthlyDoc = await db.collection('analyticsMonthly').doc(MONTH).get();
      expect(monthlyDoc.data()?.paymentTotals.cash).toBe(500);
    });
  });

  describe('refund（仕様書 §8.4 paymentTotals 直接減らさず）', () => {
    it('refund → 全 sub-collection に変化なし、marker 作成なし', async () => {
      const delta = buildCashActionAnalyticsDelta({
        cashActionType: 'refund',
        methodBreakdown: [{ method: 'cash', amountIncl: 1000 }],
      });
      await processCashActionAnalyticsAtomically(db, {
        monthKey: MONTH,
        businessDate: BUSINESS_DATE,
        billId: 'bill-4',
        cashActionId: 'cash-4',
        cashActionType: 'refund',
        delta,
        billUserId: 'u1',
      });

      const monthlyDoc = await db.collection('analyticsMonthly').doc(MONTH).get();
      expect(monthlyDoc.exists).toBe(false);

      const markerDoc = await db
        .collection('analyticsMonthly')
        .doc(MONTH)
        .collection('aggregationMarkers')
        .doc('cash_cash-4')
        .get();
      expect(markerDoc.exists).toBe(false);
    });
  });

  describe('冪等性', () => {
    it('同 cashActionId で 2 回呼び出し → 1 度のみ反映', async () => {
      const delta = buildCashActionAnalyticsDelta({
        cashActionType: 'collection',
        methodBreakdown: [{ method: 'cash', amountIncl: 1000 }],
      });
      await processCashActionAnalyticsAtomically(db, {
        monthKey: MONTH,
        businessDate: BUSINESS_DATE,
        billId: 'bill-5',
        cashActionId: 'cash-5',
        cashActionType: 'collection',
        delta,
        billUserId: 'u1',
      });
      await processCashActionAnalyticsAtomically(db, {
        monthKey: MONTH,
        businessDate: BUSINESS_DATE,
        billId: 'bill-5',
        cashActionId: 'cash-5',
        cashActionType: 'collection',
        delta,
        billUserId: 'u1',
      });

      const monthlyDoc = await db.collection('analyticsMonthly').doc(MONTH).get();
      expect(monthlyDoc.data()?.paymentTotals.cash).toBe(1000);
    });
  });

  describe('既存 doc 上に追加 increment', () => {
    it('2 回別 cashActionId で increment → 累積される', async () => {
      const delta1 = buildCashActionAnalyticsDelta({
        cashActionType: 'collection',
        methodBreakdown: [{ method: 'cash', amountIncl: 1000 }],
      });
      await processCashActionAnalyticsAtomically(db, {
        monthKey: MONTH,
        businessDate: BUSINESS_DATE,
        billId: 'bill-6',
        cashActionId: 'cash-6a',
        cashActionType: 'collection',
        delta: delta1,
        billUserId: 'u1',
      });

      const delta2 = buildCashActionAnalyticsDelta({
        cashActionType: 'collection',
        methodBreakdown: [{ method: 'cash', amountIncl: 500 }],
      });
      await processCashActionAnalyticsAtomically(db, {
        monthKey: MONTH,
        businessDate: BUSINESS_DATE,
        billId: 'bill-6',
        cashActionId: 'cash-6b',
        cashActionType: 'collection',
        delta: delta2,
        billUserId: 'u1',
      });

      const monthlyDoc = await db.collection('analyticsMonthly').doc(MONTH).get();
      expect(monthlyDoc.data()?.paymentTotals.cash).toBe(1500);
    });
  });
});
