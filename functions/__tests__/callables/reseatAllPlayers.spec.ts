/**
 * reseatAllPlayers の統合テスト
 * 
 * ChangeSpec P1-04 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path: 複数ユーザーに対して activeStays/{userId} から billId を取得し、updatePlace を逐次呼び出すこと、各ユーザーの bills/{billId}.place.table/place.seat が更新されること
 * - scheduledTournaments の更新が1つのトランザクションで完了すること
 * - トランザクション完了後、トランザクション外で各ユーザーごとに updatePlace を逐次呼び出すこと
 * - pokerName が activeStays/{userId}.pokerName から取得されること（未設定時は Player_{userId} をフォールバック）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { reseatAllPlayers } from '../../src/domains/tournament_activeTournament/callables/reseatAllPlayers';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';

describe('reseatAllPlayers', () => {
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
    delete process.env.WRITE_TODAYS_BILLS_IN_PARALLEL;
  });

  async function createAdminDevice(uid: string) {
    await db.collection('devices').add({
      uid,
      role: 'admin',
      status: 'active',
      name: 'Test Admin Device',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // テスト用のヘルパ関数: scheduledTournaments のセットアップ
  async function setupTournament(tournamentId: string, tableIds: string[]) {
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      status: 'running',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const tablesSeatRef = db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat');

    // 各テーブルを作成
    for (const tableId of tableIds) {
      await tablesSeatRef.doc(tableId).set({
        isEnabled: true,
        seats: {
          seat01UserId: null,
          seat01PokerName: null,
          seat02UserId: null,
          seat02PokerName: null,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // 待機者リストを作成
    await tablesSeatRef.doc('waiting').set({
      waiting: {},
      count: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  describe('happy path', () => {
    it('複数ユーザーに対して activeStays/{userId} から billId を取得し、updatePlace を逐次呼び出し、各ユーザーの bills/{billId}.place.table/place.seat が更新されること', async () => {
      const tournamentId = 'tournament_test_reseat_001';
      const userId1 = 'user_test_reseat_001';
      const userId2 = 'user_test_reseat_002';
      const billId1 = 'bill_test_reseat_001';
      const billId2 = 'bill_test_reseat_002';
      const tableId1 = 'table_001';
      const tableId2 = 'table_002';
      const pokerName1 = 'テスト太郎1';
      const pokerName2 = 'テスト太郎2';

      // テストデータ準備
      await createBillWithActiveStay({
        billId: billId1,
        userId: userId1,
        pokerName: pokerName1,
        idempotencyKey: 'idem_test_reseat_001',
      });

      await createBillWithActiveStay({
        billId: billId2,
        userId: userId2,
        pokerName: pokerName2,
        idempotencyKey: 'idem_test_reseat_002',
      });

      await setupTournament(tournamentId, [tableId1, tableId2]);

      // 待機者リストにユーザーを追加
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc('waiting')
        .update({
          waiting: { [userId1]: true, [userId2]: true },
          count: 2,
        });

      const adminId = 'admin_test_reseat_001';
      await createAdminDevice(adminId);

      // reseatAllPlayers を呼び出す
      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: `op_reseat_${tournamentId}`,
          tournamentId,
          playerAssignments: [
            { userId: userId1, tableId: tableId1, seatNumber: 1 },
            { userId: userId2, tableId: tableId2, seatNumber: 2 },
          ],
        },
      } as any;

      const result = await (reseatAllPlayers as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.playerCount).toBe(2);

      // 各ユーザーの bills/{billId}.place.table/place.seat が更新されている
      const billDoc1 = await db.collection('bills').doc(billId1).get();
      const billData1 = billDoc1.data()!;
      expect(billData1.place.table).toBe(tableId1);
      expect(billData1.place.seat).toBe(1);

      const billDoc2 = await db.collection('bills').doc(billId2).get();
      const billData2 = billDoc2.data()!;
      expect(billData2.place.table).toBe(tableId2);
      expect(billData2.place.seat).toBe(2);

      // scheduledTournaments の更新が正しく行われること
      const tableSeatDoc1 = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId1)
        .get();
      const tableSeatData1 = tableSeatDoc1.data()!;
      expect(tableSeatData1.seats.seat01UserId).toBe(userId1);
      expect(tableSeatData1.seats.seat01PokerName).toBe(pokerName1);

      const tableSeatDoc2 = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId2)
        .get();
      const tableSeatData2 = tableSeatDoc2.data()!;
      expect(tableSeatData2.seats.seat02UserId).toBe(userId2);
      expect(tableSeatData2.seats.seat02PokerName).toBe(pokerName2);

      // 待機者リストから削除されている
      const waitingDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc('waiting')
        .get();
      const waitingData = waitingDoc.data()!;
      expect(waitingData.waiting[userId1]).toBeUndefined();
      expect(waitingData.waiting[userId2]).toBeUndefined();
      expect(waitingData.count).toBe(0);
    });

    it('pokerName が activeStays/{userId}.pokerName から取得されること（未設定時は Player_{userId} をフォールバック）', async () => {
      const tournamentId = 'tournament_test_reseat_002';
      const userId1 = 'user_test_reseat_003';
      const userId2 = 'user_test_reseat_004';
      const billId1 = 'bill_test_reseat_003';
      const billId2 = 'bill_test_reseat_004';
      const tableId1 = 'table_001';
      const tableId2 = 'table_002';
      const pokerName1 = 'テスト太郎1';

      // テストデータ準備（userId2 の pokerName を設定しない）
      await createBillWithActiveStay({
        billId: billId1,
        userId: userId1,
        pokerName: pokerName1,
        idempotencyKey: 'idem_test_reseat_003',
      });

      await createBillWithActiveStay({
        billId: billId2,
        userId: userId2,
        // pokerName を省略（undefined として扱われる）
        idempotencyKey: 'idem_test_reseat_004',
      });

      await setupTournament(tournamentId, [tableId1, tableId2]);

      const adminId = 'admin_test_reseat_002';
      await createAdminDevice(adminId);

      // reseatAllPlayers を呼び出す
      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: `op_reseat_${tournamentId}`,
          tournamentId,
          playerAssignments: [
            { userId: userId1, tableId: tableId1, seatNumber: 1 },
            { userId: userId2, tableId: tableId2, seatNumber: 2 },
          ],
        },
      } as any;

      const result = await (reseatAllPlayers as any).run(mockRequest);

      expect(result.success).toBe(true);

      // scheduledTournaments の更新で pokerName1 と Player_{userId2} が使用されている
      const tableSeatDoc1 = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId1)
        .get();
      const tableSeatData1 = tableSeatDoc1.data()!;
      expect(tableSeatData1.seats.seat01PokerName).toBe(pokerName1);

      const tableSeatDoc2 = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId2)
        .get();
      const tableSeatData2 = tableSeatDoc2.data()!;
      expect(tableSeatData2.seats.seat02PokerName).toBe(`Player_${userId2}`);
    });

    it('全席クリア時に seatXXOkibakeEntryId も null になること', async () => {
      const tournamentId = 'tournament_test_reseat_okibake_001';
      const userId = 'user_test_reseat_okibake_001';
      const billId = 'bill_test_reseat_okibake_001';
      const tableId = 'table_001';
      const pokerName = 'リンク済み太郎';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName,
        idempotencyKey: 'idem_test_reseat_okibake_001',
      });

      await setupTournament(tournamentId, [tableId]);
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .update({
          'seats.seat01UserId': 'old_user',
          'seats.seat01PokerName': '移動前',
          'seats.seat01OkibakeEntryId': 'okibake_entry_reseat_001',
        });

      const adminId = 'admin_test_reseat_okibake_001';
      await createAdminDevice(adminId);

      const result = await (reseatAllPlayers as any).run({
        auth: { uid: adminId },
        data: {
          operationId: `op_reseat_${tournamentId}`,
          tournamentId,
          playerAssignments: [
            { userId, tableId, seatNumber: 2 },
          ],
        },
      } as any);

      expect(result.success).toBe(true);

      const tableSeatDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .get();
      const seats = tableSeatDoc.data()!.seats;
      expect(seats.seat01UserId).toBeNull();
      expect(seats.seat01PokerName).toBeNull();
      expect(seats.seat01OkibakeEntryId).toBeNull();
      expect(seats.seat02UserId).toBe(userId);
      expect(seats.seat02PokerName).toBe(pokerName);
      expect(seats.seat02OkibakeEntryId).toBeNull();
    });

    it('置きバケ候補指定時、seatXXOkibakeEntryId で席に入り entry が seated になること', async () => {
      const tournamentId = 'tournament_test_reseat_okibake_assign_001';
      const okibakeEntryId = 'okibake_entry_reseat_assign_001';
      const tableId = 'table_001';

      await setupTournament(tournamentId, [tableId]);
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .set({ waitingCount: 2, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc(okibakeEntryId)
        .set({
          okibakeEntryId,
          tournamentId,
          temporaryDisplayName: 'オキバケA',
          entryStatus: 'registered',
          billLinkStatus: 'unlinked',
          okibakeAddonCount: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      const adminId = 'admin_test_reseat_okibake_assign_001';
      await createAdminDevice(adminId);

      const operationId = `op_reseat_${tournamentId}`;
      const result = await (reseatAllPlayers as any).run({
        auth: { uid: adminId },
        data: {
          operationId,
          tournamentId,
          playerAssignments: [
            { okibakeEntryId, tableId, seatNumber: 1 },
          ],
        },
      } as any);

      expect(result.success).toBe(true);

      const opDoc = await db.collection('operationLogs').doc(operationId).get();
      expect(opDoc.exists).toBe(true);
      const opPayload = opDoc.data()!.payload as Record<string, unknown>;
      const okibakeTargets = opPayload.okibakeReseatTargets as Array<Record<string, unknown>>;
      expect(Array.isArray(okibakeTargets)).toBe(true);
      expect(okibakeTargets).toHaveLength(1);
      expect(okibakeTargets[0].okibakeEntryId).toBe(okibakeEntryId);
      expect((okibakeTargets[0].okibakeEntryBefore as Record<string, unknown>).entryStatus).toBe('registered');
      expect((okibakeTargets[0].okibakeEntryAfter as Record<string, unknown>).entryStatus).toBe('seated');
      expect((okibakeTargets[0].okibakeEntryAfter as Record<string, unknown>).assignedTableId).toBe(tableId);
      expect((okibakeTargets[0].okibakeEntryAfter as Record<string, unknown>).assignedSeatKey).toBe('seat01');

      const tableSeatDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .get();
      const seats = tableSeatDoc.data()!.seats;
      expect(seats.seat01UserId).toBeNull();
      expect(seats.seat01PokerName).toBe('オキバケA');
      expect(seats.seat01OkibakeEntryId).toBe(okibakeEntryId);

      const entryDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc(okibakeEntryId)
        .get();
      const entry = entryDoc.data()!;
      expect(entry.entryStatus).toBe('seated');
      expect(entry.assignedTableId).toBe(tableId);
      expect(entry.assignedSeatKey).toBe('seat01');

      const viewsDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get();
      expect(viewsDoc.data()!.waitingCount).toBe(1);
    });

    it('seated 置きバケは新しい席に移動すること', async () => {
      const tournamentId = 'tournament_test_reseat_okibake_move_001';
      const okibakeEntryId = 'okibake_entry_reseat_move_001';
      const tableId = 'table_001';

      await setupTournament(tournamentId, [tableId]);
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc(okibakeEntryId)
        .set({
          okibakeEntryId,
          tournamentId,
          temporaryDisplayName: 'オキバケB',
          entryStatus: 'seated',
          billLinkStatus: 'unlinked',
          assignedTableId: tableId,
          assignedSeatKey: 'seat01',
          okibakeAddonCount: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .update({
          'seats.seat01UserId': null,
          'seats.seat01PokerName': 'オキバケB',
          'seats.seat01OkibakeEntryId': okibakeEntryId,
        });

      const adminId = 'admin_test_reseat_okibake_move_001';
      await createAdminDevice(adminId);

      const operationId = `op_reseat_${tournamentId}`;
      const result = await (reseatAllPlayers as any).run({
        auth: { uid: adminId },
        data: {
          operationId,
          tournamentId,
          playerAssignments: [
            { okibakeEntryId, tableId, seatNumber: 2 },
          ],
        },
      } as any);

      expect(result.success).toBe(true);

      const opDoc = await db.collection('operationLogs').doc(operationId).get();
      const okibakeTargets = (opDoc.data()!.payload as Record<string, unknown>).okibakeReseatTargets as Array<Record<string, unknown>>;
      expect(okibakeTargets).toHaveLength(1);
      expect((okibakeTargets[0].okibakeEntryBefore as Record<string, unknown>).entryStatus).toBe('seated');
      expect((okibakeTargets[0].okibakeEntryBefore as Record<string, unknown>).assignedSeatKey).toBe('seat01');
      expect((okibakeTargets[0].okibakeEntryAfter as Record<string, unknown>).assignedSeatKey).toBe('seat02');

      const seats = (
        await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('tablesSeat')
          .doc(tableId)
          .get()
      ).data()!.seats;
      expect(seats.seat01OkibakeEntryId).toBeNull();
      expect(seats.seat02OkibakeEntryId).toBe(okibakeEntryId);
      expect(seats.seat02PokerName).toBe('オキバケB');
    });
  });

  describe('エラーハンドリング', () => {
    it('activeStays/{userId} が存在しない場合、エラーが発生すること', async () => {
      const tournamentId = 'tournament_test_reseat_error_001';
      const userId1 = 'user_exist';
      const userId2 = 'user_not_exist';
      const billId1 = 'bill_test_reseat_error_001';
      const tableId1 = 'table_001';
      const tableId2 = 'table_002';

      await createBillWithActiveStay({
        billId: billId1,
        userId: userId1,
        pokerName: 'テスト太郎1',
        idempotencyKey: 'idem_test_reseat_error_001',
      });

      await setupTournament(tournamentId, [tableId1, tableId2]);

      const adminId = 'admin_test_reseat_error_001';
      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: `op_reseat_${tournamentId}`,
          tournamentId,
          playerAssignments: [
            { userId: userId1, tableId: tableId1, seatNumber: 1 },
            { userId: userId2, tableId: tableId2, seatNumber: 2 },
          ],
        },
      } as any;

      await expect((reseatAllPlayers as any).run(mockRequest)).rejects.toThrow();
    });

    it('activeStays/{userId} に billId が設定されていない場合、エラーが発生すること', async () => {
      const tournamentId = 'tournament_test_reseat_error_002';
      const userId1 = 'user_test_reseat_error_002';
      const tableId1 = 'table_001';

      // activeStays を作成（billId を設定しない）
      await db.collection('activeStays').doc(userId1).set({
        uid: userId1,
        isActive: true,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        // billId を設定しない
      });

      await setupTournament(tournamentId, [tableId1]);

      const adminId = 'admin_test_reseat_error_002';
      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: `op_reseat_${tournamentId}`,
          tournamentId,
          playerAssignments: [
            { userId: userId1, tableId: tableId1, seatNumber: 1 },
          ],
        },
      } as any;

      await expect((reseatAllPlayers as any).run(mockRequest)).rejects.toThrow();
    });
  });

  describe('reseatTableIds 検証', () => {
    it('reseatTableIds が空の場合はエラーになること', async () => {
      const tournamentId = 'tournament_test_reseat_table_ids_empty';
      const userId = 'user_test_reseat_table_ids_empty';
      const billId = 'bill_test_reseat_table_ids_empty';
      const tableId = 'table_001';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_reseat_table_ids_empty',
      });

      await setupTournament(tournamentId, [tableId]);

      const adminId = 'admin_test_reseat_table_ids_empty';
      await createAdminDevice(adminId);

      await expect(
        (reseatAllPlayers as any).run({
          auth: { uid: adminId },
          data: {
            operationId: `op_reseat_${tournamentId}`,
            tournamentId,
            reseatTableIds: [],
            playerAssignments: [
              { userId, tableId, seatNumber: 1 },
            ],
          },
        } as any),
      ).rejects.toThrow(/リシート先の卓を1つ以上選択してください/);
    });

    it('選択卓の席数不足の場合はエラーになること', async () => {
      const tournamentId = 'tournament_test_reseat_table_ids_capacity';
      const tableId1 = 'table_001';
      const tableId2 = 'table_002';

      await setupTournament(tournamentId, [tableId1, tableId2]);

      const users = [
        { userId: 'user_cap_1', billId: 'bill_cap_1' },
        { userId: 'user_cap_2', billId: 'bill_cap_2' },
        { userId: 'user_cap_3', billId: 'bill_cap_3' },
      ];

      for (const [index, user] of users.entries()) {
        await createBillWithActiveStay({
          billId: user.billId,
          userId: user.userId,
          pokerName: `テスト${index + 1}`,
          idempotencyKey: `idem_test_reseat_cap_${index}`,
        });
      }

      const adminId = 'admin_test_reseat_table_ids_capacity';
      await createAdminDevice(adminId);

      await expect(
        (reseatAllPlayers as any).run({
          auth: { uid: adminId },
          data: {
            operationId: `op_reseat_${tournamentId}`,
            tournamentId,
            reseatTableIds: [tableId1],
            playerAssignments: users.map((user, index) => ({
              userId: user.userId,
              tableId: tableId1,
              seatNumber: index + 1,
            })),
          },
        } as any),
      ).rejects.toThrow(/選択した卓の席数では、対象者を全員配置できません/);
    });

    it('未選択卓には assignment を作らないと未選択卓は空のままになること', async () => {
      const tournamentId = 'tournament_test_reseat_table_ids_partial';
      const userId = 'user_test_reseat_table_ids_partial';
      const billId = 'bill_test_reseat_table_ids_partial';
      const tableId1 = 'table_001';
      const tableId2 = 'table_002';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_reseat_table_ids_partial',
      });

      await setupTournament(tournamentId, [tableId1, tableId2]);
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId2)
        .update({
          'seats.seat01UserId': 'old_user',
          'seats.seat01PokerName': '移動前',
        });

      const adminId = 'admin_test_reseat_table_ids_partial';
      await createAdminDevice(adminId);

      const result = await (reseatAllPlayers as any).run({
        auth: { uid: adminId },
        data: {
          operationId: `op_reseat_${tournamentId}`,
          tournamentId,
          reseatTableIds: [tableId1],
          playerAssignments: [{ userId, tableId: tableId1, seatNumber: 1 }],
        },
      } as any);

      expect(result.success).toBe(true);

      const selectedTableDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId1)
        .get();
      expect(selectedTableDoc.data()!.seats.seat01UserId).toBe(userId);

      const unselectedTableDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId2)
        .get();
      const unselectedSeats = unselectedTableDoc.data()!.seats;
      expect(unselectedSeats.seat01UserId).toBeNull();
      expect(unselectedSeats.seat01PokerName).toBeNull();
    });

    it('reseatTableIds 外の卓への assignment はエラーになること', async () => {
      const tournamentId = 'tournament_test_reseat_table_ids_outside';
      const userId = 'user_test_reseat_table_ids_outside';
      const billId = 'bill_test_reseat_table_ids_outside';
      const tableId1 = 'table_001';
      const tableId2 = 'table_002';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey: 'idem_test_reseat_table_ids_outside',
      });

      await setupTournament(tournamentId, [tableId1, tableId2]);

      const adminId = 'admin_test_reseat_table_ids_outside';
      await createAdminDevice(adminId);

      await expect(
        (reseatAllPlayers as any).run({
          auth: { uid: adminId },
          data: {
            operationId: `op_reseat_${tournamentId}`,
            tournamentId,
            reseatTableIds: [tableId1],
            playerAssignments: [{ userId, tableId: tableId2, seatNumber: 1 }],
          },
        } as any),
      ).rejects.toThrow(/リシート先外の卓に割り当てられています/);
    });
  });
});
