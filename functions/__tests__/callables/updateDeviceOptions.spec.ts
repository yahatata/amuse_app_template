import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import { updateDeviceOptions } from '../../src/shared/devices/callables/updateDeviceOptions';

describe('updateDeviceOptions', () => {
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

  async function createAdminDevice(uid: string) {
    await db.collection('devices').doc(`admin_${uid}`).set({
      uid,
      role: 'admin',
      status: 'active',
      name: 'Admin Device',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function createTableDevice(deviceId: string) {
    await db.collection('devices').doc(deviceId).set({
      uid: `uid_${deviceId}`,
      role: 'table',
      status: 'active',
      name: 'Table Device',
      options: {},
      optionParams: {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  it('role: table には table_device_table のみ設定できる', async () => {
    const adminUid = 'admin_update_options_001';
    const targetDeviceId = 'table_device_001';

    await createAdminDevice(adminUid);
    await createTableDevice(targetDeviceId);

    const result = await (updateDeviceOptions as any).run({
      auth: { uid: adminUid },
      data: {
        deviceId: targetDeviceId,
        options: {},
        optionParams: {
          table_device_table: {
            tableId: 'T12',
          },
        },
      },
    } as any);

    expect(result.success).toBe(true);

    const updated = await db.collection('devices').doc(targetDeviceId).get();
    expect(updated.data()?.options).toEqual({});
    expect(updated.data()?.optionParams).toEqual({
      table_device_table: {
        tableId: 'T12',
      },
    });
  });

  it('role: table に true options を設定しようとすると拒否される', async () => {
    const adminUid = 'admin_update_options_002';
    const targetDeviceId = 'table_device_002';

    await createAdminDevice(adminUid);
    await createTableDevice(targetDeviceId);

    await expect(
      (updateDeviceOptions as any).run({
        auth: { uid: adminUid },
        data: {
          deviceId: targetDeviceId,
          options: {
            tournament: true,
          },
          optionParams: {},
        },
      } as any),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
