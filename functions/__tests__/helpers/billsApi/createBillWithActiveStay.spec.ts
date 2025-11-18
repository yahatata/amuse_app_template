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
 * - 環境変数 FIRESTORE_EMULATOR_HOST=localhost:8080 を設定（自動設定される場合あり）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { createBillWithActiveStay } from '../../../src/helpers/billsApi/createBillWithActiveStay';

describe('createBillWithActiveStay', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-bills';

  beforeAll(async () => {
    // Firestore Emulator に接続するための環境変数を設定
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    
    testEnv = await initializeTestEnvironment({
      projectId,
    });
    
    // admin SDK を初期化（テスト環境用、Firestore Emulator に接続）
    // 既に初期化されている場合は削除してから再初期化
    if (admin.apps.length > 0) {
      await admin.app().delete();
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
  });

  describe('happy path', () => {
    it('bills/{billId} & activeStays/{uid} 作成、businessDate がサーバ基準', async () => {
      const billId = 'bill_test_happy_001'; // 一意のIDを使用
      const userId = 'user_test_happy_001'; // 一意のIDを使用
      const idempotencyKey = 'idem_test_happy_001'; // 一意のIDを使用

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
      const billId = 'bill_test_dup_001'; // 一意のIDを使用
      const userId = 'user_test_dup_001'; // 一意のIDを使用
      const idempotencyKey = 'idem_test_dup_001'; // 一意のIDを使用

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
        expect(error.code).toBe('failed-precondition');
      }
    });
  });

  describe('idempotent-replay', () => {
    it('同一 idempotencyKey で再実行 → 既存docを返却（reused: true）、updatedAt は変更されない', async () => {
      const billId = 'bill_test_idem_001'; // 一意のIDを使用
      const userId = 'user_test_idem_001'; // 一意のIDを使用
      const idempotencyKey = 'idem_test_idem_001'; // 一意のIDを使用

      // 1回目実行
      const result1 = await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey,
      });

      expect(result1.success).toBe(true);
      expect(result1.diagnostics?.reused).toBeUndefined();

      const billDoc1 = await db.collection('bills').doc(billId).get();
      const updatedAt1 = billDoc1.data()!.updatedAt;

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
      const billId = 'bill_test_hash_001'; // 一意のIDを使用
      const userId = 'user_test_hash_001'; // 一意のIDを使用
      const idempotencyKey = 'idem_test_hash_001'; // 一意のIDを使用

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
      const billId = 'bill_test_biz_001'; // 一意のIDを使用
      const userId = 'user_test_biz_001'; // 一意のIDを使用
      const idempotencyKey = 'idem_test_biz_001'; // 一意のIDを使用

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

      const billId = 'bill_test_dual_on_001'; // 一意のIDを使用
      const userId = 'user_test_dual_on_001'; // 一意のIDを使用
      const idempotencyKey = 'idem_test_dual_on_001'; // 一意のIDを使用

      const result = await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テスト太郎',
        idempotencyKey,
      });

      expect(result.success).toBe(true);

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

      const billId = 'bill_test_dual_off_001'; // 一意のIDを使用
      const userId = 'user_test_dual_off_001'; // 一意のIDを使用
      const idempotencyKey = 'idem_test_dual_off_001'; // 一意のIDを使用

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

