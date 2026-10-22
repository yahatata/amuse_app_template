/**
 * A-7: 会計支払の解決（auto 再計算照合 / custom 検証）
 */

import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import type { ValidatedPointConfig } from '../../../shared/config/validatePointConfig';
import { isCashLikeMethod, SIDE_GAME_CHIP_ID } from '../../user/types/pointIds';
import { ALL_BALANCE_IDS } from '../../user/types/pointIds';
import { calculateA7PaymentSplit } from './a7PaymentSplit';
import { validateAndNormalizeCustomPayment } from './customPaymentValidator';
import {
  buildPaymentMethodDetails,
  paymentMethodsByAmountEqual,
  paymentMethodsByCategoryEqual,
  throwPaymentSplitMismatch,
  type PaymentMethodDetails,
} from './paymentMethodAggregation';
import type { PaymentMethodValue } from './paymentMethodsInference';
import { resolveBaseMethod } from './paymentMethodsInference';

export type AccountingMode = 'auto' | 'custom';

export type ResolvedA7AccountingPayment = {
  paymentMethodsByCategory: Record<string, PaymentMethodValue>;
  paymentMethodsByAmount: Record<string, number>;
  paymentMethodDetails: PaymentMethodDetails;
  usedBalanceAmounts: Record<string, number>;
};

function balanceEnabledMap(config: ValidatedPointConfig): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const id of ALL_BALANCE_IDS) {
    if (id === SIDE_GAME_CHIP_ID) {
      out[id] = config.sideGameChipSettings.enabled;
    } else {
      out[id] = config.pointSettings[id].enabled;
    }
  }
  return out;
}

export function resolveA7AccountingPayment(params: {
  mode: AccountingMode;
  categoryAmounts: Record<string, number>;
  balances: Record<string, number>;
  validatedConfig: ValidatedPointConfig;
  clientPaymentMethodsByCategory?: Record<string, PaymentMethodValue>;
  clientPaymentMethodsByAmount?: Record<string, number>;
  selectedBaseMethod?: string;
}): ResolvedA7AccountingPayment {
  const {
    mode,
    categoryAmounts,
    balances,
    validatedConfig,
    clientPaymentMethodsByCategory,
    clientPaymentMethodsByAmount,
    selectedBaseMethod,
  } = params;

  if (mode === 'auto') {
    if (
      !clientPaymentMethodsByCategory ||
      Object.keys(clientPaymentMethodsByCategory).length === 0
    ) {
      throw new FunctionCustomError({
        errorKey: 'PAYMENT_CATEGORY_REQUIRED',
        message: '自動充当では paymentMethodsByCategory の送信が必要です',
      });
    }

    let base =
      selectedBaseMethod && isCashLikeMethod(selectedBaseMethod)
        ? selectedBaseMethod
        : null;
    if (!base && clientPaymentMethodsByAmount) {
      base = resolveBaseMethod(clientPaymentMethodsByAmount);
    }
    if (!base) {
      throw new FunctionCustomError({
        errorKey: 'INVALID_ARGUMENT',
        message: '自動充当の base method を特定できません',
      });
    }

    const server = calculateA7PaymentSplit({
      selectedBaseMethod: base,
      bill: categoryAmounts,
      balances,
      pointPriority: validatedConfig.pointPriority,
      categoryPaymentMethods: validatedConfig.categoryPaymentMethods,
      categoryOrder: validatedConfig.categoryOrder,
      balancePaymentSettings: validatedConfig.balancePaymentSettings,
    });

    if (
      !paymentMethodsByCategoryEqual(
        clientPaymentMethodsByCategory,
        server.paymentMethodsByCategory,
      )
    ) {
      throwPaymentSplitMismatch({ side: 'ByCategory' });
    }
    if (
      clientPaymentMethodsByAmount &&
      !paymentMethodsByAmountEqual(
        clientPaymentMethodsByAmount,
        server.paymentMethodsByAmount,
      )
    ) {
      throwPaymentSplitMismatch({ side: 'ByAmount' });
    }

    if (server.cashLikeAmount <= 0) {
      throw new FunctionCustomError({
        errorKey: 'INVALID_ARGUMENT',
        message: 'ポイントのみでの支払いはできません',
      });
    }

    const paymentMethodDetails = buildPaymentMethodDetails({
      paymentMethodsByAmount: server.paymentMethodsByAmount,
      usedBalanceAmounts: server.usedBalanceAmounts,
      balancePaymentSettings: validatedConfig.balancePaymentSettings,
    });

    return {
      paymentMethodsByCategory: server.paymentMethodsByCategory,
      paymentMethodsByAmount: server.paymentMethodsByAmount,
      paymentMethodDetails,
      usedBalanceAmounts: server.usedBalanceAmounts,
    };
  }

  // custom
  if (
    !clientPaymentMethodsByCategory ||
    Object.keys(clientPaymentMethodsByCategory).length === 0
  ) {
    throw new FunctionCustomError({
      errorKey: 'PAYMENT_CATEGORY_REQUIRED',
      message: '手動支払いでは paymentMethodsByCategory が必要です',
    });
  }

  return validateAndNormalizeCustomPayment({
    categoryAmounts,
    paymentMethodsByCategory: clientPaymentMethodsByCategory,
    categoryPaymentMethods: validatedConfig.categoryPaymentMethods,
    balances,
    balancePaymentSettings: validatedConfig.balancePaymentSettings,
    balanceEnabled: balanceEnabledMap(validatedConfig),
    clientPaymentMethodsByAmount,
  });
}
