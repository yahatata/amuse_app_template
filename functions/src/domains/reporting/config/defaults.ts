import type { TaxReportingBehavior } from '../types';

export const DEFAULT_TAX_REPORTING_BEHAVIOR: TaxReportingBehavior = {
  dateRule: {
    settle: 'settledAt',
    adjustment: 'adjustmentDate',
    immediateCashAction: 'cashActionDate',
    laterCashAction: 'cashActionDate',
    resettle: 'settledAt',
  },
  revenueRecognition: {
    basis: 'accrual',
    pendingAdjustmentTiming: 'onCashAction',
  },
  reopenPolicy: {
    reportingTreatment: 'reverseInOriginalMonth',
  },
  granularity: {
    reportingEntry: 'lineLevel',
  },
};
