/**
 * recordTournamentAction の統合テスト
 * 
 * ChangeSpec P1-05 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path (entry, reentry, addon)
 * - invalid-argument (billId, templateId, action, idempotencyKey が未指定)
 * - not-found (billId が存在しない)
 * - failed-precondition (status == "settled" で更新不可、requestHash mismatch)
 * - 強い冪等性（idempotencyKey の再利用、requestHash 一致時は reused: true）
 * - DualWrite ON/OFF
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { recordTournamentAction } from '../../../src/domains/bills/repos/recordTournamentAction';

describe('recordTournamentAction', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-record-tournament-action';

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
    // テスト前に環境変数をクリア
    delete process.env.WRITE_TODAYS_BILLS_IN_PARALLEL;
  });

  // テスト用のヘルパ関数: 伝票を作成
  async function createTestBill(billId: string, userId: string, status: string = 'open') {
    const billData: any = {
      businessDate: '2025-11-15',
      status,
      party: {
        userId,
        pokerName: 'テスト太郎',
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      meta: {
        schemaVersion: '1.3',
      },
    };
    
    await db.collection('bills').doc(billId).set(billData);
  }

  describe('happy path', () => {
    it('正常にentryを記録できること', async () => {
      const billId = 'bill_test_entry_001';
      const userId = 'user_test_entry_001';
      const templateId = 'template_001';
      const templateName = 'テストトーナメント';
      const entryFeeIncl = 1000;
      const idempotencyKey = 'idemp_entry_001';

      await createTestBill(billId, userId, 'open');

      const startAt = admin.firestore.Timestamp.fromDate(new Date('2025-11-20T10:00:00Z'));

      const result = await recordTournamentAction({
        billId,
        templateId,
        action: 'entry',
        templateName,
        entryFeeIncl,
        reentryFeeIncl: null,
        addonFeeIncl: null,
        startAt,
        idempotencyKey,
      });

      expect(result.success).toBe(true);
      expect(result.billId).toBe(billId);
      expect(result.templateId).toBe(templateId);
      expect(result.action).toBe('entry');
      expect(result.entryCount).toBe(1);
      expect(result.reentryCount).toBe(0);
      expect(result.addonCount).toBe(0);
      expect(result.registeredAt).toBeDefined();
      expect(result.lastReentryAt).toBeNull();
      expect(result.lastAddonAt).toBeNull();

      // /bills/{billId}/tournaments/{templateId} が作成されている
      const tournamentRef = db.collection('bills').doc(billId).collection('tournaments').doc(templateId);
      const tournamentDoc = await tournamentRef.get();
      expect(tournamentDoc.exists).toBe(true);

      const tournamentData = tournamentDoc.data()!;
      expect(tournamentData.templateId).toBe(templateId);
      expect(tournamentData.templateName).toBe(templateName);
      expect(tournamentData.entryFeeIncl).toBe(entryFeeIncl);
      expect(tournamentData.entryCount).toBe(1);
      expect(tournamentData.reentryCount).toBe(0);
      expect(tournamentData.addonCount).toBe(0);
      expect(tournamentData.registeredAt).toBeDefined();
      expect(tournamentData.startAt).toBeDefined();

      // /bills/{billId}/idempotency/{idempotencyKey} が作成されている
      const idempotencyRef = db.collection('bills').doc(billId).collection('idempotency').doc(idempotencyKey);
      const idempotencyDoc = await idempotencyRef.get();
      expect(idempotencyDoc.exists).toBe(true);
    });

    it('正常にreentryを記録できること', async () => {
      const billId = 'bill_test_reentry_001';
      const userId = 'user_test_reentry_001';
      const templateId = 'template_001';
      const templateName = 'テストトーナメント';
      const entryFeeIncl = 1000;
      const reentryFeeIncl = 500;
      const idempotencyKeyEntry = 'idemp_entry_001';
      const idempotencyKeyReentry = 'idemp_reentry_001';

      await createTestBill(billId, userId, 'open');

      const startAt = admin.firestore.Timestamp.fromDate(new Date('2025-11-20T10:00:00Z'));

      // まずentryを記録
      await recordTournamentAction({
        billId,
        templateId,
        action: 'entry',
        templateName,
        entryFeeIncl,
        reentryFeeIncl: null,
        addonFeeIncl: null,
        startAt,
        idempotencyKey: idempotencyKeyEntry,
      });

      // 次にreentryを記録
      const result = await recordTournamentAction({
        billId,
        templateId,
        action: 'reentry',
        templateName,
        entryFeeIncl,
        reentryFeeIncl,
        addonFeeIncl: null,
        startAt,
        idempotencyKey: idempotencyKeyReentry,
      });

      expect(result.success).toBe(true);
      expect(result.entryCount).toBe(1);
      expect(result.reentryCount).toBe(1);
      expect(result.addonCount).toBe(0);
      expect(result.lastReentryAt).toBeDefined();

      // /bills/{billId}/tournaments/{templateId} が更新されている
      const tournamentRef = db.collection('bills').doc(billId).collection('tournaments').doc(templateId);
      const tournamentDoc = await tournamentRef.get();
      expect(tournamentDoc.exists).toBe(true);

      const tournamentData = tournamentDoc.data()!;
      expect(tournamentData.entryCount).toBe(1);
      expect(tournamentData.reentryCount).toBe(1);
      expect(tournamentData.addonCount).toBe(0);
      expect(tournamentData.lastReentryAt).toBeDefined();
    });

    it('正常にaddonを記録できること', async () => {
      const billId = 'bill_test_addon_001';
      const userId = 'user_test_addon_001';
      const templateId = 'template_001';
      const templateName = 'テストトーナメント';
      const entryFeeIncl = 1000;
      const addonFeeIncl = 300;
      const idempotencyKeyEntry = 'idemp_entry_001';
      const idempotencyKeyAddon = 'idemp_addon_001';

      await createTestBill(billId, userId, 'open');

      const startAt = admin.firestore.Timestamp.fromDate(new Date('2025-11-20T10:00:00Z'));

      // まずentryを記録
      await recordTournamentAction({
        billId,
        templateId,
        action: 'entry',
        templateName,
        entryFeeIncl,
        reentryFeeIncl: null,
        addonFeeIncl: null,
        startAt,
        idempotencyKey: idempotencyKeyEntry,
      });

      // 次にaddonを記録
      const result = await recordTournamentAction({
        billId,
        templateId,
        action: 'addon',
        templateName,
        entryFeeIncl,
        reentryFeeIncl: null,
        addonFeeIncl,
        startAt,
        idempotencyKey: idempotencyKeyAddon,
      });

      expect(result.success).toBe(true);
      expect(result.entryCount).toBe(1);
      expect(result.reentryCount).toBe(0);
      expect(result.addonCount).toBe(1);
      expect(result.lastAddonAt).toBeDefined();

      // /bills/{billId}/tournaments/{templateId} が更新されている
      const tournamentRef = db.collection('bills').doc(billId).collection('tournaments').doc(templateId);
      const tournamentDoc = await tournamentRef.get();
      expect(tournamentDoc.exists).toBe(true);

      const tournamentData = tournamentDoc.data()!;
      expect(tournamentData.entryCount).toBe(1);
      expect(tournamentData.reentryCount).toBe(0);
      expect(tournamentData.addonCount).toBe(1);
      expect(tournamentData.lastAddonAt).toBeDefined();
    });
  });

  describe('invalid-argument', () => {
    it('billIdが未指定の場合、エラーを返すこと', async () => {
      await expect(
        recordTournamentAction({
          billId: '',
          templateId: 'template_001',
          action: 'entry',
          templateName: 'テストトーナメント',
          entryFeeIncl: 1000,
          reentryFeeIncl: null,
          addonFeeIncl: null,
          startAt: null,
          idempotencyKey: 'idemp_001',
        })
      ).rejects.toThrow('billId, templateId, action, idempotencyKey are required');
    });

    it('templateIdが未指定の場合、エラーを返すこと', async () => {
      await expect(
        recordTournamentAction({
          billId: 'bill_001',
          templateId: '',
          action: 'entry',
          templateName: 'テストトーナメント',
          entryFeeIncl: 1000,
          reentryFeeIncl: null,
          addonFeeIncl: null,
          startAt: null,
          idempotencyKey: 'idemp_001',
        })
      ).rejects.toThrow('billId, templateId, action, idempotencyKey are required');
    });

    it('actionが不正な場合、エラーを返すこと', async () => {
      await expect(
        recordTournamentAction({
          billId: 'bill_001',
          templateId: 'template_001',
          action: 'invalid' as any,
          templateName: 'テストトーナメント',
          entryFeeIncl: 1000,
          reentryFeeIncl: null,
          addonFeeIncl: null,
          startAt: null,
          idempotencyKey: 'idemp_001',
        })
      ).rejects.toThrow("action must be 'entry', 'reentry', or 'addon'");
    });
  });

  describe('not-found', () => {
    it('billIdが存在しない場合、エラーを返すこと', async () => {
      await expect(
        recordTournamentAction({
          billId: 'bill_not_found',
          templateId: 'template_001',
          action: 'entry',
          templateName: 'テストトーナメント',
          entryFeeIncl: 1000,
          reentryFeeIncl: null,
          addonFeeIncl: null,
          startAt: null,
          idempotencyKey: 'idemp_001',
        })
      ).rejects.toThrow('Bill not found: bill_not_found');
    });
  });

  describe('failed-precondition', () => {
    it('statusがsettledの場合、エラーを返すこと', async () => {
      const billId = 'bill_test_settled_001';
      const userId = 'user_test_settled_001';

      await createTestBill(billId, userId, 'settled');

      await expect(
        recordTournamentAction({
          billId,
          templateId: 'template_001',
          action: 'entry',
          templateName: 'テストトーナメント',
          entryFeeIncl: 1000,
          reentryFeeIncl: null,
          addonFeeIncl: null,
          startAt: null,
          idempotencyKey: 'idemp_001',
        })
      ).rejects.toThrow('Cannot record tournament action for bill with status: settled');
    });

    it('requestHashが不一致の場合、エラーを返すこと', async () => {
      const billId = 'bill_test_hash_mismatch_001';
      const userId = 'user_test_hash_mismatch_001';
      const templateId = 'template_001';
      const idempotencyKey = 'idemp_hash_mismatch_001';

      await createTestBill(billId, userId, 'open');

      // 1回目: entryFeeIncl = 1000 で記録
      await recordTournamentAction({
        billId,
        templateId,
        action: 'entry',
        templateName: 'テストトーナメント',
        entryFeeIncl: 1000,
        reentryFeeIncl: null,
        addonFeeIncl: null,
        startAt: null,
        idempotencyKey,
      });

      // 2回目: 同じidempotencyKeyで異なるentryFeeInclを指定
      await expect(
        recordTournamentAction({
          billId,
          templateId,
          action: 'entry',
          templateName: 'テストトーナメント',
          entryFeeIncl: 2000, // 異なる値
          reentryFeeIncl: null,
          addonFeeIncl: null,
          startAt: null,
          idempotencyKey, // 同じidempotencyKey
        })
      ).rejects.toThrow('idempotency requestHash mismatch');
    });
  });

  describe('idempotency', () => {
    it('同じidempotencyKeyで同じpayloadを2回送信した場合、2回目はreused: trueを返すこと', async () => {
      const billId = 'bill_test_idempotency_001';
      const userId = 'user_test_idempotency_001';
      const templateId = 'template_001';
      const idempotencyKey = 'idemp_idempotency_001';

      await createTestBill(billId, userId, 'open');

      const startAt = admin.firestore.Timestamp.fromDate(new Date('2025-11-20T10:00:00Z'));

      // 1回目の実行前の updatedAt を取得
      const billRef = db.collection('bills').doc(billId);
      const billDocBefore = await billRef.get();
      const updatedAtBefore = billDocBefore.data()!.updatedAt;

      // 1回目
      const result1 = await recordTournamentAction({
        billId,
        templateId,
        action: 'entry',
        templateName: 'テストトーナメント',
        entryFeeIncl: 1000,
        reentryFeeIncl: null,
        addonFeeIncl: null,
        startAt,
        idempotencyKey,
      });

      expect(result1.success).toBe(true);
      expect(result1.diagnostics?.reused).toBeUndefined();

      // 1回目の実行後の updatedAt を取得
      const billDocAfter1 = await billRef.get();
      const updatedAtAfter1 = billDocAfter1.data()!.updatedAt;
      expect(updatedAtAfter1).not.toEqual(updatedAtBefore); // 1回目は更新される

      // 2回目: 同じidempotencyKeyとpayload
      const result2 = await recordTournamentAction({
        billId,
        templateId,
        action: 'entry',
        templateName: 'テストトーナメント',
        entryFeeIncl: 1000,
        reentryFeeIncl: null,
        addonFeeIncl: null,
        startAt,
        idempotencyKey,
      });

      expect(result2.success).toBe(true);
      expect(result2.diagnostics?.reused).toBe(true);
      expect(result2.diagnostics?.reason).toBe('idempotent replay');

      // 2回目の実行後の updatedAt を取得
      const billDocAfter2 = await billRef.get();
      const updatedAtAfter2 = billDocAfter2.data()!.updatedAt;
      
      // /bills/{billId}.updatedAt が1回目と同じ値のまま（更新されない）
      expect(updatedAtAfter2).toEqual(updatedAtAfter1);

      // /bills/{billId}/tournaments/{templateId} は1つだけ存在する
      const tournamentRef = db.collection('bills').doc(billId).collection('tournaments').doc(templateId);
      const tournamentDoc = await tournamentRef.get();
      expect(tournamentDoc.exists).toBe(true);

      const tournamentData = tournamentDoc.data()!;
      expect(tournamentData.entryCount).toBe(1); // 2回目はカウントされない
    });

    it('同じidempotencyKeyで同じpayloadを2回送信した場合、DualWriteが有効でもtodaysBills.tournaments[templateId]が余計に更新されないこと', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'true';

      const billId = 'bill_test_idempotency_dualwrite_001';
      const userId = 'user_test_idempotency_dualwrite_001';
      const templateId = 'template_001';
      const idempotencyKey = 'idemp_idempotency_dualwrite_001';

      await createTestBill(billId, userId, 'open');

      // todaysBillsのスケルトンを作成
      await db.collection('todaysBills').doc(billId).set({
        status: 'open',
        userId,
        pokerName: 'テスト太郎',
        items: [],
        sideGameChip: [],
        tournaments: {},
      });

      const startAt = admin.firestore.Timestamp.fromDate(new Date('2025-11-20T10:00:00Z'));

      // 1回目
      await recordTournamentAction({
        billId,
        templateId,
        action: 'entry',
        templateName: 'テストトーナメント',
        entryFeeIncl: 1000,
        reentryFeeIncl: null,
        addonFeeIncl: null,
        startAt,
        idempotencyKey,
      });

      // 1回目の実行後の todaysBills.tournaments[templateId] を取得
      await new Promise(resolve => setTimeout(resolve, 100)); // DualWriteの完了を待つ
      const todaysBillsRef = db.collection('todaysBills').doc(billId);
      const todaysBillsDocAfter1 = await todaysBillsRef.get();
      const todaysBillsDataAfter1 = todaysBillsDocAfter1.data()!;
      const tournamentsAfter1 = todaysBillsDataAfter1.tournaments || {};
      const tournamentInfoAfter1 = tournamentsAfter1[templateId];
      expect(tournamentInfoAfter1).toBeDefined();
      expect(tournamentInfoAfter1.entryCount).toBe(1);
      
      // 1回目の updatedAt を取得（todaysBills の updatedAt）
      const updatedAtAfter1 = todaysBillsDataAfter1.updatedAt;

      // 2回目: 同じidempotencyKeyとpayload
      await recordTournamentAction({
        billId,
        templateId,
        action: 'entry',
        templateName: 'テストトーナメント',
        entryFeeIncl: 1000,
        reentryFeeIncl: null,
        addonFeeIncl: null,
        startAt,
        idempotencyKey,
      });

      // 2回目の実行後の todaysBills.tournaments[templateId] を取得
      await new Promise(resolve => setTimeout(resolve, 100)); // DualWriteの完了を待つ
      const todaysBillsDocAfter2 = await todaysBillsRef.get();
      const todaysBillsDataAfter2 = todaysBillsDocAfter2.data()!;
      const tournamentsAfter2 = todaysBillsDataAfter2.tournaments || {};
      const tournamentInfoAfter2 = tournamentsAfter2[templateId];
      
      // todaysBills.tournaments[templateId] が余計に更新されていない（完全 no-op）
      expect(tournamentInfoAfter2).toBeDefined();
      expect(tournamentInfoAfter2.entryCount).toBe(1); // 2回目はカウントされない
      
      // todaysBills の updatedAt が更新されていない（DualWriteが実行されていない）
      const updatedAtAfter2 = todaysBillsDataAfter2.updatedAt;
      expect(updatedAtAfter2).toEqual(updatedAtAfter1);
    });
  });

  describe('DualWrite', () => {
    it('WRITE_TODAYS_BILLS_IN_PARALLEL=trueの場合、todaysBills.tournamentsに複写されること', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'true';

      const billId = 'bill_test_dualwrite_001';
      const userId = 'user_test_dualwrite_001';
      const templateId = 'template_001';
      const templateName = 'テストトーナメント';
      const entryFeeIncl = 1000;
      const idempotencyKey = 'idemp_dualwrite_001';

      await createTestBill(billId, userId, 'open');

      // todaysBillsのスケルトンを作成
      await db.collection('todaysBills').doc(billId).set({
        status: 'open',
        userId,
        pokerName: 'テスト太郎',
        items: [],
        sideGameChip: [],
        tournaments: {},
      });

      const startAt = admin.firestore.Timestamp.fromDate(new Date('2025-11-20T10:00:00Z'));

      await recordTournamentAction({
        billId,
        templateId,
        action: 'entry',
        templateName,
        entryFeeIncl,
        reentryFeeIncl: null,
        addonFeeIncl: null,
        startAt,
        idempotencyKey,
      });

      // todaysBills.tournaments に複写されている
      const todaysBillsRef = db.collection('todaysBills').doc(billId);
      const todaysBillsDoc = await todaysBillsRef.get();
      expect(todaysBillsDoc.exists).toBe(true);

      const todaysBillsData = todaysBillsDoc.data()!;
      const tournaments = todaysBillsData.tournaments || {};
      expect(tournaments[templateId]).toBeDefined();

      const tournamentInfo = tournaments[templateId];
      expect(tournamentInfo.templateId).toBe(templateId);
      expect(tournamentInfo.templateName).toBe(templateName);
      expect(tournamentInfo.entryFee).toBe(entryFeeIncl); // entryFeeIncl → entryFee
      expect(tournamentInfo.entryCount).toBe(1);
      expect(tournamentInfo.registeredAt).toBeDefined();
    });

    it('WRITE_TODAYS_BILLS_IN_PARALLEL=falseの場合、todaysBills.tournamentsに複写されないこと', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'false';

      const billId = 'bill_test_dualwrite_off_001';
      const userId = 'user_test_dualwrite_off_001';
      const templateId = 'template_001';
      const idempotencyKey = 'idemp_dualwrite_off_001';

      await createTestBill(billId, userId, 'open');

      // todaysBillsのスケルトンを作成
      await db.collection('todaysBills').doc(billId).set({
        status: 'open',
        userId,
        pokerName: 'テスト太郎',
        items: [],
        sideGameChip: [],
        tournaments: {},
      });

      await recordTournamentAction({
        billId,
        templateId,
        action: 'entry',
        templateName: 'テストトーナメント',
        entryFeeIncl: 1000,
        reentryFeeIncl: null,
        addonFeeIncl: null,
        startAt: null,
        idempotencyKey,
      });

      // todaysBills.tournaments に複写されていない
      const todaysBillsRef = db.collection('todaysBills').doc(billId);
      const todaysBillsDoc = await todaysBillsRef.get();
      expect(todaysBillsDoc.exists).toBe(true);

      const todaysBillsData = todaysBillsDoc.data()!;
      const tournaments = todaysBillsData.tournaments || {};
      expect(tournaments[templateId]).toBeUndefined();
    });
  });
});

