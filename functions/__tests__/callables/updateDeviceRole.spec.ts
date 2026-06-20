import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import { updateDeviceRole } from '../../src/shared/devices/callables/updateDeviceRole';

describe('updateDeviceRole', () => {
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

  it('admin は target device を table role に変更できる', async () => {
    const adminUid = 'admin_update_device_role_001';
    const targetDeviceId = 'device_terminal_001';

    await createAdminDevice(adminUid);
    await db.collection('devices').doc(targetDeviceId).set({
      uid: 'target_terminal_uid_001',
      role: 'terminal',
      status: 'active',
      name: 'Terminal Device',
      options: {
        tournament: true,
      },
      optionParams: {
        tournament_table: {
          tableId: 'T1',
        },
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const result = await (updateDeviceRole as any).run({
      auth: { uid: adminUid },
      data: {
        deviceId: targetDeviceId,
        role: 'table',
      },
    } as any);

    expect(result).toMatchObject({
      success: true,
      deviceId: targetDeviceId,
      role: 'table',
    });

    const updated = await db.collection('devices').doc(targetDeviceId).get();
    expect(updated.data()?.role).toBe('table');
    expect(updated.data()?.options).toEqual({});
    expect(updated.data()?.optionParams).toEqual({});
  });
});
