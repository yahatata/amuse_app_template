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
import { bulkAddon } from '../../src/domains/tournament_activeTournament/callables/bulkAddon';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';

describe('bulkAddon', () => {
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
      isAddon,
      addonFee: isAddon ? addonFee : null,
      addonStack: isAddon ? addonStack : null,
    };
    if (addonLimitOption !== undefined) {
      snapshot.addonLimitPerPlayer = addonLimitOption;
    }

    await db.collection('scheduledTournaments').doc(tournamentId).set({
      templateId,
      status: 'scheduled',
      startAt: admin.firestore.Timestamp.fromDate(new Date('2025-11-20T10:00:00Z')),
      snapshot,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

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

  async function seedAddonCountOnBillTournament(billId: string, templateId: string, addonCount: number) {
    await db
      .collection('bills')
      .doc(billId)
      .collection('tournaments')
      .doc(templateId)
      .set({addonCount}, {merge: true});
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

      const adminId = 'admin_test_bulk_addon_001';
      await createAdminDevice(adminId);

      // bulkAddon を呼び出す
      const mockRequest = {
        auth: { uid: adminId },
        data: {
          tournamentId,
          users: users.map(u => ({ userId: u.userId, pokerName: u.pokerName })),
        },
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

      const adminId = 'admin_test_bulk_addon_002';
      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          tournamentId,
          users: users.map(u => ({ userId: u.userId, pokerName: u.pokerName })),
        },
      } as any;

      const result = await (bulkAddon as any).run(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('activeStaysドキュメントが見つからないか、billIdが設定されていません');
    });

    it('全員が Addon 上限に達しているときエラーとなること（Phase 3B）', async () => {
      const tournamentId = 'tournament_bulk_p3b_all';
      const templateId = 'template_bulk_p3b';
      const users = [
        { userId: 'user_bulk_all_a', billId: 'bill_bulk_all_a', pokerName: 'A' },
        { userId: 'user_bulk_all_b', billId: 'bill_bulk_all_b', pokerName: 'B' },
      ];

      for (const user of users) {
        await createBillWithActiveStay({
          billId: user.billId,
          userId: user.userId,
          pokerName: user.pokerName,
          idempotencyKey: `idem_bulk_${user.userId}`,
        });
        await seedAddonCountOnBillTournament(user.billId, templateId, 2);
      }

      await setupTournament(tournamentId, templateId, true, 2);

      const adminId = 'admin_bulk_p3b_all';
      await createAdminDevice(adminId);

      const result = await (bulkAddon as any).run({
        auth: { uid: adminId },
        data: {
          tournamentId,
          users: users.map((u) => ({ userId: u.userId, pokerName: u.pokerName })),
        },
      } as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('全員が Addon 上限に達しています');
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
      const { recordTournamentAction } = await import('../../src/domains/bills/repos/recordTournamentAction');
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

      const adminId = 'admin_test_bulk_addon_003';
      await createAdminDevice(adminId);

      const mockRequest = {
        auth: { uid: adminId },
        data: {
          tournamentId,
          users: users.map(u => ({ userId: u.userId, pokerName: u.pokerName })),
        },
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

    it('addonLimit が 2 のとき上限到達のみ skip すること（Phase 3B）', async () => {
      const tournamentId = 'tournament_bulk_p3b_skip';
      const templateId = 'template_bulk_limit2';
      const users = [
        { userId: 'user_bulk_skip_a', billId: 'bill_bulk_skip_a', pokerName: 'SkipA' },
        { userId: 'user_bulk_skip_b', billId: 'bill_bulk_skip_b', pokerName: 'SkipB' },
      ];

      for (const user of users) {
        await createBillWithActiveStay({
          billId: user.billId,
          userId: user.userId,
          pokerName: user.pokerName,
          idempotencyKey: `idem_skip_${user.userId}`,
        });
      }

      await setupTournament(tournamentId, templateId, true, 2);
      await seedAddonCountOnBillTournament(users[0].billId, templateId, 2);
      // user 2 は 0 のまま

      const adminId = 'admin_bulk_p3b_skip';
      await createAdminDevice(adminId);

      const result = await (bulkAddon as any).run({
        auth: { uid: adminId },
        data: {
          tournamentId,
          users: users.map((u) => ({ userId: u.userId, pokerName: u.pokerName })),
        },
      } as any);

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(1);

      const t1 = await db
        .collection('bills')
        .doc(users[0].billId)
        .collection('tournaments')
        .doc(templateId)
        .get();
      expect(t1.data()?.addonCount).toBe(2);

      const t2 = await db
        .collection('bills')
        .doc(users[1].billId)
        .collection('tournaments')
        .doc(templateId)
        .get();
      expect(t2.data()?.addonCount).toBe(1);
    });

    it('isAddon が false のとき TOURNAMENT_ADDON_NOT_ALLOWED 相当で失敗すること', async () => {
      const tournamentId = 'tournament_bulk_addon_off';
      const templateId = 'template_addon_off';
      const users = [
        { userId: 'user_bulk_off', billId: 'bill_bulk_off', pokerName: 'Offユーザー' },
      ];

      await createBillWithActiveStay({
        billId: users[0].billId,
        userId: users[0].userId,
        pokerName: users[0].pokerName,
        idempotencyKey: 'idem_bulk_off',
      });
      await setupTournament(tournamentId, templateId, false);

      const adminId = 'admin_bulk_off';
      await createAdminDevice(adminId);

      const result = await (bulkAddon as any).run({
        auth: { uid: adminId },
        data: {
          tournamentId,
          users: [{ userId: users[0].userId, pokerName: users[0].pokerName }],
        },
      } as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('このトーナメントではAddonができません');
    });

    it('通常着席ユーザー + seated/unlinked 置きバケを1回の bulkAddon で処理できる', async () => {
      const tournamentId = 'tournament_bulk_with_okibake_001';
      const templateId = 'template_bulk_with_okibake_001';
      const operationId = 'op_bulk_with_okibake_001';
      const normal = {
        userId: 'user_bulk_with_okibake_001',
        billId: 'bill_bulk_with_okibake_001',
        pokerName: '通常ユーザー1',
      };
      const okibakeEntryId = 'okibake_bulk_with_001';

      await createBillWithActiveStay({
        billId: normal.billId,
        userId: normal.userId,
        pokerName: normal.pokerName,
        idempotencyKey: 'idem_bulk_with_okibake_001',
      });
      await setupTournament(tournamentId, templateId, true, 2);
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc(okibakeEntryId)
        .set({
          okibakeEntryId,
          tournamentId,
          temporaryDisplayName: '置きバケA',
          entryStatus: 'seated',
          billLinkStatus: 'unlinked',
          okibakeAddonCount: 0,
          okibakeAddonRecords: [],
          assignedTableId: 'tableA',
          assignedSeatKey: 'seat01',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      const adminId = 'admin_bulk_with_okibake_001';
      await createAdminDevice(adminId);

      const result = await (bulkAddon as any).run({
        auth: { uid: adminId },
        data: {
          tournamentId,
          operationId,
          tableId: 'tableA',
          normalUsers: [{ userId: normal.userId, pokerName: normal.pokerName }],
          okibakeEntries: [{ okibakeEntryId, pokerName: '置きバケA' }],
        },
      } as any);

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(2);
      expect(result.processedNormalCount).toBe(1);
      expect(result.processedOkibakeCount).toBe(1);

      const billTournamentDoc = await db
        .collection('bills')
        .doc(normal.billId)
        .collection('tournaments')
        .doc(templateId)
        .get();
      expect(billTournamentDoc.exists).toBe(true);
      expect(billTournamentDoc.data()?.addonCount).toBe(1);

      const okibakeDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc(okibakeEntryId)
        .get();
      expect(okibakeDoc.data()?.okibakeAddonCount).toBe(1);
      expect((okibakeDoc.data()?.okibakeAddonRecords ?? []).length).toBe(1);

      const viewsMainDoc = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .get();
      expect(viewsMainDoc.data()?.addons).toBe(2);

      const opLogDoc = await db.collection('operationLogs').doc(operationId).get();
      expect(opLogDoc.exists).toBe(true);
      const payload = (opLogDoc.data()?.payload ?? {}) as Record<string, unknown>;
      expect(((payload.normalTargets as unknown[]) ?? []).length).toBe(1);
      expect(((payload.okibakeTargets as unknown[]) ?? []).length).toBe(1);
    });
  });
});
