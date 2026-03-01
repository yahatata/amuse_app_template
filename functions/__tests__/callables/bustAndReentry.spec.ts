/**
 * bustAndReentry の統合テスト
 * 
 * ChangeSpec P1-05 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path: activeStays/{userId} から billId を取得し、recordTournamentAction(action: 'reentry') を呼び出すこと
 * - activeStays/{userId} が存在しない場合、エラーが返ること
 * - activeStays/{userId}.billId が未設定の場合、エラーが返ること
 * - reentryCount がインクリメントされること
 * - maxReentriesPerPlayer 制限チェックが機能すること
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { bustAndReentry } from '../../src/domains/tournament_activeTournament/callables/bustAndReentry';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';

describe('bustAndReentry', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-bust-reentry';

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
  async function setupTournament(tournamentId: string, templateId: string, tableId: string, userId: string, seatNumber: number, pokerName: string, maxReentriesPerPlayer?: number) {
    const reentryFee = 500;
    const templateName = 'テストトーナメント';
    const startAt = admin.firestore.Timestamp.fromDate(new Date('2025-11-20T10:00:00Z'));

    // scheduledTournaments/{tournamentId} を作成
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      templateId,
      status: 'scheduled',
      startAt,
      snapshot: {
        name: templateName,
        entryFee: 1000,
        reentryFee,
        maxReentriesPerPlayer: maxReentriesPerPlayer ?? null,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // tournamentTemplates/{templateId} を作成
    await db.collection('tournamentTemplates').doc(templateId).set({
      name: templateName,
      entryFee: 1000,
      reentryFee,
      maxReentriesPerPlayer: maxReentriesPerPlayer ?? null,
    });

    const seatNumberStr = seatNumber.toString().padStart(2, '0');

    // テーブルを作成（ユーザーが座っている状態）
    const seats: { [key: string]: string | null } = {
      seat01UserId: null,
      seat01PokerName: null,
      seat02UserId: null,
      seat02PokerName: null,
    };
    seats[`seat${seatNumberStr}UserId`] = userId;
    seats[`seat${seatNumberStr}PokerName`] = pokerName;

    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc(tableId)
      .set({
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
        reentries: 0,
        waitingCount: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  describe('happy path', () => {
    it('activeStays/{userId} から billId を取得し、recordTournamentAction(action: \'reentry\') を呼び出し、reentryCount がインクリメントされること', async () => {
      const tournamentId = 'tournament_test_reentry_001';
      const templateId = 'template_001';
      const userId = 'user_test_reentry_001';
      const billId = 'bill_test_reentry_001';
      const tableId = 'table_001';
      const seatNumber = 1;
      const pokerName = 'テスト太郎';

      // テストデータ準備
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName,
        idempotencyKey: 'idem_test_reentry_001',
      });

      // まずentryを記録
      const entryIdempotencyKey = 'idem_entry_001';
      const { recordTournamentAction } = await import('../../src/domains/bills/repos/recordTournamentAction');
      await recordTournamentAction({
        billId,
        templateId,
        action: 'entry',
        templateName: 'テストトーナメント',
        entryFeeIncl: 1000,
        reentryFeeIncl: null,
        addonFeeIncl: null,
        startAt: admin.firestore.Timestamp.fromDate(new Date('2025-11-20T10:00:00Z')),
        idempotencyKey: entryIdempotencyKey,
      });

      await setupTournament(tournamentId, templateId, tableId, userId, seatNumber, pokerName);

      // bustAndReentry を呼び出す
      const mockRequest = {
        data: {
          tournamentId,
          userId,
          tableId,
          seatNumber,
        },
        auth: null,
      } as any;

      const result = await (bustAndReentry as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.userId).toBe(userId);

      // /bills/{billId}/tournaments/{templateId} の reentryCount がインクリメントされている
      const tournamentRef = db.collection('bills').doc(billId).collection('tournaments').doc(templateId);
      const tournamentDoc = await tournamentRef.get();
      expect(tournamentDoc.exists).toBe(true);

      const tournamentData = tournamentDoc.data()!;
      expect(tournamentData.entryCount).toBe(1);
      expect(tournamentData.reentryCount).toBe(1);
      expect(tournamentData.lastReentryAt).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('activeStays/{userId} が存在しない場合、エラーが返ること', async () => {
      const tournamentId = 'tournament_test_reentry_002';
      const templateId = 'template_001';
      const userId = 'user_not_exists';
      const tableId = 'table_001';
      const seatNumber = 1;

      await setupTournament(tournamentId, templateId, tableId, userId, seatNumber, 'テスト太郎');

      const mockRequest = {
        data: {
          tournamentId,
          userId,
          tableId,
          seatNumber,
        },
        auth: null,
      } as any;

      const result = await (bustAndReentry as any).run(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('activeStaysドキュメントが存在しません');
    });

    it('activeStays/{userId}.billId が未設定の場合、エラーが返ること', async () => {
      const tournamentId = 'tournament_test_reentry_003';
      const templateId = 'template_001';
      const userId = 'user_test_reentry_003';
      const tableId = 'table_001';
      const seatNumber = 1;

      await setupTournament(tournamentId, templateId, tableId, userId, seatNumber, 'テスト太郎');

      // activeStays を作成（billId なし）
      await db.collection('activeStays').doc(userId).set({
        uid: userId,
        isActive: true,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const mockRequest = {
        data: {
          tournamentId,
          userId,
          tableId,
          seatNumber,
        },
        auth: null,
      } as any;

      const result = await (bustAndReentry as any).run(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('billIdが設定されていません');
    });

    it('maxReentriesPerPlayer 制限チェックが機能すること', async () => {
      const tournamentId = 'tournament_test_reentry_004';
      const templateId = 'template_001';
      const userId = 'user_test_reentry_004';
      const billId = 'bill_test_reentry_004';
      const tableId = 'table_001';
      const seatNumber = 1;
      const pokerName = 'テスト太郎';
      const maxReentriesPerPlayer = 1;

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName,
        idempotencyKey: 'idem_test_reentry_004',
      });

      // entry + reentry を記録（maxReentriesPerPlayer = 1 なので、これで制限に達する）
      const { recordTournamentAction } = await import('../../src/domains/bills/repos/recordTournamentAction');
      await recordTournamentAction({
        billId,
        templateId,
        action: 'entry',
        templateName: 'テストトーナメント',
        entryFeeIncl: 1000,
        reentryFeeIncl: null,
        addonFeeIncl: null,
        startAt: admin.firestore.Timestamp.fromDate(new Date('2025-11-20T10:00:00Z')),
        idempotencyKey: 'idem_entry_004',
      });
      await recordTournamentAction({
        billId,
        templateId,
        action: 'reentry',
        templateName: 'テストトーナメント',
        entryFeeIncl: 1000,
        reentryFeeIncl: 500,
        addonFeeIncl: null,
        startAt: admin.firestore.Timestamp.fromDate(new Date('2025-11-20T10:00:00Z')),
        idempotencyKey: 'idem_reentry_004',
      });

      await setupTournament(tournamentId, templateId, tableId, userId, seatNumber, pokerName, maxReentriesPerPlayer);

      const mockRequest = {
        data: {
          tournamentId,
          userId,
          tableId,
          seatNumber,
        },
        auth: null,
      } as any;

      const result = await (bustAndReentry as any).run(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('リエントリー制限に達しています');
    });
  });
});

