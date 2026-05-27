/**
 * assignOkibakeTemporaryEntryToSeat（Firestore Emulator）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

describe('assignOkibakeTemporaryEntryToSeat', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  let assignOkibakeTemporaryEntryToSeat: {
    run: (req: unknown) => Promise<Record<string, unknown>>;
  };
  const projectId = 'test-okibake-assign';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
    const mod = await import(
      '../../src/domains/tournament_activeTournament/callables/assignOkibakeTemporaryEntryToSeat'
    );
    assignOkibakeTemporaryEntryToSeat = mod.assignOkibakeTemporaryEntryToSeat as typeof assignOkibakeTemporaryEntryToSeat;
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  async function seedDevice(uid: string) {
    await db.collection('devices').add({
      uid,
      role: 'admin',
      status: 'active',
      name: 'Terminal Okibake Assign',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  function baseOkibakeEntry(entryId: string, tournamentId: string, overrides: Record<string, unknown> = {}) {
    const nowTs = admin.firestore.FieldValue.serverTimestamp();
    return {
      okibakeEntryId: entryId,
      tournamentId,
      temporaryDisplayName: 'オキハッピー',
      linkedUserId: null,
      linkedUserPokerName: null,
      linkedBillId: null,
      linkedAt: null,
      entryStatus: 'registered',
      billLinkStatus: 'unlinked',
      addonIntent: 'unknown',
      memo: null,
      okibakeAddonCount: 0,
      lastOkibakeAddonAt: null,
      okibakeAddonRecords: [],
      assignedTableId: null,
      assignedSeatKey: null,
      seatedAt: null,
      bustedAt: null,
      bustedTableId: null,
      bustedSeatKey: null,
      createdAt: nowTs,
      updatedAt: nowTs,
      createdByDeviceId: 'dev',
      updatedByDeviceId: 'dev',
      voidedAt: null,
      voidedByDeviceId: null,
      ...overrides,
    };
  }

  async function seedTournamentViews(tournamentId: string, waitingCount: number, seatedCount = 5) {
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      okibakeNextDisplayNumber: 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({
        playersIn: 10,
        entries: 10,
        seatedCount,
        playersBusted: 0,
        addons: 0,
        waitingCount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  async function seedTable(tournamentId: string, tableId: string, seats: Record<string, string | null>) {
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .set({
        maxSeats: 6,
        isEnabled: true,
        seats,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  it('registered + unlinked なら席配置でき seatXXOkibake が入り waitingCount -1・seatedCount 不変', async () => {
    const uid = 'u-assign-1';
    const tournamentId = 't-assign-1';
    const entryId = 'okibake-entry-1';
    const tableId = 'tbl-1';
    await seedDevice(uid);
    await seedTournamentViews(tournamentId, 5, 42);
    await seedTable(tournamentId, tableId, {
      seat01UserId: null,
      seat01PokerName: null,
      seat02UserId: null,
      seat02PokerName: null,
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(entryId)
      .set(baseOkibakeEntry(entryId, tournamentId));

    const operationId = 'op-assign-happy';
    const res = await assignOkibakeTemporaryEntryToSeat.run({
      data: {
        operationId,
        tournamentId,
        okibakeEntryId: entryId,
        tableId,
        seatKey: 'seat01',
      },
      auth: { uid },
    } as any);

    expect(res.success).toBe(true);
    expect(res.replay).toBe(false);

    const tbl = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .get();
    const s = tbl.data()!.seats as Record<string, unknown>;
    expect(s.seat01UserId).toBeNull();
    expect(s.seat01OkibakeEntryId).toBe(entryId);
    expect(s.seat01PokerName).toBe('オキハッピー');
    expect(s.seat01UserId).not.toBe(entryId);

    const entry = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(entryId)
      .get();
    expect(entry.data()!.entryStatus).toBe('seated');

    const main = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .get();
    expect(main.data()!.waitingCount).toBe(4);
    expect(main.data()!.seatedCount).toBe(42);

    const op = await db.collection('operationLogs').doc(operationId).get();
    expect(op.data()!.status).toBe('succeeded');
    expect(op.data()!.tableId).toBe(tableId);
    const opPayload = op.data()!.payload as Record<string, unknown>;
    expect(opPayload.playerName).toBe('オキハッピー');
    expect(opPayload.seatNumber).toBe(1);
  });

  it('linkedUserPokerName が優先される', async () => {
    const uid = 'u-assign-2';
    const tournamentId = 't-assign-2';
    const entryId = 'entry-2';
    const tableId = 'tbl-2';
    await seedDevice(uid);
    await seedTournamentViews(tournamentId, 1);
    await seedTable(tournamentId, tableId, {
      seat02UserId: null,
      seat02PokerName: null,
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(entryId)
      .set(
        baseOkibakeEntry(entryId, tournamentId, {
          linkedUserPokerName: 'Pro Name',
          linkedUserId: 'line-u-1',
        })
      );

    await assignOkibakeTemporaryEntryToSeat.run({
      data: {
        operationId: 'op-2',
        tournamentId,
        okibakeEntryId: entryId,
        tableId,
        seatKey: '02',
      },
      auth: { uid },
    } as any);

    const tbl = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .get();
    expect((tbl.data()!.seats as any).seat02PokerName).toBe('Pro Name');
  });

  it('occupied seat は拒否', async () => {
    const uid = 'u-assign-3';
    const tournamentId = 't-assign-3';
    const entryId = 'entry-3';
    await seedDevice(uid);
    await seedTournamentViews(tournamentId, 1);
    await seedTable(tournamentId, 'tbl-3', {
      seat01UserId: 'user-x',
      seat01PokerName: 'Other',
      seat02UserId: null,
      seat02PokerName: null,
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(entryId)
      .set(baseOkibakeEntry(entryId, tournamentId));

    await expect(
      assignOkibakeTemporaryEntryToSeat.run({
        data: {
          operationId: 'op-occupied',
          tournamentId,
          okibakeEntryId: entryId,
          tableId: 'tbl-3',
          seatKey: 'seat01',
        },
        auth: { uid },
      } as any)
    ).rejects.toThrow(HttpsError);
  });

  it('seatXXOkibakeEntryId が既にある席は拒否', async () => {
    const uid = 'u-assign-occ-ok';
    const tournamentId = 't-assign-occ-ok';
    const entryId = 'want-seat';
    const other = 'already';
    await seedDevice(uid);
    await seedTournamentViews(tournamentId, 2);
    await seedTable(tournamentId, 'tbl-x', {
      seat01UserId: null,
      seat01PokerName: null,
      seat01OkibakeEntryId: other,
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(entryId)
      .set(baseOkibakeEntry(entryId, tournamentId));

    await expect(
      assignOkibakeTemporaryEntryToSeat.run({
        data: {
          operationId: 'op-okk',
          tournamentId,
          okibakeEntryId: entryId,
          tableId: 'tbl-x',
          seatKey: 'seat01',
        },
        auth: { uid },
      } as any)
    ).rejects.toThrow(HttpsError);
  });

  it('無効状態は拒否', async () => {
    const uid = 'u-assign-4';
    const tournamentId = 't-assign-4';
    const entryId = 'entry-4';
    await seedDevice(uid);
    await seedTournamentViews(tournamentId, 2);
    await seedTable(tournamentId, 'tbl-4', { seat01UserId: null, seat01PokerName: null });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(entryId)
      .set(
        baseOkibakeEntry(entryId, tournamentId, {
          billLinkStatus: 'linked',
        })
      );

    await expect(
      assignOkibakeTemporaryEntryToSeat.run({
        data: {
          operationId: 'op-linked',
          tournamentId,
          okibakeEntryId: entryId,
          tableId: 'tbl-4',
          seatKey: '1',
        },
        auth: { uid },
      } as any)
    ).rejects.toThrow(HttpsError);
  });

  it('同一 operationId 再送は replay', async () => {
    const uid = 'u-assign-5';
    const tournamentId = 't-assign-5';
    const entryId = 'entry-5';
    await seedDevice(uid);
    await seedTournamentViews(tournamentId, 4);
    await seedTable(tournamentId, 'tbl-5', { seat03UserId: null, seat03PokerName: null });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(entryId)
      .set(baseOkibakeEntry(entryId, tournamentId));

    const body = {
      operationId: 'op-replay-assign',
      tournamentId,
      okibakeEntryId: entryId,
      tableId: 'tbl-5',
      seatKey: 'seat03',
    };
    const first = await assignOkibakeTemporaryEntryToSeat.run({ data: body, auth: { uid } } as any);
    const second = await assignOkibakeTemporaryEntryToSeat.run({ data: body, auth: { uid } } as any);

    expect(first.replay).toBe(false);
    expect(second.success).toBe(true);
    expect(second.replay).toBe(true);
  });

  it('失敗済み operationId は再実行不可', async () => {
    const uid = 'u-assign-fail';
    const tournamentId = 't-assign-f';
    await seedDevice(uid);
    await seedTournamentViews(tournamentId, 1);
    await db.collection('operationLogs').doc('op-failed-mark').set({
      operationId: 'op-failed-mark',
      status: 'failed',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await expect(
      assignOkibakeTemporaryEntryToSeat.run({
        data: {
          operationId: 'op-failed-mark',
          tournamentId,
          okibakeEntryId: 'e',
          tableId: 't',
          seatKey: '1',
        },
        auth: { uid },
      } as any)
    ).rejects.toThrow(HttpsError);
  });
});
