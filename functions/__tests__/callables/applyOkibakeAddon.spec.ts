/**
 * applyOkibakeAddon（Firestore Emulator）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

describe('applyOkibakeAddon', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  let applyOkibakeAddon: { run: (req: unknown) => Promise<Record<string, unknown>> };
  const projectId = 'test-okibake-addon-fn';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
    const mod = await import(
      '../../src/domains/tournament_activeTournament/callables/applyOkibakeAddon'
    );
    applyOkibakeAddon = mod.applyOkibakeAddon as typeof applyOkibakeAddon;
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
      name: 'Terminal Addon',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  function entryBase(id: string, tournamentId: string, status: string, overrides: Record<string, unknown> = {}) {
    const nowTs = admin.firestore.FieldValue.serverTimestamp();
    return {
      okibakeEntryId: id,
      tournamentId,
      temporaryDisplayName: 'O',
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

  async function seedTour(tournamentId: string, addonLimit = 2) {
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      snapshot: {
        isAddon: true,
        addonLimitPerPlayer: addonLimit,
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
        entries: 1,
        playersIn: 1,
        waitingCount: 0,
        seatedCount: 0,
        playersBusted: 0,
        addons: 3,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  it('registered + unlinked で Addon でき okibakeAddonCount と views.addons が増える', async () => {
    const uid = 'u-addon-1';
    const tid = 't-addon-1';
    const eid = 'e-1';
    await seedDevice(uid);
    await seedTour(tid);
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(entryBase(eid, tid, 'registered'));

    const opId = 'op-addon-reg';
    const res = await applyOkibakeAddon.run({
      data: { tournamentId: tid, okibakeEntryId: eid, operationId: opId, addonIntent: 'no' },
      auth: { uid },
    } as any);

    expect(res.success).toBe(true);
    expect(res.replay).toBe(false);

    const ent = await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .get();
    expect(ent.data()!.okibakeAddonCount).toBe(1);
    expect((ent.data()!.okibakeAddonRecords as unknown[]).length).toBe(1);

    const main = await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('views')
      .doc('main')
      .get();
    expect(main.data()!.addons).toBe(4);
    expect(main.data()!.waitingCount).toBe(0);

    const op = await db.collection('operationLogs').doc(opId).get();
    expect(op.exists).toBe(true);
    expect(op.data()!.status).toBe('succeeded');
    expect(op.data()!.tableId).toBeUndefined();
    const payload = op.data()!.payload as Record<string, unknown>;
    expect(payload.playerName).toBe('O');
    expect(payload.tableId).toBeUndefined();
    expect(payload.seatNumber).toBeUndefined();
  });

  it('registered 時 operationLogs に linkedUserPokerName を playerName として記録し tableId は付けない', async () => {
    const uid = 'u-addon-wait-linked';
    const tid = 't-addon-wait-linked';
    const eid = 'e-wait-linked';
    await seedDevice(uid);
    await seedTour(tid);
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(
        entryBase(eid, tid, 'registered', {
          temporaryDisplayName: 'オキバケA',
          linkedUserPokerName: 'リンク太郎',
        })
      );

    await applyOkibakeAddon.run({
      data: { tournamentId: tid, okibakeEntryId: eid, operationId: 'op-wait-linked' },
      auth: { uid },
    } as any);

    const op = await db.collection('operationLogs').doc('op-wait-linked').get();
    expect((op.data()!.payload as Record<string, unknown>).playerName).toBe('リンク太郎');
    expect(op.data()!.tableId).toBeUndefined();
    expect((op.data()!.payload as Record<string, unknown>).seatNumber).toBeUndefined();
  });

  it('seated + unlinked でも Addon できる', async () => {
    const uid = 'u-addon-seat';
    const tid = 't-addon-seat';
    const eid = 'e-seat';
    await seedDevice(uid);
    await seedTour(tid);
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(
        entryBase(eid, tid, 'seated', {
          assignedTableId: 'tbl',
          assignedSeatKey: 'seat01',
          okibakeAddonCount: 0,
          okibakeAddonRecords: [],
        })
      );

    await applyOkibakeAddon.run({
      data: { tournamentId: tid, okibakeEntryId: eid, operationId: 'op-seated-a' },
      auth: { uid },
    } as any);

    const op = await db.collection('operationLogs').doc('op-seated-a').get();
    expect(op.exists).toBe(true);
    expect(op.data()!.tableId).toBe('tbl');
    const payload = op.data()!.payload as Record<string, unknown>;
    expect(payload.playerName).toBe('O');
    expect(payload.seatNumber).toBe(1);
    expect(payload.tableId).toBe('tbl');

    const ent = await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .get();
    expect(ent.data()!.okibakeAddonCount).toBe(1);
  });

  it('seated 時 operationLogs に linkedUserPokerName を playerName として記録する', async () => {
    const uid = 'u-addon-linked';
    const tid = 't-addon-linked';
    const eid = 'e-linked';
    await seedDevice(uid);
    await seedTour(tid);
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(
        entryBase(eid, tid, 'seated', {
          temporaryDisplayName: 'オキバケA',
          linkedUserPokerName: 'リンク太郎',
          assignedTableId: 'table2',
          assignedSeatKey: 'seat03',
        })
      );

    await applyOkibakeAddon.run({
      data: { tournamentId: tid, okibakeEntryId: eid, operationId: 'op-linked-a' },
      auth: { uid },
    } as any);

    const op = await db.collection('operationLogs').doc('op-linked-a').get();
    expect((op.data()!.payload as Record<string, unknown>).playerName).toBe('リンク太郎');
    expect(op.data()!.tableId).toBe('table2');
    expect((op.data()!.payload as Record<string, unknown>).seatNumber).toBe(3);
  });

  it('addonLimit 到達で拒否', async () => {
    const uid = 'u-addon-lim';
    const tid = 't-addon-lim';
    const eid = 'e-lim';
    await seedDevice(uid);
    await seedTour(tid, 1);
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(entryBase(eid, tid, 'registered', { okibakeAddonCount: 1, okibakeAddonRecords: [{}] }));

    await expect(
      applyOkibakeAddon.run({
        data: { tournamentId: tid, okibakeEntryId: eid, operationId: 'op-limit' },
        auth: { uid },
      } as any)
    ).rejects.toThrow(HttpsError);

    const op = await db.collection('operationLogs').doc('op-limit').get();
    expect(op.exists).toBe(true);
    expect(op.data()!.status).toBe('failed');
  });

  it('isAddon false で拒否（INVALID_STATUS）', async () => {
    const uid = 'u-no-addon';
    const tid = 't-no';
    await seedDevice(uid);
    await db.collection('scheduledTournaments').doc(tid).set({
      snapshot: { isAddon: false, addonLimitPerPlayer: 3 },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('views')
      .doc('main')
      .set({
        addons: 0,
        entries: 0,
        waitingCount: 0,
        playersIn: 0,
      });
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc('e')
      .set(entryBase('e', tid, 'registered'));

    await expect(
      applyOkibakeAddon.run({
        data: { tournamentId: tid, okibakeEntryId: 'e', operationId: 'op-noaddon' },
        auth: { uid },
      } as any)
    ).rejects.toThrow(HttpsError);
  });

  it('linked / busted は拒否', async () => {
    const uid = 'u-bad-st';
    const tid = 't-bad-st';
    await seedDevice(uid);
    await seedTour(tid);

    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc('elink')
      .set(entryBase('elink', tid, 'registered', { billLinkStatus: 'linked' }));

    await expect(
      applyOkibakeAddon.run({
        data: {
          tournamentId: tid,
          okibakeEntryId: 'elink',
          operationId: 'op-lnk',
        },
        auth: { uid },
      } as any)
    ).rejects.toThrow(HttpsError);

    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc('ebust')
      .set(entryBase('ebust', tid, 'busted'));

    await expect(
      applyOkibakeAddon.run({
        data: {
          tournamentId: tid,
          okibakeEntryId: 'ebust',
          operationId: 'op-bs',
        },
        auth: { uid },
      } as any)
    ).rejects.toThrow(HttpsError);
  });

  it('同一 operationId 再送は replay', async () => {
    const uid = 'u-addon-rep';
    const tid = 't-rep-addon';
    const eid = 'e-rep';
    await seedDevice(uid);
    await seedTour(tid);
    await db
      .collection('scheduledTournaments')
      .doc(tid)
      .collection('okibakeTemporaryEntries')
      .doc(eid)
      .set(entryBase(eid, tid, 'registered'));

    const payload = {
      tournamentId: tid,
      okibakeEntryId: eid,
      operationId: 'op-same-addon',
      addonIntent: 'yes' as const,
    };
    const a = await applyOkibakeAddon.run({ data: payload, auth: { uid } } as any);
    const b = await applyOkibakeAddon.run({ data: payload, auth: { uid } } as any);
    expect(a.replay).toBe(false);
    expect(b.replay).toBe(true);
    expect(b.addonRecordId).toBe(a.addonRecordId);
  });
});
