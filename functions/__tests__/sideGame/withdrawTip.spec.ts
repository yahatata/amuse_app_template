/**
 * withdrawTip の統合テスト
 * 
 * ChangeSpec P1-03 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - 正常系（初回呼び出し）: appendSideGameChip 成功、ユーザ残高減少、sideGameChipLogs 追加
 * - idempotent replay: 同じ clientNonce で2回呼び出し、残高とログが1回分のみ
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { withdrawTip } from '../../src/domains/sideGame/callables/withdrawTip';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';

describe('withdrawTip', () => {
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

  async function createAdminDevice(uid: string) {
    await db.collection('devices').add({
      uid,
      role: 'admin',
      status: 'active',
      name: 'Test Admin Device',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  describe('正常系（初回呼び出し）', () => {
    it('appendSideGameChip が成功し、ユーザ残高が減少し、sideGameChipLogs に1件追加されること', async () => {
      const userId = 'user_test_withdraw_001';
      const billId = 'bill_test_withdraw_001';
      const amount = 200;
      const clientNonce = 'withdraw_nonce_001';
      const initialBalance = 1000;

      // テストデータ準備
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_withdraw_001',
      });

      // ユーザーを作成し、初期残高を設定
      await db.collection('users').doc(userId).set({
        sideGameChip: initialBalance,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const adminId = 'admin_test_withdraw_001';
      await createAdminDevice(adminId);

      // withdrawTip を呼び出す
      const mockRequest = {
        auth: { uid: adminId },
        data: {
          userId,
          amount,
          clientNonce,
        },
      } as any;

      const result = await (withdrawTip as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.userId).toBe(userId);
      expect(result.data.withdrawAmount).toBe(amount);
      expect(result.data.previousBalance).toBe(initialBalance);
      expect(result.data.newBalance).toBe(initialBalance - amount);
      expect(result.data.reused).toBe(false);

      // /bills/{billId}/sideGameChips に withdraw の doc が1件作成されている
      const chipsSnapshot = await db.collection('bills').doc(billId)
        .collection('sideGameChips').get();
      expect(chipsSnapshot.size).toBe(1);
      const chipDoc = chipsSnapshot.docs[0];
      const chipData = chipDoc.data();
      expect(chipData.action).toBe('withdraw');
      expect(chipData.chipQty).toBe(amount);

      // users/{userId}.sideGameChip が amount 分だけ減少している
      const userDoc = await db.collection('users').doc(userId).get();
      const finalBalance = userDoc.data()!.sideGameChip as number;
      expect(finalBalance).toBe(initialBalance - amount);

      // users/{userId}/sideGameChipLogs に 1件 の expense ログが追加されている
      const today = new Date().toISOString().split('T')[0];
      const logsDoc = await db.collection('users').doc(userId)
        .collection('sideGameChipLogs').doc(today).get();
      expect(logsDoc.exists).toBe(true);
      const logsData = logsDoc.data()!;
      expect(logsData.logs).toBeDefined();
      const logEntries = Object.values(logsData.logs || {});
      const expenseLogs = logEntries.filter((log: any) => log.category === 'expense');
      expect(expenseLogs.length).toBe(1);
      const expenseLog = expenseLogs[0] as any;
      expect(expenseLog.category).toBe('expense');
      expect(expenseLog.amountDelta).toBe(-amount);
      expect(expenseLog.reasonType).toBe('sideGame');
    });
  });

  describe('idempotent replay', () => {
    it('同じ clientNonce で2回呼び出すと、残高とログが1回分のみ適用されること', async () => {
      const userId = 'user_test_withdraw_idempotent_001';
      const billId = 'bill_test_withdraw_idempotent_001';
      const amount = 200;
      const clientNonce = 'withdraw_nonce_idemp_001';
      const initialBalance = 1000;

      // テストデータ準備
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_withdraw_idempotent_001',
      });

      // ユーザーを作成し、初期残高を設定
      await db.collection('users').doc(userId).set({
        sideGameChip: initialBalance,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const adminId = 'admin_test_withdraw_idempotent_001';
      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          userId,
          amount,
          clientNonce,
        },
      } as any;

      // 1回目の実行
      const result1 = await (withdrawTip as any).run(mockRequest);
      expect(result1.success).toBe(true);
      expect(result1.data.reused).toBe(false);

      // 1回目後の残高を確認
      const userDoc1 = await db.collection('users').doc(userId).get();
      const balance1 = userDoc1.data()!.sideGameChip as number;
      expect(balance1).toBe(initialBalance - amount);

      // 1回目後のログ件数を確認
      const today = new Date().toISOString().split('T')[0];
      const logsDoc1 = await db.collection('users').doc(userId)
        .collection('sideGameChipLogs').doc(today).get();
      const logsData1 = logsDoc1.data()!;
      const logEntries1 = Object.values(logsData1.logs || {});
      const expenseLogs1 = logEntries1.filter((log: any) => log.category === 'expense');
      expect(expenseLogs1.length).toBe(1);

      // 2回目の実行（同一 clientNonce）
      const result2 = await (withdrawTip as any).run(mockRequest);
      expect(result2.success).toBe(true);
      expect(result2.data.reused).toBe(true); // 2回目は reused: true

      // 2回目後の残高を確認（1回分だけ減少したまま）
      const userDoc2 = await db.collection('users').doc(userId).get();
      const balance2 = userDoc2.data()!.sideGameChip as number;
      expect(balance2).toBe(initialBalance - amount); // 増えていない

      // 2回目後のログ件数を確認（1件のまま）
      const logsDoc2 = await db.collection('users').doc(userId)
        .collection('sideGameChipLogs').doc(today).get();
      const logsData2 = logsDoc2.data()!;
      const logEntries2 = Object.values(logsData2.logs || {});
      const expenseLogs2 = logEntries2.filter((log: any) => log.category === 'expense');
      expect(expenseLogs2.length).toBe(1); // 2回目で増えていない

      // /bills/{billId}/sideGameChips の doc 数は1つのまま
      const chipsSnapshot = await db.collection('bills').doc(billId)
        .collection('sideGameChips').get();
      expect(chipsSnapshot.size).toBe(1);
    });
  });
});

