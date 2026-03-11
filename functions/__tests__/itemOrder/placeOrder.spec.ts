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
import { placeOrder } from '../../src/domains/itemOrder/callables/placeOrder';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';

describe('placeOrder', () => {
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

  async function createAdminDevice(uid: string) {
    await db.collection('devices').add({
      uid,
      role: 'admin',
      status: 'active',
      name: 'Test Admin Device',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

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

    const adminId = 'admin_placeorder';
    await createAdminDevice(adminId);
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
      clientNonce: `nonce_test_${testName}_${suffix}`,
      idempotencyKey: `idem_test_${testName}_${suffix}`,
    };
  }

  describe('orders/_TodaysOrders の作成', () => {
    it('非 chip のみ orders/_TodaysOrders に記録されること（docId = itemId、親集計は初回のみ）', async () => {
      // テストIDを一意にする（タイムスタンプ + ランダム文字列）
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const userId = `user_test_orders_${timestamp}_${random}`;
      const billId = `bill_test_orders_${timestamp}_${random}`;
      const menuItemId = `menu_test_orders_${timestamp}_${random}`;
      const clientNonce = `nonce_test_orders_${timestamp}_${random}`;
      const idempotencyKey = `idem_test_orders_${timestamp}_${random}`;

      // テストデータ準備
      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      
      // 伝票を作成
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey,
      });

      // bills.place を設定
      await db.collection('bills').doc(billId).set({
        place: { table: 'A', seat: 12 },
      }, { merge: true });

      // placeOrder を呼び出し（onCall の run メソッドを使用）
      const mockRequest = {
        data: {
          billId,
          item: {
            menuItemId,
            quantity: 2,
          },
          clientNonce,
        },
        auth: { uid: 'admin_placeorder' },
      } as any;

      // onCall 関数の run メソッドを呼び出す
      const result = await (placeOrder as any).run(mockRequest);

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
      const ids = makeTestIds('placeOrder_chip');
      const userId = ids.userId;
      const billId = ids.billId;
      const menuItemId = ids.menuItemId;
      const clientNonce = ids.clientNonce;
      const idempotencyKey = ids.idempotencyKey;

      // テストデータ準備（chip カテゴリ）
      await createTestMenuItem(menuItemId, 'チップ 1000', 'chip', 1000);
      
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey,
      });

      const mockRequest = {
        data: {
          billId,
          item: {
            menuItemId,
            quantity: 1,
          },
          clientNonce,
        },
        auth: { uid: 'admin_placeorder' },
      } as any;

      const result = await (placeOrder as any).run(mockRequest);

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
      const ids = makeTestIds('placeOrder_replay');
      const userId = ids.userId;
      const billId = ids.billId;
      const menuItemId = ids.menuItemId;
      const clientNonce = ids.clientNonce;
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
          billId,
          item: {
            menuItemId,
            quantity: 1,
          },
          clientNonce,
        },
        auth: { uid: 'admin_placeorder' },
      } as any;

      // 1回目実行
      const result1 = await (placeOrder as any).run(mockRequest);
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
      const result2 = await (placeOrder as any).run(mockRequest);
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
      const ids = makeTestIds('placeOrder_different_nonce');
      const userId = ids.userId;
      const billId = ids.billId;
      const menuItemId = ids.menuItemId;
      const clientNonce1 = `${ids.clientNonce}_1`;
      const clientNonce2 = `${ids.clientNonce}_2`;
      const idempotencyKey = ids.idempotencyKey;

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey,
      });

      const mockRequest1 = {
        data: {
          billId,
          item: {
            menuItemId,
            quantity: 1,
          },
          clientNonce: clientNonce1,
        },
        auth: { uid: 'admin_placeorder' },
      } as any;

      const result1 = await (placeOrder as any).run(mockRequest1);
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
          billId,
          item: {
            menuItemId,
            quantity: 1,
          },
          clientNonce: clientNonce2, // 別 clientNonce
        },
        auth: { uid: 'admin_placeorder' },
      } as any;

      const result2 = await (placeOrder as any).run(mockRequest2);
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
      const ids = makeTestIds('placeOrder_assert_itemId');
      const userId = ids.userId;
      const billId = ids.billId;
      const menuItemId = ids.menuItemId;
      const clientNonce = ids.clientNonce;
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
          billId,
          item: {
            menuItemId,
            quantity: 1,
          },
          clientNonce,
        },
        auth: { uid: 'admin_placeorder' },
      } as any;

      const result = await (placeOrder as any).run(mockRequest);

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
          billId,
          item: {
            menuItemId,
            quantity: 1,
          },
          clientNonce,
        },
        auth: { uid: 'admin_placeorder' },
      } as any;

      await expect((placeOrder as any).run(mockRequest)).rejects.toThrow(/failed-precondition|伝票の状態/);
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
          billId,
          item: {
            menuItemId,
            quantity: 1,
          },
          clientNonce,
        },
        auth: { uid: 'admin_placeorder' },
      } as any;

      await expect((placeOrder as any).run(mockRequest)).rejects.toThrow(/failed-precondition|伝票の状態/);
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
          billId,
          item: {
            menuItemId,
            quantity: 1,
          },
          clientNonce,
        },
        auth: { uid: 'admin_placeorder' },
      } as any;

      await expect((placeOrder as any).run(mockRequest)).rejects.toThrow(/failed-precondition|伝票の状態/);
    });
  });

  describe('placeOrder × Chip（P1-03新規追加）', () => {
    it('Chipカテゴリのメニューを注文した場合、/bills/{billId}/sideGameChips に記録され、/items には記録されないこと', async () => {
      const userId = 'user_test_chip_001';
      const billId = 'bill_test_chip_001';
      const menuItemId = 'menu_test_chip_001';
      const clientNonce = 'nonce_test_chip_001';

      // テストデータ準備
      await createTestMenuItem(menuItemId, 'SideGame 1000', 'Chip', 5000);
      
      // 伝票を作成
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_chip_001',
      });

      const mockRequest = {
        data: {
          billId,
          item: {
            menuItemId,
            quantity: 2,
          },
          clientNonce,
        },
        auth: { uid: 'admin_placeorder' },
      } as any;

      const result = await (placeOrder as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data!.billId).toBe(billId);
      expect(result.data!.itemId).toBeDefined();
      expect(result.data!.orderedAt).toBeDefined();
      expect(result.data!.reused).toBe(false);
      // ChipのときのitemIdはclientNonceをそのまま返す仕様に変更
      expect(result.data!.itemId).toBe(clientNonce);

      // /bills/{billId}/sideGameChips の doc をコレクションから取得して検証
      const chipsSnapshot = await db.collection('bills').doc(billId)
        .collection('sideGameChips').get();

      expect(chipsSnapshot.size).toBe(1);
      const chipDoc = chipsSnapshot.docs[0];
      const chipId = chipDoc.id;
      const chipData = chipDoc.data();

      expect(chipData.action).toBe('purchase');
      expect(chipData.chipQty).toBe(2000); // 1000 * 2
      expect(chipData.amountIncl).toBe(10000); // 5000 * 2
      expect(chipData.menuItemId).toBe(menuItemId);
      expect(chipData.name).toBe('SideGame 1000');

      // /bills/{billId}/items は増えない
      const itemsSnapshot = await db.collection('bills').doc(billId)
        .collection('items').get();
      expect(itemsSnapshot.size).toBe(0);

      // orders/{YYYYMMDD}/_TodaysOrders には何も書かれない（現行ロジックどおり）
      const billDoc = await db.collection('bills').doc(billId).get();
      const businessDate = billDoc.data()!.businessDate as string;
      const orderDocId = businessDate.replace(/-/g, '');
      const todaysOrderDoc = await db.collection('orders').doc(orderDocId)
        .collection('_TodaysOrders').doc(chipId).get();
      expect(todaysOrderDoc.exists).toBe(false);

      // sideGameChipLogs に purchase ログが1件追加されている
      const today = new Date().toISOString().split('T')[0];
      const logsDoc = await db.collection('users').doc(userId)
        .collection('sideGameChipLogs').doc(today).get();
      expect(logsDoc.exists).toBe(true);
      const logsData = logsDoc.data()!;
      expect(logsData.logs).toBeDefined();
      const logEntries = Object.values(logsData.logs || {});
      const purchaseLogs = logEntries.filter((log: any) => log.category === 'purchase');
      expect(purchaseLogs.length).toBe(1);
      const purchaseLog = purchaseLogs[0] as any;
      expect(purchaseLog.amountDelta).toBe(2000); // chipQty と同じ値
      expect(purchaseLog.reasonType).toBe('sideGame');
    });

    it('同一 clientNonce で同じ Chipメニューを2回連続で呼び出すと、/sideGameChips の doc 数は1つのまま、2回目のレスポンスには reused: true が含まれること', async () => {
      const userId = 'user_test_chip_idempotent_001';
      const billId = 'bill_test_chip_idempotent_001';
      const menuItemId = 'menu_test_chip_idempotent_001';
      const clientNonce = 'nonce_test_chip_idempotent_001';

      await createTestMenuItem(menuItemId, 'SideGame 1000', 'Chip', 5000);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_chip_idempotent_001',
      });

      const mockRequest = {
        data: {
          billId,
          item: {
            menuItemId,
            quantity: 1,
          },
          clientNonce,
        },
        auth: { uid: 'admin_placeorder' },
      } as any;

      // 1回目の実行
      const result1 = await (placeOrder as any).run(mockRequest);
      expect(result1.success).toBe(true);
      expect(result1.data!.reused).toBe(false);
      expect(result1.data!.itemId).toBe(clientNonce);

      // 1回目のchip docを取得
      const chipsSnap1 = await db.collection('bills').doc(billId)
        .collection('sideGameChips').get();
      expect(chipsSnap1.size).toBe(1);
      const chipDoc1 = chipsSnap1.docs[0];
      const chipId1 = chipDoc1.id;

      // 親 updatedAt を記録
      const billDoc1 = await db.collection('bills').doc(billId).get();
      const updatedAt1 = billDoc1.data()!.updatedAt;

      // 少し待つ
      await new Promise(resolve => setTimeout(resolve, 100));

      // 2回目の実行（同一 clientNonce）
      const result2 = await (placeOrder as any).run(mockRequest);
      expect(result2.success).toBe(true);
      expect(result2.data!.reused).toBe(true); // 2回目は reused: true
      expect(result2.data!.itemId).toBe(clientNonce); // itemIdはclientNonceで安定している

      // chip doc が増えていないこと
      const chipsSnap2 = await db.collection('bills').doc(billId)
        .collection('sideGameChips').get();
      expect(chipsSnap2.size).toBe(1);
      const chipDoc2 = chipsSnap2.docs[0];
      expect(chipDoc2.id).toBe(chipId1); // 同じchipIdであること

      // 親 updatedAt は変更されていない
      const billDoc2 = await db.collection('bills').doc(billId).get();
      const updatedAt2 = billDoc2.data()!.updatedAt;
      expect(updatedAt2).toEqual(updatedAt1);

      // sideGameChipLogs の件数は1件のまま（2回目で増えない）
      const today = new Date().toISOString().split('T')[0];
      const logsDoc2 = await db.collection('users').doc(userId)
        .collection('sideGameChipLogs').doc(today).get();
      expect(logsDoc2.exists).toBe(true);
      const logsData2 = logsDoc2.data()!;
      const logEntries2 = Object.values(logsData2.logs || {});
      const purchaseLogs2 = logEntries2.filter((log: any) => log.category === 'purchase');
      expect(purchaseLogs2.length).toBe(1); // 2回目で増えていない
    });

    it('非Chipメニューを注文した場合、従来通り /bills/{billId}/items と orders/_TodaysOrders に記録されること（リグレッションテスト）', async () => {
      const userId = 'user_test_nonchip_001';
      const billId = 'bill_test_nonchip_001';
      const menuItemId = 'menu_test_nonchip_001';
      const clientNonce = 'nonce_test_nonchip_001';

      await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_nonchip_001',
      });

      const mockRequest = {
        data: {
          billId,
          item: {
            menuItemId,
            quantity: 2,
          },
          clientNonce,
        },
        auth: { uid: 'admin_placeorder' },
      } as any;

      const result = await (placeOrder as any).run(mockRequest);

      expect(result.success).toBe(true);
      const itemId = result.data!.itemId;

      // /bills/{billId}/items に記録されている
      const itemDoc = await db.collection('bills').doc(billId)
        .collection('items').doc(itemId).get();
      expect(itemDoc.exists).toBe(true);

      // orders/{YYYYMMDD}/_TodaysOrders に記録されている
      const billDoc = await db.collection('bills').doc(billId).get();
      const businessDate = billDoc.data()!.businessDate as string;
      const orderDocId = businessDate.replace(/-/g, '');
      const todaysOrderDoc = await db.collection('orders').doc(orderDocId)
        .collection('_TodaysOrders').doc(itemId).get();
      expect(todaysOrderDoc.exists).toBe(true);

      // /bills/{billId}/sideGameChips には何も書かれない
      const chipsSnapshot = await db.collection('bills').doc(billId)
        .collection('sideGameChips').get();
      expect(chipsSnapshot.size).toBe(0);
    });
  });
});

