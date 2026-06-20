import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import { registerDevice } from '../../src/shared/devices/callables/registerDevice';

describe('registerDevice', () => {
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

  it('table role でデバイス登録でき、options / optionParams が初期化される', async () => {
    const uid = 'table_register_uid_001';

    const result = await (registerDevice as any).run({
      auth: { uid },
      data: {
        name: 'Table Device 1',
        role: 'table',
        uid,
        installationId: 'install_table_001',
        platform: 'ios',
      },
    } as any);

    expect(result.success).toBe(true);
    expect(typeof result.deviceId).toBe('string');

    const deviceDoc = await db.collection('devices').doc(result.deviceId).get();
    expect(deviceDoc.data()?.role).toBe('table');
    expect(deviceDoc.data()?.options).toEqual({});
    expect(deviceDoc.data()?.optionParams).toEqual({});
  });
});
