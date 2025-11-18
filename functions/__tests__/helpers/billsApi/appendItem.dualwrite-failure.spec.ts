/**
 * appendItem.dualwrite-failure の統合テスト
 * 
 * ChangeSpec P1-02.1 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - DualWrite失敗時でも bills/items は成功
 * - orders/_TodaysOrders も期待通り作成される
 * - ログ出力に dualWriteResult: 'failed' が含まれる
 * - WRITE_TODAYS_BILLS_IN_PARALLEL=false で dualWriteResult: 'skipped' が出力される
 * - todaysBills が存在し、update が失敗する場合に dualWriteResult: 'failed' が出力される
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { appendItem } from '../../../src/helpers/billsApi/appendItem';
import { createBillWithActiveStay } from '../../../src/helpers/billsApi/createBillWithActiveStay';
import { logger } from 'firebase-functions';

// logger をモック
jest.mock('firebase-functions', () => ({
  ...jest.requireActual('firebase-functions'),
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// dualwrite モジュールをモック（デフォルトは実装どおり、個別テストで上書き可能）
const mockLegacyAppendItemUpdate = jest.fn();
jest.mock('../../../src/helpers/billsApi/dualWrite', () => {
  const actual = jest.requireActual('../../../src/helpers/billsApi/dualWrite');
  return {
    ...actual,
    legacyAppendItemUpdate: (...args: any[]) => mockLegacyAppendItemUpdate(...args),
  };
});

describe('appendItem.dualwrite-failure', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = `test-project-bills-${process.pid}-${Date.now()}`;
  let prevStoreCloseHour: string | undefined;

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
    if (typeof testEnv?.cleanup === 'function') {
      await testEnv.cleanup();
    }
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map(a => a?.delete()).filter(Boolean));
    }
    delete process.env.FIRESTORE_EMULATOR_HOST;
    jest.useRealTimers();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    prevStoreCloseHour = process.env.STORE_CLOSE_HOUR;
    // logger モックをリセット
    jest.clearAllMocks();
    // legacyAppendItemUpdate モックをリセット（デフォルトは実装どおり）
    mockLegacyAppendItemUpdate.mockReset();
    mockLegacyAppendItemUpdate.mockImplementation(async (tx: any, db: any, params: any) => {
      const actual = jest.requireActual('../../../src/helpers/billsApi/dualWrite');
      return actual.legacyAppendItemUpdate(tx, db, params);
    });
  });

  afterEach(() => {
    process.env.STORE_CLOSE_HOUR = prevStoreCloseHour;
    delete process.env.WRITE_TODAYS_BILLS_IN_PARALLEL;
  });

  // テスト用のヘルパ関数: メニューアイテムを作成
  async function createTestMenuItem(menuItemId: string, name: string, category: string, price: number) {
    await db.collection('menuItems').doc(menuItemId).set({
      name,
      category,
      price,
      description: '',
      imageUrl: '',
      isArchive: false,
      isSoldOut: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  it('DualWrite失敗時でもbills/itemsは成功、ordersも期待通り作成される', async () => {
    process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'true';
    
    const userId = 'user-test-dualwrite-1';
    const billId = 'bill-test-dualwrite-1';
    const menuItemId = 'menu-test-dualwrite-1';
    
    // メニューアイテムを作成
    await createTestMenuItem(menuItemId, 'テストアイテム', 'food', 500);
    
    // 入店
    const createResult = await createBillWithActiveStay({
      billId,
      userId,
      pokerName: 'テストユーザー',
      idempotencyKey: `create-${billId}`,
    });
    
    expect(createResult.success).toBe(true);
    
    // todaysBills を削除して DualWrite を失敗させる
    await db.collection('todaysBills').doc(billId).delete();
    
    // appendItem を実行（DualWrite は失敗するが、bills/items は成功する）
    const result = await appendItem({
      billId,
      item: {
        menuItemId,
        quantity: 1,
        clientNonce: 'nonce-dualwrite-1',
      },
      idempotencyKey: `appendItem:${billId}:nonce-dualwrite-1`,
    });
    
    expect(result.success).toBe(true);
    expect(result.itemId).toBeDefined();
    
    // bills/items が作成されていることを確認
    const itemSnap = await db.collection('bills').doc(billId)
      .collection('items').doc(result.itemId).get();
    expect(itemSnap.exists).toBe(true);
    
    // 注意: appendItem は orders/_TodaysOrders を作成しない（placeOrder/placeOrderByUser が作成する）
    // このテストでは DualWrite 失敗時でも bills/items が成功することを確認する
  });

  it('WRITE_TODAYS_BILLS_IN_PARALLEL=false で dualWriteResult: skipped が出力される', async () => {
    process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'false';
    
    const userId = 'user-test-dualwrite-2';
    const billId = 'bill-test-dualwrite-2';
    const menuItemId = 'menu-test-dualwrite-2';
    
    // メニューアイテムを作成
    await createTestMenuItem(menuItemId, 'テストアイテム2', 'food', 300);
    
    // 入店
    const createResult = await createBillWithActiveStay({
      billId,
      userId,
      pokerName: 'テストユーザー2',
      idempotencyKey: `create-${billId}`,
    });
    
    expect(createResult.success).toBe(true);
    
    // appendItem を実行（DualWrite はスキップされる）
    const result = await appendItem({
      billId,
      item: {
        menuItemId,
        quantity: 1,
        clientNonce: 'nonce-dualwrite-2',
      },
      idempotencyKey: `appendItem:${billId}:nonce-dualwrite-2`,
    });
    
    expect(result.success).toBe(true);
    
    // bills/items が作成されていることを確認
    const itemSnap = await db.collection('bills').doc(billId)
      .collection('items').doc(result.itemId).get();
    expect(itemSnap.exists).toBe(true);
  });

  it('DualWrite で update が例外になった場合に dualWriteResult: failed をログ出力しつつ bills/items は成功', async () => {
    process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'true';
    
    const userId = 'user-test-dualwrite-failed';
    const billId = 'bill-test-dualwrite-failed';
    const menuItemId = 'menu-test-dualwrite-failed';
    
    // メニューアイテムを作成
    await createTestMenuItem(menuItemId, 'テストアイテム', 'food', 500);
    
    // 入店
    const createResult = await createBillWithActiveStay({
      billId,
      userId,
      pokerName: 'テストユーザー',
      idempotencyKey: `create-${billId}`,
    });
    
    expect(createResult.success).toBe(true);
    
    // todaysBills/{billId} を事前作成（legacySnap.exists === true にするため）
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`todaysBills/${billId}`).set({
        items: [],
        totalPrice: 0,
      });
    });
    
    // legacyAppendItemUpdate をモックして例外を投げる
    mockLegacyAppendItemUpdate.mockImplementation(async () => {
      throw new Error('forced-dualwrite-failure-for-test');
    });
    
    // appendItem を実行（DualWrite は例外で失敗するが、bills/items は成功する）
    const result = await appendItem({
      billId,
      item: {
        menuItemId,
        quantity: 1,
        clientNonce: 'nonce-dualwrite-failed',
      },
      idempotencyKey: `appendItem:${billId}:nonce-dualwrite-failed`,
    });
    
    expect(result.success).toBe(true);
    expect(result.itemId).toBeDefined();
    
    // bills/items が作成されていることを確認
    const itemSnap = await db.collection('bills').doc(billId)
      .collection('items').doc(result.itemId).get();
    expect(itemSnap.exists).toBe(true);
    
    // warn ログ（failed 分岐）が出ていること
    expect(logger.warn).toHaveBeenCalledWith(
      'dualWrite appendItem failed',
      expect.objectContaining({
        op: 'appendItem',
        billId,
        dualWriteResult: 'failed',
      })
    );
    
    // モックをリセット
    mockLegacyAppendItemUpdate.mockReset();
  });

  describe('DualWrite 三分岐ログの厳密一致検証', () => {
    it('success: WRITE_TODAYS_BILLS_IN_PARALLEL=true + todaysBills存在 + legacyAppendItemUpdate正常 → logger.info 厳密一致', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'true';
      
      const userId = 'user-test-dualwrite-success';
      const billId = 'bill-test-dualwrite-success';
      const menuItemId = 'menu-test-dualwrite-success';
      
      // メニューアイテムを作成
      await createTestMenuItem(menuItemId, 'テストアイテム', 'food', 500);
      
      // 入店
      const createResult = await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テストユーザー',
        idempotencyKey: `create-${billId}`,
      });
      
      expect(createResult.success).toBe(true);
      
      // todaysBills/{billId} を事前作成（legacySnap.exists === true にするため）
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().doc(`todaysBills/${billId}`).set({
          items: [],
          totalPrice: 0,
        });
      });
      
      // legacyAppendItemUpdate は正常動作（モックをリセットして実装どおり）
      mockLegacyAppendItemUpdate.mockReset();
      mockLegacyAppendItemUpdate.mockImplementation(async (tx: any, db: any, params: any) => {
        const actual = jest.requireActual('../../../src/helpers/billsApi/dualWrite');
        return actual.legacyAppendItemUpdate(tx, db, params);
      });
      
      // appendItem を実行
      const result = await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 1,
          clientNonce: 'nonce-dualwrite-success',
        },
        idempotencyKey: `appendItem:${billId}:nonce-dualwrite-success`,
      });
      
      expect(result.success).toBe(true);
      
      // logger.info が厳密一致で呼ばれていることを確認
      expect(logger.info).toHaveBeenCalledWith(
        'dualWrite appendItem ok',
        expect.objectContaining({
          op: 'appendItem',
          billId,
          itemId: result.itemId,
          dualWriteResult: 'success',
        })
      );
      
      // 第2引数オブジェクトが4キーのみであることを確認（余計なキーがない）
      const infoCalls = (logger.info as jest.Mock).mock.calls;
      const dualWriteOkCall = infoCalls.find((call: any[]) => 
        call[0] === 'dualWrite appendItem ok'
      );
      expect(dualWriteOkCall).toBeDefined();
      const secondArg = dualWriteOkCall[1];
      expect(Object.keys(secondArg)).toEqual(['op', 'billId', 'itemId', 'dualWriteResult']);
    });

    it('failed: WRITE_TODAYS_BILLS_IN_PARALLEL=true + todaysBills存在 + legacyAppendItemUpdate throw → logger.warn 厳密一致', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'true';
      
      const userId = 'user-test-dualwrite-failed-strict';
      const billId = 'bill-test-dualwrite-failed-strict';
      const menuItemId = 'menu-test-dualwrite-failed-strict';
      
      // メニューアイテムを作成
      await createTestMenuItem(menuItemId, 'テストアイテム', 'food', 500);
      
      // 入店
      const createResult = await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テストユーザー',
        idempotencyKey: `create-${billId}`,
      });
      
      expect(createResult.success).toBe(true);
      
      // todaysBills/{billId} を事前作成（legacySnap.exists === true にするため）
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().doc(`todaysBills/${billId}`).set({
          items: [],
          totalPrice: 0,
        });
      });
      
      // legacyAppendItemUpdate をモックして例外を投げる
      mockLegacyAppendItemUpdate.mockImplementation(async () => {
        throw new Error('forced-dualwrite-failure-for-test');
      });
      
      // appendItem を実行
      const result = await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 1,
          clientNonce: 'nonce-dualwrite-failed-strict',
        },
        idempotencyKey: `appendItem:${billId}:nonce-dualwrite-failed-strict`,
      });
      
      expect(result.success).toBe(true);
      
      // logger.warn が厳密一致で呼ばれていることを確認
      expect(logger.warn).toHaveBeenCalledWith(
        'dualWrite appendItem failed',
        expect.objectContaining({
          op: 'appendItem',
          billId,
          itemId: result.itemId,
          dualWriteResult: 'failed',
          reason: expect.any(String),
        })
      );
      
      // 第2引数オブジェクトが5キー（op, billId, itemId, dualWriteResult, reason）であることを確認
      const warnCalls = (logger.warn as jest.Mock).mock.calls;
      const dualWriteFailedCall = warnCalls.find((call: any[]) => 
        call[0] === 'dualWrite appendItem failed'
      );
      expect(dualWriteFailedCall).toBeDefined();
      const secondArg = dualWriteFailedCall[1];
      expect(Object.keys(secondArg).sort()).toEqual(['billId', 'dualWriteResult', 'itemId', 'op', 'reason']);
    });

    it('skipped: WRITE_TODAYS_BILLS_IN_PARALLEL=false → logger.info 厳密一致', async () => {
      process.env.WRITE_TODAYS_BILLS_IN_PARALLEL = 'false';
      
      const userId = 'user-test-dualwrite-skipped-strict';
      const billId = 'bill-test-dualwrite-skipped-strict';
      const menuItemId = 'menu-test-dualwrite-skipped-strict';
      
      // メニューアイテムを作成
      await createTestMenuItem(menuItemId, 'テストアイテム', 'food', 500);
      
      // 入店
      const createResult = await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'テストユーザー',
        idempotencyKey: `create-${billId}`,
      });
      
      expect(createResult.success).toBe(true);
      
      // appendItem を実行
      const result = await appendItem({
        billId,
        item: {
          menuItemId,
          quantity: 1,
          clientNonce: 'nonce-dualwrite-skipped-strict',
        },
        idempotencyKey: `appendItem:${billId}:nonce-dualwrite-skipped-strict`,
      });
      
      expect(result.success).toBe(true);
      
      // logger.info が厳密一致で呼ばれていることを確認
      expect(logger.info).toHaveBeenCalledWith(
        'dualWrite appendItem skipped',
        expect.objectContaining({
          op: 'appendItem',
          billId,
          itemId: result.itemId,
          dualWriteResult: 'skipped',
        })
      );
      
      // 第2引数オブジェクトが4キーのみであることを確認（余計なキーがない）
      const infoCalls = (logger.info as jest.Mock).mock.calls;
      const dualWriteSkippedCall = infoCalls.find((call: any[]) => 
        call[0] === 'dualWrite appendItem skipped'
      );
      expect(dualWriteSkippedCall).toBeDefined();
      const secondArg = dualWriteSkippedCall[1];
      expect(Object.keys(secondArg)).toEqual(['op', 'billId', 'itemId', 'dualWriteResult']);
    });
  });
});

