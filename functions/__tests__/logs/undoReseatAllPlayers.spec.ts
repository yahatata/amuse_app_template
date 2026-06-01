import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { undoReseatAllPlayers } from '../../src/domains/logs/services/undoReseatAllPlayers';

describe('undoReseatAllPlayers okibake restore', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  let rollbackAction: { run: (req: unknown) => Promise<Record<string, unknown>> };
  const projectId = 'test-undo-reseat-okibake';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
    const mod = await import('../../src/domains/logs/callables/rollbackAction');
    rollbackAction = mod.rollbackAction as typeof rollbackAction;
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  async function seedTables(tournamentId: string, tableId: string, seats: Record<string, unknown>) {
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .set({
        isEnabled: true,
        seats,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
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
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({
        waitingCount: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  it('registered → seated の reseat rollback で entry が registered に戻り waitingCount +1 される', async () => {
    const tournamentId = 't-undo-reseat-reg';
    const okibakeEntryId = 'okibake-reg';
    const tableId = 'table_001';
    const previousSeatingData = {
      waiting: { waiting: {}, count: 0 },
      [tableId]: {
        seats: {
          seat01UserId: null,
          seat01PokerName: null,
          seat01OkibakeEntryId: null,
          seat02UserId: null,
          seat02PokerName: null,
          seat02OkibakeEntryId: null,
        },
      },
    };

    await seedTables(tournamentId, tableId, {
      seat01UserId: null,
      seat01PokerName: 'オキバケA',
      seat01OkibakeEntryId: okibakeEntryId,
      seat02UserId: null,
      seat02PokerName: null,
      seat02OkibakeEntryId: null,
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({ waitingCount: 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(okibakeEntryId)
      .set({
        tournamentId,
        entryStatus: 'seated',
        billLinkStatus: 'unlinked',
        assignedTableId: tableId,
        assignedSeatKey: 'seat01',
        seatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await undoReseatAllPlayers({
      tournamentId,
      previousSeatingData,
      rollBackBy: 'device-rollback-1',
      okibakeReseatTargets: [
        {
          okibakeEntryId,
          okibakeEntryBefore: {
            entryStatus: 'registered',
            billLinkStatus: 'unlinked',
            assignedTableId: null,
            assignedSeatKey: null,
            assignedSeatNumber: null,
            seatedAt: null,
            updatedAt: null,
            updatedByDeviceId: null,
          },
          okibakeEntryAfter: {
            entryStatus: 'seated',
            billLinkStatus: null,
            assignedTableId: tableId,
            assignedSeatKey: 'seat01',
            assignedSeatNumber: 1,
            seatedAt: null,
            updatedAt: null,
            updatedByDeviceId: null,
          },
        },
      ],
    });

    const entry = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc(okibakeEntryId)
        .get()
    ).data()!;
    expect(entry.entryStatus).toBe('registered');
    expect(entry.assignedTableId).toBeNull();
    expect(entry.assignedSeatKey).toBeNull();
    expect(entry.seatedAt).toBeNull();

    const seats = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .get()
    ).data()!.seats;
    expect(seats.seat01OkibakeEntryId).toBeNull();

    const views = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get()
    ).data()!;
    expect(views.waitingCount).toBe(2);
  });

  it('seated → seated の reseat rollback では waitingCount は変わらない', async () => {
    const tournamentId = 't-undo-reseat-seated';
    const okibakeEntryId = 'okibake-seated';
    const tableId = 'table_001';
    const previousSeatingData = {
      waiting: { waiting: {}, count: 0 },
      [tableId]: {
        seats: {
          seat01UserId: null,
          seat01PokerName: 'オキバケB',
          seat01OkibakeEntryId: okibakeEntryId,
          seat02UserId: null,
          seat02PokerName: null,
          seat02OkibakeEntryId: null,
        },
      },
    };

    await seedTables(tournamentId, tableId, {
      seat01UserId: null,
      seat01PokerName: null,
      seat01OkibakeEntryId: null,
      seat02UserId: null,
      seat02PokerName: 'オキバケB',
      seat02OkibakeEntryId: okibakeEntryId,
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({ waitingCount: 3, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(okibakeEntryId)
      .set({
        tournamentId,
        entryStatus: 'seated',
        billLinkStatus: 'unlinked',
        assignedTableId: tableId,
        assignedSeatKey: 'seat02',
        seatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    const viewsBefore = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get()
    ).data()!.waitingCount;

    await undoReseatAllPlayers({
      tournamentId,
      previousSeatingData,
      rollBackBy: 'device-rollback-2',
      okibakeReseatTargets: [
        {
          okibakeEntryId,
          okibakeEntryBefore: {
            entryStatus: 'seated',
            billLinkStatus: 'unlinked',
            assignedTableId: tableId,
            assignedSeatKey: 'seat01',
            assignedSeatNumber: 1,
            seatedAt: admin.firestore.Timestamp.fromDate(new Date('2026-01-01T10:00:00Z')),
            updatedAt: null,
            updatedByDeviceId: 'device-before',
          },
          okibakeEntryAfter: {
            entryStatus: 'seated',
            billLinkStatus: null,
            assignedTableId: tableId,
            assignedSeatKey: 'seat02',
            assignedSeatNumber: 2,
            seatedAt: null,
            updatedAt: null,
            updatedByDeviceId: null,
          },
        },
      ],
    });

    const entry = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc(okibakeEntryId)
        .get()
    ).data()!;
    expect(entry.entryStatus).toBe('seated');
    expect(entry.assignedSeatKey).toBe('seat01');

    const views = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get()
    ).data()!;
    expect(views.waitingCount).toBe(viewsBefore);
  });

  it('現在 entry が operationLog after と不一致なら rollback を拒否する', async () => {
    const tournamentId = 't-undo-reseat-mismatch';
    const okibakeEntryId = 'okibake-mismatch';
    const tableId = 'table_001';

    await seedTables(tournamentId, tableId, {
      seat01UserId: null,
      seat01PokerName: 'オキバケC',
      seat01OkibakeEntryId: okibakeEntryId,
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(okibakeEntryId)
      .set({
        entryStatus: 'seated',
        assignedTableId: tableId,
        assignedSeatKey: 'seat03',
      });

    await expect(
      undoReseatAllPlayers({
        tournamentId,
        previousSeatingData: {
          waiting: { waiting: {}, count: 0 },
          [tableId]: { seats: {} },
        },
        rollBackBy: 'device-rollback-3',
        okibakeReseatTargets: [
          {
            okibakeEntryId,
            okibakeEntryBefore: {
              entryStatus: 'registered',
              billLinkStatus: 'unlinked',
              assignedTableId: null,
              assignedSeatKey: null,
              assignedSeatNumber: null,
              seatedAt: null,
              updatedAt: null,
              updatedByDeviceId: null,
            },
            okibakeEntryAfter: {
              entryStatus: 'seated',
              billLinkStatus: null,
              assignedTableId: tableId,
              assignedSeatKey: 'seat01',
              assignedSeatNumber: 1,
              seatedAt: null,
              updatedAt: null,
              updatedByDeviceId: null,
            },
          },
        ],
      }),
    ).rejects.toThrow(/一致しない/);
  });

  it('okibakeReseatTargets がない旧 operationLog でも tablesSeat の rollback は従来通り動く', async () => {
    const tournamentId = 't-undo-reseat-legacy';
    const tableId = 'table_001';
    const operationId = 'op-reseat-legacy';
    const previousSeatingData = {
      waiting: { waiting: { user1: true }, count: 1 },
      [tableId]: {
        seats: {
          seat01UserId: 'user1',
          seat01PokerName: '太郎',
          seat01OkibakeEntryId: null,
          seat02UserId: null,
          seat02PokerName: null,
          seat02OkibakeEntryId: null,
        },
      },
    };

    await seedTables(tournamentId, tableId, {
      seat01UserId: null,
      seat01PokerName: null,
      seat01OkibakeEntryId: null,
      seat02UserId: 'user1',
      seat02PokerName: '太郎',
      seat02OkibakeEntryId: null,
    });
    await db.collection('operationLogs').doc(operationId).set({
      operationId,
      operationName: '全員着席替え',
      tournamentId,
      status: 'succeeded',
      payload: {
        tournamentId,
        previousSeatingData,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await rollbackAction.run({
      data: {
        tournamentId,
        operationId,
        action: 'reseat_all_players',
        rollBackBy: 'admin-device',
      },
      auth: { uid: 'admin-uid' },
    });

    const seats = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .get()
    ).data()!.seats;
    expect(seats.seat01UserId).toBe('user1');
    expect(seats.seat02UserId).toBeNull();
  });
});
