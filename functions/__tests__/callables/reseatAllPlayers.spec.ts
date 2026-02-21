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
  const projectId = 'test-project-reseat-all';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    
    testEnv = await initializeTestEnvironment({
      projectId,
    });
    
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map(a => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({
      projectId,
    });
    
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

  // テスト用のヘルパ関数: scheduledTournaments のセットアップ
  async function setupTournament(tournamentId: string, tableIds: string[]) {
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

      // reseatAllPlayers を呼び出す
      const mockRequest = {
        data: {
          tournamentId,
          playerAssignments: [
            { userId: userId1, tableId: tableId1, seatNumber: 1 },
            { userId: userId2, tableId: tableId2, seatNumber: 2 },
          ],
        },
        auth: null,
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

      // reseatAllPlayers を呼び出す
      const mockRequest = {
        data: {
          tournamentId,
          playerAssignments: [
            { userId: userId1, tableId: tableId1, seatNumber: 1 },
            { userId: userId2, tableId: tableId2, seatNumber: 2 },
          ],
        },
        auth: null,
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

      const mockRequest = {
        data: {
          tournamentId,
          playerAssignments: [
            { userId: userId1, tableId: tableId1, seatNumber: 1 },
            { userId: userId2, tableId: tableId2, seatNumber: 2 },
          ],
        },
        auth: null,
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

      const mockRequest = {
        data: {
          tournamentId,
          playerAssignments: [
            { userId: userId1, tableId: tableId1, seatNumber: 1 },
          ],
        },
        auth: null,
      } as any;

      await expect((reseatAllPlayers as any).run(mockRequest)).rejects.toThrow();
    });
  });
});

