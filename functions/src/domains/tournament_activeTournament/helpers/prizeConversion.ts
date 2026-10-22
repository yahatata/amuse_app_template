/**
 * A-7: トーナメント順位報酬の conversion snapshot ヘルパ
 */

import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import {
  referenceToBalanceAmount,
  type BalanceConversion,
} from '../../bills/services/pointConversion';
import type { CurrencyPointId } from '../../user/types/pointIds';
import type { ValidatedPointConfig } from '../../../shared/config/validatePointConfig';

export type PrizeConversion = BalanceConversion;

export function resolvePrizeConversionFromConfig(
  pointType: CurrencyPointId,
  config: ValidatedPointConfig,
): PrizeConversion {
  const setting = config.balancePaymentSettings[pointType];
  if (!setting?.conversion) {
    throw new FunctionCustomError({
      errorKey: 'CONFIG_POINT_INVALID',
      message: `${pointType} の balancePaymentSettings.conversion がありません`,
      context: { pointType },
    });
  }
  const { referenceUnits, balanceUnits } = setting.conversion;
  if (
    !Number.isInteger(referenceUnits) ||
    !Number.isInteger(balanceUnits) ||
    referenceUnits <= 0 ||
    balanceUnits <= 0 ||
    referenceUnits > Number.MAX_SAFE_INTEGER ||
    balanceUnits > Number.MAX_SAFE_INTEGER
  ) {
    throw new FunctionCustomError({
      errorKey: 'INVALID_ARGUMENT',
      message: `${pointType} の conversion が正の安全整数ではありません`,
      context: { pointType },
    });
  }
  return { referenceUnits, balanceUnits };
}

export function parseSavedPrizeConversion(
  raw: unknown,
  context: Record<string, unknown> = {},
): PrizeConversion {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new FunctionCustomError({
      errorKey: 'INVALID_ARGUMENT',
      message: 'prizeConversion が欠損しています。プライズを再確定してください',
      context,
    });
  }
  const obj = raw as Record<string, unknown>;
  const referenceUnits = obj.referenceUnits;
  const balanceUnits = obj.balanceUnits;
  if (
    typeof referenceUnits !== 'number' ||
    typeof balanceUnits !== 'number' ||
    !Number.isInteger(referenceUnits) ||
    !Number.isInteger(balanceUnits) ||
    referenceUnits <= 0 ||
    balanceUnits <= 0
  ) {
    throw new FunctionCustomError({
      errorKey: 'INVALID_ARGUMENT',
      message: 'prizeConversion が不正です。プライズを再確定してください',
      context,
    });
  }
  return { referenceUnits, balanceUnits };
}

/** 基準値量を保存済み conversion で残高量へ換算（失敗時は throw） */
export function convertPrizeReferenceToBalance(
  prizeReferenceAmount: number,
  conversion: PrizeConversion,
  context: Record<string, unknown> = {},
): number {
  const result = referenceToBalanceAmount(prizeReferenceAmount, conversion);
  if (!result.ok) {
    throw new FunctionCustomError({
      errorKey: result.errorKey,
      message: result.message,
      context,
    });
  }
  return result.amount;
}

/** 順位キー（1stPrize 等）と基準値量の組を抽出 */
export function extractPrizeReferenceEntries(
  prizeData: Record<string, unknown>,
): Array<{ rankKey: string; amount: number }> {
  const entries: Array<{ rankKey: string; amount: number }> = [];
  for (const [key, value] of Object.entries(prizeData)) {
    if (!key.endsWith('stPrize')) continue;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new FunctionCustomError({
        errorKey: 'INVALID_ARGUMENT',
        message: `${key} は非負整数の基準値量である必要があります`,
        context: { rankKey: key },
      });
    }
    entries.push({ rankKey: key, amount: value });
  }
  return entries;
}
