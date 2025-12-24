/**
 * bills.onSettle トリガの統合テスト
 * 
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - settling -> settled 遷移で発火
 * - snapshot生成（amounts/categoryBreakdown/itemsSnapshot/tournamentsSnapshot/paymentTotals/paymentsSummary/postEvents/closedAt/meta.contentHash）
 * - contentHash一致で完全no-op（updatedAt/closedAt不変）
 * - /payments 有り/無し両ケース
 * - ENABLE_SETTLEMENT_AGGREGATOR=true/false で enqueue 呼び分け（spy）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { billsOnSettle } from '../../src/triggers/bills.onSettle';

describe('bills.onSettle', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-bills-onsettle';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    
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

  // テスト用ヘルパ: 最小構成のbillを作成
  async function createBillWithSubcollections(
    billId: string,
    status: string = 'settling',
    options: {
      items?: Array<{ totalPriceIncl?: number; unitPriceIncl?: number; quantity?: number; menuItemId?: string; name?: string; category?: string }>;
      extras?: Array<{ amountIncl: number }>;
      sideGameChips?: Array<{ action: string; amountIncl: number }>;
      tournaments?: Array<{ entryFeeIncl: number; entryCount: number; reentryFeeIncl?: number; reentryCount?: number; addonFeeIncl?: number; addonCount?: number; templateId?: string; templateName?: string }>;
      payments?: Array<{ method?: string; amountIncl: number }>;
      metaPaymentMethodsByCategory?: Record<string, any>;
      ops?: { accountingStartedAt?: admin.firestore.Timestamp };
    } = {}
  ) {
    const billRef = db.collection('bills').doc(billId);
    const now = admin.firestore.Timestamp.now();

    // 親docを作成
    const billData: any = {
      status,
      businessDate: '2025-01-15',
      party: {
        userId: 'user1',
        pokerName: 'テストユーザー',
      },
      ops: {
        accountingStartedAt: options.ops?.accountingStartedAt || now,
        accountingStartedBy: 'admin1',
      },
      createdAt: now,
      updatedAt: now,
    };
    if (options.metaPaymentMethodsByCategory !== undefined) {
      billData.meta = {
        paymentMethodsByCategory: options.metaPaymentMethodsByCategory,
      };
    }
    await billRef.set(billData);

    // サブコレクションを作成
    if (options.items) {
      for (let i = 0; i < options.items.length; i++) {
        const item = options.items[i];
        const itemData: any = {
          menuItemId: item.menuItemId || `menu${i}`,
          name: item.name || `商品${i}`,
          category: item.category || `カテゴリ${i}`,
          quantity: item.quantity || 1,
        };
        if (item.totalPriceIncl !== undefined) {
          itemData.totalPriceIncl = item.totalPriceIncl;
        }
        if (item.unitPriceIncl !== undefined) {
          itemData.unitPriceIncl = item.unitPriceIncl;
        }
        await billRef.collection('items').doc(`item${i}`).set(itemData);
      }
    }

    if (options.extras) {
      for (let i = 0; i < options.extras.length; i++) {
        await billRef.collection('extras').doc(`extra${i}`).set(options.extras[i]);
      }
    }

    if (options.sideGameChips) {
      for (let i = 0; i < options.sideGameChips.length; i++) {
        await billRef.collection('sideGameChips').doc(`chip${i}`).set(options.sideGameChips[i]);
      }
    }

    if (options.tournaments) {
      for (let i = 0; i < options.tournaments.length; i++) {
        const tournament = options.tournaments[i];
        await billRef.collection('tournaments').doc(`tournament${i}`).set({
          templateId: tournament.templateId || `template${i}`,
          templateName: tournament.templateName || `トーナメント${i}`,
          entryFeeIncl: tournament.entryFeeIncl,
          entryCount: tournament.entryCount,
          reentryFeeIncl: tournament.reentryFeeIncl || 0,
          reentryCount: tournament.reentryCount || 0,
          addonFeeIncl: tournament.addonFeeIncl || 0,
          addonCount: tournament.addonCount || 0,
        });
      }
    }

    if (options.payments) {
      for (let i = 0; i < options.payments.length; i++) {
        await billRef.collection('payments').doc(`payment${i}`).set(options.payments[i]);
      }
    }

    return billRef;
  }

  // トリガを手動で発火させるヘルパ
  async function triggerSettle(billId: string, beforeStatus: string, afterStatus: string) {
    const billRef = db.collection('bills').doc(billId);
    const beforeDoc = await billRef.get();
    const beforeData = beforeDoc.data()!;

    // afterStatus に更新
    await billRef.update({ status: afterStatus });

    const afterDoc = await billRef.get();
    const afterData = afterDoc.data()!;

    // モックイベントを作成
    const mockEvent = {
      data: {
        before: {
          data: () => ({ ...beforeData, status: beforeStatus }),
          ref: billRef,
          exists: true,
        },
        after: {
          data: () => afterData,
          ref: billRef,
          exists: true,
        },
      },
      params: {
        billId,
      },
    };

    // v2のonDocumentUpdatedのハンドラを直接呼び出す
    await (billsOnSettle as any).run(mockEvent);
  }

  describe('発火条件の厳密性（誤発火防止）', () => {
    it('settling -> settled で実行される', async () => {
      const billId = 'bill_settle_001';
      await createBillWithSubcollections(billId, 'settling', {
        items: [{ totalPriceIncl: 1000 }],
      });

      await triggerSettle(billId, 'settling', 'settled');

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;

      // スナップショットが生成されていることを確認
      expect(billData.meta?.contentHash).toBeDefined();
      expect(billData.closedAt).toBeDefined();
      expect(billData.amounts?.grandTotalRounded).toBe(1000);
    });

    it('open -> settled では実行される（実装では before.status !== settled && after.status === settled で発火）', async () => {
      const billId = 'bill_open_settled_001';
      await createBillWithSubcollections(billId, 'open', {
        items: [{ totalPriceIncl: 1000 }],
      });

      await triggerSettle(billId, 'open', 'settled');

      const afterDoc = await db.collection('bills').doc(billId).get();
      const afterData = afterDoc.data()!;

      // 実装では before.status !== 'settled' && after.status === 'settled' で発火するため、
      // open -> settled でもスナップショットが生成される
      expect(afterData.meta?.contentHash).toBeDefined();
      expect(afterData.closedAt).toBeDefined();
      expect(afterData.status).toBe('settled');
    });

    it('settling -> settling（変更なし）では実行されない（no-op）', async () => {
      const billId = 'bill_settling_nochange_001';
      await createBillWithSubcollections(billId, 'settling', {
        items: [{ totalPriceIncl: 1000 }],
      });

      const beforeDoc = await db.collection('bills').doc(billId).get();
      const beforeData = beforeDoc.data()!;

      // status を settling のまま（変更なし）でトリガを発火
      const billRef = db.collection('bills').doc(billId);
      const mockEvent = {
        data: {
          before: {
            data: () => beforeData,
            ref: billRef,
            exists: true,
          },
          after: {
            data: () => beforeData,
            ref: billRef,
            exists: true,
          },
        },
        params: {
          billId,
        },
      };

      await (billsOnSettle as any).run(mockEvent);

      const afterDoc = await db.collection('bills').doc(billId).get();
      const afterData = afterDoc.data()!;

      // スナップショットが生成されていない
      expect(afterData.meta?.contentHash).toBeUndefined();
    });

    it('settled -> settled も no-op', async () => {
      const billId = 'bill_settled_settled_001';
      await createBillWithSubcollections(billId, 'settling', {
        items: [{ totalPriceIncl: 1000 }],
      });

      // 1回目: settling -> settled
      await triggerSettle(billId, 'settling', 'settled');

      const firstDoc = await db.collection('bills').doc(billId).get();
      const firstData = firstDoc.data()!;
      const firstContentHash = firstData.meta?.contentHash;
      const firstUpdatedAt = firstData.updatedAt;
      const firstClosedAt = firstData.closedAt;

      // 2回目: settled -> settled（status 変更なし）
      const billRef = db.collection('bills').doc(billId);
      const mockEvent = {
        data: {
          before: {
            data: () => firstData,
            ref: billRef,
            exists: true,
          },
          after: {
            data: () => firstData, // status は settled のまま
            ref: billRef,
            exists: true,
          },
        },
        params: {
          billId,
        },
      };

      await (billsOnSettle as any).run(mockEvent);

      const secondDoc = await db.collection('bills').doc(billId).get();
      const secondData = secondDoc.data()!;

      // スナップショットが生成されていない（before.status === 'settled' のため）
      expect(secondData.meta?.contentHash).toBe(firstContentHash);
      expect(secondData.updatedAt).toEqual(firstUpdatedAt);
      expect(secondData.closedAt).toEqual(firstClosedAt);
    });

    it('settling -> cancelled など別status遷移は no-op', async () => {
      const billId = 'bill_settling_cancelled_001';
      await createBillWithSubcollections(billId, 'settling', {
        items: [{ totalPriceIncl: 1000 }],
      });

      await triggerSettle(billId, 'settling', 'cancelled');

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;

      // スナップショットが生成されていない（after.status !== 'settled' のため）
      expect(billData.meta?.contentHash).toBeUndefined();
    });
  });

  describe('スナップショット生成の中身検証（数値の期待値）', () => {
    it('items/extras/sideGameChips/tournaments から正しく計算されること', async () => {
      const billId = 'bill_snapshot_001';
      await createBillWithSubcollections(billId, 'settling', {
        items: [
          { totalPriceIncl: 1000, menuItemId: 'menu1', name: '商品1', category: 'カテゴリ1' },
          { unitPriceIncl: 500, quantity: 2, menuItemId: 'menu2', name: '商品2', category: 'カテゴリ2' },
        ],
        extras: [{ amountIncl: 300 }],
        sideGameChips: [
          { action: 'purchase', amountIncl: 200 },
          { action: 'deposit', amountIncl: 100 }, // 無視される
        ],
        tournaments: [
          {
            entryFeeIncl: 400,
            entryCount: 1,
            reentryFeeIncl: 200,
            reentryCount: 1,
            addonFeeIncl: 100,
            addonCount: 1,
            templateId: 'template1',
            templateName: 'トーナメント1',
          },
        ],
      });

      await triggerSettle(billId, 'settling', 'settled');

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;

      // amounts の検証
      // items: 1000 + 500*2 = 2000
      // extras: 300
      // subTotalIncl: 2300
      // sideGameChips (purchase only): 200
      // tournaments: 400*1 + 200*1 + 100*1 = 700
      // grandTotalIncl: 2300 + 200 + 700 = 3200
      expect(billData.amounts?.subTotalIncl).toBe(2300);
      expect(billData.amounts?.grandTotalIncl).toBe(3200);
      expect(billData.amounts?.grandTotalRounded).toBe(3200);

      // categoryBreakdown の検証
      expect(billData.categoryBreakdown?.items).toBe(2000);
      expect(billData.categoryBreakdown?.extraCost).toBe(300);
      expect(billData.categoryBreakdown?.sideGameChips).toBe(200); // purchase のみ
      expect(billData.categoryBreakdown?.tournaments).toBe(700);

      // itemsSnapshot の検証
      expect(billData.itemsSnapshot?.menu1).toBeDefined();
      expect(billData.itemsSnapshot?.menu1.salesIncl).toBe(1000);
      expect(billData.itemsSnapshot?.menu2).toBeDefined();
      expect(billData.itemsSnapshot?.menu2.salesIncl).toBe(1000); // 500*2

      // tournamentsSnapshot の検証
      expect(billData.tournamentsSnapshot?.template1).toBeDefined();
      expect(billData.tournamentsSnapshot?.template1.entryCount).toBe(1);
      expect(billData.tournamentsSnapshot?.template1.totalTournamentSalesIncl).toBe(700);

      // paymentsSummary の検証（paymentTotals が空の場合）
      expect(billData.paymentsSummary?.paidTotalIncl).toBe(0);
      expect(billData.paymentsSummary?.balanceDueIncl).toBe(3200);

      // postEvents の初期化
      expect(billData.postEvents?.totalRefundedIncl).toBe(0);
      expect(billData.postEvents?.totalAdjustmentsIncl).toBe(0);
      expect(billData.postEvents?.netSalesIncl).toBe(3200);

      // closedAt の設定
      expect(billData.closedAt).toBeDefined();

      // contentHash の生成
      expect(billData.meta?.contentHash).toBeDefined();
    });

    it('amounts と categoryBreakdown の整合性チェック', async () => {
      const billId = 'bill_integrity_001';
      await createBillWithSubcollections(billId, 'settling', {
        items: [
          { totalPriceIncl: 1000, menuItemId: 'menu1' },
          { unitPriceIncl: 500, quantity: 2, menuItemId: 'menu2' },
        ],
        extras: [{ amountIncl: 300 }],
        sideGameChips: [
          { action: 'purchase', amountIncl: 200 },
        ],
        tournaments: [
          {
            entryFeeIncl: 400,
            entryCount: 1,
            reentryFeeIncl: 200,
            reentryCount: 1,
            addonFeeIncl: 100,
            addonCount: 1,
            templateId: 'template1',
          },
        ],
      });

      await triggerSettle(billId, 'settling', 'settled');

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;

      // subTotalIncl = items + extraCost
      const expectedSubTotal = 
        (billData.categoryBreakdown?.items || 0) +
        (billData.categoryBreakdown?.extraCost || 0);

      expect(billData.amounts?.subTotalIncl).toBe(expectedSubTotal);

      // grandTotalIncl = subTotalIncl + sideGameChips + tournaments
      const expectedGrandTotal = 
        expectedSubTotal +
        (billData.categoryBreakdown?.sideGameChips || 0) +
        (billData.categoryBreakdown?.tournaments || 0);

      expect(billData.amounts?.grandTotalIncl).toBe(expectedGrandTotal);
    });
  });

  describe('contentHash no-op の厳密性', () => {
    it('同一 bill で2回目の settled 反映で完全 no-op（updatedAt/closedAt不変）', async () => {
      const billId = 'bill_noop_001';
      await createBillWithSubcollections(billId, 'settling', {
        items: [{ totalPriceIncl: 1000 }],
      });

      // 1回目: settling -> settled
      await triggerSettle(billId, 'settling', 'settled');

      const firstDoc = await db.collection('bills').doc(billId).get();
      const firstData = firstDoc.data()!;
      const firstContentHash = firstData.meta?.contentHash;
      const firstUpdatedAt = firstData.updatedAt;
      const firstClosedAt = firstData.closedAt;

      // 2回目: 同じ内容で再度トリガを発火（status を settled のまま）
      const billRef = db.collection('bills').doc(billId);
      const mockEvent = {
        data: {
          before: {
            data: () => ({ ...firstData, status: 'settling' }),
            ref: billRef,
            exists: true,
          },
          after: {
            data: () => firstData, // status は settled のまま
            ref: billRef,
            exists: true,
          },
        },
        params: {
          billId,
        },
      };

      await (billsOnSettle as any).run(mockEvent);

      const secondDoc = await db.collection('bills').doc(billId).get();
      const secondData = secondDoc.data()!;

      // contentHash が一致するため、完全 no-op
      expect(secondData.meta?.contentHash).toBe(firstContentHash);
      // updatedAt と closedAt が不変（ただし、Firestore の仕様上、update が呼ばれないため実際には変わらない）
      // 実際の実装では、contentHash 一致時は return するため、update は呼ばれない
      expect(secondData.updatedAt).toEqual(firstUpdatedAt);
      expect(secondData.closedAt).toEqual(firstClosedAt);

      // snapshot各フィールドも書き換わっていない（最低限1〜2フィールドを比較）
      expect(secondData.amounts?.grandTotalRounded).toBe(firstData.amounts?.grandTotalRounded);
      expect(secondData.categoryBreakdown?.items).toBe(firstData.categoryBreakdown?.items);
      expect(secondData.paymentTotals).toEqual(firstData.paymentTotals);
    });
  });

  describe('/payments 有り/無しの分岐', () => {
    it('payments 有り: paymentTotals が payments 由来', async () => {
      const billId = 'bill_payments_001';
      await createBillWithSubcollections(billId, 'settling', {
        items: [{ totalPriceIncl: 1000 }],
        payments: [
          { method: 'cash', amountIncl: 500 },
          { method: 'credit_card', amountIncl: 500 },
        ],
        metaPaymentMethodsByCategory: {
          items: 'electronic_money', // これは無視される（payments が優先）
        },
      });

      await triggerSettle(billId, 'settling', 'settled');

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;

      // payments から計算された paymentTotals
      expect(billData.paymentTotals?.cash).toBe(500);
      expect(billData.paymentTotals?.credit_card).toBe(500);
      expect(billData.paymentTotals?.electronic_money).toBeUndefined();

      // paymentsSummary
      expect(billData.paymentsSummary?.paidTotalIncl).toBe(1000);
      expect(billData.paymentsSummary?.balanceDueIncl).toBe(0); // 1000 - 1000
    });

    it('payments 無し: meta.paymentMethodsByCategory + categoryBreakdown 由来', async () => {
      const billId = 'bill_meta_001';
      await createBillWithSubcollections(billId, 'settling', {
        items: [{ totalPriceIncl: 1000 }],
        extras: [{ amountIncl: 500 }],
        metaPaymentMethodsByCategory: {
          items: 'cash',
          extraCost: 'credit_card',
        },
      });

      await triggerSettle(billId, 'settling', 'settled');

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;

      // meta.paymentMethodsByCategory から計算された paymentTotals
      expect(billData.paymentTotals?.cash).toBe(1000);
      expect(billData.paymentTotals?.credit_card).toBe(500);

      // paymentsSummary
      expect(billData.paymentsSummary?.paidTotalIncl).toBe(1500);
      expect(billData.paymentsSummary?.balanceDueIncl).toBe(0); // 1500 - 1500
    });

    it('meta に invalid method があれば cash へ寄ることも統合側で検証', async () => {
      const billId = 'bill_invalid_method_001';
      await createBillWithSubcollections(billId, 'settling', {
        items: [{ totalPriceIncl: 1000 }],
        extras: [{ amountIncl: 500 }],
        metaPaymentMethodsByCategory: {
          items: 'invalid_method', // 無効method
          extraCost: 'cash',
        },
      });

      await triggerSettle(billId, 'settling', 'settled');

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;

      // invalid_method は cash に寄せられる
      expect(billData.paymentTotals?.cash).toBe(1500); // 1000 + 500
      expect(billData.paymentTotals?.invalid_method).toBeUndefined();
    });

    it('/payments と meta.paymentMethodsByCategory が同時存在する場合、/payments が優先される', async () => {
      const billId = 'bill_payments_meta_both_001';
      await createBillWithSubcollections(billId, 'settling', {
        items: [{ totalPriceIncl: 1000 }],
        extras: [{ amountIncl: 500 }],
        payments: [
          { method: 'credit_card', amountIncl: 1000 },
          { method: 'cash', amountIncl: 500 },
        ],
        metaPaymentMethodsByCategory: {
          items: 'cash',
          extraCost: 'weird_method', // 無効method（/payments が優先されるため無視される）
        },
      });

      await triggerSettle(billId, 'settling', 'settled');

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;

      // /payments が優先される（meta は無視される）
      expect(billData.paymentTotals?.credit_card).toBe(1000);
      expect(billData.paymentTotals?.cash).toBe(500);
      // meta 側の weird_method は無視される（/payments があるため）
      expect(billData.paymentTotals?.weird_method).toBeUndefined();

      // paymentsSummary
      expect(billData.paymentsSummary?.paidTotalIncl).toBe(1500); // 1000 + 500
      expect(billData.paymentsSummary?.balanceDueIncl).toBe(0); // 1500 - 1500
    });

    it('/payments と meta が同時存在し、/payments 内に method 未指定がある場合は cash 扱い', async () => {
      const billId = 'bill_payments_meta_method_undefined_001';
      await createBillWithSubcollections(billId, 'settling', {
        items: [{ totalPriceIncl: 1000 }],
        payments: [
          { method: 'credit_card', amountIncl: 500 },
          { amountIncl: 500 }, // method 未指定 → cash 扱い
        ],
        metaPaymentMethodsByCategory: {
          items: 'electronic_money', // /payments が優先されるため無視される
        },
      });

      await triggerSettle(billId, 'settling', 'settled');

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;

      // /payments が優先される
      expect(billData.paymentTotals?.credit_card).toBe(500);
      // method 未指定は cash 扱い
      expect(billData.paymentTotals?.cash).toBe(500);
      // meta 側の electronic_money は無視される
      expect(billData.paymentTotals?.electronic_money).toBeUndefined();
    });
  });

  describe('ENABLE_SETTLEMENT_AGGREGATOR の enqueue 分岐', () => {
    it('ENABLE_SETTLEMENT_AGGREGATOR=true の場合、enqueueSettlement が呼ばれる', async () => {
      const originalEnv = process.env.ENABLE_SETTLEMENT_AGGREGATOR;
      process.env.ENABLE_SETTLEMENT_AGGREGATOR = 'true';

      // 動的 import を spy するため、モジュールを事前に読み込む
      const aggregatorModule = await import('../../src/analytics/aggregator');
      const enqueueSettlementSpy = jest.spyOn(aggregatorModule, 'enqueueSettlement').mockImplementation(async () => {
        // 実際の処理は実行しない（spy のみ）
      });

      const billId = 'bill_enqueue_001';
      await createBillWithSubcollections(billId, 'settling', {
        items: [{ totalPriceIncl: 1000 }],
      });

      await triggerSettle(billId, 'settling', 'settled');

      // enqueueSettlement が呼ばれたことを確認
      expect(enqueueSettlementSpy).toHaveBeenCalledTimes(1);
      const callArgs = enqueueSettlementSpy.mock.calls[0][0];
      expect(callArgs.billId).toBe(billId);
      expect(callArgs.businessDate).toBe('2025-01-15');

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;

      // スナップショットが正しく生成されることを確認
      expect(billData.meta?.contentHash).toBeDefined();

      enqueueSettlementSpy.mockRestore();

      // 環境変数を元に戻す
      if (originalEnv) {
        process.env.ENABLE_SETTLEMENT_AGGREGATOR = originalEnv;
      } else {
        delete process.env.ENABLE_SETTLEMENT_AGGREGATOR;
      }
    });

    it('ENABLE_SETTLEMENT_AGGREGATOR=false の場合、enqueueSettlement が呼ばれない', async () => {
      const originalEnv = process.env.ENABLE_SETTLEMENT_AGGREGATOR;
      process.env.ENABLE_SETTLEMENT_AGGREGATOR = 'false';

      // 動的 import を spy するため、モジュールを事前に読み込む
      const aggregatorModule = await import('../../src/analytics/aggregator');
      const enqueueSettlementSpy = jest.spyOn(aggregatorModule, 'enqueueSettlement').mockImplementation(async () => {
        // 実際の処理は実行しない（spy のみ）
      });

      const billId = 'bill_no_enqueue_001';
      await createBillWithSubcollections(billId, 'settling', {
        items: [{ totalPriceIncl: 1000 }],
      });

      await triggerSettle(billId, 'settling', 'settled');

      // enqueueSettlement が呼ばれていないことを確認
      expect(enqueueSettlementSpy).not.toHaveBeenCalled();

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;

      // スナップショットは生成される
      expect(billData.meta?.contentHash).toBeDefined();

      enqueueSettlementSpy.mockRestore();

      // 環境変数を元に戻す
      if (originalEnv) {
        process.env.ENABLE_SETTLEMENT_AGGREGATOR = originalEnv;
      } else {
        delete process.env.ENABLE_SETTLEMENT_AGGREGATOR;
      }
    });
  });

  describe('サイドゲームチップ（重要な注意点）', () => {
    it('withdraw が paymentTotals に混入しないこと', async () => {
      const billId = 'bill_chip_withdraw_001';
      await createBillWithSubcollections(billId, 'settling', {
        items: [{ totalPriceIncl: 1000 }],
        sideGameChips: [
          { action: 'purchase', amountIncl: 500 },
          { action: 'withdraw', amountIncl: 300 }, // withdraw は paymentTotals に含まれない
          { action: 'deposit', amountIncl: 200 },
        ],
        metaPaymentMethodsByCategory: {
          items: 'cash',
        },
      });

      await triggerSettle(billId, 'settling', 'settled');

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;

      // categoryBreakdown の sideGameChips は purchase のみ（500）
      expect(billData.categoryBreakdown?.sideGameChips).toBe(500);

      // paymentTotals は meta.paymentMethodsByCategory から計算される（withdraw は含まれない）
      expect(billData.paymentTotals?.cash).toBe(1000); // items のみ
      // withdraw の 300 は paymentTotals に含まれない
      expect(billData.paymentTotals?.sideGameChip).toBeUndefined();

      // sideGameChipsSummary の検証
      expect(billData.sideGameChipsSummary?.purchased).toBe(500);
      expect(billData.sideGameChipsSummary?.withdrawn).toBe(300);
      expect(billData.sideGameChipsSummary?.deposited).toBe(200);
      expect(billData.sideGameChipsSummary?.net).toBe(400); // 500 + 200 - 300
    });

    it('sideGameChip が支払い手段として使用された場合、paymentTotals に含まれる', async () => {
      const billId = 'bill_chip_payment_001';
      await createBillWithSubcollections(billId, 'settling', {
        items: [{ totalPriceIncl: 1000 }],
        sideGameChips: [
          { action: 'purchase', amountIncl: 500 },
        ],
        metaPaymentMethodsByCategory: {
          items: 'sideGameChip', // sideGameChip を支払い手段として使用
        },
      });

      await triggerSettle(billId, 'settling', 'settled');

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;

      // paymentTotals に sideGameChip が含まれる（支払い手段として）
      expect(billData.paymentTotals?.sideGameChip).toBe(1000); // items の金額
    });

    it('/payments 経由で sideGameChip が支払い手段として使われた場合、paymentTotals に含まれる（単位は円）', async () => {
      const billId = 'bill_chip_payment_payments_001';
      await createBillWithSubcollections(billId, 'settling', {
        items: [{ totalPriceIncl: 1000 }],
        sideGameChips: [
          { action: 'purchase', amountIncl: 500 },
        ],
        payments: [
          { method: 'sideGameChip', amountIncl: 1000 }, // /payments 経由で sideGameChip を支払い手段として使用
        ],
      });

      await triggerSettle(billId, 'settling', 'settled');

      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;

      // paymentTotals に sideGameChip が含まれる（/payments から計算）
      expect(billData.paymentTotals?.sideGameChip).toBe(1000); // 円として合算
      // 単位が円であることを assert
      expect(billData.paymentTotals?.sideGameChip).toBe(1000); // 枚数ではない
    });
  });
});
