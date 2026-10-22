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
  async function setupTournament(
    tournamentId: string,
    templateId: string,
    isAddon: boolean = true,
    addonLimitOption?: number
  ) {
    const addonFee = 300;
    const addonStack = 1000;
    const templateName = 'テストトーナメント';

    const snapshot: Record<string, unknown> = {
      name: templateName,
      entryFee: 1000,
      startStack: 10000,
      isAddon,
      addonFee: isAddon ? addonFee : null,
      addonStack: isAddon ? addonStack : null,
    };
    if (addonLimitOption !== undefined) {
      snapshot.addonLimitPerPlayer = addonLimitOption;
    }

    // scheduledTournaments/{tournamentId} を作成
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      templateId,
      status: 'scheduled',
      startAt: admin.firestore.Timestamp.fromDate(new Date('2025-11-20T10:00:00Z')),
      snapshot,
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
        entries: 2,
        reentries: 0,
        playersBusted: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  /** bills/{bill}/tournaments/{templateId}.addonCount のみ事前シードする */
  async function seedAddonCountOnBillTournament(billId: string, templateId: string, addonCount: number) {
    await db
      .collection('bills')
      .doc(billId)
      .collection('tournaments')
      .doc(templateId)
      .set({addonCount}, {merge: true});
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

      const adminId = 'admin_test_addon_001';
      await createAdminDevice(adminId);

      // addon を呼び出す
      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: 'op_addon_001',
          tournamentId,
          userId,
          pokerName,
        },
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
      expect(viewsMainData.avgStack).toBe(10500);
    });
  });

  describe('error handling', () => {
    it('activeStays/{userId} が存在しない場合、エラーが返ること', async () => {
      const tournamentId = 'tournament_test_addon_002';
      const templateId = 'template_001';
      const userId = 'user_not_exists';
      const pokerName = 'テスト太郎';

      await setupTournament(tournamentId, templateId, true);

      const adminId = 'admin_test_addon_002';
      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: 'op_addon_002',
          tournamentId,
          userId,
          pokerName,
        },
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

      const adminId = 'admin_test_addon_003';
      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: 'op_addon_003',
          tournamentId,
          userId,
          pokerName,
        },
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

      const adminId = 'admin_test_addon_004';
      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          operationId: 'op_addon_004',
          tournamentId,
          userId,
          pokerName,
        },
      } as any;

      const result = await (addon as any).run(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('このトーナメントではAddonができません');
    });
  });

  describe('Phase 3B: addonLimitPerPlayer', () => {
    it('addonLimit が 2・addonCount 0 のとき成功すること', async () => {
      const tournamentId = 'tournament_addon_p3b_01';
      const templateId = 'template_addon_p3b';
      const userId = 'user_addon_p3b_01';
      const billId = 'bill_addon_p3b_01';
      const pokerName = 'P3b太郎';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName,
        idempotencyKey: 'idem_p3b_01',
      });
      await setupTournament(tournamentId, templateId, true, 2);

      const adminId = 'admin_addon_p3b_01';
      await createAdminDevice(adminId);

      const result = await (addon as any).run({
        auth: { uid: adminId },
        data: {
          operationId: 'op_p3b_01',
          tournamentId,
          userId,
          pokerName,
        },
      } as any);

      expect(result.success).toBe(true);
      const tdoc = await db.collection('bills').doc(billId).collection('tournaments').doc(templateId).get();
      expect(tdoc.data()?.addonCount).toBe(1);
    });

    it('addonLimit が 2・addonCount 1 のとき成功すること', async () => {
      const tournamentId = 'tournament_addon_p3b_02';
      const templateId = 'template_addon_p3b';
      const userId = 'user_addon_p3b_02';
      const billId = 'bill_addon_p3b_02';
      const pokerName = 'P3b次郎';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName,
        idempotencyKey: 'idem_p3b_02',
      });
      await setupTournament(tournamentId, templateId, true, 2);
      await seedAddonCountOnBillTournament(billId, templateId, 1);

      const adminId = 'admin_addon_p3b_02';
      await createAdminDevice(adminId);

      const result = await (addon as any).run({
        auth: { uid: adminId },
        data: {
          operationId: 'op_p3b_02',
          tournamentId,
          userId,
          pokerName,
        },
      } as any);

      expect(result.success).toBe(true);
      const tdoc = await db.collection('bills').doc(billId).collection('tournaments').doc(templateId).get();
      expect(tdoc.data()?.addonCount).toBe(2);
    });

    it('addonLimit が 2・addonCount 2 のとき拒否すること', async () => {
      const tournamentId = 'tournament_addon_p3b_03';
      const templateId = 'template_addon_p3b';
      const userId = 'user_addon_p3b_03';
      const billId = 'bill_addon_p3b_03';
      const pokerName = 'P3b三郎';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName,
        idempotencyKey: 'idem_p3b_03',
      });
      await setupTournament(tournamentId, templateId, true, 2);
      await seedAddonCountOnBillTournament(billId, templateId, 2);

      const adminId = 'admin_addon_p3b_03';
      await createAdminDevice(adminId);

      const result = await (addon as any).run({
        auth: { uid: adminId },
        data: {
          operationId: 'op_p3b_03',
          tournamentId,
          userId,
          pokerName,
        },
      } as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Addon上限に達しています');
    });

    it('addonLimit が未設定で isAddon true のとき上限1として2回目を拒否すること', async () => {
      const tournamentId = 'tournament_addon_p3b_04';
      const templateId = 'template_addon_p3b';
      const userId = 'user_addon_p3b_04';
      const billId = 'bill_addon_p3b_04';
      const pokerName = 'P3b四郎';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName,
        idempotencyKey: 'idem_p3b_04',
      });
      await setupTournament(tournamentId, templateId, true);
      await seedAddonCountOnBillTournament(billId, templateId, 1);

      const adminId = 'admin_addon_p3b_04';
      await createAdminDevice(adminId);

      const result = await (addon as any).run({
        auth: { uid: adminId },
        data: {
          operationId: 'op_p3b_04',
          tournamentId,
          userId,
          pokerName,
        },
      } as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Addon上限に達しています');
    });
  });
});

