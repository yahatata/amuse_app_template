/**
 * appendItem.mismatch の統合テスト
 * 
 * ChangeSpec P1-02.1 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - 同一 idempotencyKey で payload 差替え → failed-precondition
 * - 親 bills/{billId}.updatedAt が1回目から変わらない（副作用なし）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { appendItem } from '../../../src/domains/bills/repos/appendItem';
import { HttpsError } from 'firebase-functions/v2/https';

describe('appendItem.mismatch', () => {
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
    delete process.env.WRITE_TODAYS_BILLS_IN_PARALLEL;
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
      description: '',
      imageUrl: '',
      isArchive: false,
      isSoldOut: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // テスト用のヘルパ関数: 伝票と activeStays を作成
  async function createTestBill(billId: string, userId: string, status: string = 'open') {
    await db.collection('bills').doc(billId).set({
      businessDate: '2025-11-15',
      status,
      party: {
        userId,
        pokerName: 'テスト太郎',
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

  it('同一idempotencyKeyでquantityを変更した再送はfailed-precondition、親updatedAtは不変', async () => {
    const billId = 'bill_test_mismatch_001';
    const userId = 'user_test_mismatch_001';
    const menuItemId = 'menu_test_mismatch_001';
    const clientNonce = 'nonce_test_mismatch_001';
    const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

    // テストデータ準備
    await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
    await createTestBill(billId, userId, 'open');

    // 1回目: quantity=1 で appendItem
    const result1 = await appendItem({
      billId,
      item: {
        menuItemId,
        quantity: 1,
        clientNonce,
      },
      idempotencyKey,
    });

    expect(result1.success).toBe(true);
    expect(result1.itemId).toBe(idempotencyKey);

    // 1回目の updatedAt を保存
    const billSnap1 = await db.collection('bills').doc(billId).get();
    const updatedAt1 = billSnap1.data()!.updatedAt;

    // 2回目: 同一 idempotencyKey で quantity=2 に変更
    await expect(
      appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 2, // quantity を変更
          clientNonce,
        },
        idempotencyKey,
      })
    ).rejects.toThrow(HttpsError);

    try {
      await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 2,
          clientNonce,
        },
        idempotencyKey,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(HttpsError);
      const httpsError = error as HttpsError;
      expect(httpsError.code).toBe('failed-precondition');
    }

    // 2回目実行後、親 updatedAt が1回目から変わらないことを確認
    const billSnap2 = await db.collection('bills').doc(billId).get();
    const updatedAt2 = billSnap2.data()!.updatedAt;

    // updatedAt が同一であることを確認（副作用なし）
    expect(updatedAt2).toEqual(updatedAt1);

    // items ドキュメントは1件のみ（2回目は作成されない）
    const itemsSnap = await db.collection('bills').doc(billId).collection('items').get();
    expect(itemsSnap.size).toBe(1);
    const itemData = itemsSnap.docs[0].data();
    expect(itemData.quantity).toBe(1); // 1回目の quantity が保持されている
  });

  it('同一idempotencyKeyでmenuItemIdを変更した再送はfailed-precondition、親updatedAtは不変', async () => {
    const billId = 'bill_test_mismatch_002';
    const userId = 'user_test_mismatch_002';
    const menuItemId1 = 'menu_test_mismatch_002_1';
    const menuItemId2 = 'menu_test_mismatch_002_2';
    const clientNonce = 'nonce_test_mismatch_002';
    const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

    // テストデータ準備
    await createTestMenuItem(menuItemId1, 'ビール', 'drink', 500);
    await createTestMenuItem(menuItemId2, 'コーラ', 'drink', 300);
    await createTestBill(billId, userId, 'open');

    // 1回目: menuItemId1 で appendItem
    const result1 = await appendItem({
      billId,
      item: {
        menuItemId: menuItemId1,
        quantity: 1,
        clientNonce,
      },
      idempotencyKey,
    });

    expect(result1.success).toBe(true);

    // 1回目の updatedAt を保存
    const billSnap1 = await db.collection('bills').doc(billId).get();
    const updatedAt1 = billSnap1.data()!.updatedAt;

    // 2回目: 同一 idempotencyKey で menuItemId2 に変更
    await expect(
      appendItem({
        billId,
        item: {
          menuItemId: menuItemId2, // menuItemId を変更
          quantity: 1,
          clientNonce,
        },
        idempotencyKey,
      })
    ).rejects.toThrow(HttpsError);

    try {
      await appendItem({
        billId,
        item: {
          menuItemId: menuItemId2,
          quantity: 1,
          clientNonce,
        },
        idempotencyKey,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(HttpsError);
      const httpsError = error as HttpsError;
      expect(httpsError.code).toBe('failed-precondition');
    }

    // 2回目実行後、親 updatedAt が1回目から変わらないことを確認
    const billSnap2 = await db.collection('bills').doc(billId).get();
    const updatedAt2 = billSnap2.data()!.updatedAt;

    expect(updatedAt2).toEqual(updatedAt1);

    // items ドキュメントは1件のみ（2回目は作成されない）
    const itemsSnap = await db.collection('bills').doc(billId).collection('items').get();
    expect(itemsSnap.size).toBe(1);
    const itemData = itemsSnap.docs[0].data();
    expect(itemData.menuItemId).toBe(menuItemId1); // 1回目の menuItemId が保持されている
  });
});

