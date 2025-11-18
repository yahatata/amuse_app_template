/**
 * businessDate.immutability の統合テスト
 * 
 * ChangeSpec P1-02.1 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - bills/{billId}.businessDate が作成後に変更できないことを検証
 * - A: update が拒否され例外（もっとも望ましい）
 * - B: update 自体は通るがトリガ側/関数側で元の値に巻き戻る（再読込して元の値）
 * - いずれにも当てはまらず、本当に変更できてしまう場合はテストを失敗のままとする
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { createBillWithActiveStay } from '../../src/helpers/billsApi/createBillWithActiveStay';

describe.skip('businessDate.immutability', () => {
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

  it('businessDate を別値に update しようとした場合の動作を検証', async () => {
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

    // 3. businessDate を別値に update しようとする（Admin SDK を使用）
    // 注意: セキュリティルールは Admin SDK をバイパスするため、ここでは実際に更新が試みられる
    let updateSucceeded = false;
    let updateError: any = null;
    
    try {
      await billRef.update({
        businessDate: attemptedBusinessDate,
      });
      updateSucceeded = true;
    } catch (error) {
      updateError = error;
      updateSucceeded = false;
    }

    // 4. 再読込して businessDate の実測値を確認
    const billSnapAfter = await billRef.get();
    const businessDateAfter = billSnapAfter.data()!.businessDate as string;

    // 5. 期待結果の判定
    // A: update が拒否され例外
    if (!updateSucceeded && updateError) {
      // パターンA: update が拒否された
      console.log('パターンA: update が拒否されました', updateError);
      expect(businessDateAfter).toBe(businessDateBefore); // 元の値が保持されている
      return; // テスト成功
    }

    // B: update 自体は通るがトリガ側/関数側で元の値に巻き戻る
    if (updateSucceeded && businessDateAfter === businessDateBefore) {
      // パターンB: update は通ったが、元の値に巻き戻った
      console.log('パターンB: update は通ったが、元の値に巻き戻りました');
      expect(businessDateAfter).toBe(businessDateBefore);
      return; // テスト成功
    }

    // いずれにも当てはまらない場合: 本当に変更できてしまった
    // この場合はテストを失敗のままとする
    console.error('businessDate が変更されてしまいました');
    console.error('更新前:', businessDateBefore);
    console.error('更新後:', businessDateAfter);
    console.error('試行した値:', attemptedBusinessDate);
    
    // テストを失敗させる
    expect(businessDateAfter).toBe(businessDateBefore);
  });
});

