/**
 * A-7: ByCategory ↔ ByAmount 集計・照合・paymentMethodDetails 構築
 */

import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import { isBalanceId, isCashLikeMethod } from '../../user/types/pointIds';
import type { BalancePaymentSettings } from '../../../shared/config/types';
import { referenceToBalanceAmount } from './pointConversion';
import type { PaymentMethodValue } from './paymentMethodsInference';

export type PaymentMethodDetail = {
  referenceAmount: number;
  balanceAmount: number;
  conversion: { referenceUnits: number; balanceUnits: number };
  usageUnit: number;
  refundedBalanceAmount: number;
};

export type PaymentMethodDetails = Record<string, PaymentMethodDetail>;

export function aggregatePaymentMethodsByAmountFromCategory(params: {
  paymentMethodsByCategory: Record<string, PaymentMethodValue>;
  categoryAmounts: Record<string, number>;
}): Record<string, number> {
  const { paymentMethodsByCategory, categoryAmounts } = params;
  const out: Record<string, number> = {};

  for (const [category, paymentValue] of Object.entries(paymentMethodsByCategory)) {
    const categoryAmount = categoryAmounts[category] || 0;
    if (categoryAmount <= 0) continue;

    if (typeof paymentValue === 'string') {
      out[paymentValue] = (out[paymentValue] || 0) + categoryAmount;
      continue;
    }
    if (!Array.isArray(paymentValue)) {
      throw new FunctionCustomError({
        errorKey: 'CUSTOM_PAYMENT_INVALID_FORMAT',
        message: `カテゴリ「${category}」の支払い指定形式が不正です`,
        context: { category },
      });
    }
    for (const split of paymentValue) {
      const amount = Number(split.amount) || 0;
      if (amount <= 0) continue;
      out[split.method] = (out[split.method] || 0) + amount;
    }
  }
  return out;
}

export function buildPaymentMethodDetails(params: {
  paymentMethodsByAmount: Record<string, number>;
  usedBalanceAmounts?: Record<string, number>;
  balancePaymentSettings: BalancePaymentSettings;
}): PaymentMethodDetails {
  const { paymentMethodsByAmount, usedBalanceAmounts, balancePaymentSettings } =
    params;
  const details: PaymentMethodDetails = {};

  for (const [method, referenceAmount] of Object.entries(paymentMethodsByAmount)) {
    if (referenceAmount <= 0) continue;
    if (!isBalanceId(method)) continue;

    const setting = balancePaymentSettings[method];
    if (!setting) {
      throw new FunctionCustomError({
        errorKey: 'CONFIG_POINT_INVALID',
        message: `${method} の balancePaymentSettings がありません`,
        context: { method },
      });
    }

    let balanceAmount = usedBalanceAmounts?.[method];
    if (balanceAmount == null) {
      const conv = referenceToBalanceAmount(referenceAmount, setting.conversion);
      if (!conv.ok) {
        throw new FunctionCustomError({
          errorKey: conv.errorKey,
          message: conv.message,
          context: { method, referenceAmount },
        });
      }
      balanceAmount = conv.amount;
    }

    details[method] = {
      referenceAmount,
      balanceAmount,
      conversion: { ...setting.conversion },
      usageUnit: setting.usageUnit,
      refundedBalanceAmount: 0,
    };
  }
  return details;
}

/** 正規化後の ByCategory 比較（順序非依存の splits） */
export function paymentMethodsByCategoryEqual(
  a: Record<string, PaymentMethodValue>,
  b: Record<string, PaymentMethodValue>,
): boolean {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) return false;
    if (!categoryPaymentValueEqual(a[keysA[i]], b[keysB[i]])) return false;
  }
  return true;
}

function categoryPaymentValueEqual(
  a: PaymentMethodValue,
  b: PaymentMethodValue,
): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const norm = (splits: Array<{ method: string; amount: number }>) =>
    [...splits]
      .map((s) => ({ method: s.method, amount: Math.floor(Number(s.amount) || 0) }))
      .sort((x, y) => x.method.localeCompare(y.method) || x.amount - y.amount);
  const na = norm(a);
  const nb = norm(b);
  for (let i = 0; i < na.length; i++) {
    if (na[i].method !== nb[i].method || na[i].amount !== nb[i].amount) {
      return false;
    }
  }
  return true;
}

export function paymentMethodsByAmountEqual(
  a: Record<string, number>,
  b: Record<string, number>,
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const av = Math.floor(a[key] || 0);
    const bv = Math.floor(b[key] || 0);
    if (av !== bv) return false;
  }
  return true;
}

export function assertKnownPaymentMethods(
  methods: Iterable<string>,
): void {
  for (const method of methods) {
    if (!isCashLikeMethod(method) && !isBalanceId(method)) {
      throw new FunctionCustomError({
        errorKey: 'UNKNOWN_PAYMENT_METHOD',
        message: `未知の支払い方法です: ${method}`,
        context: { method },
      });
    }
  }
}

export function throwPaymentSplitMismatch(context?: Record<string, unknown>): never {
  throw new FunctionCustomError({
    errorKey: 'PAYMENT_SPLIT_MISMATCH',
    message:
      '支払い内容が最新の残高・設定と一致しません。内容を再確認して、もう一度会計してください。',
    context,
  });
}
