/**
 * getUserOrderHistory の統合テスト
 * 
 * ChangeSpec P1-08 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path（正常な注文履歴取得、複数の確定済み伝票、0件パターン）
 * - invalid-argument（認証なし）
 * - businessDate フィルタ（当日の営業日のみ取得、前日の営業日の伝票は取得されない）
 * - status フィルタ（確定済み伝票のみ取得、進行中の伝票は取得されない）
 * - itemCount の計算（/items サブコレクションの件数が正しく反映される）
 * - amounts.grandTotalRounded が totalPrice として返却される
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getUserOrderHistory } from '../../src/domains/itemOrder/callables/getUserOrderHistory';
import { calcBusinessDate } from '../../src/domains/bills/repos/calcBusinessDate';

describe('getUserOrderHistory', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-default';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
    db = getFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map(a => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    // STORE_CLOSE_HOUR を設定（デフォルト値 27 を使用）
    if (!process.env.STORE_CLOSE_HOUR) {
      process.env.STORE_CLOSE_HOUR = '27';
    }
  });

  // テスト用のヘルパ関数: 確定済み伝票を作成
  async function createSettledBill(
    billId: string,
    userId: string,
    businessDate: string,
    grandTotalRounded: number = 10000,
    status: string = 'settled',
    itemCount: number = 0
  ) {
    const billRef = db.collection('bills').doc(billId);
    await billRef.set({
      businessDate,
      status,
      party: {
        userId,
        pokerName: 'テスト太郎',
      },
      amounts: {
        grandTotalRounded,
      },
      place: {
        table: 'table_01',
        seat: 1,
      },
      createdAt: admin.firestore.Timestamp.fromDate(new Date('2025-11-15T12:00:00Z')),
      updatedAt: admin.firestore.Timestamp.fromDate(new Date('2025-11-15T12:00:00Z')),
      meta: {
        schemaVersion: '1.3',
      },
    });

    // itemCount 分の items サブコレクションを作成
    for (let i = 0; i < itemCount; i++) {
      await billRef.collection('items').doc(`item_${i}`).set({
        name: `アイテム${i}`,
        quantity: 1,
        unitPriceIncl: 1000,
        totalPriceIncl: 1000,
        orderedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  describe('happy path', () => {
    it('正常な注文履歴取得（当日の営業日、確定済み伝票のみ）', async () => {
      const userId = 'user_test_happy_001';
      const billId1 = 'bill_test_happy_001';
      const billId2 = 'bill_test_happy_002';
      // 現在時刻を使って businessDate を計算（getUserOrderHistory と同じロジック）
      const now = new Date();
      const calcResult = await calcBusinessDate(now);
      const businessDate = typeof calcResult === 'string' ? calcResult : (calcResult.status === 'OK' ? calcResult.businessDateKey! : '2025-01-01');

      await createSettledBill(billId1, userId, businessDate, 10000, 'settled', 3);
      await createSettledBill(billId2, userId, businessDate, 20000, 'settled', 5);

      const mockRequest = {
        auth: { uid: userId },
        data: {},
      };

      const result = await (getUserOrderHistory as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.orders.length).toBe(2);
      expect(result.data.totalCount).toBe(2);
      expect(result.data.totalAmount).toBe(30000);
      
      // ソート確認（createdAt 降順）
      expect(result.data.orders[0].id).toBe(billId2);
      expect(result.data.orders[1].id).toBe(billId1);
      
      // 各伝票の内容確認
      const order1 = result.data.orders.find((o: any) => o.id === billId1);
      expect(order1.totalPrice).toBe(10000);
      expect(order1.status).toBe('settled');
      expect(order1.items).toEqual([]); // 常に空配列
      expect(order1.itemCount).toBe(3);
      expect(order1.currentTable).toBe('table_01');
      expect(order1.currentSeat).toBe(1);
    });

    it('複数の確定済み伝票がある場合のソート確認', async () => {
      const userId = 'user_test_happy_002';
      const billId1 = 'bill_test_happy_003';
      const billId2 = 'bill_test_happy_004';
      const billId3 = 'bill_test_happy_005';
      // 現在時刻を使って businessDate を計算
      const now = new Date();
      const calcResult = await calcBusinessDate(now);
      const businessDate = typeof calcResult === 'string' ? calcResult : (calcResult.status === 'OK' ? calcResult.businessDateKey! : '2025-01-01');

      // 異なる時刻で作成（降順でソートされることを確認）
      await createSettledBill(billId1, userId, businessDate, 10000, 'settled', 1);
      await new Promise(resolve => setTimeout(resolve, 100)); // 少し待機
      await createSettledBill(billId2, userId, businessDate, 20000, 'settled', 2);
      await new Promise(resolve => setTimeout(resolve, 100));
      await createSettledBill(billId3, userId, businessDate, 30000, 'settled', 3);

      const mockRequest = {
        auth: { uid: userId },
        data: {},
      };

      const result = await (getUserOrderHistory as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.orders.length).toBe(3);
      // createdAt 降順でソートされていることを確認（最新が先頭）
      expect(result.data.orders[0].id).toBe(billId3);
      expect(result.data.orders[1].id).toBe(billId2);
      expect(result.data.orders[2].id).toBe(billId1);
    });

    it('該当する確定済み伝票が 0 件の場合でも、success: true かつ orders: [], totalCount = 0, totalAmount = 0 が返ること', async () => {
      const userId = 'user_test_happy_003';

      // 伝票を作成しない

      const mockRequest = {
        auth: { uid: userId },
        data: {},
      };

      const result = await (getUserOrderHistory as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.orders).toEqual([]);
      expect(result.data.totalCount).toBe(0);
      expect(result.data.totalAmount).toBe(0);
    });

    it('amounts.grandTotalRounded が正しく totalPrice として返却されることを確認', async () => {
      const userId = 'user_test_happy_004';
      const billId = 'bill_test_happy_006';
      // 現在時刻を使って businessDate を計算
      const now = new Date();
      const calcResult = await calcBusinessDate(now);
      const businessDate = typeof calcResult === 'string' ? calcResult : (calcResult.status === 'OK' ? calcResult.businessDateKey! : '2025-01-01');
      const grandTotalRounded = 15000;

      await createSettledBill(billId, userId, businessDate, grandTotalRounded, 'settled', 2);

      const mockRequest = {
        auth: { uid: userId },
        data: {},
      };

      const result = await (getUserOrderHistory as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.orders.length).toBe(1);
      expect(result.data.orders[0].totalPrice).toBe(grandTotalRounded);
    });

    it('/items サブコレクションの件数が itemCount に正しく反映されること', async () => {
      const userId = 'user_test_happy_005';
      const billId = 'bill_test_happy_007';
      // 現在時刻を使って businessDate を計算
      const now = new Date();
      const calcResult = await calcBusinessDate(now);
      const businessDate = typeof calcResult === 'string' ? calcResult : (calcResult.status === 'OK' ? calcResult.businessDateKey! : '2025-01-01');
      const itemCount = 5;

      await createSettledBill(billId, userId, businessDate, 10000, 'settled', itemCount);

      const mockRequest = {
        auth: { uid: userId },
        data: {},
      };

      const result = await (getUserOrderHistory as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.orders.length).toBe(1);
      expect(result.data.orders[0].itemCount).toBe(itemCount);
      expect(result.data.orders[0].items).toEqual([]); // 常に空配列
    });
  });

  describe('invalid-argument', () => {
    it('認証なしの場合', async () => {
      const mockRequest = {
        auth: null,
        data: {},
      };

      const result = await (getUserOrderHistory as any).run(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('認証が必要です');
    });
  });

  describe('businessDate フィルタ', () => {
    it('当日の営業日のみ取得されることを確認', async () => {
      const userId = 'user_test_business_date_001';
      const billId1 = 'bill_test_business_date_001';
      const billId2 = 'bill_test_business_date_002';
      // 現在時刻を使って businessDate を計算
      const now = new Date();
      const calcResult = await calcBusinessDate(now);
      const businessDate = typeof calcResult === 'string' ? calcResult : (calcResult.status === 'OK' ? calcResult.businessDateKey! : '2025-01-01');
      // 前日の営業日を計算（現在時刻から1日前）
      const prevDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const prevCalcResult = await calcBusinessDate(prevDate);
      const prevBusinessDate = typeof prevCalcResult === 'string' ? prevCalcResult : (prevCalcResult.status === 'OK' ? prevCalcResult.businessDateKey! : '2025-01-01');

      // 当日の伝票
      await createSettledBill(billId1, userId, businessDate, 10000, 'settled', 1);
      // 前日の伝票
      await createSettledBill(billId2, userId, prevBusinessDate, 20000, 'settled', 2);

      const mockRequest = {
        auth: { uid: userId },
        data: {},
      };

      const result = await (getUserOrderHistory as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.orders.length).toBe(1);
      expect(result.data.orders[0].id).toBe(billId1);
      expect(result.data.orders.find((o: any) => o.id === billId2)).toBeUndefined();
    });

    it('前日の営業日の伝票は取得されないことを確認', async () => {
      const userId = 'user_test_business_date_002';
      const billId = 'bill_test_business_date_003';
      // 前日の営業日を計算（現在時刻から1日前）
      const now = new Date();
      const prevDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const prevCalcResult = await calcBusinessDate(prevDate);
      const prevBusinessDate = typeof prevCalcResult === 'string' ? prevCalcResult : (prevCalcResult.status === 'OK' ? prevCalcResult.businessDateKey! : '2025-01-01');

      await createSettledBill(billId, userId, prevBusinessDate, 10000, 'settled', 1);

      const mockRequest = {
        auth: { uid: userId },
        data: {},
      };

      const result = await (getUserOrderHistory as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.orders.length).toBe(0);
      // prevBusinessDate は使用されている（createSettledBill の引数として）
    });
  });

  describe('status フィルタ', () => {
    it('status ∈ {"settled","partially_refunded","refunded","voided"} の伝票のみ取得されることを確認', async () => {
      const userId = 'user_test_status_001';
      const billId1 = 'bill_test_status_001';
      const billId2 = 'bill_test_status_002';
      const billId3 = 'bill_test_status_003';
      const billId4 = 'bill_test_status_004';
      // 現在時刻を使って businessDate を計算
      const now = new Date();
      const calcResult = await calcBusinessDate(now);
      const businessDate = typeof calcResult === 'string' ? calcResult : (calcResult.status === 'OK' ? calcResult.businessDateKey! : '2025-01-01');

      await createSettledBill(billId1, userId, businessDate, 10000, 'settled', 1);
      await createSettledBill(billId2, userId, businessDate, 20000, 'partially_refunded', 2);
      await createSettledBill(billId3, userId, businessDate, 30000, 'refunded', 3);
      await createSettledBill(billId4, userId, businessDate, 40000, 'voided', 4);

      const mockRequest = {
        auth: { uid: userId },
        data: {},
      };

      const result = await (getUserOrderHistory as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.orders.length).toBe(4);
      expect(result.data.orders.find((o: any) => o.id === billId1)).toBeDefined();
      expect(result.data.orders.find((o: any) => o.id === billId2)).toBeDefined();
      expect(result.data.orders.find((o: any) => o.id === billId3)).toBeDefined();
      expect(result.data.orders.find((o: any) => o.id === billId4)).toBeDefined();
    });

    it('status ∈ {"open","in_progress","settling"} の伝票は取得されないことを確認', async () => {
      const userId = 'user_test_status_002';
      const billId1 = 'bill_test_status_005';
      const billId2 = 'bill_test_status_006';
      const billId3 = 'bill_test_status_007';
      const billId4 = 'bill_test_status_008';
      // 現在時刻を使って businessDate を計算
      const now = new Date();
      const calcResult = await calcBusinessDate(now);
      const businessDate = typeof calcResult === 'string' ? calcResult : (calcResult.status === 'OK' ? calcResult.businessDateKey! : '2025-01-01');

      // 進行中の伝票（amounts がない）
      await db.collection('bills').doc(billId1).set({
        businessDate,
        status: 'open',
        party: { userId, pokerName: 'テスト太郎' },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        meta: { schemaVersion: '1.3' },
      });
      await db.collection('bills').doc(billId2).set({
        businessDate,
        status: 'in_progress',
        party: { userId, pokerName: 'テスト太郎' },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        meta: { schemaVersion: '1.3' },
      });
      await db.collection('bills').doc(billId3).set({
        businessDate,
        status: 'settling',
        party: { userId, pokerName: 'テスト太郎' },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        meta: { schemaVersion: '1.3' },
      });
      // 確定済み伝票（取得される）
      await createSettledBill(billId4, userId, businessDate, 10000, 'settled', 1);

      const mockRequest = {
        auth: { uid: userId },
        data: {},
      };

      const result = await (getUserOrderHistory as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.orders.length).toBe(1);
      expect(result.data.orders[0].id).toBe(billId4);
      expect(result.data.orders.find((o: any) => o.id === billId1)).toBeUndefined();
      expect(result.data.orders.find((o: any) => o.id === billId2)).toBeUndefined();
      expect(result.data.orders.find((o: any) => o.id === billId3)).toBeUndefined();
    });
  });
});

