/**
 * @deprecated A-7: `validateBalanceSet.ts` を使用すること。
 * 旧 3 残高 API の薄い互換（テスト・未移行 import 用）。
 */

import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import { isUsableBalanceValue } from './userBalances';

export type BalanceTriple = {
  pointA: number;
  pointB: number;
  sideGameChip: number;
};

export function validateBalanceTriple(balances: unknown): BalanceTriple {
  if (
    balances === null ||
    typeof balances !== 'object' ||
    Array.isArray(balances)
  ) {
    throw new FunctionCustomError({
      errorKey: 'INVALID_BALANCE',
      message: '残高の指定が不正です',
    });
  }
  const raw = balances as Record<string, unknown>;
  for (const key of ['pointA', 'pointB', 'sideGameChip'] as const) {
    if (!(key in raw) || !isUsableBalanceValue(raw[key])) {
      throw new FunctionCustomError({
        errorKey: 'INVALID_BALANCE',
        message: '残高は0以上の整数で指定してください',
        context: { balanceId: key },
      });
    }
  }
  return {
    pointA: raw.pointA as number,
    pointB: raw.pointB as number,
    sideGameChip: raw.sideGameChip as number,
  };
}

export function balancesEqual(a: BalanceTriple, b: BalanceTriple): boolean {
  return (
    a.pointA === b.pointA &&
    a.pointB === b.pointB &&
    a.sideGameChip === b.sideGameChip
  );
}
