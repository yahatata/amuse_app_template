import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import { endSideGameSession } from '../../src/table_device/callables/endSideGameSession';

describe('endSideGameSession', () => {
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

  async function createSideGameTerminal(uid: string) {
    await db.collection('devices').doc(`device_${uid}`).set({
      uid,
      role: 'terminal',
      status: 'active',
      name: 'Side Game Terminal',
      options: { side_game: true },
      optionParams: {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  it('terminal からサイドゲーム終了できること', async () => {
    const tableId = 'TableSG1';
    const callerUid = 'terminal_sg_end_1';

    await createSideGameTerminal(callerUid);
    await db.collection('tables').doc(tableId).set({
      name: tableId,
      status: 'ブラックジャック',
      maxSeats: 6,
      isEnabled: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('sideGame').doc(tableId).set({
      tableId,
      name: tableId,
      maxSeats: 6,
      active: true,
      seats: {
        seat01UserId: 'user_1',
        seat01PokerName: 'Player1',
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const result = await (endSideGameSession as any).run({
      auth: { uid: callerUid },
      data: { tableId },
    });

    expect(result.success).toBe(true);
    expect(result.restoredStatus).toBe('open');

    const tableDoc = await db.collection('tables').doc(tableId).get();
    expect(tableDoc.data()?.status).toBe('open');

    const sideGameDoc = await db.collection('sideGame').doc(tableId).get();
    expect(sideGameDoc.data()?.active).toBe(false);
    expect(sideGameDoc.data()?.seats?.seat01UserId).toBeNull();
  });
});
