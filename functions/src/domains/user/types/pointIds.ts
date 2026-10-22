/**
 * A-7: 標準残高・現金系支払い method の ID 定義（正本）
 *
 * 通貨型ポイントと sideGameChip を混ぜない。
 * 個別ファイルでの重複配列定義を避け、ここを import する。
 */

export const CURRENCY_POINT_IDS = [
  'pointA',
  'pointB',
  'pointC',
  'pointD',
  'pointE',
] as const;

export type CurrencyPointId = (typeof CURRENCY_POINT_IDS)[number];

export const SIDE_GAME_CHIP_ID = 'sideGameChip' as const;

export type SideGameChipId = typeof SIDE_GAME_CHIP_ID;

export type BalanceId = CurrencyPointId | SideGameChipId;

export const ALL_BALANCE_IDS = [
  ...CURRENCY_POINT_IDS,
  SIDE_GAME_CHIP_ID,
] as const;

export const CASH_LIKE_METHODS = [
  'cash',
  'credit_card',
  'electronic_money',
] as const;

export type CashLikeMethod = (typeof CASH_LIKE_METHODS)[number];

const CURRENCY_POINT_ID_SET: ReadonlySet<string> = new Set(CURRENCY_POINT_IDS);
const BALANCE_ID_SET: ReadonlySet<string> = new Set(ALL_BALANCE_IDS);
const CASH_LIKE_METHOD_SET: ReadonlySet<string> = new Set(CASH_LIKE_METHODS);

export function isCurrencyPointId(value: unknown): value is CurrencyPointId {
  return typeof value === 'string' && CURRENCY_POINT_ID_SET.has(value);
}

export function isBalanceId(value: unknown): value is BalanceId {
  return typeof value === 'string' && BALANCE_ID_SET.has(value);
}

export function isCashLikeMethod(value: unknown): value is CashLikeMethod {
  return typeof value === 'string' && CASH_LIKE_METHOD_SET.has(value);
}

/** 表示・初期化の固定順（通貨型 → chip） */
export function balanceDisplayOrder(): readonly BalanceId[] {
  return ALL_BALANCE_IDS;
}

/** 新規ユーザー作成時の 6 残高 0 初期化 payload */
export function initialZeroBalanceFields(): Record<BalanceId, 0> {
  return {
    pointA: 0,
    pointB: 0,
    pointC: 0,
    pointD: 0,
    pointE: 0,
    sideGameChip: 0,
  };
}
