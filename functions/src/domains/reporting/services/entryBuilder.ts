/**
 * ReportingEntry を組み立てる純粋関数群（Firestore アクセスなし）
 */

import { Timestamp } from 'firebase-admin/firestore';

import type {
  ReportingEntry,
  TaxReportingBehaviorDateRule,
} from '../types';

function sumCategoryBreakdown(cb: Record<string, { amountIncl: number }>): number {
  return Object.values(cb).reduce((sum, cat) => sum + cat.amountIncl, 0);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function deriveMonthKey(ts: Timestamp): string {
  const d = ts.toDate();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}${mm}`;
}

function deriveMonthKeyFromBusinessDate(businessDate: string): string {
  return businessDate.substring(0, 4) + businessDate.substring(5, 7);
}

const TARGET_CATEGORY_TO_REPORTING_KEY: Record<string, string> = {
  item: 'items',
  extra: 'extraCost',
  tournament: 'tournaments',
  sideGameChip: 'sideGameChip',
};

function mapTargetCategory(targetCategory: string): string {
  return TARGET_CATEGORY_TO_REPORTING_KEY[targetCategory] ?? targetCategory;
}

// ---------------------------------------------------------------------------
// paymentMethodsByCategory → categoryPaymentMatrix
// ---------------------------------------------------------------------------

interface PaymentSplit {
  method: string;
  amount: number;
}

type PaymentMethodsByCategoryValue = string | PaymentSplit[];

/**
 * bills の paymentMethodsByCategory を categoryPaymentMatrix に変換する。
 * 文字列フォーマット: `"items": "cash"` → カテゴリ全額がその支払方法
 * 配列フォーマット: `"items": [{ method: "cash", amount: 2000 }, ...]`
 */
export function buildCategoryPaymentMatrix(
  paymentMethodsByCategory: Record<string, PaymentMethodsByCategoryValue>,
  categoryBreakdown: Record<string, { amountIncl: number }>,
): Record<string, number> {
  const matrix: Record<string, number> = {};

  for (const [category, value] of Object.entries(paymentMethodsByCategory)) {
    if (typeof value === 'string') {
      const catAmount = categoryBreakdown[category]?.amountIncl ?? 0;
      if (catAmount !== 0) {
        const key = `${category}_${value}`;
        matrix[key] = (matrix[key] ?? 0) + catAmount;
      }
    } else if (Array.isArray(value)) {
      for (const split of value) {
        if (split.amount !== 0) {
          const key = `${category}_${split.method}`;
          matrix[key] = (matrix[key] ?? 0) + split.amount;
        }
      }
    }
  }

  return matrix;
}

// ---------------------------------------------------------------------------
// buildSettleEntry
// ---------------------------------------------------------------------------

export interface BuildSettleEntryParams {
  billId: string;
  cycleNo: number;
  settledAt: Timestamp;
  businessDate: string;
  categoryBreakdown: Record<string, { amountIncl: number }>;
  paymentTotals: Record<string, number>;
  paymentMethodsByCategory: Record<string, PaymentMethodsByCategoryValue>;
  dateRule: TaxReportingBehaviorDateRule;
  entryType: 'settle' | 'resettle';
}

export function buildSettleEntry(params: BuildSettleEntryParams): ReportingEntry {
  const {
    billId,
    cycleNo,
    settledAt,
    businessDate,
    categoryBreakdown,
    paymentTotals,
    paymentMethodsByCategory,
    dateRule,
    entryType,
  } = params;

  const rule = entryType === 'resettle' ? dateRule.resettle : dateRule.settle;
  const reportingMonth = rule === 'businessDate'
    ? deriveMonthKeyFromBusinessDate(businessDate)
    : deriveMonthKey(settledAt);

  const entryId = `${billId}_${entryType}_${cycleNo}`;

  const resolvedCategoryBreakdown = categoryBreakdown;
  const resolvedMatrix = buildCategoryPaymentMatrix(paymentMethodsByCategory, resolvedCategoryBreakdown);
  return {
    entryId,
    entryType,
    billId,
    cycleNo,
    reportingMonth,
    eventAt: settledAt,
    originBusinessDate: businessDate,
    linkedAdjustmentId: null,
    linkedCashActionId: null,
    categoryBreakdown: resolvedCategoryBreakdown,
    paymentBreakdown: { ...paymentTotals },
    categoryPaymentMatrix: resolvedMatrix,
    totalAmountIncl: sumCategoryBreakdown(resolvedCategoryBreakdown),
    createdAt: settledAt,
  };
}

// ---------------------------------------------------------------------------
// buildCashActionEntry
// ---------------------------------------------------------------------------

export interface AdjustmentLine {
  targetCategory: string;
  amountInclDelta: number;
}

export interface BuildCashActionEntryParams {
  billId: string;
  cycleNo: number;
  cashActionId: string;
  cashActionType: string;
  amountIncl: number;
  methodBreakdown: Record<string, number>;
  adjustmentLines: AdjustmentLine[];
  businessDate: string;
  cashActionExecutedAt: Timestamp;
  dateRule: TaxReportingBehaviorDateRule;
  linkedAdjustmentId: string | null;
  isImmediate: boolean;
}

export function buildCashActionEntry(params: BuildCashActionEntryParams): ReportingEntry {
  const {
    billId,
    cycleNo,
    cashActionId,
    adjustmentLines,
    methodBreakdown,
    businessDate,
    cashActionExecutedAt,
    dateRule,
    linkedAdjustmentId,
    isImmediate,
  } = params;

  const rule = isImmediate ? dateRule.immediateCashAction : dateRule.laterCashAction;
  let reportingMonth: string;
  if (rule === 'cashActionDate') {
    reportingMonth = deriveMonthKey(cashActionExecutedAt);
  } else if (rule === 'adjustmentDate') {
    reportingMonth = deriveMonthKey(cashActionExecutedAt);
  } else {
    reportingMonth = deriveMonthKeyFromBusinessDate(businessDate);
  }

  const categoryBreakdown: Record<string, { amountIncl: number }> = {};
  for (const line of adjustmentLines) {
    const key = mapTargetCategory(line.targetCategory);
    if (!categoryBreakdown[key]) {
      categoryBreakdown[key] = { amountIncl: 0 };
    }
    categoryBreakdown[key].amountIncl += line.amountInclDelta;
  }

  const totalAdjustment = Object.values(categoryBreakdown)
    .reduce((sum, cat) => sum + cat.amountIncl, 0);

  const categoryPaymentMatrix: Record<string, number> = {};
  if (totalAdjustment !== 0) {
    for (const [catKey, catVal] of Object.entries(categoryBreakdown)) {
      const proportion = catVal.amountIncl / totalAdjustment;
      for (const [method, amount] of Object.entries(methodBreakdown)) {
        const allocated = Math.round(amount * proportion);
        if (allocated !== 0) {
          const matrixKey = `${catKey}_${method}`;
          categoryPaymentMatrix[matrixKey] = (categoryPaymentMatrix[matrixKey] ?? 0) + allocated;
        }
      }
    }
  }

  return {
    entryId: `${billId}_cashAction_${cashActionId}`,
    entryType: 'cashAction',
    billId,
    cycleNo,
    reportingMonth,
    eventAt: cashActionExecutedAt,
    originBusinessDate: businessDate,
    linkedAdjustmentId,
    linkedCashActionId: cashActionId,
    categoryBreakdown,
    paymentBreakdown: { ...methodBreakdown },
    categoryPaymentMatrix,
    totalAmountIncl: sumCategoryBreakdown(categoryBreakdown),
    createdAt: cashActionExecutedAt,
  };
}

// ---------------------------------------------------------------------------
// buildReopenRollbackEntry
// ---------------------------------------------------------------------------

export interface BuildReopenRollbackEntryParams {
  billId: string;
  cycleNo: number;
  reopenExecutedAt: Timestamp;
  originalSettleEntry: ReportingEntry;
}

export function buildReopenRollbackEntry(params: BuildReopenRollbackEntryParams): ReportingEntry {
  const { billId, cycleNo, reopenExecutedAt, originalSettleEntry } = params;

  const negatedCategoryBreakdown: Record<string, { amountIncl: number }> = {};
  for (const [key, val] of Object.entries(originalSettleEntry.categoryBreakdown)) {
    negatedCategoryBreakdown[key] = { amountIncl: -val.amountIncl };
  }

  const negatedPaymentBreakdown: Record<string, number> = {};
  for (const [key, val] of Object.entries(originalSettleEntry.paymentBreakdown)) {
    negatedPaymentBreakdown[key] = -val;
  }

  const negatedMatrix: Record<string, number> = {};
  for (const [key, val] of Object.entries(originalSettleEntry.categoryPaymentMatrix)) {
    negatedMatrix[key] = -val;
  }

  return {
    entryId: `${billId}_reopen_${cycleNo}`,
    entryType: 'reopen_rollback',
    billId,
    cycleNo,
    reportingMonth: originalSettleEntry.reportingMonth,
    eventAt: reopenExecutedAt,
    originBusinessDate: originalSettleEntry.originBusinessDate,
    linkedAdjustmentId: null,
    linkedCashActionId: null,
    categoryBreakdown: negatedCategoryBreakdown,
    paymentBreakdown: negatedPaymentBreakdown,
    categoryPaymentMatrix: negatedMatrix,
    totalAmountIncl: sumCategoryBreakdown(negatedCategoryBreakdown),
    createdAt: reopenExecutedAt,
  };
}
