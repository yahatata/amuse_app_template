/**
 * paymentMethodsInference.ts のユニットテスト
 *
 * Firestore 不要。pure 関数の振る舞いを検証する。
 */

import {
  resolveBaseMethod,
  buildPaymentMethodsByCategory,
} from '../../src/domains/bills/services/paymentMethodsInference';

// ---------------------------------------------------------------------------
// resolveBaseMethod
// ---------------------------------------------------------------------------

describe('resolveBaseMethod', () => {
  it('現金のみ → cash を返す', () => {
    expect(resolveBaseMethod({ cash: 5000 })).toBe('cash');
  });

  it('クレジットカードのみ → credit_card を返す', () => {
    expect(resolveBaseMethod({ credit_card: 3000 })).toBe('credit_card');
  });

  it('電子マネーのみ → electronic_money を返す', () => {
    expect(resolveBaseMethod({ electronic_money: 2000 })).toBe('electronic_money');
  });

  it('cash > credit_card → cash を返す', () => {
    expect(resolveBaseMethod({ cash: 5000, credit_card: 3000 })).toBe('cash');
  });

  it('credit_card > cash → credit_card を返す', () => {
    expect(resolveBaseMethod({ cash: 2000, credit_card: 5000 })).toBe('credit_card');
  });

  it('同額の場合は cash を優先（NON_SPECIAL_METHODS 先頭順）', () => {
    expect(resolveBaseMethod({ cash: 5000, credit_card: 5000 })).toBe('cash');
  });

  it('ポイントのみ（non-special なし）→ null を返す', () => {
    expect(resolveBaseMethod({ pointA: 3000 })).toBeNull();
  });

  it('空の paymentTotals → null を返す', () => {
    expect(resolveBaseMethod({})).toBeNull();
  });

  it('ポイント + cash → cash を返す', () => {
    expect(resolveBaseMethod({ cash: 4000, pointA: 3000 })).toBe('cash');
  });

  it('金額が 0 の non-special は無視される', () => {
    expect(resolveBaseMethod({ cash: 0, credit_card: 2000 })).toBe('credit_card');
  });

  it('全ての non-special が 0 → null を返す', () => {
    expect(resolveBaseMethod({ cash: 0, credit_card: 0, electronic_money: 0 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildPaymentMethodsByCategory
// ---------------------------------------------------------------------------

const DEFAULT_CATEGORY_ORDER = ['extraCost', 'sideGameChip', 'tournaments', 'items'];
const DEFAULT_POINT_PRIORITY = ['pointA', 'pointB', 'sideGameChip'];

describe('buildPaymentMethodsByCategory', () => {
  describe('ポイントなし（現金のみ）', () => {
    it('全カテゴリが現金払い → 全て文字列形式 "cash"', () => {
      const billForSplit = {
        extraCost: 1000,
        sideGameChip: 0,
        tournaments: 500,
        items: 2000,
      };
      const splitCategoryBreakdown = {
        extraCost: { pointsUsed: 0, baseMethodAmount: 1000 },
        sideGameChip: { pointsUsed: 0, baseMethodAmount: 0 },
        tournaments: { pointsUsed: 0, baseMethodAmount: 500 },
        items: { pointsUsed: 0, baseMethodAmount: 2000 },
      };

      const result = buildPaymentMethodsByCategory({
        categoryOrder: DEFAULT_CATEGORY_ORDER,
        billForSplit,
        splitCategoryBreakdown,
        usedPoints: {},
        pointPriority: DEFAULT_POINT_PRIORITY,
        selectedBaseMethod: 'cash',
      });

      expect(result.extraCost).toBe('cash');
      expect(result.tournaments).toBe('cash');
      expect(result.items).toBe('cash');
      expect(result.sideGameChip).toBeUndefined(); // 金額 0 はスキップ
    });

    it('金額 0 のカテゴリはスキップされる', () => {
      const billForSplit = { extraCost: 0, items: 1000 };
      const splitCategoryBreakdown = {
        extraCost: { pointsUsed: 0, baseMethodAmount: 0 },
        items: { pointsUsed: 0, baseMethodAmount: 1000 },
      };

      const result = buildPaymentMethodsByCategory({
        categoryOrder: ['extraCost', 'items'],
        billForSplit,
        splitCategoryBreakdown,
        usedPoints: {},
        pointPriority: DEFAULT_POINT_PRIORITY,
        selectedBaseMethod: 'cash',
      });

      expect(result.extraCost).toBeUndefined();
      expect(result.items).toBe('cash');
    });
  });

  describe('ポイントあり（混在）', () => {
    it('items が pointA + cash → 配列形式', () => {
      const billForSplit = {
        extraCost: 1000,
        sideGameChip: 0,
        tournaments: 0,
        items: 3000, // pointA:1000 + cash:2000
      };
      const splitCategoryBreakdown = {
        extraCost: { pointsUsed: 0, baseMethodAmount: 1000 },
        sideGameChip: { pointsUsed: 0, baseMethodAmount: 0 },
        tournaments: { pointsUsed: 0, baseMethodAmount: 0 },
        items: { pointsUsed: 1000, baseMethodAmount: 2000 },
      };

      const result = buildPaymentMethodsByCategory({
        categoryOrder: DEFAULT_CATEGORY_ORDER,
        billForSplit,
        splitCategoryBreakdown,
        usedPoints: { pointA: 1000 },
        pointPriority: DEFAULT_POINT_PRIORITY,
        selectedBaseMethod: 'cash',
      });

      expect(result.extraCost).toBe('cash');
      expect(result.items).toEqual([
        { method: 'pointA', amount: 1000 },
        { method: 'cash', amount: 2000 },
      ]);
    });

    it('items が全額 pointA → 配列形式（baseMethod なし）', () => {
      const billForSplit = { items: 2000 };
      const splitCategoryBreakdown = {
        items: { pointsUsed: 2000, baseMethodAmount: 0 },
      };

      const result = buildPaymentMethodsByCategory({
        categoryOrder: ['items'],
        billForSplit,
        splitCategoryBreakdown,
        usedPoints: { pointA: 2000 },
        pointPriority: DEFAULT_POINT_PRIORITY,
        selectedBaseMethod: 'cash',
      });

      expect(result.items).toEqual([{ method: 'pointA', amount: 2000 }]);
    });

    it('tournaments が pointA + pointB + cash → 3要素の配列', () => {
      // tournaments: 5000（pointA:2000 + pointB:1000 + cash:2000）
      const billForSplit = { tournaments: 5000 };
      const splitCategoryBreakdown = {
        tournaments: { pointsUsed: 3000, baseMethodAmount: 2000 },
      };

      const result = buildPaymentMethodsByCategory({
        categoryOrder: ['tournaments'],
        billForSplit,
        splitCategoryBreakdown,
        usedPoints: { pointA: 2000, pointB: 1000 },
        pointPriority: DEFAULT_POINT_PRIORITY,
        selectedBaseMethod: 'cash',
      });

      expect(result.tournaments).toEqual([
        { method: 'pointA', amount: 2000 },
        { method: 'pointB', amount: 1000 },
        { method: 'cash', amount: 2000 },
      ]);
    });

    it('selectedBaseMethod が credit_card の場合も配列末尾に正しく入る', () => {
      const billForSplit = { items: 3000 };
      const splitCategoryBreakdown = {
        items: { pointsUsed: 1000, baseMethodAmount: 2000 },
      };

      const result = buildPaymentMethodsByCategory({
        categoryOrder: ['items'],
        billForSplit,
        splitCategoryBreakdown,
        usedPoints: { pointA: 1000 },
        pointPriority: DEFAULT_POINT_PRIORITY,
        selectedBaseMethod: 'credit_card',
      });

      expect(result.items).toEqual([
        { method: 'pointA', amount: 1000 },
        { method: 'credit_card', amount: 2000 },
      ]);
    });
  });

  describe('カテゴリ順', () => {
    it('categoryOrder にないカテゴリは出力されない', () => {
      const billForSplit = { extraCost: 1000, items: 2000, unknown: 500 };
      const splitCategoryBreakdown = {
        extraCost: { pointsUsed: 0, baseMethodAmount: 1000 },
        items: { pointsUsed: 0, baseMethodAmount: 2000 },
        unknown: { pointsUsed: 0, baseMethodAmount: 500 },
      };

      const result = buildPaymentMethodsByCategory({
        categoryOrder: ['extraCost', 'items'], // unknown は含まない
        billForSplit,
        splitCategoryBreakdown,
        usedPoints: {},
        pointPriority: DEFAULT_POINT_PRIORITY,
        selectedBaseMethod: 'cash',
      });

      expect(result.extraCost).toBe('cash');
      expect(result.items).toBe('cash');
      expect(result.unknown).toBeUndefined();
    });
  });
});
