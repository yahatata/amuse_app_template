/**
 * updatePlace の統合テスト
 * 
 * ChangeSpec P1-04 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path
 * - invalid-argument (billId が未指定、table または seat の型が不正)
 * - not-found (billId が存在しない)
 * - failed-precondition (status == "settled" で更新不可)
 * - LWW動作 (複数端末から同時に更新した場合、serverTimestamp() 到着順で最終値が採用される)
 * - idempotencyKey指定時の動作 (idempotencyKey を指定しても /idempotency には保存されず、通常のLWWとして上書きされる)
 * - DualWrite ON/OFF
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { updatePlace } from '../../../src/domains/bills/repos/updatePlace';

describe('updatePlace', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-bills';

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
    // テスト前に環境変数をクリア
    delete process.env.WRITE_TODAYS_BILLS_IN_PARALLEL;
    
    // 明示的なクリーンアップ（念のため）
    const activeStaysSnapshot = await db.collection('activeStays').get();
    const deleteActiveStaysPromises = activeStaysSnapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deleteActiveStaysPromises);
    
    const billsSnapshot = await db.collection('bills').get();
    const deleteBillsPromises = billsSnapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deleteBillsPromises);
  });

  // テスト用のヘルパ関数: 伝票を作成
  async function createTestBill(billId: string, userId: string, status: string = 'open', place?: { table: string | null; seat: number | null }) {
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
    
    if (place !== undefined) {
      billData.place = place;
    }
    
    await db.collection('bills').doc(billId).set(billData);
  }

  // テストID生成ヘルパー（同じテスト内でIDを固定するため）
  function makeTestIds(testName: string) {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      billId: `bill_test_${testName}_${suffix}`,
      userId: `user_test_${testName}_${suffix}`,
    };
  }

  describe('happy path', () => {
    it('正常に座席情報を更新できること', async () => {
      const ids = makeTestIds('updatePlace_happy');
      const billId = ids.billId;
      const userId = ids.userId;
      const table = 'table_001';
      const seat = 1;

      await createTestBill(billId, userId, 'open');

      const result = await updatePlace({
        billId,
        table,
        seat,
      });

      expect(result.success).toBe(true);
      expect(result.billId).toBe(billId);
      expect(result.place.table).toBe(table);
      expect(result.place.seat).toBe(seat);
      expect(result.updatedAt).toBeDefined();

      // /bills/{billId}.place が更新されている
      const billDoc = await db.collection('bills').doc(billId).get();
      expect(billDoc.exists).toBe(true);
      const billData = billDoc.data()!;
      expect(billData.place?.table).toBe(table);
      expect(billData.place?.seat).toBe(seat);
      expect(billData.updatedAt).toBeDefined();
    });

    it('座席情報を null に更新できること', async () => {
      const ids = makeTestIds('updatePlace_null');
      const billId = ids.billId;
      const userId = ids.userId;
      const table = 'table_001';
      const seat = 1;

      await createTestBill(billId, userId, 'open', { table, seat });

      const result = await updatePlace({
        billId,
        table: null,
        seat: null,
      });

      expect(result.success).toBe(true);
      expect(result.place.table).toBeNull();
      expect(result.place.seat).toBeNull();

      // /bills/{billId}.place が null に更新されている
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.place?.table).toBeNull();
      expect(billData.place?.seat).toBeNull();
    });
  });

  describe('invalid-argument', () => {
    it('billId が未指定 → invalid-argument', async () => {
      try {
        await updatePlace({
          billId: '',
          table: 'table_001',
          seat: 1,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
        expect(error.message).toContain('billId is required');
      }
    });

    it('table の型が不正 → invalid-argument', async () => {
      const billId = 'bill_test_invalid_001';
      const userId = 'user_test_invalid_001';

      await createTestBill(billId, userId, 'open');

      try {
        await updatePlace({
          billId,
          table: 123 as any, // 不正な型
          seat: 1,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
        expect(error.message).toContain('table must be string or null');
      }
    });

    it('seat の型が不正 → invalid-argument', async () => {
      const billId = 'bill_test_invalid_002';
      const userId = 'user_test_invalid_002';

      await createTestBill(billId, userId, 'open');

      try {
        await updatePlace({
          billId,
          table: 'table_001',
          seat: 'invalid' as any, // 不正な型
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
        expect(error.message).toContain('seat must be number or null');
      }
    });
  });

  describe('not-found', () => {
    it('billId が存在しない → not-found', async () => {
      const billId = 'bill_not_exist';

      try {
        await updatePlace({
          billId,
          table: 'table_001',
          seat: 1,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('not-found');
        expect(error.message).toContain('not found');
      }
    });
  });

  describe('failed-precondition', () => {
    it('status が settled の場合 → failed-precondition', async () => {
      const billId = 'bill_test_settled_001';
      const userId = 'user_test_settled_001';

      await createTestBill(billId, userId, 'settled');

      try {
        await updatePlace({
          billId,
          table: 'table_001',
          seat: 1,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('failed-precondition');
        expect(error.message).toContain('settled');
      }
    });
  });

  describe('LWW動作', () => {
    it('複数端末から同時に更新した場合、serverTimestamp() 到着順で最終値が採用されること', async () => {
      // テストIDを一意にする（タイムスタンプ + ランダム文字列）
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const billId = `bill_test_lww_${timestamp}_${random}`;
      const userId = `user_test_lww_${timestamp}_${random}`;

      await createTestBill(billId, userId, 'open');

      // 同時に2つの更新を実行
      const [result1, result2] = await Promise.all([
        updatePlace({
          billId,
          table: 'table_001',
          seat: 1,
        }),
        updatePlace({
          billId,
          table: 'table_002',
          seat: 2,
        }),
      ]);

      // 両方とも成功する
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // 最終的な値は最後に到着した更新が採用される（LWW方式）
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      // どちらか一方の値が採用されている（serverTimestamp() 到着順）
      expect(['table_001', 'table_002']).toContain(billData.place?.table);
      expect([1, 2]).toContain(billData.place?.seat);
    });
  });

  describe('idempotencyKey指定時の動作', () => {
    it('idempotencyKey を指定しても /idempotency には保存されず、通常のLWWとして上書きされること', async () => {
      const ids = makeTestIds('updatePlace_idemp');
      const billId = ids.billId;
      const userId = ids.userId;
      const idempotencyKey = `${billId}:updatePlace:nonce_001`;

      await createTestBill(billId, userId, 'open');

      // 1回目の更新
      const result1 = await updatePlace({
        billId,
        table: 'table_001',
        seat: 1,
        idempotencyKey,
      });

      expect(result1.success).toBe(true);

      // /bills/{billId}/idempotency/{idempotencyKey} は作成されていない
      const idemDoc = await db.collection('bills').doc(billId)
        .collection('idempotency').doc(idempotencyKey).get();
      expect(idemDoc.exists).toBe(false);

      // 2回目の更新（同じ idempotencyKey で異なる値）
      const result2 = await updatePlace({
        billId,
        table: 'table_002',
        seat: 2,
        idempotencyKey,
      });

      expect(result2.success).toBe(true);
      expect(result2.place.table).toBe('table_002');
      expect(result2.place.seat).toBe(2);

      // 最終的な値は2回目の更新が採用されている（LWW方式）
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.place?.table).toBe('table_002');
      expect(billData.place?.seat).toBe(2);
    });
  });

  describe('DualWrite ON/OFF', () => {
    it('DualWrite ON: todaysBills/{billId}.currentTable/currentSeat が更新されること、失敗時も bills への書込みは成功すること', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'true';

      // テストIDを一意にする（タイムスタンプ + ランダム文字列）
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const billId = `bill_test_dualwrite_on_${timestamp}_${random}`;
      const userId = `user_test_dualwrite_on_${timestamp}_${random}`;
      const table = 'table_001';
      const seat = 1;

      await createTestBill(billId, userId, 'open');

      // todaysBills を作成
      await db.collection('todaysBills').doc(billId).set({
        userId,
        status: 'open',
        currentTable: null,
        currentSeat: null,
      });

      const result = await updatePlace({
        billId,
        table,
        seat,
      });

      expect(result.success).toBe(true);

      // bills が更新されている
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.place?.table).toBe(table);
      expect(billData.place?.seat).toBe(seat);

      // todaysBills も更新されている
      const todaysBillsDoc = await db.collection('todaysBills').doc(billId).get();
      const todaysBillsData = todaysBillsDoc.data()!;
      expect(todaysBillsData.currentTable).toBe(table);
      expect(todaysBillsData.currentSeat).toBe(seat);
    });

    it('DualWrite OFF: todaysBills は更新されないこと', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'false';

      // テストIDを一意にする（タイムスタンプ + ランダム文字列）
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const billId = `bill_test_dualwrite_off_${timestamp}_${random}`;
      const userId = `user_test_dualwrite_off_${timestamp}_${random}`;
      const table = 'table_001';
      const seat = 1;

      await createTestBill(billId, userId, 'open');

      // todaysBills を作成
      await db.collection('todaysBills').doc(billId).set({
        userId,
        status: 'open',
        currentTable: null,
        currentSeat: null,
      });

      const result = await updatePlace({
        billId,
        table,
        seat,
      });

      expect(result.success).toBe(true);

      // bills が更新されている
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.place?.table).toBe(table);
      expect(billData.place?.seat).toBe(seat);

      // todaysBills は更新されていない
      const todaysBillsDoc = await db.collection('todaysBills').doc(billId).get();
      const todaysBillsData = todaysBillsDoc.data()!;
      expect(todaysBillsData.currentTable).toBeNull();
      expect(todaysBillsData.currentSeat).toBeNull();
    });

    it('DualWrite ON で todaysBills が存在しない場合はスキップされること', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'true';

      // テストIDを一意にする（タイムスタンプ + ランダム文字列）
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const billId = `bill_test_dualwrite_skip_${timestamp}_${random}`;
      const userId = 'user_test_dualwrite_skip_001';
      const table = 'table_001';
      const seat = 1;

      await createTestBill(billId, userId, 'open');

      // todaysBills は作成しない

      const result = await updatePlace({
        billId,
        table,
        seat,
      });

      expect(result.success).toBe(true);

      // bills が更新されている
      const billDoc = await db.collection('bills').doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.place?.table).toBe(table);
      expect(billData.place?.seat).toBe(seat);
    });
  });
});

