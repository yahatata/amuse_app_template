/**
 * A-7: 手動支払い（paymentMethodsByCategory）の検証と正規化
 *
 * 自動充当では上書きしない。ByAmount はサーバ集計の派生値。
 */

import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import {
  isBalanceId,
  isCashLikeMethod,
} from '../../user/types/pointIds';
import { assertUsableBalanceValue } from '../../user/helpers/userBalances';
import type { BalancePaymentSettings } from '../../../shared/config/types';
import { referenceToBalanceAmount } from './pointConversion';
import {
  aggregatePaymentMethodsByAmountFromCategory,
  buildPaymentMethodDetails,
  paymentMethodsByAmountEqual,
  throwPaymentSplitMismatch,
  type PaymentMethodDetails,
} from './paymentMethodAggregation';
import type { PaymentMethodValue } from './paymentMethodsInference';

export type CategoryPaymentSplit = { method: string; amount: number };
export type CategoryPaymentValue = string | CategoryPaymentSplit[];

export interface ValidateCustomPaymentParams {
  categoryAmounts: Record<string, number>;
  paymentMethodsByCategory: Record<string, CategoryPaymentValue>;
  categoryPaymentMethods: Record<string, string[]>;
  balances: Record<string, number>;
  balancePaymentSettings: BalancePaymentSettings;
  /** enabled map: balanceId -> enabled */
  balanceEnabled: Record<string, boolean>;
  clientPaymentMethodsByAmount?: Record<string, number>;
}

export interface ValidateCustomPaymentResult {
  paymentMethodsByCategory: Record<string, PaymentMethodValue>;
  paymentMethodsByAmount: Record<string, number>;
  paymentMethodDetails: PaymentMethodDetails;
  usedBalanceAmounts: Record<string, number>;
}

function validateMethodAllowed(
  category: string,
  method: string,
  allowedMethods: string[],
): void {
  if (!allowedMethods.includes(method)) {
    throw new FunctionCustomError({
      errorKey: 'PAYMENT_METHOD_NOT_ALLOWED',
      message: `カテゴリ「${category}」では支払い方法「${method}」は使用できません`,
      context: { category, method, allowedMethods },
    });
  }
}

function assertBalanceEnabled(method: string, balanceEnabled: Record<string, boolean>): void {
  if (isBalanceId(method) && balanceEnabled[method] !== true) {
    throw new FunctionCustomError({
      errorKey: 'BALANCE_TYPE_DISABLED',
      message: `${method} は無効です`,
      context: { method },
    });
  }
}

function consumeBalanceReference(params: {
  method: string;
  referenceAmount: number;
  remainingBalances: Record<string, number>;
  balancePaymentSettings: BalancePaymentSettings;
  usedBalanceAmounts: Record<string, number>;
  category: string;
}): void {
  const {
    method,
    referenceAmount,
    remainingBalances,
    balancePaymentSettings,
    usedBalanceAmounts,
    category,
  } = params;

  if (!Number.isInteger(referenceAmount) || referenceAmount < 0) {
    throw new FunctionCustomError({
      errorKey: 'INVALID_ARGUMENT',
      message: '基準値量は非負整数である必要があります',
      context: { category, method, referenceAmount },
    });
  }
  if (referenceAmount === 0) return;

  const setting = balancePaymentSettings[method as keyof BalancePaymentSettings];
  if (!setting) {
    throw new FunctionCustomError({
      errorKey: 'CONFIG_POINT_INVALID',
      message: `${method} の balancePaymentSettings がありません`,
      context: { method },
    });
  }
  if (referenceAmount % setting.usageUnit !== 0) {
    throw new FunctionCustomError({
      errorKey: 'USAGE_UNIT_VIOLATION',
      message: `${method} の利用単位（${setting.usageUnit}）に合いません`,
      context: { method, referenceAmount, usageUnit: setting.usageUnit },
    });
  }

  const conv = referenceToBalanceAmount(referenceAmount, setting.conversion);
  if (!conv.ok) {
    throw new FunctionCustomError({
      errorKey: conv.errorKey,
      message: conv.message,
      context: { method, referenceAmount },
    });
  }
  const balanceUse = conv.amount;
  const available = remainingBalances[method] || 0;
  if (available < balanceUse) {
    throw new FunctionCustomError({
      errorKey: 'ACCOUNTING_INSUFFICIENT_BALANCE',
      message: `${method} の残高が不足しています`,
      context: { method, available, required: balanceUse, category },
    });
  }
  remainingBalances[method] = available - balanceUse;
  usedBalanceAmounts[method] = (usedBalanceAmounts[method] || 0) + balanceUse;
}

/**
 * 手動支払いを検証し、ByAmount・Details をサーバ側で算出する。
 */
export function validateAndNormalizeCustomPayment(
  params: ValidateCustomPaymentParams,
): ValidateCustomPaymentResult {
  const {
    categoryAmounts,
    paymentMethodsByCategory,
    categoryPaymentMethods,
    balances,
    balancePaymentSettings,
    balanceEnabled,
    clientPaymentMethodsByAmount,
  } = params;

  const remainingBalances: Record<string, number> = {};
  for (const [id, value] of Object.entries(balances)) {
    remainingBalances[id] = assertUsableBalanceValue(value, { balanceId: id });
  }
  const usedBalanceAmounts: Record<string, number> = {};
  const normalizedCategory: Record<string, PaymentMethodValue> = {};

  for (const [category, categoryAmount] of Object.entries(categoryAmounts)) {
    if (categoryAmount <= 0) continue;

    const paymentValue = paymentMethodsByCategory[category];
    if (paymentValue === undefined || paymentValue === null) {
      throw new FunctionCustomError({
        errorKey: 'CUSTOM_PAYMENT_CATEGORY_MISSING',
        message: `カテゴリ「${category}」の支払い方法が指定されていません`,
        context: { category, categoryAmount },
      });
    }

    const allowedMethods = categoryPaymentMethods[category] || [];

    if (typeof paymentValue === 'string') {
      const method = paymentValue;
      if (!isCashLikeMethod(method) && !isBalanceId(method)) {
        throw new FunctionCustomError({
          errorKey: 'UNKNOWN_PAYMENT_METHOD',
          message: `未知の支払い方法です: ${method}`,
          context: { category, method },
        });
      }
      validateMethodAllowed(category, method, allowedMethods);
      assertBalanceEnabled(method, balanceEnabled);
      if (isBalanceId(method)) {
        consumeBalanceReference({
          method,
          referenceAmount: categoryAmount,
          remainingBalances,
          balancePaymentSettings,
          usedBalanceAmounts,
          category,
        });
      }
      normalizedCategory[category] = method;
    } else if (Array.isArray(paymentValue)) {
      let splitSum = 0;
      const splits: CategoryPaymentSplit[] = [];
      for (const split of paymentValue) {
        const method = split.method;
        const amount = Math.floor(Number(split.amount) || 0);
        if (!isCashLikeMethod(method) && !isBalanceId(method)) {
          throw new FunctionCustomError({
            errorKey: 'UNKNOWN_PAYMENT_METHOD',
            message: `未知の支払い方法です: ${method}`,
            context: { category, method },
          });
        }
        validateMethodAllowed(category, method, allowedMethods);
        assertBalanceEnabled(method, balanceEnabled);
        if (amount < 0 || !Number.isInteger(Number(split.amount))) {
          throw new FunctionCustomError({
            errorKey: 'INVALID_ARGUMENT',
            message: '分割金額は非負整数である必要があります',
            context: { category, method, amount: split.amount },
          });
        }
        if (amount === 0) continue;
        splitSum += amount;
        if (isBalanceId(method)) {
          consumeBalanceReference({
            method,
            referenceAmount: amount,
            remainingBalances,
            balancePaymentSettings,
            usedBalanceAmounts,
            category,
          });
        }
        splits.push({ method, amount });
      }
      if (splitSum !== categoryAmount) {
        throw new FunctionCustomError({
          errorKey: 'ACCOUNTING_PAYMENT_TOTAL_MISMATCH',
          message: `カテゴリ「${category}」の分割合計が一致しません`,
          context: { category, splitSum, categoryAmount },
        });
      }
      normalizedCategory[category] = splits;
    } else {
      throw new FunctionCustomError({
        errorKey: 'CUSTOM_PAYMENT_INVALID_FORMAT',
        message: `カテゴリ「${category}」の支払い指定形式が不正です`,
        context: { category },
      });
    }
  }

  const paymentMethodsByAmount = aggregatePaymentMethodsByAmountFromCategory({
    paymentMethodsByCategory: normalizedCategory,
    categoryAmounts,
  });

  const totalExpected = Object.values(categoryAmounts).reduce((s, v) => s + v, 0);
  const totalPaid = Object.values(paymentMethodsByAmount).reduce((s, v) => s + v, 0);
  if (totalPaid !== totalExpected) {
    throw new FunctionCustomError({
      errorKey: 'ACCOUNTING_PAYMENT_TOTAL_MISMATCH',
      message: `支払い総額が一致しません。合計: ${totalPaid}円、伝票: ${totalExpected}円`,
      context: { totalPaid, totalExpected },
    });
  }

  if (clientPaymentMethodsByAmount) {
    if (!paymentMethodsByAmountEqual(clientPaymentMethodsByAmount, paymentMethodsByAmount)) {
      throwPaymentSplitMismatch({
        client: clientPaymentMethodsByAmount,
        server: paymentMethodsByAmount,
      });
    }
  }

  const paymentMethodDetails = buildPaymentMethodDetails({
    paymentMethodsByAmount,
    usedBalanceAmounts,
    balancePaymentSettings,
  });

  return {
    paymentMethodsByCategory: normalizedCategory,
    paymentMethodsByAmount,
    paymentMethodDetails,
    usedBalanceAmounts,
  };
}
