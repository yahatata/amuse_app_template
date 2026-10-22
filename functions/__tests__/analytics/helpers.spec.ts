/**
 * analytics helpers のテスト
 *
 * distributePaymentMethods / distributePaymentMethodsWithIssues の退行対策を検証
 */

import {
  distributePaymentMethods,
  distributePaymentMethodsWithIssues,
  calculateCategoryAmounts,
} from '../../src/domains/analytics/services/helpers';

describe('analytics helpers', () => {
  describe('distributePaymentMethodsWithIssues', () => {
    it('paymentTotals undefined + fallbackCashAmount=1000 -> cash=1000 + WITH_FALLBACK issue', () => {
      const result = distributePaymentMethodsWithIssues(undefined, {
        fallbackCashAmount: 1000,
      });

      expect(result.paymentTotalsMap.size).toBe(1);
      expect(result.paymentTotalsMap.get('cash')).toBe(1000);
      expect(result.issues).toEqual([
        { kind: 'PAYMENT_TOTALS_EMPTY_WITH_FALLBACK', fallbackCashAmount: 1000 },
      ]);
    });

    it('paymentTotals {} + fallbackCashAmount=1000 -> cash=1000 + WITH_FALLBACK issue', () => {
      const result = distributePaymentMethodsWithIssues({}, {
        fallbackCashAmount: 1000,
      });

      expect(result.paymentTotalsMap.size).toBe(1);
      expect(result.paymentTotalsMap.get('cash')).toBe(1000);
      expect(result.issues.some(i => i.kind === 'PAYMENT_TOTALS_EMPTY_WITH_FALLBACK')).toBe(true);
    });

    it('A-7: 未知 method は cash へ混入せず UNKNOWN issue', () => {
      const result = distributePaymentMethodsWithIssues(
        { cash: 500, weird: 300 },
        {
          validMethods: ['cash', 'credit_card'],
        }
      );

      expect(result.paymentTotalsMap.size).toBe(1);
      expect(result.paymentTotalsMap.get('cash')).toBe(500);
      expect(result.paymentTotalsMap.has('weird')).toBe(false);
      expect(result.issues).toContainEqual({
        kind: 'PAYMENT_TOTALS_UNKNOWN_METHODS',
        invalidMethodCount: 1,
        unknownMethods: ['weird'],
      });
    });

    it('paymentTotals { card: 0 } -> empty Map + no issues', () => {
      const result = distributePaymentMethodsWithIssues({ card: 0 });

      expect(result.paymentTotalsMap.size).toBe(0);
      expect(result.issues).toEqual([]);
    });

    it('paymentTotals が null で fallbackCashAmount がある場合は cash に配賦 + WITH_FALLBACK', () => {
      const result = distributePaymentMethodsWithIssues(null, {
        fallbackCashAmount: 2000,
      });

      expect(result.paymentTotalsMap.size).toBe(1);
      expect(result.paymentTotalsMap.get('cash')).toBe(2000);
      expect(result.issues[0]?.kind).toBe('PAYMENT_TOTALS_EMPTY_WITH_FALLBACK');
    });

    it('paymentTotals が undefined で fallbackCashAmount も無い場合、空Map + NO_FALLBACK issue', () => {
      const result = distributePaymentMethodsWithIssues(undefined);

      expect(result.paymentTotalsMap.size).toBe(0);
      expect(result.issues).toEqual([{ kind: 'PAYMENT_TOTALS_EMPTY_NO_FALLBACK' }]);
    });

    it('有効な method はそのまま使用（issue なし）', () => {
      const result = distributePaymentMethodsWithIssues({
        cash: 1000,
        credit_card: 2000,
        pointA: 500,
        pointC: 100,
        sideGameChip: 50,
      });

      expect(result.paymentTotalsMap.get('cash')).toBe(1000);
      expect(result.paymentTotalsMap.get('credit_card')).toBe(2000);
      expect(result.paymentTotalsMap.get('pointA')).toBe(500);
      expect(result.paymentTotalsMap.get('pointC')).toBe(100);
      expect(result.paymentTotalsMap.get('sideGameChip')).toBe(50);
      expect(result.issues).toEqual([]);
    });

    it('複数の未知 method は cash に寄せず issue のみ', () => {
      const result = distributePaymentMethodsWithIssues(
        {
          cash: 1000,
          invalid1: 200,
          invalid2: 300,
        },
        {
          validMethods: ['cash', 'credit_card'],
        }
      );

      expect(result.paymentTotalsMap.size).toBe(1);
      expect(result.paymentTotalsMap.get('cash')).toBe(1000);
      expect(result.issues).toContainEqual({
        kind: 'PAYMENT_TOTALS_UNKNOWN_METHODS',
        invalidMethodCount: 2,
        unknownMethods: ['invalid1', 'invalid2'],
      });
    });

    it('amount <= 0 は無視される', () => {
      const result = distributePaymentMethodsWithIssues({
        cash: 1000,
        credit_card: 0,
        pointA: -100,
      });

      expect(result.paymentTotalsMap.size).toBe(1);
      expect(result.paymentTotalsMap.get('cash')).toBe(1000);
      expect(result.paymentTotalsMap.has('credit_card')).toBe(false);
      expect(result.paymentTotalsMap.has('pointA')).toBe(false);
    });
  });

  describe('distributePaymentMethods (Map のみ)', () => {
    it('互換: WithIssues と同じ Map', () => {
      const full = distributePaymentMethodsWithIssues(undefined, {
        fallbackCashAmount: 100,
      });
      const mapOnly = distributePaymentMethods(undefined, { fallbackCashAmount: 100 });
      expect(mapOnly.size).toBe(full.paymentTotalsMap.size);
      expect([...mapOnly.entries()].sort()).toEqual([...full.paymentTotalsMap.entries()].sort());
    });
  });

  describe('calculateCategoryAmounts', () => {
    it('categoryBreakdown から items/extraCost/sideGameChips/tournaments が正しく map される（キーの単複一致も含む）', () => {
      const billData = {
        categoryBreakdown: {
          items: 1000,
          extraCost: 500,
          sideGameChips: 300,
          tournaments: 200,
        },
      };

      const result = calculateCategoryAmounts(billData);

      expect(result.get('items')).toBe(1000);
      expect(result.get('extraCost')).toBe(500);
      expect(result.get('sideGameChip')).toBe(300);
      expect(result.get('tournaments')).toBe(200);
    });

    it('categoryBreakdown が欠損している場合は空Mapを返す', () => {
      const billData = {};

      const result = calculateCategoryAmounts(billData);

      expect(result.size).toBe(0);
    });

    it('categoryBreakdown の一部が欠損している場合も正しく処理', () => {
      const billData = {
        categoryBreakdown: {
          items: 1000,
          sideGameChips: 300,
        },
      };

      const result = calculateCategoryAmounts(billData);

      expect(result.get('items')).toBe(1000);
      expect(result.get('extraCost')).toBeUndefined();
      expect(result.get('sideGameChip')).toBe(300);
      expect(result.get('tournaments')).toBeUndefined();
    });
  });
});
