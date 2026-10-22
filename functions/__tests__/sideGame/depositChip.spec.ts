/**
 * depositChip の統合テスト（A-7: enabled ゲート + before/after ログ）
 *
 * Firestore Emulator を使用
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { depositChip } from '../../src/domains/sideGame/callables/depositChip';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';
import { a7StoreConfigDocument, seedA7StoreConfig } from '../helpers/a7StoreConfig';
import { __setMockConfig, __resetMockConfig } from '../helpers/mockStoreConfig';
import { depositSideGameChipLogId } from '../../src/domains/user/services/pointLog';

describe('depositChip', () => {
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
    it('appendSideGameChip が成功し、ユーザ残高が増加し、sideGameChipLogs に1件追加されること', async () => {
      const userId = 'user_test_deposit_001';
      const billId = 'bill_test_deposit_001';
      const amount = 300;
      const clientNonce = 'deposit_nonce_001';
      const initialBalance = 1000;

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_deposit_001',
      });

      await db.collection('users').doc(userId).set({
        userType: 'line',
        sideGameChip: initialBalance,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const adminId = 'admin_test_deposit_001';
      await createAdminDevice(adminId);

      const result = await (depositChip as any).run({
        auth: { uid: adminId },
        data: { userId, amount, clientNonce },
      });

      expect(result.success).toBe(true);
      expect(result.data.userId).toBe(userId);
      expect(result.data.depositAmount).toBe(amount);
      expect(result.data.previousBalance).toBe(initialBalance);
      expect(result.data.newBalance).toBe(initialBalance + amount);
      expect(result.data.reused).toBe(false);

      const chipsSnapshot = await db
        .collection('bills')
        .doc(billId)
        .collection('sideGameChips')
        .get();
      expect(chipsSnapshot.size).toBe(1);
      expect(chipsSnapshot.docs[0].data().action).toBe('deposit');
      expect(chipsSnapshot.docs[0].data().chipQty).toBe(amount);

      const userDoc = await db.collection('users').doc(userId).get();
      expect(userDoc.data()!.sideGameChip).toBe(initialBalance + amount);

      const log = await db
        .collection('users')
        .doc(userId)
        .collection('sideGameChipLogs')
        .doc(depositSideGameChipLogId(result.data.chipId))
        .get();
      expect(log.exists).toBe(true);
      expect(log.data()!.reasonType).toBe('deposit');
      expect(log.data()!.balanceBefore).toBe(initialBalance);
      expect(log.data()!.changeAmount).toBe(amount);
      expect(log.data()!.balanceAfter).toBe(initialBalance + amount);
    });
  });

  describe('idempotent replay', () => {
    it('同じ clientNonce で2回呼び出すと、残高とログが1回分のみ適用されること', async () => {
      const userId = 'user_test_deposit_idempotent_001';
      const billId = 'bill_test_deposit_idempotent_001';
      const amount = 300;
      const clientNonce = 'deposit_nonce_idemp_001';
      const initialBalance = 1000;

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_deposit_idempotent_001',
      });

      await db.collection('users').doc(userId).set({
        userType: 'line',
        sideGameChip: initialBalance,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const adminId = 'admin_test_deposit_idempotent_001';
      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: { userId, amount, clientNonce },
      } as any;

      const result1 = await (depositChip as any).run(mockRequest);
      expect(result1.success).toBe(true);
      expect(result1.data.reused).toBe(false);

      const result2 = await (depositChip as any).run(mockRequest);
      expect(result2.success).toBe(true);
      expect(result2.data.reused).toBe(true);

      const userDoc2 = await db.collection('users').doc(userId).get();
      expect(userDoc2.data()!.sideGameChip).toBe(initialBalance + amount);

      const chipsSnapshot = await db
        .collection('bills')
        .doc(billId)
        .collection('sideGameChips')
        .get();
      expect(chipsSnapshot.size).toBe(1);

      const logs = await db.collection('users').doc(userId).collection('sideGameChipLogs').get();
      const depositLogs = logs.docs.filter((d) => d.id.startsWith('deposit_'));
      expect(depositLogs.length).toBe(1);
    });
  });

  describe('table device', () => {
    async function createTableDevice(uid: string, tableId: string) {
      await db.collection('devices').doc(`device_${uid}`).set({
        uid,
        role: 'table',
        status: 'active',
        name: `Table Device ${tableId}`,
        options: {},
        optionParams: {
          table_device_table: { tableId },
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    it('role: table かつ卓紐付けありなら depositChip できること', async () => {
      const userId = 'user_table_deposit_1';
      const billId = 'bill_table_deposit_1';
      const callerUid = 'table_device_deposit_1';
      const amount = 100;
      const clientNonce = 'deposit_table_nonce_1';

      await createTableDevice(callerUid, 'TableA');
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_table_deposit_1',
      });
      await db.collection('users').doc(userId).set({
        userType: 'line',
        sideGameChip: 500,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const result = await (depositChip as any).run({
        auth: { uid: callerUid },
        data: { userId, amount, clientNonce },
      });

      expect(result.success).toBe(true);
      expect(result.data.newBalance).toBe(600);
    });
  });
});
