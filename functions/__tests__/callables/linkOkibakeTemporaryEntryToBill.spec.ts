/**
 * linkOkibakeTemporaryEntryToBill（Firestore Emulator）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

describe('linkOkibakeTemporaryEntryToBill', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  let linkOkibakeTemporaryEntryToBill: {
    run: (req: unknown) => Promise<Record<string, unknown>>;
  };
  const projectId = 'test-okibake-link-bill-fn';

  const templateId = 'tpl-link-1';
  const entryFee = 3000;
  const addonFee = 1500;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
    const mod = await import(
      '../../src/domains/tournament_activeTournament/callables/linkOkibakeTemporaryEntryToBill'
    );
    linkOkibakeTemporaryEntryToBill = mod.linkOkibakeTemporaryEntryToBill as typeof linkOkibakeTemporaryEntryToBill;
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
      name: 'Terminal Link',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  function entryBase(
    id: string,
    tournamentId: string,
    status: string,
    overrides: Record<string, unknown> = {}
  ) {
    const nowTs = admin.firestore.FieldValue.serverTimestamp();
    return {
      okibakeEntryId: id,
      tournamentId,
      temporaryDisplayName: 'オキバケ',
      linkedUserId: null,
      linkedUserPokerName: null,
      linkedBillId: null,
      linkedAt: null,
      entryStatus: status,
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

  function addonRecord(id: string, overrides: Record<string, unknown> = {}) {
    return {
      addonRecordId: id,
      operationId: `op-${id}`,
      occurredAt: admin.firestore.Timestamp.fromDate(new Date('2025-11-20T12:00:00Z')),
      createdByDeviceId: 'dev',
      reflectedToBill: false,
      reflectedToBillAt: null,
      linkedBillId: null,
      rolledBack: false,
      rollBackAt: null,
      rollBackBy: null,
      ...overrides,
    };
  }

  async function seedTournament(tournamentId: string) {
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      templateId,
      startAt: admin.firestore.Timestamp.fromDate(new Date('2025-11-20T10:00:00Z')),
      snapshot: {
        name: 'リンクテストTN',
        entryFee,
        addonFee,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({
        entries: 5,
        playersIn: 4,
        waitingCount: 2,
        seatedCount: 3,
        playersBusted: 1,
        addons: 7,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  async function seedBillAndStay(
    userId: string,
    billId: string,
    status: string,
    pokerName = 'リンク太郎'
  ) {
    await db.collection('bills').doc(billId).set({
      status,
      party: { userId, pokerName },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('activeStays').doc(userId).set({
      isActive: true,
      billId,
      pokerName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function seedTable(
    tournamentId: string,
    tableId: string,
    seats: Record<string, string | null>
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

  async function runLink(params: {
    uid: string;
    tournamentId: string;
    okibakeEntryId: string;
    userId: string;
    billId: string;
    operationId: string;
  }) {
    return linkOkibakeTemporaryEntryToBill.run({
      data: {
        tournamentId: params.tournamentId,
        okibakeEntryId: params.okibakeEntryId,
        userId: params.userId,
        billId: params.billId,
        operationId: params.operationId,
      },
      auth: { uid: params.uid },
    } as any);
  }

  it('registered + unlinked entry を linked にできる', async () => {
    const uid = 'u-link-reg';
    const tid = 't-link-reg';
    const eid = 'e-reg';
    const guestUid = 'guest-reg';
    const billId = 'bill-reg';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedBillAndStay(guestUid, billId, 'open');
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(entryBase(eid, tid, 'registered'));

    const res = await runLink({
      uid,
      tournamentId: tid,
      okibakeEntryId: eid,
      userId: guestUid,
      billId,
      operationId: 'op-link-reg',
    });

    expect(res.success).toBe(true);
    expect(res.replay).toBe(false);

    const entry = (
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('okibakeTemporaryEntries')
        .doc(eid)
        .get()
    ).data()!;
    expect(entry.billLinkStatus).toBe('linked');
    expect(entry.linkedUserId).toBe(guestUid);
    expect(entry.linkedBillId).toBe(billId);
    expect(entry.linkedUserPokerName).toBe('リンク太郎');

    const billTournament = (
      await db.collection('bills').doc(billId).collection('tournaments').doc(templateId).get()
    ).data()!;
    expect(billTournament.entryCount).toBe(1);
    expect(billTournament.entryFeeIncl).toBe(entryFee);
    expect(billTournament.addonCount).toBe(0);

    const waiting = (
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('tablesSeat')
        .doc('waiting')
        .get()
    ).data()!;
    expect(waiting.count).toBe(1);
    expect(waiting.waiting[guestUid].pokerName).toBe('リンク太郎');
    expect(waiting.waiting[guestUid].order).toBe(1);

    const usersList = (
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('views')
        .doc('usersList')
        .get()
    ).data()!;
    expect(usersList.users[guestUid].pokerName).toBe('リンク太郎');

    const op = (await db.collection('operationLogs').doc('op-link-reg').get()).data()!;
    expect(op.payload.waitingAfter.userEntry.pokerName).toBe('リンク太郎');
    expect(op.payload.usersListAfter.userEntry.pokerName).toBe('リンク太郎');
  });

  it('registered + unlinked entry の linked 時、既存の通常待機者一覧へ末尾追加する', async () => {
    const uid = 'u-link-reg-waiting';
    const tid = 't-link-reg-waiting';
    const eid = 'e-reg-waiting';
    const guestUid = 'guest-reg-waiting';
    const billId = 'bill-reg-waiting';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedBillAndStay(guestUid, billId, 'open');
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('tablesSeat')
      .doc('waiting')
      .set({
        count: 1,
        waiting: {
          existing: {
            pokerName: '既存太郎',
            joinedAt: admin.firestore.FieldValue.serverTimestamp(),
            order: 4,
          },
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('views')
      .doc('usersList')
      .set({
        users: {
          existing: {
            pokerName: '既存太郎',
            registeredAt: admin.firestore.FieldValue.serverTimestamp(),
            lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(entryBase(eid, tid, 'registered'));

    await runLink({
      uid,
      tournamentId: tid,
      okibakeEntryId: eid,
      userId: guestUid,
      billId,
      operationId: 'op-link-reg-waiting',
    });

    const waiting = (
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('tablesSeat')
        .doc('waiting')
        .get()
    ).data()!;
    expect(waiting.count).toBe(2);
    expect(waiting.waiting.existing.pokerName).toBe('既存太郎');
    expect(waiting.waiting[guestUid].pokerName).toBe('リンク太郎');
    expect(waiting.waiting[guestUid].order).toBe(5);

    const usersList = (
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('views')
        .doc('usersList')
        .get()
    ).data()!;
    expect(usersList.users.existing.pokerName).toBe('既存太郎');
    expect(usersList.users[guestUid].pokerName).toBe('リンク太郎');
  });

  it('seated + unlinked entry を linked にし seatXXUserId / seatXXPokerName を差し替える', async () => {
    const uid = 'u-link-seat';
    const tid = 't-link-seat';
    const eid = 'e-seat';
    const guestUid = 'guest-seat';
    const billId = 'bill-seat';
    const tableId = 'tbl-seat';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedBillAndStay(guestUid, billId, 'in_progress');
    await seedTable(tid, tableId, {
      seat03UserId: null,
      seat03PokerName: 'オキバケ',
      seat03OkibakeEntryId: eid,
    });
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(
        entryBase(eid, tid, 'seated', {
          assignedTableId: tableId,
          assignedSeatKey: 'seat03',
        })
      );

    await runLink({
      uid,
      tournamentId: tid,
      okibakeEntryId: eid,
      userId: guestUid,
      billId,
      operationId: 'op-link-seat',
    });

    const table = (
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('tablesSeat')
        .doc(tableId)
        .get()
    ).data()!;
    const seats = table.seats as Record<string, unknown>;
    expect(seats.seat03UserId).toBe(guestUid);
    expect(seats.seat03PokerName).toBe('リンク太郎');
    expect(seats.seat03OkibakeEntryId).toBe(eid);

    const usersList = (
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('views')
        .doc('usersList')
        .get()
    ).data()!;
    expect(usersList.users[guestUid].pokerName).toBe('リンク太郎');

    const op = (await db.collection('operationLogs').doc('op-link-seat').get()).data()!;
    expect(op.payload.usersListAfter.userEntry.pokerName).toBe('リンク太郎');
  });

  it('busted + unlinked entry を linked にでき entry / addon は bill 側に反映する', async () => {
    const uid = 'u-link-bust';
    const tid = 't-link-bust';
    const eid = 'e-bust';
    const guestUid = 'guest-bust';
    const billId = 'bill-bust';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedBillAndStay(guestUid, billId, 'open');
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(
        entryBase(eid, tid, 'busted', {
          okibakeAddonCount: 1,
          okibakeAddonRecords: [addonRecord('ar-bust')],
        })
      );

    await runLink({
      uid,
      tournamentId: tid,
      okibakeEntryId: eid,
      userId: guestUid,
      billId,
      operationId: 'op-link-bust',
    });

    const entry = (
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('okibakeTemporaryEntries')
        .doc(eid)
        .get()
    ).data()!;
    expect(entry.billLinkStatus).toBe('linked');
    expect(entry.linkedBillId).toBe(billId);
    expect(entry.linkedUserId).toBe(guestUid);
    expect(entry.entryStatus).toBe('busted');

    const billTournament = (
      await db.collection('bills').doc(billId).collection('tournaments').doc(templateId).get()
    ).data()!;
    expect(billTournament.entryCount).toBe(1);
    expect(billTournament.addonCount).toBe(1);

    const usersList = (
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('views')
        .doc('usersList')
        .get()
    ).data()!;
    expect(usersList.users[guestUid].pokerName).toBe('リンク太郎');

    const op = await db.collection('operationLogs').doc('op-link-bust').get();
    const payload = op.data()!.payload as Record<string, unknown>;
    expect(payload.reflectedEntry).toBeDefined();
    expect(payload.reflectedAddonCount).toBe(1);
    expect((payload.usersListAfter as Record<string, any>).userEntry.pokerName).toBe('リンク太郎');
  });

  it('busted entry を link しても bill 側へ bust 専用反映を作成しない', async () => {
    const uid = 'u-link-bust-no-flag';
    const tid = 't-link-bust-no-flag';
    const eid = 'e-bust-no-flag';
    const guestUid = 'guest-bust-no-flag';
    const billId = 'bill-bust-no-flag';
    const bustedAt = admin.firestore.Timestamp.fromDate(new Date('2025-11-20T14:00:00Z'));
    await seedDevice(uid);
    await seedTournament(tid);
    await seedBillAndStay(guestUid, billId, 'open');
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(
        entryBase(eid, tid, 'busted', {
          bustedAt,
        })
      );

    await runLink({
      uid,
      tournamentId: tid,
      okibakeEntryId: eid,
      userId: guestUid,
      billId,
      operationId: 'op-link-bust-no-flag',
    });

    const entry = (
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('okibakeTemporaryEntries')
        .doc(eid)
        .get()
    ).data()!;
    expect(entry.billLinkStatus).toBe('linked');
    expect(entry.bustedAt).toEqual(bustedAt);

    const op = await db.collection('operationLogs').doc('op-link-bust-no-flag').get();
    const payload = op.data()!.payload as Record<string, unknown>;
    expect(payload.reflectedEntry).toBeDefined();
  });

  it('linked entry は拒否する', async () => {
    const uid = 'u-link-already';
    const tid = 't-link-already';
    const eid = 'e-already';
    const guestUid = 'guest-already';
    const billId = 'bill-already';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedBillAndStay(guestUid, billId, 'open');
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(
        entryBase(eid, tid, 'registered', {
          billLinkStatus: 'linked',
          linkedBillId: 'other-bill',
          linkedUserId: guestUid,
        })
      );

    await expect(
      runLink({
        uid,
        tournamentId: tid,
        okibakeEntryId: eid,
        userId: guestUid,
        billId,
        operationId: 'op-link-already',
      })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('紐付け済み'),
    });
  });

  it('pending_review でも紐付けできる', async () => {
    const uid = 'u-link-pending';
    const tid = 't-link-pending';
    const eid = 'e-pending';
    const guestUid = 'guest-pending';
    const billId = 'bill-pending';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedBillAndStay(guestUid, billId, 'open');
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(entryBase(eid, tid, 'registered', { billLinkStatus: 'pending_review' }));

    const result = await runLink({
      uid,
      tournamentId: tid,
      okibakeEntryId: eid,
      userId: guestUid,
      billId,
      operationId: 'op-link-pending',
    });

    expect(result).toMatchObject({
      success: true,
      replay: false,
      okibakeEntryId: eid,
      billId,
    });
  });

  it('同一トーナメントの別置きバケに linkedUserId 設定済みの userId には紐付けできない', async () => {
    const uid = 'u-link-used-user';
    const tid = 't-link-used-user';
    const eid = 'e-target';
    const otherEid = 'e-other';
    const guestUid = 'guest-used-user';
    const billId = 'bill-used-user';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedBillAndStay(guestUid, billId, 'open');
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(entryBase(eid, tid, 'registered'));
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(otherEid)
      .set(
        entryBase(otherEid, tid, 'registered', {
          linkedUserId: guestUid,
          linkedUserPokerName: '既存リンク',
          billLinkStatus: 'pending_review',
        })
      );

    await expect(
      runLink({
        uid,
        tournamentId: tid,
        okibakeEntryId: eid,
        userId: guestUid,
        billId,
        operationId: 'op-link-used-user',
      })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('他の置きバケに設定済み'),
    });
  });

  it('voided は拒否する', async () => {
    const uid = 'u-link-void';
    const tid = 't-link-void';
    const eid = 'e-void';
    const guestUid = 'guest-void';
    const billId = 'bill-void';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedBillAndStay(guestUid, billId, 'open');
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(entryBase(eid, tid, 'voided'));

    await expect(
      runLink({
        uid,
        tournamentId: tid,
        okibakeEntryId: eid,
        userId: guestUid,
        billId,
        operationId: 'op-link-void',
      })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('取消済み'),
    });
  });

  it('bill not found は拒否する', async () => {
    const uid = 'u-link-no-bill';
    const tid = 't-link-no-bill';
    const eid = 'e-no-bill';
    const guestUid = 'guest-no-bill';
    const billId = 'bill-missing';
    await seedDevice(uid);
    await seedTournament(tid);
    await db.collection('activeStays').doc(guestUid).set({
      isActive: true,
      billId,
      pokerName: '太郎',
    });
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(entryBase(eid, tid, 'registered'));

    await expect(
      runLink({
        uid,
        tournamentId: tid,
        okibakeEntryId: eid,
        userId: guestUid,
        billId,
        operationId: 'op-link-no-bill',
      })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('伝票が見つかりません'),
    });
  });

  it('activeStay not found は拒否する', async () => {
    const uid = 'u-link-no-stay';
    const tid = 't-link-no-stay';
    const eid = 'e-no-stay';
    const guestUid = 'guest-no-stay';
    const billId = 'bill-no-stay';
    await seedDevice(uid);
    await seedTournament(tid);
    await db.collection('bills').doc(billId).set({
      status: 'open',
      party: { userId: guestUid, pokerName: '太郎' },
    });
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(entryBase(eid, tid, 'registered'));

    await expect(
      runLink({
        uid,
        tournamentId: tid,
        okibakeEntryId: eid,
        userId: guestUid,
        billId,
        operationId: 'op-link-no-stay',
      })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('来店情報が見つかりません'),
    });
  });

  it('bill status settled / voided は拒否する', async () => {
    const uid = 'u-link-bill-status';
    const tid = 't-link-bill-status';
    const eid = 'e-bill-status';
    const guestUid = 'guest-bill-status';
    await seedDevice(uid);
    await seedTournament(tid);
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(entryBase(eid, tid, 'registered'));

    for (const status of ['settled', 'voided'] as const) {
      const billId = `bill-${status}`;
      await seedBillAndStay(guestUid, billId, status);
      await expect(
        runLink({
          uid,
          tournamentId: tid,
          okibakeEntryId: eid,
          userId: guestUid,
          billId,
          operationId: `op-link-${status}`,
        })
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    }
  });

  it('activeStay.billId != billId は拒否する', async () => {
    const uid = 'u-link-stay-mismatch';
    const tid = 't-link-stay-mismatch';
    const eid = 'e-stay-mismatch';
    const guestUid = 'guest-stay-mismatch';
    const billId = 'bill-stay-mismatch';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedBillAndStay(guestUid, 'other-bill', 'open');
    await db.collection('bills').doc(billId).set({
      status: 'open',
      party: { userId: guestUid, pokerName: '太郎' },
    });
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(entryBase(eid, tid, 'registered'));

    await expect(
      runLink({
        uid,
        tournamentId: tid,
        okibakeEntryId: eid,
        userId: guestUid,
        billId,
        operationId: 'op-link-stay-mismatch',
      })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('来店情報と伝票が一致しません'),
    });
  });

  it('bill.party.userId != userId は拒否する', async () => {
    const uid = 'u-link-user-mismatch';
    const tid = 't-link-user-mismatch';
    const eid = 'e-user-mismatch';
    const guestUid = 'guest-user-mismatch';
    const billId = 'bill-user-mismatch';
    await seedDevice(uid);
    await seedTournament(tid);
    await db.collection('bills').doc(billId).set({
      status: 'open',
      party: { userId: 'someone-else', pokerName: '他人' },
    });
    await db.collection('activeStays').doc(guestUid).set({
      isActive: true,
      billId,
      pokerName: '太郎',
    });
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(entryBase(eid, tid, 'registered'));

    await expect(
      runLink({
        uid,
        tournamentId: tid,
        okibakeEntryId: eid,
        userId: guestUid,
        billId,
        operationId: 'op-link-user-mismatch',
      })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('伝票のユーザーと一致しません'),
    });
  });

  it('bill 側に同じ tournament doc が既にある場合は拒否する', async () => {
    const uid = 'u-link-conflict';
    const tid = 't-link-conflict';
    const eid = 'e-conflict';
    const guestUid = 'guest-conflict';
    const billId = 'bill-conflict';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedBillAndStay(guestUid, billId, 'open');
    await db
      .collection('bills')
      .doc(billId)
      .collection('tournaments')
      .doc(templateId)
      .set({ templateId, entryCount: 1, entryFeeIncl: entryFee });
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(entryBase(eid, tid, 'registered'));

    await expect(
      runLink({
        uid,
        tournamentId: tid,
        okibakeEntryId: eid,
        userId: guestUid,
        billId,
        operationId: 'op-link-conflict',
      })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('同一トーナメント'),
    });
  });

  it('okibakeAddonRecords 未反映分を bill 側 addonCount / addonFee に反映する', async () => {
    const uid = 'u-link-addon';
    const tid = 't-link-addon';
    const eid = 'e-addon';
    const guestUid = 'guest-addon';
    const billId = 'bill-addon';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedBillAndStay(guestUid, billId, 'open');
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(
        entryBase(eid, tid, 'registered', {
          okibakeAddonCount: 2,
          okibakeAddonRecords: [addonRecord('ar-1'), addonRecord('ar-2')],
        })
      );

    await runLink({
      uid,
      tournamentId: tid,
      okibakeEntryId: eid,
      userId: guestUid,
      billId,
      operationId: 'op-link-addon',
    });

    const billTournament = (
      await db.collection('bills').doc(billId).collection('tournaments').doc(templateId).get()
    ).data()!;
    expect(billTournament.addonCount).toBe(2);
    expect(billTournament.addonFeeIncl).toBe(addonFee);

    const entry = (
      await db
        .collection('scheduledTournaments')
        .doc(tid)
        .collection('okibakeTemporaryEntries')
        .doc(eid)
        .get()
    ).data()!;
    const records = entry.okibakeAddonRecords as Array<Record<string, unknown>>;
    expect(records.every((r) => r.reflectedToBill === true)).toBe(true);
    expect(records.every((r) => r.linkedBillId === billId)).toBe(true);
  });

  it('reflectedToBill 済み addon record は二重反映しない', async () => {
    const uid = 'u-link-addon-skip';
    const tid = 't-link-addon-skip';
    const eid = 'e-addon-skip';
    const guestUid = 'guest-addon-skip';
    const billId = 'bill-addon-skip';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedBillAndStay(guestUid, billId, 'open');
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(
        entryBase(eid, tid, 'registered', {
          okibakeAddonCount: 2,
          okibakeAddonRecords: [
            addonRecord('ar-done', {
              reflectedToBill: true,
              reflectedToBillAt: admin.firestore.Timestamp.now(),
              linkedBillId: 'old-bill',
            }),
            addonRecord('ar-pending'),
          ],
        })
      );

    await runLink({
      uid,
      tournamentId: tid,
      okibakeEntryId: eid,
      userId: guestUid,
      billId,
      operationId: 'op-link-addon-skip',
    });

    const billTournament = (
      await db.collection('bills').doc(billId).collection('tournaments').doc(templateId).get()
    ).data()!;
    expect(billTournament.addonCount).toBe(1);
    expect(billTournament.addonFeeIncl).toBe(addonFee);
  });

  it('views/main は変更しない', async () => {
    const uid = 'u-link-views';
    const tid = 't-link-views';
    const eid = 'e-views';
    const guestUid = 'guest-views';
    const billId = 'bill-views';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedBillAndStay(guestUid, billId, 'open');
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(
        entryBase(eid, tid, 'registered', {
          okibakeAddonRecords: [addonRecord('ar-views')],
        })
      );

    const before = (
      await db.collection('scheduledTournaments').doc(tid).collection('views').doc('main').get()
    ).data()!;

    await runLink({
      uid,
      tournamentId: tid,
      okibakeEntryId: eid,
      userId: guestUid,
      billId,
      operationId: 'op-link-views',
    });

    const after = (
      await db.collection('scheduledTournaments').doc(tid).collection('views').doc('main').get()
    ).data()!;
    expect(after.entries).toBe(before.entries);
    expect(after.playersIn).toBe(before.playersIn);
    expect(after.waitingCount).toBe(before.waitingCount);
    expect(after.seatedCount).toBe(before.seatedCount);
    expect(after.playersBusted).toBe(before.playersBusted);
    expect(after.addons).toBe(before.addons);
  });

  it('operationId replay は二重反映しない', async () => {
    const uid = 'u-link-replay';
    const tid = 't-link-replay';
    const eid = 'e-replay';
    const guestUid = 'guest-replay';
    const billId = 'bill-replay';
    const operationId = 'op-link-replay';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedBillAndStay(guestUid, billId, 'open');
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(
        entryBase(eid, tid, 'registered', {
          okibakeAddonRecords: [addonRecord('ar-replay')],
        })
      );

    const first = await runLink({
      uid,
      tournamentId: tid,
      okibakeEntryId: eid,
      userId: guestUid,
      billId,
      operationId,
    });
    expect(first.replay).toBe(false);

    const second = await runLink({
      uid,
      tournamentId: tid,
      okibakeEntryId: eid,
      userId: guestUid,
      billId,
      operationId,
    });
    expect(second.replay).toBe(true);

    const billTournament = (
      await db.collection('bills').doc(billId).collection('tournaments').doc(templateId).get()
    ).data()!;
    expect(billTournament.entryCount).toBe(1);
    expect(billTournament.addonCount).toBe(1);

    const ops = await db.collection('operationLogs').where('operationId', '==', operationId).get();
    expect(ops.size).toBe(1);
  });

  it('operationLogs に rollback 用 payload が入る', async () => {
    const uid = 'u-link-oplog';
    const tid = 't-link-oplog';
    const eid = 'e-oplog';
    const guestUid = 'guest-oplog';
    const billId = 'bill-oplog';
    const tableId = 'tbl-oplog';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedBillAndStay(guestUid, billId, 'open');
    await seedTable(tid, tableId, {
      seat02UserId: null,
      seat02PokerName: 'オキ',
      seat02OkibakeEntryId: eid,
    });
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(
        entryBase(eid, tid, 'seated', {
          assignedTableId: tableId,
          assignedSeatKey: 'seat02',
          okibakeAddonRecords: [addonRecord('ar-oplog')],
        })
      );

    await runLink({
      uid,
      tournamentId: tid,
      okibakeEntryId: eid,
      userId: guestUid,
      billId,
      operationId: 'op-link-oplog',
    });

    const op = await db.collection('operationLogs').doc('op-link-oplog').get();
    expect(op.exists).toBe(true);
    expect(op.data()!.status).toBe('succeeded');
    expect(op.data()!.operationName).toBe('置きバケ伝票紐付け');

    const payload = op.data()!.payload as Record<string, unknown>;
    expect(payload.okibakeEntryId).toBe(eid);
    expect(payload.billId).toBe(billId);
    expect(payload.userId).toBe(guestUid);
    expect(payload.templateId).toBe(templateId);
    expect(payload.before).toBeDefined();
    expect(payload.after).toBeDefined();
    expect(payload.reflectedEntry).toBeDefined();
    expect(payload.reflectedAddonRecordIds).toEqual(['ar-oplog']);
    expect(payload.reflectedAddonCount).toBe(1);
    expect(payload.seatBefore).toBeDefined();
    expect(payload.seatAfter).toBeDefined();
    expect(payload.okibakeEntryBefore).toBeDefined();
    expect(payload.okibakeEntryAfter).toBeDefined();
    expect(payload.billTournamentBefore).toBeDefined();
    expect(payload.billTournamentAfter).toBeDefined();
  });

  it('失敗済み operationId は再実行できない', async () => {
    const uid = 'u-link-failed-op';
    const tid = 't-link-failed-op';
    const eid = 'e-failed-op';
    const guestUid = 'guest-failed-op';
    const billId = 'bill-failed-op';
    const operationId = 'op-link-failed';
    await seedDevice(uid);
    await seedTournament(tid);
    await seedBillAndStay(guestUid, billId, 'open');
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(entryBase(eid, tid, 'registered'));
    await db.collection('operationLogs').doc(operationId).set({
      operationId,
      operationName: '置きバケ伝票紐付け',
      status: 'failed',
      payload: { tournamentId: tid, okibakeEntryId: eid, billId, userId: guestUid },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await expect(
      runLink({
        uid,
        tournamentId: tid,
        okibakeEntryId: eid,
        userId: guestUid,
        billId,
        operationId,
      })
    ).rejects.toBeInstanceOf(HttpsError);
  });
});
