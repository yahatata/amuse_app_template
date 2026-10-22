import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import { registerTableToTournament } from '../../src/table_device/callables/registerTableToTournament';

describe('registerTableToTournament', () => {
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

  async function seedCurrentBusinessDay(businessDateKey: string) {
    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'running',
      currentBusinessDateKey: businessDateKey,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function seedTable(tableId: string, status: string = 'open') {
    await db.collection('tables').doc(tableId).set({
      name: tableId,
      status,
      maxSeats: 6,
      isEnabled: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function seedTournament(params: {
    tournamentId: string;
    businessDate: string;
    status?: string;
    startAt?: Date;
  }) {
    const {
      tournamentId,
      businessDate,
      status = 'scheduled',
      startAt = new Date(Date.now() + 30 * 60 * 1000),
    } = params;
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      businessDate,
      status,
      startAt: admin.firestore.Timestamp.fromDate(startAt),
      snapshot: {
        name: `TN-${tournamentId}`,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  it('紐付いた卓を当日トーナメントへ登録できる', async () => {
    const today = '2026-06-18';
    await seedCurrentBusinessDay(today);
    await createTableDevice('table_uid_1', 'T1');
    await seedTable('T1');
    await seedTournament({
      tournamentId: 'tour_1',
      businessDate: today,
    });

    const result = await (registerTableToTournament as any).run({
      auth: { uid: 'table_uid_1' },
      data: {
        tableId: 'T1',
        tournamentId: 'tour_1',
      },
    } as any);

    expect(result.success).toBe(true);

    const tableDoc = await db.collection('tables').doc('T1').get();
    expect(tableDoc.data()?.status).toBe('tournament');
    expect(tableDoc.data()?.tournamentDetail?.tournamentId).toBe('tour_1');

    const tablesSeatDoc = await db
      .collection('scheduledTournaments')
      .doc('tour_1')
      .collection('tablesSeat')
      .doc('T1')
      .get();
    expect(tablesSeatDoc.exists).toBe(true);
    expect(tablesSeatDoc.data()?.isEnabled).toBe(true);
    expect(tablesSeatDoc.data()?.seats?.seat01UserId).toBeNull();
  });

  it('他卓を指定すると拒否される', async () => {
    const today = '2026-06-18';
    await seedCurrentBusinessDay(today);
    await createTableDevice('table_uid_2', 'T1');
    await seedTable('T2');
    await seedTournament({
      tournamentId: 'tour_2',
      businessDate: today,
    });

    await expect(
      (registerTableToTournament as any).run({
        auth: { uid: 'table_uid_2' },
        data: {
          tableId: 'T2',
          tournamentId: 'tour_2',
        },
      } as any),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('開始から1時間以上前でも登録できる', async () => {
    const today = '2026-06-18';
    await seedCurrentBusinessDay(today);
    await createTableDevice('table_uid_old_start', 'T4');
    await seedTable('T4');
    await seedTournament({
      tournamentId: 'tour_old_start',
      businessDate: today,
      status: 'running',
      startAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });

    const result = await (registerTableToTournament as any).run({
      auth: { uid: 'table_uid_old_start' },
      data: {
        tableId: 'T4',
        tournamentId: 'tour_old_start',
      },
    } as any);

    expect(result.success).toBe(true);
  });

  it('tableDeviceRegistrationEnabled=false のとき table role は拒否される', async () => {
    const today = '2026-06-18';
    await seedCurrentBusinessDay(today);
    await db.collection('storeMeta').doc('config').set({
      features: {
        tableDeviceRegistrationEnabled: false,
      },
    });
    await createTableDevice('table_uid_3', 'T3');
    await seedTable('T3');
    await seedTournament({
      tournamentId: 'tour_3',
      businessDate: today,
    });

    await expect(
      (registerTableToTournament as any).run({
        auth: { uid: 'table_uid_3' },
        data: {
          tableId: 'T3',
          tournamentId: 'tour_3',
        },
      } as any),
    ).rejects.toThrow(/現在無効/);
  });
});
