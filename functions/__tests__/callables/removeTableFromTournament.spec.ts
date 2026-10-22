import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { removeTableFromTournament } from '../../src/domains/tournament_activeTournament/callables/removeTableFromTournament';

describe('removeTableFromTournament', () => {
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
    await Promise.all(admin.apps.map(a => a?.delete()).filter(Boolean));
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

  async function seedTournament(tournamentId: string) {
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      status: 'running',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  it('seatXXOkibakeEntryId がある seat は occupied と判定して卓削除を拒否すること', async () => {
    const tournamentId = 'tournament_remove_table_okibake_001';
    const tableId = 'table_remove_okibake_001';
    const adminId = 'admin_remove_table_okibake_001';

    await createAdminDevice(adminId);
    await seedTournament(tournamentId);

    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .set({
        isEnabled: true,
        seats: {
          seat01UserId: null,
          seat01PokerName: '置きバケ席',
          seat01OkibakeEntryId: 'okibake_entry_remove_table_001',
          seat02UserId: null,
          seat02PokerName: null,
          seat02OkibakeEntryId: null,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await db.collection('tables').doc(tableId).set({
      status: 'in_use',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await expect((removeTableFromTournament as any).run({
      auth: { uid: adminId },
      data: { tournamentId, tableId },
    } as any)).rejects.toThrow();

    const tableSeatDoc = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .get();
    expect(tableSeatDoc.exists).toBe(true);

    const tableDoc = await db.collection('tables').doc(tableId).get();
    expect(tableDoc.data()!.status).toBe('in_use');
  });

  it('卓削除時は tablesSeat を論理削除し、tables.tournamentDetail をクリアすること', async () => {
    const tournamentId = 'tournament_remove_table_success_001';
    const tableId = 'table_remove_success_001';
    const adminId = 'admin_remove_table_success_001';

    await createAdminDevice(adminId);
    await seedTournament(tournamentId);

    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .set({
        isEnabled: true,
        seats: {
          seat01UserId: null,
          seat01PokerName: null,
          seat01OkibakeEntryId: null,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await db.collection('tables').doc(tableId).set({
      status: 'tournament',
      tournamentDetail: {
        tournamentId,
        tournamentName: 'TN-remove',
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await (removeTableFromTournament as any).run({
      auth: { uid: adminId },
      data: { tournamentId, tableId },
    } as any);

    const tableSeatDoc = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .get();
    expect(tableSeatDoc.exists).toBe(true);
    expect(tableSeatDoc.data()?.isEnabled).toBe(false);

    const tableDoc = await db.collection('tables').doc(tableId).get();
    expect(tableDoc.data()?.status).toBe('open');
    expect(tableDoc.data()?.tournamentDetail).toBeUndefined();
  });
});
