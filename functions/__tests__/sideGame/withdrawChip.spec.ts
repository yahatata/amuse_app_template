/**
 * withdrawChip の統合テスト（A-7: flat sideGameChipLogs）
 *
 * Firestore Emulator を使用
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { withdrawChip } from '../../src/domains/sideGame/callables/withdrawChip';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';
import { a7StoreConfigDocument, seedA7StoreConfig } from '../helpers/a7StoreConfig';
import { __setMockConfig, __resetMockConfig } from '../helpers/mockStoreConfig';
import { withdrawSideGameChipLogId } from '../../src/domains/user/services/pointLog';

describe('withdrawChip', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-default';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    process.env.GCLOUD_PROJECT = projectId;
    testEnv = await initializeTestEnvironment({ projectId });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    delete process.env.WRITE_TODAYS_BILLS_IN_PARALLEL;
    await seedA7StoreConfig(db);
    __setMockConfig(a7StoreConfigDocument());
  });

  afterEach(() => {
    __resetMockConfig();
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

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_withdraw_001',
      });

      await db.collection('users').doc(userId).set({
        userType: 'line',
        sideGameChip: initialBalance,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const adminId = 'admin_test_withdraw_001';
      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          userId,
          amount,
          clientNonce,
        },
      } as any;

      const result = await (withdrawChip as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.userId).toBe(userId);
      expect(result.data.withdrawAmount).toBe(amount);
      expect(result.data.previousBalance).toBe(initialBalance);
      expect(result.data.newBalance).toBe(initialBalance - amount);
      expect(result.data.reused).toBe(false);

      const chipsSnapshot = await db
        .collection('bills')
        .doc(billId)
        .collection('sideGameChips')
        .get();
      expect(chipsSnapshot.size).toBe(1);
      expect(chipsSnapshot.docs[0].data().action).toBe('withdraw');
      expect(chipsSnapshot.docs[0].data().chipQty).toBe(amount);

      const userDoc = await db.collection('users').doc(userId).get();
      expect(userDoc.data()!.sideGameChip).toBe(initialBalance - amount);

      const log = await db
        .collection('users')
        .doc(userId)
        .collection('sideGameChipLogs')
        .doc(withdrawSideGameChipLogId(result.data.chipId))
        .get();
      expect(log.exists).toBe(true);
      expect(log.data()!.reasonType).toBe('withdraw');
      expect(log.data()!.balanceBefore).toBe(initialBalance);
      expect(log.data()!.changeAmount).toBe(-amount);
      expect(log.data()!.balanceAfter).toBe(initialBalance - amount);
    });
  });

  describe('idempotent replay', () => {
    it('同じ clientNonce で2回呼び出すと、残高とログが1回分のみ適用されること', async () => {
      const userId = 'user_test_withdraw_idempotent_001';
      const billId = 'bill_test_withdraw_idempotent_001';
      const amount = 200;
      const clientNonce = 'withdraw_nonce_idemp_001';
      const initialBalance = 1000;

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_withdraw_idempotent_001',
      });

      await db.collection('users').doc(userId).set({
        userType: 'line',
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

      const result1 = await (withdrawChip as any).run(mockRequest);
      expect(result1.success).toBe(true);
      expect(result1.data.reused).toBe(false);

      const result2 = await (withdrawChip as any).run(mockRequest);
      expect(result2.success).toBe(true);
      expect(result2.data.reused).toBe(true);

      const userDoc2 = await db.collection('users').doc(userId).get();
      expect(userDoc2.data()!.sideGameChip).toBe(initialBalance - amount);

      const chipsSnapshot = await db
        .collection('bills')
        .doc(billId)
        .collection('sideGameChips')
        .get();
      expect(chipsSnapshot.size).toBe(1);

      const logs = await db
        .collection('users')
        .doc(userId)
        .collection('sideGameChipLogs')
        .get();
      const withdrawLogs = logs.docs.filter((d) => d.id.startsWith('withdraw_'));
      expect(withdrawLogs.length).toBe(1);
    });
  });
});
