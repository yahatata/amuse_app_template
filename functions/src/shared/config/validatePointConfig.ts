/**
 * A-7: ポイント関連 config の整合性 validation
 *
 * 必須設定の欠損を旧値 / default で補完しない。
 * 業務不備は FunctionCustomError(CONFIG_POINT_INVALID)。
 */

import { FunctionCustomError } from '../logging/functionCustomError';
import {
  BalanceId,
  CURRENCY_POINT_IDS,
  CurrencyPointId,
  isBalanceId,
  isCashLikeMethod,
  isCurrencyPointId,
  SIDE_GAME_CHIP_ID,
} from '../../domains/user/types/pointIds';
import type {
  BalancePaymentSetting,
  BalancePaymentSettings,
  PointSettings,
  PointSlotSetting,
  SideGameChipSettings,
  StoreConfig,
} from './types';

export const CONFIG_POINT_INVALID = 'CONFIG_POINT_INVALID' as const;

export const DISPLAY_NAME_MAX_LENGTH = 40;

/** validation 入力（StoreConfig 断片または raw） */
export type PointConfigValidationInput = {
  pointSettings?: unknown;
  sideGameChipSettings?: unknown;
  rankingRewardPointTypes?: unknown;
  categoryPaymentMethods?: unknown;
  pointPriority?: unknown;
  balancePaymentSettings?: unknown;
  categoryOrder?: unknown;
};

export type ValidatedPointConfig = {
  pointSettings: PointSettings;
  sideGameChipSettings: SideGameChipSettings;
  rankingRewardPointTypes: CurrencyPointId[];
  categoryPaymentMethods: Record<string, string[]>;
  pointPriority: BalanceId[];
  balancePaymentSettings: BalancePaymentSettings;
  categoryOrder: string[];
};

/** bill 会計で使う既知カテゴリ */
export const KNOWN_BILL_CATEGORIES = [
  'extraCost',
  'sideGameChip',
  'tournaments',
  'items',
] as const;

function reject(message: string, context?: Record<string, unknown>): never {
  throw new FunctionCustomError({
    errorKey: CONFIG_POINT_INVALID,
    message,
    context,
  });
}

function isPositiveSafeInteger(n: unknown): n is number {
  return (
    typeof n === 'number' &&
    Number.isInteger(n) &&
    n > 0 &&
    n <= Number.MAX_SAFE_INTEGER
  );
}

function validateDisplayName(raw: unknown, path: string): string {
  if (typeof raw !== 'string') {
    reject(`${path}.displayName は string である必要があります`, { path });
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1) {
    reject(`${path}.displayName は trim 後 1 文字以上である必要があります`, {
      path,
    });
  }
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    reject(
      `${path}.displayName は最大 ${DISPLAY_NAME_MAX_LENGTH} 文字です`,
      { path, length: trimmed.length },
    );
  }
  return trimmed;
}

function validateSlotSetting(raw: unknown, path: string): PointSlotSetting {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    reject(`${path} は object である必要があります`, { path });
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.enabled !== 'boolean') {
    reject(`${path}.enabled は boolean である必要があります`, { path });
  }
  return {
    enabled: obj.enabled,
    displayName: validateDisplayName(obj.displayName, path),
  };
}

function validatePointSettings(raw: unknown): PointSettings {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    reject('pointSettings が存在しないか不正です');
  }
  const obj = raw as Record<string, unknown>;
  const out = {} as PointSettings;
  for (const id of CURRENCY_POINT_IDS) {
    if (!Object.prototype.hasOwnProperty.call(obj, id)) {
      reject(`pointSettings.${id} が欠落しています`, { id });
    }
    out[id] = validateSlotSetting(obj[id], `pointSettings.${id}`);
  }
  for (const key of Object.keys(obj)) {
    if (!isCurrencyPointId(key)) {
      reject(`pointSettings に未知のキーがあります: ${key}`, { key });
    }
  }
  return out;
}

function validateSideGameChipSettings(raw: unknown): SideGameChipSettings {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    reject('sideGameChipSettings が存在しないか不正です');
  }
  return validateSlotSetting(raw, 'sideGameChipSettings');
}

function isBalanceEnabled(
  id: BalanceId,
  pointSettings: PointSettings,
  sideGameChipSettings: SideGameChipSettings,
): boolean {
  if (id === SIDE_GAME_CHIP_ID) {
    return sideGameChipSettings.enabled;
  }
  return pointSettings[id].enabled;
}

function validateRankingRewardPointTypes(
  raw: unknown,
  pointSettings: PointSettings,
): CurrencyPointId[] {
  if (raw === undefined) {
    reject('tournament.rankingRewardPointTypes が欠落しています');
  }
  if (!Array.isArray(raw)) {
    reject('rankingRewardPointTypes は配列である必要があります');
  }
  const seen = new Set<string>();
  const out: CurrencyPointId[] = [];
  for (const item of raw) {
    if (item === SIDE_GAME_CHIP_ID) {
      reject('rankingRewardPointTypes に sideGameChip は含められません');
    }
    if (!isCurrencyPointId(item)) {
      reject(`rankingRewardPointTypes に未知または不正な ID: ${String(item)}`, {
        item,
      });
    }
    if (seen.has(item)) {
      reject(`rankingRewardPointTypes に重複があります: ${item}`, { item });
    }
    if (!pointSettings[item].enabled) {
      reject(
        `rankingRewardPointTypes の ${item} は enabled:false です`,
        { item },
      );
    }
    seen.add(item);
    out.push(item);
  }
  return out;
}

function validateCategoryPaymentMethods(
  raw: unknown,
): Record<string, string[]> {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    reject('categoryPaymentMethods が存在しないか不正です');
  }
  const obj = raw as Record<string, unknown>;
  const out: Record<string, string[]> = {};
  for (const [category, methodsRaw] of Object.entries(obj)) {
    if (!Array.isArray(methodsRaw)) {
      reject(`categoryPaymentMethods.${category} は配列である必要があります`, {
        category,
      });
    }
    const methods: string[] = [];
    for (const method of methodsRaw) {
      if (typeof method !== 'string') {
        reject(`categoryPaymentMethods.${category} の要素が string ではありません`, {
          category,
          method,
        });
      }
      if (!isCashLikeMethod(method) && !isBalanceId(method)) {
        reject(
          `categoryPaymentMethods.${category} に未知の method: ${method}`,
          { category, method },
        );
      }
      methods.push(method);
    }
    out[category] = methods;
  }
  return out;
}

function collectPayableBalanceIds(
  categoryPaymentMethods: Record<string, string[]>,
): Set<BalanceId> {
  const set = new Set<BalanceId>();
  for (const methods of Object.values(categoryPaymentMethods)) {
    for (const method of methods) {
      if (isBalanceId(method)) {
        set.add(method);
      }
    }
  }
  return set;
}

function validateBalancePaymentSetting(
  raw: unknown,
  path: string,
): BalancePaymentSetting {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    reject(`${path} は object である必要があります`, { path });
  }
  const obj = raw as Record<string, unknown>;
  const conversionRaw = obj.conversion;
  if (
    conversionRaw == null ||
    typeof conversionRaw !== 'object' ||
    Array.isArray(conversionRaw)
  ) {
    reject(`${path}.conversion は object である必要があります`, { path });
  }
  const conversionObj = conversionRaw as Record<string, unknown>;
  const referenceUnits = conversionObj.referenceUnits;
  const balanceUnits = conversionObj.balanceUnits;
  const usageUnit = obj.usageUnit;

  if (!isPositiveSafeInteger(referenceUnits)) {
    reject(`${path}.conversion.referenceUnits は正の安全整数である必要があります`, {
      path,
      referenceUnits,
    });
  }
  if (!isPositiveSafeInteger(balanceUnits)) {
    reject(`${path}.conversion.balanceUnits は正の安全整数である必要があります`, {
      path,
      balanceUnits,
    });
  }
  if (!isPositiveSafeInteger(usageUnit)) {
    reject(`${path}.usageUnit は正の安全整数である必要があります`, {
      path,
      usageUnit,
    });
  }

  return {
    conversion: { referenceUnits, balanceUnits },
    usageUnit,
  };
}

function validateBalancePaymentSettings(
  raw: unknown,
  payableBalanceIds: Set<BalanceId>,
): BalancePaymentSettings {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    reject('balancePaymentSettings が存在しないか不正です');
  }
  const obj = raw as Record<string, unknown>;
  const out: BalancePaymentSettings = {};

  for (const key of Object.keys(obj)) {
    if (!isBalanceId(key)) {
      reject(`balancePaymentSettings に未知の ID: ${key}`, { key });
    }
    out[key] = validateBalancePaymentSetting(
      obj[key],
      `balancePaymentSettings.${key}`,
    );
  }

  for (const id of payableBalanceIds) {
    if (out[id] == null) {
      reject(
        `categoryPaymentMethods に含まれる ${id} の balancePaymentSettings がありません`,
        { id },
      );
    }
  }

  return out;
}

function validatePointPriority(
  raw: unknown,
  pointSettings: PointSettings,
  sideGameChipSettings: SideGameChipSettings,
  payableBalanceIds: Set<BalanceId>,
): BalanceId[] {
  if (raw === undefined) {
    reject('pointPriority が欠落しています');
  }
  if (!Array.isArray(raw)) {
    reject('pointPriority は配列である必要があります');
  }
  const seen = new Set<string>();
  const out: BalanceId[] = [];
  for (const item of raw) {
    if (isCashLikeMethod(item)) {
      reject(`pointPriority に現金系 method は含められません: ${item}`, {
        item,
      });
    }
    if (!isBalanceId(item)) {
      reject(`pointPriority に未知の ID: ${String(item)}`, { item });
    }
    if (seen.has(item)) {
      reject(`pointPriority に重複があります: ${item}`, { item });
    }
    if (!isBalanceEnabled(item, pointSettings, sideGameChipSettings)) {
      reject(`pointPriority の ${item} は enabled:false です`, { item });
    }
    if (!payableBalanceIds.has(item)) {
      reject(
        `pointPriority の ${item} は categoryPaymentMethods 上の支払可能残高ではありません`,
        { item },
      );
    }
    seen.add(item);
    out.push(item);
  }
  return out;
}

function validateEnabledVsAllowlists(
  pointSettings: PointSettings,
  sideGameChipSettings: SideGameChipSettings,
  categoryPaymentMethods: Record<string, string[]>,
): void {
  for (const [category, methods] of Object.entries(categoryPaymentMethods)) {
    for (const method of methods) {
      if (!isBalanceId(method)) continue;
      if (!isBalanceEnabled(method, pointSettings, sideGameChipSettings)) {
        reject(
          `categoryPaymentMethods.${category} の ${method} は enabled:false です`,
          { category, method },
        );
      }
    }
  }
}

function validateCategoryOrder(raw: unknown): string[] {
  if (raw === undefined) {
    reject('categoryOrder が欠落しています');
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    reject('categoryOrder は非空の配列である必要があります');
  }
  const known = new Set<string>(KNOWN_BILL_CATEGORIES);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !known.has(item)) {
      reject(`categoryOrder に未知のカテゴリがあります: ${String(item)}`, {
        item,
      });
    }
    if (seen.has(item)) {
      reject(`categoryOrder に重複があります: ${item}`, { item });
    }
    seen.add(item);
    out.push(item);
  }
  for (const required of KNOWN_BILL_CATEGORIES) {
    if (!seen.has(required)) {
      reject(`categoryOrder に必須カテゴリ ${required} がありません`, {
        required,
      });
    }
  }
  return out;
}

/**
 * A-7 ポイント config を検証し、正規化結果を返す。
 * 失敗時は FunctionCustomError(CONFIG_POINT_INVALID)。
 */
export function validatePointConfig(
  input: PointConfigValidationInput,
): ValidatedPointConfig {
  const pointSettings = validatePointSettings(input.pointSettings);
  const sideGameChipSettings = validateSideGameChipSettings(
    input.sideGameChipSettings,
  );
  const rankingRewardPointTypes = validateRankingRewardPointTypes(
    input.rankingRewardPointTypes,
    pointSettings,
  );
  const categoryPaymentMethods = validateCategoryPaymentMethods(
    input.categoryPaymentMethods,
  );
  validateEnabledVsAllowlists(
    pointSettings,
    sideGameChipSettings,
    categoryPaymentMethods,
  );
  const payableBalanceIds = collectPayableBalanceIds(categoryPaymentMethods);
  const balancePaymentSettings = validateBalancePaymentSettings(
    input.balancePaymentSettings,
    payableBalanceIds,
  );
  const pointPriority = validatePointPriority(
    input.pointPriority,
    pointSettings,
    sideGameChipSettings,
    payableBalanceIds,
  );
  const categoryOrder = validateCategoryOrder(input.categoryOrder);

  return {
    pointSettings,
    sideGameChipSettings,
    rankingRewardPointTypes,
    categoryPaymentMethods,
    pointPriority,
    balancePaymentSettings,
    categoryOrder,
  };
}

/** StoreConfig から A-7 入力を抽出して検証（Callable 直前用） */
export function validatePointConfigFromStoreConfig(
  config: StoreConfig,
): ValidatedPointConfig {
  return validatePointConfig({
    pointSettings: config.pointSettings,
    sideGameChipSettings: config.sideGameChipSettings,
    rankingRewardPointTypes: config.tournament?.rankingRewardPointTypes,
    categoryPaymentMethods: config.billing?.paymentPolicy?.categoryPaymentMethods,
    pointPriority: config.billing?.paymentPolicy?.pointPriority,
    balancePaymentSettings:
      config.billing?.paymentPolicy?.balancePaymentSettings,
    categoryOrder: config.billing?.paymentPolicy?.categoryOrder,
  });
}

/** テスト・UI 向け: throw せず結果を返す */
export function tryValidatePointConfig(
  input: PointConfigValidationInput,
):
  | { ok: true; value: ValidatedPointConfig }
  | { ok: false; errorKey: typeof CONFIG_POINT_INVALID; message: string } {
  try {
    return { ok: true, value: validatePointConfig(input) };
  } catch (e) {
    if (e instanceof FunctionCustomError && e.errorKey === CONFIG_POINT_INVALID) {
      return { ok: false, errorKey: CONFIG_POINT_INVALID, message: e.message };
    }
    throw e;
  }
}
