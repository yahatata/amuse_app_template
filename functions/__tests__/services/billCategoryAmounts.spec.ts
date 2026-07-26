import {
  itemLineAmountIncl,
  assertPaymentTotalMatchesCategoryTotal,
  sumCategoryAmounts,
} from '../../src/domains/bills/services/billCategoryAmounts';
import { FunctionCustomError } from '../../src/shared/logging/functionCustomError';

describe('itemLineAmountIncl / category totals', () => {
  it('totalPriceIncl を正本にする', () => {
    expect(
      itemLineAmountIncl({
        unitPriceIncl: 100,
        quantity: 3,
        totalPriceIncl: 250,
      }),
    ).toBe(250);
  });

  it('totalPriceIncl 欠損時は unitPriceIncl * quantity', () => {
    expect(
      itemLineAmountIncl({
        unitPriceIncl: 100,
        quantity: 3,
      }),
    ).toBe(300);
  });

  it('voided は 0', () => {
    expect(
      itemLineAmountIncl({
        voided: true,
        totalPriceIncl: 999,
      }),
    ).toBe(0);
  });

  it('カテゴリ合計と支払合計の不一致を拒否', () => {
    expect(() =>
      assertPaymentTotalMatchesCategoryTotal({
        categoryAmounts: { items: 1000, extraCost: 0, tournaments: 0, sideGameChip: 0 },
        paymentMethodsByAmount: { cash: 900 },
        billId: 'b1',
      }),
    ).toThrow(FunctionCustomError);
  });

  it('一致時は通過', () => {
    const categoryAmounts = {
      items: 700,
      extraCost: 300,
      tournaments: 0,
      sideGameChip: 0,
    };
    expect(sumCategoryAmounts(categoryAmounts)).toBe(1000);
    expect(() =>
      assertPaymentTotalMatchesCategoryTotal({
        categoryAmounts,
        paymentMethodsByAmount: { cash: 400, pointA: 600 },
      }),
    ).not.toThrow();
  });
});
