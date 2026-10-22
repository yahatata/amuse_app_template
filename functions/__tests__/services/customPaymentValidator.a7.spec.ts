import {
  validateAndNormalizeCustomPayment,
} from '../../src/domains/bills/services/customPaymentValidator';
import { FunctionCustomError } from '../../src/shared/logging/functionCustomError';
import type { BalancePaymentSettings } from '../../src/shared/config/types';

const balancePaymentSettings: BalancePaymentSettings = {
  pointA: { usageUnit: 1, conversion: { referenceUnits: 1, balanceUnits: 1 } },
  pointB: { usageUnit: 1, conversion: { referenceUnits: 1, balanceUnits: 1 } },
  pointC: { usageUnit: 1, conversion: { referenceUnits: 1, balanceUnits: 1 } },
  pointD: { usageUnit: 1, conversion: { referenceUnits: 1, balanceUnits: 1 } },
  pointE: { usageUnit: 1, conversion: { referenceUnits: 1, balanceUnits: 1 } },
  sideGameChip: {
    usageUnit: 100,
    conversion: { referenceUnits: 100, balanceUnits: 1 },
  },
};

const categoryPaymentMethods = {
  extraCost: ['cash', 'pointA'],
  sideGameChip: ['cash'],
  tournaments: ['cash', 'pointB'],
  items: ['cash', 'pointA', 'pointB', 'pointC', 'sideGameChip'],
};

const balances = {
  pointA: 1000,
  pointB: 1000,
  pointC: 1000,
  pointD: 0,
  pointE: 0,
  sideGameChip: 10,
};

const balanceEnabled = {
  pointA: true,
  pointB: true,
  pointC: true,
  pointD: false,
  pointE: false,
  sideGameChip: true,
};

describe('validateAndNormalizeCustomPayment (A-7)', () => {
  it('手動 ByCategory を正本として検証し ByAmount/Details を派生する', () => {
    const result = validateAndNormalizeCustomPayment({
      categoryAmounts: {
        extraCost: 0,
        sideGameChip: 0,
        tournaments: 0,
        items: 500,
      },
      paymentMethodsByCategory: {
        items: [
          { method: 'pointB', amount: 200 },
          { method: 'cash', amount: 300 },
        ],
      },
      categoryPaymentMethods,
      balances,
      balancePaymentSettings,
      balanceEnabled,
    });

    expect(result.paymentMethodsByAmount.pointB).toBe(200);
    expect(result.paymentMethodsByAmount.cash).toBe(300);
    expect(result.usedBalanceAmounts.pointB).toBe(200);
    expect(result.paymentMethodDetails.pointB).toMatchObject({
      referenceAmount: 200,
      balanceAmount: 200,
      usageUnit: 1,
      refundedBalanceAmount: 0,
    });
    expect(result.paymentMethodDetails.cash).toBeUndefined();
  });

  it('allowlist 外を拒否する', () => {
    expect(() =>
      validateAndNormalizeCustomPayment({
        categoryAmounts: { items: 100, extraCost: 0, sideGameChip: 0, tournaments: 0 },
        paymentMethodsByCategory: { items: 'pointA' },
        categoryPaymentMethods: { ...categoryPaymentMethods, items: ['cash'] },
        balances,
        balancePaymentSettings,
        balanceEnabled,
      }),
    ).toThrow(FunctionCustomError);
  });

  it('disabled 残高を拒否する', () => {
    expect(() =>
      validateAndNormalizeCustomPayment({
        categoryAmounts: { items: 100, extraCost: 0, sideGameChip: 0, tournaments: 0 },
        paymentMethodsByCategory: { items: 'pointD' },
        categoryPaymentMethods: {
          ...categoryPaymentMethods,
          items: [...categoryPaymentMethods.items, 'pointD'],
        },
        balances: { ...balances, pointD: 100 },
        balancePaymentSettings,
        balanceEnabled,
      }),
    ).toThrow(FunctionCustomError);
  });

  it('Flutter 送信 ByAmount 不一致で PAYMENT_SPLIT_MISMATCH', () => {
    try {
      validateAndNormalizeCustomPayment({
        categoryAmounts: { items: 100, extraCost: 0, sideGameChip: 0, tournaments: 0 },
        paymentMethodsByCategory: { items: 'cash' },
        categoryPaymentMethods,
        balances,
        balancePaymentSettings,
        balanceEnabled,
        clientPaymentMethodsByAmount: { cash: 99 },
      });
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(FunctionCustomError);
      expect((e as FunctionCustomError).errorKey).toBe('PAYMENT_SPLIT_MISMATCH');
    }
  });

  it('利用単位違反を拒否する', () => {
    expect(() =>
      validateAndNormalizeCustomPayment({
        categoryAmounts: { items: 150, extraCost: 0, sideGameChip: 0, tournaments: 0 },
        paymentMethodsByCategory: {
          items: [
            { method: 'sideGameChip', amount: 150 },
            { method: 'cash', amount: 0 },
          ],
        },
        categoryPaymentMethods,
        balances,
        balancePaymentSettings,
        balanceEnabled,
      }),
    ).toThrow(FunctionCustomError);
  });
});
