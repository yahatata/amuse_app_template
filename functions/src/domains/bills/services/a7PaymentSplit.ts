/**
 * A-7: 自動充当（カテゴリループ + 整数比最大充当）
 *
 * 旧 rounding / sideGameChipRate は使わない。
 * categoryOrder は呼び出し元が config 正本を必須で渡す（fallback 禁止）。
 */

import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import { isBalanceId, isCashLikeMethod } from '../../user/types/pointIds';
import { assertUsableBalanceValue } from '../../user/helpers/userBalances';
import type { BalancePaymentSettings } from '../../../shared/config/types';
import { computeMaxConvertibleReferenceAmount } from './maxConvertibleReferenceAmount';
import type { PaymentMethodValue } from './paymentMethodsInference';

export type CategoryBreakdown = {
  pointsUsed: number;
  baseMethodAmount: number;
};

export type A7PaymentSplitResult = {
  usedPointsReference: Record<string, number>;
  usedBalanceAmounts: Record<string, number>;
  cashLikeAmount: number;
  categoryBreakdown: Record<string, CategoryBreakdown>;
  paymentMethodsByCategory: Record<string, PaymentMethodValue>;
  paymentMethodsByAmount: Record<string, number>;
};

export type A7CalculatePaymentSplitParams = {
  selectedBaseMethod: 'cash' | 'credit_card' | 'electronic_money';
  bill: Record<string, number>;
  balances: Record<string, number>;
  pointPriority: string[];
  categoryPaymentMethods: Record<string, string[]>;
  categoryOrder: string[];
  balancePaymentSettings: BalancePaymentSettings;
};

/**
 * A-7 自動充当。categoryOrder 必須（省略時は CONFIG/呼び出しエラー）。
 */
export function calculateA7PaymentSplit(
  params: A7CalculatePaymentSplitParams,
): A7PaymentSplitResult {
  const {
    selectedBaseMethod,
    bill,
    balances,
    pointPriority,
    categoryPaymentMethods,
    categoryOrder,
    balancePaymentSettings,
  } = params;

  if (!isCashLikeMethod(selectedBaseMethod)) {
    throw new FunctionCustomError({
      errorKey: 'INVALID_ARGUMENT',
      message: 'selectedBaseMethod が不正です',
      context: { selectedBaseMethod },
    });
  }
  if (!Array.isArray(categoryOrder) || categoryOrder.length === 0) {
    throw new FunctionCustomError({
      errorKey: 'CONFIG_POINT_INVALID',
      message: 'categoryOrder が未設定です',
    });
  }

  const remainingBalances: Record<string, number> = {};
  for (const [id, value] of Object.entries(balances)) {
    remainingBalances[id] = assertUsableBalanceValue(value, { balanceId: id });
  }

  const usedPointsReference: Record<string, number> = {};
  const usedBalanceAmounts: Record<string, number> = {};
  const categoryBreakdown: Record<string, CategoryBreakdown> = {};
  const paymentMethodsByCategory: Record<string, PaymentMethodValue> = {};
  let totalCashLikeAmount = 0;

  for (const category of categoryOrder) {
    const categoryTotal = bill[category] || 0;
    if (categoryTotal <= 0) {
      categoryBreakdown[category] = { pointsUsed: 0, baseMethodAmount: 0 };
      continue;
    }

    const allowedMethods = categoryPaymentMethods[category] || [];
    let remainingAmount = categoryTotal;
    let categoryPointsUsed = 0;
    const splits: Array<{ method: string; amount: number }> = [];

    for (const pointType of pointPriority) {
      if (remainingAmount <= 0) break;
      if (!allowedMethods.includes(pointType)) continue;
      if (!isBalanceId(pointType)) continue;

      const setting =
        balancePaymentSettings[pointType as keyof BalancePaymentSettings];
      if (!setting) {
        throw new FunctionCustomError({
          errorKey: 'CONFIG_POINT_INVALID',
          message: `${pointType} の balancePaymentSettings がありません`,
          context: { pointType, category },
        });
      }

      const availableBalance = remainingBalances[pointType] || 0;
      const maxConv = computeMaxConvertibleReferenceAmount({
        remainingReferenceAmount: remainingAmount,
        availableBalance,
        conversion: setting.conversion,
        usageUnit: setting.usageUnit,
      });

      if (!maxConv.ok || maxConv.referenceAmount <= 0) continue;

      const referenceUse = maxConv.referenceAmount;
      const balanceUse = maxConv.balanceAmount;

      splits.push({ method: pointType, amount: referenceUse });
      categoryPointsUsed += referenceUse;
      remainingAmount -= referenceUse;
      usedPointsReference[pointType] =
        (usedPointsReference[pointType] || 0) + referenceUse;
      usedBalanceAmounts[pointType] =
        (usedBalanceAmounts[pointType] || 0) + balanceUse;
      remainingBalances[pointType] = availableBalance - balanceUse;
    }

    const baseMethodAmount = remainingAmount;
    totalCashLikeAmount += baseMethodAmount;
    categoryBreakdown[category] = {
      pointsUsed: categoryPointsUsed,
      baseMethodAmount,
    };

    if (categoryPointsUsed <= 0) {
      paymentMethodsByCategory[category] = selectedBaseMethod;
    } else {
      if (baseMethodAmount > 0) {
        splits.push({ method: selectedBaseMethod, amount: baseMethodAmount });
      }
      paymentMethodsByCategory[category] = splits;
    }
  }

  const paymentMethodsByAmount: Record<string, number> = {};
  for (const [category, paymentValue] of Object.entries(
    paymentMethodsByCategory,
  )) {
    const categoryTotal = bill[category] || 0;
    if (categoryTotal <= 0) continue;
    if (typeof paymentValue === 'string') {
      paymentMethodsByAmount[paymentValue] =
        (paymentMethodsByAmount[paymentValue] || 0) + categoryTotal;
    } else {
      for (const split of paymentValue) {
        if (split.amount <= 0) continue;
        paymentMethodsByAmount[split.method] =
          (paymentMethodsByAmount[split.method] || 0) + split.amount;
      }
    }
  }

  let totalBill = 0;
  let totalCalculated = 0;
  for (const category of categoryOrder) {
    totalBill += bill[category] || 0;
    const b = categoryBreakdown[category];
    if (b) totalCalculated += b.pointsUsed + b.baseMethodAmount;
  }
  if (totalCalculated !== totalBill) {
    throw new FunctionCustomError({
      errorKey: 'ACCOUNTING_PAYMENT_TOTAL_MISMATCH',
      message: `計算結果の整合性エラー: 計算合計(${totalCalculated}) != 元の合計(${totalBill})`,
      context: { totalCalculated, totalBill },
    });
  }

  return {
    usedPointsReference,
    usedBalanceAmounts,
    cashLikeAmount: totalCashLikeAmount,
    categoryBreakdown,
    paymentMethodsByCategory,
    paymentMethodsByAmount,
  };
}
