import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import { updateTableDeviceConfigCallable } from '../../src/domains/storeMeta/callables/updateTableDeviceConfigCallable';

describe('updateTableDeviceConfigCallable', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-update-table-device-config';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((app) => app?.delete()).filter(Boolean));
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
  });

  async function createAdminDevice(uid: string) {
    await db.collection('devices').doc(`admin_${uid}`).set({
      uid,
      role: 'admin',
      status: 'active',
      name: 'Admin Device',
      options: {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  it('admin は卓端末の履歴設定を更新できる', async () => {
    const uid = 'admin_update_table_device_config';
    await createAdminDevice(uid);

    const result = await (updateTableDeviceConfigCallable as any).run({
      auth: { uid },
      data: {
        actionHistoryViewEnabled: true,
        actionHistoryRollbackEnabled: false,
      },
    } as any);

    expect(result.success).toBe(true);
    const configDoc = await db.collection('storeMeta').doc('config').get();
    expect(configDoc.data()?.tableDevice?.actionHistoryViewEnabled).toBe(true);
    expect(configDoc.data()?.tableDevice?.actionHistoryRollbackEnabled).toBe(false);
  });

  it('view=false かつ rollback=true の不整合設定は拒否する', async () => {
    const uid = 'admin_update_table_device_config_invalid';
    await createAdminDevice(uid);

    await expect(
      (updateTableDeviceConfigCallable as any).run({
        auth: { uid },
        data: {
          actionHistoryViewEnabled: false,
          actionHistoryRollbackEnabled: true,
        },
      } as any),
    ).rejects.toThrow(/actionHistoryRollbackEnabled/);
  });
});
