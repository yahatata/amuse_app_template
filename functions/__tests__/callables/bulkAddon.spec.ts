/**
 * bulkAddon の統合テスト
 * 
 * ChangeSpec P1-05 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path: 複数ユーザーに対して activeStays/{userId} から billId を取得し、各ユーザーごとに recordTournamentAction(action: 'addon') を呼び出すこと
 * - activeStays/{userId} が存在しない場合、エラーが返ること
 * - activeStays/{userId}.billId が未設定の場合、エラーが返ること
 * - 既にAddon済みのユーザーはスキップされること
 * - scheduledTournaments/views/main の addons が正しくインクリメントされること
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { bulkAddon } from '../../src/callables/bulkAddon';
import { createBillWithActiveStay } from '../../src/helpers/billsApi/createBillWithActiveStay';

describe('bulkAddon', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-bulk-addon';

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
  async function setupTournament(tournamentId: string, templateId: string, isAddon: boolean = true) {
    const addonFee = 300;
    const addonStack = 1000;
    const templateName = 'テストトーナメント';

    // scheduledTournaments/{tournamentId} を作成
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      templateId,
      status: 'scheduled',
      startAt: admin.firestore.Timestamp.fromDate(new Date('2025-11-20T10:00:00Z')),
      snapshot: {
        name: templateName,
        entryFee: 1000,
        isAddon,
        addonFee: isAddon ? addonFee : null,
        addonStack: isAddon ? addonStack : null,
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
        addons: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  describe('happy path', () => {
    it('複数ユーザーに対して activeStays/{userId} から billId を取得し、各ユーザーごとに recordTournamentAction(action: \'addon\') を呼び出すこと', async () => {
      const tournamentId = 'tournament_test_bulk_addon_001';
      const templateId = 'template_001';
      const users = [
        { userId: 'user_test_bulk_addon_001', billId: 'bill_test_bulk_addon_001', pokerName: 'テスト太郎1' },
        { userId: 'user_test_bulk_addon_002', billId: 'bill_test_bulk_addon_002', pokerName: 'テスト太郎2' },
        { userId: 'user_test_bulk_addon_003', billId: 'bill_test_bulk_addon_003', pokerName: 'テスト太郎3' },
      ];

      // テストデータ準備
      for (const user of users) {
        await createBillWithActiveStay({
          billId: user.billId,
          userId: user.userId,
          pokerName: user.pokerName,
          idempotencyKey: `idem_test_bulk_addon_${user.userId}`,
        });
      }

      await setupTournament(tournamentId, templateId, true);

      // bulkAddon を呼び出す
      const mockRequest = {
        data: {
          tournamentId,
          users: users.map(u => ({ userId: u.userId, pokerName: u.pokerName })),
        },
        auth: null,
      } as any;

      const result = await (bulkAddon as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(3);

      // 各ユーザーの /bills/{billId}/tournaments/{templateId} の addonCount がインクリメントされている
      for (const user of users) {
        const tournamentRef = db.collection('bills').doc(user.billId).collection('tournaments').doc(templateId);
        const tournamentDoc = await tournamentRef.get();
        expect(tournamentDoc.exists).toBe(true);

        const tournamentData = tournamentDoc.data()!;
        expect(tournamentData.addonCount).toBe(1);
        expect(tournamentData.lastAddonAt).toBeDefined();
      }

      // scheduledTournaments/views/main の addons が正しくインクリメントされている
      const viewsMainDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get();
      const viewsMainData = viewsMainDoc.data()!;
      expect(viewsMainData.addons).toBe(3);
    });
  });

  describe('error handling', () => {
    it('activeStays/{userId} が存在しないユーザーが含まれている場合、エラーが返ること', async () => {
      const tournamentId = 'tournament_test_bulk_addon_002';
      const templateId = 'template_001';
      const users = [
        { userId: 'user_test_bulk_addon_004', billId: 'bill_test_bulk_addon_004', pokerName: 'テスト太郎4' },
        { userId: 'user_not_exists', pokerName: '存在しないユーザー' },
      ];

      // 1人目のユーザーのみ activeStays を作成
      const firstUserForError = users[0];
      if (!firstUserForError.billId) {
        throw new Error('firstUserForError.billId is required');
      }
      await createBillWithActiveStay({
        billId: firstUserForError.billId,
        userId: firstUserForError.userId,
        pokerName: firstUserForError.pokerName,
        idempotencyKey: 'idem_test_bulk_addon_004',
      });

      await setupTournament(tournamentId, templateId, true);

      const mockRequest = {
        data: {
          tournamentId,
          users: users.map(u => ({ userId: u.userId, pokerName: u.pokerName })),
        },
        auth: null,
      } as any;

      const result = await (bulkAddon as any).run(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('activeStaysドキュメントが見つからないか、billIdが設定されていません');
    });

    it('既にAddon済みのユーザーはスキップされること', async () => {
      const tournamentId = 'tournament_test_bulk_addon_003';
      const templateId = 'template_001';
      const users = [
        { userId: 'user_test_bulk_addon_005', billId: 'bill_test_bulk_addon_005', pokerName: 'テスト太郎5' },
        { userId: 'user_test_bulk_addon_006', billId: 'bill_test_bulk_addon_006', pokerName: 'テスト太郎6' },
      ];

      // テストデータ準備
      for (const user of users) {
        await createBillWithActiveStay({
          billId: user.billId,
          userId: user.userId,
          pokerName: user.pokerName,
          idempotencyKey: `idem_test_bulk_addon_${user.userId}`,
        });
      }

      await setupTournament(tournamentId, templateId, true);

      // 1人目のユーザーは既にAddon済みにする
      const { recordTournamentAction } = await import('../../src/helpers/billsApi/recordTournamentAction');
      const firstUserForAddon = users[0];
      if (!firstUserForAddon.billId) {
        throw new Error('firstUserForAddon.billId is required');
      }
      await recordTournamentAction({
        billId: firstUserForAddon.billId,
        templateId,
        action: 'addon',
        templateName: 'テストトーナメント',
        entryFeeIncl: null,
        reentryFeeIncl: null,
        addonFeeIncl: 300,
        startAt: admin.firestore.Timestamp.fromDate(new Date('2025-11-20T10:00:00Z')),
        idempotencyKey: 'idem_addon_already_005',
      });

      const mockRequest = {
        data: {
          tournamentId,
          users: users.map(u => ({ userId: u.userId, pokerName: u.pokerName })),
        },
        auth: null,
      } as any;

      const result = await (bulkAddon as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(1); // 2人目のユーザーのみ処理される

      // 1人目のユーザーの addonCount は 1 のまま（増えない）
      const firstUserForCheck = users[0];
      if (!firstUserForCheck.billId) {
        throw new Error('firstUserForCheck.billId is required');
      }
      const tournamentRef1 = db.collection('bills').doc(firstUserForCheck.billId).collection('tournaments').doc(templateId);
      const tournamentDoc1 = await tournamentRef1.get();
      const tournamentData1 = tournamentDoc1.data()!;
      expect(tournamentData1.addonCount).toBe(1);

      // 2人目のユーザーの addonCount は 1 になる
      const secondUserForCheck = users[1];
      if (!secondUserForCheck.billId) {
        throw new Error('secondUserForCheck.billId is required');
      }
      const tournamentRef2 = db.collection('bills').doc(secondUserForCheck.billId).collection('tournaments').doc(templateId);
      const tournamentDoc2 = await tournamentRef2.get();
      const tournamentData2 = tournamentDoc2.data()!;
      expect(tournamentData2.addonCount).toBe(1);
    });
  });
});

