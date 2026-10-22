/**
 * bustOkibakeTemporaryEntry（Firestore Emulator）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

describe('bustOkibakeTemporaryEntry', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  let bustOkibakeTemporaryEntry: {
    run: (req: unknown) => Promise<Record<string, unknown>>;
  };
  const projectId = 'test-okibake-bust-fn';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
    const mod = await import(
      '../../src/domains/tournament_activeTournament/callables/bustOkibakeTemporaryEntry'
    );
    bustOkibakeTemporaryEntry = mod.bustOkibakeTemporaryEntry as typeof bustOkibakeTemporaryEntry;
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
      name: 'Terminal Bust',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function seedTableDevice(uid: string, tableId: string) {
    await db.collection('devices').doc(`table_${uid}`).set({
      uid,
      role: 'table',
      status: 'active',
      name: 'Table Okibake Bust',
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

  async function seedViews(tournamentId: string) {
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({
        entries: 2,
        playersIn: 2,
        seatedCount: 6,
        waitingCount: 1,
        playersBusted: 2,
        addons: 9,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  function seatedEntry(entryId: string, tournamentId: string, overrides: Record<string, unknown> = {}) {
    const nowTs = admin.firestore.FieldValue.serverTimestamp();
    return {
      okibakeEntryId: entryId,
      tournamentId,
      temporaryDisplayName: 'BK',
      linkedUserId: null,
      linkedUserPokerName: null,
      linkedBillId: null,
      linkedAt: null,
      entryStatus: 'seated',
      billLinkStatus: 'unlinked',
      addonIntent: 'unknown',
      memo: null,
      okibakeAddonCount: 0,
      lastOkibakeAddonAt: null,
      okibakeAddonRecords: [],
      assignedTableId: 'table-b',
      assignedSeatKey: 'seat02',
      seatedAt: nowTs,
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

  async function seedTable(tournamentId: string, okibakeOnSeat02: string) {
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc('table-b')
      .set({
        isEnabled: true,
        seats: {
          seat01UserId: null,
          seat01PokerName: null,
          seat02UserId: null,
          seat02PokerName: 'Shown',
          seat02OkibakeEntryId: okibakeOnSeat02,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  it('seated + unlinked で bust し席が解放され bust 情報が保存され playersBusted が +1 される', async () => {
    const uid = 'u-bust-1';
    const tid = 't-bust-1';
    const eid = 'okibake-seat-99';
    await seedDevice(uid);
    await seedViews(tid);
    await seedTable(tid, eid);
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(seatedEntry(eid, tid));

    const beforeMain = (
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('views')
        .doc('main')
        .get()
    ).data();

    const res = await bustOkibakeTemporaryEntry.run({
      data: { tournamentId: tid, okibakeEntryId: eid, operationId: 'op-bust-h' },
      auth: { uid },
    } as any);

    expect(res.success).toBe(true);
    expect(res.replay).toBe(false);

    const tbl = await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('tablesSeat')
      .doc('table-b')
      .get();
    const s = tbl.data()!.seats as Record<string, unknown>;
    expect(s.seat02OkibakeEntryId).toBeNull();
    expect(s.seat02PokerName).toBeNull();

    const ent = await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .get();
    const ed = ent.data()!;
    expect(ed.entryStatus).toBe('busted');
    expect(ed.bustedTableId).toBe('table-b');
    expect(ed.bustedSeatKey).toBe('seat02');

    const afterMain = (
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('views')
        .doc('main')
        .get()
    ).data();

    expect(afterMain!.addons).toEqual(beforeMain!.addons);
    expect(afterMain!.waitingCount).toEqual(beforeMain!.waitingCount);
    expect(afterMain!.seatedCount).toEqual(beforeMain!.seatedCount);
    expect(afterMain!.entries).toEqual(beforeMain!.entries);
    expect(afterMain!.playersBusted).toBe((beforeMain!.playersBusted as number) + 1);

    const op = await db.collection('operationLogs').doc('op-bust-h').get();
    expect(op.data()!.status).toBe('succeeded');
    expect(op.data()!.tableId).toBe('table-b');
    const payload = op.data()!.payload as Record<string, unknown>;
    expect(payload.playerName).toBe('BK');
    expect(payload.seatNumber).toBe(2);
    expect(payload.tableId).toBe('table-b');
  });

  it('seated 時 operationLogs に linkedUserPokerName を playerName として記録する', async () => {
    const uid = 'u-bust-linked';
    const tid = 't-bust-linked';
    const eid = 'okibake-linked-bust';
    await seedDevice(uid);
    await seedViews(tid);
    await seedTable(tid, eid);
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(
        seatedEntry(eid, tid, {
          linkedUserPokerName: 'リンク太郎',
          assignedSeatKey: 'seat03',
        })
      );
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('tablesSeat')
      .doc('table-b')
      .set({
        isEnabled: true,
        seats: {
          seat03UserId: null,
          seat03PokerName: 'リンク太郎',
          seat03OkibakeEntryId: eid,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await bustOkibakeTemporaryEntry.run({
      data: { tournamentId: tid, okibakeEntryId: eid, operationId: 'op-bust-linked' },
      auth: { uid },
    } as any);

    const op = await db.collection('operationLogs').doc('op-bust-linked').get();
    const payload = op.data()!.payload as Record<string, unknown>;
    expect(payload.playerName).toBe('リンク太郎');
    expect(payload.seatNumber).toBe(3);
    expect(op.data()!.tableId).toBe('table-b');
  });

  it('registered は拒否', async () => {
    const uid = 'u-br';
    const tid = 't-br';
    const eid = 'e-reg-only';
    await seedDevice(uid);
    await seedViews(tid);
    await seedTable(tid, '');
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(seatedEntry(eid, tid, { entryStatus: 'registered', assignedTableId: null }));

    await expect(
      bustOkibakeTemporaryEntry.run({
        data: {
          tournamentId: tid,
          okibakeEntryId: eid,
          operationId: 'op-bad-es',
        },
        auth: { uid },
      } as any)
    ).rejects.toThrow(HttpsError);
  });

  it('seat mismatch は拒否', async () => {
    const uid = 'u-mm';
    const tid = 't-mm';
    const eid = 'e-mm';
    await seedDevice(uid);
    await seedViews(tid);
    await seedTable(tid, 'other-entry');
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(seatedEntry(eid, tid));

    await expect(
      bustOkibakeTemporaryEntry.run({
        data: { tournamentId: tid, okibakeEntryId: eid, operationId: 'op-mm' },
        auth: { uid },
      } as any)
    ).rejects.toThrow(HttpsError);
  });

  it('同一 operationId 再送は replay で playersBusted は二重加算されない', async () => {
    const uid = 'u-brep';
    const tid = 't-brep';
    const eid = 'eb';
    await seedDevice(uid);
    await seedViews(tid);
    await seedTable(tid, eid);
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(seatedEntry(eid, tid));

    const body = { tournamentId: tid, okibakeEntryId: eid, operationId: 'op-same-bust' };
    const first = await bustOkibakeTemporaryEntry.run({ data: body, auth: { uid } } as any);
    await expect(bustOkibakeTemporaryEntry.run({ data: body, auth: { uid } } as any)).resolves.toMatchObject({
      replay: true,
    });
    expect(first.replay).toBe(false);

    const main = (
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('views')
        .doc('main')
        .get()
    ).data()!;
    expect(main.playersBusted).toBe(3);
  });

  it('すでに busted の entry では拒否され playersBusted は増えない', async () => {
    const uid = 'u-already-busted';
    const tid = 't-already-busted';
    const eid = 'e-already-busted';
    await seedDevice(uid);
    await seedViews(tid);
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(seatedEntry(eid, tid, { entryStatus: 'busted', billLinkStatus: 'unlinked' }));

    await expect(
      bustOkibakeTemporaryEntry.run({
        data: { tournamentId: tid, okibakeEntryId: eid, operationId: 'op-already-busted' },
        auth: { uid },
      } as any)
    ).rejects.toThrow(HttpsError);

    const main = (
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('views')
        .doc('main')
        .get()
    ).data()!;
    expect(main.playersBusted).toBe(2);
  });

  it.each([
    ['linked', { billLinkStatus: 'linked' }],
    ['pending_review', { billLinkStatus: 'pending_review' }],
    ['voided', { entryStatus: 'voided', billLinkStatus: 'unlinked' }],
  ])('%s の entry は拒否され playersBusted は増えない', async (_label, overrides) => {
    const uid = 'u-reject-status';
    const tid = `t-reject-${_label}`;
    const eid = `e-reject-${_label}`;
    await seedDevice(uid);
    await seedViews(tid);
    await seedTable(tid, eid);
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(seatedEntry(eid, tid, overrides));

    await expect(
      bustOkibakeTemporaryEntry.run({
        data: { tournamentId: tid, okibakeEntryId: eid, operationId: `op-reject-${_label}` },
        auth: { uid },
      } as any)
    ).rejects.toThrow(HttpsError);

    const main = (
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('views')
        .doc('main')
        .get()
    ).data()!;
    expect(main.playersBusted).toBe(2);
  });

  it('role table は自卓着席の置きバケを bust できる', async () => {
    const uid = 'u-table-bust';
    const tid = 't-table-bust';
    const eid = 'e-table-bust';
    const tableId = 'table-b';
    await seedTableDevice(uid, tableId);
    await seedViews(tid);
    await seedTable(tid, eid);
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(seatedEntry(eid, tid));

    const res = await bustOkibakeTemporaryEntry.run({
      data: { tournamentId: tid, okibakeEntryId: eid, operationId: 'op-table-bust' },
      auth: { uid },
    } as any);

    expect(res.success).toBe(true);
  });

  it('role table は別卓着席の置きバケ bust を拒否する', async () => {
    const uid = 'u-table-bust-deny';
    const tid = 't-table-bust-deny';
    const eid = 'e-table-bust-deny';
    await seedTableDevice(uid, 'table-a');
    await seedViews(tid);
    await seedTable(tid, eid);
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(seatedEntry(eid, tid));

    await expect(
      bustOkibakeTemporaryEntry.run({
        data: { tournamentId: tid, okibakeEntryId: eid, operationId: 'op-table-bust-deny' },
        auth: { uid },
      } as any),
    ).rejects.toThrow(HttpsError);
  });
});
