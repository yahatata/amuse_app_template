import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import { unregisterTableFromTournament } from '../../src/table_device/callables/unregisterTableFromTournament';

describe('unregisterTableFromTournament (table device)', () => {
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

  async function seedTournamentState(params: {
    tableId: string;
    tournamentId: string;
    occupiedUserId?: string | null;
  }) {
    const { tableId, tournamentId, occupiedUserId = null } = params;
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      status: 'running',
      businessDate: '2026-06-18',
      snapshot: { name: `TN-${tournamentId}` },
      startAt: admin.firestore.Timestamp.fromDate(new Date()),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('tables').doc(tableId).set({
      name: tableId,
      status: 'tournament',
      maxSeats: 6,
      isEnabled: true,
      tournamentDetail: {
        tournamentId,
        tournamentName: `TN-${tournamentId}`,
        startAt: admin.firestore.Timestamp.fromDate(new Date()),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .set({
        isEnabled: true,
        maxSeats: 6,
        seats: {
          seat01UserId: occupiedUserId,
          seat01PokerName: occupiedUserId == null ? null : 'Player1',
          seat02UserId: null,
          seat02PokerName: null,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  it('空席ならそのまま論理削除して open に戻す', async () => {
    await createTableDevice('table_uid_unreg_1', 'T1');
    await seedTournamentState({
      tableId: 'T1',
      tournamentId: 'tour_unreg_1',
    });

    const result = await (unregisterTableFromTournament as any).run({
      auth: { uid: 'table_uid_unreg_1' },
      data: {
        tableId: 'T1',
        tournamentId: 'tour_unreg_1',
      },
    } as any);

    expect(result.success).toBe(true);
    expect(result.forced).toBe(false);

    const tableDoc = await db.collection('tables').doc('T1').get();
    expect(tableDoc.data()?.status).toBe('open');
    expect(tableDoc.data()?.tournamentDetail).toBeUndefined();

    const seatDoc = await db
      .collection('scheduledTournaments')
      .doc('tour_unreg_1')
      .collection('tablesSeat')
      .doc('T1')
      .get();
    expect(seatDoc.data()?.isEnabled).toBe(false);
  });

  it('着席者がいる場合は正しいパスコードが必要', async () => {
    await db.collection('storeMeta').doc('config').set({
      tableDevice: {
        forceClearPasscode: '4321',
      },
    });
    await createTableDevice('table_uid_unreg_2', 'T2');
    await seedTournamentState({
      tableId: 'T2',
      tournamentId: 'tour_unreg_2',
      occupiedUserId: 'user_occupied_1',
    });

    await expect(
      (unregisterTableFromTournament as any).run({
        auth: { uid: 'table_uid_unreg_2' },
        data: {
          tableId: 'T2',
          tournamentId: 'tour_unreg_2',
          force: true,
          passcode: '1111',
        },
      } as any),
    ).rejects.toThrow(/パスコード/);

    const result = await (unregisterTableFromTournament as any).run({
      auth: { uid: 'table_uid_unreg_2' },
      data: {
        tableId: 'T2',
        tournamentId: 'tour_unreg_2',
        force: true,
        passcode: '4321',
      },
    } as any);

    expect(result.success).toBe(true);
    expect(result.forced).toBe(true);
  });
});
