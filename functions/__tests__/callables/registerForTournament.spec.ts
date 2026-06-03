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
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    
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

  // テスト用: JST 本日の startAt
  function jstTodayStartAt(hour = 14): admin.firestore.Timestamp {
    const jstOffsetMs = 9 * 60 * 60 * 1000;
    const now = new Date();
    const jstNow = new Date(now.getTime() + jstOffsetMs);
    const jstToday = new Date(
      jstNow.getFullYear(),
      jstNow.getMonth(),
      jstNow.getDate(),
      hour,
      0,
      0,
      0
    );
    return admin.firestore.Timestamp.fromDate(new Date(jstToday.getTime() - jstOffsetMs));
  }

  // テスト用のヘルパ関数: scheduledTournaments のセットアップ
  async function setupTournament(
    tournamentId: string,
    templateId: string,
    overrides: Record<string, unknown> = {}
  ) {
    const entryFee = 1000;
    const templateName = 'テストトーナメント';
    const startAt = jstTodayStartAt();
    const regEndAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 24 * 60 * 60 * 1000)
    );

    await db.collection('scheduledTournaments').doc(tournamentId).set({
      templateId,
      status: 'scheduled',
      startAt,
      regEndAt,
      snapshot: {
        name: templateName,
        entryFee,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...overrides,
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
      expect(result.error).toContain('未入店');
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
      expect(result.error).toContain('未入店');
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

  describe('phase6 okibake linked user conflict guard', () => {
    it('okibake linkedUserId と衝突する場合は通常参加を拒否し、ビューを更新しない', async () => {
      const tournamentId = 'tournament_test_phase6_conflict_001';
      const templateId = 'template_phase6_001';
      const userId = 'user_phase6_conflict_001';
      const billId = 'bill_phase6_conflict_001';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: '衝突ユーザー',
        idempotencyKey: 'idem_phase6_conflict_001',
      });
      await setupTournament(tournamentId, templateId);

      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc('okibake-conflict-1')
        .set({
          linkedUserId: userId,
          linkedUserPokerName: '衝突ユーザー',
          entryStatus: 'registered',
          billLinkStatus: 'unlinked',
        });

      const mockRequest = {
        data: { tournamentId },
        auth: { uid: userId },
      } as any;

      const result = await (registerForTournament as any).run(mockRequest);
      expect(result.success).toBe(false);
      expect(result.error).toContain('置きバケ対象ユーザー');

      const viewsMainDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get();
      const viewsMainData = viewsMainDoc.data()!;
      expect(viewsMainData.playersIn).toBe(0);
      expect(viewsMainData.entries).toBe(0);
      expect(viewsMainData.waitingCount).toBe(0);
    });

    it('entryStatus == voided の置きバケは衝突判定から除外される', async () => {
      const tournamentId = 'tournament_test_phase6_voided_001';
      const templateId = 'template_phase6_002';
      const userId = 'user_phase6_voided_001';
      const billId = 'bill_phase6_voided_001';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'Voided対象',
        idempotencyKey: 'idem_phase6_voided_001',
      });
      await setupTournament(tournamentId, templateId);

      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc('okibake-voided-1')
        .set({
          linkedUserId: userId,
          linkedUserPokerName: 'Voided対象',
          entryStatus: 'voided',
          billLinkStatus: 'linked',
        });

      const mockRequest = {
        data: { tournamentId },
        auth: { uid: userId },
      } as any;

      const result = await (registerForTournament as any).run(mockRequest);
      expect(result.success).toBe(true);
    });
  });

  describe('LIFF guards', () => {
    it('status=ended の場合エラー', async () => {
      const tournamentId = 'tournament_ended';
      const templateId = 'template_ended';
      const userId = 'user_ended';
      const billId = 'bill_ended';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト',
        idempotencyKey: 'idem_ended',
      });
      await setupTournament(tournamentId, templateId, { status: 'ended' });

      const result = await (registerForTournament as any).run({
        data: { tournamentId },
        auth: { uid: userId },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('トーナメントは終了しました');
    });

    it('status=paused の場合エラー', async () => {
      const tournamentId = 'tournament_paused';
      const templateId = 'template_paused';
      const userId = 'user_paused';
      const billId = 'bill_paused';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト',
        idempotencyKey: 'idem_paused',
      });
      await setupTournament(tournamentId, templateId, { status: 'paused' });

      const result = await (registerForTournament as any).run({
        data: { tournamentId },
        auth: { uid: userId },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('トーナメントは一時停止中です');
    });

    it('status=registered の場合エラー', async () => {
      const tournamentId = 'tournament_registered';
      const templateId = 'template_registered';
      const userId = 'user_registered';
      const billId = 'bill_registered';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト',
        idempotencyKey: 'idem_registered',
      });
      await setupTournament(tournamentId, templateId, { status: 'registered' });

      const result = await (registerForTournament as any).run({
        data: { tournamentId },
        auth: { uid: userId },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('参加締め切りしました');
    });

    it('本日以外のトーナメントはエラー', async () => {
      const tournamentId = 'tournament_not_today';
      const templateId = 'template_not_today';
      const userId = 'user_not_today';
      const billId = 'bill_not_today';
      const tomorrow = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 24 * 60 * 60 * 1000)
      );

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト',
        idempotencyKey: 'idem_not_today',
      });
      await setupTournament(tournamentId, templateId, { startAt: tomorrow });

      const result = await (registerForTournament as any).run({
        data: { tournamentId },
        auth: { uid: userId },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('本日のトーナメントのみ');
    });

    it('liffRegistrationEnabled=false の場合エラー', async () => {
      const tournamentId = 'tournament_liff_off';
      const templateId = 'template_liff_off';
      const userId = 'user_liff_off';
      const billId = 'bill_liff_off';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト',
        idempotencyKey: 'idem_liff_off',
      });
      await setupTournament(tournamentId, templateId);

      const configLoaderModule = await import('../../src/shared/config/configLoader');
      const defaults = configLoaderModule.buildFromDefaults();
      jest.spyOn(configLoaderModule, 'getStoreConfig').mockResolvedValue({
        ...defaults,
        tournament: {
          ...defaults.tournament!,
          liffRegistrationEnabled: false,
        },
      });

      const result = await (registerForTournament as any).run({
        data: { tournamentId },
        auth: { uid: userId },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('参加登録は現在受け付けていません');
    });
  });
});
