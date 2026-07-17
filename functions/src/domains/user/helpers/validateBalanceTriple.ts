import { HttpsError } from "firebase-functions/v2/https";

export type BalanceTriple = {
  pointA: number;
  pointB: number;
  sideGameChip: number;
};

const BALANCE_KEYS = ["pointA", "pointB", "sideGameChip"] as const;

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * 初期残高・移行で使う 3 残高を検証する。
 * 負数・小数・欠落・非数は INVALID_BALANCE。
 */
export function validateBalanceTriple(balances: unknown): BalanceTriple {
  if (balances === null || typeof balances !== "object" || Array.isArray(balances)) {
    throw new HttpsError("invalid-argument", "残高の指定が不正です", {
      errorKey: "INVALID_BALANCE",
    });
  }

  const raw = balances as Record<string, unknown>;
  const result: Partial<BalanceTriple> = {};

  for (const key of BALANCE_KEYS) {
    if (!(key in raw) || !isNonNegativeInteger(raw[key])) {
      throw new HttpsError("invalid-argument", "残高は0以上の整数で指定してください", {
        errorKey: "INVALID_BALANCE",
        field: key,
      });
    }
    result[key] = raw[key] as number;
  }

  return result as BalanceTriple;
}

export function balancesEqual(a: BalanceTriple, b: BalanceTriple): boolean {
  return (
    a.pointA === b.pointA &&
    a.pointB === b.pointB &&
    a.sideGameChip === b.sideGameChip
  );
}
