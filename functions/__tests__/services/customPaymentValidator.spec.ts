import { FunctionCustomError } from '../../src/shared/logging/functionCustomError';
import { validateAndNormalizeCustomPayment } from '../../src/domains/bills/services/customPaymentValidator';

const DEFAULT_CATEGORY_PAYMENT_METHODS = {
  extraCost: ['cash', 'credit_card', 'electronic_money'],
  tournaments: ['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameChip'],
  items: ['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameChip'],
  sideGameChip: ['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameChip'],
};

describe('validateAndNormalizeCustomPayment', () => {
  const balances = { pointA: 10000, pointB: 0, sideGameChip: 500 };
  const chipRate = 10;
  const roundingUnits = { pointAB: 1000, sideGameChip: 100 };

  it('入店料現金 + 商品チップ分割（2400円→2000チップ+400現金）', () => {
    const result = validateAndNormalizeCustomPayment({
      categoryAmounts: { extraCost: 3000, items: 2400 },
      paymentMethodsByCategory: {
        extraCost: 'cash',
        items: [
          { method: 'sideGameChip', amount: 200 },
          { method: 'cash', amount: 400 },
        ],
      },
      categoryPaymentMethods: DEFAULT_CATEGORY_PAYMENT_METHODS,
      balances,
      chipRate,
      roundingUnits,
      clientPaymentMethodsByAmount: { cash: 3400, sideGameChip: 2000 },
    });

    expect(result.paymentMethodsByAmount).toEqual({
      cash: 3400,
      sideGameChip: 2000,
    });
  });

  it('入店料をチップで払うと拒否', () => {
    expect(() =>
      validateAndNormalizeCustomPayment({
        categoryAmounts: { extraCost: 3000 },
        paymentMethodsByCategory: { extraCost: 'sideGameChip' },
        categoryPaymentMethods: DEFAULT_CATEGORY_PAYMENT_METHODS,
        balances,
        chipRate,
        roundingUnits,
      }),
    ).toThrow(FunctionCustomError);
  });

  it('商品をチップ全額（丸め余りあり）の単一指定は拒否', () => {
    expect(() =>
      validateAndNormalizeCustomPayment({
        categoryAmounts: { items: 2400 },
        paymentMethodsByCategory: { items: 'sideGameChip' },
        categoryPaymentMethods: DEFAULT_CATEGORY_PAYMENT_METHODS,
        balances,
        chipRate,
        roundingUnits,
      }),
    ).toThrow(FunctionCustomError);
  });

  it('クライアント内訳不一致は拒否', () => {
    expect(() =>
      validateAndNormalizeCustomPayment({
        categoryAmounts: { extraCost: 3000, items: 2400 },
        paymentMethodsByCategory: {
          extraCost: 'cash',
          items: [
            { method: 'sideGameChip', amount: 200 },
            { method: 'cash', amount: 400 },
          ],
        },
        categoryPaymentMethods: DEFAULT_CATEGORY_PAYMENT_METHODS,
        balances,
        chipRate,
        roundingUnits,
        clientPaymentMethodsByAmount: { cash: 3000, sideGameChip: 2400 },
      }),
    ).toThrow(FunctionCustomError);
  });

  it('チップ枚数が丸め単位に合わない分割は拒否', () => {
    expect(() =>
      validateAndNormalizeCustomPayment({
        categoryAmounts: { items: 2400 },
        paymentMethodsByCategory: {
          items: [
            { method: 'sideGameChip', amount: 240 },
            { method: 'cash', amount: 0 },
          ],
        },
        categoryPaymentMethods: DEFAULT_CATEGORY_PAYMENT_METHODS,
        balances,
        chipRate,
        roundingUnits,
      }),
    ).toThrow(FunctionCustomError);
  });
});
