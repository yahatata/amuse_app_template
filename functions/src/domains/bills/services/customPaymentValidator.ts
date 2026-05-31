/**
 * カスタム支払い（paymentMethodsByCategory）の検証と正規化
 */

import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import {
  computeMaxRoundedPointYen,
  DEFAULT_ROUNDING_UNITS,
  isChipCountAlignedToUnit,
  isPointYenAlignedToUnit,
  PointLikeMethod,
  RoundingUnits,
} from './paymentRounding';

const CASH_LIKE_METHODS = new Set(['cash', 'credit_card', 'electronic_money']);
const POINT_METHODS = new Set(['pointA', 'pointB', 'sideGameChip']);

export type CategoryPaymentSplit = { method: string; amount: number };
export type CategoryPaymentValue = string | CategoryPaymentSplit[];

export interface ValidateCustomPaymentParams {
  categoryAmounts: Record<string, number>;
  paymentMethodsByCategory: Record<string, CategoryPaymentValue>;
  categoryPaymentMethods: Record<string, string[]>;
  balances: Record<string, number>;
  chipRate: number;
  roundingUnits?: RoundingUnits;
  clientPaymentMethodsByAmount?: Record<string, number>;
}

export interface ValidateCustomPaymentResult {
  paymentMethodsByAmount: Record<string, number>;
}

function isPointMethod(method: string): method is PointLikeMethod {
  return POINT_METHODS.has(method);
}

function addToAmount(
  target: Record<string, number>,
  method: string,
  yen: number,
): void {
  if (yen <= 0) return;
  target[method] = (target[method] || 0) + Math.floor(yen);
}

function validateMethodAllowed(
  category: string,
  method: string,
  allowedMethods: string[],
): void {
  if (!allowedMethods.includes(method)) {
    throw new FunctionCustomError({
      errorKey: 'CUSTOM_PAYMENT_METHOD_NOT_ALLOWED',
      message: `カテゴリ「${category}」では支払い方法「${method}」は使用できません`,
      context: { category, method, allowedMethods },
    });
  }
}

function validateCategoryStringPayment(params: {
  category: string;
  categoryAmount: number;
  method: string;
  allowedMethods: string[];
  remainingBalances: Record<string, number>;
  chipRate: number;
  roundingUnits: RoundingUnits;
  normalized: Record<string, number>;
  pointUsage: Record<string, number>;
}): void {
  const {
    category,
    categoryAmount,
    method,
    allowedMethods,
    remainingBalances,
    chipRate,
    roundingUnits,
    normalized,
    pointUsage,
  } = params;

  validateMethodAllowed(category, method, allowedMethods);

  if (CASH_LIKE_METHODS.has(method)) {
    addToAmount(normalized, method, categoryAmount);
    return;
  }

  if (!isPointMethod(method)) {
    throw new FunctionCustomError({
      errorKey: 'CUSTOM_PAYMENT_INVALID_METHOD',
      message: `未対応の支払い方法です: ${method}`,
      context: { category, method },
    });
  }

  const roundedYen = computeMaxRoundedPointYen({
    method,
    categoryAmountYen: categoryAmount,
    balance: remainingBalances[method] || 0,
    chipRate,
    roundingUnits,
  });

  if (roundedYen < categoryAmount) {
    throw new FunctionCustomError({
      errorKey: 'CUSTOM_PAYMENT_ROUNDING_REMAINDER_REQUIRES_SPLIT',
      message:
        `カテゴリ「${category}」は丸め単位のため単一の${method}では全額払えません。` +
        `使用可能: ${roundedYen}円、カテゴリ金額: ${categoryAmount}円。分割支払いを指定してください`,
      context: { category, method, roundedYen, categoryAmount },
    });
  }

  if (roundedYen !== categoryAmount) {
    throw new FunctionCustomError({
      errorKey: 'CUSTOM_PAYMENT_AMOUNT_MISMATCH',
      message: `カテゴリ「${category}」の${method}支払い額が一致しません`,
      context: { category, method, roundedYen, categoryAmount },
    });
  }

  if (method === 'sideGameChip') {
    const chipsUsed = Math.floor(roundedYen / chipRate);
    if ((remainingBalances.sideGameChip || 0) < chipsUsed) {
      throw new FunctionCustomError({
        errorKey: 'ACCOUNTING_INSUFFICIENT_BALANCE',
        message: `sideGameChipの残高が不足しています（カテゴリ: ${category}）`,
        context: {
          category,
          balance: remainingBalances.sideGameChip,
          required: chipsUsed,
        },
      });
    }
    addToAmount(normalized, method, roundedYen);
    pointUsage.sideGameChip = (pointUsage.sideGameChip || 0) + chipsUsed;
    remainingBalances.sideGameChip = (remainingBalances.sideGameChip || 0) - chipsUsed;
  } else {
    if ((remainingBalances[method] || 0) < roundedYen) {
      throw new FunctionCustomError({
        errorKey: 'ACCOUNTING_INSUFFICIENT_BALANCE',
        message: `${method}の残高が不足しています（カテゴリ: ${category}）`,
        context: { category, balance: remainingBalances[method], required: roundedYen },
      });
    }
    addToAmount(normalized, method, roundedYen);
    pointUsage[method] = (pointUsage[method] || 0) + roundedYen;
    remainingBalances[method] = (remainingBalances[method] || 0) - roundedYen;
  }
}

function validateCategorySplitPayment(params: {
  category: string;
  categoryAmount: number;
  splits: CategoryPaymentSplit[];
  allowedMethods: string[];
  chipRate: number;
  roundingUnits: RoundingUnits;
  normalized: Record<string, number>;
  pointUsage: Record<string, number>;
  remainingBalances: Record<string, number>;
}): void {
  const {
    category,
    categoryAmount,
    splits,
    allowedMethods,
    chipRate,
    roundingUnits,
    normalized,
    pointUsage,
    remainingBalances,
  } = params;

  let splitTotalYen = 0;

  for (const split of splits) {
    const method = split.method;
    const amount = Math.floor(Number(split.amount) || 0);
    if (amount <= 0) continue;

    validateMethodAllowed(category, method, allowedMethods);

    if (method === 'sideGameChip') {
      if (!isChipCountAlignedToUnit(amount, roundingUnits.sideGameChip)) {
        throw new FunctionCustomError({
          errorKey: 'CUSTOM_PAYMENT_CHIP_NOT_ALIGNED',
          message: `チップ枚数は${roundingUnits.sideGameChip}枚単位である必要があります（カテゴリ: ${category}）`,
          context: { category, amount, unit: roundingUnits.sideGameChip },
        });
      }
      const yenAmount = Math.floor(amount * chipRate);
      if ((remainingBalances.sideGameChip || 0) < amount) {
        throw new FunctionCustomError({
          errorKey: 'ACCOUNTING_INSUFFICIENT_BALANCE',
          message: `sideGameChipの残高が不足しています（カテゴリ: ${category}）`,
          context: {
            category,
            balance: remainingBalances.sideGameChip,
            required: amount,
          },
        });
      }
      addToAmount(normalized, method, yenAmount);
      pointUsage.sideGameChip = (pointUsage.sideGameChip || 0) + amount;
      remainingBalances.sideGameChip = (remainingBalances.sideGameChip || 0) - amount;
      splitTotalYen += yenAmount;
    } else if (method === 'pointA' || method === 'pointB') {
      if (!isPointYenAlignedToUnit(amount, roundingUnits.pointAB)) {
        throw new FunctionCustomError({
          errorKey: 'CUSTOM_PAYMENT_POINT_NOT_ALIGNED',
          message: `ポイント使用額は${roundingUnits.pointAB}円単位である必要があります（カテゴリ: ${category}）`,
          context: { category, amount, unit: roundingUnits.pointAB },
        });
      }
      if ((remainingBalances[method] || 0) < amount) {
        throw new FunctionCustomError({
          errorKey: 'ACCOUNTING_INSUFFICIENT_BALANCE',
          message: `${method}の残高が不足しています（カテゴリ: ${category}）`,
          context: { category, balance: remainingBalances[method], required: amount },
        });
      }
      addToAmount(normalized, method, amount);
      pointUsage[method] = (pointUsage[method] || 0) + amount;
      remainingBalances[method] = (remainingBalances[method] || 0) - amount;
      splitTotalYen += amount;
    } else if (CASH_LIKE_METHODS.has(method)) {
      addToAmount(normalized, method, amount);
      splitTotalYen += amount;
    } else {
      throw new FunctionCustomError({
        errorKey: 'CUSTOM_PAYMENT_INVALID_METHOD',
        message: `未対応の支払い方法です: ${method}`,
        context: { category, method },
      });
    }
  }

  if (splitTotalYen !== categoryAmount) {
    throw new FunctionCustomError({
      errorKey: 'CUSTOM_PAYMENT_CATEGORY_TOTAL_MISMATCH',
      message: `カテゴリ「${category}」の支払い合計が一致しません。合計: ${splitTotalYen}円、期待: ${categoryAmount}円`,
      context: { category, splitTotalYen, categoryAmount },
    });
  }
}

/**
 * カスタム支払いを検証し、paymentMethodsByAmount をサーバー側で算出する
 */
export function validateAndNormalizeCustomPayment(
  params: ValidateCustomPaymentParams,
): ValidateCustomPaymentResult {
  const {
    categoryAmounts,
    paymentMethodsByCategory,
    categoryPaymentMethods,
    balances,
    chipRate,
    roundingUnits = DEFAULT_ROUNDING_UNITS,
    clientPaymentMethodsByAmount,
  } = params;

  const normalized: Record<string, number> = {};
  const pointUsage: Record<string, number> = {
    pointA: 0,
    pointB: 0,
    sideGameChip: 0,
  };
  const remainingBalances: Record<string, number> = {
    pointA: balances.pointA || 0,
    pointB: balances.pointB || 0,
    sideGameChip: balances.sideGameChip || 0,
  };

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
      validateCategoryStringPayment({
        category,
        categoryAmount,
        method: paymentValue,
        allowedMethods,
        remainingBalances,
        chipRate,
        roundingUnits,
        normalized,
        pointUsage,
      });
    } else if (Array.isArray(paymentValue)) {
      validateCategorySplitPayment({
        category,
        categoryAmount,
        splits: paymentValue,
        allowedMethods,
        chipRate,
        roundingUnits,
        normalized,
        pointUsage,
        remainingBalances,
      });
    } else {
      throw new FunctionCustomError({
        errorKey: 'CUSTOM_PAYMENT_INVALID_FORMAT',
        message: `カテゴリ「${category}」の支払い指定形式が不正です`,
        context: { category },
      });
    }
  }

  const totalExpected = Object.values(categoryAmounts).reduce((s, v) => s + v, 0);
  const totalPaid = Object.values(normalized).reduce((s, v) => s + v, 0);
  if (totalPaid !== totalExpected) {
    throw new FunctionCustomError({
      errorKey: 'ACCOUNTING_PAYMENT_TOTAL_MISMATCH',
      message: `支払い総額が一致しません。合計: ${totalPaid}円、伝票: ${totalExpected}円`,
      context: { totalPaid, totalExpected },
    });
  }

  if (clientPaymentMethodsByAmount) {
    for (const [method, amount] of Object.entries(clientPaymentMethodsByAmount)) {
      const serverAmount = normalized[method] || 0;
      if (Math.floor(amount) !== serverAmount) {
        throw new FunctionCustomError({
          errorKey: 'CUSTOM_PAYMENT_CLIENT_SERVER_MISMATCH',
          message: `クライアントとサーバーの支払い内訳が一致しません（${method}）`,
          context: {
            method,
            clientAmount: Math.floor(amount),
            serverAmount,
          },
        });
      }
    }
    for (const [method, serverAmount] of Object.entries(normalized)) {
      const clientAmount = Math.floor(clientPaymentMethodsByAmount[method] || 0);
      if (clientAmount !== serverAmount) {
        throw new FunctionCustomError({
          errorKey: 'CUSTOM_PAYMENT_CLIENT_SERVER_MISMATCH',
          message: `クライアントとサーバーの支払い内訳が一致しません（${method}）`,
          context: { method, clientAmount, serverAmount },
        });
      }
    }
  }

  return { paymentMethodsByAmount: normalized };
}
