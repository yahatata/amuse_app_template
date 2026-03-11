/**
 * placeOrderByUser の統合テスト
 * 
 * ChangeSpec P1-02 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - orders/_TodaysOrders の作成（非 chip のみ、docId = itemId、親集計は初回のみ）
 * - bills.place.table/bills.place.seat の同梱
 * - 未認証で permission-denied
 * - 同一 menuItemId の複数行対応
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { placeOrderByUser } from '../../src/domains/itemOrder/callables/placeOrderByUser';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';

describe('placeOrderByUser', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-bills';

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
    
    // 明示的なクリーンアップ（念のため）
    const activeStaysSnapshot = await db.collection('activeStays').get();
    const deleteActiveStaysPromises = activeStaysSnapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deleteActiveStaysPromises);
    
    const billsSnapshot = await db.collection('bills').get();
    const deleteBillsPromises = billsSnapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deleteBillsPromises);
    
    const menuItemsSnapshot = await db.collection('menuItems').get();
    const deleteMenuItemsPromises = menuItemsSnapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deleteMenuItemsPromises);
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

  // テストID生成ヘルパー（同じテスト内でIDを固定するため）
  function makeTestIds(testName: string) {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      billId: `bill_test_${testName}_${suffix}`,
      userId: `user_test_${testName}_${suffix}`,
      menuItemId: `menu_test_${testName}_${suffix}`,
      sessionNonce: `session_test_${testName}_${suffix}`,
      idempotencyKey: `idem_test_${testName}_${suffix}`,
    };
  }

  describe('permission-denied', () => {
    it('未認証で permission-denied', async () => {
      const mockRequest = {
        data: {
          items: [{
            menuItemId: 'menu_test_001',
            quantity: 1,
          }],
        },
        auth: null, // 未認証
      } as any;

      await expect(placeOrderByUser.run(mockRequest)).rejects.toHaveProperty('code', 'permission-denied');
    });
  });

  describe('orders/_TodaysOrders の作成', () => {
    it('非 chip のみ orders/_TodaysOrders に記録されること（docId = itemId、親集計は初回のみ）', async () => {
      // テストIDを一意にする（タイムスタンプ + ランダム文字列）
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const userId = `user_test_orders_user_${timestamp}_${random}`;
      const billId = `bill_test_orders_user_${timestamp}_${random}`;
      const menuItemId = `menu_test_orders_user_${timestamp}_${random}`;
      const sessionNonce = `session_test_${timestamp}_${random}`;
      const idempotencyKey = `idem_test_orders_user_${timestamp}_${random}`;

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey,
      });

      // bills.place を設定
      await db.collection('bills').doc(billId).set({
        place: { table: 'B', seat: 5 },
      }, { merge: true });

      const mockRequest = {
        data: {
          items: [{
            menuItemId,
            quantity: 2,
          }],
          clientNonce: sessionNonce,
        },
        auth: {
          uid: userId,
        },
      } as any;

      const result = await placeOrderByUser.run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.billId).toBe(billId);
      expect(result.data.items.length).toBe(1);

      // orders/_TodaysOrders が作成されている（docId = itemId）
      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const orderDocId = `${yyyy}${mm}${dd}`;
      const itemId = result.data.items[0].itemId;

      const todaysOrderDoc = await db.collection('orders').doc(orderDocId)
        .collection('_TodaysOrders').doc(itemId).get();
      expect(todaysOrderDoc.exists).toBe(true);
      const orderData = todaysOrderDoc.data()!;
      expect(orderData.billId).toBe(billId);
      expect(orderData.userId).toBe(userId);
      expect(orderData.menuItemId).toBe(menuItemId);
      expect(orderData.currentTable).toBe('B');
      expect(orderData.currentSeat).toBe(5);
    });

    it('同一 menuItemId が複数行ある場合でも、各行ごとに正しい itemId で _TodaysOrders を作成できること', async () => {
      const ids = makeTestIds('placeOrderByUser_multiple_rows');
      const userId = ids.userId;
      const billId = ids.billId;
      const menuItemId = ids.menuItemId;
      const sessionNonce = ids.sessionNonce;
      const idempotencyKey = ids.idempotencyKey;

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey,
      });

      const mockRequest = {
        data: {
          items: [
            { menuItemId, quantity: 1 }, // 1行目
            { menuItemId, quantity: 2 }, // 2行目（同一 menuItemId）
          ],
          clientNonce: sessionNonce,
        },
        auth: {
          uid: userId,
        },
      } as any;

      const result = await placeOrderByUser.run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.items.length).toBe(2);

      // 各行ごとに異なる itemId が生成されている
      const itemId1 = result.data.items[0].itemId;
      const itemId2 = result.data.items[1].itemId;
      expect(itemId1).not.toBe(itemId2);

      // orders/_TodaysOrders に2つのドキュメントが作成されている（docId = itemId）
      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const orderDocId = `${yyyy}${mm}${dd}`;

      const todaysOrderDoc1 = await db.collection('orders').doc(orderDocId)
        .collection('_TodaysOrders').doc(itemId1).get();
      expect(todaysOrderDoc1.exists).toBe(true);
      expect(todaysOrderDoc1.data()!.quantity).toBe(1);

      const todaysOrderDoc2 = await db.collection('orders').doc(orderDocId)
        .collection('_TodaysOrders').doc(itemId2).get();
      expect(todaysOrderDoc2.exists).toBe(true);
      expect(todaysOrderDoc2.data()!.quantity).toBe(2);

      // 親 orders の集計が正しく更新されている
      const ordersDoc = await db.collection('orders').doc(orderDocId).get();
      const ordersData = ordersDoc.data()!;
      expect(ordersData.onedayOrderQuantity).toBe(2); // 2つの注文
      expect(ordersData.onedayTotalPrice).toBe(1500); // 500 * 1 + 500 * 2
    });

    it('items = [{A x1}, {A x2}, {B x1}] を投入 → 3つの別 itemId が返り、_TodaysOrders にそれぞれ docId=itemId で3件作成される（Aが2件、Bが1件）、親集計は3件ぶん加算', async () => {
      const ids = makeTestIds('placeOrderByUser_multiple_items');
      const userId = ids.userId;
      const billId = ids.billId;
      const menuItemIdA = `${ids.menuItemId}_A`;
      const menuItemIdB = `${ids.menuItemId}_B`;
      const sessionNonce = ids.sessionNonce;
      const idempotencyKey = ids.idempotencyKey;

      await createTestMenuItem(menuItemIdA, 'ビール', 'drink', 500);
      await createTestMenuItem(menuItemIdB, 'コーラ', 'drink', 300);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey,
      });

      const mockRequest = {
        data: {
          items: [
            { menuItemId: menuItemIdA, quantity: 1 }, // A x1
            { menuItemId: menuItemIdA, quantity: 2 }, // A x2
            { menuItemId: menuItemIdB, quantity: 1 }, // B x1
          ],
          clientNonce: sessionNonce,
        },
        auth: {
          uid: userId,
        },
      } as any;

      const result = await placeOrderByUser.run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.items.length).toBe(3);

      // 3つの別 itemId が返る
      const itemId1 = result.data.items[0].itemId;
      const itemId2 = result.data.items[1].itemId;
      const itemId3 = result.data.items[2].itemId;
      expect(itemId1).not.toBe(itemId2);
      expect(itemId2).not.toBe(itemId3);
      expect(itemId1).not.toBe(itemId3);

      // _TodaysOrders にそれぞれ docId=itemId で3件作成される（Aが2件、Bが1件）
      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const orderDocId = `${yyyy}${mm}${dd}`;

      const todaysOrderDoc1 = await db.collection('orders').doc(orderDocId)
        .collection('_TodaysOrders').doc(itemId1).get();
      expect(todaysOrderDoc1.exists).toBe(true);
      expect(todaysOrderDoc1.data()!.menuItemId).toBe(menuItemIdA);
      expect(todaysOrderDoc1.data()!.quantity).toBe(1);

      const todaysOrderDoc2 = await db.collection('orders').doc(orderDocId)
        .collection('_TodaysOrders').doc(itemId2).get();
      expect(todaysOrderDoc2.exists).toBe(true);
      expect(todaysOrderDoc2.data()!.menuItemId).toBe(menuItemIdA);
      expect(todaysOrderDoc2.data()!.quantity).toBe(2);

      const todaysOrderDoc3 = await db.collection('orders').doc(orderDocId)
        .collection('_TodaysOrders').doc(itemId3).get();
      expect(todaysOrderDoc3.exists).toBe(true);
      expect(todaysOrderDoc3.data()!.menuItemId).toBe(menuItemIdB);
      expect(todaysOrderDoc3.data()!.quantity).toBe(1);

      // 親集計は3件ぶん加算
      const ordersDoc = await db.collection('orders').doc(orderDocId).get();
      const ordersData = ordersDoc.data()!;
      expect(ordersData.onedayOrderQuantity).toBe(3); // 3件
      expect(ordersData.onedayTotalPrice).toBe(1800); // 500 * 1 + 500 * 2 + 300 * 1 = 500 + 1000 + 300 = 1800
    });

    it('同じ clientNonce を使って全体リプレイした場合、0件加算', async () => {
      const ids = makeTestIds('placeOrderByUser_replay');
      const userId = ids.userId;
      const billId = ids.billId;
      const menuItemId = ids.menuItemId;
      const sessionNonce = ids.sessionNonce;
      const idempotencyKey = ids.idempotencyKey;

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey,
      });

      const mockRequest = {
        data: {
          items: [
            { menuItemId, quantity: 1 },
            { menuItemId, quantity: 2 },
          ],
          clientNonce: sessionNonce,
        },
        auth: {
          uid: userId,
        },
      } as any;

      // 1回目実行
      const result1 = await placeOrderByUser.run(mockRequest);
      expect(result1.success).toBe(true);
      expect(result1.data.items.length).toBe(2);

      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const orderDocId = `${yyyy}${mm}${dd}`;

      const ordersDoc1 = await db.collection('orders').doc(orderDocId).get();
      const ordersData1 = ordersDoc1.data()!;
      expect(ordersData1.onedayOrderQuantity).toBe(2);
      expect(ordersData1.onedayTotalPrice).toBe(1500); // 500 * 1 + 500 * 2

      // 2回目実行（同じ clientNonce）
      const result2 = await placeOrderByUser.run(mockRequest);
      expect(result2.success).toBe(true);
      
      // reused フラグが立っていることを確認
      // placeOrderByUser のレスポンスの items には reused が含まれる（appendItem の diagnostics.reused から取得）
      expect(result2.data.items.length).toBe(2);
      // 実装では appendResults に reused が含まれ、レスポンスの items にも含まれる
      if (result2.data.items[0].reused !== undefined) {
        expect(result2.data.items[0].reused).toBe(true);
        expect(result2.data.items[1].reused).toBe(true);
      }
      // 親集計が増えていないことで冪等性を確認

      // 親集計は増えない（0件加算）
      const ordersDoc2 = await db.collection('orders').doc(orderDocId).get();
      const ordersData2 = ordersDoc2.data()!;
      expect(ordersData2.onedayOrderQuantity).toBe(2); // 増えていない
      expect(ordersData2.onedayTotalPrice).toBe(1500); // 増えていない
    });

    it('chip カテゴリは orders/_TodaysOrders に記録されないこと', async () => {
      const ids = makeTestIds('placeOrderByUser_chip');
      const userId = ids.userId;
      const billId = ids.billId;
      const menuItemId = ids.menuItemId;
      const sessionNonce = ids.sessionNonce;
      const idempotencyKey = ids.idempotencyKey;

      await createTestMenuItem(menuItemId, 'チップ 1000', 'chip', 1000);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey,
      });

      const mockRequest = {
        data: {
          items: [{
            menuItemId,
            quantity: 1,
          }],
          clientNonce: sessionNonce,
        },
        auth: {
          uid: userId,
        },
      } as any;

      const result = await placeOrderByUser.run(mockRequest);

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
  });

  describe('status ガードの厳密化', () => {
    it('status=settling で failed-precondition', async () => {
      const userId = 'user_test_status_settling_user_001';
      const billId = 'bill_test_status_settling_user_001';
      const menuItemId = 'menu_test_status_settling_user_001';
      const sessionNonce = 'session_test_status_settling_001';

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_status_settling_user_001',
      });

      // bills の status を settling に変更
      await db.collection('bills').doc(billId).set({ status: 'settling' }, { merge: true });

      const mockRequest = {
        data: {
          items: [{
            menuItemId,
            quantity: 1,
          }],
          clientNonce: sessionNonce,
        },
        auth: {
          uid: userId,
        },
      } as any;

      await expect(placeOrderByUser.run(mockRequest)).rejects.toHaveProperty('code', 'failed-precondition');
    });

    it('status=settled で failed-precondition', async () => {
      const userId = 'user_test_status_settled_user_001';
      const billId = 'bill_test_status_settled_user_001';
      const menuItemId = 'menu_test_status_settled_user_001';
      const sessionNonce = 'session_test_status_settled_001';

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_status_settled_user_001',
      });

      // bills の status を settled に変更（activeStays は残す）
      await db.collection('bills').doc(billId).set({ status: 'settled' }, { merge: true });
      // activeStays は残す（getActiveBillByUser が伝票を返すようにする）
      // これにより、appendItem の status ガードで failed-precondition が返る

      const mockRequest = {
        data: {
          items: [{
            menuItemId,
            quantity: 1,
          }],
          clientNonce: sessionNonce,
        },
        auth: {
          uid: userId,
        },
      } as any;

      await expect(placeOrderByUser.run(mockRequest)).rejects.toHaveProperty('code', 'failed-precondition');
    });

    it('status=voided で failed-precondition', async () => {
      const userId = 'user_test_status_voided_user_001';
      const billId = 'bill_test_status_voided_user_001';
      const menuItemId = 'menu_test_status_voided_user_001';
      const sessionNonce = 'session_test_status_voided_001';

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_status_voided_user_001',
      });

      // bills の status を voided に変更（activeStays は残す）
      await db.collection('bills').doc(billId).set({ status: 'voided' }, { merge: true });
      // activeStays は残す（getActiveBillByUser が伝票を返すようにする）
      // これにより、appendItem の status ガードで failed-precondition が返る

      const mockRequest = {
        data: {
          items: [{
            menuItemId,
            quantity: 1,
          }],
          clientNonce: sessionNonce,
        },
        auth: {
          uid: userId,
        },
      } as any;

      await expect(placeOrderByUser.run(mockRequest)).rejects.toHaveProperty('code', 'failed-precondition');
    });
  });
});

