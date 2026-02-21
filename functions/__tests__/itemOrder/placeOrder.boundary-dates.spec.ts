/**
 * placeOrder.boundary-dates の統合テスト
 * 
 * ChangeSpec P1-02.1 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - orders/{YYYYMMDD} のキーと date フィールドが、常に SSoT の bill.businessDate から生成されること
 * - 年跨ぎ・月跨ぎ・閉店時刻差分の多パターンで検証
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { placeOrder } from '../../src/domains/itemOrder/callables/placeOrder';

describe('placeOrder.boundary-dates', () => {
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

  // テスト用のヘルパ関数: bill を固定 businessDate で作成
  async function createBillWithFixedBusinessDate(
    billId: string,
    userId: string,
    businessDate: string
  ) {
    await db.collection('bills').doc(billId).set({
      businessDate, // 固定値で直接セット
      status: 'open',
      party: {
        userId,
        pokerName: 'テストユーザー',
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      meta: {
        schemaVersion: '1.3',
      },
    });

    await db.collection('activeStays').doc(userId).set({
      uid: userId,
      billId,
      isActive: true,
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // テスト用のヘルパ関数: 単一パターンの検証
  async function testBusinessDatePattern(
    testName: string,
    businessDate: string,
    storeCloseHour: string
  ) {
    process.env.STORE_CLOSE_HOUR = storeCloseHour;

    const userId = `user-${testName}-${storeCloseHour}`;
    const billId = `bill-${testName}-${storeCloseHour}`;
    const menuItemId = `menu-${testName}-${storeCloseHour}`;

    // メニューアイテムを作成
    await createTestMenuItem(menuItemId, 'テストアイテム', 'food', 500);

    // bill を固定 businessDate で作成
    await createBillWithFixedBusinessDate(billId, userId, businessDate);

    // 注文
    const mockRequest = {
      data: {
        userId,
        item: {
          menuItemId,
          quantity: 1,
        },
        clientNonce: `nonce-${testName}-${storeCloseHour}`,
      },
      auth: null,
    } as any;
    const orderResult = await placeOrder.run(mockRequest);

    expect(orderResult.success).toBe(true);

    // orders キーを確認
    const expectedOrderDocId = businessDate.replace(/-/g, ''); // "20251231"
    const ordersRef = db.collection('orders').doc(expectedOrderDocId);
    const ordersSnap = await ordersRef.get();

    expect(ordersSnap.exists).toBe(true);
    const ordersData = ordersSnap.data()!;
    expect(ordersData.date).toBe(businessDate); // orders.date が bill.businessDate と一致

    return {
      businessDate,
      expectedOrderDocId,
      actualOrderDocId: expectedOrderDocId,
      actualDate: ordersData.date,
      match: ordersData.date === businessDate,
    };
  }

  // パターンA: 12/31 (年跨ぎ)
  describe('パターンA: 12/31 (年跨ぎ)', () => {
    const businessDate = '2025-12-31';

    it(`STORE_CLOSE_HOUR=27: ordersキーとdateがbill.businessDateと一致`, async () => {
      const result = await testBusinessDatePattern('pattern-a', businessDate, '27');
      expect(result.match).toBe(true);
      expect(result.actualDate).toBe(businessDate);
      expect(result.actualOrderDocId).toBe('20251231');
    });

    it(`STORE_CLOSE_HOUR=9: ordersキーとdateがbill.businessDateと一致`, async () => {
      const result = await testBusinessDatePattern('pattern-a', businessDate, '9');
      expect(result.match).toBe(true);
      expect(result.actualDate).toBe(businessDate);
      expect(result.actualOrderDocId).toBe('20251231');
    });
  });

  // パターンB: 01/01 (年跨ぎ)
  describe('パターンB: 01/01 (年跨ぎ)', () => {
    const businessDate = '2026-01-01';

    it(`STORE_CLOSE_HOUR=27: ordersキーとdateがbill.businessDateと一致`, async () => {
      const result = await testBusinessDatePattern('pattern-b', businessDate, '27');
      expect(result.match).toBe(true);
      expect(result.actualDate).toBe(businessDate);
      expect(result.actualOrderDocId).toBe('20260101');
    });

    it(`STORE_CLOSE_HOUR=9: ordersキーとdateがbill.businessDateと一致`, async () => {
      const result = await testBusinessDatePattern('pattern-b', businessDate, '9');
      expect(result.match).toBe(true);
      expect(result.actualDate).toBe(businessDate);
      expect(result.actualOrderDocId).toBe('20260101');
    });
  });

  // パターンC: 月末（30/31）単独
  describe('パターンC: 月末（30/31）単独', () => {
    const businessDate = '2025-04-30';

    it(`STORE_CLOSE_HOUR=27: ordersキーとdateがbill.businessDateと一致`, async () => {
      const result = await testBusinessDatePattern('pattern-c', businessDate, '27');
      expect(result.match).toBe(true);
      expect(result.actualDate).toBe(businessDate);
      expect(result.actualOrderDocId).toBe('20250430');
    });

    it(`STORE_CLOSE_HOUR=9: ordersキーとdateがbill.businessDateと一致`, async () => {
      const result = await testBusinessDatePattern('pattern-c', businessDate, '9');
      expect(result.match).toBe(true);
      expect(result.actualDate).toBe(businessDate);
      expect(result.actualOrderDocId).toBe('20250430');
    });
  });

  // パターンC': 月初単独
  describe("パターンC': 月初単独", () => {
    const businessDate = '2025-05-01';

    it(`STORE_CLOSE_HOUR=27: ordersキーとdateがbill.businessDateと一致`, async () => {
      const result = await testBusinessDatePattern('pattern-c-prime', businessDate, '27');
      expect(result.match).toBe(true);
      expect(result.actualDate).toBe(businessDate);
      expect(result.actualOrderDocId).toBe('20250501');
    });

    it(`STORE_CLOSE_HOUR=9: ordersキーとdateがbill.businessDateと一致`, async () => {
      const result = await testBusinessDatePattern('pattern-c-prime', businessDate, '9');
      expect(result.match).toBe(true);
      expect(result.actualDate).toBe(businessDate);
      expect(result.actualOrderDocId).toBe('20250501');
    });
  });

  // パターンD-1: うるう年の 2/29
  describe('パターンD-1: うるう年の 2/29', () => {
    const businessDate = '2024-02-29';

    it(`STORE_CLOSE_HOUR=27: ordersキーとdateがbill.businessDateと一致`, async () => {
      const result = await testBusinessDatePattern('pattern-d1', businessDate, '27');
      expect(result.match).toBe(true);
      expect(result.actualDate).toBe(businessDate);
      expect(result.actualOrderDocId).toBe('20240229');
    });

    it(`STORE_CLOSE_HOUR=9: ordersキーとdateがbill.businessDateと一致`, async () => {
      const result = await testBusinessDatePattern('pattern-d1', businessDate, '9');
      expect(result.match).toBe(true);
      expect(result.actualDate).toBe(businessDate);
      expect(result.actualOrderDocId).toBe('20240229');
    });
  });

  // パターンD-2: 平年の 2/28
  describe('パターンD-2: 平年の 2/28', () => {
    const businessDate = '2025-02-28';

    it(`STORE_CLOSE_HOUR=27: ordersキーとdateがbill.businessDateと一致`, async () => {
      const result = await testBusinessDatePattern('pattern-d2', businessDate, '27');
      expect(result.match).toBe(true);
      expect(result.actualDate).toBe(businessDate);
      expect(result.actualOrderDocId).toBe('20250228');
    });

    it(`STORE_CLOSE_HOUR=9: ordersキーとdateがbill.businessDateと一致`, async () => {
      const result = await testBusinessDatePattern('pattern-d2', businessDate, '9');
      expect(result.match).toBe(true);
      expect(result.actualDate).toBe(businessDate);
      expect(result.actualOrderDocId).toBe('20250228');
    });
  });
});

