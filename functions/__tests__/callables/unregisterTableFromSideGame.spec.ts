import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import { unregisterTableFromSideGame } from '../../src/table_device/callables/unregisterTableFromSideGame';

describe('unregisterTableFromSideGame', () => {
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

  async function createTableDevice(uid: string, tableId: string) {
    await db.collection('devices').doc(`device_${uid}`).set({
      uid,
      role: 'table',
      status: 'active',
      name: `Table Device ${tableId}`,
      options: {},
      optionParams: {
        table_device_table: {
          tableId,
        },
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function seedSideGame(params: {
    tableId: string;
    occupiedUserId?: string | null;
    withTournamentDetail?: boolean;
  }) {
    const {
      tableId,
      occupiedUserId = null,
      withTournamentDetail = false,
    } = params;
    await db.collection('tables').doc(tableId).set({
      name: tableId,
      status: 'ブラックジャック',
      maxSeats: 6,
      isEnabled: true,
      ...(withTournamentDetail
          ? {
              tournamentDetail: {
                tournamentId: 'tour_restore_1',
                tournamentName: 'TN-tour_restore_1',
                startAt: admin.firestore.Timestamp.fromDate(new Date()),
              },
            }
          : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('sideGame').doc(tableId).set({
      tableId,
      name: tableId,
      maxSeats: 6,
      gameName: 'ブラックジャック',
      active: true,
      isEnabled: true,
      seats: {
        seat01UserId: occupiedUserId,
        seat01PokerName: occupiedUserId == null ? null : 'Player1',
        seat02UserId: null,
        seat02PokerName: null,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  it('tournamentDetail がなければ open に戻し、座席をクリアする', async () => {
    await createTableDevice('table_uid_side_unreg_1', 'U1');
    await seedSideGame({
      tableId: 'U1',
    });

    const result = await (unregisterTableFromSideGame as any).run({
      auth: { uid: 'table_uid_side_unreg_1' },
      data: {
        tableId: 'U1',
      },
    } as any);

    expect(result.success).toBe(true);
    expect(result.restoredStatus).toBe('open');

    const tableDoc = await db.collection('tables').doc('U1').get();
    expect(tableDoc.data()?.status).toBe('open');

    const sideGameDoc = await db.collection('sideGame').doc('U1').get();
    expect(sideGameDoc.data()?.active).toBe(false);
    expect(sideGameDoc.data()?.seats?.seat01UserId).toBeNull();
  });

  it('tournamentDetail がある場合はパスコード確認後に tournament へ戻す', async () => {
    await db.collection('storeMeta').doc('config').set({
      tableDevice: {
        forceClearPasscode: '2468',
      },
    });
    await createTableDevice('table_uid_side_unreg_2', 'U2');
    await seedSideGame({
      tableId: 'U2',
      occupiedUserId: 'user_side_occupied',
      withTournamentDetail: true,
    });

    await expect(
      (unregisterTableFromSideGame as any).run({
        auth: { uid: 'table_uid_side_unreg_2' },
        data: {
          tableId: 'U2',
          force: true,
          passcode: '1111',
        },
      } as any),
    ).rejects.toThrow(/パスコード/);

    const result = await (unregisterTableFromSideGame as any).run({
      auth: { uid: 'table_uid_side_unreg_2' },
      data: {
        tableId: 'U2',
        force: true,
        passcode: '2468',
      },
    } as any);

    expect(result.success).toBe(true);
    expect(result.restoredStatus).toBe('tournament');

    const tableDoc = await db.collection('tables').doc('U2').get();
    expect(tableDoc.data()?.status).toBe('tournament');

    const sideGameDoc = await db.collection('sideGame').doc('U2').get();
    expect(sideGameDoc.data()?.active).toBe(false);
    expect(sideGameDoc.data()?.seats?.seat01UserId).toBeNull();
  });
});
