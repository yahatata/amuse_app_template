/**
 * registerForTournament の統合テスト
 * 
 * ChangeSpec P1-05 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path: activeStays/{userId} から billId を取得し、recordTournamentAction(action: 'entry') を呼び出すこと
 * - activeStays/{userId} が存在しない場合、エラーが返ること
 * - activeStays/{userId}.billId が未設定の場合、エラーが返ること
 * - scheduledTournaments の更新が正しく行われること
 * - todaysBills.tournaments への直接更新が削除されていること
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { registerForTournament } from '../../src/domains/tournament_activeTournament/callables/registerForTournament';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';

describe('registerForTournament', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-register-tournament';

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
  async function setupTournament(tournamentId: string, templateId: string) {
    const entryFee = 1000;
    const templateName = 'テストトーナメント';
    const startAt = admin.firestore.Timestamp.fromDate(new Date('2025-11-20T10:00:00Z'));

    // scheduledTournaments/{tournamentId} を作成
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      templateId,
      status: 'scheduled',
      startAt,
      snapshot: {
        name: templateName,
        entryFee,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // views/main を作成
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({
        playersIn: 0,
        entries: 0,
        waitingCount: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    // tablesSeat/waiting を作成
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

    // views/usersList を作成
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('usersList')
      .set({
        users: {},
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  describe('happy path', () => {
    it('activeStays/{userId} から billId を取得し、recordTournamentAction(action: \'entry\') を呼び出し、/bills/{billId}/tournaments/{templateId} が作成されること', async () => {
      const tournamentId = 'tournament_test_001';
      const templateId = 'template_001';
      const userId = 'user_test_001';
      const billId = 'bill_test_001';
      const pokerName = 'テスト太郎';

      // テストデータ準備
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName,
        idempotencyKey: 'idem_test_001',
      });

      await setupTournament(tournamentId, templateId);

      // registerForTournament を呼び出す
      const mockRequest = {
        data: {
          tournamentId,
        },
        auth: {
          uid: userId,
        },
      } as any;

      const result = await (registerForTournament as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.tournamentId).toBe(tournamentId);
      expect(result.data.pokerName).toBe(pokerName);

      // /bills/{billId}/tournaments/{templateId} が作成されている
      const tournamentRef = db.collection('bills').doc(billId).collection('tournaments').doc(templateId);
      const tournamentDoc = await tournamentRef.get();
      expect(tournamentDoc.exists).toBe(true);

      const tournamentData = tournamentDoc.data()!;
      expect(tournamentData.templateId).toBe(templateId);
      expect(tournamentData.entryCount).toBe(1);
      expect(tournamentData.reentryCount).toBe(0);
      expect(tournamentData.addonCount).toBe(0);
      expect(tournamentData.registeredAt).toBeDefined();

      // scheduledTournaments の更新が正しく行われること
      const viewsMainDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get();
      const viewsMainData = viewsMainDoc.data()!;
      expect(viewsMainData.playersIn).toBe(1);
      expect(viewsMainData.entries).toBe(1);
      expect(viewsMainData.waitingCount).toBe(1);

      // waiting にユーザーが追加されている
      const waitingDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc('waiting')
        .get();
      const waitingData = waitingDoc.data()!;
      expect(waitingData.waiting[userId]).toBeDefined();
      expect(waitingData.count).toBe(1);
    });
  });

  describe('error handling', () => {
    it('activeStays/{userId} が存在しない場合、エラーが返ること', async () => {
      const tournamentId = 'tournament_test_002';
      const templateId = 'template_001';
      const userId = 'user_not_exists';

      await setupTournament(tournamentId, templateId);

      const mockRequest = {
        data: {
          tournamentId,
        },
        auth: {
          uid: userId,
        },
      } as any;

      const result = await (registerForTournament as any).run(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('activeStaysドキュメントが存在しません');
    });

    it('activeStays/{userId}.billId が未設定の場合、エラーが返ること', async () => {
      const tournamentId = 'tournament_test_003';
      const templateId = 'template_001';
      const userId = 'user_test_003';

      await setupTournament(tournamentId, templateId);

      // activeStays を作成（billId なし）
      await db.collection('activeStays').doc(userId).set({
        uid: userId,
        isActive: true,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const mockRequest = {
        data: {
          tournamentId,
        },
        auth: {
          uid: userId,
        },
      } as any;

      const result = await (registerForTournament as any).run(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('billIdが設定されていません');
    });
  });

  describe('scheduledTournaments update', () => {
    it('scheduledTournaments の更新が正しく行われること', async () => {
      const tournamentId = 'tournament_test_004';
      const templateId = 'template_001';
      const userId = 'user_test_004';
      const billId = 'bill_test_004';
      const pokerName = 'テスト太郎';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName,
        idempotencyKey: 'idem_test_004',
      });

      await setupTournament(tournamentId, templateId);

      const mockRequest = {
        data: {
          tournamentId,
        },
        auth: {
          uid: userId,
        },
      } as any;

      await (registerForTournament as any).run(mockRequest);

      // views/main が更新されている
      const viewsMainDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get();
      const viewsMainData = viewsMainDoc.data()!;
      expect(viewsMainData.playersIn).toBe(1);
      expect(viewsMainData.entries).toBe(1);
      expect(viewsMainData.waitingCount).toBe(1);

      // views/usersList にユーザーが追加されている
      const usersListDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('usersList')
        .get();
      const usersListData = usersListDoc.data()!;
      expect(usersListData.users[userId]).toBeDefined();
      expect(usersListData.users[userId].pokerName).toBe(pokerName);
    });
  });

  describe('todaysBills direct update removal', () => {
    it('todaysBills.tournaments への直接更新が削除されていること（recordTournamentAction内のDualWriteに集約）', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'true';

      const tournamentId = 'tournament_test_005';
      const templateId = 'template_001';
      const userId = 'user_test_005';
      const billId = 'bill_test_005';
      const pokerName = 'テスト太郎';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName,
        idempotencyKey: 'idem_test_005',
      });

      await setupTournament(tournamentId, templateId);

      // todaysBillsのスケルトンを作成
      await db.collection('todaysBills').doc(billId).set({
        status: 'open',
        userId,
        pokerName,
        items: [],
        sideGameChip: [],
        tournaments: {},
      });

      const mockRequest = {
        data: {
          tournamentId,
        },
        auth: {
          uid: userId,
        },
      } as any;

      await (registerForTournament as any).run(mockRequest);

      // /bills/{billId}/tournaments/{templateId} が作成されている
      const tournamentRef = db.collection('bills').doc(billId).collection('tournaments').doc(templateId);
      const tournamentDoc = await tournamentRef.get();
      expect(tournamentDoc.exists).toBe(true);

      // todaysBills.tournaments は recordTournamentAction の DualWrite で更新される（直接更新ではない）
      // 少し待ってから確認（DualWriteは非同期）
      await new Promise(resolve => setTimeout(resolve, 100));

      const todaysBillsDoc = await db.collection('todaysBills').doc(billId).get();
      const todaysBillsData = todaysBillsDoc.data()!;
      const tournaments = todaysBillsData.tournaments || {};
      
      // DualWriteが有効な場合、tournamentsにエントリが追加される
      if (process.env.WRITE_TODAYS_BILLS_IN_PARALLEL === 'true') {
        expect(tournaments[templateId]).toBeDefined();
        expect(tournaments[templateId].templateId).toBe(templateId);
        expect(tournaments[templateId].entryCount).toBe(1);
      }
    });
  });
});

