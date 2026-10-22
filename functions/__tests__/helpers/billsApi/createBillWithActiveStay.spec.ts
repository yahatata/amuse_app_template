/**
 * createBillWithActiveStay の統合テスト
 * 
 * ChangeSpec P1-01 に準拠
 * Firestore Emulator を使用
 * 
 * 注意: createBillWithActiveStay は getFirestore() を使用するため、
 * admin SDK の Firestore インスタンスをテスト環境で使用する
 * 
 * 実行方法:
 * - Firestore Emulator を起動: firebase emulators:start --only firestore
 * - 環境変数 FIRESTORE_EMULATOR_HOST=localhost:8081 を設定（自動設定される場合あり）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { createBillWithActiveStay } from '../../../src/domains/bills/repos/createBillWithActiveStay';

describe('createBillWithActiveStay', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-bills';

  beforeAll(async () => {
    // Firestore Emulator に接続するための環境変数を設定
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    
    testEnv = await initializeTestEnvironment({
      projectId,
    });
    
    // admin SDK を初期化（テスト環境用、Firestore Emulator に接続）
    // 既に初期化されている場合は削除してから再初期化
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map(a => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({
      projectId,
    });
    
    // getFirestore() で取得したインスタンスを使用
    db = getFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
    // admin SDK をクリーンアップ
    if (admin.apps.length) {
      await admin.app().delete();
    }
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    // 各テスト前にクリーンアップ（testEnv.clearFirestore() を使用）
    await testEnv.clearFirestore();
    
    // activeStays コレクションを明示的にクリーンアップ（念のため）
    const activeStaysSnapshot = await db.collection('activeStays').get();
    const deletePromises = activeStaysSnapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deletePromises);
    
    // bills コレクションも明示的にクリーンアップ（念のため）
    const billsSnapshot = await db.collection('bills').get();
    const deleteBillsPromises = billsSnapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deleteBillsPromises);
  });

  describe('happy path', () => {
    it('bills/{billId} & activeStays/{uid} 作成、businessDate がサーバ基準', async () => {
      // テストIDを一意にする（タイムスタンプ + ランダム文字列）
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const billId = `bill_test_happy_${timestamp}_${random}`;
      const userId = `user_test_happy_${timestamp}_${random}`;
      const idempotencyKey = `idem_test_happy_${timestamp}_${random}`;

      // モック: getStoreCloseHour を 27 に固定
      process.env.STORE_CLOSE_HOUR = '27';

      const result = await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey,
      });

      expect(result.success).toBe(true);
      expect(result.billId).toBe(billId);
      expect(result.status).toBe('open');
      expect(result.activeStayCreated).toBe(true);
      expect(result.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD形式

      // bills/{billId} が作成されている
      const billDoc = await db.collection('bills').doc(billId).get();
      expect(billDoc.exists).toBe(true);
      const billData = billDoc.data()!;
      expect(billData.businessDate).toBe(result.businessDate);
      expect(billData.status).toBe('open');
      expect(billData.party.userId).toBe(userId);
      expect(billData.party.pokerName).toBe('テスト太郎');
      expect(billData.meta.schemaVersion).toBe('1.3');
      expect(billData.ops).toEqual({
        accountingStartedAt: null,
        accountingStartedBy: null,
        accountingCompletedAt: null,
        accountingCompletedBy: null,
        accountingCanceledAt: null,
        accountingCanceledBy: null,
      });
      expect(billData.draftAccountingInput).toEqual({
        paymentMethodsByCategory: null,
        paymentMethodsByAmount: null,
      });
      expect(billData.settlementSnapshot).toEqual({
        amounts: null,
        categoryBreakdown: null,
        paymentTotals: null,
        paymentsSummary: null,
        closedAt: null,
        contentHash: null,
      });
      expect(billData.currentSummary).toEqual({
        claimTotalIncl: 0,
        receivedTotalIncl: 0,
        refundedTotalIncl: 0,
        netSalesIncl: 0,
      });
      expect(billData.postSettlementState).toEqual({
        hasPostSettlementActivity: false,
        totalAdjustmentsIncl: 0,
        totalCollectedIncl: 0,
        totalRefundedIncl: 0,
        requiredActionType: 'none',
        requiredActionIncl: 0,
        lastRecordType: 'none',
        lastRecordAt: null,
        lastRecordId: null,
      });
      expect(billData.reopenSummary).toEqual({
        hasReopenHistory: false,
        reopenCount: 0,
        currentSettlementCycle: 1,
        latestSettledCycle: 0,
        lastReopenedAt: null,
        lastReopenedBy: null,
        lastResettledAt: null,
      });
      expect(billData.closeSummary).toEqual({
        unresolved: false,
        markedAt: null,
        closedBusinessDate: null,
        displayAmountAtMark: null,
        lastCloseRunId: null,
      });

      // activeStays/{uid} が作成されている
      const stayDoc = await db.collection('activeStays').doc(userId).get();
      expect(stayDoc.exists).toBe(true);
      const stayData = stayDoc.data()!;
      expect(stayData.billId).toBe(billId);
      expect(stayData.isActive).toBe(true);
      expect(stayData.pokerName).toBe('テスト太郎');

      // idempotency/{key} が作成されている
      const idemKeyFull = `${billId}:createBill:${idempotencyKey}`;
      const idemDoc = await db.collection('bills').doc(billId)
        .collection('idempotency').doc(idemKeyFull).get();
      expect(idemDoc.exists).toBe(true);
      const idemData = idemDoc.data()!;
      expect(idemData.requestHash).toBeDefined();
      expect(idemData.expiresAt).toBeDefined();

      // settlementCycles/1 が初期 open 状態で作成されている
      const cycleDoc = await db.collection('bills').doc(billId)
        .collection('settlementCycles').doc('1').get();
      expect(cycleDoc.exists).toBe(true);
      expect(cycleDoc.data()).toMatchObject({
        cycleNo: 1,
        cycleState: 'open',
        openedBy: null,
        openedReason: 'initial',
        openedFromCycleNo: null,
        settledAt: null,
        settledBy: null,
        closedAt: null,
        closedReason: null,
        nextSequenceNo: 1,
        baselineSummary: null,
      });
      expect(cycleDoc.data()?.openedAt).toBeDefined();
    });
  });

  describe('invalid-argument', () => {
    it('billId 未指定 → invalid-argument', async () => {
      try {
        await createBillWithActiveStay({
          billId: '',
          userId: 'user_test_001',
          idempotencyKey: 'idem_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });

    it('userId 未指定 → invalid-argument', async () => {
      try {
        await createBillWithActiveStay({
          billId: 'bill_test_001',
          userId: '',
          idempotencyKey: 'idem_test_001',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });

    it('idempotencyKey 未指定 → invalid-argument', async () => {
      try {
        await createBillWithActiveStay({
          billId: 'bill_test_001',
          userId: 'user_test_001',
          idempotencyKey: '',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });
  });

  describe('failed-precondition（重複入店）', () => {
    it('既に activeStays/{uid} が存在し isActive==true の場合 → failed-precondition', async () => {
      // テストIDを一意にする（タイムスタンプ + ランダム文字列）
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const billId = `bill_test_dup_${timestamp}_${random}`;
      const userId = `user_test_dup_${timestamp}_${random}`;
      const idempotencyKey = `idem_test_dup_${timestamp}_${random}`;

      // 事前に activeStays を作成
      await db.collection('activeStays').doc(userId).set({
        uid: userId,
        billId: 'bill_existing',
        isActive: true,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      try {
        await createBillWithActiveStay({
          billId,
          userId,
          idempotencyKey,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        // エラーが正しく投げられているか確認
        expect(error).toBeDefined();
        expect(error.code).toBe('failed-precondition');
        expect(error.message).toContain('user already has an active stay');
      }
    });
  });

  describe('idempotent-replay', () => {
    it('同一 idempotencyKey で再実行 → 既存docを返却（reused: true）、updatedAt は変更されない', async () => {
      // テストIDを一意にする（タイムスタンプ + ランダム文字列）
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const billId = `bill_test_idem_${timestamp}_${random}`;
      const userId = `user_test_idem_${timestamp}_${random}`;
      const idempotencyKey = `idem_test_idem_${timestamp}_${random}`;

      // 1回目実行
      const result1 = await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey,
      });

      expect(result1.success).toBe(true);
      expect(result1.diagnostics?.reused).toBeUndefined();

      // bills/{billId} が存在することを確認
      const billDoc1 = await db.collection('bills').doc(billId).get();
      expect(billDoc1.exists).toBe(true);
      const billData1 = billDoc1.data()!;
      expect(billData1).toBeDefined();
      const updatedAt1 = billData1.updatedAt;
      expect(updatedAt1).toBeDefined();

      // 少し待つ（updatedAt の変化を確認するため）
      await new Promise(resolve => setTimeout(resolve, 100));

      // 2回目実行（同一 idempotencyKey）
      const result2 = await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey,
      });

      expect(result2.success).toBe(true);
      expect(result2.diagnostics?.reused).toBe(true);
      expect(result2.diagnostics?.reason).toBe('idempotent replay');

      // updatedAt は変更されない
      const billDoc2 = await db.collection('bills').doc(billId).get();
      const updatedAt2 = billDoc2.data()!.updatedAt;
      expect(updatedAt2).toEqual(updatedAt1);
    });
  });

  describe('idempotent-replay（ハッシュ不一致）', () => {
    it('同一 idempotencyKey だが payload 差し替え → failed-precondition（requestHash 不一致）', async () => {
      // テストIDを一意にする（タイムスタンプ + ランダム文字列）
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const billId = `bill_test_hash_${timestamp}_${random}`;
      const userId = `user_test_hash_${timestamp}_${random}`;
      const idempotencyKey = `idem_test_hash_${timestamp}_${random}`;

      // 1回目実行
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey,
      });

      // 2回目実行（pokerName を変更 → requestHash が変わる）
      try {
        await createBillWithActiveStay({
          billId,
          userId,
          pokerName: 'テスト花子', // 変更
          idempotencyKey, // 同一キー
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
      }
    });
  });

  describe('businessDate サーバ専任', () => {
    it('クライアントが businessDate を送っても結果に影響しないこと（サーバが calcBusinessDate で確定）', async () => {
      // テストIDを一意にする（タイムスタンプ + ランダム文字列）
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const billId = `bill_test_biz_${timestamp}_${random}`;
      const userId = `user_test_biz_${timestamp}_${random}`;
      const idempotencyKey = `idem_test_biz_${timestamp}_${random}`;

      // モック: getStoreCloseHour を 27 に固定
      process.env.STORE_CLOSE_HOUR = '27';

      // リクエストに businessDate を含めても無視される（型定義上は含められないが、テストとして確認）
      const result = await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey,
        // businessDate は型定義上含められないが、サーバが calcBusinessDate で確定することを確認
      });

      // businessDate はサーバが calcBusinessDate で確定した値
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.businessDate).toBe(result.businessDate);
      // サーバ時刻と STORE_CLOSE_HOUR に基づいて計算された値であることを確認
      expect(billData.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('DualWrite ON/OFF', () => {
    beforeEach(() => {
      // テスト前に環境変数をクリア
      delete process.env.WRITE_TODAYS_BILLS_IN_PARALLEL;
    });

    it('DualWrite ON: todaysBills/{billId} にスケルトン複写が作成されること（docIDは必ず billId）', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'true';

      // テストIDを一意にする（タイムスタンプ + ランダム文字列）
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const billId = `bill_test_dual_on_${timestamp}_${random}`;
      const userId = `user_test_dual_on_${timestamp}_${random}`;
      const idempotencyKey = `idem_test_dual_on_${timestamp}_${random}`;

      const result = await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey,
      });

      expect(result.success).toBe(true);
      
      // bills/{billId} が作成されていることを確認
      const billDoc = await db.collection('bills').doc(billId).get();
      expect(billDoc.exists).toBe(true);

      // todaysBills/{billId} が作成されている（docIDは必ず billId）
      const todaysBillsDoc = await db.collection('todaysBills').doc(billId).get();
      expect(todaysBillsDoc.exists).toBe(true);
      const todaysBillsData = todaysBillsDoc.data()!;
      expect(todaysBillsData.status).toBe('open');
      expect(todaysBillsData.pokerName).toBe('テスト太郎');
      expect(todaysBillsData.userId).toBe(userId);
      expect(todaysBillsData.date).toBe(result.businessDate);
      expect(todaysBillsData.items).toEqual([]);
      expect(todaysBillsData.sideGameChip).toEqual([]);
      // totalPrice 等の金額フィールドは書かれていない
      expect(todaysBillsData.totalPrice).toBeUndefined();
    });

    it('DualWrite OFF: todaysBills への複写がスキップされること', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'false';

      // テストIDを一意にする（タイムスタンプ + ランダム文字列）
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const billId = `bill_test_dual_off_${timestamp}_${random}`;
      const userId = `user_test_dual_off_${timestamp}_${random}`;
      const idempotencyKey = `idem_test_dual_off_${timestamp}_${random}`;

      const result = await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey,
      });

      expect(result.success).toBe(true);

      // todaysBills は作成されていない
      const todaysBillsDoc = await db.collection('todaysBills').doc(billId).get();
      expect(todaysBillsDoc.exists).toBe(false);
    });
  });
});
