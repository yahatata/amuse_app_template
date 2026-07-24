/**
 * A-7: 整数比による基準値⇔残高換算（Functions 正本）
 *
 * balanceAmount * referenceUnits = referenceAmount * balanceUnits
 * 浮動小数点丸め・floor/ceil で成立させない。未約分比率でも正しく動作する。
 */

import { FunctionCustomError } from '../../../shared/logging/functionCustomError';

export type BalanceConversion = {
  referenceUnits: number;
  balanceUnits: number;
};

export type ConversionSuccess = {
  ok: true;
  amount: number;
};

export type ConversionFailure = {
  ok: false;
  errorKey: 'CONVERSION_NOT_INTEGER' | 'CONVERSION_OVERFLOW' | 'INVALID_ARGUMENT';
  message: string;
};

export type ConversionResult = ConversionSuccess | ConversionFailure;

function isNonNegativeInteger(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

function isPositiveInteger(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

/** 中間積が安全整数か確認して乗算する */
export function safeMultiply(a: number, b: number): number | null {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    return null;
  }
  if (a === 0 || b === 0) {
    return 0;
  }
  if (a > Number.MAX_SAFE_INTEGER / b) {
    return null;
  }
  return a * b;
}

function fail(
  errorKey: ConversionFailure['errorKey'],
  message: string,
): ConversionFailure {
  return { ok: false, errorKey, message };
}

function validateUnits(conversion: BalanceConversion): ConversionFailure | null {
  if (
    !isPositiveInteger(conversion.referenceUnits) ||
    !isPositiveInteger(conversion.balanceUnits)
  ) {
    return fail('INVALID_ARGUMENT', '換算 unit は正の整数である必要があります');
  }
  if (
    conversion.referenceUnits > Number.MAX_SAFE_INTEGER ||
    conversion.balanceUnits > Number.MAX_SAFE_INTEGER
  ) {
    return fail('CONVERSION_OVERFLOW', '換算 unit が安全整数を超えています');
  }
  return null;
}

/**
 * 基準値量 → 残高量
 * balanceAmount = referenceAmount * balanceUnits / referenceUnits
 */
export function referenceToBalanceAmount(
  referenceAmount: number,
  conversion: BalanceConversion,
): ConversionResult {
  const unitsError = validateUnits(conversion);
  if (unitsError) return unitsError;
  if (!isNonNegativeInteger(referenceAmount)) {
    return fail('INVALID_ARGUMENT', '基準値量は非負整数である必要があります');
  }

  const product = safeMultiply(referenceAmount, conversion.balanceUnits);
  if (product === null) {
    return fail('CONVERSION_OVERFLOW', '換算の中間積が安全整数を超えます');
  }
  if (product % conversion.referenceUnits !== 0) {
    return fail('CONVERSION_NOT_INTEGER', '基準値から残高への換算が整数になりません');
  }
  return { ok: true, amount: product / conversion.referenceUnits };
}

/**
 * 残高量 → 基準値量
 * referenceAmount = balanceAmount * referenceUnits / balanceUnits
 */
export function balanceToReferenceAmount(
  balanceAmount: number,
  conversion: BalanceConversion,
): ConversionResult {
  const unitsError = validateUnits(conversion);
  if (unitsError) return unitsError;
  if (!isNonNegativeInteger(balanceAmount)) {
    return fail('INVALID_ARGUMENT', '残高量は非負整数である必要があります');
  }

  const product = safeMultiply(balanceAmount, conversion.referenceUnits);
  if (product === null) {
    return fail('CONVERSION_OVERFLOW', '換算の中間積が安全整数を超えます');
  }
  if (product % conversion.balanceUnits !== 0) {
    return fail('CONVERSION_NOT_INTEGER', '残高から基準値への換算が整数になりません');
  }
  return { ok: true, amount: product / conversion.balanceUnits };
}

/** Result 失敗を FunctionCustomError に変換（Callable 境界向け） */
export function throwConversionFailure(result: ConversionFailure): never {
  throw new FunctionCustomError({
    errorKey: result.errorKey,
    message: result.message,
  });
}

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}
