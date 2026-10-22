/**
 * A-7 Phase 3: 返金・追加徴収の残高移動計画
 *
 * 返金: bill.meta.paymentMethodDetails（および未マージの collection ロット）の
 *       保存済み conversion を正本とする。現在 config では再計算しない。
 * 追加徴収: 現在 config の balancePaymentSettings で換算・単位検証する。
 */

import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import type { BalancePaymentSettings } from '../../../shared/config/types';
import type { ValidatedPointConfig } from '../../../shared/config/validatePointConfig';
import {
  isBalanceId,
  isCurrencyPointId,
  SIDE_GAME_CHIP_ID,
  type BalanceId,
} from '../../user/types/pointIds';
import {
  balanceToReferenceAmount,
  referenceToBalanceAmount,
  type BalanceConversion,
} from './pointConversion';
import type { PaymentMethodDetails } from './paymentMethodAggregation';

export type BalanceMethodSnapshot = {
  referenceAmount: number;
  balanceAmount: number;
  conversion: BalanceConversion;
  usageUnit: number;
  refundedBalanceAmount: number;
  /** true のとき Details へ金額マージ済み。返金 FIFO ではスキップする */
  mergedIntoBillDetails: boolean;
};

export type CollectionLot = {
  cashActionId: string;
  sequenceNo: number;
  method: BalanceId;
  snapshot: BalanceMethodSnapshot;
};

export type PlannedBalanceMovement = {
  method: BalanceId;
  referenceAmount: number;
  balanceAmount: number;
  conversion: BalanceConversion;
  usageUnit: number;
  /** details 更新量（返金時） */
  detailsRefundedBalanceDelta: number;
  /** collection ロットへの返金累積（未マージ分のみ） */
  lotRefunds: Array<{ cashActionId: string; refundedBalanceDelta: number }>;
};

function conversionsEqual(a: BalanceConversion, b: BalanceConversion): boolean {
  return a.referenceUnits === b.referenceUnits && a.balanceUnits === b.balanceUnits;
}

function assertPositiveInteger(n: unknown, label: string): number {
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) {
    throw new FunctionCustomError({
      errorKey: 'ACCOUNTING_CASH_ACTION_INVALID',
      message: `${label} は正の整数である必要があります`,
      context: { value: n },
    });
  }
  return n;
}

/** categoryPaymentMethods の値の和集合 */
export function unionCategoryAllowlist(
  categoryPaymentMethods: Record<string, string[]>,
): Set<string> {
  const out = new Set<string>();
  for (const methods of Object.values(categoryPaymentMethods)) {
    if (!Array.isArray(methods)) continue;
    for (const m of methods) out.add(m);
  }
  return out;
}

export function isBalanceMethodEnabled(
  method: BalanceId,
  config: ValidatedPointConfig,
): boolean {
  if (method === SIDE_GAME_CHIP_ID) {
    return config.sideGameChipSettings.enabled === true;
  }
  if (isCurrencyPointId(method)) {
    return config.pointSettings[method]?.enabled === true;
  }
  return false;
}

/**
 * 追加徴収: method ごとの基準値量から残高減算計画を作る。
 */
export function planCollectionBalanceMovements(params: {
  methodBreakdown: Array<{ method: string; amountIncl: number }>;
  validatedConfig: ValidatedPointConfig;
  userBalances: Record<string, number>;
}): {
  movements: PlannedBalanceMovement[];
  cashActionSnapshots: Record<string, BalanceMethodSnapshot>;
  detailsMerge: PaymentMethodDetails;
} {
  const { methodBreakdown, validatedConfig, userBalances } = params;
  const allowlist = unionCategoryAllowlist(validatedConfig.categoryPaymentMethods);
  const movements: PlannedBalanceMovement[] = [];
  const cashActionSnapshots: Record<string, BalanceMethodSnapshot> = {};
  const detailsMerge: PaymentMethodDetails = {};

  for (const entry of methodBreakdown) {
    if (!isBalanceId(entry.method)) continue;
    const method = entry.method;
    const referenceAmount = assertPositiveInteger(entry.amountIncl, `${method} 徴収額`);

    if (!isBalanceMethodEnabled(method, validatedConfig)) {
      throw new FunctionCustomError({
        errorKey: 'ACCOUNTING_CASH_ACTION_INVALID',
        message: `${method} は現在無効です`,
        context: { method },
      });
    }
    if (!allowlist.has(method)) {
      throw new FunctionCustomError({
        errorKey: 'ACCOUNTING_CASH_ACTION_INVALID',
        message: `${method} は支払い許可一覧に含まれていません`,
        context: { method },
      });
    }

    const setting =
      validatedConfig.balancePaymentSettings[
        method as keyof BalancePaymentSettings
      ];
    if (!setting) {
      throw new FunctionCustomError({
        errorKey: 'CONFIG_POINT_INVALID',
        message: `${method} の balancePaymentSettings がありません`,
        context: { method },
      });
    }

    if (referenceAmount % setting.usageUnit !== 0) {
      throw new FunctionCustomError({
        errorKey: 'USAGE_UNIT_VIOLATION',
        message: `${method} の利用単位（${setting.usageUnit}）に合いません`,
        context: { method, referenceAmount, usageUnit: setting.usageUnit },
      });
    }

    const conv = referenceToBalanceAmount(referenceAmount, setting.conversion);
    if (!conv.ok) {
      throw new FunctionCustomError({
        errorKey: conv.errorKey,
        message: conv.message,
        context: { method, referenceAmount },
      });
    }

    const balanceAmount = conv.amount;
    const available = userBalances[method] ?? 0;
    if (available < balanceAmount) {
      throw new FunctionCustomError({
        errorKey: 'ACCOUNTING_INSUFFICIENT_BALANCE',
        message: `${method} の残高が不足しています`,
        context: { method, available, required: balanceAmount },
      });
    }

    const snapshot: BalanceMethodSnapshot = {
      referenceAmount,
      balanceAmount,
      conversion: { ...setting.conversion },
      usageUnit: setting.usageUnit,
      refundedBalanceAmount: 0,
      mergedIntoBillDetails: true, // 呼び出し側で conversion 衝突時に false へ
    };

    movements.push({
      method,
      referenceAmount,
      balanceAmount,
      conversion: snapshot.conversion,
      usageUnit: snapshot.usageUnit,
      detailsRefundedBalanceDelta: 0,
      lotRefunds: [],
    });
    cashActionSnapshots[method] = snapshot;
    detailsMerge[method] = {
      referenceAmount,
      balanceAmount,
      conversion: snapshot.conversion,
      usageUnit: snapshot.usageUnit,
      refundedBalanceAmount: 0,
    };
  }

  return { movements, cashActionSnapshots, detailsMerge };
}

/**
 * Details へ追加徴収分を非破壊マージできるか判定し、merged フラグを確定する。
 */
export function applyCollectionDetailsMerge(params: {
  existingDetails: PaymentMethodDetails;
  detailsMerge: PaymentMethodDetails;
  cashActionSnapshots: Record<string, BalanceMethodSnapshot>;
}): PaymentMethodDetails {
  const { existingDetails, detailsMerge, cashActionSnapshots } = params;
  const next: PaymentMethodDetails = { ...existingDetails };

  for (const [method, add] of Object.entries(detailsMerge)) {
    const existing = existingDetails[method];
    const snap = cashActionSnapshots[method];
    if (!snap) continue;

    if (!existing) {
      next[method] = {
        referenceAmount: add.referenceAmount,
        balanceAmount: add.balanceAmount,
        conversion: { ...add.conversion },
        usageUnit: add.usageUnit,
        refundedBalanceAmount: 0,
      };
      snap.mergedIntoBillDetails = true;
      continue;
    }

    if (!conversionsEqual(existing.conversion, add.conversion)) {
      // 親 Details の conversion を壊さない。ロット側のみで返金対象にする。
      snap.mergedIntoBillDetails = false;
      continue;
    }

    next[method] = {
      ...existing,
      referenceAmount: existing.referenceAmount + add.referenceAmount,
      balanceAmount: existing.balanceAmount + add.balanceAmount,
    };
    snap.mergedIntoBillDetails = true;
  }

  return next;
}

/**
 * 返金: 保存済み conversion で残高復元量を計画する。
 * Details 残量 → 未マージ collection ロット（sequenceNo 昇順）の FIFO。
 */
export function planRefundBalanceMovements(params: {
  methodBreakdown: Array<{ method: string; amountIncl: number }>;
  paymentMethodDetails: PaymentMethodDetails;
  collectionLots: CollectionLot[];
}): {
  movements: PlannedBalanceMovement[];
  nextDetails: PaymentMethodDetails;
} {
  const { methodBreakdown, paymentMethodDetails, collectionLots } = params;
  const nextDetails: PaymentMethodDetails = { ...paymentMethodDetails };
  const movements: PlannedBalanceMovement[] = [];

  for (const entry of methodBreakdown) {
    if (!isBalanceId(entry.method)) continue;
    const method = entry.method;
    const refundReference = assertPositiveInteger(entry.amountIncl, `${method} 返金額`);

    let remaining = refundReference;
    let totalBalanceRestore = 0;
    let detailsRefundedBalanceDelta = 0;
    const lotRefunds: Array<{ cashActionId: string; refundedBalanceDelta: number }> =
      [];
    let usedConversion: BalanceConversion | null = null;
    let usedUsageUnit = 1;

    const detail = nextDetails[method];
    if (detail) {
      const refundableBal = detail.balanceAmount - detail.refundedBalanceAmount;
      if (refundableBal < 0) {
        throw new FunctionCustomError({
          errorKey: 'ACCOUNTING_INVARIANT_VIOLATION',
          message: `${method} の refundedBalanceAmount が不正です`,
          context: { method, detail },
        });
      }

      if (remaining > 0 && refundableBal > 0) {
        const maxRefResult = balanceToReferenceAmount(
          refundableBal,
          detail.conversion,
        );
        if (!maxRefResult.ok) {
          throw new FunctionCustomError({
            errorKey: maxRefResult.errorKey,
            message: maxRefResult.message,
            context: { method, refundableBal },
          });
        }
        const takeRef = Math.min(remaining, maxRefResult.amount);
        const balResult = referenceToBalanceAmount(takeRef, detail.conversion);
        if (!balResult.ok) {
          throw new FunctionCustomError({
            errorKey: balResult.errorKey,
            message: balResult.message,
            context: { method, takeRef },
          });
        }
        if (balResult.amount > refundableBal) {
          throw new FunctionCustomError({
            errorKey: 'REFUND_BALANCE_EXCEEDED',
            message: `${method} の返金残高量が残量を超えます`,
            context: {
              method,
              requestedBalance: balResult.amount,
              refundableBal,
            },
          });
        }

        detailsRefundedBalanceDelta = balResult.amount;
        totalBalanceRestore += balResult.amount;
        remaining -= takeRef;
        usedConversion = detail.conversion;
        usedUsageUnit = detail.usageUnit;

        nextDetails[method] = {
          ...detail,
          refundedBalanceAmount:
            detail.refundedBalanceAmount + detailsRefundedBalanceDelta,
        };
      }
    }

    const lotsForMethod = collectionLots
      .filter(
        (lot) =>
          lot.method === method && lot.snapshot.mergedIntoBillDetails === false,
      )
      .sort((a, b) => a.sequenceNo - b.sequenceNo);

    for (const lot of lotsForMethod) {
      if (remaining <= 0) break;
      const snap = lot.snapshot;
      const refundableBal = snap.balanceAmount - snap.refundedBalanceAmount;
      if (refundableBal <= 0) continue;

      const maxRefResult = balanceToReferenceAmount(refundableBal, snap.conversion);
      if (!maxRefResult.ok) {
        throw new FunctionCustomError({
          errorKey: maxRefResult.errorKey,
          message: maxRefResult.message,
          context: { method, cashActionId: lot.cashActionId },
        });
      }
      const takeRef = Math.min(remaining, maxRefResult.amount);
      const balResult = referenceToBalanceAmount(takeRef, snap.conversion);
      if (!balResult.ok) {
        throw new FunctionCustomError({
          errorKey: balResult.errorKey,
          message: balResult.message,
          context: { method, takeRef, cashActionId: lot.cashActionId },
        });
      }

      lotRefunds.push({
        cashActionId: lot.cashActionId,
        refundedBalanceDelta: balResult.amount,
      });
      totalBalanceRestore += balResult.amount;
      remaining -= takeRef;
      usedConversion = snap.conversion;
      usedUsageUnit = snap.usageUnit;
    }

    if (remaining > 0) {
      // まだ残っている = Details/ロット不足、または割り切れず途中で止まった
      // 全体を一括換算できないケースもここに落ちる
      if (!detail && lotsForMethod.length === 0) {
        throw new FunctionCustomError({
          errorKey: 'ACCOUNTING_CASH_ACTION_INVALID',
          message: `${method} の paymentMethodDetails がありません（返金の換算正本が不明です）`,
          context: { method, refundReference },
        });
      }
      throw new FunctionCustomError({
        errorKey: 'REFUND_BALANCE_EXCEEDED',
        message: `${method} の返金可能残高量を超えています`,
        context: { method, refundReference, remainingReference: remaining },
      });
    }

    // 全額が一括で Details のみから返せる場合の厳密チェック:
    // remaining==0 でも、要求 refundReference 全体が単一 conversion で整数換算できない
    // 混合ロットはロット単位で検証済み。単一ソースなら上で takeRef=refundReference のはず。

    if (totalBalanceRestore <= 0 || !usedConversion) {
      throw new FunctionCustomError({
        errorKey: 'ACCOUNTING_CASH_ACTION_INVALID',
        message: `${method} の返金残高量が算出できませんでした`,
        context: { method, refundReference },
      });
    }

    movements.push({
      method,
      referenceAmount: refundReference,
      balanceAmount: totalBalanceRestore,
      conversion: usedConversion,
      usageUnit: usedUsageUnit,
      detailsRefundedBalanceDelta,
      lotRefunds,
    });
  }

  return { movements, nextDetails };
}

/**
 * 単一 conversion（Details のみ）の返金を厳密検証する補助。
 * 部分返金で要求基準値が conversion で割り切れない場合に CONVERSION_NOT_INTEGER。
 */
export function convertRefundReferenceOrThrow(params: {
  method: string;
  refundReference: number;
  conversion: BalanceConversion;
  refundableBalance: number;
}): number {
  const { method, refundReference, conversion, refundableBalance } = params;
  const conv = referenceToBalanceAmount(refundReference, conversion);
  if (!conv.ok) {
    throw new FunctionCustomError({
      errorKey: conv.errorKey,
      message: conv.message,
      context: { method, refundReference },
    });
  }
  if (conv.amount > refundableBalance) {
    throw new FunctionCustomError({
      errorKey: 'REFUND_BALANCE_EXCEEDED',
      message: `${method} の返金残高量が残量を超えます`,
      context: {
        method,
        requestedBalance: conv.amount,
        refundableBalance,
      },
    });
  }
  return conv.amount;
}
