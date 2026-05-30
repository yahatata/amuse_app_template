import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

describe('rollbackAction okibake undo', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  let rollbackAction: { run: (req: unknown) => Promise<Record<string, unknown>> };
  const projectId = 'test-rollback-okibake';

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

  it('置きバケ対象ユーザー設定の undo を実行できる（unlinked のみ）', async () => {
    const tournamentId = 't-undo-linked-user';
    const okibakeEntryId = 'e-undo-linked-user';
    const operationId = 'op-undo-linked-user';

    await db.collection('scheduledTournaments').doc(tournamentId).set({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(okibakeEntryId)
      .set({
        tournamentId,
        okibakeEntryId,
        entryStatus: 'registered',
        billLinkStatus: 'unlinked',
        linkedUserId: 'user-1',
        linkedUserPokerName: 'ユーザー1',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await db.collection('operationLogs').doc(operationId).set({
      operationId,
      operationName: '置きバケ対象ユーザー設定',
      tournamentId,
      status: 'succeeded',
      payload: {
        tournamentId,
        okibakeEntryId,
        before: {
          linkedUserId: null,
          linkedUserPokerName: null,
        },
        after: {
          linkedUserId: 'user-1',
          linkedUserPokerName: 'ユーザー1',
        },
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const res = await rollbackAction.run({
      data: {
        tournamentId,
        operationId,
        action: 'okibake_update_linked_user',
        rollBackBy: 'dev-1',
      },
    } as any);

    expect(res.success).toBe(true);
    const entry = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc(okibakeEntryId)
        .get()
    ).data()!;
    expect(entry.linkedUserId).toBeNull();
    expect(entry.linkedUserPokerName).toBeNull();

    const op = (await db.collection('operationLogs').doc(operationId).get()).data()!;
    expect(op.rolledBack).toBe(true);
  });

  it('置きバケ伝票紐付け undo で pending_review 状態へ戻せる（bill.status=open）', async () => {
    const tournamentId = 't-undo-link-bill';
    const okibakeEntryId = 'e-undo-link-bill';
    const operationId = 'op-undo-link-bill';
    const billId = 'bill-undo-link-bill';
    const templateId = 'tpl-undo-link-bill';
    const pendingReviewAt = Timestamp.now();

    await db.collection('scheduledTournaments').doc(tournamentId).set({
      templateId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('bills').doc(billId).set({
      status: 'open',
      party: { userId: 'user-1', pokerName: 'ユーザー1' },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db
      .collection('bills')
      .doc(billId)
      .collection('tournaments')
      .doc(templateId)
      .set({
        templateId,
        entryCount: 1,
        addonCount: 0,
      });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(okibakeEntryId)
      .set({
        tournamentId,
        okibakeEntryId,
        entryStatus: 'registered',
        billLinkStatus: 'linked',
        linkedBillId: billId,
        linkedUserId: 'user-1',
        linkedUserPokerName: 'ユーザー1',
        pendingReviewAt,
        pendingReviewReason: 'tournament_finished_unlinked',
        okibakeAddonRecords: [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('usersList')
      .set({
        users: {
          'user-1': { pokerName: 'ユーザー1' },
        },
      });

    await db.collection('operationLogs').doc(operationId).set({
      operationId,
      operationName: '置きバケ伝票紐付け',
      tournamentId,
      status: 'succeeded',
      payload: {
        tournamentId,
        okibakeEntryId,
        billId,
        templateId,
        userId: 'user-1',
        before: {
          billLinkStatus: 'pending_review',
          linkedBillId: null,
          linkedUserId: 'user-1',
          linkedUserPokerName: 'ユーザー1',
        },
        okibakeEntryBefore: {
          billLinkStatus: 'pending_review',
          linkedBillId: null,
          linkedUserId: 'user-1',
          linkedUserPokerName: 'ユーザー1',
          assignedTableId: null,
          assignedSeatKey: null,
        },
        okibakeEntryAfter: {
          billLinkStatus: 'linked',
          linkedBillId: billId,
        },
        billTournamentBefore: null,
        usersListBefore: {
          exists: true,
          userEntry: null,
        },
        waitingBefore: {
          exists: false,
          count: null,
          userEntry: null,
        },
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const res = await rollbackAction.run({
      data: {
        tournamentId,
        operationId,
        action: 'okibake_link_bill',
        rollBackBy: 'dev-1',
      },
    } as any);

    expect(res.success).toBe(true);

    const entry = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc(okibakeEntryId)
        .get()
    ).data()!;
    expect(entry.billLinkStatus).toBe('pending_review');
    expect(entry.linkedBillId).toBeNull();
    expect(entry.linkedUserId).toBe('user-1');
    expect(entry.pendingReviewReason).toBe('tournament_finished_unlinked');

    const billTournament = await db
      .collection('bills')
      .doc(billId)
      .collection('tournaments')
      .doc(templateId)
      .get();
    expect(billTournament.exists).toBe(false);

    const usersList = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('usersList')
        .get()
    ).data()!;
    expect(usersList.users['user-1']).toBeUndefined();
  });

  it('置きバケ伝票紐付け undo は bill.status=settled を拒否する', async () => {
    const tournamentId = 't-undo-link-bill-reject';
    const okibakeEntryId = 'e-undo-link-bill-reject';
    const operationId = 'op-undo-link-bill-reject';
    const billId = 'bill-undo-link-bill-reject';
    const templateId = 'tpl-undo-link-bill-reject';

    await db.collection('scheduledTournaments').doc(tournamentId).set({ templateId });
    await db.collection('bills').doc(billId).set({
      status: 'settled',
      party: { userId: 'user-1', pokerName: 'ユーザー1' },
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(okibakeEntryId)
      .set({
        tournamentId,
        okibakeEntryId,
        entryStatus: 'registered',
        billLinkStatus: 'linked',
        linkedBillId: billId,
      });
    await db.collection('operationLogs').doc(operationId).set({
      operationId,
      operationName: '置きバケ伝票紐付け',
      tournamentId,
      status: 'succeeded',
      payload: {
        tournamentId,
        okibakeEntryId,
        billId,
        templateId,
        okibakeEntryAfter: {
          billLinkStatus: 'linked',
          linkedBillId: billId,
        },
      },
    });

    await expect(
      rollbackAction.run({
        data: {
          tournamentId,
          operationId,
          action: 'okibake_link_bill',
          rollBackBy: 'dev-1',
        },
      } as any)
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('返金・事後調整'),
    });
  });

  it('registered の置きバケ伝票紐付け undo は waitingBefore 欠落を拒否する', async () => {
    const tournamentId = 't-undo-link-bill-registered-missing-waiting-before';
    const okibakeEntryId = 'e-undo-link-bill-registered-missing-waiting-before';
    const operationId = 'op-undo-link-bill-registered-missing-waiting-before';
    const billId = 'bill-undo-link-bill-registered-missing-waiting-before';
    const templateId = 'tpl-undo-link-bill-registered-missing-waiting-before';

    await db.collection('scheduledTournaments').doc(tournamentId).set({ templateId });
    await db.collection('bills').doc(billId).set({
      status: 'open',
      party: { userId: 'user-1', pokerName: 'ユーザー1' },
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(okibakeEntryId)
      .set({
        tournamentId,
        okibakeEntryId,
        entryStatus: 'registered',
        billLinkStatus: 'linked',
        linkedBillId: billId,
        linkedUserId: 'user-1',
        linkedUserPokerName: 'ユーザー1',
      });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('usersList')
      .set({
        users: {
          'user-1': { pokerName: 'ユーザー1' },
        },
      });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc('waiting')
      .set({
        waiting: {
          'user-1': { pokerName: 'ユーザー1', order: 1 },
        },
        count: 1,
      });
    await db.collection('operationLogs').doc(operationId).set({
      operationId,
      operationName: '置きバケ伝票紐付け',
      tournamentId,
      status: 'succeeded',
      payload: {
        tournamentId,
        okibakeEntryId,
        billId,
        templateId,
        userId: 'user-1',
        sourceEntryStatus: 'registered',
        before: {
          billLinkStatus: 'unlinked',
          linkedBillId: null,
          linkedUserId: null,
          linkedUserPokerName: null,
        },
        okibakeEntryBefore: {
          billLinkStatus: 'unlinked',
          linkedBillId: null,
          linkedUserId: null,
          linkedUserPokerName: null,
          entryStatus: 'registered',
        },
        okibakeEntryAfter: {
          billLinkStatus: 'linked',
          linkedBillId: billId,
        },
        billTournamentBefore: null,
        usersListBefore: {
          exists: true,
          userEntry: null,
        },
      },
    });

    await expect(
      rollbackAction.run({
        data: {
          tournamentId,
          operationId,
          action: 'okibake_link_bill',
          rollBackBy: 'dev-1',
        },
      } as any)
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('waitingBefore'),
    });
  });

  it('置きバケ登録 rollback で voided 化し views/main を戻す', async () => {
    const tournamentId = 't-undo-okibake-create';
    const okibakeEntryId = 'e-undo-okibake-create';
    const operationId = 'op-undo-okibake-create';

    await db.collection('scheduledTournaments').doc(tournamentId).set({
      okibakeNextDisplayNumber: 12,
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({
        entries: 4,
        playersIn: 4,
        waitingCount: 4,
      });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(okibakeEntryId)
      .set({
        tournamentId,
        okibakeEntryId,
        entryStatus: 'registered',
        billLinkStatus: 'unlinked',
        linkedBillId: null,
        linkedUserId: 'user-x',
        linkedUserPokerName: 'ユーザーX',
        okibakeAddonCount: 0,
      });
    await db.collection('operationLogs').doc(operationId).set({
      operationId,
      operationName: '置きバケ登録',
      tournamentId,
      status: 'succeeded',
      payload: {
        tournamentId,
        okibakeEntryId,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const res = await rollbackAction.run({
      data: {
        tournamentId,
        operationId,
        action: 'okibake_create_entry',
        rollBackBy: 'dev-1',
      },
    } as any);
    expect(res.success).toBe(true);

    const entry = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc(okibakeEntryId)
        .get()
    ).data()!;
    expect(entry.entryStatus).toBe('voided');
    expect(entry.linkedUserId).toBe('user-x');

    const viewsMain = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get()
    ).data()!;
    expect(viewsMain.entries).toBe(3);
    expect(viewsMain.playersIn).toBe(3);
    expect(viewsMain.waitingCount).toBe(3);

    const tournament = (await db.collection('scheduledTournaments').doc(tournamentId).get()).data()!;
    expect(tournament.okibakeNextDisplayNumber).toBe(12);
  });

  it('置きバケ着席 undo で registered に戻し seatBefore 復元、waitingCount を戻す', async () => {
    const tournamentId = 't-undo-okibake-assign';
    const okibakeEntryId = 'e-undo-okibake-assign';
    const operationId = 'op-undo-okibake-assign';
    const tableId = 'table-undo-assign';

    await db.collection('scheduledTournaments').doc(tournamentId).set({});
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({
        entries: 5,
        playersIn: 5,
        waitingCount: 1,
      });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .set({
        seats: {
          seat03UserId: null,
          seat03PokerName: 'オキバケA',
          seat03OkibakeEntryId: okibakeEntryId,
        },
      });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(okibakeEntryId)
      .set({
        tournamentId,
        okibakeEntryId,
        entryStatus: 'seated',
        billLinkStatus: 'unlinked',
        linkedBillId: null,
        linkedUserId: 'user-z',
        linkedUserPokerName: 'ユーザーZ',
        okibakeAddonCount: 0,
        assignedTableId: tableId,
        assignedSeatKey: 'seat03',
      });
    await db.collection('operationLogs').doc(operationId).set({
      operationId,
      operationName: '置きバケ着席',
      tournamentId,
      status: 'succeeded',
      payload: {
        tournamentId,
        okibakeEntryId,
        tableId,
        seatKey: 'seat03',
        seatBefore: {
          userId: null,
          pokerName: null,
          okibakeEntryId: null,
        },
        okibakeEntryBefore: {
          entryStatus: 'registered',
          billLinkStatus: 'unlinked',
          assignedTableId: null,
          assignedSeatKey: null,
          seatedAt: null,
        },
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const res = await rollbackAction.run({
      data: {
        tournamentId,
        operationId,
        action: 'okibake_assign_seat',
        rollBackBy: 'dev-1',
      },
    } as any);
    expect(res.success).toBe(true);

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

    const table = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .get()
    ).data()!;
    expect(table.seats.seat03UserId).toBeNull();
    expect(table.seats.seat03PokerName).toBeNull();
    expect(table.seats.seat03OkibakeEntryId).toBeNull();

    const viewsMain = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get()
    ).data()!;
    expect(viewsMain.waitingCount).toBe(2);
    expect(viewsMain.entries).toBe(5);
    expect(viewsMain.playersIn).toBe(5);
  });

  it('置きバケ登録 rollback は addon 済みを拒否する', async () => {
    const tournamentId = 't-undo-okibake-create-addon-reject';
    const okibakeEntryId = 'e-undo-okibake-create-addon-reject';
    const operationId = 'op-undo-okibake-create-addon-reject';
    await db.collection('scheduledTournaments').doc(tournamentId).set({});
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({ entries: 1, playersIn: 1, waitingCount: 1 });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(okibakeEntryId)
      .set({
        tournamentId,
        okibakeEntryId,
        entryStatus: 'registered',
        billLinkStatus: 'unlinked',
        linkedBillId: null,
        okibakeAddonCount: 1,
      });
    await db.collection('operationLogs').doc(operationId).set({
      operationId,
      operationName: '置きバケ登録',
      tournamentId,
      status: 'succeeded',
      payload: { tournamentId, okibakeEntryId },
    });

    await expect(
      rollbackAction.run({
        data: {
          tournamentId,
          operationId,
          action: 'okibake_create_entry',
          rollBackBy: 'dev-1',
        },
      } as any)
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('Addon'),
    });
  });

  it('置きバケ着席 undo は addon 済みを拒否する', async () => {
    const tournamentId = 't-undo-okibake-assign-addon-reject';
    const okibakeEntryId = 'e-undo-okibake-assign-addon-reject';
    const operationId = 'op-undo-okibake-assign-addon-reject';
    await db.collection('scheduledTournaments').doc(tournamentId).set({});
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({ entries: 1, playersIn: 1, waitingCount: 0 });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc('tbl')
      .set({ seats: { seat01PokerName: 'A', seat01OkibakeEntryId: okibakeEntryId } });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(okibakeEntryId)
      .set({
        tournamentId,
        okibakeEntryId,
        entryStatus: 'seated',
        billLinkStatus: 'unlinked',
        linkedBillId: null,
        okibakeAddonCount: 2,
      });
    await db.collection('operationLogs').doc(operationId).set({
      operationId,
      operationName: '置きバケ着席',
      tournamentId,
      status: 'succeeded',
      payload: {
        tournamentId,
        okibakeEntryId,
        tableId: 'tbl',
        seatKey: 'seat01',
        seatBefore: { userId: null, pokerName: null, okibakeEntryId: null },
        okibakeEntryBefore: {
          entryStatus: 'registered',
          billLinkStatus: 'unlinked',
          assignedTableId: null,
          assignedSeatKey: null,
          seatedAt: null,
        },
      },
    });

    await expect(
      rollbackAction.run({
        data: {
          tournamentId,
          operationId,
          action: 'okibake_assign_seat',
          rollBackBy: 'dev-1',
        },
      } as any)
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('Addon'),
    });
  });
});
