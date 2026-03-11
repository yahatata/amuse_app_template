/**
 * appendItem.concurrent の統合テスト
 * 
 * ChangeSpec P1-02.1 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - status=open で異なる idempotencyKey なら並行 appendItem が両方成功
 * - appendItem 中に別Txで status='settling' に遷移した場合、遅い方は failed-precondition
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { appendItem } from '../../../src/domains/bills/repos/appendItem';
import { HttpsError } from 'firebase-functions/v2/https';

describe('appendItem.concurrent', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = `test-project-bills-${process.pid}-${Date.now()}`;
  let prevStoreCloseHour: string | undefined;

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

  it('status=openで異なるidempotencyKeyなら並行appendItemが両方成功', async () => {
    const billId = 'bill_test_concurrent_001';
    const userId = 'user_test_concurrent_001';
    const menuItemId = 'menu_test_concurrent_001';
    
    // テストデータ準備
    await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
    await createTestBill(billId, userId, 'open');

    // 並行実行
    const [result1, result2] = await Promise.all([
      appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 1,
          clientNonce: 'nonce-concurrent-1',
        },
        idempotencyKey: `appendItem:${billId}:nonce-concurrent-1`,
      }),
      appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 2,
          clientNonce: 'nonce-concurrent-2',
        },
        idempotencyKey: `appendItem:${billId}:nonce-concurrent-2`,
      }),
    ]);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result1.itemId).not.toBe(result2.itemId);

    // items が2件作成されている
    const itemsSnap = await db.collection('bills').doc(billId).collection('items').get();
    expect(itemsSnap.size).toBe(2);
  });

  it('appendItem中に別Txでstatus=settlingに遷移した場合、遅い方はfailed-precondition', async () => {
    const billId = 'bill_test_concurrent_002';
    const userId = 'user_test_concurrent_002';
    const menuItemId = 'menu_test_concurrent_002';
    
    // テストデータ準備
    await createTestMenuItem(menuItemId, 'ビール', 'drink', 500);
    await createTestBill(billId, userId, 'open');

    // 1つ目の appendItem を完了させる
    const result1 = await appendItem({
      billId,
      item: {
        menuItemId,
        quantity: 1,
        clientNonce: 'nonce-concurrent-3',
      },
      idempotencyKey: `appendItem:${billId}:nonce-concurrent-3`,
    });

    expect(result1.success).toBe(true);

    // 1つ目の appendItem が完了した後、status を 'settling' に変更
    await db.collection('bills').doc(billId).update({
      status: 'settling',
    });

    // 2つ目の appendItem を実行（status='settling' なので失敗する）
    await expect(
      appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 2,
          clientNonce: 'nonce-concurrent-4',
        },
        idempotencyKey: `appendItem:${billId}:nonce-concurrent-4`,
      })
    ).rejects.toThrow(HttpsError);

    try {
      await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 2,
          clientNonce: 'nonce-concurrent-4',
        },
        idempotencyKey: `appendItem:${billId}:nonce-concurrent-4`,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(HttpsError);
      const httpsError = error as HttpsError;
      expect(httpsError.code).toBe('failed-precondition');
    }

    // items は1件のみ（2つ目は失敗）
    const itemsSnap = await db.collection('bills').doc(billId).collection('items').get();
    expect(itemsSnap.size).toBe(1);
  });
});

