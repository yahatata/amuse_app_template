/**
 * bustAndExit の統合テスト
 * 
 * ChangeSpec P1-04 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path: activeStays/{userId} から billId を取得し、updatePlace を呼び出すこと（table: null, seat: null）、bills/{billId}.place.table/place.seat が null に更新されること
 * - activeStays/{userId} が存在しない場合のエラー
 * - activeStays/{userId} に billId が設定されていない場合のエラー
 * - scheduledTournaments の更新が正しく行われること
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { bustAndExit } from '../../src/domains/tournament_activeTournament/callables/bustAndExit';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';

describe('bustAndExit', () => {
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
  async function setupTournament(tournamentId: string, tableId: string, userId: string, seatNumber: number, pokerName: string) {
    const tablesSeatRef = db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat');

    const seatNumberStr = seatNumber.toString().padStart(2, '0');

    // テーブルを作成（ユーザーが座っている状態）
    const seats: { [key: string]: string | null } = {
      seat01UserId: null,
      seat01PokerName: null,
      seat02UserId: null,
      seat02PokerName: null,
    };
    // 指定されたシートにユーザーを設定
    seats[`seat${seatNumberStr}UserId`] = userId;
    seats[`seat${seatNumberStr}PokerName`] = pokerName;

    await tablesSeatRef.doc(tableId).set({
      isEnabled: true,
      seats,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // views/main を作成
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({
        playersBusted: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    // busted を作成
    await tablesSeatRef.doc('busted').set({
      bustedUser: {},
    });
  }

  describe('happy path', () => {
    it('activeStays/{userId} から billId を取得し、updatePlace を呼び出し、bills/{billId}.place.table/place.seat が null に更新されること', async () => {
      const tournamentId = 'tournament_test_bust_001';
      const userId = 'user_test_bust_001';
      const billId = 'bill_test_bust_001';
      const tableId = 'table_001';
      const seatNumber = 1;
      const pokerName = 'テスト太郎';

      // テストデータ準備
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName,
        idempotencyKey: 'idem_test_bust_001',
      });

      // 初期状態で bills/{billId}.place を設定
      await db.collection('bills').doc(billId).update({
        'place.table': tableId,
        'place.seat': seatNumber,
      });

      await setupTournament(tournamentId, tableId, userId, seatNumber, pokerName);

      const adminId = 'admin_test_bust_001';
      await createAdminDevice(adminId);

      // bustAndExit を呼び出す
      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: `op_bust_${tournamentId}`,
          tournamentId,
          tableId,
          seatNumber,
          userId,
        },
      } as any;

      const result = await (bustAndExit as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.userId).toBe(userId);

      // bills/{billId}.place.table/place.seat が null に更新されている
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.place.table).toBeNull();
      expect(billData.place.seat).toBeNull();

      // scheduledTournaments の更新が正しく行われること
      const tableSeatDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .get();
      const tableSeatData = tableSeatDoc.data()!;
      const seatNumberStr = seatNumber.toString().padStart(2, '0');
      expect(tableSeatData.seats[`seat${seatNumberStr}UserId`]).toBeNull();
      expect(tableSeatData.seats[`seat${seatNumberStr}PokerName`]).toBeNull();

      // views/main の playersBusted がインクリメントされている
      const viewsMainDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get();
      const viewsMainData = viewsMainDoc.data()!;
      expect(viewsMainData.playersBusted).toBe(1);

      // busted に退席情報が追加されている
      const bustedDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc('busted')
        .get();
      const bustedData = bustedDoc.data()!;
      expect(bustedData.bustedUser[userId]).toBeDefined();
      expect(bustedData.bustedUser[userId].pokerName).toBe(pokerName);
    });
  });

  describe('エラーハンドリング', () => {
    it('activeStays/{userId} が存在しない場合、エラーが発生すること', async () => {
      const tournamentId = 'tournament_test_bust_error_001';
      const userId = 'user_not_exist';
      const tableId = 'table_001';
      const seatNumber = 1;

      await setupTournament(tournamentId, tableId, userId, seatNumber, 'テスト太郎');

      const adminId = 'admin_test_bust_error_001';
      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: `op_bust_${tournamentId}`,
          tournamentId,
          tableId,
          seatNumber,
          userId,
        },
      } as any;

      const result = await (bustAndExit as any).run(mockRequest);
      expect(result.success).toBe(false);
      expect(result.error).toContain('activeStaysドキュメントが存在しません');
    });

    it('activeStays/{userId} に billId が設定されていない場合、エラーが発生すること', async () => {
      const tournamentId = 'tournament_test_bust_error_002';
      const userId = 'user_test_bust_error_002';
      const tableId = 'table_001';
      const seatNumber = 1;

      // activeStays を作成（billId を設定しない）
      await db.collection('activeStays').doc(userId).set({
        uid: userId,
        isActive: true,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        // billId を設定しない
      });

      await setupTournament(tournamentId, tableId, userId, seatNumber, 'テスト太郎');

      const adminId = 'admin_test_bust_error_002';
      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: `op_bust_${tournamentId}`,
          tournamentId,
          tableId,
          seatNumber,
          userId,
        },
      } as any;

      const result = await (bustAndExit as any).run(mockRequest);
      expect(result.success).toBe(false);
      expect(result.error).toContain('billIdが設定されていません');
    });

    it('seat に座っている userId と、引数の userId が不一致のとき、エラーが発生すること', async () => {
      const tournamentId = 'tournament_test_bust_error_003';
      const otherUserId = 'user_other_003';
      const requestUserId = 'user_request_003';
      const billId = 'bill_test_bust_error_003';
      const tableId = 'table_001';
      const seatNumber = 1;
      const pokerName = '他のユーザー';

      // requestUserId の activeStays を作成
      await createBillWithActiveStay({
        billId,
        userId: requestUserId,
        pokerName: 'リクエストユーザー',
        idempotencyKey: 'idem_test_bust_error_003',
      });

      // 初期状態で bills/{billId}.place を設定
      await db.collection('bills').doc(billId).update({
        'place.table': tableId,
        'place.seat': seatNumber,
      });

      // 対象 seat に別ユーザー（otherUserId）が座っている状態でセットアップ
      await setupTournament(tournamentId, tableId, otherUserId, seatNumber, pokerName);

      // 初期状態を保存
      const viewsMainDocBefore = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get();
      const playersBustedBefore = viewsMainDocBefore.data()!.playersBusted;

      const billDocBefore = await db.collection('bills').doc(billId).get();
      const placeBefore = billDocBefore.data()!.place;

      const adminId = 'admin_test_bust_error_003';
      await createAdminDevice(adminId);

      // requestUserId で bustAndExit を呼び出す
      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: `op_bust_${tournamentId}`,
          tournamentId,
          tableId,
          seatNumber,
          userId: requestUserId, // 座っているユーザーとは異なる
        },
      } as any;

      const result = await (bustAndExit as any).run(mockRequest);
      expect(result.success).toBe(false);
      expect(result.error).toContain('別のユーザーが座っています');

      // tablesSeat/{tableId}.seats の対象 seat が null 化されていないこと
      const tableSeatDocAfter = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .get();
      const seatsAfter = tableSeatDocAfter.data()!.seats;
      const seatNumberStr = seatNumber.toString().padStart(2, '0');
      expect(seatsAfter[`seat${seatNumberStr}UserId`]).toBe(otherUserId); // 元のユーザーのまま

      // views/main.playersBusted がインクリメントされていないこと
      const viewsMainDocAfter = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get();
      const playersBustedAfter = viewsMainDocAfter.data()!.playersBusted;
      expect(playersBustedAfter).toBe(playersBustedBefore);

      // tablesSeat/busted.bustedUser に新規エントリが追加されていないこと
      const bustedDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc('busted')
        .get();
      const bustedData = bustedDoc.data()!;
      expect(bustedData.bustedUser[requestUserId]).toBeUndefined();

      // bills/{billId}.place も更新されていないこと（updatePlace(null, null) が呼ばれないこと）
      const billDocAfter = await db.collection('bills').doc(billId).get();
      const placeAfter = billDocAfter.data()!.place;
      expect(placeAfter.table).toEqual(placeBefore.table);
      expect(placeAfter.seat).toEqual(placeBefore.seat);
    });
  });

  describe('ドキュメント存在チェック', () => {
    it('busted ドキュメントが存在しない場合でも、処理が成功し、busted ドキュメントが新規作成されること', async () => {
      const tournamentId = 'tournament_test_busted_missing_001';
      const userId = 'user_test_busted_missing_001';
      const billId = 'bill_test_busted_missing_001';
      const tableId = 'table_001';
      const seatNumber = 1;
      const pokerName = 'テスト太郎';

      // テストデータ準備
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName,
        idempotencyKey: 'idem_test_busted_missing_001',
      });

      // 初期状態で bills/{billId}.place を設定
      await db.collection('bills').doc(billId).update({
        'place.table': tableId,
        'place.seat': seatNumber,
      });

      // テーブルを作成（ユーザーが座っている状態）
      const tablesSeatRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat');

      const seatNumberStr = seatNumber.toString().padStart(2, '0');
      const seats: { [key: string]: string | null } = {
        seat01UserId: null,
        seat01PokerName: null,
        seat02UserId: null,
        seat02PokerName: null,
      };
      seats[`seat${seatNumberStr}UserId`] = userId;
      seats[`seat${seatNumberStr}PokerName`] = pokerName;

      await tablesSeatRef.doc(tableId).set({
        isEnabled: true,
        seats,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // views/main を作成
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .set({
          playersBusted: 0,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      // busted ドキュメントは作成しない（実装が merge: true で自己修復することを検証）

      const adminId = 'admin_test_bust_busted_missing_001';
      await createAdminDevice(adminId);

      // bustAndExit を呼び出す
      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: `op_bust_${tournamentId}`,
          tournamentId,
          tableId,
          seatNumber,
          userId,
        },
      } as any;

      const result = await (bustAndExit as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.userId).toBe(userId);

      // tablesSeat/{tableId}.seats の対象 seat が null になること
      const tableSeatDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .get();
      const tableSeatData = tableSeatDoc.data()!;
      expect(tableSeatData.seats[`seat${seatNumberStr}UserId`]).toBeNull();
      expect(tableSeatData.seats[`seat${seatNumberStr}PokerName`]).toBeNull();

      // views/main.playersBusted がインクリメントされること
      const viewsMainDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get();
      const viewsMainData = viewsMainDoc.data()!;
      expect(viewsMainData.playersBusted).toBe(1);

      // /tablesSeat/busted ドキュメントが新規作成され、その中の bustedUser.{userId} に pokerName と bustAt が設定されていること
      const bustedDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc('busted')
        .get();
      expect(bustedDoc.exists).toBe(true);
      const bustedData = bustedDoc.data()!;
      expect(bustedData.bustedUser[userId]).toBeDefined();
      expect(bustedData.bustedUser[userId].pokerName).toBe(pokerName);
      expect(bustedData.bustedUser[userId].bustAt).toBeDefined();
      expect(bustedData.bustedUser[userId].bustAt).toBeInstanceOf(admin.firestore.Timestamp);

      // bills/{billId}.place.table/place.seat が null に更新されている
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.place.table).toBeNull();
      expect(billData.place.seat).toBeNull();
    });
  });
});

