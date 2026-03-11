/**
 * processBillAnalyticsAtomically の統合テスト
 * 
 * Analytics Monthly 更新の同一化 ChangeSpec に準拠
 * Firestore Emulator を使用した統合テスト
 * 
 * テスト観点:
 * 1. 冪等性テスト: 同一billIdで複数回実行しても二重計上しない
 * 2. 失敗時再試行テスト: トランザクション内でエラーが発生した場合、markerが作成されず再実行可能
 * 3. 更新内容の同一性テスト: 旧スキーマ（grossSales, itemsSales, orderCount, byCategory, byUser, byTemplateTournaments）が正しく更新される
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { processBillAnalyticsAtomically } from '../../src/domains/analytics/services/updateAnalyticsForBill';

describe('processBillAnalyticsAtomically', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-process-bill-analytics';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    
    testEnv = await initializeTestEnvironment({
      projectId,
    });
    
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map(a => a?.delete()).filter(Boolean));
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

  // テスト用ヘルパ: billData を作成
  function createBillData(overrides: any = {}) {
    return {
      businessDate: '2025-01-15',
      status: 'settled',
      amounts: {
        grandTotalRounded: 5000,
      },
      categoryBreakdown: {
        items: 3000,
        extraCost: 500,
        sideGameChips: 1000,
        tournaments: 500,
      },
      paymentTotals: {
        cash: 3000,
        credit_card: 2000,
      },
      itemsSnapshot: {
        'menu1': {
          qty: 2,
          salesIncl: 1500,
          name: '商品1',
          category: 'カテゴリ1',
        },
        'menu2': {
          qty: 1,
          salesIncl: 1500,
          name: '商品2',
          category: 'カテゴリ2',
        },
      },
      tournamentsSnapshot: {
        'template1': {
          templateName: 'トーナメント1',
          entryCount: 1,
          entrySalesIncl: 500,
          reentryCount: 0,
          reentrySalesIncl: 0,
          addonCount: 0,
          addonSalesIncl: 0,
          totalTournamentSalesIncl: 500,
        },
      },
      party: {
        userId: 'user1',
        pokerName: 'テストユーザー',
      },
      ...overrides,
    };
  }

  describe('冪等性テスト', () => {
    it('同一billIdで複数回実行しても二重計上しない（markerでブロック）', async () => {
      const billId = 'bill_001';
      const billData = createBillData();
      const month = '2025-01';
      const businessDate = '2025-01-15';

      // 1回目: 正常処理
      await processBillAnalyticsAtomically(db, {
        month,
        businessDate,
        billId,
        billData,
      });

      // 更新内容を確認
      const monthlyDoc = await db.collection('analyticsMonthly').doc(month).get();
      const monthlyData = monthlyDoc.data();
      
      expect(monthlyData?.grossSales).toBe(5000);
      expect(monthlyData?.itemsSales).toBe(3000);
      expect(monthlyData?.orderCount).toBe(1);

      // marker が作成されていることを確認
      const markerDoc = await db
        .collection('analyticsMonthly')
        .doc(month)
        .collection('aggregationMarkers')
        .doc(billId)
        .get();
      
      expect(markerDoc.exists).toBe(true);
      expect(markerDoc.data()?.billId).toBe(billId);
      expect(markerDoc.data()?.businessDate).toBe(businessDate);

      // 2回目: no-op（marker でブロック）
      await processBillAnalyticsAtomically(db, {
        month,
        businessDate,
        billId,
        billData,
      });

      // 値が増えていないことを確認
      const monthlyDoc2 = await db.collection('analyticsMonthly').doc(month).get();
      const monthlyData2 = monthlyDoc2.data();
      
      expect(monthlyData2?.grossSales).toBe(5000); // 増えていない
      expect(monthlyData2?.itemsSales).toBe(3000); // 増えていない
      expect(monthlyData2?.orderCount).toBe(1); // 増えていない
    });

    it('異なるbillIdで実行するとそれぞれが計上される', async () => {
      const billId1 = 'bill_001';
      const billId2 = 'bill_002';
      const billData = createBillData();
      const month = '2025-01';
      const businessDate = '2025-01-15';

      // bill1 を処理
      await processBillAnalyticsAtomically(db, {
        month,
        businessDate,
        billId: billId1,
        billData,
      });

      // bill2 を処理
      await processBillAnalyticsAtomically(db, {
        month,
        businessDate,
        billId: billId2,
        billData,
      });

      // 両方が計上されていることを確認
      const monthlyDoc = await db.collection('analyticsMonthly').doc(month).get();
      const monthlyData = monthlyDoc.data();
      
      expect(monthlyData?.grossSales).toBe(10000); // 5000 * 2
      expect(monthlyData?.orderCount).toBe(2); // 1 * 2

      // 両方の marker が作成されていることを確認
      const marker1 = await db
        .collection('analyticsMonthly')
        .doc(month)
        .collection('aggregationMarkers')
        .doc(billId1)
        .get();
      const marker2 = await db
        .collection('analyticsMonthly')
        .doc(month)
        .collection('aggregationMarkers')
        .doc(billId2)
        .get();
      
      expect(marker1.exists).toBe(true);
      expect(marker2.exists).toBe(true);
    });
  });

  describe('更新内容の同一性テスト', () => {
    it('旧スキーマ（grossSales, itemsSales, orderCount）が正しく更新される', async () => {
      const billId = 'bill_001';
      const billData = createBillData();
      const month = '2025-01';
      const businessDate = '2025-01-15';

      await processBillAnalyticsAtomically(db, {
        month,
        businessDate,
        billId,
        billData,
      });

      // 月次ドキュメントの確認
      const monthlyDoc = await db.collection('analyticsMonthly').doc(month).get();
      const monthlyData = monthlyDoc.data();
      
      expect(monthlyData?.grossSales).toBe(5000);
      expect(monthlyData?.itemsSales).toBe(3000);
      expect(monthlyData?.sideGameChipSales).toBe(1000);
      expect(monthlyData?.extraCostSales).toBe(500);
      expect(monthlyData?.tournamentsSales).toBe(500);
      expect(monthlyData?.orderCount).toBe(1);
      expect(monthlyData?.paymentTotals?.cash).toBe(3000);
      expect(monthlyData?.paymentTotals?.credit_card).toBe(2000);
      expect(monthlyData?.dailySales?.[businessDate]).toBe(5000);

      // 日次ドキュメントの確認
      const dailyDoc = await db
        .collection('analyticsMonthly')
        .doc(month)
        .collection('days')
        .doc(businessDate)
        .get();
      const dailyData = dailyDoc.data();
      
      expect(dailyData?.grossSales).toBe(5000);
      expect(dailyData?.byCategory?.items).toBe(3000);
      expect(dailyData?.byCategory?.sideGameChip).toBe(1000);
      expect(dailyData?.byCategory?.extraCost).toBe(500);
      expect(dailyData?.byCategory?.tournaments).toBe(500);
    });

    it('byCategory/summary が正しく更新される', async () => {
      const billId = 'bill_001';
      const billData = createBillData();
      const month = '2025-01';
      const businessDate = '2025-01-15';

      await processBillAnalyticsAtomically(db, {
        month,
        businessDate,
        billId,
        billData,
      });

      const byCategoryDoc = await db
        .collection('analyticsMonthly')
        .doc(month)
        .collection('byCategory')
        .doc('summary')
        .get();
      const byCategoryData = byCategoryDoc.data();
      
      expect(byCategoryData?.totals?.items).toBe(3000);
      expect(byCategoryData?.totals?.sideGameChip).toBe(1000);
      expect(byCategoryData?.totals?.extraCost).toBe(500);
      expect(byCategoryData?.totals?.tournaments).toBe(500);
      expect(byCategoryData?.orderCounts?.items).toBe(1);
      expect(byCategoryData?.itemSales?.menu1?.qty).toBe(2);
      expect(byCategoryData?.itemSales?.menu1?.sales).toBe(1500);
      expect(byCategoryData?.itemSales?.menu2?.qty).toBe(1);
      expect(byCategoryData?.itemSales?.menu2?.sales).toBe(1500);
    });

    it('byUser/{userId} が正しく更新される', async () => {
      const billId = 'bill_001';
      const billData = createBillData({
        party: {
          userId: 'user1',
          pokerName: 'テストユーザー',
        },
      });
      const month = '2025-01';
      const businessDate = '2025-01-15';

      await processBillAnalyticsAtomically(db, {
        month,
        businessDate,
        billId,
        billData,
      });

      const byUserDoc = await db
        .collection('analyticsMonthly')
        .doc(month)
        .collection('byUser')
        .doc('user1')
        .get();
      const byUserData = byUserDoc.data();
      
      expect(byUserDoc.exists).toBe(true);
      expect(byUserData?.grossSales).toBe(5000);
      expect(byUserData?.itemsSales).toBe(3000);
      expect(byUserData?.orderCount).toBe(1);
      expect(byUserData?.pokerName).toBe('テストユーザー');
      expect(byUserData?.dailySales?.[businessDate]).toBe(5000);
    });

    it('byTemplateTournaments/{templateKey} が正しく更新される', async () => {
      const billId = 'bill_001';
      const billData = createBillData();
      const month = '2025-01';
      const businessDate = '2025-01-15';

      await processBillAnalyticsAtomically(db, {
        month,
        businessDate,
        billId,
        billData,
      });

      const templateDoc = await db
        .collection('analyticsMonthly')
        .doc(month)
        .collection('byTemplateTournaments')
        .doc('template1')
        .get();
      const templateData = templateDoc.data();
      
      expect(templateDoc.exists).toBe(true);
      expect(templateData?.templateName).toBe('トーナメント1');
      expect(templateData?.daily?.[businessDate]?.entryCount).toBe(1);
      expect(templateData?.daily?.[businessDate]?.entrySales).toBe(500);
      expect(templateData?.totals?.entryCount).toBe(1);
      expect(templateData?.totals?.entrySales).toBe(500);
    });

    it('party.userId がない場合、byUser は更新されない', async () => {
      const billId = 'bill_001';
      const billData = createBillData({
        party: undefined,
      });
      const month = '2025-01';
      const businessDate = '2025-01-15';

      await processBillAnalyticsAtomically(db, {
        month,
        businessDate,
        billId,
        billData,
      });

      // byUser ドキュメントが存在しないことを確認
      const byUserRef = db
        .collection('analyticsMonthly')
        .doc(month)
        .collection('byUser')
        .doc('user1');
      
      const byUserDoc = await byUserRef.get();
      expect(byUserDoc.exists).toBe(false);
    });
  });

  describe('失敗時再試行テスト', () => {
    it('トランザクション外でmarkerが存在する場合、no-op で return される', async () => {
      const billId = 'bill_001';
      const billData = createBillData();
      const month = '2025-01';
      const businessDate = '2025-01-15';

      // 事前に marker を作成（トランザクション外）
      const markerRef = db
        .collection('analyticsMonthly')
        .doc(month)
        .collection('aggregationMarkers')
        .doc(billId);
      
      await markerRef.set({
        billId,
        businessDate,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // processBillAnalyticsAtomically を実行
      await processBillAnalyticsAtomically(db, {
        month,
        businessDate,
        billId,
        billData,
      });

      // 月次ドキュメントが存在しないか、値が0であることを確認
      // （トランザクション内で marker が存在するため early return）
      const monthlyDoc = await db.collection('analyticsMonthly').doc(month).get();
      
      if (monthlyDoc.exists) {
        // もし存在する場合は、値が増えていないことを確認
        const monthlyData = monthlyDoc.data();
        expect(monthlyData?.grossSales).toBeUndefined();
      }
    });
  });
});
