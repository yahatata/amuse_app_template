/**
 * A-7: 自動充当用・最大基準値充当額（O(1) 純粋関数）
 *
 * 利用単位を満たし、整数残高へ変換でき、残高とカテゴリ残額を超えない最大の基準値量。
 */

import { gcd, safeMultiply, type BalanceConversion } from './pointConversion';

export type MaxConvertibleInput = {
  remainingReferenceAmount: number;
  availableBalance: number;
  conversion: BalanceConversion;
  usageUnit: number;
};

export type MaxConvertibleSuccess = {
  ok: true;
  referenceAmount: number;
  balanceAmount: number;
};

export type MaxConvertibleFailure = {
  ok: false;
  reason:
    | 'invalid_input'
    | 'overflow'
    | 'zero_allocation';
  message: string;
  referenceAmount: 0;
  balanceAmount: 0;
};

export type MaxConvertibleResult = MaxConvertibleSuccess | MaxConvertibleFailure;

function isNonNegativeInteger(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

function isPositiveInteger(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

function zeroFail(
  reason: MaxConvertibleFailure['reason'],
  message: string,
): MaxConvertibleFailure {
  return {
    ok: false,
    reason,
    message,
    referenceAmount: 0,
    balanceAmount: 0,
  };
}

/**
 * changeSpec §9.2 の最大額計算。
 */
export function computeMaxConvertibleReferenceAmount(
  input: MaxConvertibleInput,
): MaxConvertibleResult {
  const { remainingReferenceAmount: R, availableBalance: B, conversion, usageUnit: U } =
    input;
  const refU = conversion.referenceUnits;
  const balU = conversion.balanceUnits;

  if (
    !isNonNegativeInteger(R) ||
    !isNonNegativeInteger(B) ||
    !isPositiveInteger(U) ||
    !isPositiveInteger(refU) ||
    !isPositiveInteger(balU)
  ) {
    return zeroFail('invalid_input', '自動充当入力が不正です');
  }

  if (
    U > Number.MAX_SAFE_INTEGER ||
    refU > Number.MAX_SAFE_INTEGER ||
    balU > Number.MAX_SAFE_INTEGER
  ) {
    return zeroFail('overflow', 'unit が安全整数を超えています');
  }

  const uTimesBal = safeMultiply(U, balU);
  if (uTimesBal === null) {
    return zeroFail('overflow', 'U × balanceUnits が安全整数を超えます');
  }

  const g = gcd(uTimesBal, refU);
  const stepK = refU / g;
  if (!Number.isInteger(stepK) || stepK <= 0) {
    return zeroFail('invalid_input', 'stepK を計算できません');
  }

  const kMaxByRemain = Math.floor(R / U);

  const balTimesRef = safeMultiply(B, refU);
  if (balTimesRef === null) {
    return zeroFail('overflow', 'B × referenceUnits が安全整数を超えます');
  }
  const kMaxByBal = Math.floor(balTimesRef / uTimesBal);
  const kMax = Math.min(kMaxByRemain, kMaxByBal);
  const k = Math.floor(kMax / stepK) * stepK;

  if (k <= 0) {
    return zeroFail('zero_allocation', '正の充当額がありません');
  }

  const referenceUse = safeMultiply(k, U);
  if (referenceUse === null) {
    return zeroFail('overflow', 'k × usageUnit が安全整数を超えます');
  }

  const refTimesBal = safeMultiply(referenceUse, balU);
  if (refTimesBal === null) {
    return zeroFail('overflow', 'referenceUse × balanceUnits が安全整数を超えます');
  }
  if (refTimesBal % refU !== 0) {
    // アルゴリズム上は整数保証のはず。万一なら 0 充当扱い。
    return zeroFail('zero_allocation', '残高換算が整数になりません');
  }
  const balanceUse = refTimesBal / refU;

  return {
    ok: true,
    referenceAmount: referenceUse,
    balanceAmount: balanceUse,
  };
}
