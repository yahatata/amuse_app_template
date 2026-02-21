/**
 * addon の統合テスト
 * 
 * ChangeSpec P1-05 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path: activeStays/{userId} から billId を取得し、recordTournamentAction(action: 'addon') を呼び出すこと
 * - activeStays/{userId} が存在しない場合、エラーが返ること
 * - activeStays/{userId}.billId が未設定の場合、エラーが返ること
 * - addonCount がインクリメントされること
 * - isAddon: false の場合にエラーが返ること
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { addon } from '../../src/domains/tournament_activeTournament/callables/addon';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';

describe('addon', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-addon';

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
    it('activeStays/{userId} から billId を取得し、recordTournamentAction(action: \'addon\') を呼び出し、addonCount がインクリメントされること', async () => {
      const tournamentId = 'tournament_test_addon_001';
      const templateId = 'template_001';
      const userId = 'user_test_addon_001';
      const billId = 'bill_test_addon_001';
      const pokerName = 'テスト太郎';

      // テストデータ準備
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName,
        idempotencyKey: 'idem_test_addon_001',
      });

      await setupTournament(tournamentId, templateId, true);

      // addon を呼び出す
      const mockRequest = {
        data: {
          tournamentId,
          userId,
          pokerName,
        },
        auth: null,
      } as any;

      const result = await (addon as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.userId).toBe(userId);
      expect(result.pokerName).toBe(pokerName);

      // /bills/{billId}/tournaments/{templateId} の addonCount がインクリメントされている
      const tournamentRef = db.collection('bills').doc(billId).collection('tournaments').doc(templateId);
      const tournamentDoc = await tournamentRef.get();
      expect(tournamentDoc.exists).toBe(true);

      const tournamentData = tournamentDoc.data()!;
      expect(tournamentData.addonCount).toBe(1);
      expect(tournamentData.lastAddonAt).toBeDefined();

      // scheduledTournaments/views/main の addons がインクリメントされている
      const viewsMainDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get();
      const viewsMainData = viewsMainDoc.data()!;
      expect(viewsMainData.addons).toBe(1);
    });
  });

  describe('error handling', () => {
    it('activeStays/{userId} が存在しない場合、エラーが返ること', async () => {
      const tournamentId = 'tournament_test_addon_002';
      const templateId = 'template_001';
      const userId = 'user_not_exists';
      const pokerName = 'テスト太郎';

      await setupTournament(tournamentId, templateId, true);

      const mockRequest = {
        data: {
          tournamentId,
          userId,
          pokerName,
        },
        auth: null,
      } as any;

      const result = await (addon as any).run(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('activeStaysドキュメントが存在しません');
    });

    it('activeStays/{userId}.billId が未設定の場合、エラーが返ること', async () => {
      const tournamentId = 'tournament_test_addon_003';
      const templateId = 'template_001';
      const userId = 'user_test_addon_003';
      const pokerName = 'テスト太郎';

      await setupTournament(tournamentId, templateId, true);

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
          pokerName,
        },
        auth: null,
      } as any;

      const result = await (addon as any).run(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('billIdが設定されていません');
    });

    it('isAddon: false の場合にエラーが返ること', async () => {
      const tournamentId = 'tournament_test_addon_004';
      const templateId = 'template_001';
      const userId = 'user_test_addon_004';
      const billId = 'bill_test_addon_004';
      const pokerName = 'テスト太郎';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName,
        idempotencyKey: 'idem_test_addon_004',
      });

      await setupTournament(tournamentId, templateId, false); // isAddon: false

      const mockRequest = {
        data: {
          tournamentId,
          userId,
          pokerName,
        },
        auth: null,
      } as any;

      const result = await (addon as any).run(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('このトーナメントではAddonができません');
    });
  });
});

