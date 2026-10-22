/**
 * A-7 Phase 5: setInitialUserBalances / migrate 用 Emulator 統合 + 単体
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { setInitialUserBalances } from '../../src/domains/user/callables/setInitialUserBalances';
import { migrateStoreManagedUserToLine } from '../../src/domains/user/callables/migrateStoreManagedUserToLine';
import {
  validateInitialBalancesPatch,
  mergeBalancesAfterInitialPatch,
} from '../../src/domains/user/helpers/validateBalanceSet';
import { enabledBalanceIds } from '../../src/domains/user/helpers/userBalances';
import { a7StoreConfigDocument, seedA7StoreConfig } from '../helpers/a7StoreConfig';
import { __setMockConfig, __resetMockConfig } from '../helpers/mockStoreConfig';

describe('A-7 Phase5 A-6 balances', () => {
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
    await Promise.all(admin.apps.map((app) => app?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
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
      name: 'Admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  describe('validateInitialBalancesPatch', () => {
    it('有効 ID のみ・完全一致を要求する', () => {
      const enabled = enabledBalanceIds({
        pointSettings: {
          pointA: { enabled: true },
          pointB: { enabled: true },
          pointC: { enabled: false },
          pointD: { enabled: false },
          pointE: { enabled: false },
        },
        sideGameChipSettings: { enabled: true },
      });
      expect(enabled).toEqual(['pointA', 'pointB', 'sideGameChip']);

      expect(
        validateInitialBalancesPatch(
          { pointA: 1, pointB: 2, sideGameChip: 3 },
          enabled,
        ),
      ).toEqual({ pointA: 1, pointB: 2, sideGameChip: 3 });

      expect(() =>
        validateInitialBalancesPatch({ pointA: 1, pointB: 2 }, enabled),
      ).toThrow(expect.objectContaining({ errorKey: 'INVALID_BALANCE' }));

      expect(() =>
        validateInitialBalancesPatch(
          { pointA: 1, pointB: 2, sideGameChip: 3, pointC: 0 },
          enabled,
        ),
      ).toThrow(expect.objectContaining({ errorKey: 'INVALID_BALANCE' }));

      expect(() =>
        validateInitialBalancesPatch(
          { pointA: 1, pointB: 2, sideGameChip: 3, foo: 1 },
          enabled,
        ),
      ).toThrow(expect.objectContaining({ errorKey: 'INVALID_BALANCE' }));
    });

    it('merge は無効枠を保持する', () => {
      const merged = mergeBalancesAfterInitialPatch(
        { pointA: 10, pointB: 20, pointC: 999, sideGameChip: 5 },
        { pointA: 1, pointB: 2, sideGameChip: 3 },
      );
      expect(merged.pointA).toBe(1);
      expect(merged.pointB).toBe(2);
      expect(merged.pointC).toBe(999);
      expect(merged.pointD).toBe(0);
      expect(merged.pointE).toBe(0);
      expect(merged.sideGameChip).toBe(3);
    });
  });

  describe('setInitialUserBalances emulator', () => {
    it('有効残高のみ更新し、無効残高を保持し、ログに全6を保存する', async () => {
      const adminId = 'admin_init';
      const userId = 'user_init';
      await createAdminDevice(adminId);
      await db.collection('users').doc(userId).set({
        userType: 'line',
        pointA: 10,
        pointB: 20,
        pointC: 777,
        pointD: 888,
        sideGameChip: 30,
      });

      const result = await (setInitialUserBalances as any).run({
        auth: { uid: adminId },
        data: {
          targetUserId: userId,
          balances: { pointA: 100, pointB: 200, sideGameChip: 300 },
          confirmOverwrite: true,
          clientNonce: 'n1',
          note: '導入',
        },
      });

      expect(result.success).toBe(true);
      const user = (await db.collection('users').doc(userId).get()).data()!;
      expect(user.pointA).toBe(100);
      expect(user.pointB).toBe(200);
      expect(user.sideGameChip).toBe(300);
      expect(user.pointC).toBe(777);
      expect(user.pointD).toBe(888);
      expect(user.pointE).toBeUndefined();
      expect(user.initialBalanceSetAt).toBeTruthy();

      const logs = await db
        .collection('users')
        .doc(userId)
        .collection('balanceMigrationLogs')
        .get();
      expect(logs.size).toBe(1);
      expect(logs.docs[0].data().balances).toEqual({
        pointA: 100,
        pointB: 200,
        pointC: 777,
        pointD: 888,
        pointE: 0,
        sideGameChip: 300,
      });

      const pointLogs = await db
        .collection('users')
        .doc(userId)
        .collection('pointLogs')
        .get();
      expect(pointLogs.size).toBe(0);
    });

    it('無効ID混入・不足・不正値を拒否する', async () => {
      const adminId = 'admin_rej';
      const userId = 'user_rej';
      await createAdminDevice(adminId);
      await db.collection('users').doc(userId).set({
        userType: 'line',
        pointA: 0,
        pointB: 0,
        sideGameChip: 0,
      });

      await expect(
        (setInitialUserBalances as any).run({
          auth: { uid: adminId },
          data: {
            targetUserId: userId,
            balances: { pointA: 1, pointB: 2, sideGameChip: 3, pointC: 0 },
            confirmOverwrite: true,
          },
        }),
      ).rejects.toBeInstanceOf(HttpsError);

      await expect(
        (setInitialUserBalances as any).run({
          auth: { uid: adminId },
          data: {
            targetUserId: userId,
            balances: { pointA: 1, pointB: 2 },
            confirmOverwrite: true,
          },
        }),
      ).rejects.toBeInstanceOf(HttpsError);

      await expect(
        (setInitialUserBalances as any).run({
          auth: { uid: adminId },
          data: {
            targetUserId: userId,
            balances: { pointA: -1, pointB: 0, sideGameChip: 0 },
            confirmOverwrite: true,
          },
        }),
      ).rejects.toBeInstanceOf(HttpsError);
    });

    it('clientNonce 冪等性と conflict', async () => {
      const adminId = 'admin_idemp';
      const userId = 'user_idemp';
      await createAdminDevice(adminId);
      await db.collection('users').doc(userId).set({
        userType: 'line',
        pointA: 0,
        pointB: 0,
        sideGameChip: 0,
      });

      const req = {
        auth: { uid: adminId },
        data: {
          targetUserId: userId,
          balances: { pointA: 1, pointB: 2, sideGameChip: 3 },
          confirmOverwrite: true,
          clientNonce: 'same',
        },
      };
      const first = await (setInitialUserBalances as any).run(req);
      const second = await (setInitialUserBalances as any).run(req);
      expect(second.reused).toBe(true);
      expect(second.migrationId).toBe(first.migrationId);

      await expect(
        (setInitialUserBalances as any).run({
          ...req,
          data: {
            ...req.data,
            balances: { pointA: 9, pointB: 2, sideGameChip: 3 },
          },
        }),
      ).rejects.toMatchObject({
        details: expect.objectContaining({ errorKey: 'IDEMPOTENCY_CONFLICT' }),
      });
    });
  });

  describe('migrateStoreManagedUserToLine emulator', () => {
    it('全6残高をコピーし、無効枠も失わない', async () => {
      const adminId = 'admin_mig';
      const sourceId = 'src_mig';
      const targetId = 'tgt_mig';
      await createAdminDevice(adminId);
      await db.collection('users').doc(sourceId).set({
        userType: 'store_managed',
        isMigrated: false,
        pointA: 11,
        pointB: 22,
        pointC: 33,
        // pointD missing → 0
        pointE: 55,
        sideGameChip: 66,
      });
      await db.collection('users').doc(targetId).set({
        userType: 'line',
        pointA: 1,
        pointB: 2,
        pointC: 3,
        pointD: 4,
        pointE: 5,
        sideGameChip: 6,
      });

      const result = await (migrateStoreManagedUserToLine as any).run({
        auth: { uid: adminId },
        data: {
          sourceUserId: sourceId,
          targetUserId: targetId,
          confirmSamePerson: true,
          confirmOverwrite: true,
          clientNonce: 'm1',
        },
      });

      expect(result.success).toBe(true);
      expect(result.balances).toEqual({
        pointA: 11,
        pointB: 22,
        pointC: 33,
        pointD: 0,
        pointE: 55,
        sideGameChip: 66,
      });

      const target = (await db.collection('users').doc(targetId).get()).data()!;
      expect(target.pointA).toBe(11);
      expect(target.pointC).toBe(33);
      expect(target.pointD).toBe(0);
      expect(target.pointE).toBe(55);

      const source = (await db.collection('users').doc(sourceId).get()).data()!;
      expect(source.isMigrated).toBe(true);
      expect(source.migratedToUserId).toBe(targetId);

      const logs = await db
        .collection('users')
        .doc(targetId)
        .collection('balanceMigrationLogs')
        .get();
      expect(logs.size).toBe(1);
      expect(logs.docs[0].data().balances).toEqual(result.balances);
    });

    it('source corrupt を拒否する', async () => {
      const adminId = 'admin_cor';
      const sourceId = 'src_cor';
      const targetId = 'tgt_cor';
      await createAdminDevice(adminId);
      await db.collection('users').doc(sourceId).set({
        userType: 'store_managed',
        isMigrated: false,
        pointA: null,
        pointB: 1,
        sideGameChip: 1,
      });
      await db.collection('users').doc(targetId).set({
        userType: 'line',
        pointA: 0,
        pointB: 0,
        sideGameChip: 0,
      });

      await expect(
        (migrateStoreManagedUserToLine as any).run({
          auth: { uid: adminId },
          data: {
            sourceUserId: sourceId,
            targetUserId: targetId,
            confirmSamePerson: true,
            confirmOverwrite: true,
          },
        }),
      ).rejects.toBeInstanceOf(HttpsError);

      const source = (await db.collection('users').doc(sourceId).get()).data()!;
      expect(source.isMigrated).toBe(false);
    });
  });
});
