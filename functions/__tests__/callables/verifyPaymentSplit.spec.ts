/**
 * verifyPaymentSplit の統合テスト（A-7）
 *
 * - 一致時: verified true
 * - 不一致時: PAYMENT_SPLIT_MISMATCH で拒否（サーバ結果の黙って採用はしない）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyPaymentSplit } from '../../src/domains/bills/callables/verifyPaymentSplit';

jest.mock('../../src/shared/config/configLoader', () => {
  const actual = jest.requireActual('../../src/shared/config/configLoader');
  return {
    ...actual,
    getStoreConfig: jest.fn(async () =>
      actual.mergeWithDefaults(
        require('../helpers/a7StoreConfig').a7StoreConfigDocument(),
      ),
    ),
  };
});

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
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({
      projectId,
    });

    db = getFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  async function createUser(
    userId: string,
    balances: { pointA?: number; pointB?: number; sideGameChip?: number } = {},
  ) {
    await db.collection('users').doc(userId).set({
      pointA: balances.pointA || 0,
      pointB: balances.pointB || 0,
      pointC: 0,
      pointD: 0,
      pointE: 0,
      sideGameChip: balances.sideGameChip || 0,
    });
  }

  async function createBillWithSubcollections(
    billId: string,
    userId: string,
    options: {
      extraCost?: number;
      items?: Array<{ totalPriceIncl: number }>;
      sideGameChips?: Array<{ action: string; amountIncl: number }>;
      tournaments?: Array<{
        entryFeeIncl: number;
        entryCount: number;
        reentryFeeIncl: number;
        reentryCount: number;
        addonFeeIncl: number;
        addonCount: number;
      }>;
    } = {},
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

    if (options.extraCost) {
      await billRef.collection('extras').doc('extra_001').set({
        name: '入店料',
        amountIncl: options.extraCost,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

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
    it('ポイント充当ありの自動計算と一致する', async () => {
      const userId = 'user_test_happy_001';
      const billId = 'bill_test_happy_001';
      await createUser(userId, { pointA: 1000, pointB: 500 });
      await createBillWithSubcollections(billId, userId, {
        extraCost: 1000,
        items: [{ totalPriceIncl: 3000 }, { totalPriceIncl: 2000 }],
        sideGameChips: [{ action: 'purchase', amountIncl: 1000 }],
        tournaments: [
          {
            entryFeeIncl: 2000,
            entryCount: 1,
            reentryFeeIncl: 0,
            reentryCount: 0,
            addonFeeIncl: 0,
            addonCount: 0,
          },
        ],
      });

      // categoryOrder: extraCost → sideGameChip → tournaments → items
      // extraCost/sideGameChip はポイント不可 → cash
      // tournaments 2000: pointA 1000 + pointB 500 + cash 500
      // items 5000: cash 5000
      const mockRequest = {
        auth: { uid: userId },
        data: {
          billId,
          clientResult: {
            usedPoints: { pointA: 1000, pointB: 500 },
            cashLikeAmount: 7500,
            categoryBreakdown: {
              extraCost: { pointsUsed: 0, baseMethodAmount: 1000 },
              sideGameChip: { pointsUsed: 0, baseMethodAmount: 1000 },
              tournaments: { pointsUsed: 1500, baseMethodAmount: 500 },
              items: { pointsUsed: 0, baseMethodAmount: 5000 },
            },
          },
          selectedBaseMethod: 'cash',
        },
      };

      const result = await (verifyPaymentSplit as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
    });

    it('クライアント側とサーバー側の結果が一致する場合', async () => {
      const userId = 'user_test_happy_002';
      const billId = 'bill_test_happy_002';
      await createUser(userId);
      await createBillWithSubcollections(billId, userId, {
        items: [{ totalPriceIncl: 10000 }],
      });

      const mockRequest = {
        auth: { uid: userId },
        data: {
          billId,
          clientResult: {
            usedPoints: {},
            cashLikeAmount: 10000,
            categoryBreakdown: {
              extraCost: { pointsUsed: 0, baseMethodAmount: 0 },
              sideGameChip: { pointsUsed: 0, baseMethodAmount: 0 },
              tournaments: { pointsUsed: 0, baseMethodAmount: 0 },
              items: { pointsUsed: 0, baseMethodAmount: 10000 },
            },
          },
          selectedBaseMethod: 'cash',
        },
      };

      const result = await (verifyPaymentSplit as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.message).toContain('一致');
    });

    it('不一致の場合は PAYMENT_SPLIT_MISMATCH で拒否する', async () => {
      const userId = 'user_test_happy_003';
      const billId = 'bill_test_happy_003';
      await createUser(userId);
      await createBillWithSubcollections(billId, userId, {
        items: [{ totalPriceIncl: 10000 }],
      });

      const mockRequest = {
        auth: { uid: userId },
        data: {
          billId,
          clientResult: {
            usedPoints: {},
            cashLikeAmount: 5000,
            categoryBreakdown: {
              items: { pointsUsed: 0, baseMethodAmount: 5000 },
            },
          },
          selectedBaseMethod: 'cash',
        },
      };

      await expect((verifyPaymentSplit as any).run(mockRequest)).rejects.toMatchObject({
        code: 'failed-precondition',
        details: expect.objectContaining({ errorKey: 'PAYMENT_SPLIT_MISMATCH' }),
      });
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
          { action: 'deposit', amountIncl: 500 },
        ],
        tournaments: [
          {
            entryFeeIncl: 2000,
            entryCount: 1,
            reentryFeeIncl: 1000,
            reentryCount: 2,
            addonFeeIncl: 500,
            addonCount: 3,
          },
        ],
      });

      // totals: extra 1000 + items 5000 + chip 1000 + tourney 5500 = 12500 all cash
      const mockRequest = {
        auth: { uid: userId },
        data: {
          billId,
          clientResult: {
            usedPoints: {},
            cashLikeAmount: 12500,
            categoryBreakdown: {
              extraCost: { pointsUsed: 0, baseMethodAmount: 1000 },
              sideGameChip: { pointsUsed: 0, baseMethodAmount: 1000 },
              tournaments: { pointsUsed: 0, baseMethodAmount: 5500 },
              items: { pointsUsed: 0, baseMethodAmount: 5000 },
            },
          },
          selectedBaseMethod: 'cash',
        },
      };

      const result = await (verifyPaymentSplit as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
    });

    it('空のサブコレクションでも一致照合できる', async () => {
      const userId = 'user_test_subcollections_002';
      const billId = 'bill_test_subcollections_002';
      await createUser(userId);
      await createBillWithSubcollections(billId, userId, {});

      const mockRequest = {
        auth: { uid: userId },
        data: {
          billId,
          clientResult: {
            usedPoints: {},
            cashLikeAmount: 0,
            categoryBreakdown: {
              extraCost: { pointsUsed: 0, baseMethodAmount: 0 },
              sideGameChip: { pointsUsed: 0, baseMethodAmount: 0 },
              tournaments: { pointsUsed: 0, baseMethodAmount: 0 },
              items: { pointsUsed: 0, baseMethodAmount: 0 },
            },
          },
          selectedBaseMethod: 'cash',
        },
      };

      const result = await (verifyPaymentSplit as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
    });
  });
});
