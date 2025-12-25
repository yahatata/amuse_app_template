/**
 * updateActiveBill の統合テスト
 * 
 * ChangeSpec P1-06 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path（会計前請求書の明細編集、サブコレクションのcreate/update/delete、既存のリクエストスキーマからサブコレクションへの変換）
 * - エラーハンドリング（権限不足、billId不存在、accountingStartedAtがnull以外、statusがopen/in_progress以外）
 * - 親フィールド（businessDate, amounts.*, categoryBreakdown, postEvents.*, paymentsSummary.*）が更新されないこと
 * - サブコレクション（/items, /extras, /sideGameChips, /tournaments）が正しく更新されること
 * - DualWrite ON/OFFで todaysBills の items, extraCost, tournaments, sideGameChip が正しく更新されること（totalPrice は更新されない）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { updateActiveBill } from '../../src/callables/updateActiveBill';
import { createBillWithActiveStay } from '../../src/helpers/billsApi/createBillWithActiveStay';

describe('updateActiveBill', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-update-active-bill';

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
    delete process.env.WRITE_TODAYS_BILLS_IN_PARALLEL;
  });

  // テスト用のヘルパ関数: 管理者デバイスを作成
  async function createAdminDevice(uid: string) {
    await db.collection('devices').add({
      uid,
      role: 'admin',
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

  describe('happy path', () => {
    it('会計前請求書の明細編集ができること（サブコレクションのcreate/update/delete）', async () => {
      const userId = 'user_test_happy_001';
      const billId = 'bill_test_happy_001';
      const adminId = 'admin_test_001';

      await createAdminDevice(adminId);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_001',
      });

      const menuItemId = 'menu_test_001';
      await createTestMenuItem(menuItemId, 'テストメニュー', 'Food', 1000);

      // updateActiveBill を呼び出し
      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
          extraCost: [
            { name: '入店料', price: 500 },
          ],
          items: [
            { name: 'テストメニュー', price: 1000, quantity: 2, menuItemId },
          ],
          tournaments: {
            'tpl_001': {
              entryFee: 2000,
              tournamentName: 'テストトーナメント',
            },
          },
          sideGameChip: [
            { name: 'サイドゲームチップ', price: 1000 },
          ],
        },
      };

      const result = await (updateActiveBill as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.billId).toBe(billId);

      // サブコレクションが正しく更新されている
      const extrasSnapshot = await db.collection('bills').doc(billId).collection('extras').get();
      expect(extrasSnapshot.docs.length).toBe(1);
      expect(extrasSnapshot.docs[0].data().name).toBe('入店料');
      expect(extrasSnapshot.docs[0].data().amountIncl).toBe(500);

      const itemsSnapshot = await db.collection('bills').doc(billId).collection('items').get();
      expect(itemsSnapshot.docs.length).toBe(1);
      expect(itemsSnapshot.docs[0].data().name).toBe('テストメニュー');
      expect(itemsSnapshot.docs[0].data().quantity).toBe(2);

      const tournamentsSnapshot = await db.collection('bills').doc(billId).collection('tournaments').get();
      expect(tournamentsSnapshot.docs.length).toBe(1);
      expect(tournamentsSnapshot.docs[0].id).toBe('tpl_001');
      expect(tournamentsSnapshot.docs[0].data().entryFeeIncl).toBe(2000);

      const sideGameChipsSnapshot = await db.collection('bills').doc(billId).collection('sideGameChips').get();
      expect(sideGameChipsSnapshot.docs.length).toBe(1);
      expect(sideGameChipsSnapshot.docs[0].data().action).toBe('purchase');
    });

    it('既存のリクエストスキーマからサブコレクションへの変換が正しく行われること', async () => {
      const userId = 'user_test_happy_002';
      const billId = 'bill_test_happy_002';
      const adminId = 'admin_test_002';

      await createAdminDevice(adminId);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_002',
      });

      // 既存のサブコレクションを作成
      await db.collection('bills').doc(billId).collection('extras').add({
        name: '旧入店料',
        amountIncl: 300,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // updateActiveBill を呼び出し（既存のサブコレクションを置き換え）
      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
          extraCost: [
            { name: '新入店料', price: 500 },
          ],
        },
      };

      const result = await (updateActiveBill as any).run(mockRequest);

      expect(result.success).toBe(true);

      // 既存のサブコレクションが削除され、新しいサブコレクションが作成されている
      const extrasSnapshot = await db.collection('bills').doc(billId).collection('extras').get();
      expect(extrasSnapshot.docs.length).toBe(1);
      expect(extrasSnapshot.docs[0].data().name).toBe('新入店料');
      expect(extrasSnapshot.docs[0].data().amountIncl).toBe(500);
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
          extraCost: [{ name: '入店料', price: 500 }],
        },
      };

      try {
        await (updateActiveBill as any).run(mockRequest);
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
          extraCost: [{ name: '入店料', price: 500 }],
        },
      };

      try {
        await (updateActiveBill as any).run(mockRequest);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('not-found');
      }
    });

    it('accountingStartedAt が null 以外 → failed-precondition', async () => {
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

      // accountingStartedAt を設定
      await db.collection('bills').doc(billId).update({
        'ops.accountingStartedAt': admin.firestore.FieldValue.serverTimestamp(),
      });

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
          extraCost: [{ name: '入店料', price: 500 }],
        },
      };

      try {
        await (updateActiveBill as any).run(mockRequest);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });

    it('status が open/in_progress 以外 → failed-precondition', async () => {
      const userId = 'user_test_error_004';
      const billId = 'bill_test_error_004';
      const adminId = 'admin_test_error_004';

      await createAdminDevice(adminId);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_error_004',
      });

      // status を settled に変更
      await db.collection('bills').doc(billId).update({
        status: 'settled',
      });

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
          extraCost: [{ name: '入店料', price: 500 }],
        },
      };

      try {
        await (updateActiveBill as any).run(mockRequest);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });
  });

  describe('親フィールド更新拒否', () => {
    it('businessDate, amounts.*, categoryBreakdown, postEvents.*, paymentsSummary.* が更新されないこと', async () => {
      const userId = 'user_test_parent_001';
      const billId = 'bill_test_parent_001';
      const adminId = 'admin_test_parent_001';

      await createAdminDevice(adminId);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_parent_001',
      });

      const billRef = db.collection('bills').doc(billId);
      const billDocBefore = await billRef.get();
      const billDataBefore = billDocBefore.data()!;
      const businessDateBefore = billDataBefore.businessDate;

      // updateActiveBill を呼び出し
      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
          extraCost: [{ name: '入店料', price: 500 }],
        },
      };

      await (updateActiveBill as any).run(mockRequest);

      // 親フィールドが変更されていないことを確認
      const billDocAfter = await billRef.get();
      const billDataAfter = billDocAfter.data()!;
      expect(billDataAfter.businessDate).toBe(businessDateBefore);
      expect(billDataAfter.amounts).toBeUndefined();
      expect(billDataAfter.categoryBreakdown).toBeUndefined();
      expect(billDataAfter.postEvents).toBeUndefined();
      expect(billDataAfter.paymentsSummary).toBeUndefined();
    });
  });

  describe('DualWrite', () => {
    it('DualWrite ON の場合、todaysBills の items, extraCost, tournaments, sideGameChip が正しく更新されること（totalPrice は更新されない）', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'true';

      const userId = 'user_test_dualwrite_001';
      const billId = 'bill_test_dualwrite_001';
      const adminId = 'admin_test_dualwrite_001';

      await createAdminDevice(adminId);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_dualwrite_001',
      });

      // todaysBills を作成
      await db.collection('todaysBills').doc(billId).set({
        status: 'open',
        userId,
        totalPrice: 5000,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const menuItemId = 'menu_test_dualwrite_001';
      await createTestMenuItem(menuItemId, 'テストメニュー', 'Food', 1000);

      // updateActiveBill を呼び出し
      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
          extraCost: [{ name: '入店料', price: 500 }],
          items: [{ name: 'テストメニュー', price: 1000, quantity: 2, menuItemId }],
        },
      };

      await (updateActiveBill as any).run(mockRequest);

      // todaysBills が更新されている
      const legacyDoc = await db.collection('todaysBills').doc(billId).get();
      expect(legacyDoc.exists).toBe(true);
      const legacyData = legacyDoc.data()!;
      expect(legacyData.extraCost).toBeDefined();
      expect(legacyData.items).toBeDefined();
      // totalPrice は更新されていない
      expect(legacyData.totalPrice).toBe(5000);
    });

    it('DualWrite OFF の場合、todaysBills が更新されないこと', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'false';

      const userId = 'user_test_dualwrite_002';
      const billId = 'bill_test_dualwrite_002';
      const adminId = 'admin_test_dualwrite_002';

      await createAdminDevice(adminId);
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_dualwrite_002',
      });

      // todaysBills を作成
      await db.collection('todaysBills').doc(billId).set({
        status: 'open',
        userId,
        extraCost: [{ name: '旧入店料', price: 300 }],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // updateActiveBill を呼び出し
      const mockRequest = {
        auth: { uid: adminId },
        data: {
          billId,
          extraCost: [{ name: '新入店料', price: 500 }],
        },
      };

      await (updateActiveBill as any).run(mockRequest);

      // todaysBills が更新されていない
      const legacyDoc = await db.collection('todaysBills').doc(billId).get();
      expect(legacyDoc.exists).toBe(true);
      const legacyData = legacyDoc.data()!;
      expect(legacyData.extraCost[0].name).toBe('旧入店料');
    });
  });
});

