/**
 * 03_adjustments管理 仕様書に基づく adjustments 純粋関数群。
 *
 * Firestore に直接書き込まないこと。Step03 changeSpec §3.2 の方針どおり、
 * 入力検証 / doc 組み立て / opposite-direction offset / parent 反映材料の集計を
 * 純粋関数として提供し、repo 側の transaction が write を担う。
 *
 * 関連:
 * - docs/事後イベント（会計後調整系）本番化/仕様実装管理/04_仕様書/03_adjustments管理.md
 * - docs/事後イベント（会計後調整系）本番化/仕様実装管理/03.1_前提再設計/step3.11_未決論点の再決定/18_売上差分明細の粒度と配賦ルール.md
 */

export type AdjustmentType =
  | 'decrease_refund_pending'
  | 'decrease_refunded'
  | 'increase_collection_pending'
  | 'increase_collected';

export type AdjustmentDirection = 'decrease' | 'increase';

export type CashActionTypeAtCreation = 'none' | 'refund' | 'collection';

export type AdjustmentState =
  | 'effective'
  | 'completed_by_cash_action'
  | 'completed_by_offset'
  | 'cancelled_by_reopen';

export type LineTargetCategory = 'item' | 'extra' | 'tournament' | 'sideGameChip';

export type LineOperationType =
  | 'sale'
  | 'extra'
  | 'chip'
  | 'entry'
  | 'reentry'
  | 'addon';

export interface AdjustmentLineInput {
  lineNo: number;
  targetCategory: LineTargetCategory;
  targetId: string | null;
  targetName: string;
  operationType: LineOperationType;
  qtyDelta: number;
  amountInclDelta: number;
  note?: string;
}

export interface AdjustmentLine {
  lineNo: number;
  targetCategory: LineTargetCategory;
  targetId: string | null;
  targetName: string;
  operationType: LineOperationType;
  qtyDelta: number;
  amountInclDelta: number;
  note: string;
}

export interface AdjustmentDoc {
  sequenceNo: number;
  adjustmentType: AdjustmentType;
  adjustmentDirection: AdjustmentDirection;
  adjustmentAmountIncl: number;
  cashActionTypeAtCreation: CashActionTypeAtCreation;
  cashActionHandledAtCreation: boolean;
  adjustmentState: AdjustmentState;
  requiredActionRemainingIncl: number;
  createdAt: unknown;
  createdBy: string | null;
  note: string;
  lines: AdjustmentLine[];
  supersededByAdjustmentId: string | null;
}

export interface ExistingAdjustmentForOffset {
  adjustmentId: string;
  sequenceNo: number;
  adjustmentDirection: AdjustmentDirection;
  adjustmentState: AdjustmentState;
  requiredActionRemainingIncl: number;
}

export interface OffsetPatch {
  /** 0 になった adjustment は state を completed_by_offset に */
  adjustmentState?: 'completed_by_offset';
  /** 相殺後の remaining */
  requiredActionRemainingIncl: number;
}

export interface ApplyOffsetResult {
  /** 既存 adjustment の patch（更新が必要な分のみ） */
  patches: Map<string, OffsetPatch>;
  /** 新規 adjustment 側の最終 remaining */
  newAdjustmentRemaining: number;
  /** 新規 adjustment 側の最終 state */
  newAdjustmentState: AdjustmentState;
}

const ALL_ADJUSTMENT_TYPES = new Set<AdjustmentType>([
  'decrease_refund_pending',
  'decrease_refunded',
  'increase_collection_pending',
  'increase_collected',
]);

const ALL_TARGET_CATEGORIES = new Set<LineTargetCategory>([
  'item',
  'extra',
  'tournament',
  'sideGameChip',
]);

interface AdjustmentTypeProfile {
  direction: AdjustmentDirection;
  cashActionType: CashActionTypeAtCreation;
  handledAtCreation: boolean;
}

const TYPE_PROFILE: Record<AdjustmentType, AdjustmentTypeProfile> = {
  decrease_refund_pending: {
    direction: 'decrease',
    cashActionType: 'refund',
    handledAtCreation: false,
  },
  decrease_refunded: {
    direction: 'decrease',
    cashActionType: 'refund',
    handledAtCreation: true,
  },
  increase_collection_pending: {
    direction: 'increase',
    cashActionType: 'collection',
    handledAtCreation: false,
  },
  increase_collected: {
    direction: 'increase',
    cashActionType: 'collection',
    handledAtCreation: true,
  },
};

/** category 単位で許可される operationType の集合 */
const CATEGORY_OPERATION_TYPES: Record<LineTargetCategory, Set<LineOperationType>> = {
  item: new Set<LineOperationType>(['sale']),
  extra: new Set<LineOperationType>(['extra']),
  sideGameChip: new Set<LineOperationType>(['chip']),
  tournament: new Set<LineOperationType>(['entry', 'reentry', 'addon']),
};

/**
 * 仕様書 §8 / §9 / §10 の整合と amountIncl > 0 を検証する。
 */
export function validateAdjustmentInput(input: {
  adjustmentType: AdjustmentType;
  adjustmentAmountIncl: number;
}): void {
  const { adjustmentType, adjustmentAmountIncl } = input;
  if (!ALL_ADJUSTMENT_TYPES.has(adjustmentType)) {
    throw new Error(`adjustmentType is not in current-scope set: ${adjustmentType as string}`);
  }
  if (typeof adjustmentAmountIncl !== 'number' || !Number.isFinite(adjustmentAmountIncl)) {
    throw new Error(`adjustmentAmountIncl must be a finite number, got: ${String(adjustmentAmountIncl)}`);
  }
  if (adjustmentAmountIncl <= 0) {
    throw new Error(`adjustmentAmountIncl must be > 0, got: ${adjustmentAmountIncl}`);
  }
}

/**
 * 仕様書 §13 / 18_売上差分明細の粒度と配賦ルール に基づく lines 検証。
 *
 * - lines.length >= 1
 * - 各 line の targetCategory / operationType の組み合わせ妥当性
 * - tournament line の targetId 必須
 * - 全 line の targetName 非空
 * - amountInclDelta の符号が direction と一致
 * - qtyDelta の符号が direction と一致（または 0 を許容するかは current-scope では line ごとに判定する。
 *   amountInclDelta が non-zero である line に対して qtyDelta の符号も同じであることを要求する）
 * - sum(amountInclDelta) = ±adjustmentAmountIncl（direction による）
 */
export function validateLines(input: {
  lines: AdjustmentLineInput[];
  direction: AdjustmentDirection;
  adjustmentAmountIncl: number;
}): void {
  const { lines, direction, adjustmentAmountIncl } = input;

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('lines must contain at least 1 entry (line-less adjustment is forbidden)');
  }

  const expectedSign = direction === 'decrease' ? -1 : 1;
  let sum = 0;

  for (const line of lines) {
    if (!ALL_TARGET_CATEGORIES.has(line.targetCategory)) {
      throw new Error(`line.targetCategory is not in current-scope set: ${line.targetCategory as string}`);
    }

    const allowedOps = CATEGORY_OPERATION_TYPES[line.targetCategory];
    if (!allowedOps.has(line.operationType)) {
      throw new Error(
        `line.operationType '${line.operationType}' is not allowed for targetCategory '${line.targetCategory}'`
      );
    }

    if (line.targetCategory === 'tournament') {
      if (!line.targetId || typeof line.targetId !== 'string' || line.targetId.length === 0) {
        throw new Error('tournament line requires targetId (templateId / templateKey)');
      }
    }

    if (typeof line.targetName !== 'string' || line.targetName.length === 0) {
      throw new Error('line.targetName must be a non-empty string');
    }

    if (
      typeof line.amountInclDelta !== 'number' ||
      !Number.isFinite(line.amountInclDelta)
    ) {
      throw new Error('line.amountInclDelta must be a finite number');
    }

    if (typeof line.qtyDelta !== 'number' || !Number.isFinite(line.qtyDelta)) {
      throw new Error('line.qtyDelta must be a finite number');
    }

    if (line.amountInclDelta !== 0 && Math.sign(line.amountInclDelta) !== expectedSign) {
      throw new Error(
        `line.amountInclDelta sign must match adjustmentDirection (${direction}); got ${line.amountInclDelta}`
      );
    }

    if (line.qtyDelta !== 0 && Math.sign(line.qtyDelta) !== expectedSign) {
      throw new Error(
        `line.qtyDelta sign must match adjustmentDirection (${direction}); got ${line.qtyDelta}`
      );
    }

    sum += line.amountInclDelta;
  }

  const expectedSum = expectedSign * adjustmentAmountIncl;
  if (sum !== expectedSum) {
    throw new Error(
      `sum(lines[].amountInclDelta) must equal ${expectedSum} (direction=${direction}, adjustmentAmountIncl=${adjustmentAmountIncl}), got ${sum}`
    );
  }
}

/**
 * 仕様書 §7 の必須 field を満たす adjustment doc を組み立てる。
 *
 * 戻り値の `requiredActionRemainingIncl` は **immediate cash 適用前** の暫定値である。
 * immediate パターンで cashAction を適用後、remaining は 0 になり、state は
 * `completed_by_cash_action` に上書きされる。これは repo 側で行う。
 */
export function buildAdjustmentDoc(input: {
  sequenceNo: number;
  adjustmentType: AdjustmentType;
  adjustmentAmountIncl: number;
  createdAt: unknown;
  createdBy: string | null;
  note?: string;
  lines: AdjustmentLineInput[];
}): AdjustmentDoc {
  validateAdjustmentInput({
    adjustmentType: input.adjustmentType,
    adjustmentAmountIncl: input.adjustmentAmountIncl,
  });
  const profile = TYPE_PROFILE[input.adjustmentType];
  validateLines({
    lines: input.lines,
    direction: profile.direction,
    adjustmentAmountIncl: input.adjustmentAmountIncl,
  });

  const normalizedLines: AdjustmentLine[] = input.lines.map((line, index) => ({
    lineNo: typeof line.lineNo === 'number' && line.lineNo > 0 ? line.lineNo : index + 1,
    targetCategory: line.targetCategory,
    targetId: line.targetId ?? null,
    targetName: line.targetName,
    operationType: line.operationType,
    qtyDelta: line.qtyDelta,
    amountInclDelta: line.amountInclDelta,
    note: typeof line.note === 'string' ? line.note : '',
  }));

  return {
    sequenceNo: input.sequenceNo,
    adjustmentType: input.adjustmentType,
    adjustmentDirection: profile.direction,
    adjustmentAmountIncl: input.adjustmentAmountIncl,
    cashActionTypeAtCreation: profile.cashActionType,
    cashActionHandledAtCreation: profile.handledAtCreation,
    adjustmentState: 'effective',
    requiredActionRemainingIncl: input.adjustmentAmountIncl,
    createdAt: input.createdAt,
    createdBy: input.createdBy ?? null,
    note: typeof input.note === 'string' ? input.note : '',
    lines: normalizedLines,
    supersededByAdjustmentId: null,
  };
}

/**
 * 仕様書 §11.2 / §15 の opposite-direction 内部相殺。
 *
 * - `existingAdjustments` のうち、`adjustmentState === 'effective'` かつ
 *   `requiredActionRemainingIncl > 0` のものだけを対象にする
 * - direction が新規 adjustment と逆方向のものを `sequenceNo` 昇順で順番に消化
 * - 0 になった既存 adjustment は `completed_by_offset` へ
 * - 新規 adjustment 側の remaining も減らし、0 になれば `completed_by_offset` を返す
 *
 * 戻り値の `patches` は既存 adjustment に対する更新差分。新規 adjustment 自身の
 * remaining / state は別フィールドで返す。
 */
export function applyOppositeDirectionOffset(input: {
  existingAdjustments: ExistingAdjustmentForOffset[];
  newDirection: AdjustmentDirection;
  newRemaining: number;
}): ApplyOffsetResult {
  const { existingAdjustments, newDirection, newRemaining } = input;

  const patches = new Map<string, OffsetPatch>();
  let remaining = newRemaining;

  if (remaining <= 0) {
    return {
      patches,
      newAdjustmentRemaining: 0,
      newAdjustmentState: 'completed_by_offset',
    };
  }

  const oppositeDirection: AdjustmentDirection = newDirection === 'decrease' ? 'increase' : 'decrease';

  // 古い順（sequenceNo 昇順）から消化する
  const targets = existingAdjustments
    .filter(
      (existing) =>
        existing.adjustmentDirection === oppositeDirection &&
        existing.adjustmentState === 'effective' &&
        existing.requiredActionRemainingIncl > 0
    )
    .sort((a, b) => a.sequenceNo - b.sequenceNo);

  for (const existing of targets) {
    if (remaining <= 0) {
      break;
    }
    const consumed = Math.min(existing.requiredActionRemainingIncl, remaining);
    const newExistingRemaining = existing.requiredActionRemainingIncl - consumed;
    remaining -= consumed;

    if (newExistingRemaining === 0) {
      patches.set(existing.adjustmentId, {
        adjustmentState: 'completed_by_offset',
        requiredActionRemainingIncl: 0,
      });
    } else {
      patches.set(existing.adjustmentId, {
        requiredActionRemainingIncl: newExistingRemaining,
      });
    }
  }

  const newAdjustmentRemaining = remaining;
  const newAdjustmentState: AdjustmentState =
    newAdjustmentRemaining === 0 ? 'completed_by_offset' : 'effective';

  return {
    patches,
    newAdjustmentRemaining,
    newAdjustmentState,
  };
}

export interface RemainingByDirection {
  refundRemainingTotal: number;
  collectionRemainingTotal: number;
}

/**
 * 仕様書 §16.2 / §16.3 で要求される、direction ごとの remaining 合計を集計する。
 *
 * 入力の `adjustments` には、すでに今回の更新（patches / 新規 adjustment）を反映済みの
 * 状態を渡すことを想定する。
 *
 * adjustment.cashActionTypeAtCreation で direction と紐づける:
 * - decrease 系 (refund) なら refundRemainingTotal に積む
 * - increase 系 (collection) なら collectionRemainingTotal に積む
 *
 * `effective` 以外の state は集計しない。
 */
export function summarizeRemainingByDirection(
  adjustments: ReadonlyArray<{
    adjustmentDirection: AdjustmentDirection;
    adjustmentState: AdjustmentState;
    requiredActionRemainingIncl: number;
  }>
): RemainingByDirection {
  let refundRemainingTotal = 0;
  let collectionRemainingTotal = 0;

  for (const adj of adjustments) {
    if (adj.adjustmentState !== 'effective') {
      continue;
    }
    if (adj.requiredActionRemainingIncl <= 0) {
      continue;
    }
    if (adj.adjustmentDirection === 'decrease') {
      refundRemainingTotal += adj.requiredActionRemainingIncl;
    } else {
      collectionRemainingTotal += adj.requiredActionRemainingIncl;
    }
  }

  return { refundRemainingTotal, collectionRemainingTotal };
}

/**
 * 仕様書 §16.3 の不変則検証。
 * 両 direction で remaining > 0 が同時成立する状態は許可しない。
 */
export function assertSingleSidedRemaining(remaining: RemainingByDirection): void {
  if (remaining.refundRemainingTotal > 0 && remaining.collectionRemainingTotal > 0) {
    throw new Error(
      `invariant violation: both refund (${remaining.refundRemainingTotal}) and collection (${remaining.collectionRemainingTotal}) remaining are > 0`
    );
  }
}

/**
 * adjustmentDirection に対応する符号（decrease=-1, increase=+1）。
 * parent 反映で `claimTotalIncl += signed` のような計算に使う。
 */
export function signedAmountFromDirection(
  direction: AdjustmentDirection,
  amountIncl: number
): number {
  return direction === 'decrease' ? -amountIncl : amountIncl;
}

/**
 * Step05 仕様書 §7.2 に基づく `cancelled_by_reopen` patch。
 *
 * reopen 時に旧 cycle 配下の effective adjustment を一括で
 * `cancelled_by_reopen` に遷移させるための patch を生成する。
 *
 * 不変則:
 * - `requiredActionRemainingIncl` / `adjustmentAmountIncl` / `lines[]` 等は touch しない（履歴として残す）
 * - 既に `effective` 以外の state にある adjustment にはこの patch を適用しない（呼び出し側でフィルタする）
 */
export function buildAdjustmentCancelledByReopenPatch(params: {
  cancelledAt: unknown;
  cancelledBy: string | null;
}) {
  return {
    adjustmentState: 'cancelled_by_reopen' as const,
    cancelledAt: params.cancelledAt,
    cancelledBy: params.cancelledBy ?? null,
    cancelReason: 'reopen' as const,
  };
}
