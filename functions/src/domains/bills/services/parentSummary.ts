import type { Amounts, CategoryBreakdown, PaymentTotals, PaymentsSummary } from './snapshots';

export type RequiredActionType = 'none' | 'collection' | 'refund';
export type LastRecordType = 'none' | 'adjustment' | 'cash_action' | 'reopen';

export function buildInitialOps() {
  return {
    accountingStartedAt: null,
    accountingStartedBy: null,
    accountingCompletedAt: null,
    accountingCompletedBy: null,
    accountingCanceledAt: null,
    accountingCanceledBy: null,
  };
}

export function buildDraftAccountingInput(options?: {
  paymentMethodsByCategory?: Record<string, unknown> | null;
  paymentMethodsByAmount?: Record<string, number> | null;
}) {
  return {
    paymentMethodsByCategory: options?.paymentMethodsByCategory ?? null,
    paymentMethodsByAmount: options?.paymentMethodsByAmount ?? null,
  };
}

export function buildInitialSettlementSnapshot() {
  return {
    amounts: null,
    categoryBreakdown: null,
    paymentTotals: null,
    paymentsSummary: null,
    closedAt: null,
    contentHash: null,
  };
}

export function buildSettlementSnapshot(params: {
  amounts: Amounts;
  categoryBreakdown: CategoryBreakdown;
  paymentTotals: PaymentTotals;
  paymentsSummary: PaymentsSummary;
  closedAt: unknown;
  contentHash: string;
}) {
  const { amounts, categoryBreakdown, paymentTotals, paymentsSummary, closedAt, contentHash } = params;
  return {
    amounts,
    categoryBreakdown,
    paymentTotals,
    paymentsSummary,
    closedAt,
    contentHash,
  };
}

export function buildInitialCurrentSummary() {
  return {
    claimTotalIncl: 0,
    receivedTotalIncl: 0,
    refundedTotalIncl: 0,
    netSalesIncl: 0,
  };
}

export function buildCurrentSummaryFromSettlement(params: {
  claimTotalIncl: number;
  receivedTotalIncl: number;
  refundedTotalIncl?: number;
  netSalesIncl: number;
}) {
  return {
    claimTotalIncl: params.claimTotalIncl,
    receivedTotalIncl: params.receivedTotalIncl,
    refundedTotalIncl: params.refundedTotalIncl ?? 0,
    netSalesIncl: params.netSalesIncl,
  };
}

export function buildInitialPostSettlementState() {
  return {
    hasPostSettlementActivity: false,
    totalAdjustmentsIncl: 0,
    totalCollectedIncl: 0,
    totalRefundedIncl: 0,
    requiredActionType: 'none' as RequiredActionType,
    requiredActionIncl: 0,
    lastRecordType: 'none' as LastRecordType,
    lastRecordAt: null,
    lastRecordId: null,
  };
}

export function buildInitialReopenSummary() {
  return {
    hasReopenHistory: false,
    reopenCount: 0,
    currentSettlementCycle: 1,
    latestSettledCycle: 0,
    lastReopenedAt: null,
    lastReopenedBy: null,
    lastResettledAt: null,
  };
}

export function buildInitialCloseSummary() {
  return {
    unresolved: false,
    markedAt: null,
    closedBusinessDate: null,
    displayAmountAtMark: null,
    lastCloseRunId: null,
  };
}

export function deriveRequiredActionFromRemaining(params: {
  collectionRemainingTotal: number;
  refundRemainingTotal: number;
}) {
  const collectionRemainingTotal = Math.max(0, params.collectionRemainingTotal || 0);
  const refundRemainingTotal = Math.max(0, params.refundRemainingTotal || 0);

  if (refundRemainingTotal <= 0 && collectionRemainingTotal <= 0) {
    return {
      requiredActionType: 'none' as RequiredActionType,
      requiredActionIncl: 0,
    };
  }

  if (refundRemainingTotal > 0) {
    return {
      requiredActionType: 'refund' as RequiredActionType,
      requiredActionIncl: refundRemainingTotal,
    };
  }

  return {
    requiredActionType: 'collection' as RequiredActionType,
    requiredActionIncl: collectionRemainingTotal,
  };
}

/**
 * Step03 仕様書 §16.1 に基づく status 決定。
 * remaining が 1 円でも残れば post_settlement_pending、なければ settled。
 */
export function deriveStatusAfterAdjustment(params: {
  refundRemainingTotal: number;
  collectionRemainingTotal: number;
}): 'post_settlement_pending' | 'settled' {
  const totalRemaining =
    Math.max(0, params.refundRemainingTotal || 0) +
    Math.max(0, params.collectionRemainingTotal || 0);
  return totalRemaining > 0 ? 'post_settlement_pending' : 'settled';
}

interface PostSettlementStateLike {
  hasPostSettlementActivity: boolean;
  totalAdjustmentsIncl: number;
  totalCollectedIncl: number;
  totalRefundedIncl: number;
  requiredActionType: RequiredActionType;
  requiredActionIncl: number;
  lastRecordType: LastRecordType;
  lastRecordAt: unknown;
  lastRecordId: string | null;
}

/**
 * Step03 仕様書 §16.1 / §16.4 に基づく postSettlementState 派生。
 *
 * 入力:
 * - existingState: 直前の postSettlementState（settle 直後のゼロ初期化や既存 adjustment 累計）
 * - adjustmentSignedAmountIncl: 今回 adjustment の符号付き金額（decrease なら負）
 * - immediate cashAction:
 *   - immediate refund なら refundedTotal を増やす
 *   - immediate collection なら collectedTotal を増やす
 * - summarizedRemaining: 内部相殺後の direction 別 remaining 合計
 * - lastRecordId / lastRecordAt: 今回 adjustment doc の id / createdAt
 *
 * lastRecordType は仕様書 §16.1 どおり 'adjustment' で固定する。
 * （Step04 で later cashAction を実装する際は別途 'cash_action' で上書きする想定）
 */
export function buildPostSettlementStateAfterAdjustment(params: {
  existingState: PostSettlementStateLike;
  adjustmentSignedAmountIncl: number;
  immediateRefundAmountIncl?: number;
  immediateCollectionAmountIncl?: number;
  summarizedRemaining: {
    refundRemainingTotal: number;
    collectionRemainingTotal: number;
  };
  lastRecordAt: unknown;
  lastRecordId: string;
}): PostSettlementStateLike {
  const existing = params.existingState;
  const required = deriveRequiredActionFromRemaining({
    collectionRemainingTotal: params.summarizedRemaining.collectionRemainingTotal,
    refundRemainingTotal: params.summarizedRemaining.refundRemainingTotal,
  });

  return {
    hasPostSettlementActivity: true,
    totalAdjustmentsIncl: (existing.totalAdjustmentsIncl ?? 0) + params.adjustmentSignedAmountIncl,
    totalCollectedIncl: (existing.totalCollectedIncl ?? 0) + (params.immediateCollectionAmountIncl ?? 0),
    totalRefundedIncl: (existing.totalRefundedIncl ?? 0) + (params.immediateRefundAmountIncl ?? 0),
    requiredActionType: required.requiredActionType,
    requiredActionIncl: required.requiredActionIncl,
    lastRecordType: 'adjustment',
    lastRecordAt: params.lastRecordAt,
    lastRecordId: params.lastRecordId,
  };
}

interface CurrentSummaryLike {
  claimTotalIncl: number;
  receivedTotalIncl: number;
  refundedTotalIncl: number;
  netSalesIncl: number;
}

/**
 * Step03 仕様書 §16.1 に基づく currentSummary 派生。
 *
 * - claimTotalIncl / netSalesIncl は adjustment の符号付き金額分だけ増減
 * - immediate refund パターンでは refundedTotalIncl を増やす
 * - immediate collection パターンでは receivedTotalIncl を増やす
 *
 * 仕様書 04 §12 の cashAction 由来項目（refundedTotalIncl / receivedTotalIncl）は
 * Step04 で本実装するが、Step03 の immediate パターンでは同一トランザクションで
 * cashAction を作るため、ここで併せて反映する。
 */
export function buildCurrentSummaryAfterAdjustment(params: {
  existingSummary: CurrentSummaryLike;
  adjustmentSignedAmountIncl: number;
  immediateRefundAmountIncl?: number;
  immediateCollectionAmountIncl?: number;
}): CurrentSummaryLike {
  const existing = params.existingSummary;
  return {
    claimTotalIncl: (existing.claimTotalIncl ?? 0) + params.adjustmentSignedAmountIncl,
    receivedTotalIncl: (existing.receivedTotalIncl ?? 0) + (params.immediateCollectionAmountIncl ?? 0),
    refundedTotalIncl: (existing.refundedTotalIncl ?? 0) + (params.immediateRefundAmountIncl ?? 0),
    netSalesIncl: (existing.netSalesIncl ?? 0) + params.adjustmentSignedAmountIncl,
  };
}

/**
 * Step04 仕様書 04_cashActions管理.md §12 に基づく status 決定。
 * adjustment 派生と同じロジックだが、責務分離のため別関数を用意する。
 */
export function deriveStatusAfterCashAction(params: {
  refundRemainingTotal: number;
  collectionRemainingTotal: number;
}): 'post_settlement_pending' | 'settled' {
  const totalRemaining =
    Math.max(0, params.refundRemainingTotal || 0) +
    Math.max(0, params.collectionRemainingTotal || 0);
  return totalRemaining > 0 ? 'post_settlement_pending' : 'settled';
}

/**
 * Step04 仕様書 04 §12.1 / §12.2 / §12.3 に基づく postSettlementState 派生。
 *
 * 入力:
 * - existingState: 直前の postSettlementState
 * - cashActionType: 'refund' | 'collection'
 * - cashActionAmountIncl: 今回 cashAction の amountIncl
 * - summarizedRemaining: cashAction 適用後の direction 別 remaining 合計
 * - lastRecordAt: 今回 cashAction の executedAt
 * - lastRecordId: 今回 cashAction の id
 *
 * lastRecordType は仕様書 §12.3 どおり 'cash_action' 固定。
 * - refund なら totalRefundedIncl += amountIncl
 * - collection なら totalCollectedIncl += amountIncl
 * - totalAdjustmentsIncl は触らない（cashAction は売上を変えないため）
 */
export function buildPostSettlementStateAfterCashAction(params: {
  existingState: PostSettlementStateLike;
  cashActionType: 'refund' | 'collection';
  cashActionAmountIncl: number;
  summarizedRemaining: {
    refundRemainingTotal: number;
    collectionRemainingTotal: number;
  };
  lastRecordAt: unknown;
  lastRecordId: string;
}): PostSettlementStateLike {
  const existing = params.existingState;
  const required = deriveRequiredActionFromRemaining({
    collectionRemainingTotal: params.summarizedRemaining.collectionRemainingTotal,
    refundRemainingTotal: params.summarizedRemaining.refundRemainingTotal,
  });

  const isRefund = params.cashActionType === 'refund';
  const isCollection = params.cashActionType === 'collection';

  return {
    hasPostSettlementActivity: true,
    totalAdjustmentsIncl: existing.totalAdjustmentsIncl ?? 0,
    totalCollectedIncl:
      (existing.totalCollectedIncl ?? 0) + (isCollection ? params.cashActionAmountIncl : 0),
    totalRefundedIncl:
      (existing.totalRefundedIncl ?? 0) + (isRefund ? params.cashActionAmountIncl : 0),
    requiredActionType: required.requiredActionType,
    requiredActionIncl: required.requiredActionIncl,
    lastRecordType: 'cash_action',
    lastRecordAt: params.lastRecordAt,
    lastRecordId: params.lastRecordId,
  };
}

/**
 * Step04 仕様書 04 §12.1 / §12.2 に基づく currentSummary 派生。
 *
 * - refund cashAction なら refundedTotalIncl += amountIncl
 * - collection cashAction なら receivedTotalIncl += amountIncl
 * - claimTotalIncl / netSalesIncl は不変（cashAction は売上を変えない）
 */
export function buildCurrentSummaryAfterCashAction(params: {
  existingSummary: CurrentSummaryLike;
  cashActionType: 'refund' | 'collection';
  cashActionAmountIncl: number;
}): CurrentSummaryLike {
  const existing = params.existingSummary;
  const isRefund = params.cashActionType === 'refund';
  const isCollection = params.cashActionType === 'collection';
  return {
    claimTotalIncl: existing.claimTotalIncl ?? 0,
    receivedTotalIncl:
      (existing.receivedTotalIncl ?? 0) + (isCollection ? params.cashActionAmountIncl : 0),
    refundedTotalIncl:
      (existing.refundedTotalIncl ?? 0) + (isRefund ? params.cashActionAmountIncl : 0),
    netSalesIncl: existing.netSalesIncl ?? 0,
  };
}

interface ReopenSummaryLike {
  hasReopenHistory: boolean;
  reopenCount: number;
  currentSettlementCycle: number;
  latestSettledCycle: number;
  lastReopenedAt: unknown;
  lastReopenedBy: unknown;
  lastResettledAt: unknown;
}

/**
 * Step05 仕様書 §7.3 に基づく `reopenSummary` 派生。
 *
 * reopen 実行時に親 doc の `reopenSummary` をどう更新するかを表す。
 *
 * - `hasReopenHistory` → true 固定
 * - `reopenCount` → existing + 1
 * - `currentSettlementCycle` → oldCycleNo + 1
 * - `latestSettledCycle` → 据え置き（仕様書 §7.4）
 * - `lastReopenedAt` / `lastReopenedBy` → 今回値
 * - `lastResettledAt` → 据え置き（resettle 完了時に `billsOnSettle` で更新される）
 */
export function buildReopenSummaryAfterReopen(params: {
  existing: ReopenSummaryLike;
  oldCycleNo: number;
  reopenedAt: unknown;
  reopenedBy: string | null;
}): ReopenSummaryLike {
  const e = params.existing;
  return {
    hasReopenHistory: true,
    reopenCount: (e.reopenCount ?? 0) + 1,
    currentSettlementCycle: params.oldCycleNo + 1,
    latestSettledCycle: e.latestSettledCycle ?? 0,
    lastReopenedAt: params.reopenedAt,
    lastReopenedBy: params.reopenedBy,
    lastResettledAt: e.lastResettledAt ?? null,
  };
}

/**
 * Step05 仕様書 §7.3 全体に基づく親 doc patch。
 *
 * dot-path patch の形で返却し、Firestore の `tx.update(billRef, patch)` にそのまま渡せる。
 *
 * 含む field:
 * - `status = 'open'`
 * - `currentSummary` を `buildInitialCurrentSummary()` で reset
 * - `postSettlementState` を `buildInitialPostSettlementState()` で reset
 * - `ops` を `buildInitialOps()` で reset
 * - `draftAccountingInput` を `buildDraftAccountingInput()` で reset
 * - `meta.contentHash = null`
 * - `reopenSummary` を `buildReopenSummaryAfterReopen` で更新
 *
 * 触らない field（呼び出し側で patch に追加しないよう注意）:
 * - `requireSpecialAttention`
 * - `closeSummary`
 * - `amounts` / `categoryBreakdown` / `itemsSnapshot` / `tournamentsSnapshot` / `paymentTotals` / `paymentsSummary`
 * - `settlementSnapshot`（settle 時の履歴として残す）
 * - `updatedAt`（呼び出し側で `serverTimestamp()` 等を別途付与）
 */
export function buildParentDocPatchForReopen(params: {
  existingReopenSummary: ReopenSummaryLike;
  oldCycleNo: number;
  reopenedAt: unknown;
  reopenedBy: string | null;
}): Record<string, unknown> {
  const reopenSummary = buildReopenSummaryAfterReopen({
    existing: params.existingReopenSummary,
    oldCycleNo: params.oldCycleNo,
    reopenedAt: params.reopenedAt,
    reopenedBy: params.reopenedBy,
  });

  return {
    status: 'open',
    currentSummary: buildInitialCurrentSummary(),
    postSettlementState: buildInitialPostSettlementState(),
    ops: buildInitialOps(),
    draftAccountingInput: buildDraftAccountingInput(),
    'meta.contentHash': null,
    reopenSummary,
  };
}
