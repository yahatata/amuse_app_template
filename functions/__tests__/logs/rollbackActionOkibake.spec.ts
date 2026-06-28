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
          'user-other': { pokerName: '他参加者' },
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
    expect(usersList.users['user-other']?.pokerName).toBe('他参加者');
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

  describe('置きバケ Bust undo', () => {
    let bustOkibakeTemporaryEntry: {
      run: (req: unknown) => Promise<Record<string, unknown>>;
    };

    beforeAll(async () => {
      const mod = await import(
        '../../src/domains/tournament_activeTournament/callables/bustOkibakeTemporaryEntry'
      );
      bustOkibakeTemporaryEntry = mod.bustOkibakeTemporaryEntry as typeof bustOkibakeTemporaryEntry;
    });

    async function seedDevice(uid: string) {
      await db.collection('devices').add({
        uid,
        role: 'admin',
        status: 'active',
        name: 'Terminal Bust Undo',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    async function seedBustUndoFixture(params: {
      tournamentId: string;
      okibakeEntryId: string;
      tableId: string;
      playersBusted?: number;
    }) {
      const { tournamentId, okibakeEntryId, tableId } = params;
      const playersBusted = params.playersBusted ?? 2;
      await db.collection('scheduledTournaments').doc(tournamentId).set({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .set({
          entries: 4,
          playersIn: 4,
          seatedCount: 3,
          waitingCount: 1,
          playersBusted,
          addons: 5,
        });
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .set({
          isEnabled: true,
          seats: {
            seat02UserId: null,
            seat02PokerName: 'BK',
            seat02OkibakeEntryId: okibakeEntryId,
          },
        });
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc(okibakeEntryId)
        .set({
          okibakeEntryId,
          tournamentId,
          temporaryDisplayName: 'BK',
          entryStatus: 'seated',
          billLinkStatus: 'unlinked',
          linkedBillId: null,
          linkedUserId: null,
          assignedTableId: tableId,
          assignedSeatKey: 'seat02',
          okibakeAddonCount: 0,
        });
    }

    function bustOpPayload(params: {
      tournamentId: string;
      okibakeEntryId: string;
      tableId: string;
    }) {
      const { tournamentId, okibakeEntryId, tableId } = params;
      return {
        tournamentId,
        okibakeEntryId,
        tableId,
        seatKey: 'seat02',
        playerName: 'BK',
        seatNumber: 2,
        seatBefore: {
          userId: null,
          pokerName: 'BK',
          okibakeEntryId,
        },
        seatAfter: {
          userId: null,
          pokerName: null,
          okibakeEntryId: null,
        },
        okibakeEntryBefore: {
          entryStatus: 'seated',
          billLinkStatus: 'unlinked',
          assignedTableId: tableId,
          assignedSeatKey: 'seat02',
        },
        okibakeEntryAfter: {
          entryStatus: 'busted',
          billLinkStatus: 'unlinked',
          assignedTableId: tableId,
          assignedSeatKey: 'seat02',
        },
      };
    }

    it('bust 後 rollback で seated / seat 復元、playersBusted -1、他 views は不変', async () => {
      const uid = 'u-undo-bust';
      const tournamentId = 't-undo-okibake-bust';
      const okibakeEntryId = 'e-undo-okibake-bust';
      const tableId = 'table-undo-bust';
      const operationId = 'op-undo-okibake-bust';

      await seedDevice(uid);
      await seedBustUndoFixture({ tournamentId, okibakeEntryId, tableId, playersBusted: 2 });

      await bustOkibakeTemporaryEntry.run({
        data: { tournamentId, okibakeEntryId, operationId },
        auth: { uid },
      } as any);

      const mainAfterBust = (
        await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('views')
          .doc('main')
          .get()
      ).data()!;
      expect(mainAfterBust.playersBusted).toBe(3);

      const res = await rollbackAction.run({
        data: {
          tournamentId,
          operationId,
          action: 'okibake_bust',
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
      expect(entry.entryStatus).toBe('seated');
      expect(entry.bustedAt).toBeNull();
      expect(entry.bustedTableId).toBeNull();
      expect(entry.bustedSeatKey).toBeNull();
      expect(entry.assignedTableId).toBe(tableId);
      expect(entry.assignedSeatKey).toBe('seat02');

      const table = (
        await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('tablesSeat')
          .doc(tableId)
          .get()
      ).data()!;
      expect(table.seats.seat02OkibakeEntryId).toBe(okibakeEntryId);
      expect(table.seats.seat02PokerName).toBe('BK');

      const mainAfterUndo = (
        await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('views')
          .doc('main')
          .get()
      ).data()!;
      expect(mainAfterUndo.playersBusted).toBe(2);
      expect(mainAfterUndo.entries).toBe(4);
      expect(mainAfterUndo.playersIn).toBe(4);
      expect(mainAfterUndo.waitingCount).toBe(1);
      expect(mainAfterUndo.addons).toBe(5);

      const op = (await db.collection('operationLogs').doc(operationId).get()).data()!;
      expect(op.rolledBack).toBe(true);
    });

    it('同一 operationLog の rollback 再実行は拒否され playersBusted は二重減算されない', async () => {
      const tournamentId = 't-undo-bust-double';
      const okibakeEntryId = 'e-undo-bust-double';
      const operationId = 'op-undo-bust-double';
      const tableId = 'tbl-bust-double';

      await seedBustUndoFixture({ tournamentId, okibakeEntryId, tableId, playersBusted: 1 });
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc(okibakeEntryId)
        .set(
          {
            entryStatus: 'busted',
            billLinkStatus: 'unlinked',
            linkedBillId: null,
            assignedTableId: tableId,
            assignedSeatKey: 'seat02',
            bustedAt: admin.firestore.FieldValue.serverTimestamp(),
            bustedTableId: tableId,
            bustedSeatKey: 'seat02',
          },
          { merge: true }
        );
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .set({
          seats: {
            seat02UserId: null,
            seat02PokerName: null,
            seat02OkibakeEntryId: null,
          },
        });
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .set({ playersBusted: 2, entries: 1, playersIn: 1, waitingCount: 0, addons: 0 });

      await db.collection('operationLogs').doc(operationId).set({
        operationId,
        operationName: '置きバケ Bust',
        tournamentId,
        tableId,
        status: 'succeeded',
        payload: bustOpPayload({ tournamentId, okibakeEntryId, tableId }),
      });

      await rollbackAction.run({
        data: { tournamentId, operationId, action: 'okibake_bust', rollBackBy: 'dev-1' },
      } as any);

      await expect(
        rollbackAction.run({
          data: { tournamentId, operationId, action: 'okibake_bust', rollBackBy: 'dev-1' },
        } as any)
      ).rejects.toMatchObject({
        code: 'failed-precondition',
        message: expect.stringContaining('ロールバック済み'),
      });

      const main = (
        await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('views')
          .doc('main')
          .get()
      ).data()!;
      expect(main.playersBusted).toBe(1);
    });

    it.each([
      ['linked', { billLinkStatus: 'linked', linkedBillId: 'bill-linked' }],
      ['pending_review', { billLinkStatus: 'pending_review' }],
      ['voided', { entryStatus: 'voided' }],
      ['seated', { entryStatus: 'seated', bustedAt: null, bustedTableId: null, bustedSeatKey: null }],
      ['registered', { entryStatus: 'registered', assignedTableId: null, assignedSeatKey: null }],
    ])('%s の entry は Bust undo を拒否し playersBusted は変わらない', async (_label, overrides) => {
      const tournamentId = `t-undo-bust-reject-${_label}`;
      const okibakeEntryId = `e-undo-bust-reject-${_label}`;
      const operationId = `op-undo-bust-reject-${_label}`;
      const tableId = 'tbl-bust-reject';

      await seedBustUndoFixture({ tournamentId, okibakeEntryId, tableId, playersBusted: 4 });
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc(okibakeEntryId)
        .set(
          {
            entryStatus: 'busted',
            billLinkStatus: 'unlinked',
            linkedBillId: null,
            assignedTableId: tableId,
            assignedSeatKey: 'seat02',
            bustedAt: admin.firestore.FieldValue.serverTimestamp(),
            ...overrides,
          },
          { merge: true }
        );
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .set({
          seats: {
            seat02UserId: null,
            seat02PokerName: null,
            seat02OkibakeEntryId: null,
          },
        });

      await db.collection('operationLogs').doc(operationId).set({
        operationId,
        operationName: '置きバケ Bust',
        tournamentId,
        status: 'succeeded',
        payload: bustOpPayload({ tournamentId, okibakeEntryId, tableId }),
      });

      await expect(
        rollbackAction.run({
          data: { tournamentId, operationId, action: 'okibake_bust', rollBackBy: 'dev-1' },
        } as any)
      ).rejects.toThrow();

      const main = (
        await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('views')
          .doc('main')
          .get()
      ).data()!;
      expect(main.playersBusted).toBe(4);
    });

    it('operationLog after と現在状態が一致しない場合は拒否する', async () => {
      const tournamentId = 't-undo-bust-mismatch';
      const okibakeEntryId = 'e-undo-bust-mismatch';
      const operationId = 'op-undo-bust-mismatch';
      const tableId = 'tbl-bust-mismatch';

      await seedBustUndoFixture({ tournamentId, okibakeEntryId, tableId, playersBusted: 2 });
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc(okibakeEntryId)
        .set(
          {
            entryStatus: 'busted',
            assignedTableId: 'other-table',
            assignedSeatKey: 'seat03',
          },
          { merge: true }
        );
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .set({
          seats: {
            seat02UserId: null,
            seat02PokerName: null,
            seat02OkibakeEntryId: null,
          },
        });

      await db.collection('operationLogs').doc(operationId).set({
        operationId,
        operationName: '置きバケ Bust',
        tournamentId,
        status: 'succeeded',
        payload: bustOpPayload({ tournamentId, okibakeEntryId, tableId }),
      });

      await expect(
        rollbackAction.run({
          data: { tournamentId, operationId, action: 'okibake_bust', rollBackBy: 'dev-1' },
        } as any)
      ).rejects.toMatchObject({
        code: 'failed-precondition',
      });

      const main = (
        await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('views')
          .doc('main')
          .get()
      ).data()!;
      expect(main.playersBusted).toBe(2);
    });

    it('playersBusted が 0 のとき undo しても 0 未満にならない', async () => {
      const tournamentId = 't-undo-bust-floor';
      const okibakeEntryId = 'e-undo-bust-floor';
      const operationId = 'op-undo-bust-floor';
      const tableId = 'tbl-bust-floor';

      await seedBustUndoFixture({ tournamentId, okibakeEntryId, tableId, playersBusted: 0 });
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc(okibakeEntryId)
        .set(
          {
            entryStatus: 'busted',
            bustedAt: admin.firestore.FieldValue.serverTimestamp(),
            bustedTableId: tableId,
            bustedSeatKey: 'seat02',
          },
          { merge: true }
        );
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .set({
          seats: {
            seat02UserId: null,
            seat02PokerName: null,
            seat02OkibakeEntryId: null,
          },
        });

      await db.collection('operationLogs').doc(operationId).set({
        operationId,
        operationName: '置きバケ Bust',
        tournamentId,
        status: 'succeeded',
        payload: bustOpPayload({ tournamentId, okibakeEntryId, tableId }),
      });

      await rollbackAction.run({
        data: { tournamentId, operationId, action: 'okibake_bust', rollBackBy: 'dev-1' },
      } as any);

      const main = (
        await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('views')
          .doc('main')
          .get()
      ).data()!;
      expect(main.playersBusted).toBe(0);
    });

    it('元席が埋まっている場合は seat selection required を返し playersBusted は減らない', async () => {
      const tournamentId = 't-undo-bust-seat-select';
      const okibakeEntryId = 'e-undo-bust-seat-select';
      const operationId = 'op-undo-bust-seat-select';
      const tableId = 'tbl-bust-seat-select';

      await seedBustUndoFixture({ tournamentId, okibakeEntryId, tableId, playersBusted: 3 });
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc(okibakeEntryId)
        .set(
          {
            entryStatus: 'busted',
            bustedAt: admin.firestore.FieldValue.serverTimestamp(),
            bustedTableId: tableId,
            bustedSeatKey: 'seat02',
          },
          { merge: true }
        );
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .set({
          isEnabled: true,
          seats: {
            seat02UserId: 'other-user',
            seat02PokerName: '他の人',
            seat02OkibakeEntryId: null,
            seat03UserId: null,
            seat03PokerName: null,
            seat03OkibakeEntryId: null,
          },
        });

      await db.collection('operationLogs').doc(operationId).set({
        operationId,
        operationName: '置きバケ Bust',
        tournamentId,
        status: 'succeeded',
        payload: bustOpPayload({ tournamentId, okibakeEntryId, tableId }),
      });

      let caught: unknown;
      try {
        await rollbackAction.run({
          data: { tournamentId, operationId, action: 'okibake_bust', rollBackBy: 'dev-1' },
        } as any);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeDefined();
      const err = caught as { details?: Record<string, unknown> };
      expect(err.details?.errorKey).toBe('TOURNAMENT_BUST_UNDO_SEAT_SELECTION_REQUIRED');
      expect(Array.isArray(err.details?.availableSeats)).toBe(true);
      expect((err.details?.availableSeats as unknown[]).length).toBeGreaterThan(0);

      const main = (
        await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('views')
          .doc('main')
          .get()
      ).data()!;
      expect(main.playersBusted).toBe(3);
    });

    it('元席が埋まっていて fallbackSeat が空席なら fallback へ復元する', async () => {
      const tournamentId = 't-undo-bust-fallback';
      const okibakeEntryId = 'e-undo-bust-fallback';
      const operationId = 'op-undo-bust-fallback';
      const tableId = 'tbl-bust-fallback';

      await seedBustUndoFixture({ tournamentId, okibakeEntryId, tableId, playersBusted: 3 });
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc(okibakeEntryId)
        .set(
          {
            entryStatus: 'busted',
            bustedAt: admin.firestore.FieldValue.serverTimestamp(),
            bustedTableId: tableId,
            bustedSeatKey: 'seat02',
          },
          { merge: true }
        );
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .set({
          isEnabled: true,
          seats: {
            seat02UserId: 'other-user',
            seat02PokerName: '他の人',
            seat02OkibakeEntryId: null,
            seat03UserId: null,
            seat03PokerName: null,
            seat03OkibakeEntryId: null,
          },
        });

      await db.collection('operationLogs').doc(operationId).set({
        operationId,
        operationName: '置きバケ Bust',
        tournamentId,
        status: 'succeeded',
        payload: bustOpPayload({ tournamentId, okibakeEntryId, tableId }),
      });

      const res = await rollbackAction.run({
        data: {
          tournamentId,
          operationId,
          action: 'okibake_bust',
          rollBackBy: 'dev-1',
          fallbackSeat: { tableId, seatKey: 'seat03', seatNumber: 3 },
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
      expect(entry.entryStatus).toBe('seated');
      expect(entry.assignedTableId).toBe(tableId);
      expect(entry.assignedSeatKey).toBe('seat03');

      const table = (
        await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('tablesSeat')
          .doc(tableId)
          .get()
      ).data()!;
      expect(table.seats.seat03OkibakeEntryId).toBe(okibakeEntryId);
      expect(table.seats.seat02UserId).toBe('other-user');

      const main = (
        await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('views')
          .doc('main')
          .get()
      ).data()!;
      expect(main.playersBusted).toBe(2);
    });

    it('fallbackSeat が埋まっている場合は拒否する', async () => {
      const tournamentId = 't-undo-bust-fallback-busy';
      const okibakeEntryId = 'e-undo-bust-fallback-busy';
      const operationId = 'op-undo-bust-fallback-busy';
      const tableId = 'tbl-bust-fallback-busy';

      await seedBustUndoFixture({ tournamentId, okibakeEntryId, tableId, playersBusted: 2 });
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc(okibakeEntryId)
        .set({ entryStatus: 'busted' }, { merge: true });
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .set({
          isEnabled: true,
          seats: {
            seat02UserId: 'other-user',
            seat02PokerName: '他の人',
            seat02OkibakeEntryId: null,
            seat03UserId: 'busy-user',
            seat03PokerName: '埋まり',
            seat03OkibakeEntryId: null,
          },
        });

      await db.collection('operationLogs').doc(operationId).set({
        operationId,
        operationName: '置きバケ Bust',
        tournamentId,
        status: 'succeeded',
        payload: bustOpPayload({ tournamentId, okibakeEntryId, tableId }),
      });

      await expect(
        rollbackAction.run({
          data: {
            tournamentId,
            operationId,
            action: 'okibake_bust',
            rollBackBy: 'dev-1',
            fallbackSeat: { tableId, seatKey: 'seat03', seatNumber: 3 },
          },
        } as any)
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });
  });

  describe('通常参加者 Bust undo seat conflict', () => {
    async function seedBustedUser(
      tournamentId: string,
      playerUid: string,
      pokerName: string
    ) {
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc('busted')
        .set({
          bustedUser: {
            [playerUid]: {
              pokerName,
              bustAt: admin.firestore.Timestamp.now(),
            },
          },
        });
    }

    it('元席が空いている bust_and_exit rollback 成功時に bustedUser から削除される', async () => {
      const tournamentId = 't-undo-normal-bust-original';
      const operationId = 'op-undo-normal-bust-original';
      const tableId = 'tbl-normal-original';
      const playerUid = 'player-normal-original';

      await db.collection('scheduledTournaments').doc(tournamentId).set({});
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .set({ playersBusted: 1, playersIn: 4 });
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
        });
      await seedBustedUser(tournamentId, playerUid, '通常太郎');

      await db.collection('operationLogs').doc(operationId).set({
        operationId,
        operationName: 'バスト＆退店',
        tournamentId,
        tableId,
        status: 'succeeded',
        payload: {
          tournamentId,
          playerUid,
          playerName: '通常太郎',
          tableId,
          seatNumber: 1,
        },
      });

      await rollbackAction.run({
        data: {
          tournamentId,
          operationId,
          action: 'bust_and_exit',
          rollBackBy: 'dev-1',
        },
      } as any);

      const busted = (
        await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('tablesSeat')
          .doc('busted')
          .get()
      ).data()!;
      expect(busted.bustedUser[playerUid]).toBeUndefined();
    });

    it('bust_and_reentry rollback 成功時に bustedUser から削除される', async () => {
      const tournamentId = 't-undo-normal-reentry';
      const operationId = 'op-undo-normal-reentry';
      const tableId = 'tbl-normal-reentry';
      const playerUid = 'player-normal-reentry';

      await db.collection('scheduledTournaments').doc(tournamentId).set({});
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .set({ playersBusted: 1, playersIn: 4, reentries: 1 });
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
        });
      await seedBustedUser(tournamentId, playerUid, '再入太郎');

      await db.collection('operationLogs').doc(operationId).set({
        operationId,
        operationName: 'バスト＆再入場',
        tournamentId,
        tableId,
        status: 'succeeded',
        payload: {
          tournamentId,
          playerUid,
          playerName: '再入太郎',
          tableId,
          seatNumber: 1,
        },
      });

      await rollbackAction.run({
        data: {
          tournamentId,
          operationId,
          action: 'bust_and_reentry',
          rollBackBy: 'dev-1',
        },
      } as any);

      const busted = (
        await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('tablesSeat')
          .doc('busted')
          .get()
      ).data()!;
      expect(busted.bustedUser[playerUid]).toBeUndefined();
    });

    it('元席が埋まっていて fallbackSeat が空席なら fallback へ復元する', async () => {
      const tournamentId = 't-undo-normal-bust-fallback';
      const operationId = 'op-undo-normal-bust-fallback';
      const tableId = 'tbl-normal-bust';
      const playerUid = 'player-normal-bust';

      await db.collection('scheduledTournaments').doc(tournamentId).set({});
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .set({ playersBusted: 2, playersIn: 5, reentries: 0 });
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .set({
          isEnabled: true,
          seats: {
            seat01UserId: 'other-user',
            seat01PokerName: '他の人',
            seat01OkibakeEntryId: null,
            seat02UserId: null,
            seat02PokerName: null,
            seat02OkibakeEntryId: null,
          },
        });

      await seedBustedUser(tournamentId, playerUid, '通常太郎');

      await db.collection('operationLogs').doc(operationId).set({
        operationId,
        operationName: 'バスト＆退店',
        tournamentId,
        tableId,
        status: 'succeeded',
        payload: {
          tournamentId,
          playerUid,
          playerName: '通常太郎',
          tableId,
          seatNumber: 1,
        },
      });

      const res = await rollbackAction.run({
        data: {
          tournamentId,
          operationId,
          action: 'bust_and_exit',
          rollBackBy: 'dev-1',
          fallbackSeat: { tableId, seatKey: 'seat02', seatNumber: 2 },
        },
      } as any);
      expect(res.success).toBe(true);

      const table = (
        await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('tablesSeat')
          .doc(tableId)
          .get()
      ).data()!;
      expect(table.seats.seat02UserId).toBe(playerUid);
      expect(table.seats.seat01UserId).toBe('other-user');

      const busted = (
        await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('tablesSeat')
          .doc('busted')
          .get()
      ).data()!;
      expect(busted.bustedUser[playerUid]).toBeUndefined();

      const main = (
        await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('views')
          .doc('main')
          .get()
      ).data()!;
      expect(main.playersBusted).toBe(1);
      expect(main.playersIn).toBe(6);
    });

    it('元席が埋まっていて fallbackSeat なしの場合 seat selection required を返す', async () => {
      const tournamentId = 't-undo-normal-bust-select';
      const operationId = 'op-undo-normal-bust-select';
      const tableId = 'tbl-normal-select';
      const playerUid = 'player-normal-select';

      await db.collection('scheduledTournaments').doc(tournamentId).set({});
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .set({ playersBusted: 1, playersIn: 4 });
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .set({
          isEnabled: true,
          seats: {
            seat01UserId: 'other-user',
            seat01PokerName: '他の人',
            seat01OkibakeEntryId: null,
            seat02UserId: null,
            seat02PokerName: null,
            seat02OkibakeEntryId: null,
          },
        });

      await seedBustedUser(tournamentId, playerUid, '通常太郎');

      await db.collection('operationLogs').doc(operationId).set({
        operationId,
        operationName: 'バスト＆退店',
        tournamentId,
        status: 'succeeded',
        payload: {
          tournamentId,
          playerUid,
          playerName: '通常太郎',
          tableId,
          seatNumber: 1,
        },
      });

      let caught: unknown;
      try {
        await rollbackAction.run({
          data: {
            tournamentId,
            operationId,
            action: 'bust_and_exit',
            rollBackBy: 'dev-1',
          },
        } as any);
      } catch (error) {
        caught = error;
      }

      const err = caught as { details?: Record<string, unknown> };
      expect(err.details?.errorKey).toBe('TOURNAMENT_BUST_UNDO_SEAT_SELECTION_REQUIRED');
      expect(err.details?.participantType).toBe('normal');

      const busted = (
        await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('tablesSeat')
          .doc('busted')
          .get()
      ).data()!;
      expect(busted.bustedUser[playerUid]).toBeDefined();

      const main = (
        await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('views')
          .doc('main')
          .get()
      ).data()!;
      expect(main.playersBusted).toBe(1);
    });
  });

  it('置きバケ Addon の undo で okibakeAddonCount と views.addons を戻せる', async () => {
    const tournamentId = 't-undo-okibake-addon';
    const okibakeEntryId = 'e-undo-okibake-addon';
    const operationId = 'op-undo-okibake-addon';
    const addonRecordId = 'addon-rec-undo-1';
    const occurredAt = Timestamp.fromDate(new Date('2025-06-01T12:00:00Z'));

    await db.collection('scheduledTournaments').doc(tournamentId).set({
      snapshot: {
        isAddon: true,
        addonLimitPerPlayer: 2,
        startStack: 10000,
        addonStack: 5000,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({
        entries: 1,
        addons: 2,
        playersBusted: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        okibakeAddonCount: 1,
        lastOkibakeAddonAt: occurredAt,
        okibakeAddonRecords: [
          {
            addonRecordId,
            operationId,
            occurredAt,
            createdByDeviceId: 'dev-addon',
            reflectedToBill: false,
            reflectedToBillAt: null,
            linkedBillId: null,
            rolledBack: false,
            rollBackAt: null,
            rollBackBy: null,
          },
        ],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await db.collection('operationLogs').doc(operationId).set({
      operationId,
      operationName: '置きバケ Addon',
      tournamentId,
      status: 'succeeded',
      payload: {
        tournamentId,
        okibakeEntryId,
        addonRecordId,
        okibakeAddonCountBefore: 0,
        okibakeAddonCountAfter: 1,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const res = await rollbackAction.run({
      data: {
        tournamentId,
        operationId,
        action: 'okibake_addon',
        rollBackBy: 'dev-rollback',
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
    expect(entry.okibakeAddonCount).toBe(0);
    expect(entry.lastOkibakeAddonAt).toBeNull();
    const records = entry.okibakeAddonRecords as Array<Record<string, unknown>>;
    expect(records[0].rolledBack).toBe(true);
    expect(records[0].rollBackBy).toBe('dev-rollback');

    const main = (
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get()
    ).data()!;
    expect(main.addons).toBe(1);
    expect(main.avgStack).toBe(15000);

    const op = (await db.collection('operationLogs').doc(operationId).get()).data()!;
    expect(op.rolledBack).toBe(true);
  });

  it('伝票反映済みの置きバケ Addon は undo できない', async () => {
    const tournamentId = 't-undo-okibake-addon-reflected';
    const okibakeEntryId = 'e-reflected';
    const operationId = 'op-reflected';
    const addonRecordId = 'addon-rec-reflected';

    await db.collection('scheduledTournaments').doc(tournamentId).set({
      snapshot: { isAddon: true, addonLimitPerPlayer: 2 },
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({ addons: 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .doc(okibakeEntryId)
      .set({
        okibakeAddonCount: 1,
        okibakeAddonRecords: [
          {
            addonRecordId,
            operationId,
            reflectedToBill: true,
            rolledBack: false,
          },
        ],
      });

    await db.collection('operationLogs').doc(operationId).set({
      operationId,
      operationName: '置きバケ Addon',
      tournamentId,
      status: 'succeeded',
      payload: { tournamentId, okibakeEntryId, addonRecordId },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await expect(
      rollbackAction.run({
        data: {
          tournamentId,
          operationId,
          action: 'okibake_addon',
          rollBackBy: 'dev-rollback',
        },
      } as any),
    ).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});
