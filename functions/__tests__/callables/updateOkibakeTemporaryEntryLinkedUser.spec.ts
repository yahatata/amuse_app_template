/**
 * updateOkibakeTemporaryEntryLinkedUser（Firestore Emulator）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

describe('updateOkibakeTemporaryEntryLinkedUser', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  let updateOkibakeTemporaryEntryLinkedUser: {
    run: (req: unknown) => Promise<Record<string, unknown>>;
  };
  const projectId = 'test-okibake-update-linked-user-fn';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
    const mod = await import(
      '../../src/domains/tournament_activeTournament/callables/updateOkibakeTemporaryEntryLinkedUser'
    );
    updateOkibakeTemporaryEntryLinkedUser =
      mod.updateOkibakeTemporaryEntryLinkedUser as typeof updateOkibakeTemporaryEntryLinkedUser;
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
      name: 'Terminal Linked User',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function seedTournament(tournamentId: string, users: Record<string, unknown> = {}) {
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      templateId: 'tpl-update-linked-user',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('usersList')
      .set({
        users,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  async function seedUser(userId: string, pokerName?: string | null) {
    await db.collection('users').doc(userId).set({
      pokerName,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  function entryBase(
    id: string,
    tournamentId: string,
    entryStatus: string,
    overrides: Record<string, unknown> = {}
  ) {
    const nowTs = admin.firestore.FieldValue.serverTimestamp();
    return {
      okibakeEntryId: id,
      tournamentId,
      temporaryDisplayName: 'オキバケA',
      linkedUserId: null,
      linkedUserPokerName: null,
      linkedBillId: null,
      linkedAt: null,
      entryStatus,
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

  async function seedEntry(
    tournamentId: string,
    entryId: string,
    entryStatus: string,
    overrides: Record<string, unknown> = {}
  ) {
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(entryId)
      .set(entryBase(entryId, tournamentId, entryStatus, overrides));
  }

  async function seedTable(
    tournamentId: string,
    tableId: string,
    seats: Record<string, unknown>
  ) {
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

  function runUpdate(params: {
    uid: string;
    tournamentId: string;
    okibakeEntryId: string;
    linkedUserId: string;
    operationId: string;
  }) {
    return updateOkibakeTemporaryEntryLinkedUser.run({
      data: {
        tournamentId: params.tournamentId,
        okibakeEntryId: params.okibakeEntryId,
        linkedUserId: params.linkedUserId,
        operationId: params.operationId,
      },
      auth: { uid: params.uid },
    } as any);
  }

  it('unlinked + registered に linkedUserId を設定できる', async () => {
    const uid = 'u-update-reg';
    const tid = 't-update-reg';
    const eid = 'e-reg';
    const linkedUserId = 'guest-reg';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedUser(linkedUserId, '登録太郎');
    await seedEntry(tid, eid, 'registered');

    const res = await runUpdate({
      uid,
      tournamentId: tid,
      okibakeEntryId: eid,
      linkedUserId,
      operationId: 'op-update-reg',
    });

    expect(res.success).toBe(true);
    expect(res.replay).toBe(false);
    expect(res.okibakeEntryId).toBe(eid);
    expect(res.linkedUserId).toBe(linkedUserId);
    expect(res.linkedUserPokerName).toBe('登録太郎');

    const entry = (
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('okibakeTemporaryEntries')
        .doc(eid)
        .get()
    ).data()!;
    expect(entry.linkedUserId).toBe(linkedUserId);
    expect(entry.linkedUserPokerName).toBe('登録太郎');
    expect(entry.entryStatus).toBe('registered');
    expect(entry.billLinkStatus).toBe('unlinked');

    const op = (await db.collection('operationLogs').doc('op-update-reg').get()).data()!;
    expect(op.operationName).toBe('置きバケ対象ユーザー設定');
    const payload = op.payload as Record<string, any>;
    expect(payload.before).toEqual({ linkedUserId: null, linkedUserPokerName: null });
    expect(payload.after).toEqual({ linkedUserId, linkedUserPokerName: '登録太郎' });
  });

  it('unlinked + seated に linkedUserId を設定でき、seatXXPokerName も更新される', async () => {
    const uid = 'u-update-seat';
    const tid = 't-update-seat';
    const eid = 'e-seat';
    const linkedUserId = 'guest-seat';
    const tableId = 'tbl-seat';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedUser(linkedUserId, '着席太郎');
    await seedTable(tid, tableId, {
      seat03UserId: null,
      seat03PokerName: 'オキバケA',
      seat03OkibakeEntryId: eid,
    });
    await seedEntry(tid, eid, 'seated', {
      assignedTableId: tableId,
      assignedSeatKey: 'seat03',
      seatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const res = await runUpdate({
      uid,
      tournamentId: tid,
      okibakeEntryId: eid,
      linkedUserId,
      operationId: 'op-update-seat',
    });

    expect(res.success).toBe(true);
    expect(res.linkedUserPokerName).toBe('着席太郎');

    const table = (
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('tablesSeat')
        .doc(tableId)
        .get()
    ).data()!;
    const seats = table.seats as Record<string, unknown>;
    expect(seats.seat03PokerName).toBe('着席太郎');
    expect(seats.seat03UserId).toBeNull();
    expect(seats.seat03OkibakeEntryId).toBe(eid);

    const op = (await db.collection('operationLogs').doc('op-update-seat').get()).data()!;
    const payload = op.payload as Record<string, any>;
    expect(payload.seatBefore).toEqual({
      tableId,
      seatKey: 'seat03',
      pokerName: 'オキバケA',
    });
    expect(payload.seatAfter).toEqual({
      tableId,
      seatKey: 'seat03',
      pokerName: '着席太郎',
    });
  });

  it('unlinked + busted に linkedUserId を設定できる', async () => {
    const uid = 'u-update-busted';
    const tid = 't-update-busted';
    const eid = 'e-busted';
    const linkedUserId = 'guest-busted';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedUser(linkedUserId, '退席太郎');
    await seedEntry(tid, eid, 'busted', {
      bustedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const res = await runUpdate({
      uid,
      tournamentId: tid,
      okibakeEntryId: eid,
      linkedUserId,
      operationId: 'op-update-busted',
    });

    expect(res.success).toBe(true);
    expect(res.linkedUserPokerName).toBe('退席太郎');
    const entry = (
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('okibakeTemporaryEntries')
        .doc(eid)
        .get()
    ).data()!;
    expect(entry.entryStatus).toBe('busted');
    expect(entry.billLinkStatus).toBe('unlinked');
    expect(entry.linkedUserId).toBe(linkedUserId);
  });

  it.each([
    ['linked', 'registered', { billLinkStatus: 'linked' }],
    ['pending_review', 'registered', { billLinkStatus: 'pending_review' }],
    ['voided', 'voided', {}],
  ])('%s は拒否', async (_label, entryStatus, overrides) => {
    const uid = `u-update-reject-${_label}`;
    const tid = `t-update-reject-${_label}`;
    const eid = `e-${_label}`;
    const linkedUserId = `guest-${_label}`;
    await seedDevice(uid);
    await seedTournament(tid);
    await seedUser(linkedUserId, '拒否太郎');
    await seedEntry(tid, eid, entryStatus, overrides);

    await expect(
      runUpdate({
        uid,
        tournamentId: tid,
        okibakeEntryId: eid,
        linkedUserId,
        operationId: `op-reject-${_label}`,
      })
    ).rejects.toThrow(HttpsError);
  });

  it('linkedUserId 設定済み entry は拒否', async () => {
    const uid = 'u-update-already-set';
    const tid = 't-update-already-set';
    const eid = 'e-already-set';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedUser('guest-next', '次の人');
    await seedEntry(tid, eid, 'registered', {
      linkedUserId: 'guest-current',
      linkedUserPokerName: '設定済み',
    });

    await expect(
      runUpdate({
        uid,
        tournamentId: tid,
        okibakeEntryId: eid,
        linkedUserId: 'guest-next',
        operationId: 'op-already-set',
      })
    ).rejects.toThrow(HttpsError);
  });

  it('user not found は拒否', async () => {
    const uid = 'u-update-user-not-found';
    const tid = 't-update-user-not-found';
    const eid = 'e-user-not-found';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedEntry(tid, eid, 'registered');

    await expect(
      runUpdate({
        uid,
        tournamentId: tid,
        okibakeEntryId: eid,
        linkedUserId: 'missing-user',
        operationId: 'op-user-not-found',
      })
    ).rejects.toThrow(HttpsError);
  });

  it('同一 tournament 通常参加済みユーザーは拒否', async () => {
    const uid = 'u-update-conflict';
    const tid = 't-update-conflict';
    const eid = 'e-conflict';
    const linkedUserId = 'guest-conflict';
    await seedDevice(uid);
    await seedTournament(tid, {
      [linkedUserId]: {
        pokerName: '通常参加済み',
        registeredAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });
    await seedUser(linkedUserId, '通常参加済み');
    await seedEntry(tid, eid, 'registered');

    await expect(
      runUpdate({
        uid,
        tournamentId: tid,
        okibakeEntryId: eid,
        linkedUserId,
        operationId: 'op-conflict',
      })
    ).rejects.toThrow(HttpsError);
  });

  it('他の置きバケで使用中の linkedUserId は拒否（voided は除外）', async () => {
    const uid = 'u-update-okibake-dup';
    const tid = 't-update-okibake-dup';
    const eid = 'e-target';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedUser('guest-dup', '重複ユーザー');
    await seedEntry(tid, eid, 'registered');
    await seedEntry(tid, 'e-other', 'busted', {
      linkedUserId: 'guest-dup',
      linkedUserPokerName: '重複ユーザー',
      billLinkStatus: 'pending_review',
    });
    await seedEntry(tid, 'e-voided', 'voided', {
      linkedUserId: 'guest-voided',
      linkedUserPokerName: 'voided',
    });
    await seedUser('guest-voided', 'voided');

    await expect(
      runUpdate({
        uid,
        tournamentId: tid,
        okibakeEntryId: eid,
        linkedUserId: 'guest-dup',
        operationId: 'op-okibake-dup-reject',
      })
    ).rejects.toThrow(HttpsError);

    const ok = await runUpdate({
      uid,
      tournamentId: tid,
      okibakeEntryId: eid,
      linkedUserId: 'guest-voided',
      operationId: 'op-okibake-voided-ok',
    });
    expect(ok.success).toBe(true);
  });

  it('operationId replay は二重更新しない', async () => {
    const uid = 'u-update-replay';
    const tid = 't-update-replay';
    const eid = 'e-replay';
    const linkedUserId = 'guest-replay';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedUser(linkedUserId, '冪等太郎');
    await seedEntry(tid, eid, 'registered');

    const body = {
      uid,
      tournamentId: tid,
      okibakeEntryId: eid,
      linkedUserId,
      operationId: 'op-replay-linked-user',
    };
    const first = await runUpdate(body);
    const second = await runUpdate(body);

    expect(first.replay).toBe(false);
    expect(second.success).toBe(true);
    expect(second.replay).toBe(true);
    expect(second.linkedUserPokerName).toBe('冪等太郎');

    const opSnap = await db.collection('operationLogs').where('operationId', '==', body.operationId).get();
    expect(opSnap.size).toBe(1);
  });

  it('同一 operationId で別 payload は拒否', async () => {
    const uid = 'u-update-mismatch';
    const tid = 't-update-mismatch';
    const eid = 'e-mismatch';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedUser('guest-one', '一人目');
    await seedUser('guest-two', '二人目');
    await seedEntry(tid, eid, 'registered');

    await runUpdate({
      uid,
      tournamentId: tid,
      okibakeEntryId: eid,
      linkedUserId: 'guest-one',
      operationId: 'op-mismatch',
    });

    await expect(
      runUpdate({
        uid,
        tournamentId: tid,
        okibakeEntryId: eid,
        linkedUserId: 'guest-two',
        operationId: 'op-mismatch',
      })
    ).rejects.toThrow(HttpsError);
  });

  it('pokerName が空なら linkedUserId を linkedUserPokerName として保存する', async () => {
    const uid = 'u-update-fallback';
    const tid = 't-update-fallback';
    const eid = 'e-fallback';
    const linkedUserId = 'guest-fallback';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedUser(linkedUserId, '  ');
    await seedEntry(tid, eid, 'registered');

    const res = await runUpdate({
      uid,
      tournamentId: tid,
      okibakeEntryId: eid,
      linkedUserId,
      operationId: 'op-fallback',
    });

    expect(res.linkedUserPokerName).toBe(linkedUserId);
    const entry = (
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('okibakeTemporaryEntries')
        .doc(eid)
        .get()
    ).data()!;
    expect(entry.linkedUserPokerName).toBe(linkedUserId);
  });
});
