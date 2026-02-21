/**
 * placeOrder.businessDate の統合テスト
 * 
 * ChangeSpec P1-02.1 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - orders/{YYYYMMDD} のキーが常に bill.businessDate に一致すること（SSoT原則）
 * - orders/{YYYYMMDD}.date が bills/{billId}.businessDate と完全一致すること
 * - STORE_CLOSE_HOUR の境界時刻でも整合すること
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { placeOrder } from '../../src/domains/itemOrder/callables/placeOrder';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';

describe('placeOrder.businessDate', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = `test-project-bills-${process.pid}-${Date.now()}`;
  let prevStoreCloseHour: string | undefined;

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
    prevStoreCloseHour = process.env.STORE_CLOSE_HOUR;
  });

  afterEach(() => {
    process.env.STORE_CLOSE_HOUR = prevStoreCloseHour;
  });

  // テスト用のヘルパ関数: メニューアイテムを作成
  async function createTestMenuItem(menuItemId: string, name: string, category: string, price: number) {
    await db.collection('menuItems').doc(menuItemId).set({
      name,
      category,
      price,
    });
  }

  it('ordersキーがbill.businessDateと一致すること（STORE_CLOSE_HOUR=27）', async () => {
    process.env.STORE_CLOSE_HOUR = '27';
    
    const userId = 'user-test-1';
    const billId = 'bill-test-1';
    const menuItemId = 'menu-item-1';
    
    // メニューアイテムを作成
    await createTestMenuItem(menuItemId, 'テストアイテム', 'food', 500);
    
    // 入店（businessDate はサーバが計算）
    const createResult = await createBillWithActiveStay({
      billId,
      userId,
      pokerName: 'テストユーザー',
      idempotencyKey: `create-${billId}`,
    });
    
    expect(createResult.success).toBe(true);
    
    // bill の businessDate を取得
    const billSnap = await db.collection('bills').doc(billId).get();
    expect(billSnap.exists).toBe(true);
    const billData = billSnap.data()!;
    const businessDate = billData.businessDate as string; // "2025-11-15"
    expect(businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    
    // 注文
    const mockRequest = {
      data: {
        userId,
        item: {
          menuItemId,
          quantity: 1,
        },
        clientNonce: 'nonce-1',
      },
      auth: null,
    } as any;
    const orderResult = await placeOrder.run(mockRequest);
    
    expect(orderResult.success).toBe(true);
    
    // orders キーを確認
    const orderDocId = businessDate.replace(/-/g, ''); // "20251115"
    const ordersRef = db.collection('orders').doc(orderDocId);
    const ordersSnap = await ordersRef.get();
    
    expect(ordersSnap.exists).toBe(true);
    const ordersData = ordersSnap.data()!;
    expect(ordersData.date).toBe(businessDate); // orders.date が bill.businessDate と一致
    
    // _TodaysOrders を確認
    const itemId = `appendItem:${billId}:nonce-1`;
    const todaysOrderSnap = await ordersRef.collection('_TodaysOrders').doc(itemId).get();
    expect(todaysOrderSnap.exists).toBe(true);
  });

  it('ordersキーがbill.businessDateと一致すること（STORE_CLOSE_HOUR=9）', async () => {
    process.env.STORE_CLOSE_HOUR = '9';
    
    const userId = 'user-test-2';
    const billId = 'bill-test-2';
    const menuItemId = 'menu-item-2';
    
    // メニューアイテムを作成
    await createTestMenuItem(menuItemId, 'テストアイテム2', 'food', 300);
    
    // 入店
    const createResult = await createBillWithActiveStay({
      billId,
      userId,
      pokerName: 'テストユーザー2',
      idempotencyKey: `create-${billId}`,
    });
    
    expect(createResult.success).toBe(true);
    
    // bill の businessDate を取得
    const billSnap = await db.collection('bills').doc(billId).get();
    const billData = billSnap.data()!;
    const businessDate = billData.businessDate as string;
    
    // 注文
    const mockRequest = {
      data: {
        userId,
        item: {
          menuItemId,
          quantity: 1,
        },
        clientNonce: 'nonce-2',
      },
      auth: null,
    } as any;
    const orderResult = await placeOrder.run(mockRequest);
    
    expect(orderResult.success).toBe(true);
    
    // orders キーを確認
    const orderDocId = businessDate.replace(/-/g, '');
    const ordersRef = db.collection('orders').doc(orderDocId);
    const ordersSnap = await ordersRef.get();
    
    expect(ordersSnap.exists).toBe(true);
    const ordersData = ordersSnap.data()!;
    expect(ordersData.date).toBe(businessDate);
  });

  it('複数回注文してもordersキーがbill.businessDateと一致すること', async () => {
    process.env.STORE_CLOSE_HOUR = '27';
    
    const userId = 'user-test-3';
    const billId = 'bill-test-3';
    const menuItemId1 = 'menu-item-3-1';
    const menuItemId2 = 'menu-item-3-2';
    
    // メニューアイテムを作成
    await createTestMenuItem(menuItemId1, 'テストアイテム3-1', 'food', 500);
    await createTestMenuItem(menuItemId2, 'テストアイテム3-2', 'drink', 300);
    
    // 入店
    const createResult = await createBillWithActiveStay({
      billId,
      userId,
      pokerName: 'テストユーザー3',
      idempotencyKey: `create-${billId}`,
    });
    
    expect(createResult.success).toBe(true);
    
    // bill の businessDate を取得
    const billSnap = await db.collection('bills').doc(billId).get();
    const billData = billSnap.data()!;
    const businessDate = billData.businessDate as string;
    const orderDocId = businessDate.replace(/-/g, '');
    
    // 1回目の注文
    const mockRequest1 = {
      data: {
        userId,
        item: {
          menuItemId: menuItemId1,
          quantity: 1,
        },
        clientNonce: 'nonce-3-1',
      },
      auth: null,
    } as any;
    const orderResult1 = await placeOrder.run(mockRequest1);
    
    expect(orderResult1.success).toBe(true);
    
    // 2回目の注文
    const mockRequest2 = {
      data: {
        userId,
        item: {
          menuItemId: menuItemId2,
          quantity: 2,
        },
        clientNonce: 'nonce-3-2',
      },
      auth: null,
    } as any;
    const orderResult2 = await placeOrder.run(mockRequest2);
    
    expect(orderResult2.success).toBe(true);
    
    // orders キーを確認（両方とも同じキーを使用）
    const ordersRef = db.collection('orders').doc(orderDocId);
    const ordersSnap = await ordersRef.get();
    
    expect(ordersSnap.exists).toBe(true);
    const ordersData = ordersSnap.data()!;
    expect(ordersData.date).toBe(businessDate);
    
    // _TodaysOrders が2件作成されていることを確認
    const todaysOrdersSnap = await ordersRef.collection('_TodaysOrders').get();
    expect(todaysOrdersSnap.size).toBe(2);
  });
});

