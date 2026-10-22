import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';
import { recordTournamentAction } from '../../src/domains/bills/repos/recordTournamentAction';

describe('table device tournament actions', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  let addon: { run: (req: unknown) => Promise<Record<string, unknown>> };
  let bulkAddon: { run: (req: unknown) => Promise<Record<string, unknown>> };
  let bustAndExit: { run: (req: unknown) => Promise<Record<string, unknown>> };
  let bustAndReentry: { run: (req: unknown) => Promise<Record<string, unknown>> };
  const projectId = 'test-table-device-tournament-actions';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((app) => app?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
    const addonMod = await import('../../src/domains/tournament_activeTournament/callables/addon');
    addon = addonMod.addon as typeof addon;
    const bulkAddonMod = await import('../../src/domains/tournament_activeTournament/callables/bulkAddon');
    bulkAddon = bulkAddonMod.bulkAddon as typeof bulkAddon;
    const bustAndExitMod = await import('../../src/domains/tournament_activeTournament/callables/bustAndExit');
    bustAndExit = bustAndExitMod.bustAndExit as typeof bustAndExit;
    const bustAndReentryMod = await import('../../src/domains/tournament_activeTournament/callables/bustAndReentry');
    bustAndReentry = bustAndReentryMod.bustAndReentry as typeof bustAndReentry;
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

  async function seedTournament(params: {
    tournamentId: string;
    templateId: string;
    tableId: string;
    seats: Record<string, unknown>;
    isAddon?: boolean;
    addonLimitPerPlayer?: number | null;
  }) {
    const {
      tournamentId,
      templateId,
      tableId,
      seats,
      isAddon = true,
      addonLimitPerPlayer = 3,
    } = params;
    const startAt = admin.firestore.Timestamp.fromDate(
      new Date('2026-06-20T12:00:00Z'),
    );

    await db.collection('scheduledTournaments').doc(tournamentId).set({
      templateId,
      status: 'scheduled',
      startAt,
      snapshot: {
        name: `Tournament ${tournamentId}`,
        entryFee: 1000,
        reentryFee: 500,
        isAddon,
        addonFee: isAddon ? 300 : null,
        addonStack: isAddon ? 1000 : null,
        addonLimitPerPlayer,
        maxReentriesPerPlayer: 3,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('tournamentTemplates').doc(templateId).set({
      name: `Template ${templateId}`,
      entryFee: 1000,
      reentryFee: 500,
      maxReentriesPerPlayer: 3,
    });

    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({
        playersBusted: 0,
        reentries: 0,
        waitingCount: 0,
        addons: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .set({
        isEnabled: true,
        maxSeats: 6,
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
      .collection('tablesSeat')
      .doc('busted')
      .set({
        bustedUser: {},
      });
  }

  it('table role で bustAndExit を実行できる', async () => {
    const uid = 'table_bust_exit_ok';
    const tableId = 'T1';
    const tournamentId = 'tour_bust_exit_ok';
    const templateId = 'tpl_bust_exit_ok';
    const userId = 'user_bust_exit_ok';
    const billId = 'bill_bust_exit_ok';

    await createTableDevice(uid, tableId);
    await createBillWithActiveStay({
      billId,
      userId,
      pokerName: '卓プレイヤー',
      idempotencyKey: 'idem_bust_exit_ok',
    });
    await db.collection('bills').doc(billId).set({
      place: { table: tableId, seat: 1 },
    }, { merge: true });
    await seedTournament({
      tournamentId,
      templateId,
      tableId,
      seats: {
        seat01UserId: userId,
        seat01PokerName: '卓プレイヤー',
        seat01OkibakeEntryId: null,
        seat02UserId: null,
        seat02PokerName: null,
        seat02OkibakeEntryId: null,
      },
    });

    const result = await bustAndExit.run({
      auth: { uid },
      data: {
        operationId: 'op_bust_exit_ok',
        tournamentId,
        tableId,
        seatNumber: 1,
        userId,
      },
    } as any);

    expect(result.success).toBe(true);
  });

  it('table role で bustAndReentry を実行できる', async () => {
    const uid = 'table_bust_reentry_ok';
    const tableId = 'T1';
    const tournamentId = 'tour_bust_reentry_ok';
    const templateId = 'tpl_bust_reentry_ok';
    const userId = 'user_bust_reentry_ok';
    const billId = 'bill_bust_reentry_ok';

    await createTableDevice(uid, tableId);
    await createBillWithActiveStay({
      billId,
      userId,
      pokerName: 'リエントリープレイヤー',
      idempotencyKey: 'idem_bust_reentry_ok',
    });
    await recordTournamentAction({
      billId,
      templateId,
      action: 'entry',
      templateName: 'Reentry Tournament',
      entryFeeIncl: 1000,
      reentryFeeIncl: null,
      addonFeeIncl: null,
      startAt: admin.firestore.Timestamp.fromDate(new Date('2026-06-20T12:00:00Z')),
      idempotencyKey: 'idem_record_entry_bust_reentry_ok',
    });
    await seedTournament({
      tournamentId,
      templateId,
      tableId,
      seats: {
        seat01UserId: userId,
        seat01PokerName: 'リエントリープレイヤー',
        seat01OkibakeEntryId: null,
        seat02UserId: null,
        seat02PokerName: null,
        seat02OkibakeEntryId: null,
      },
    });

    const result = await bustAndReentry.run({
      auth: { uid },
      data: {
        operationId: 'op_bust_reentry_ok',
        tournamentId,
        userId,
        tableId,
        seatNumber: 1,
      },
    } as any);

    expect(result.success).toBe(true);

    const billTournamentDoc = await db
      .collection('bills')
      .doc(billId)
      .collection('tournaments')
      .doc(templateId)
      .get();
    expect(billTournamentDoc.data()?.reentryCount).toBe(1);
  });

  it('table role で seated user の addon を実行できる', async () => {
    const uid = 'table_addon_ok';
    const tableId = 'T1';
    const tournamentId = 'tour_addon_ok';
    const templateId = 'tpl_addon_ok';
    const userId = 'user_addon_ok';
    const billId = 'bill_addon_ok';

    await createTableDevice(uid, tableId);
    await createBillWithActiveStay({
      billId,
      userId,
      pokerName: 'Addon Player',
      idempotencyKey: 'idem_addon_ok',
    });
    await seedTournament({
      tournamentId,
      templateId,
      tableId,
      seats: {
        seat01UserId: userId,
        seat01PokerName: 'Addon Player',
        seat01OkibakeEntryId: null,
        seat02UserId: null,
        seat02PokerName: null,
        seat02OkibakeEntryId: null,
      },
    });

    const result = await addon.run({
      auth: { uid },
      data: {
        operationId: 'op_addon_ok',
        tournamentId,
        userId,
        pokerName: 'Addon Player',
        tableId,
      },
    } as any);

    expect(result.success).toBe(true);
  });

  it('table role の addon は別卓ユーザーを拒否する', async () => {
    const uid = 'table_addon_ng';
    const boundTableId = 'T1';
    const tournamentId = 'tour_addon_ng';
    const templateId = 'tpl_addon_ng';
    const userId = 'user_addon_ng';
    const billId = 'bill_addon_ng';

    await createTableDevice(uid, boundTableId);
    await createBillWithActiveStay({
      billId,
      userId,
      pokerName: 'Other Table Player',
      idempotencyKey: 'idem_addon_ng',
    });
    await seedTournament({
      tournamentId,
      templateId,
      tableId: boundTableId,
      seats: {
        seat01UserId: null,
        seat01PokerName: null,
        seat01OkibakeEntryId: null,
        seat02UserId: null,
        seat02PokerName: null,
        seat02OkibakeEntryId: null,
      },
    });

    await expect(
      addon.run({
        auth: { uid },
        data: {
          operationId: 'op_addon_ng',
          tournamentId,
          userId,
          pokerName: 'Other Table Player',
          tableId: boundTableId,
        },
      } as any),
    ).rejects.toThrow(/指定ユーザーはこの卓に着席していません/);
  });

  it('table role で bulkAddon を実行できる', async () => {
    const uid = 'table_bulk_addon_ok';
    const tableId = 'T1';
    const tournamentId = 'tour_bulk_addon_ok';
    const templateId = 'tpl_bulk_addon_ok';
    const users = [
      {
        userId: 'user_bulk_addon_ok_1',
        billId: 'bill_bulk_addon_ok_1',
        pokerName: 'Bulk Player 1',
      },
      {
        userId: 'user_bulk_addon_ok_2',
        billId: 'bill_bulk_addon_ok_2',
        pokerName: 'Bulk Player 2',
      },
    ];

    await createTableDevice(uid, tableId);
    for (const user of users) {
      await createBillWithActiveStay({
        billId: user.billId,
        userId: user.userId,
        pokerName: user.pokerName,
        idempotencyKey: `idem_${user.userId}`,
      });
    }
    await seedTournament({
      tournamentId,
      templateId,
      tableId,
      seats: {
        seat01UserId: users[0].userId,
        seat01PokerName: users[0].pokerName,
        seat01OkibakeEntryId: null,
        seat02UserId: users[1].userId,
        seat02PokerName: users[1].pokerName,
        seat02OkibakeEntryId: null,
      },
    });

    const result = await bulkAddon.run({
      auth: { uid },
      data: {
        operationId: 'op_bulk_addon_ok',
        tournamentId,
        tableId,
        normalUsers: users.map(({ userId, pokerName }) => ({
          userId,
          pokerName,
        })),
      },
    } as any);

    expect(result.success).toBe(true);
    expect(result.processedCount).toBe(2);
  });
});
