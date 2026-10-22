import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import { registerTableToSideGame } from '../../src/table_device/callables/registerTableToSideGame';

describe('registerTableToSideGame', () => {
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

  async function seedTable(params: {
    tableId: string;
    status?: string;
    withTournamentDetail?: boolean;
  }) {
    const {
      tableId,
      status = 'open',
      withTournamentDetail = false,
    } = params;
    await db.collection('tables').doc(tableId).set({
      name: tableId,
      status,
      maxSeats: 6,
      isEnabled: true,
      ...(withTournamentDetail
          ? {
              tournamentDetail: {
                tournamentId: 'tour_side_1',
                tournamentName: 'TN-tour_side_1',
                startAt: admin.firestore.Timestamp.fromDate(new Date()),
              },
            }
          : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function seedTournamentSeat(params: {
    tableId: string;
    occupiedUserId?: string | null;
  }) {
    const { tableId, occupiedUserId = null } = params;
    await db.collection('scheduledTournaments').doc('tour_side_1').set({
      status: 'running',
      businessDate: '2026-06-18',
      snapshot: { name: 'TN-tour_side_1' },
      startAt: admin.firestore.Timestamp.fromDate(new Date()),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db
      .collection('scheduledTournaments')
      .doc('tour_side_1')
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

  it('open 卓からサイドゲームを開始できる', async () => {
    await createTableDevice('table_uid_side_1', 'S1');
    await seedTable({ tableId: 'S1' });

    const result = await (registerTableToSideGame as any).run({
      auth: { uid: 'table_uid_side_1' },
      data: {
        tableId: 'S1',
        gameName: 'ブラックジャック',
      },
    } as any);

    expect(result.success).toBe(true);

    const tableDoc = await db.collection('tables').doc('S1').get();
    expect(tableDoc.data()?.status).toBe('ブラックジャック');

    const sideGameDoc = await db.collection('sideGame').doc('S1').get();
    expect(sideGameDoc.data()?.active).toBe(true);
    expect(sideGameDoc.data()?.gameName).toBe('ブラックジャック');
  });

  it('トーナメント着席中の卓は開始できない', async () => {
    await createTableDevice('table_uid_side_2', 'S2');
    await seedTable({
      tableId: 'S2',
      status: 'tournament',
      withTournamentDetail: true,
    });
    await seedTournamentSeat({
      tableId: 'S2',
      occupiedUserId: 'user_occupied_side',
    });

    await expect(
      (registerTableToSideGame as any).run({
        auth: { uid: 'table_uid_side_2' },
        data: {
          tableId: 'S2',
          gameName: 'ブラックジャック',
        },
      } as any),
    ).rejects.toThrow(/トーナメントで着席中/);
  });

  it('トーナメント登録のみなら確認後に開始でき、tournamentDetail を保持する', async () => {
    await createTableDevice('table_uid_side_3', 'S3');
    await seedTable({
      tableId: 'S3',
      status: 'tournament',
      withTournamentDetail: true,
    });
    await seedTournamentSeat({
      tableId: 'S3',
      occupiedUserId: null,
    });

    await expect(
      (registerTableToSideGame as any).run({
        auth: { uid: 'table_uid_side_3' },
        data: {
          tableId: 'S3',
          gameName: 'ブラックジャック',
        },
      } as any),
    ).rejects.toThrow(/トーナメント登録中ですが使用しますか/);

    const result = await (registerTableToSideGame as any).run({
      auth: { uid: 'table_uid_side_3' },
      data: {
        tableId: 'S3',
        gameName: 'ブラックジャック',
        allowOverride: true,
      },
    } as any);

    expect(result.success).toBe(true);

    const tableDoc = await db.collection('tables').doc('S3').get();
    expect(tableDoc.data()?.status).toBe('ブラックジャック');
    expect(tableDoc.data()?.tournamentDetail?.tournamentId).toBe('tour_side_1');
  });
});
