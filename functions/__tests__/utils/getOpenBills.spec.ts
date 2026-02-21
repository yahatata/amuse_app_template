/**
 * getOpenBills の統合テスト
 * 
 * ChangeSpec P1-08 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path（正常な入店中ユーザー一覧取得、status='open' の伝票のみ取得、ソート確認）
 * - empty（入店中ユーザーがいない場合の空配列返却）
 * - レスポンス形式（billId, party.userId, party.pokerName, place.table, place.seat が正しくマッピングされる）
 * - businessDate フィルタ（当日の営業日の status='open' bill のみ取得、前日の businessDate を持つ bill は含まれない）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getOpenBills } from '../../src/domains/bills/callables/getOpenBills';
import { calcBusinessDate } from '../../src/domains/bills/repos/calcBusinessDate';

describe('getOpenBills', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-get-open-bills';

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
    // STORE_CLOSE_HOUR を設定（デフォルト値 27 を使用）
    if (!process.env.STORE_CLOSE_HOUR) {
      process.env.STORE_CLOSE_HOUR = '27';
    }
  });

  // テスト用のヘルパ関数: open 伝票を作成
  async function createOpenBill(
    billId: string,
    userId: string,
    businessDate: string,
    pokerName: string = 'テスト太郎',
    table: string | null = 'table_01',
    seat: number | null = 1
  ) {
    await db.collection('bills').doc(billId).set({
      businessDate,
      status: 'open',
      party: {
        userId,
        pokerName,
      },
      place: {
        table,
        seat,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      meta: {
        schemaVersion: '1.3',
      },
    });
  }

  describe('happy path', () => {
    it('正常な入店中ユーザー一覧取得', async () => {
      const userId1 = 'user_test_happy_001';
      const userId2 = 'user_test_happy_002';
      const billId1 = 'bill_test_happy_001';
      const billId2 = 'bill_test_happy_002';
      // 現在時刻を使って businessDate を計算
      const now = new Date();
      const businessDate = calcBusinessDate(now);

      await createOpenBill(billId1, userId1, businessDate, 'テスト太郎', 'table_01', 1);
      await createOpenBill(billId2, userId2, businessDate, 'テスト花子', 'table_02', 2);

      const mockRequest = {
        auth: null, // getOpenBills は認証不要
        data: {},
      };

      const result = await (getOpenBills as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(2);
    });

    it('status="open" の伝票のみ取得されることを確認', async () => {
      const userId1 = 'user_test_happy_003';
      const userId2 = 'user_test_happy_004';
      const userId3 = 'user_test_happy_005';
      const billId1 = 'bill_test_happy_003';
      const billId2 = 'bill_test_happy_004';
      const billId3 = 'bill_test_happy_005';
      // 現在時刻を使って businessDate を計算
      const now = new Date();
      const businessDate = calcBusinessDate(now);

      await createOpenBill(billId1, userId1, businessDate);
      // in_progress の伝票（取得されない）
      await db.collection('bills').doc(billId2).set({
        businessDate,
        status: 'in_progress',
        party: { userId: userId2, pokerName: 'テスト次郎' },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        meta: { schemaVersion: '1.3' },
      });
      // settled の伝票（取得されない）
      await db.collection('bills').doc(billId3).set({
        businessDate,
        status: 'settled',
        party: { userId: userId3, pokerName: 'テスト三郎' },
        amounts: { grandTotalRounded: 10000 },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        meta: { schemaVersion: '1.3' },
      });

      const mockRequest = {
        auth: null,
        data: {},
      };

      const result = await (getOpenBills as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].billId).toBe(billId1);
      expect(result.data.find((d: any) => d.billId === billId2)).toBeUndefined();
      expect(result.data.find((d: any) => d.billId === billId3)).toBeUndefined();
    });

    it('ソート確認（pokerName順）', async () => {
      const userId1 = 'user_test_happy_006';
      const userId2 = 'user_test_happy_007';
      const userId3 = 'user_test_happy_008';
      const billId1 = 'bill_test_happy_006';
      const billId2 = 'bill_test_happy_007';
      const billId3 = 'bill_test_happy_008';
      // 現在時刻を使って businessDate を計算
      const now = new Date();
      const businessDate = calcBusinessDate(now);

      await createOpenBill(billId1, userId1, businessDate, 'さとう');
      await createOpenBill(billId2, userId2, businessDate, 'あべ');
      await createOpenBill(billId3, userId3, businessDate, 'やまだ');

      const mockRequest = {
        auth: null,
        data: {},
      };

      const result = await (getOpenBills as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(3);
      // pokerName 順でソートされていることを確認（あべ、さとう、やまだ）
      expect(result.data[0].pokerName).toBe('あべ');
      expect(result.data[1].pokerName).toBe('さとう');
      expect(result.data[2].pokerName).toBe('やまだ');
    });
  });

  describe('empty', () => {
    it('入店中ユーザーがいない場合の空配列返却', async () => {
      const mockRequest = {
        auth: null,
        data: {},
      };

      const result = await (getOpenBills as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('レスポンス形式', () => {
    it('billId フィールドが正しく返却されることを確認', async () => {
      const userId = 'user_test_response_001';
      const billId = 'bill_test_response_001';
      // 現在時刻を使って businessDate を計算
      const now = new Date();
      const businessDate = calcBusinessDate(now);

      await createOpenBill(billId, userId, businessDate);

      const mockRequest = {
        auth: null,
        data: {},
      };

      const result = await (getOpenBills as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].billId).toBe(billId);
      // todaysBillsId は存在しないことを確認
      expect(result.data[0].todaysBillsId).toBeUndefined();
    });

    it('party.userId, party.pokerName, place.table, place.seat が正しくマッピングされることを確認', async () => {
      const userId = 'user_test_response_002';
      const billId = 'bill_test_response_002';
      const pokerName = 'テスト太郎';
      const table = 'table_01';
      const seat = 1;
      // 現在時刻を使って businessDate を計算
      const now = new Date();
      const businessDate = calcBusinessDate(now);

      await createOpenBill(billId, userId, businessDate, pokerName, table, seat);

      const mockRequest = {
        auth: null,
        data: {},
      };

      const result = await (getOpenBills as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].userId).toBe(userId);
      expect(result.data[0].pokerName).toBe(pokerName);
      expect(result.data[0].currentTable).toBe(table);
      expect(result.data[0].currentSeat).toBe(seat);
    });
  });

  describe('businessDate フィルタ', () => {
    it('当日の営業日の status="open" bill のみ取得されることを確認', async () => {
      const userId1 = 'user_test_business_date_001';
      const userId2 = 'user_test_business_date_002';
      const billId1 = 'bill_test_business_date_001';
      const billId2 = 'bill_test_business_date_002';
      // 現在時刻を使って businessDate を計算
      const now = new Date();
      const businessDate = calcBusinessDate(now);
      // 前日の営業日を計算（現在時刻から1日前）
      const prevDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const prevBusinessDate = calcBusinessDate(prevDate);

      await createOpenBill(billId1, userId1, businessDate);
      await createOpenBill(billId2, userId2, prevBusinessDate);

      const mockRequest = {
        auth: null,
        data: {},
      };

      const result = await (getOpenBills as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].billId).toBe(billId1);
      expect(result.data.find((d: any) => d.billId === billId2)).toBeUndefined();
    });

    it('前日の businessDate を持つ status="open" bill は、レスポンスに含まれないことを確認', async () => {
      const userId = 'user_test_business_date_003';
      const billId = 'bill_test_business_date_003';
      // 前日の営業日を計算（現在時刻から1日前）
      const now = new Date();
      const prevDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const prevBusinessDate = calcBusinessDate(prevDate);

      await createOpenBill(billId, userId, prevBusinessDate);

      const mockRequest = {
        auth: null,
        data: {},
      };

      const result = await (getOpenBills as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(0);
    });
  });
});

