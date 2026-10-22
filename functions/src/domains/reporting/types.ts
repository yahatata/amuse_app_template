import { Timestamp } from 'firebase-admin/firestore';

export type ReportingEntryType = 'settle' | 'cashAction' | 'reopen_rollback' | 'resettle';

export interface ReportingEntry {
  entryId: string;
  entryType: ReportingEntryType;
  billId: string;
  cycleNo: number;
  reportingMonth: string; // yyyyMM
  eventAt: Timestamp;
  originBusinessDate: string;
  linkedAdjustmentId: string | null;
  linkedCashActionId: string | null;
  categoryBreakdown: Record<string, { amountIncl: number }>;
  paymentBreakdown: Record<string, number>;
  categoryPaymentMatrix: Record<string, number>;
  totalAmountIncl: number;
  createdAt: Timestamp;
}

export interface ReportingMonthly {
  monthKey: string; // yyyyMM
  totalAmountIncl: number;
  categoryBreakdown: Record<string, { amountIncl: number }>;
  paymentMethodBreakdown: Record<string, number>;
  categoryPaymentMatrix: Record<string, number>;
  lastUpdatedAt: Timestamp;
}

export type SettleDateRule = 'settledAt' | 'businessDate';
export type AdjustmentDateRule = 'adjustmentDate' | 'originalBillDate';
export type ImmediateCashActionDateRule = 'cashActionDate' | 'adjustmentDate';
export type LaterCashActionDateRule = 'cashActionDate' | 'originalBillDate';
export type ResettleDateRule = 'settledAt' | 'businessDate';
export type RevenueBasis = 'accrual' | 'cash';

export interface TaxReportingBehaviorDateRule {
  settle: SettleDateRule;
  adjustment: AdjustmentDateRule;
  immediateCashAction: ImmediateCashActionDateRule;
  laterCashAction: LaterCashActionDateRule;
  resettle: ResettleDateRule;
}

export interface TaxReportingBehavior {
  dateRule: TaxReportingBehaviorDateRule;
  revenueRecognition: {
    basis: RevenueBasis;
    pendingAdjustmentTiming: 'onCashAction';
  };
  reopenPolicy: {
    reportingTreatment: 'reverseInOriginalMonth';
  };
  granularity: {
    reportingEntry: 'lineLevel';
  };
}

export interface ReportingGroupDefinition {
  key: string;
  label: string;
  categoryKeys: string[];
}

export interface ReportingGroupConfig {
  groups: ReportingGroupDefinition[];
}
