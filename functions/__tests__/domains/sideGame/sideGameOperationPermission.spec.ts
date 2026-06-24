import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { assertSideGameOperationPermission } from '../../../src/domains/sideGame/lib/sideGameOperationPermission';

describe('assertSideGameOperationPermission', () => {
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
    await Promise.all(admin.apps.map((app) => app?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  async function seedDevice(params: {
    uid: string;
    role: string;
    options?: Record<string, boolean>;
    optionParams?: Record<string, unknown>;
    status?: string;
  }) {
    const { uid, role, options = {}, optionParams = {}, status = 'active' } = params;
    await db.collection('devices').doc(`device_${uid}`).set({
      uid,
      role,
      status,
      name: `Device ${uid}`,
      options,
      optionParams,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  it('admin ロールは許可する', async () => {
    const uid = 'admin_user_1';
    await seedDevice({ uid, role: 'admin' });

    const device = await assertSideGameOperationPermission({ callerUid: uid });
    expect(device.role).toBe('admin');
  });

  it('side_game オプション付き terminal は許可する', async () => {
    const uid = 'terminal_sg_1';
    await seedDevice({
      uid,
      role: 'terminal',
      options: { side_game: true },
    });

    const device = await assertSideGameOperationPermission({ callerUid: uid });
    expect(device.role).toBe('terminal');
  });

  it('role: table かつ紐付け卓一致なら許可する', async () => {
    const uid = 'table_user_1';
    await seedDevice({
      uid,
      role: 'table',
      optionParams: {
        table_device_table: { tableId: 'TableA' },
      },
    });

    const device = await assertSideGameOperationPermission({
      callerUid: uid,
      tableId: 'TableA',
    });
    expect(device.role).toBe('table');
  });

  it('role: table で tableId 未指定（チップ操作）も許可する', async () => {
    const uid = 'table_user_2';
    await seedDevice({
      uid,
      role: 'table',
      optionParams: {
        table_device_table: { tableId: 'TableA' },
      },
    });

    const device = await assertSideGameOperationPermission({ callerUid: uid });
    expect(device.role).toBe('table');
  });

  it('role: table で紐付け卓と不一致なら拒否する', async () => {
    const uid = 'table_user_3';
    await seedDevice({
      uid,
      role: 'table',
      optionParams: {
        table_device_table: { tableId: 'TableA' },
      },
    });

    await expect(
      assertSideGameOperationPermission({
        callerUid: uid,
        tableId: 'TableB',
      }),
    ).rejects.toMatchObject({
      code: 'permission-denied',
      message: 'この卓を操作する権限がありません',
    });
  });

  it('role: table で卓紐付け未設定なら拒否する', async () => {
    const uid = 'table_user_4';
    await seedDevice({ uid, role: 'table' });

    await expect(
      assertSideGameOperationPermission({ callerUid: uid, tableId: 'TableA' }),
    ).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('権限のない terminal は拒否する', async () => {
    const uid = 'terminal_no_opt';
    await seedDevice({ uid, role: 'terminal', options: {} });

    await expect(
      assertSideGameOperationPermission({ callerUid: uid }),
    ).rejects.toBeInstanceOf(HttpsError);
    await expect(
      assertSideGameOperationPermission({ callerUid: uid }),
    ).rejects.toMatchObject({
      code: 'permission-denied',
      message: 'サイドゲーム操作の権限がありません',
    });
  });
});
