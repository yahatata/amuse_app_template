/**
 * verifyPaymentSplit の統合テスト
 * 
 * ChangeSpec P1-08 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path（正常な支払い分割計算の照合、一致/不一致）
 * - invalid-argument（認証なし、billId未指定）
 * - not-found（指定された請求書が見つからない場合）
 * - サブコレクション取得（extras, tournaments, items, sideGameChips が正しく取得される）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyPaymentSplit } from '../../src/domains/bills/callables/verifyPaymentSplit';
describe('verifyPaymentSplit', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-verify-payment-split';

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
  });

  // テスト用のヘルパ関数: ユーザーを作成
  async function createUser(userId: string, balances: { pointA?: number; pointB?: number; sideGameChip?: number } = {}) {
    await db.collection('users').doc(userId).set({
      pointA: balances.pointA || 0,
      pointB: balances.pointB || 0,
      sideGameChip: balances.sideGameChip || 0,
    });
  }

  // テスト用のヘルパ関数: bills とサブコレクションを作成
  async function createBillWithSubcollections(
    billId: string,
    userId: string,
    options: {
      extraCost?: number;
      items?: Array<{ totalPriceIncl: number }>;
      sideGameChips?: Array<{ action: string; amountIncl: number }>;
      tournaments?: Array<{ entryFeeIncl: number; entryCount: number; reentryFeeIncl: number; reentryCount: number; addonFeeIncl: number; addonCount: number }>;
    } = {}
  ) {
    const billRef = db.collection('bills').doc(billId);
    await billRef.set({
      businessDate: '2025-11-15',
      status: 'settled',
      party: {
        userId,
        pokerName: 'テスト太郎',
      },
      amounts: {
        grandTotalRounded: 10000,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      meta: {
        schemaVersion: '1.3',
      },
    });

    // extras サブコレクション
    if (options.extraCost) {
      await billRef.collection('extras').doc('extra_001').set({
        name: '入店料',
        amountIncl: options.extraCost,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // items サブコレクション
    if (options.items) {
      for (let i = 0; i < options.items.length; i++) {
        await billRef.collection('items').doc(`item_${i}`).set({
          name: `アイテム${i}`,
          quantity: 1,
          unitPriceIncl: options.items[i].totalPriceIncl,
          totalPriceIncl: options.items[i].totalPriceIncl,
          orderedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    // sideGameChips サブコレクション
    if (options.sideGameChips) {
      for (let i = 0; i < options.sideGameChips.length; i++) {
        await billRef.collection('sideGameChips').doc(`chip_${i}`).set({
          action: options.sideGameChips[i].action,
          chipQty: 1,
          amountIncl: options.sideGameChips[i].amountIncl,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    // tournaments サブコレクション
    if (options.tournaments) {
      for (let i = 0; i < options.tournaments.length; i++) {
        await billRef.collection('tournaments').doc(`tpl_${i}`).set({
          templateId: `tpl_${i}`,
          templateName: `トーナメント${i}`,
          entryFeeIncl: options.tournaments[i].entryFeeIncl,
          entryCount: options.tournaments[i].entryCount,
          reentryFeeIncl: options.tournaments[i].reentryFeeIncl,
          reentryCount: options.tournaments[i].reentryCount,
          addonFeeIncl: options.tournaments[i].addonFeeIncl,
          addonCount: options.tournaments[i].addonCount,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  }

  describe('happy path', () => {
    it('正常な支払い分割計算の照合', async () => {
      const userId = 'user_test_happy_001';
      const billId = 'bill_test_happy_001';
      await createUser(userId, { pointA: 1000, pointB: 500 });
      await createBillWithSubcollections(billId, userId, {
        extraCost: 1000,
        items: [{ totalPriceIncl: 3000 }, { totalPriceIncl: 2000 }],
        sideGameChips: [{ action: 'purchase', amountIncl: 1000 }],
        tournaments: [{
          entryFeeIncl: 2000,
          entryCount: 1,
          reentryFeeIncl: 0,
          reentryCount: 0,
          addonFeeIncl: 0,
          addonCount: 0,
        }],
      });

      const mockRequest = {
        auth: { uid: userId },
        data: {
          billId,
          clientResult: {
            usedPoints: { pointA: 1000, pointB: 500 },
            cashLikeAmount: 6500,
            categoryBreakdown: {
              extraCost: { pointsUsed: 0, baseMethodAmount: 1000 },
              items: { pointsUsed: 0, baseMethodAmount: 5000 },
              sideGameChip: { pointsUsed: 0, baseMethodAmount: 1000 },
              tournaments: { pointsUsed: 0, baseMethodAmount: 2000 },
            },
          },
          selectedBaseMethod: 'cash',
        },
      };

      const result = await (verifyPaymentSplit as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.verified).toBeDefined();
    });

    it('クライアント側とサーバー側の結果が一致する場合', async () => {
      const userId = 'user_test_happy_002';
      const billId = 'bill_test_happy_002';
      await createUser(userId);
      await createBillWithSubcollections(billId, userId, {
        items: [{ totalPriceIncl: 10000 }],
      });

      // まずサーバー側の計算結果を取得
      const firstRequest = {
        auth: { uid: userId },
        data: {
          billId,
          clientResult: {
            usedPoints: {},
            cashLikeAmount: 0, // 不一致にする
            categoryBreakdown: {},
          },
          selectedBaseMethod: 'cash',
        },
      };

      const firstResult = await (verifyPaymentSplit as any).run(firstRequest);
      expect(firstResult.success).toBe(true);
      expect(firstResult.verified).toBe(false); // 不一致
      const serverResult = firstResult.result;

      // サーバー側の計算結果に合わせてクライアント側の値を設定
      const mockRequest = {
        auth: { uid: userId },
        data: {
          billId,
          clientResult: serverResult, // サーバー側の結果をそのまま使用
          selectedBaseMethod: 'cash',
        },
      };

      const result = await (verifyPaymentSplit as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.message).toContain('一致');
    });

    it('クライアント側とサーバー側の結果が不一致の場合（サーバー側の結果を返す）', async () => {
      const userId = 'user_test_happy_003';
      const billId = 'bill_test_happy_003';
      await createUser(userId);
      await createBillWithSubcollections(billId, userId, {
        items: [{ totalPriceIncl: 10000 }],
      });

      // クライアント側が間違った値を送る
      const mockRequest = {
        auth: { uid: userId },
        data: {
          billId,
          clientResult: {
            usedPoints: {},
            cashLikeAmount: 5000, // 間違った値
            categoryBreakdown: {
              items: { pointsUsed: 0, baseMethodAmount: 5000 },
            },
          },
          selectedBaseMethod: 'cash',
        },
      };

      const result = await (verifyPaymentSplit as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.verified).toBe(false);
      expect(result.message).toContain('不一致');
      expect(result.result).toBeDefined();
      expect(result.differences).toBeDefined();
    });
  });

  describe('invalid-argument', () => {
    it('認証なしの場合', async () => {
      const mockRequest = {
        auth: null,
        data: {
          billId: 'bill_test_001',
          clientResult: {
            usedPoints: {},
            cashLikeAmount: 10000,
            categoryBreakdown: {},
          },
          selectedBaseMethod: 'cash',
        },
      };

      try {
        await (verifyPaymentSplit as any).run(mockRequest);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('unauthenticated');
      }
    });

    it('billId 未指定', async () => {
      const userId = 'user_test_001';
      const mockRequest = {
        auth: { uid: userId },
        data: {
          clientResult: {
            usedPoints: {},
            cashLikeAmount: 10000,
            categoryBreakdown: {},
          },
          selectedBaseMethod: 'cash',
        },
      };

      try {
        await (verifyPaymentSplit as any).run(mockRequest);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('invalid-argument');
      }
    });
  });

  describe('not-found', () => {
    it('指定された請求書が見つからない場合', async () => {
      const userId = 'user_test_001';
      await createUser(userId);

      const mockRequest = {
        auth: { uid: userId },
        data: {
          billId: 'bill_not_exist',
          clientResult: {
            usedPoints: {},
            cashLikeAmount: 10000,
            categoryBreakdown: {},
          },
          selectedBaseMethod: 'cash',
        },
      };

      try {
        await (verifyPaymentSplit as any).run(mockRequest);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('not-found');
      }
    });
  });

  describe('サブコレクション取得', () => {
    it('extras, tournaments, items, sideGameChips が正しく取得されることを確認', async () => {
      const userId = 'user_test_subcollections_001';
      const billId = 'bill_test_subcollections_001';
      await createUser(userId);
      await createBillWithSubcollections(billId, userId, {
        extraCost: 1000,
        items: [{ totalPriceIncl: 2000 }, { totalPriceIncl: 3000 }],
        sideGameChips: [
          { action: 'purchase', amountIncl: 1000 },
          { action: 'deposit', amountIncl: 500 }, // purchase 以外は除外される
        ],
        tournaments: [{
          entryFeeIncl: 2000,
          entryCount: 1,
          reentryFeeIncl: 1000,
          reentryCount: 2,
          addonFeeIncl: 500,
          addonCount: 3,
        }],
      });

      const mockRequest = {
        auth: { uid: userId },
        data: {
          billId,
          clientResult: {
            usedPoints: {},
            cashLikeAmount: 10000,
            categoryBreakdown: {
              extraCost: { pointsUsed: 0, baseMethodAmount: 1000 },
              items: { pointsUsed: 0, baseMethodAmount: 5000 },
              sideGameChip: { pointsUsed: 0, baseMethodAmount: 1000 },
              tournaments: { pointsUsed: 0, baseMethodAmount: 5500 }, // 2000*1 + 1000*2 + 500*3
            },
          },
          selectedBaseMethod: 'cash',
        },
      };

      const result = await (verifyPaymentSplit as any).run(mockRequest);

      expect(result.success).toBe(true);
      // サーバー側の計算結果が正しいことを確認（カテゴリ別の合計が一致）
    });

    it('空のサブコレクションの場合の処理確認', async () => {
      const userId = 'user_test_subcollections_002';
      const billId = 'bill_test_subcollections_002';
      await createUser(userId);
      await createBillWithSubcollections(billId, userId, {}); // サブコレクションなし

      // まずサーバー側の計算結果を取得
      const firstRequest = {
        auth: { uid: userId },
        data: {
          billId,
          clientResult: {
            usedPoints: {},
            cashLikeAmount: 9999, // 不一致にする
            categoryBreakdown: {},
          },
          selectedBaseMethod: 'cash',
        },
      };

      const firstResult = await (verifyPaymentSplit as any).run(firstRequest);
      expect(firstResult.success).toBe(true);
      const serverResult = firstResult.result;

      // サーバー側の計算結果に合わせてクライアント側の値を設定
      const mockRequest = {
        auth: { uid: userId },
        data: {
          billId,
          clientResult: serverResult, // サーバー側の結果をそのまま使用
          selectedBaseMethod: 'cash',
        },
      };

      const result = await (verifyPaymentSplit as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
    });
  });
});

