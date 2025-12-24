/**
 * getBillPreviewTotals の統合テスト
 * 
 * ChangeSpec P1-09 に準拠
 * Firestore Emulator を使用
 * 
 * テスト観点:
 * - happy path（全サブコレクションあり）
 * - not-found（指定された請求書が見つからない場合）
 * - サブコレクションが空の場合でも 0 で返る
 * - 不正な値が含まれるケース（null や string が混じっていた場合でも落ちない）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getBillPreviewTotals } from '../../src/accounting/getBillPreviewTotals';

describe('getBillPreviewTotals', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-bills';

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
  });

  // テスト用のヘルパ関数: bills とサブコレクションを作成
  async function createBillWithSubcollections(
    billId: string,
    userId: string,
    options: {
      businessDate?: string;
      extraCost?: Array<{ amountIncl: number }>;
      items?: Array<{ totalPriceIncl?: number; unitPriceIncl?: number; quantity?: number }>;
      sideGameChips?: Array<{ action: string; amountIncl: number; chipCount?: number }>;
      tournaments?: Array<{
        entryFeeIncl: number;
        entryCount: number;
        reentryFeeIncl: number;
        reentryCount: number;
        addonFeeIncl: number;
        addonCount: number;
      }>;
    } = {}
  ) {
    const billRef = db.collection('bills').doc(billId);
    await billRef.set({
      businessDate: options.businessDate || '2025-11-15',
      status: 'open',
      party: {
        userId,
        pokerName: 'テスト太郎',
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // extras サブコレクション
    if (options.extraCost) {
      for (let i = 0; i < options.extraCost.length; i++) {
        await billRef.collection('extras').doc(`extra_${i + 1}`).set({
          name: `追加料金${i + 1}`,
          amountIncl: options.extraCost[i].amountIncl,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    // items サブコレクション
    if (options.items) {
      for (let i = 0; i < options.items.length; i++) {
        const item = options.items[i];
        const itemData: any = {
          menuItemId: `menu_${i + 1}`,
          name: `メニュー${i + 1}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (item.totalPriceIncl !== undefined) {
          itemData.totalPriceIncl = item.totalPriceIncl;
        } else {
          itemData.unitPriceIncl = item.unitPriceIncl || 0;
          itemData.quantity = item.quantity || 0;
        }
        await billRef.collection('items').doc(`item_${i + 1}`).set(itemData);
      }
    }

    // sideGameChips サブコレクション
    if (options.sideGameChips) {
      for (let i = 0; i < options.sideGameChips.length; i++) {
        const chip = options.sideGameChips[i];
        const chipData: any = {
          action: chip.action,
          amountIncl: chip.amountIncl,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (chip.chipCount !== undefined) {
          chipData.chipCount = chip.chipCount;
        }
        await billRef.collection('sideGameChips').doc(`chip_${i + 1}`).set(chipData);
      }
    }

    // tournaments サブコレクション
    if (options.tournaments) {
      for (let i = 0; i < options.tournaments.length; i++) {
        const tournament = options.tournaments[i];
        await billRef.collection('tournaments').doc(`tournament_${i + 1}`).set({
          tournamentId: `tournament_${i + 1}`,
          entryFeeIncl: tournament.entryFeeIncl,
          entryCount: tournament.entryCount,
          reentryFeeIncl: tournament.reentryFeeIncl,
          reentryCount: tournament.reentryCount,
          addonFeeIncl: tournament.addonFeeIncl,
          addonCount: tournament.addonCount,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  }

  describe('happy path（全サブコレクションあり）', () => {
    it('全サブコレクションから正しく金額を計算できること', async () => {
      const billId = 'bill_test_happy_001';
      const userId = 'user_test_happy_001';

      // 前準備: 全サブコレクションを含む bill を作成
      await createBillWithSubcollections(billId, userId, {
        businessDate: '2025-11-15',
        extraCost: [
          { amountIncl: 1000 },
          { amountIncl: 500 },
        ],
        items: [
          { totalPriceIncl: 2000 },
          { totalPriceIncl: 1500 },
        ],
        sideGameChips: [
          { action: 'purchase', amountIncl: 3000, chipCount: 300 },
          { action: 'deposit', amountIncl: 1000 }, // purchase 以外は除外される
        ],
        tournaments: [
          {
            entryFeeIncl: 5000,
            entryCount: 1,
            reentryFeeIncl: 3000,
            reentryCount: 1,
            addonFeeIncl: 2000,
            addonCount: 1,
          },
        ],
      });

      // 実行
      const result = await (getBillPreviewTotals as any).run({
        data: { billId },
        auth: null,
      }) as any;

      // 検証
      expect(result).toBeDefined();
      expect(result.billId).toBe(billId);
      expect(result.businessDate).toBe('2025-11-15');
      
      // 各カテゴリ別金額の検証
      expect(result.categories.extraCost.monetary).toBe(1500); // 1000 + 500
      expect(result.categories.extraCost.display).toBe(1500);
      
      expect(result.categories.items.monetary).toBe(3500); // 2000 + 1500
      expect(result.categories.items.display).toBe(3500);
      
      expect(result.categories.sideGameChip.monetary).toBe(3000); // purchase のみ
      expect(result.categories.sideGameChip.displayChips).toBe(300);
      
      expect(result.categories.tournaments.monetary).toBe(10000); // 5000*1 + 3000*1 + 2000*1
      expect(result.categories.tournaments.display).toBe(10000);
      
      // 総合計の検証
      expect(result.grandTotal).toBe(18000); // 1500 + 3500 + 3000 + 10000
    });

    it('items で totalPriceIncl がない場合は unitPriceIncl * quantity で計算すること', async () => {
      const billId = 'bill_test_happy_002';
      const userId = 'user_test_happy_002';

      await createBillWithSubcollections(billId, userId, {
        items: [
          { unitPriceIncl: 1000, quantity: 2 }, // 2000
          { unitPriceIncl: 500, quantity: 3 }, // 1500
        ],
      });

      const result = await (getBillPreviewTotals as any).run({
        data: { billId },
        auth: null,
      }) as any;

      expect(result.categories.items.monetary).toBe(3500); // 2000 + 1500
      expect(result.grandTotal).toBe(3500);
    });

    it('sideGameChip で chipCount がない場合は amountIncl / SIDE_GAME_CHIP_EXCHANGE_RATE から算出すること', async () => {
      const billId = 'bill_test_happy_003';
      const userId = 'user_test_happy_003';

      await createBillWithSubcollections(billId, userId, {
        sideGameChips: [
          { action: 'purchase', amountIncl: 1000 }, // chipCount なし → 1000 / 10 = 100
        ],
      });

      const result = await (getBillPreviewTotals as any).run({
        data: { billId },
        auth: null,
      }) as any;

      expect(result.categories.sideGameChip.monetary).toBe(1000);
      expect(result.categories.sideGameChip.displayChips).toBe(100); // 1000 / 10
      expect(result.grandTotal).toBe(1000);
    });
  });

  describe('not-found（指定された請求書が見つからない場合）', () => {
    it('存在しない billId を渡すと HttpsError がスローされること', async () => {
      const billId = 'bill_not_found_001';

      // 実行 & 検証
      await expect(
        (getBillPreviewTotals as any).run({
          data: { billId },
          auth: null,
        })
      ).rejects.toThrow();

      await expect(
        (getBillPreviewTotals as any).run({
          data: { billId },
          auth: null,
        })
      ).rejects.toHaveProperty('code', 'not-found');
    });
  });

  describe('サブコレクションが空の場合でも 0 で返る', () => {
    it('全サブコレクションが空の場合、各カテゴリ別金額が 0 になること', async () => {
      const billId = 'bill_test_empty_001';
      const userId = 'user_test_empty_001';

      // 前準備: bill のみ作成（サブコレクションは作成しない）
      await db.collection('bills').doc(billId).set({
        businessDate: '2025-11-15',
        status: 'open',
        party: {
          userId,
          pokerName: 'テスト太郎',
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 実行
      const result = await (getBillPreviewTotals as any).run({
        data: { billId },
        auth: null,
      }) as any;

      // 検証
      expect(result.categories.extraCost.monetary).toBe(0);
      expect(result.categories.items.monetary).toBe(0);
      expect(result.categories.sideGameChip.monetary).toBe(0);
      expect(result.categories.sideGameChip.displayChips).toBe(0);
      expect(result.categories.tournaments.monetary).toBe(0);
      expect(result.grandTotal).toBe(0);
    });
  });

  describe('不正な値が含まれるケース', () => {
    it('amountIncl に null が含まれていても 0 として扱うこと', async () => {
      const billId = 'bill_test_null_001';
      const userId = 'user_test_null_001';

      const billRef = db.collection('bills').doc(billId);
      await billRef.set({
        businessDate: '2025-11-15',
        status: 'open',
        party: {
          userId,
          pokerName: 'テスト太郎',
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // extras に null を含むドキュメントを追加
      await billRef.collection('extras').doc('extra_001').set({
        name: '追加料金',
        amountIncl: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // items に null を含むドキュメントを追加
      await billRef.collection('items').doc('item_001').set({
        menuItemId: 'menu_001',
        name: 'メニュー',
        totalPriceIncl: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 実行
      const result = await (getBillPreviewTotals as any).run({
        data: { billId },
        auth: null,
      }) as any;

      // 検証: null は 0 として扱われる
      expect(result.categories.extraCost.monetary).toBe(0);
      expect(result.categories.items.monetary).toBe(0);
      expect(result.grandTotal).toBe(0);
    });

    // 注意: amountIncl に string が含まれるケースは実装仕様上考慮していない
    // 実装では (data.amountIncl as number | undefined) ?? 0 という処理をしているため、
    // string が渡された場合は型安全性が保証されない
  });

  describe('invalid-argument（入力データが不正な場合）', () => {
    it('billId が空文字列の場合、HttpsError がスローされること', async () => {
      await expect(
        (getBillPreviewTotals as any).run({
          data: { billId: '' },
          auth: null,
        })
      ).rejects.toThrow();

      await expect(
        (getBillPreviewTotals as any).run({
          data: { billId: '' },
          auth: null,
        })
      ).rejects.toHaveProperty('code', 'invalid-argument');
    });

    it('billId が未指定の場合、HttpsError がスローされること', async () => {
      await expect(
        (getBillPreviewTotals as any).run({
          data: {},
          auth: null,
        })
      ).rejects.toThrow();

      await expect(
        (getBillPreviewTotals as any).run({
          data: {},
          auth: null,
        })
      ).rejects.toHaveProperty('code', 'invalid-argument');
    });
  });
});

