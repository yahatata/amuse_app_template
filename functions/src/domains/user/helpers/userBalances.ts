/**
 * A-7: ユーザー残高の安全な読取・検証
 *
 * フィールド不在 / undefined → 0
 * null / 非number / NaN / Infinity / 負数 / 小数 → データ不整合
 */

import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import {
  ALL_BALANCE_IDS,
  BalanceId,
  CURRENCY_POINT_IDS,
  CurrencyPointId,
  SIDE_GAME_CHIP_ID,
  isBalanceId,
} from '../types/pointIds';

export type BalanceReadResult =
  | { kind: 'ok'; value: number }
  | { kind: 'missing'; value: 0 }
  | { kind: 'corrupt'; reason: string };

export type PointSlotEnabled = { enabled: boolean };

export type EnabledBalanceConfig = {
  pointSettings?: Partial<Record<CurrencyPointId, PointSlotEnabled>>;
  sideGameChipSettings?: PointSlotEnabled;
};

export function allStandardBalanceIds(): readonly BalanceId[] {
  return ALL_BALANCE_IDS;
}

export function balanceField(id: string): BalanceId {
  if (!isBalanceId(id)) {
    throw new FunctionCustomError({
      errorKey: 'INVALID_BALANCE',
      message: `未知の残高IDです: ${id}`,
      context: { balanceId: id },
    });
  }
  return id;
}

export function isUsableBalanceValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * 正常な非負整数以外（null 含む）を INVALID_BALANCE で拒否する。
 */
export function assertUsableBalanceValue(
  value: unknown,
  context?: Record<string, unknown>,
): number {
  if (!isUsableBalanceValue(value)) {
    throw new FunctionCustomError({
      errorKey: 'INVALID_BALANCE',
      message: '残高値がデータ不整合です',
      context: { ...context, value },
    });
  }
  return value;
}

/**
 * Firestore ドキュメント風の data から 1 残高を読む。
 * キー不在 / undefined → missing(0)。null・異常 → corrupt。
 */
export function readBalanceField(
  data: Record<string, unknown> | null | undefined,
  id: BalanceId,
): BalanceReadResult {
  if (data == null || !Object.prototype.hasOwnProperty.call(data, id)) {
    return { kind: 'missing', value: 0 };
  }
  const raw = data[id];
  if (raw === undefined) {
    return { kind: 'missing', value: 0 };
  }
  if (isUsableBalanceValue(raw)) {
    return { kind: 'ok', value: raw };
  }
  return {
    kind: 'corrupt',
    reason: describeCorruptBalance(raw),
  };
}

/**
 * 欠損は 0、正常整数はそのまま、不整合は INVALID_BALANCE。
 */
export function readBalanceOrZeroIfMissing(
  data: Record<string, unknown> | null | undefined,
  id: BalanceId,
): number {
  const result = readBalanceField(data, id);
  if (result.kind === 'corrupt') {
    throw new FunctionCustomError({
      errorKey: 'INVALID_BALANCE',
      message: `残高 ${id} がデータ不整合です`,
      context: { balanceId: id, reason: result.reason },
    });
  }
  return result.value;
}

export type BalanceSet = Record<BalanceId, number>;

/**
 * 移行用: 全標準 6 残高。キー不在は 0、null/異常は拒否。
 */
export function readAllStandardBalancesForMigration(
  data: Record<string, unknown> | null | undefined,
): BalanceSet {
  const out = {} as BalanceSet;
  for (const id of ALL_BALANCE_IDS) {
    out[id] = readBalanceOrZeroIfMissing(data, id);
  }
  return out;
}

/**
 * 表示・初期残高 UI 用の有効残高 ID（通貨型順 → chip）。
 */
export function enabledBalanceIds(config: EnabledBalanceConfig): BalanceId[] {
  const ids: BalanceId[] = [];
  for (const id of CURRENCY_POINT_IDS) {
    if (config.pointSettings?.[id]?.enabled === true) {
      ids.push(id);
    }
  }
  if (config.sideGameChipSettings?.enabled === true) {
    ids.push(SIDE_GAME_CHIP_ID);
  }
  return ids;
}

function describeCorruptBalance(raw: unknown): string {
  if (raw === null) return 'null';
  if (typeof raw !== 'number') return `non-number:${typeof raw}`;
  if (Number.isNaN(raw)) return 'NaN';
  if (!Number.isFinite(raw)) return 'Infinity';
  if (!Number.isInteger(raw)) return 'non-integer';
  if (raw < 0) return 'negative';
  return 'invalid';
}
