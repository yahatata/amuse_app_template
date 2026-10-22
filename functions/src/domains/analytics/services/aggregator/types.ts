/**
 * Analytics Aggregator 型定義
 * 
 * 注意: net.balanceDueIncl は nightly 再計算の結果が"正"。逐次更新しない。
 */

export interface BillDoc {
  billId: string;
  businessDate: string;
  status: string;
  /** Step07 changeSpec §4.2 / §5.3.5: settle marker docId 構成に使う cycle 番号 */
  cycleNo?: number;
  amounts?: {
    grandTotalRounded: number;
  };
  categoryBreakdown?: {
    items: number;
    extraCost: number;
    sideGameChips: number;
    tournaments: number;
  };
  paymentTotals?: Record<string, number>;
}

export interface EventDoc {
  eventId: string;
  type: 'refund' | 'adjustment' | 'cancel' | 'reopen';
  originBusinessDate: string;
  eventBusinessDate: string;
  refund?: {
    amountIncl: number;
    method?: string;
  };
  adjustment?: {
    sign: 1 | -1;
    amountIncl: number;
    method?: string;
  };
  attribution?: string; // optional, ALLOW_EVENT_ATTRIBUTION 有効時のみ
}

export interface MonthlyDailyDelta {
  sales: {
    grossSales: number;
    category: {
      items: number;
      extraCost: number;
      sideGameChip: number;
      tournaments: number;
    };
  };
  events: {
    totalRefundedIncl: number;
    totalAdjustmentsIncl: number;
    unattributedRefundsIncl: number;
    unattributedAdjustmentsIncl: number;
  };
  cashflow: {
    paymentTotals: Record<string, number>;
    refundsByMethod: Record<string, number>;
  };
  net: {
    netSalesIncl: number;
    // balanceDueIncl は nightly 再計算で上書きするため、delta には含めない
  };
}

export interface WriteContext {
  monthKey: string;
  businessDate: string;
  billId?: string;
  eventId?: string;
}
