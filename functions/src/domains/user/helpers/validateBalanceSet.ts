/**
 * A-7 / A-6: 残高検証
 * - validateInitialBalancesPatch: 初期残高（有効 ID のみ・完全一致）
 * - validateBalanceSet: 移行ログ用（全 6 キー必須）
 * - ユーザードキュメントからの移行読取は readAllStandardBalancesForMigration
 */

import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import {
  ALL_BALANCE_IDS,
  BalanceId,
  isBalanceId,
} from '../types/pointIds';
import {
  enabledBalanceIds,
  isUsableBalanceValue,
  readAllStandardBalancesForMigration,
  type BalanceSet,
  type EnabledBalanceConfig,
} from './userBalances';

export type { BalanceSet };

/** 初期残高リクエスト。有効スロットのキーのみ（1つ以上） */
export type InitialBalancesPatch = Partial<Record<BalanceId, number>> &
  Record<string, number>;

function rejectInvalidBalance(
  message: string,
  context?: Record<string, unknown>,
): never {
  throw new FunctionCustomError({
    errorKey: 'INVALID_BALANCE',
    message,
    context,
  });
}

/**
 * 初期残高設定用: 現在 config の有効 ID と完全一致するパッチを検証する。
 */
export function validateInitialBalancesPatch(
  balances: unknown,
  enabledIds: readonly BalanceId[],
): InitialBalancesPatch {
  if (enabledIds.length === 0) {
    rejectInvalidBalance('有効な残高スロットがありません');
  }
  if (
    balances === null ||
    typeof balances !== 'object' ||
    Array.isArray(balances)
  ) {
    rejectInvalidBalance('残高の指定が不正です');
  }

  const raw = balances as Record<string, unknown>;
  const keys = Object.keys(raw);
  const enabledSet = new Set<string>(enabledIds);

  for (const key of keys) {
    if (!isBalanceId(key)) {
      rejectInvalidBalance(`未知の残高IDです: ${key}`, { balanceId: key });
    }
    if (!enabledSet.has(key)) {
      rejectInvalidBalance(`無効な残高IDがリクエストに含まれています: ${key}`, {
        balanceId: key,
      });
    }
  }

  for (const id of enabledIds) {
    if (!(id in raw)) {
      rejectInvalidBalance(`有効な残高IDが不足しています: ${id}`, {
        balanceId: id,
      });
    }
    if (!isUsableBalanceValue(raw[id])) {
      rejectInvalidBalance('残高は0以上の整数で指定してください', {
        balanceId: id,
      });
    }
  }

  const result: InitialBalancesPatch = {};
  for (const id of enabledIds) {
    result[id] = raw[id] as number;
  }
  return result;
}

/** config 断片から有効 ID を取り、パッチ検証まで一括 */
export function validateInitialBalancesPatchAgainstConfig(
  balances: unknown,
  config: EnabledBalanceConfig,
): InitialBalancesPatch {
  return validateInitialBalancesPatch(balances, enabledBalanceIds(config));
}

/**
 * 移行ログ・冪等用: 全 6 キー必須の非負整数セット。
 */
export function validateBalanceSet(balances: unknown): BalanceSet {
  if (
    balances === null ||
    typeof balances !== 'object' ||
    Array.isArray(balances)
  ) {
    rejectInvalidBalance('残高の指定が不正です');
  }
  const raw = balances as Record<string, unknown>;
  const out = {} as BalanceSet;
  for (const id of ALL_BALANCE_IDS) {
    if (!(id in raw) || !isUsableBalanceValue(raw[id])) {
      rejectInvalidBalance('残高は0以上の整数で指定してください', {
        balanceId: id,
      });
    }
    out[id] = raw[id] as number;
  }
  for (const key of Object.keys(raw)) {
    if (!isBalanceId(key)) {
      rejectInvalidBalance(`未知の残高IDです: ${key}`, { balanceId: key });
    }
  }
  return out;
}

export function balanceSetsEqual(a: BalanceSet, b: BalanceSet): boolean {
  return ALL_BALANCE_IDS.every((id) => a[id] === b[id]);
}

export function initialBalancePatchesEqual(
  a: InitialBalancesPatch,
  b: InitialBalancesPatch,
): boolean {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) return false;
    if (a[keysA[i]] !== b[keysB[i]]) return false;
  }
  return true;
}

/**
 * 更新後ログ用: 既存 user + 適用パッチから全 6 残高を構築。
 * 無効枠は既存（欠損は 0）、有効枠はパッチ値。
 */
export function mergeBalancesAfterInitialPatch(
  userData: Record<string, unknown>,
  patch: InitialBalancesPatch,
): BalanceSet {
  const base = readAllStandardBalancesForMigration(userData);
  for (const [id, value] of Object.entries(patch)) {
    if (isBalanceId(id) && typeof value === 'number') {
      base[id] = value;
    }
  }
  return base;
}
