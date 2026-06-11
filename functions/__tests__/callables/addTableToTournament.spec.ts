import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { addTableToTournament } from '../../src/domains/tournament_activeTournament/callables/addTableToTournament';
import { removeTableFromTournament } from '../../src/domains/tournament_activeTournament/callables/removeTableFromTournament';

describe('addTableToTournament', () => {
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
    await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  async function createAdminDevice(uid: string) {
    await db.collection('devices').add({
      uid,
      role: 'admin',
      status: 'active',
      name: 'Test Admin Device',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function setupTournament(
    tournamentId: string,
    status: string,
    options?: { tableId?: string; withTablesSeat?: boolean },
  ) {
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (options?.withTablesSeat && options.tableId) {
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(options.tableId)
        .set({
          isEnabled: true,
          maxSeats: 6,
          seats: {
            seat01UserId: 'user_existing_001',
            seat01PokerName: 'Player1',
            seat02UserId: null,
            seat02PokerName: null,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
  }

  async function setupOpenTable(tableId: string) {
    await db.collection('tables').doc(tableId).set({
      status: 'open',
      maxSeats: 6,
      isEnabled: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  it('tablesSeat/{tableId} が既に存在する場合、追加拒否されること', async () => {
    const tournamentId = 'tournament_add_table_exists_001';
    const tableId = 'table_add_exists_001';
    const adminId = 'admin_add_table_exists_001';

    await createAdminDevice(adminId);
    await setupTournament(tournamentId, 'running', {
      tableId,
      withTablesSeat: true,
    });
    await setupOpenTable(tableId);

    await expect(
      (addTableToTournament as any).run({
        auth: { uid: adminId },
        data: { tournamentId, tableId, maxSeats: 6 },
      } as any),
    ).rejects.toThrow(/既にトーナメントに登録されています|TOURNAMENT_TABLE_ALREADY_EXISTS/);

    const tableSeatDoc = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .get();
    expect(tableSeatDoc.data()?.seats?.seat01UserId).toBe('user_existing_001');
  });

  it('tablesSeat/{tableId} が存在しない場合、追加できること', async () => {
    const tournamentId = 'tournament_add_table_new_001';
    const tableId = 'table_add_new_001';
    const adminId = 'admin_add_table_new_001';

    await createAdminDevice(adminId);
    await setupTournament(tournamentId, 'running');
    await setupOpenTable(tableId);

    const result = await (addTableToTournament as any).run({
      auth: { uid: adminId },
      data: { tournamentId, tableId, maxSeats: 6 },
    } as any);

    expect(result.success).toBe(true);
    expect(result.tableId).toBe(tableId);

    const tableSeatDoc = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .get();
    expect(tableSeatDoc.exists).toBe(true);
    expect(tableSeatDoc.data()?.seats?.seat01UserId).toBeNull();

    const tableDoc = await db.collection('tables').doc(tableId).get();
    expect(tableDoc.data()?.status).toBe('tournament');
  });

  it('removeTableFromTournament で tablesSeat doc 削除後は再追加できること', async () => {
    const tournamentId = 'tournament_add_table_readd_001';
    const tableId = 'table_add_readd_001';
    const adminId = 'admin_add_table_readd_001';

    await createAdminDevice(adminId);
    await setupTournament(tournamentId, 'running');
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .set({
        isEnabled: true,
        maxSeats: 6,
        seats: {
          seat01UserId: null,
          seat01PokerName: null,
          seat02UserId: null,
          seat02PokerName: null,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    await db.collection('tables').doc(tableId).set({
      status: 'tournament',
      maxSeats: 6,
      isEnabled: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await (removeTableFromTournament as any).run({
      auth: { uid: adminId },
      data: { tournamentId, tableId },
    } as any);

    const deletedDoc = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .get();
    expect(deletedDoc.exists).toBe(false);

    await db.collection('tables').doc(tableId).update({ status: 'open' });

    const result = await (addTableToTournament as any).run({
      auth: { uid: adminId },
      data: { tournamentId, tableId, maxSeats: 6 },
    } as any);

    expect(result.success).toBe(true);

    const tableSeatDoc = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .get();
    expect(tableSeatDoc.exists).toBe(true);
    expect(tableSeatDoc.data()?.seats?.seat01UserId).toBeNull();
  });

  it.each([
    ['ended', 'tournament_add_table_ended_001'],
    ['force_ended', 'tournament_add_table_force_ended_001'],
    ['cancelled', 'tournament_add_table_cancelled_001'],
    ['canceled', 'tournament_add_table_canceled_001'],
  ])('status=%s の TN には追加できないこと', async (status, tournamentId) => {
    const tableId = `table_${tournamentId}`;
    const adminId = `admin_${tournamentId}`;

    await createAdminDevice(adminId);
    await setupTournament(tournamentId, status);
    await setupOpenTable(tableId);

    await expect(
      (addTableToTournament as any).run({
        auth: { uid: adminId },
        data: { tournamentId, tableId, maxSeats: 6 },
      } as any),
    ).rejects.toThrow();

    const tableSeatDoc = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .get();
    expect(tableSeatDoc.exists).toBe(false);
  });

  it('tables.status !== open の場合は拒否されること', async () => {
    const tournamentId = 'tournament_add_table_not_open_001';
    const tableId = 'table_add_not_open_001';
    const adminId = 'admin_add_table_not_open_001';

    await createAdminDevice(adminId);
    await setupTournament(tournamentId, 'running');
    await db.collection('tables').doc(tableId).set({
      status: 'tournament',
      maxSeats: 6,
      isEnabled: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await expect(
      (addTableToTournament as any).run({
        auth: { uid: adminId },
        data: { tournamentId, tableId, maxSeats: 6 },
      } as any),
    ).rejects.toThrow(/使用中/);
  });
});
