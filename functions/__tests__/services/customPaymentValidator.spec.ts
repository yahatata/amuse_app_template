/**
 * validateAndNormalizeCustomPayment — 現行 A-7 契約への同期テスト
 *
 * 旧 chipRate / roundingUnits API は廃止済み。正本は
 * balancePaymentSettings + balanceEnabled + categoryPaymentMethods。
 *
 * 同等の詳細ケースは customPaymentValidator.a7.spec.ts にもある。
 * 本ファイルは Batch B で要求された代表ケース（errorKey 明示）を維持する。
 */

import { FunctionCustomError } from '../../src/shared/logging/functionCustomError';
import { validateAndNormalizeCustomPayment } from '../../src/domains/bills/services/customPaymentValidator';
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
  extraCost: ['cash', 'credit_card', 'electronic_money'],
  tournaments: ['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB'],
  items: ['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameChip'],
  sideGameChip: ['cash', 'credit_card', 'electronic_money'],
};

const balances = {
  pointA: 10000,
  pointB: 0,
  pointC: 0,
  pointD: 0,
  pointE: 0,
  sideGameChip: 50,
};

const balanceEnabled = {
  pointA: true,
  pointB: true,
  pointC: false,
  pointD: false,
  pointE: false,
  sideGameChip: true,
};

function expectErrorKey(fn: () => unknown, errorKey: string) {
  try {
    fn();
    fail(`expected FunctionCustomError ${errorKey}`);
  } catch (e) {
    expect(e).toBeInstanceOf(FunctionCustomError);
    expect((e as FunctionCustomError).errorKey).toBe(errorKey);
  }
}

describe('validateAndNormalizeCustomPayment', () => {
  it('入店料現金 + 商品チップ分割（基準2000=残高20 + 現金400）', () => {
    const result = validateAndNormalizeCustomPayment({
      categoryAmounts: { extraCost: 3000, items: 2400, tournaments: 0, sideGameChip: 0 },
      paymentMethodsByCategory: {
        extraCost: 'cash',
        items: [
          { method: 'sideGameChip', amount: 2000 },
          { method: 'cash', amount: 400 },
        ],
      },
      categoryPaymentMethods,
      balances,
      balancePaymentSettings,
      balanceEnabled,
      clientPaymentMethodsByAmount: { cash: 3400, sideGameChip: 2000 },
    });

    expect(result.paymentMethodsByAmount).toEqual({
      cash: 3400,
      sideGameChip: 2000,
    });
    expect(result.usedBalanceAmounts.sideGameChip).toBe(20);
  });

  it('unknown method → UNKNOWN_PAYMENT_METHOD', () => {
    expectErrorKey(
      () =>
        validateAndNormalizeCustomPayment({
          categoryAmounts: { items: 1000, extraCost: 0, tournaments: 0, sideGameChip: 0 },
          paymentMethodsByCategory: { items: 'bitcoin' as any },
          categoryPaymentMethods,
          balances,
          balancePaymentSettings,
          balanceEnabled,
        }),
      'UNKNOWN_PAYMENT_METHOD',
    );
  });

  it('disabled point → BALANCE_TYPE_DISABLED', () => {
    expectErrorKey(
      () =>
        validateAndNormalizeCustomPayment({
          categoryAmounts: { items: 1000, extraCost: 0, tournaments: 0, sideGameChip: 0 },
          paymentMethodsByCategory: { items: 'pointC' },
          categoryPaymentMethods: {
            ...categoryPaymentMethods,
            items: [...categoryPaymentMethods.items, 'pointC'],
          },
          balances: { ...balances, pointC: 1000 },
          balancePaymentSettings,
          balanceEnabled,
        }),
      'BALANCE_TYPE_DISABLED',
    );
  });

  it('category 未許可 → PAYMENT_METHOD_NOT_ALLOWED', () => {
    expectErrorKey(
      () =>
        validateAndNormalizeCustomPayment({
          categoryAmounts: { extraCost: 3000, items: 0, tournaments: 0, sideGameChip: 0 },
          paymentMethodsByCategory: { extraCost: 'sideGameChip' },
          categoryPaymentMethods,
          balances,
          balancePaymentSettings,
          balanceEnabled,
        }),
      'PAYMENT_METHOD_NOT_ALLOWED',
    );
  });

  it('ByCategory 欠落（対象 category）→ CUSTOM_PAYMENT_CATEGORY_MISSING', () => {
    expectErrorKey(
      () =>
        validateAndNormalizeCustomPayment({
          categoryAmounts: { items: 1000, extraCost: 0, tournaments: 0, sideGameChip: 0 },
          paymentMethodsByCategory: { tournaments: 'cash' },
          categoryPaymentMethods,
          balances,
          balancePaymentSettings,
          balanceEnabled,
        }),
      'CUSTOM_PAYMENT_CATEGORY_MISSING',
    );
  });

  it('usageUnit 不正 → USAGE_UNIT_VIOLATION', () => {
    expectErrorKey(
      () =>
        validateAndNormalizeCustomPayment({
          categoryAmounts: { items: 150, extraCost: 0, tournaments: 0, sideGameChip: 0 },
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
      'USAGE_UNIT_VIOLATION',
    );
  });

  it('クライアント ByAmount 不一致 → PAYMENT_SPLIT_MISMATCH', () => {
    expectErrorKey(
      () =>
        validateAndNormalizeCustomPayment({
          categoryAmounts: { extraCost: 3000, items: 2400, tournaments: 0, sideGameChip: 0 },
          paymentMethodsByCategory: {
            extraCost: 'cash',
            items: [
              { method: 'sideGameChip', amount: 2000 },
              { method: 'cash', amount: 400 },
            ],
          },
          categoryPaymentMethods,
          balances,
          balancePaymentSettings,
          balanceEnabled,
          clientPaymentMethodsByAmount: { cash: 3000, sideGameChip: 2400 },
        }),
      'PAYMENT_SPLIT_MISMATCH',
    );
  });
});
