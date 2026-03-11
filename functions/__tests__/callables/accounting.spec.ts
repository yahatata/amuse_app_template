/**
 * accounting の統合テスト（startAccounting部分）
 * 
 * ChangeSpec P1-06 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path（会計開始、status='settling'、ops.accountingStartedAt設定）
 * - エラーハンドリング（権限不足、billId不存在、statusがopen/in_progress以外）
 * - 支払方法処理とユーザー残高差し引きが現状維持で動作すること
 * - DualWrite ON/OFFで todaysBills.status が正しく更新されること
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { startAccounting } from '../../src/domains/bills/callables/accounting';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';
import { appendItem } from '../../src/domains/bills/repos/appendItem';

describe('accounting (startAccounting)', () => {
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
    delete process.env.WRITE_TODAYS_BILLS_IN_PARALLEL;
  });

  // テスト用のヘルパ関数: 管理者デバイスを作成
  async function createAdminDevice(uid: string) {
    await db.collection('devices').add({
      uid,
      role: 'admin',
      status: 'active',
      name: 'Test Admin Device',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

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

  // テスト用のヘルパ関数: ユーザーを作成
  async function createTestUser(userId: string, pointA: number = 0, pointB: number = 0, sideGameChip: number = 0) {
    await db.collection('users').doc(userId).set({
      pointA,
      pointB,
      sideGameChip,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  describe('happy path', () => {
    it('会計開始ができること（status=settling、ops.accountingStartedAt設定）', async () => {
      const userId = 'user_test_happy_001';
      const billId = 'bill_test_happy_001';
      const adminId = 'admin_test_001';
      const clientNonce = 'nonce_test_001';

      await createAdminDevice(adminId);
      await createTestUser(userId, 10000, 5000, 100);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_happy_001',
      });

      const menuItemId = 'menu_test_happy_001';
      await createTestMenuItem(menuItemId, 'テストメニュー', 'Food', 1000);

      // アイテムを追加
      await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 2,
          clientNonce: 'nonce_item_001',
        },
        idempotencyKey: `appendItem:${billId}:nonce_item_001`,
      });

      // startAccounting を呼び出し
      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
          clientNonce,
          paymentMethodsByAmount: {
            cash: 2000,
          },
        },
      };

      const result = await (startAccounting as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.billId).toBe(billId);
      expect(result.status).toBe('settling');
      expect(result.ops.accountingStartedAt).toBeDefined();
      expect(result.ops.accountingStartedBy).toBe(adminId);

      // bills/{billId} が更新されている
      const billDoc = await db.collection('bills').doc(billId).get();
      expect(billDoc.exists).toBe(true);
      const billData = billDoc.data()!;
      expect(billData.status).toBe('settling');
      expect(billData.ops?.accountingStartedAt).toBeDefined();
      expect(billData.ops?.accountingStartedBy).toBe(adminId);
    });

    it('meta.paymentMethodsByCategory が保存されること', async () => {
      const userId = 'user_test_meta_001';
      const billId = 'bill_test_meta_001';
      const adminId = 'admin_test_meta_001';
      const clientNonce = 'nonce_test_meta_001';

      await createAdminDevice(adminId);
      await createTestUser(userId, 10000, 5000, 100);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_meta_001',
      });

      const menuItemId = 'menu_test_meta_001';
      await createTestMenuItem(menuItemId, 'テストメニュー', 'Food', 1000);

      // アイテムを追加
      await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 2,
          clientNonce: 'nonce_item_meta_001',
        },
        idempotencyKey: `appendItem:${billId}:nonce_item_meta_001`,
      });

      // startAccounting を呼び出し（paymentMethodsByCategory を指定）
      const paymentMethodsByCategory = {
        items: 'cash',
        extraCost: 'credit_card',
      };

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
          clientNonce,
          paymentMethodsByAmount: { cash: 2000 },
          paymentMethodsByCategory,
        },
      };

      await (startAccounting as any).run(mockRequest);

      // bills/{billId} の meta.paymentMethodsByCategory が保存されている
      const billDoc = await db.collection('bills').doc(billId).get();
      expect(billDoc.exists).toBe(true);
      const billData = billDoc.data()!;
      expect(billData.meta?.paymentMethodsByCategory).toBeDefined();
      expect(billData.meta?.paymentMethodsByCategory).toEqual(paymentMethodsByCategory);
    });
  });

  describe('エラーハンドリング', () => {
    it('権限不足 → permission-denied', async () => {
      const userId = 'user_test_error_001';
      const billId = 'bill_test_error_001';
      const nonAdminId = 'non_admin_001';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_error_001',
      });

      const mockRequest = {
        auth: { uid: nonAdminId },
        data: {
          billId,
          clientNonce: 'nonce_test_001',
          paymentMethodsByAmount: {
            cash: 1000,
          },
        },
      };

      try {
        await (startAccounting as any).run(mockRequest);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('permission-denied');
      }
    });

    it('billId 不存在 → not-found', async () => {
      const adminId = 'admin_test_error_002';

      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId: 'bill_not_exist',
          clientNonce: 'nonce_test_002',
          paymentMethodsByAmount: {
            cash: 1000,
          },
        },
      };

      try {
        await (startAccounting as any).run(mockRequest);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('not-found');
      }
    });

    it('status が settled の場合 → failed-precondition', async () => {
      const userId = 'user_test_error_003';
      const billId = 'bill_test_error_003';
      const adminId = 'admin_test_error_003';

      await createAdminDevice(adminId);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_error_003',
      });

      // status を settled に変更
      await db.collection('bills').doc(billId).update({
        status: 'settled',
      });

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
          clientNonce: 'nonce_test_003',
          paymentMethodsByAmount: {
            cash: 1000,
          },
        },
      };

      try {
        await (startAccounting as any).run(mockRequest);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });
  });

  describe('支払方法処理とユーザー残高差し引き', () => {
    it('支払方法処理とユーザー残高差し引きが現状維持で動作すること', async () => {
      const userId = 'user_test_payment_001';
      const billId = 'bill_test_payment_001';
      const adminId = 'admin_test_payment_001';
      const clientNonce = 'nonce_test_payment_001';

      await createAdminDevice(adminId);
      await createTestUser(userId, 10000, 5000, 100);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_payment_001',
      });

      const menuItemId = 'menu_test_payment_001';
      await createTestMenuItem(menuItemId, 'テストメニュー', 'Food', 1000);

      // アイテムを追加
      await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 1,
          clientNonce: 'nonce_item_payment_001',
        },
        idempotencyKey: `appendItem:${billId}:nonce_item_payment_001`,
      });

      // startAccounting を呼び出し（pointA で支払い）
      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
          clientNonce,
          paymentMethodsByAmount: {
            pointA: 1000,
          },
        },
      };

      const userDocBefore = await db.collection('users').doc(userId).get();
      const userDataBefore = userDocBefore.data()!;
      const pointABefore = userDataBefore.pointA || 0;

      await (startAccounting as any).run(mockRequest);

      // ユーザー残高が差し引かれている
      const userDocAfter = await db.collection('users').doc(userId).get();
      const userDataAfter = userDocAfter.data()!;
      const pointAAfter = userDataAfter.pointA || 0;
      expect(pointAAfter).toBe(pointABefore - 1000);
    });
  });

  describe('DualWrite', () => {
    it('DualWrite ON の場合、todaysBills.status が正しく更新されること', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'true';

      const userId = 'user_test_dualwrite_001';
      const billId = 'bill_test_dualwrite_001';
      const adminId = 'admin_test_dualwrite_001';
      const clientNonce = 'nonce_test_dualwrite_001';

      await createAdminDevice(adminId);
      await createTestUser(userId);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_dualwrite_001',
      });

      const menuItemId = 'menu_test_dualwrite_001';
      await createTestMenuItem(menuItemId, 'テストメニュー', 'Food', 1000);

      // アイテムを追加
      await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 1,
          clientNonce: 'nonce_item_dualwrite_001',
        },
        idempotencyKey: `appendItem:${billId}:nonce_item_dualwrite_001`,
      });

      // todaysBills を作成
      await db.collection('todaysBills').doc(billId).set({
        status: 'open',
        userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
          clientNonce,
          paymentMethodsByAmount: {
            cash: 1000,
          },
        },
      };

      await (startAccounting as any).run(mockRequest);

      // todaysBills.status が更新されている
      const legacyDoc = await db.collection('todaysBills').doc(billId).get();
      expect(legacyDoc.exists).toBe(true);
      const legacyData = legacyDoc.data()!;
      expect(legacyData.status).toBe('settling');
    });

    it('DualWrite OFF の場合、todaysBills.status が更新されないこと', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'false';

      const userId = 'user_test_dualwrite_002';
      const billId = 'bill_test_dualwrite_002';
      const adminId = 'admin_test_dualwrite_002';
      const clientNonce = 'nonce_test_dualwrite_002';

      await createAdminDevice(adminId);
      await createTestUser(userId);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_dualwrite_002',
      });

      const menuItemId = 'menu_test_dualwrite_002';
      await createTestMenuItem(menuItemId, 'テストメニュー', 'Food', 1000);

      // アイテムを追加
      await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 1,
          clientNonce: 'nonce_item_dualwrite_002',
        },
        idempotencyKey: `appendItem:${billId}:nonce_item_dualwrite_002`,
      });

      // todaysBills を作成
      await db.collection('todaysBills').doc(billId).set({
        status: 'open',
        userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
          clientNonce,
          paymentMethodsByAmount: {
            cash: 1000,
          },
        },
      };

      await (startAccounting as any).run(mockRequest);

      // todaysBills.status が更新されていない
      const legacyDoc = await db.collection('todaysBills').doc(billId).get();
      expect(legacyDoc.exists).toBe(true);
      const legacyData = legacyDoc.data()!;
      expect(legacyData.status).toBe('open');
    });
  });
});

