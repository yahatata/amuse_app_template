/**
 * businessDate.immutability の統合テスト
 * 
 * ChangeSpec P1-06 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - bills/{billId}.businessDate が作成後に変更できないことを検証
 * - P1-06 では updateBill ヘルパAPIによるパターンA（update レイヤで拒否）を検証
 * - パターンB（トリガによる巻き戻し）は P1-11 で別テストに切り出す
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';
import { updateBill } from '../../src/domains/bills/repos/updateBill';

describe('businessDate.immutability', () => {
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

  it('updateBill ヘルパAPI経由で businessDate の変更が拒否されること（パターンA）', async () => {
    process.env.STORE_CLOSE_HOUR = '27';
    
    const userId = 'user-test-immutability-001';
    const billId = 'bill-test-immutability-001';
    const attemptedBusinessDate = '2025-12-31'; // 別の日付に変更を試みる

    // 1. createBillWithActiveStay で bills/{billId} を作成
    const createResult = await createBillWithActiveStay({
      billId,
      userId,
      pokerName: 'テストユーザー',
      idempotencyKey: `create-${billId}`,
    });

    expect(createResult.success).toBe(true);

    // 2. 作成後の businessDate を確認
    const billRef = db.collection('bills').doc(billId);
    const billSnapBefore = await billRef.get();
    expect(billSnapBefore.exists).toBe(true);
    const businessDateBefore = billSnapBefore.data()!.businessDate as string;
    expect(businessDateBefore).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // 3. updateBill ヘルパAPI経由で businessDate を別値に update しようとする
    try {
      await updateBill({
        billId,
        updates: {
          businessDate: attemptedBusinessDate,
        } as any, // 型チェックを回避（businessDate は許可されていないフィールド）
      });
      fail('Should have thrown an error');
    } catch (error: any) {
      // パターンA: update が拒否された（invalid-argument）
      expect(error.code).toBe('invalid-argument');
      expect(error.message).toContain('businessDate');
    }

    // 4. 再読込して businessDate の実測値を確認（変更されていないこと）
    const billSnapAfter = await billRef.get();
    const businessDateAfter = billSnapAfter.data()!.businessDate as string;
    expect(businessDateAfter).toBe(businessDateBefore); // 元の値が保持されている
  });

  // 注意: パターンB（トリガによる巻き戻し）は P1-11 で別テストに切り出す
});

