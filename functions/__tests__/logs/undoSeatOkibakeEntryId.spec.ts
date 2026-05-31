import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { undoAssignSeatToPlayer } from '../../src/domains/logs/services/undoAssignSeatToPlayer';
import { undoRegisterForTournament } from '../../src/domains/logs/services/undoRegisterForTournament';
import { undoRegisterParticipants } from '../../src/domains/logs/services/undoRegisterParticipants';

describe('rollback seat cleanup for okibake-origin seats', () => {
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

  async function seedMainView(tournamentId: string) {
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({
        entries: 1,
        playersIn: 1,
        waitingCount: 0,
        reentries: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  async function seedWaiting(tournamentId: string) {
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc('waiting')
      .set({
        waiting: {},
        count: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  async function seedUsersList(tournamentId: string, userId: string, pokerName: string) {
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('usersList')
      .set({
        users: {
          [userId]: { pokerName },
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  async function seedLinkedOkibakeSeat(tournamentId: string, tableId: string, userId: string, pokerName: string) {
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .set({
        isEnabled: true,
        seats: {
          seat01UserId: userId,
          seat01PokerName: pokerName,
          seat01OkibakeEntryId: 'okibake_entry_rollback_001',
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  it('undoAssignSeatToPlayer は seatXXOkibakeEntryId も null にすること', async () => {
    const tournamentId = 'tournament_undo_assign_okibake_001';
    const tableId = 'table_undo_assign_001';
    const userId = 'user_undo_assign_001';
    const pokerName = 'リンク済み太郎';

    await seedMainView(tournamentId);
    await seedWaiting(tournamentId);
    await seedLinkedOkibakeSeat(tournamentId, tableId, userId, pokerName);

    await undoAssignSeatToPlayer({
      tournamentId,
      playerUid: userId,
      playerName: pokerName,
      tableId,
      seatNumber: 1,
      rollBackBy: 'admin',
    });

    const seatDoc = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .get();
    const seats = seatDoc.data()!.seats;
    expect(seats.seat01UserId).toBeNull();
    expect(seats.seat01PokerName).toBeNull();
    expect(seats.seat01OkibakeEntryId).toBeNull();
  });

  it('undoRegisterForTournament は着席解除時に seatXXOkibakeEntryId も null にすること', async () => {
    const tournamentId = 'tournament_undo_register_okibake_001';
    const tableId = 'table_undo_register_001';
    const userId = 'user_undo_register_001';
    const pokerName = 'リンク済み太郎';

    await seedMainView(tournamentId);
    await seedWaiting(tournamentId);
    await seedUsersList(tournamentId, userId, pokerName);
    await seedLinkedOkibakeSeat(tournamentId, tableId, userId, pokerName);

    await undoRegisterForTournament({
      tournamentId,
      playerUid: userId,
      playerName: pokerName,
      rollBackBy: 'admin',
    });

    const seatDoc = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .get();
    const seats = seatDoc.data()!.seats;
    expect(seats.seat01UserId).toBeNull();
    expect(seats.seat01PokerName).toBeNull();
    expect(seats.seat01OkibakeEntryId).toBeNull();
  });

  it('undoRegisterParticipants は着席解除時に seatXXOkibakeEntryId も null にすること', async () => {
    const tournamentId = 'tournament_undo_participants_okibake_001';
    const tableId = 'table_undo_participants_001';
    const userId = 'user_undo_participants_001';
    const pokerName = 'リンク済み太郎';

    await seedMainView(tournamentId);
    await seedWaiting(tournamentId);
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc('busted')
      .set({ bustedUser: {} });
    await seedUsersList(tournamentId, userId, pokerName);
    await seedLinkedOkibakeSeat(tournamentId, tableId, userId, pokerName);

    await undoRegisterParticipants({
      tournamentId,
      playerUids: [userId],
      playerNames: [pokerName],
      rollBackBy: 'admin',
      details: [{ playerUid: userId, playerName: pokerName, isReentry: false }],
    });

    const seatDoc = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .get();
    const seats = seatDoc.data()!.seats;
    expect(seats.seat01UserId).toBeNull();
    expect(seats.seat01PokerName).toBeNull();
    expect(seats.seat01OkibakeEntryId).toBeNull();
  });
});
