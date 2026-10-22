import { calculateA7PaymentSplit } from '../../src/domains/bills/services/a7PaymentSplit';
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
  extraCost: ['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB'],
  sideGameChip: ['cash', 'credit_card', 'electronic_money'],
  tournaments: ['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameChip'],
  items: ['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameChip'],
};

const categoryOrder = ['extraCost', 'sideGameChip', 'tournaments', 'items'];

describe('calculateA7PaymentSplit', () => {
  it('pointPriority 順で充当し ByCategory/ByAmount を生成する', () => {
    const result = calculateA7PaymentSplit({
      selectedBaseMethod: 'cash',
      bill: {
        extraCost: 0,
        sideGameChip: 0,
        tournaments: 0,
        items: 1000,
      },
      balances: {
        pointA: 300,
        pointB: 500,
        pointC: 0,
        pointD: 0,
        pointE: 0,
        sideGameChip: 0,
      },
      pointPriority: ['pointA', 'pointB'],
      categoryPaymentMethods,
      categoryOrder,
      balancePaymentSettings,
    });

    expect(result.usedPointsReference.pointA).toBe(300);
    expect(result.usedPointsReference.pointB).toBe(500);
    expect(result.usedBalanceAmounts.pointA).toBe(300);
    expect(result.usedBalanceAmounts.pointB).toBe(500);
    expect(result.cashLikeAmount).toBe(200);
    expect(result.paymentMethodsByAmount.pointA).toBe(300);
    expect(result.paymentMethodsByAmount.pointB).toBe(500);
    expect(result.paymentMethodsByAmount.cash).toBe(200);
    expect(Array.isArray(result.paymentMethodsByCategory.items)).toBe(true);
  });

  it('priority にない残高は自動使用しない', () => {
    const result = calculateA7PaymentSplit({
      selectedBaseMethod: 'cash',
      bill: { extraCost: 0, sideGameChip: 0, tournaments: 0, items: 500 },
      balances: {
        pointA: 0,
        pointB: 0,
        pointC: 1000,
        pointD: 0,
        pointE: 0,
        sideGameChip: 0,
      },
      pointPriority: ['pointA', 'pointB'],
      categoryPaymentMethods: {
        ...categoryPaymentMethods,
        items: [...categoryPaymentMethods.items, 'pointC'],
      },
      categoryOrder,
      balancePaymentSettings,
    });

    expect(result.usedPointsReference.pointC).toBeUndefined();
    expect(result.cashLikeAmount).toBe(500);
    expect(result.paymentMethodsByCategory.items).toBe('cash');
  });

  it('allowlist 外カテゴリへはポイント充当しない', () => {
    const result = calculateA7PaymentSplit({
      selectedBaseMethod: 'cash',
      bill: { extraCost: 0, sideGameChip: 1000, tournaments: 0, items: 0 },
      balances: {
        pointA: 1000,
        pointB: 0,
        pointC: 0,
        pointD: 0,
        pointE: 0,
        sideGameChip: 0,
      },
      pointPriority: ['pointA'],
      categoryPaymentMethods,
      categoryOrder,
      balancePaymentSettings,
    });

    expect(result.usedPointsReference.pointA).toBeUndefined();
    expect(result.paymentMethodsByCategory.sideGameChip).toBe('cash');
  });

  it('sideGameChip を整数換算で併用する', () => {
    const result = calculateA7PaymentSplit({
      selectedBaseMethod: 'cash',
      bill: { extraCost: 0, sideGameChip: 0, tournaments: 0, items: 350 },
      balances: {
        pointA: 0,
        pointB: 0,
        pointC: 0,
        pointD: 0,
        pointE: 0,
        sideGameChip: 5,
      },
      pointPriority: ['sideGameChip'],
      categoryPaymentMethods,
      categoryOrder,
      balancePaymentSettings,
    });

    // 350 → usageUnit 100 → max 300 reference / 3 chips
    expect(result.usedPointsReference.sideGameChip).toBe(300);
    expect(result.usedBalanceAmounts.sideGameChip).toBe(3);
    expect(result.cashLikeAmount).toBe(50);
  });

  it('categoryOrder 未設定はエラー', () => {
    expect(() =>
      calculateA7PaymentSplit({
        selectedBaseMethod: 'cash',
        bill: { items: 100 },
        balances: {},
        pointPriority: [],
        categoryPaymentMethods,
        categoryOrder: [],
        balancePaymentSettings,
      }),
    ).toThrow(FunctionCustomError);
  });
});
