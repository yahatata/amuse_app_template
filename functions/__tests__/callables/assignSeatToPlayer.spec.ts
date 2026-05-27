/**
 * assignSeatToPlayer の統合テスト
 * 
 * ChangeSpec P1-04 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path: activeStays/{userId} から billId を取得し、updatePlace を呼び出すこと、bills/{billId}.place.table/place.seat が更新されること
 * - waiting からユーザーを削除したとき views/main.waitingCount が 1 減ること（entries / playersIn / seatedCount は触らない）
 * - activeStays/{userId} が存在しない場合のエラー
 * - activeStays/{userId} に billId が設定されていない場合のエラー
 * - scheduledTournaments の更新が正しく行われること
 * - pokerName が activeStays/{userId}.pokerName から取得されること（未設定時は Player_{userId} をフォールバック）
 * - waiting にユーザーがいない／waiting ドキュメント欠落時は waitingCount を変更しないこと
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { assignSeatToPlayer } from '../../src/domains/tournament_activeTournament/callables/assignSeatToPlayer';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';

describe('assignSeatToPlayer', () => {
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
  async function setupTournament(tournamentId: string, tableId: string) {
    const tablesSeatRef = db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat');

    // テーブルを作成
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

    // 待機者リストを作成
    await tablesSeatRef.doc('waiting').set({
      waiting: {},
      count: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // views/main（assignSeatToPlayer はトランザクション内で参照する）
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({
        entries: 0,
        playersIn: 0,
        waitingCount: 0,
        seatedCount: 0,
        reentries: 0,
        addons: 0,
        playersBusted: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  describe('happy path', () => {
    it('activeStays/{userId} から billId を取得し、updatePlace を呼び出し、bills/{billId}.place.table/place.seat が更新されること', async () => {
      const tournamentId = 'tournament_test_001';
      const userId = 'user_test_001';
      const billId = 'bill_test_001';
      const tableId = 'table_001';
      const seatNumber = 1;
      const pokerName = 'テスト太郎';

      // テストデータ準備
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName,
        idempotencyKey: 'idem_test_001',
      });

      await setupTournament(tournamentId, tableId);

      // 待機者リストにユーザーを追加
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc('waiting')
        .update({
          waiting: { [userId]: true },
          count: 1,
        });

      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .update({ waitingCount: 1 });

      const adminId = 'admin_test_assign_001';
      await createAdminDevice(adminId);

      // assignSeatToPlayer を呼び出す
      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: `op_assign_${tournamentId}`,
          tournamentId,
          userId,
          tableId,
          seatNumber,
        },
      } as any;

      const result = await (assignSeatToPlayer as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.userId).toBe(userId);
      expect(result.tableId).toBe(tableId);
      expect(result.seatNumber).toBe(seatNumber);

      // bills/{billId}.place.table/place.seat が更新されている
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.place.table).toBe(tableId);
      expect(billData.place.seat).toBe(seatNumber);

      // scheduledTournaments の更新が正しく行われること
      const tableSeatDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .get();
      const tableSeatData = tableSeatDoc.data()!;
      expect(tableSeatData.seats.seat01UserId).toBe(userId);
      expect(tableSeatData.seats.seat01PokerName).toBe(pokerName);

      // 待機者リストから削除されている
      const waitingDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc('waiting')
        .get();
      const waitingData = waitingDoc.data()!;
      expect(waitingData.waiting[userId]).toBeUndefined();
      expect(waitingData.count).toBe(0);

      const mainDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get();
      expect(mainDoc.data()!.waitingCount).toBe(0);
      expect(mainDoc.data()!.entries).toBe(0);
      expect(mainDoc.data()!.playersIn).toBe(0);
      expect(mainDoc.data()!.seatedCount).toBe(0);
    });

    it('pokerName が activeStays/{userId}.pokerName から取得されること（未設定時は Player_{userId} をフォールバック）', async () => {
      const tournamentId = 'tournament_test_002';
      const userId = 'user_test_002';
      const billId = 'bill_test_002';
      const tableId = 'table_002';
      const seatNumber = 2;

      // テストデータ準備（pokerName を設定しない）
      await createBillWithActiveStay({
        billId,
        userId,
        // pokerName を省略（undefined として扱われる）
        idempotencyKey: 'idem_test_002',
      });

      await setupTournament(tournamentId, tableId);

      // 待機者リストにユーザーを追加
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc('waiting')
        .update({
          waiting: { [userId]: true },
          count: 1,
        });

      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .update({ waitingCount: 1 });

      const adminId = 'admin_test_assign_002';
      await createAdminDevice(adminId);

      // assignSeatToPlayer を呼び出す
      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: `op_assign_${tournamentId}`,
          tournamentId,
          userId,
          tableId,
          seatNumber,
        },
      } as any;

      const result = await (assignSeatToPlayer as any).run(mockRequest);

      expect(result.success).toBe(true);

      // scheduledTournaments の更新で Player_{userId} が使用されている
      const tableSeatDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .get();
      const tableSeatData = tableSeatDoc.data()!;
      expect(tableSeatData.seats.seat02PokerName).toBe(`Player_${userId}`);
    });
  });

  describe('エラーハンドリング', () => {
    it('activeStays/{userId} が存在しない場合、エラーが発生すること', async () => {
      const tournamentId = 'tournament_test_error_001';
      const userId = 'user_not_exist';
      const tableId = 'table_001';
      const seatNumber = 1;

      await setupTournament(tournamentId, tableId);

      const adminId = 'admin_test_assign_error_001';
      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: `op_assign_${tournamentId}`,
          tournamentId,
          userId,
          tableId,
          seatNumber,
        },
      } as any;

      await expect((assignSeatToPlayer as any).run(mockRequest)).rejects.toThrow();
    });

    it('activeStays/{userId} に billId が設定されていない場合、エラーが発生すること', async () => {
      const tournamentId = 'tournament_test_error_002';
      const userId = 'user_test_error_002';
      const tableId = 'table_001';
      const seatNumber = 1;

      // activeStays を作成（billId を設定しない）
      await db.collection('activeStays').doc(userId).set({
        uid: userId,
        isActive: true,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        // billId を設定しない
      });

      await setupTournament(tournamentId, tableId);

      const adminId = 'admin_test_assign_error_002';
      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: `op_assign_${tournamentId}`,
          tournamentId,
          userId,
          tableId,
          seatNumber,
        },
      } as any;

      await expect((assignSeatToPlayer as any).run(mockRequest)).rejects.toThrow();
    });

    it('テーブルが isEnabled === false のとき、エラーが発生すること', async () => {
      const tournamentId = 'tournament_test_error_003';
      const userId = 'user_test_error_003';
      const billId = 'bill_test_error_003';
      const tableId = 'table_001';
      const seatNumber = 1;
      const pokerName = 'テスト太郎';

      // テストデータ準備
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName,
        idempotencyKey: 'idem_test_error_003',
      });

      // isEnabled: false のテーブルを作成
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .set({
          isEnabled: false,
          seats: {
            seat01UserId: null,
            seat01PokerName: null,
            seat02UserId: null,
            seat02PokerName: null,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      // waiting ドキュメントを作成
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc('waiting')
        .set({
          waiting: { [userId]: true },
          count: 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      // 初期状態の bills/{billId}.place を保存
      const billDocBefore = await db.collection('bills').doc(billId).get();
      const placeBefore = billDocBefore.data()!.place;

      const adminId = 'admin_test_assign_error_003';
      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: `op_assign_${tournamentId}`,
          tournamentId,
          userId,
          tableId,
          seatNumber,
        },
      } as any;

      await expect((assignSeatToPlayer as any).run(mockRequest)).rejects.toThrow();

      // tablesSeat/{tableId}.seats が変更されていないこと
      const tableSeatDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .get();
      const tableSeatData = tableSeatDoc.data()!;
      expect(tableSeatData.seats.seat01UserId).toBeNull();

      // bills/{billId}.place が更新されていないこと（updatePlace が呼ばれない想定）
      const billDocAfter = await db.collection('bills').doc(billId).get();
      const placeAfter = billDocAfter.data()!.place;
      expect(placeAfter.table).toEqual(placeBefore.table);
      expect(placeAfter.seat).toEqual(placeBefore.seat);
    });

    it('対象 seat がすでに埋まっているとき、エラーが発生すること', async () => {
      const tournamentId = 'tournament_test_error_004';
      const userId = 'user_test_error_004';
      const otherUserId = 'user_other_004';
      const billId = 'bill_test_error_004';
      const tableId = 'table_001';
      const seatNumber = 1;
      const pokerName = 'テスト太郎';

      // テストデータ準備
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName,
        idempotencyKey: 'idem_test_error_004',
      });

      // 対象 seat に別ユーザーが座っている状態でテーブルを作成
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .set({
          isEnabled: true,
          seats: {
            seat01UserId: otherUserId, // 既に別ユーザーが座っている
            seat01PokerName: '他のユーザー',
            seat02UserId: null,
            seat02PokerName: null,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      // waiting ドキュメントを作成
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc('waiting')
        .set({
          waiting: { [userId]: true },
          count: 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      // 初期状態の bills/{billId}.place を保存
      const billDocBefore = await db.collection('bills').doc(billId).get();
      const placeBefore = billDocBefore.data()!.place;

      const adminId = 'admin_test_assign_error_004';
      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: `op_assign_${tournamentId}`,
          tournamentId,
          userId,
          tableId,
          seatNumber,
        },
      } as any;

      await expect((assignSeatToPlayer as any).run(mockRequest)).rejects.toThrow();

      // tablesSeat/{tableId}.seats が変更されていないこと
      const tableSeatDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .get();
      const tableSeatData = tableSeatDoc.data()!;
      expect(tableSeatData.seats.seat01UserId).toBe(otherUserId); // 元のユーザーのまま

      // bills/{billId}.place が更新されていないこと（updatePlace が呼ばれないこと）
      const billDocAfter = await db.collection('bills').doc(billId).get();
      const placeAfter = billDocAfter.data()!.place;
      expect(placeAfter.table).toEqual(placeBefore.table);
      expect(placeAfter.seat).toEqual(placeBefore.seat);
    });

    it('waiting ドキュメントが存在しない場合でも、処理が成功すること', async () => {
      const tournamentId = 'tournament_test_waiting_missing_001';
      const userId = 'user_test_waiting_missing_001';
      const billId = 'bill_test_waiting_missing_001';
      const tableId = 'table_001';
      const seatNumber = 1;
      const pokerName = 'テスト太郎';

      // テストデータ準備
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName,
        idempotencyKey: 'idem_test_waiting_missing_001',
      });

      // テーブルを作成（waiting ドキュメントは作成しない）
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
            seat02UserId: null,
            seat02PokerName: null,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .set({
          entries: 0,
          playersIn: 0,
          waitingCount: 5,
          seatedCount: 0,
          reentries: 0,
          addons: 0,
          playersBusted: 0,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      const adminId = 'admin_test_assign_waiting_missing_001';
      await createAdminDevice(adminId);

      // assignSeatToPlayer を呼び出す
      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: `op_assign_${tournamentId}`,
          tournamentId,
          userId,
          tableId,
          seatNumber,
        },
      } as any;

      const result = await (assignSeatToPlayer as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.userId).toBe(userId);
      expect(result.tableId).toBe(tableId);
      expect(result.seatNumber).toBe(seatNumber);

      // tablesSeat/{tableId}.seats が正しく更新されること
      const tableSeatDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .get();
      const tableSeatData = tableSeatDoc.data()!;
      expect(tableSeatData.seats.seat01UserId).toBe(userId);
      expect(tableSeatData.seats.seat01PokerName).toBe(pokerName);

      // bills/{billId}.place も正しく更新されること
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.place.table).toBe(tableId);
      expect(billData.place.seat).toBe(seatNumber);

      const mainDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get();
      expect(mainDoc.data()!.waitingCount).toBe(5);
    });

    it('waiting ドキュメントはあるが対象ユーザーが waiting にいない場合、waitingCount は変わらないこと', async () => {
      const tournamentId = 'tournament_test_not_in_waiting_001';
      const userId = 'user_test_not_in_waiting_001';
      const billId = 'bill_test_not_in_waiting_001';
      const tableId = 'table_001';
      const seatNumber = 1;
      const pokerName = 'テスト太郎';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName,
        idempotencyKey: 'idem_test_not_in_waiting_001',
      });

      await setupTournament(tournamentId, tableId);

      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .update({ waitingCount: 7 });

      const adminId = 'admin_test_assign_not_in_waiting_001';
      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: `op_assign_${tournamentId}`,
          tournamentId,
          userId,
          tableId,
          seatNumber,
        },
      } as any;

      const result = await (assignSeatToPlayer as any).run(mockRequest);

      expect(result.success).toBe(true);

      const mainDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get();
      expect(mainDoc.data()!.waitingCount).toBe(7);
    });
  });
});

