/**
 * Delta 計算ロジック
 * 
 * Settlement/Event から analyticsMonthly への差分を計算する。
 */

import { BillDoc, EventDoc, MonthlyDailyDelta } from './types';

/**
 * Settlement 用 delta を構築
 */
export function buildSettlementDelta(bill: BillDoc): MonthlyDailyDelta {
  const amounts = bill.amounts || { grandTotalRounded: 0 };
  const category = bill.categoryBreakdown || {
    items: 0,
    extraCost: 0,
    sideGameChips: 0,
    tournaments: 0,
  };
  const paymentTotals = bill.paymentTotals || {};

  return {
    sales: {
      grossSales: amounts.grandTotalRounded,
      category: {
        items: category.items,
        extraCost: category.extraCost,
        sideGameChip: category.sideGameChips,
        tournaments: category.tournaments,
      },
    },
    events: {
      totalRefundedIncl: 0,
      totalAdjustmentsIncl: 0,
      unattributedRefundsIncl: 0,
      unattributedAdjustmentsIncl: 0,
    },
    cashflow: {
      paymentTotals: paymentTotals,
      refundsByMethod: {},
    },
    net: {
      netSalesIncl: amounts.grandTotalRounded,
    },
  };
}

/**
 * Event 用 delta を構築
 */
export function buildEventDelta(
  bill: BillDoc,
  event: EventDoc,
  allowAttribution: boolean
): MonthlyDailyDelta {
  const delta: MonthlyDailyDelta = {
    sales: {
      grossSales: 0,
      category: {
        items: 0,
        extraCost: 0,
        sideGameChip: 0,
        tournaments: 0,
      },
    },
    events: {
      totalRefundedIncl: 0,
      totalAdjustmentsIncl: 0,
      unattributedRefundsIncl: 0,
      unattributedAdjustmentsIncl: 0,
    },
    cashflow: {
      paymentTotals: {},
      refundsByMethod: {},
    },
    net: {
      netSalesIncl: 0,
    },
  };

  if (event.type === 'refund' && event.refund) {
    const amount = event.refund.amountIncl;
    const method = event.refund.method || 'cash';
    delta.events.totalRefundedIncl = amount;
    if (!allowAttribution || !event.attribution) {
      delta.events.unattributedRefundsIncl = amount;
    }
    delta.cashflow.refundsByMethod[method] = amount;
    delta.net.netSalesIncl = -amount;
  } else if (event.type === 'adjustment' && event.adjustment) {
    const sign = event.adjustment.sign;
    const amount = event.adjustment.amountIncl;
    delta.events.totalAdjustmentsIncl = sign * amount;
    if (!allowAttribution || !event.attribution) {
      delta.events.unattributedAdjustmentsIncl = sign * amount;
    }
    delta.net.netSalesIncl = sign * amount;
  }
  // cancel / reopen は analytics 差分なし

  return delta;
}
