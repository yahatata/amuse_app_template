import {
  resolveA7AccountingPayment,
} from '../../src/domains/bills/services/resolveA7AccountingPayment';
import { FunctionCustomError } from '../../src/shared/logging/functionCustomError';
import type { ValidatedPointConfig } from '../../src/shared/config/validatePointConfig';

const validatedConfig: ValidatedPointConfig = {
  pointSettings: {
    pointA: { enabled: true, displayName: 'A' },
    pointB: { enabled: true, displayName: 'B' },
    pointC: { enabled: true, displayName: 'C' },
    pointD: { enabled: false, displayName: 'D' },
    pointE: { enabled: false, displayName: 'E' },
  },
  sideGameChipSettings: { enabled: true, displayName: 'Chip' },
  rankingRewardPointTypes: ['pointA'],
  categoryPaymentMethods: {
    extraCost: ['cash', 'pointA'],
    sideGameChip: ['cash'],
    tournaments: ['cash', 'pointA', 'pointB'],
    items: ['cash', 'pointA', 'pointB', 'sideGameChip'],
  },
  pointPriority: ['pointA', 'pointB'],
  balancePaymentSettings: {
    pointA: { usageUnit: 1, conversion: { referenceUnits: 1, balanceUnits: 1 } },
    pointB: { usageUnit: 1, conversion: { referenceUnits: 1, balanceUnits: 1 } },
    pointC: { usageUnit: 1, conversion: { referenceUnits: 1, balanceUnits: 1 } },
    pointD: { usageUnit: 1, conversion: { referenceUnits: 1, balanceUnits: 1 } },
    pointE: { usageUnit: 1, conversion: { referenceUnits: 1, balanceUnits: 1 } },
    sideGameChip: {
      usageUnit: 100,
      conversion: { referenceUnits: 100, balanceUnits: 1 },
    },
  },
  categoryOrder: ['extraCost', 'sideGameChip', 'tournaments', 'items'],
};

const bill = {
  extraCost: 0,
  sideGameChip: 0,
  tournaments: 0,
  items: 400,
};

const balances = {
  pointA: 100,
  pointB: 100,
  pointC: 0,
  pointD: 0,
  pointE: 0,
  sideGameChip: 0,
};

describe('resolveA7AccountingPayment', () => {
  it('auto: 一致時はサーバ結果を正本にする', () => {
    const serverLike = resolveA7AccountingPayment({
      mode: 'auto',
      categoryAmounts: bill,
      balances,
      validatedConfig,
      selectedBaseMethod: 'cash',
      clientPaymentMethodsByCategory: {
        items: [
          { method: 'pointA', amount: 100 },
          { method: 'pointB', amount: 100 },
          { method: 'cash', amount: 200 },
        ],
      },
      clientPaymentMethodsByAmount: {
        pointA: 100,
        pointB: 100,
        cash: 200,
      },
    });

    expect(serverLike.paymentMethodsByAmount.cash).toBe(200);
    expect(serverLike.paymentMethodDetails.pointA.refundedBalanceAmount).toBe(0);
  });

  it('auto: ByCategory 改ざんで PAYMENT_SPLIT_MISMATCH', () => {
    try {
      resolveA7AccountingPayment({
        mode: 'auto',
        categoryAmounts: bill,
        balances,
        validatedConfig,
        selectedBaseMethod: 'cash',
        clientPaymentMethodsByCategory: {
          items: [
            { method: 'pointB', amount: 100 },
            { method: 'cash', amount: 300 },
          ],
        },
        clientPaymentMethodsByAmount: { pointB: 100, cash: 300 },
      });
      fail('expected');
    } catch (e) {
      expect((e as FunctionCustomError).errorKey).toBe('PAYMENT_SPLIT_MISMATCH');
    }
  });

  it('custom: 自動再計算で上書きせずユーザー指定を維持', () => {
    const result = resolveA7AccountingPayment({
      mode: 'custom',
      categoryAmounts: bill,
      balances,
      validatedConfig,
      clientPaymentMethodsByCategory: {
        items: [
          { method: 'pointB', amount: 100 },
          { method: 'cash', amount: 300 },
        ],
      },
    });

    expect(result.paymentMethodsByAmount.pointB).toBe(100);
    expect(result.paymentMethodsByAmount.pointA).toBeUndefined();
  });
});
