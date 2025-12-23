/**
 * analytics helpers のテスト
 * 
 * distributePaymentMethods の退行対策を検証
 */

import { distributePaymentMethods, calculateCategoryAmounts } from '../../src/analytics/helpers';

describe('analytics helpers', () => {
  describe('distributePaymentMethods', () => {
    it('paymentTotals undefined + fallbackCashAmount=1000 -> cash=1000', () => {
      const result = distributePaymentMethods(undefined, {
        fallbackCashAmount: 1000,
      });
      
      expect(result.size).toBe(1);
      expect(result.get('cash')).toBe(1000);
    });

    it('paymentTotals {} + fallbackCashAmount=1000 -> cash=1000', () => {
      const result = distributePaymentMethods({}, {
        fallbackCashAmount: 1000,
      });
      
      expect(result.size).toBe(1);
      expect(result.get('cash')).toBe(1000);
    });

    it('paymentTotals { cash: 500, weird: 300 } + validMethods -> cash=800 (weirdがcashへ寄せ)', () => {
      const result = distributePaymentMethods(
        { cash: 500, weird: 300 },
        {
          validMethods: ['cash', 'credit_card'],
        }
      );
      
      expect(result.size).toBe(1);
      expect(result.get('cash')).toBe(800); // 500 + 300 (weirdがcashへ寄せ)
      expect(result.has('weird')).toBe(false);
    });

    it('paymentTotals { card: 0 } -> empty', () => {
      const result = distributePaymentMethods({ card: 0 });
      
      expect(result.size).toBe(0);
    });

    it('paymentTotals が null の場合、fallbackCashAmount があれば cash に配賦', () => {
      const result = distributePaymentMethods(null, {
        fallbackCashAmount: 2000,
      });
      
      expect(result.size).toBe(1);
      expect(result.get('cash')).toBe(2000);
    });

    it('paymentTotals が undefined で fallbackCashAmount も無い場合、空Mapを返す', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const result = distributePaymentMethods(undefined);
      
      expect(result.size).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalled();
      
      consoleWarnSpy.mockRestore();
    });

    it('有効な method はそのまま使用', () => {
      const result = distributePaymentMethods({
        cash: 1000,
        credit_card: 2000,
        pointA: 500,
      });
      
      expect(result.size).toBe(3);
      expect(result.get('cash')).toBe(1000);
      expect(result.get('credit_card')).toBe(2000);
      expect(result.get('pointA')).toBe(500);
    });

    it('複数の無効methodが cash に寄せられる', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const result = distributePaymentMethods({
        cash: 1000,
        invalid1: 200,
        invalid2: 300,
      }, {
        validMethods: ['cash', 'credit_card'],
      });
      
      expect(result.size).toBe(1);
      expect(result.get('cash')).toBe(1500); // 1000 + 200 + 300
      expect(consoleWarnSpy).toHaveBeenCalled();
      
      consoleWarnSpy.mockRestore();
    });

    it('amount <= 0 は無視される', () => {
      const result = distributePaymentMethods({
        cash: 1000,
        credit_card: 0,
        pointA: -100,
      });
      
      expect(result.size).toBe(1);
      expect(result.get('cash')).toBe(1000);
      expect(result.has('credit_card')).toBe(false);
      expect(result.has('pointA')).toBe(false);
    });
  });

  describe('calculateCategoryAmounts', () => {
    it('categoryBreakdown から items/extraCost/sideGameChips/tournaments が正しく map される（キーの単複一致も含む）', () => {

      const billData = {
        categoryBreakdown: {
          items: 1000,
          extraCost: 500,
          sideGameChips: 300, // 複数形
          tournaments: 200,
        },
      };

      const result = calculateCategoryAmounts(billData);

      expect(result.get('items')).toBe(1000);
      expect(result.get('extraCost')).toBe(500);
      expect(result.get('sideGameChip')).toBe(300); // 単数形にマップ
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
          // extraCost は欠損
          sideGameChips: 300,
          // tournaments は欠損
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

