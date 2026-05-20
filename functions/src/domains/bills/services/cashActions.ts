/**
 * cashActions の純粋関数群（Step04 changeSpec §3.2.1）。
 *
 * 仕様書 04_cashActions管理.md の必須 field / 整合ルール / allocations / methodBreakdown / adjustment 残額更新
 * を Firestore に直接書き込まない pure function 群として提供する。
 * Firestore への write は repos 層で行う。
 *
 * Step03 で先行実装した `buildImmediateCashActionDoc` は後方互換のために残し、
 * 内部では `buildCashActionDoc` に委譲する形で統合する。
 *
 * 関連:
 * - docs/事後イベント（会計後調整系）本番化/仕様実装管理/04_仕様書/04_cashActions管理.md
 * - docs/事後イベント（会計後調整系）本番化/仕様実装管理/03.1_前提再設計/step3.11_未決論点の再決定/12_analyticsMonthlyと入出金データの役割分担.md
 */

import type {
  AdjustmentDirection,
  AdjustmentState,
} from './adjustments';
import { calcBusinessDate } from '../repos/calcBusinessDate';

export type CashActionType = 'refund' | 'collection';

export interface CashActionMethodBreakdownEntry {
  method: string;
  amountIncl: number;
}

export interface CashActionAllocationEntry {
  adjustmentId: string;
  amountIncl: number;
}

export interface CashActionDoc {
  sequenceNo: number;
  cashActionType: CashActionType;
  amountIncl: number;
  executedAt: unknown;
  executedBy: string | null;
  cashflowBusinessDate: string;
  methodBreakdown: CashActionMethodBreakdownEntry[];
  allocations: CashActionAllocationEntry[];
  note: string;
}

/**
 * cashAction 作成時に対象 adjustments の状態を渡すための shape。
 * adjustment 側の存在確認 / direction 整合 / remaining 制約を判定するために使う。
 */
export interface ExistingAdjustmentForAllocation {
  adjustmentId: string;
  cycleNo: number;
  adjustmentDirection: AdjustmentDirection;
  adjustmentState: AdjustmentState;
  requiredActionRemainingIncl: number;
}

export interface AllocationPatch {
  requiredActionRemainingIncl: number;
  adjustmentState?: 'completed_by_cash_action';
}

export interface ApplyAllocationsResult {
  /** 既存 adjustment への update patch（更新が必要な分のみ） */
  patches: Map<string, AllocationPatch>;
  /** patch 適用後の adjustment 状態（summarize remaining 用） */
  adjustmentsAfterUpdate: ExistingAdjustmentForAllocation[];
}

const ALL_CASH_ACTION_TYPES: ReadonlySet<CashActionType> = new Set(['refund', 'collection']);

/** Step04 §8.3: current-scope で許容する method 文字列 */
const ALLOWED_METHODS: ReadonlySet<string> = new Set([
  'cash',
  'credit_card',
  'electronic_money',
  'qr',
  'bank_transfer',
  'other',
]);

/**
 * 仕様書 04 §8 / §15 の methodBreakdown 整合検証。
 *
 * - length >= 1
 * - 各 entry の method が現行実装の許容値であること
 * - 各 entry の amountIncl > 0
 * - sum(methodBreakdown[].amountIncl) === expectedAmountIncl
 */
export function validateMethodBreakdown(input: {
  methodBreakdown: CashActionMethodBreakdownEntry[];
  expectedAmountIncl: number;
}): void {
  const { methodBreakdown, expectedAmountIncl } = input;

  if (!Array.isArray(methodBreakdown) || methodBreakdown.length === 0) {
    throw new Error('methodBreakdown must contain at least 1 entry');
  }

  let sum = 0;
  for (const entry of methodBreakdown) {
    if (typeof entry.method !== 'string' || entry.method.length === 0) {
      throw new Error('methodBreakdown[].method must be a non-empty string');
    }
    if (!ALLOWED_METHODS.has(entry.method)) {
      throw new Error(
        `methodBreakdown[].method '${entry.method}' is not in current-scope set: ${Array.from(ALLOWED_METHODS).join(', ')}`
      );
    }
    if (
      typeof entry.amountIncl !== 'number' ||
      !Number.isFinite(entry.amountIncl) ||
      entry.amountIncl <= 0
    ) {
      throw new Error(
        `methodBreakdown[].amountIncl must be > 0 finite number, got: ${String(entry.amountIncl)}`
      );
    }
    sum += entry.amountIncl;
  }

  if (sum !== expectedAmountIncl) {
    throw new Error(
      `sum(methodBreakdown[].amountIncl) must equal cashAction.amountIncl (${expectedAmountIncl}), got ${sum}`
    );
  }
}

/**
 * 仕様書 04 §9.4 / §15 の allocations 整合検証。
 *
 * - 1 件以上必須
 * - sum === cashActionAmountIncl
 * - allocation 先 adjustment が existingAdjustments に存在
 * - allocation 先 adjustment が expectedCycleNo に属する（異 cycle 混在禁止）
 * - allocation 先 adjustment が expectedDirection を持つ（refund→decrease, collection→increase）
 * - allocation 先 adjustment が `effective` && `remaining > 0`
 * - 各 allocation amountIncl > 0 かつ <= 対象 adjustment の remaining（over-allocation 禁止）
 * - 同一 cashAction 内で同じ adjustmentId に複数 allocate しない（重複禁止）
 */
export function validateAllocations(input: {
  allocations: CashActionAllocationEntry[];
  cashActionAmountIncl: number;
  existingAdjustments: ExistingAdjustmentForAllocation[];
  expectedCycleNo: number;
  expectedDirection: AdjustmentDirection;
}): void {
  const { allocations, cashActionAmountIncl, existingAdjustments, expectedCycleNo, expectedDirection } =
    input;

  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw new Error('allocations must contain at least 1 entry (allocation-less cashAction is forbidden)');
  }

  const seenAdjustmentIds = new Set<string>();
  let sum = 0;

  const adjustmentMap = new Map<string, ExistingAdjustmentForAllocation>();
  for (const adj of existingAdjustments) {
    adjustmentMap.set(adj.adjustmentId, adj);
  }

  for (const allocation of allocations) {
    if (typeof allocation.adjustmentId !== 'string' || allocation.adjustmentId.length === 0) {
      throw new Error('allocations[].adjustmentId must be a non-empty string');
    }
    if (
      typeof allocation.amountIncl !== 'number' ||
      !Number.isFinite(allocation.amountIncl) ||
      allocation.amountIncl <= 0
    ) {
      throw new Error(
        `allocations[].amountIncl must be > 0 finite number, got: ${String(allocation.amountIncl)}`
      );
    }
    if (seenAdjustmentIds.has(allocation.adjustmentId)) {
      throw new Error(
        `allocations[] contains duplicate adjustmentId: ${allocation.adjustmentId}`
      );
    }
    seenAdjustmentIds.add(allocation.adjustmentId);

    const existing = adjustmentMap.get(allocation.adjustmentId);
    if (!existing) {
      throw new Error(
        `allocation target adjustmentId not found in current cycle: ${allocation.adjustmentId}`
      );
    }
    if (existing.cycleNo !== expectedCycleNo) {
      throw new Error(
        `allocation target adjustment ${allocation.adjustmentId} belongs to cycle ${existing.cycleNo}, expected ${expectedCycleNo}`
      );
    }
    if (existing.adjustmentDirection !== expectedDirection) {
      throw new Error(
        `allocation target adjustment ${allocation.adjustmentId} has direction '${existing.adjustmentDirection}', expected '${expectedDirection}' for this cashActionType`
      );
    }
    if (existing.adjustmentState !== 'effective') {
      throw new Error(
        `allocation target adjustment ${allocation.adjustmentId} is not effective (state=${existing.adjustmentState})`
      );
    }
    if (existing.requiredActionRemainingIncl <= 0) {
      throw new Error(
        `allocation target adjustment ${allocation.adjustmentId} has no remaining (requiredActionRemainingIncl=${existing.requiredActionRemainingIncl})`
      );
    }
    if (allocation.amountIncl > existing.requiredActionRemainingIncl) {
      throw new Error(
        `over-allocation: allocation.amountIncl (${allocation.amountIncl}) exceeds adjustment ${allocation.adjustmentId} remaining (${existing.requiredActionRemainingIncl})`
      );
    }

    sum += allocation.amountIncl;
  }

  if (sum !== cashActionAmountIncl) {
    throw new Error(
      `sum(allocations[].amountIncl) must equal cashAction.amountIncl (${cashActionAmountIncl}), got ${sum}`
    );
  }
}

/**
 * 仕様書 04 §6 / §7 / §8 / §9 / §15 の必須 field を満たす cashAction doc を組み立てる。
 *
 * Step04 で multi method / multi allocation 対応の汎用 builder。
 *
 * 注意: validateAllocations は対象 adjustment 一覧が必要なため、ここでは行わない。
 * 呼び出し側 repo で `validateAllocations` を別途呼ぶこと。
 */
export function buildCashActionDoc(input: {
  sequenceNo: number;
  cashActionType: CashActionType;
  amountIncl: number;
  executedAt: unknown;
  executedBy: string | null;
  cashflowBusinessDate: string;
  methodBreakdown: CashActionMethodBreakdownEntry[];
  allocations: CashActionAllocationEntry[];
  note?: string;
}): CashActionDoc {
  const {
    sequenceNo,
    cashActionType,
    amountIncl,
    executedAt,
    executedBy,
    cashflowBusinessDate,
    methodBreakdown,
    allocations,
    note,
  } = input;

  if (typeof amountIncl !== 'number' || !Number.isFinite(amountIncl) || amountIncl <= 0) {
    throw new Error(`cashAction.amountIncl must be > 0 finite number, got: ${String(amountIncl)}`);
  }
  if (!ALL_CASH_ACTION_TYPES.has(cashActionType)) {
    throw new Error(`cashActionType must be 'refund' or 'collection', got: ${cashActionType as string}`);
  }
  if (typeof cashflowBusinessDate !== 'string' || cashflowBusinessDate.length === 0) {
    throw new Error('cashAction.cashflowBusinessDate must be a non-empty string');
  }

  // methodBreakdown は self-consistency 検証
  validateMethodBreakdown({ methodBreakdown, expectedAmountIncl: amountIncl });

  // allocations は self-consistency（length / sum）のみ検証。
  // adjustment 状態への整合検証は呼び出し側 repo で行う（adjustment doc の最新状態が必要なため）。
  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw new Error('allocations must contain at least 1 entry');
  }
  let allocationSum = 0;
  for (const allocation of allocations) {
    if (typeof allocation.adjustmentId !== 'string' || allocation.adjustmentId.length === 0) {
      throw new Error('allocations[].adjustmentId must be a non-empty string');
    }
    if (
      typeof allocation.amountIncl !== 'number' ||
      !Number.isFinite(allocation.amountIncl) ||
      allocation.amountIncl <= 0
    ) {
      throw new Error(`allocations[].amountIncl must be > 0 finite number, got: ${String(allocation.amountIncl)}`);
    }
    allocationSum += allocation.amountIncl;
  }
  if (allocationSum !== amountIncl) {
    throw new Error(
      `sum(allocations[].amountIncl) must equal amountIncl (${amountIncl}), got ${allocationSum}`
    );
  }

  return {
    sequenceNo,
    cashActionType,
    amountIncl,
    executedAt,
    executedBy: executedBy ?? null,
    cashflowBusinessDate,
    methodBreakdown: methodBreakdown.map((m) => ({ method: m.method, amountIncl: m.amountIncl })),
    allocations: allocations.map((a) => ({ adjustmentId: a.adjustmentId, amountIncl: a.amountIncl })),
    note: typeof note === 'string' ? note : '',
  };
}

/**
 * 仕様書 04 §10 の adjustment 残額更新ルール。
 *
 * - 各 allocation について `requiredActionRemainingIncl -= amountIncl`
 * - 0 になった adjustment は `adjustmentState = completed_by_cash_action`
 * - 残った adjustment は `effective` のまま（patch に含めない）
 * - 0 未満は仕様書 §15.4 で禁止。validateAllocations が事前に弾く前提
 *
 * 戻り値:
 * - patches: 既存 adjustment への update 差分（`tx.update` に渡す）
 * - adjustmentsAfterUpdate: patch 反映後の adjustment 状態（summarizeRemainingByDirection 用）
 */
export function applyAllocationsToAdjustments(input: {
  allocations: CashActionAllocationEntry[];
  existingAdjustments: ExistingAdjustmentForAllocation[];
}): ApplyAllocationsResult {
  const { allocations, existingAdjustments } = input;

  // 各 adjustment への減額合計を計算
  const decrementMap = new Map<string, number>();
  for (const allocation of allocations) {
    const current = decrementMap.get(allocation.adjustmentId) ?? 0;
    decrementMap.set(allocation.adjustmentId, current + allocation.amountIncl);
  }

  const patches = new Map<string, AllocationPatch>();
  const adjustmentsAfterUpdate: ExistingAdjustmentForAllocation[] = existingAdjustments.map(
    (existing) => {
      const decrement = decrementMap.get(existing.adjustmentId) ?? 0;
      if (decrement === 0) {
        return existing;
      }

      const newRemaining = existing.requiredActionRemainingIncl - decrement;
      if (newRemaining < 0) {
        throw new Error(
          `over-allocation detected for adjustment ${existing.adjustmentId}: remaining=${existing.requiredActionRemainingIncl}, decrement=${decrement}`
        );
      }

      if (newRemaining === 0) {
        patches.set(existing.adjustmentId, {
          requiredActionRemainingIncl: 0,
          adjustmentState: 'completed_by_cash_action',
        });
        return {
          ...existing,
          requiredActionRemainingIncl: 0,
          adjustmentState: 'completed_by_cash_action',
        };
      }

      patches.set(existing.adjustmentId, {
        requiredActionRemainingIncl: newRemaining,
      });
      return {
        ...existing,
        requiredActionRemainingIncl: newRemaining,
      };
    }
  );

  return { patches, adjustmentsAfterUpdate };
}

/**
 * cashflowBusinessDate を解決する。
 *
 * 優先順位:
 * 1. inputBusinessDate が non-empty string → そのまま採用
 * 2. calcBusinessDate(executedAt) が status=OK → businessDateKey を採用
 * 3. calcBusinessDate が NONE / AMBIGUOUS / 例外 → billBusinessDate を borrow
 * 4. billBusinessDate も空なら throw
 *
 * Step04 の運用判断（02_changeSpec.md §5.7）。
 *
 * 注意: この関数は calcBusinessDate を呼ぶため Firestore に依存する（pure 関数ではない）。
 * unit test では calcBusinessDate を mock すること。
 */
export async function resolveCashflowBusinessDate(input: {
  inputBusinessDate?: string | null;
  executedAt: Date;
  billBusinessDate: string | null | undefined;
}): Promise<string> {
  const { inputBusinessDate, executedAt, billBusinessDate } = input;

  if (typeof inputBusinessDate === 'string' && inputBusinessDate.length > 0) {
    return inputBusinessDate;
  }

  try {
    const result = await calcBusinessDate(executedAt);
    if (result.status === 'OK') {
      return result.businessDateKey;
    }
    // status: NONE / AMBIGUOUS は fallback へ
  } catch (error) {
    // calcBusinessDate 内部 HttpsError 等は fallback へ
  }

  if (typeof billBusinessDate === 'string' && billBusinessDate.length > 0) {
    return billBusinessDate;
  }

  throw new Error(
    'cashflowBusinessDate cannot be resolved (input not given, calcBusinessDate not OK, bill.businessDate empty)'
  );
}

/**
 * Step03 で先行実装した immediate 用の最小 builder。
 *
 * Step04 では `buildCashActionDoc` を内部委譲して後方互換を維持する。
 * 既存の Step03 テスト（cashActions.spec.ts）と
 * `repos/createPostSettlementAdjustment.ts` の immediate 経路から呼び出され続ける。
 */
export function buildImmediateCashActionDoc(input: {
  sequenceNo: number;
  cashActionType: CashActionType;
  amountIncl: number;
  executedAt: unknown;
  executedBy: string | null;
  cashflowBusinessDate: string;
  method: string;
  allocationAdjustmentId: string;
  note?: string;
}): CashActionDoc {
  const {
    sequenceNo,
    cashActionType,
    amountIncl,
    executedAt,
    executedBy,
    cashflowBusinessDate,
    method,
    allocationAdjustmentId,
    note,
  } = input;

  if (typeof method !== 'string' || method.length === 0) {
    throw new Error('cashAction method must be a non-empty string');
  }
  if (typeof allocationAdjustmentId !== 'string' || allocationAdjustmentId.length === 0) {
    throw new Error('cashAction allocationAdjustmentId must be a non-empty string');
  }

  return buildCashActionDoc({
    sequenceNo,
    cashActionType,
    amountIncl,
    executedAt,
    executedBy,
    cashflowBusinessDate,
    methodBreakdown: [{ method, amountIncl }],
    allocations: [{ adjustmentId: allocationAdjustmentId, amountIncl }],
    note,
  });
}
