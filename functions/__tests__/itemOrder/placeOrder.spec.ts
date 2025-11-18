/**
 * placeOrder の統合テスト
 * 
 * ChangeSpec P1-02 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - orders/_TodaysOrders の作成（非 chip のみ、docId = itemId、親集計は初回のみ）
 * - bills.place.table/bills.place.seat の同梱
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { placeOrder } from '../../src/itemOrder/placeOrder';
import { createBillWithActiveStay } from '../../src/helpers/billsApi/createBillWithActiveStay';

describe('placeOrder', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-bills';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    
    testEnv = await initializeTestEnvironment({
      projectId,
    });
    
    if (admin.apps.length > 0) {
      await admin.app().delete();
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

  // テスト用のヘルパ関数: メニューアイテムを作成
  async function createTestMenuItem(menuItemId: string, name: string, category: string, price: number) {
    await db.collection('menuItems').doc(menuItemId).set({
      name,
      category,
      price,
      description: '',
      imageUrl: '',
      isArchive: false,
      isSoldOut: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  describe('orders/_TodaysOrders の作成', () => {
    it('非 chip のみ orders/_TodaysOrders に記録されること（docId = itemId、親集計は初回のみ）', async () => {
      const userId = 'user_test_orders_001';
      const billId = 'bill_test_orders_001';
      const menuItemId = 'menu_test_orders_001';
      const clientNonce = 'nonce_test_orders_001';

      // テストデータ準備
      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      
      // 伝票を作成
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_orders_001',
      });

      // bills.place を設定
      await db.collection('bills').doc(billId).set({
        place: { table: 'A', seat: 12 },
      }, { merge: true });

      // placeOrder を呼び出し（onCall の run メソッドを使用）
      const mockRequest = {
        data: {
          userId,
          item: {
            menuItemId,
            quantity: 2,
          },
          clientNonce,
        },
        auth: null, // placeOrder は認証不要
      } as any;

      // onCall 関数の run メソッドを呼び出す
      const result = await placeOrder.run(mockRequest);

      if (!result.success) {
        console.error('placeOrder failed:', result.error);
      }
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.billId).toBe(billId);
      expect(result.data!.itemId).toBeDefined();

      // orders/_TodaysOrders が作成されている（docId = itemId）
      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const orderDocId = `${yyyy}${mm}${dd}`;
      const itemId = result.data!.itemId;

      const todaysOrderDoc = await db.collection('orders').doc(orderDocId)
        .collection('_TodaysOrders').doc(itemId).get();
      expect(todaysOrderDoc.exists).toBe(true);
      const orderData = todaysOrderDoc.data()!;
      expect(orderData.billId).toBe(billId);
      expect(orderData.userId).toBe(userId);
      expect(orderData.menuItemId).toBe(menuItemId);
      expect(orderData.name).toBe('ビール');
      expect(orderData.category).toBe('drink');
      expect(orderData.quantity).toBe(2);
      expect(orderData.status).toBe('preparing');
      expect(orderData.currentTable).toBe('A');
      expect(orderData.currentSeat).toBe(12);

      // 親 orders の集計が更新されている
      const ordersDoc = await db.collection('orders').doc(orderDocId).get();
      expect(ordersDoc.exists).toBe(true);
      const ordersData = ordersDoc.data()!;
      expect(ordersData.onedayOrderQuantity).toBe(1);
      expect(ordersData.onedayTotalPrice).toBe(1000); // 500 * 2
    });

    it('chip カテゴリは orders/_TodaysOrders に記録されないこと', async () => {
      const userId = 'user_test_orders_002';
      const billId = 'bill_test_orders_002';
      const menuItemId = 'menu_test_orders_002';
      const clientNonce = 'nonce_test_orders_002';

      // テストデータ準備（chip カテゴリ）
      await createTestMenuItem(menuItemId, 'チップ 1000', 'chip', 1000);
      
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_orders_002',
      });

      const mockRequest = {
        data: {
          userId,
          item: {
            menuItemId,
            quantity: 1,
          },
          clientNonce,
        },
        auth: null,
      } as any;

      const result = await placeOrder.run(mockRequest);

      expect(result.success).toBe(true);

      // orders/_TodaysOrders は作成されていない（chip は除外）
      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const orderDocId = `${yyyy}${mm}${dd}`;

      const ordersRef = db.collection('orders').doc(orderDocId);
      const todaysOrdersSnap = await ordersRef.collection('_TodaysOrders').get();
      expect(todaysOrdersSnap.empty).toBe(true);
    });

    it('同一 itemId で replay 時、親集計は二重加算されないこと', async () => {
      const userId = 'user_test_orders_003';
      const billId = 'bill_test_orders_003';
      const menuItemId = 'menu_test_orders_003';
      const clientNonce = 'nonce_test_orders_003';

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_orders_003',
      });

      const mockRequest = {
        data: {
          userId,
          item: {
            menuItemId,
            quantity: 1,
          },
          clientNonce,
        },
        auth: null,
      } as any;

      // 1回目実行
      const result1 = await placeOrder.run(mockRequest);
      expect(result1.success).toBe(true);

      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const orderDocId = `${yyyy}${mm}${dd}`;

      const ordersDoc1 = await db.collection('orders').doc(orderDocId).get();
      const ordersData1 = ordersDoc1.data()!;
      expect(ordersData1.onedayOrderQuantity).toBe(1);
      expect(ordersData1.onedayTotalPrice).toBe(500);

      // 2回目実行（同一 clientNonce）
      const result2 = await placeOrder.run(mockRequest);
      expect(result2.success).toBe(true);
      expect(result2.data).toBeDefined();
      expect(result2.data!.reused).toBe(true); // reused フラグが立っている

      // 親集計は二重加算されていない
      const ordersDoc2 = await db.collection('orders').doc(orderDocId).get();
      const ordersData2 = ordersDoc2.data()!;
      expect(ordersData2.onedayOrderQuantity).toBe(1); // 増えていない
      expect(ordersData2.onedayTotalPrice).toBe(500); // 増えていない
    });

    it('別 clientNonce（別 itemId）で再実行 → 新規 doc が作られ、親集計が増える', async () => {
      const userId = 'user_test_orders_004';
      const billId = 'bill_test_orders_004';
      const menuItemId = 'menu_test_orders_004';
      const clientNonce1 = 'nonce_test_orders_004_1';
      const clientNonce2 = 'nonce_test_orders_004_2';

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_orders_004',
      });

      const mockRequest1 = {
        data: {
          userId,
          item: {
            menuItemId,
            quantity: 1,
          },
          clientNonce: clientNonce1,
        },
        auth: null,
      } as any;

      const result1 = await placeOrder.run(mockRequest1);
      expect(result1.success).toBe(true);

      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const orderDocId = `${yyyy}${mm}${dd}`;

      const ordersDoc1 = await db.collection('orders').doc(orderDocId).get();
      const ordersData1 = ordersDoc1.data()!;
      expect(ordersData1.onedayOrderQuantity).toBe(1);
      expect(ordersData1.onedayTotalPrice).toBe(500);

      // 2回目実行（別 clientNonce）
      const mockRequest2 = {
        data: {
          userId,
          item: {
            menuItemId,
            quantity: 1,
          },
          clientNonce: clientNonce2, // 別 clientNonce
        },
        auth: null,
      } as any;

      const result2 = await placeOrder.run(mockRequest2);
      expect(result2.success).toBe(true);
      expect(result2.data).toBeDefined();
      expect(result2.data!.reused).toBe(false); // reused フラグが立っていない

      // 新規 doc が作られ、親集計が増える
      const ordersDoc2 = await db.collection('orders').doc(orderDocId).get();
      const ordersData2 = ordersDoc2.data()!;
      expect(ordersData2.onedayOrderQuantity).toBe(2); // 増えている
      expect(ordersData2.onedayTotalPrice).toBe(1000); // 増えている

      // _TodaysOrders に2つのドキュメントが作成されている（docId = itemId）
      const itemId1 = result1.data!.itemId;
      const itemId2 = result2.data!.itemId;
      expect(itemId1).not.toBe(itemId2);

      const todaysOrderDoc1 = await db.collection('orders').doc(orderDocId)
        .collection('_TodaysOrders').doc(itemId1).get();
      expect(todaysOrderDoc1.exists).toBe(true);

      const todaysOrderDoc2 = await db.collection('orders').doc(orderDocId)
        .collection('_TodaysOrders').doc(itemId2).get();
      expect(todaysOrderDoc2.exists).toBe(true);
    });

    it('appendItem のレスポンス itemId をそのまま _TodaysOrders/{itemId} に使っていることをassert', async () => {
      const userId = 'user_test_orders_005';
      const billId = 'bill_test_orders_005';
      const menuItemId = 'menu_test_orders_005';
      const clientNonce = 'nonce_test_orders_005';

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_orders_005',
      });

      const mockRequest = {
        data: {
          userId,
          item: {
            menuItemId,
            quantity: 1,
          },
          clientNonce,
        },
        auth: null,
      } as any;

      const result = await placeOrder.run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.itemId).toBeDefined();

      // appendItem のレスポンス itemId をそのまま _TodaysOrders/{itemId} に使っていることを確認
      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const orderDocId = `${yyyy}${mm}${dd}`;
      const itemId = result.data!.itemId;

      const todaysOrderDoc = await db.collection('orders').doc(orderDocId)
        .collection('_TodaysOrders').doc(itemId).get();
      expect(todaysOrderDoc.exists).toBe(true);
      expect(todaysOrderDoc.id).toBe(itemId); // docId = itemId
    });
  });

  describe('status ガードの厳密化', () => {
    it('status=settling で failed-precondition', async () => {
      const userId = 'user_test_status_settling_001';
      const billId = 'bill_test_status_settling_001';
      const menuItemId = 'menu_test_status_settling_001';
      const clientNonce = 'nonce_test_status_settling_001';

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_status_settling_001',
      });

      // bills の status を settling に変更
      await db.collection('bills').doc(billId).set({ status: 'settling' }, { merge: true });

      const mockRequest = {
        data: {
          userId,
          item: {
            menuItemId,
            quantity: 1,
          },
          clientNonce,
        },
        auth: null,
      } as any;

      const result = await placeOrder.run(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('status');
    });

    it('status=settled で failed-precondition', async () => {
      const userId = 'user_test_status_settled_001';
      const billId = 'bill_test_status_settled_001';
      const menuItemId = 'menu_test_status_settled_001';
      const clientNonce = 'nonce_test_status_settled_001';

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_status_settled_001',
      });

      // bills の status を settled に変更
      await db.collection('bills').doc(billId).set({ status: 'settled' }, { merge: true });

      const mockRequest = {
        data: {
          userId,
          item: {
            menuItemId,
            quantity: 1,
          },
          clientNonce,
        },
        auth: null,
      } as any;

      const result = await placeOrder.run(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('status');
    });

    it('status=voided で failed-precondition', async () => {
      const userId = 'user_test_status_voided_001';
      const billId = 'bill_test_status_voided_001';
      const menuItemId = 'menu_test_status_voided_001';
      const clientNonce = 'nonce_test_status_voided_001';

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_status_voided_001',
      });

      // bills の status を voided に変更
      await db.collection('bills').doc(billId).set({ status: 'voided' }, { merge: true });

      const mockRequest = {
        data: {
          userId,
          item: {
            menuItemId,
            quantity: 1,
          },
          clientNonce,
        },
        auth: null,
      } as any;

      const result = await placeOrder.run(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('status');
    });
  });
});

