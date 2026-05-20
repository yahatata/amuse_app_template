import type {
  Amounts,
  CategoryBreakdown,
  PaymentTotals,
  PaymentsSummary,
} from './snapshots';

export const INITIAL_SETTLEMENT_CYCLE = 1;
export const BASELINE_SNAPSHOT_DOC_ID = 'snapshot';

export interface BaselineSummary {
  amounts: Amounts;
  categoryBreakdown: CategoryBreakdown;
  paymentTotals: PaymentTotals;
  paymentsSummary: PaymentsSummary;
  contentHash: string;
}

export interface BaselineSnapshot {
  items: Array<{
    menuItemId: string | null;
    name: string;
    category: string | null;
    qty: number;
    unitPriceIncl: number;
    salesIncl: number;
  }>;
  extras: Array<{
    extraType: string | null;
    name: string;
    qty: number;
    unitPriceIncl: number;
    salesIncl: number;
  }>;
  tournaments: Array<{
    templateId: string | null;
    templateName: string;
    entryCount: number;
    entrySalesIncl: number;
    reentryCount: number;
    reentrySalesIncl: number;
    addonCount: number;
    addonSalesIncl: number;
    totalTournamentSalesIncl: number;
    pointsAwardedTotal: number;
    prizeAmountTotalIncl: number;
  }>;
  sideGameChips: Array<{
    chipActionType: string | null;
    qty: number;
    amountIncl: number;
  }>;
  amounts: Amounts;
  categoryBreakdown: CategoryBreakdown;
  paymentTotals: PaymentTotals;
  paymentsSummary: PaymentsSummary;
  contentHash: string;
}

export function buildInitialCycleDoc(params?: {
  cycleNo?: number;
  openedAt?: unknown;
  openedBy?: string | null;
  openedReason?: 'initial' | 'reopen';
  openedFromCycleNo?: number | null;
}) {
  return {
    cycleNo: params?.cycleNo ?? INITIAL_SETTLEMENT_CYCLE,
    cycleState: 'open' as const,
    openedAt: params?.openedAt ?? null,
    openedBy: params?.openedBy ?? null,
    openedReason: params?.openedReason ?? 'initial',
    openedFromCycleNo: params?.openedFromCycleNo ?? null,
    settledAt: null,
    settledBy: null,
    closedAt: null,
    closedReason: null,
    nextSequenceNo: 1,
    baselineSummary: null,
  };
}

export function buildBaselineSummary(params: BaselineSummary): BaselineSummary {
  return {
    amounts: params.amounts,
    categoryBreakdown: params.categoryBreakdown,
    paymentTotals: params.paymentTotals,
    paymentsSummary: params.paymentsSummary,
    contentHash: params.contentHash,
  };
}

export function buildSettledCycleDocPatch(params: {
  settledAt: unknown;
  settledBy?: string | null;
  baselineSummary: BaselineSummary;
}) {
  return {
    cycleState: 'settled' as const,
    settledAt: params.settledAt,
    settledBy: params.settledBy ?? null,
    closedAt: params.settledAt,
    closedReason: 'settle' as const,
    baselineSummary: params.baselineSummary,
  };
}

/**
 * Step05 仕様書 §7.1 に基づく old cycle 用 patch。
 * reopen 時に既存 settled cycle を `reopened` 状態に切り替える。
 *
 * - `cycleState`: `settled` → `reopened`
 * - `closedAt`: reopen 実行時刻
 * - `closedReason`: `'reopen'`
 *
 * 触らない field:
 * - `settledAt` / `settledBy`: 既存 settle 時の値を維持（履歴）
 * - `baselineSummary`: immutable history として維持
 * - `openedAt` / `openedBy` / `openedReason` / `openedFromCycleNo`: 維持
 */
export function buildReopenedCycleDocPatch(params: {
  closedAt: unknown;
}) {
  return {
    cycleState: 'reopened' as const,
    closedAt: params.closedAt,
    closedReason: 'reopen' as const,
  };
}

export function buildBaselineSnapshot(params: BaselineSnapshot): BaselineSnapshot {
  return {
    items: params.items,
    extras: params.extras,
    tournaments: params.tournaments,
    sideGameChips: params.sideGameChips,
    amounts: params.amounts,
    categoryBreakdown: params.categoryBreakdown,
    paymentTotals: params.paymentTotals,
    paymentsSummary: params.paymentsSummary,
    contentHash: params.contentHash,
  };
}
