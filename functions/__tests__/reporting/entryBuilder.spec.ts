import { Timestamp } from 'firebase-admin/firestore';

import {
  buildSettleEntry,
  buildCashActionEntry,
  buildReopenRollbackEntry,
  buildCategoryPaymentMatrix,
} from '../../src/domains/reporting/services/entryBuilder';
import type { TaxReportingBehaviorDateRule } from '../../src/domains/reporting/types';
import { DEFAULT_TAX_REPORTING_BEHAVIOR } from '../../src/domains/reporting/config/defaults';

const defaultDateRule: TaxReportingBehaviorDateRule = DEFAULT_TAX_REPORTING_BEHAVIOR.dateRule;

function ts(dateStr: string): Timestamp {
  return Timestamp.fromDate(new Date(dateStr));
}

describe('entryBuilder', () => {
  // =========================================================================
  // buildSettleEntry
  // =========================================================================
  describe('buildSettleEntry', () => {
    it('string-format paymentMethodsByCategory → correct categoryPaymentMatrix', () => {
      const entry = buildSettleEntry({
        billId: 'bill_001',
        cycleNo: 1,
        settledAt: ts('2025-06-15T20:00:00+09:00'),
        businessDate: '2025-06-15',
        categoryBreakdown: {
          items: { amountIncl: 3000 },
          extraCost: { amountIncl: 1000 },
        },
        paymentTotals: { cash: 4000 },
        paymentMethodsByCategory: {
          items: 'cash',
          extraCost: 'cash',
        },
        dateRule: defaultDateRule,
        entryType: 'settle',
      });

      expect(entry.categoryPaymentMatrix).toEqual({
        items_cash: 3000,
        extraCost_cash: 1000,
      });
    });

    it('array-format paymentMethodsByCategory → correct split amounts', () => {
      const entry = buildSettleEntry({
        billId: 'bill_002',
        cycleNo: 1,
        settledAt: ts('2025-06-15T20:00:00+09:00'),
        businessDate: '2025-06-15',
        categoryBreakdown: {
          items: { amountIncl: 3000 },
        },
        paymentTotals: { cash: 2000, credit_card: 1000 },
        paymentMethodsByCategory: {
          items: [
            { method: 'cash', amount: 2000 },
            { method: 'credit_card', amount: 1000 },
          ],
        },
        dateRule: defaultDateRule,
        entryType: 'settle',
      });

      expect(entry.categoryPaymentMatrix).toEqual({
        items_cash: 2000,
        items_credit_card: 1000,
      });
    });

    it('dateRule.settle = settledAt → reportingMonth from settledAt', () => {
      const entry = buildSettleEntry({
        billId: 'bill_003',
        cycleNo: 1,
        settledAt: ts('2025-07-01T01:00:00+09:00'),
        businessDate: '2025-06-30',
        categoryBreakdown: { items: { amountIncl: 1000 } },
        paymentTotals: { cash: 1000 },
        paymentMethodsByCategory: { items: 'cash' },
        dateRule: { ...defaultDateRule, settle: 'settledAt' },
        entryType: 'settle',
      });

      expect(entry.reportingMonth).toBe('202507');
    });

    it('dateRule.settle = businessDate → reportingMonth from businessDate', () => {
      const entry = buildSettleEntry({
        billId: 'bill_004',
        cycleNo: 1,
        settledAt: ts('2025-07-01T01:00:00+09:00'),
        businessDate: '2025-06-30',
        categoryBreakdown: { items: { amountIncl: 1000 } },
        paymentTotals: { cash: 1000 },
        paymentMethodsByCategory: { items: 'cash' },
        dateRule: { ...defaultDateRule, settle: 'businessDate' },
        entryType: 'settle',
      });

      expect(entry.reportingMonth).toBe('202506');
    });

    it('carryover with default rule → uses settledAt month', () => {
      const entry = buildSettleEntry({
        billId: 'bill_005',
        cycleNo: 1,
        settledAt: ts('2025-07-01T02:00:00+09:00'),
        businessDate: '2025-06-30',
        categoryBreakdown: { items: { amountIncl: 5000 } },
        paymentTotals: { cash: 5000 },
        paymentMethodsByCategory: { items: 'cash' },
        dateRule: defaultDateRule,
        entryType: 'settle',
      });

      expect(entry.reportingMonth).toBe('202507');
    });

    it('entryId format: {billId}_settle_{cycleNo}', () => {
      const entry = buildSettleEntry({
        billId: 'bill_006',
        cycleNo: 2,
        settledAt: ts('2025-06-15T20:00:00+09:00'),
        businessDate: '2025-06-15',
        categoryBreakdown: { items: { amountIncl: 1000 } },
        paymentTotals: { cash: 1000 },
        paymentMethodsByCategory: { items: 'cash' },
        dateRule: defaultDateRule,
        entryType: 'settle',
      });

      expect(entry.entryId).toBe('bill_006_settle_2');
      expect(entry.entryType).toBe('settle');
    });

    it('resettle: entryId uses {billId}_resettle_{cycleNo}', () => {
      const entry = buildSettleEntry({
        billId: 'bill_007',
        cycleNo: 3,
        settledAt: ts('2025-06-20T20:00:00+09:00'),
        businessDate: '2025-06-20',
        categoryBreakdown: { items: { amountIncl: 2000 } },
        paymentTotals: { cash: 2000 },
        paymentMethodsByCategory: { items: 'cash' },
        dateRule: defaultDateRule,
        entryType: 'resettle',
      });

      expect(entry.entryId).toBe('bill_007_resettle_3');
      expect(entry.entryType).toBe('resettle');
    });
  });

  // =========================================================================
  // buildCashActionEntry
  // =========================================================================
  describe('buildCashActionEntry', () => {
    it('normal case → categoryBreakdown from adjustment lines', () => {
      const entry = buildCashActionEntry({
        billId: 'bill_010',
        cycleNo: 1,
        cashActionId: 'ca_001',
        cashActionType: 'refund',
        amountIncl: -500,
        methodBreakdown: { cash: -500 },
        adjustmentLines: [
          { targetCategory: 'item', amountInclDelta: -300 },
          { targetCategory: 'extra', amountInclDelta: -200 },
        ],
        businessDate: '2025-06-15',
        cashActionExecutedAt: ts('2025-06-16T10:00:00+09:00'),
        dateRule: defaultDateRule,
        linkedAdjustmentId: 'adj_001',
        isImmediate: true,
      });

      expect(entry.categoryBreakdown).toEqual({
        items: { amountIncl: -300 },
        extraCost: { amountIncl: -200 },
      });
    });

    it('entryId format: {billId}_cashAction_{cashActionId}', () => {
      const entry = buildCashActionEntry({
        billId: 'bill_011',
        cycleNo: 1,
        cashActionId: 'ca_002',
        cashActionType: 'refund',
        amountIncl: -1000,
        methodBreakdown: { cash: -1000 },
        adjustmentLines: [{ targetCategory: 'item', amountInclDelta: -1000 }],
        businessDate: '2025-06-15',
        cashActionExecutedAt: ts('2025-06-16T10:00:00+09:00'),
        dateRule: defaultDateRule,
        linkedAdjustmentId: null,
        isImmediate: false,
      });

      expect(entry.entryId).toBe('bill_011_cashAction_ca_002');
    });

    it('paymentBreakdown matches methodBreakdown', () => {
      const methodBreakdown = { cash: -800, credit_card: -200 };
      const entry = buildCashActionEntry({
        billId: 'bill_012',
        cycleNo: 1,
        cashActionId: 'ca_003',
        cashActionType: 'refund',
        amountIncl: -1000,
        methodBreakdown,
        adjustmentLines: [{ targetCategory: 'item', amountInclDelta: -1000 }],
        businessDate: '2025-06-15',
        cashActionExecutedAt: ts('2025-06-16T10:00:00+09:00'),
        dateRule: defaultDateRule,
        linkedAdjustmentId: null,
        isImmediate: true,
      });

      expect(entry.paymentBreakdown).toEqual({ cash: -800, credit_card: -200 });
    });
  });

  // =========================================================================
  // buildReopenRollbackEntry
  // =========================================================================
  describe('buildReopenRollbackEntry', () => {
    it('all amounts negated', () => {
      const originalEntry = buildSettleEntry({
        billId: 'bill_020',
        cycleNo: 1,
        settledAt: ts('2025-06-15T20:00:00+09:00'),
        businessDate: '2025-06-15',
        categoryBreakdown: {
          items: { amountIncl: 3000 },
          extraCost: { amountIncl: 1000 },
        },
        paymentTotals: { cash: 3000, credit_card: 1000 },
        paymentMethodsByCategory: {
          items: 'cash',
          extraCost: 'credit_card',
        },
        dateRule: defaultDateRule,
        entryType: 'settle',
      });

      const rollback = buildReopenRollbackEntry({
        billId: 'bill_020',
        cycleNo: 1,
        reopenExecutedAt: ts('2025-06-16T10:00:00+09:00'),
        originalSettleEntry: originalEntry,
      });

      expect(rollback.categoryBreakdown).toEqual({
        items: { amountIncl: -3000 },
        extraCost: { amountIncl: -1000 },
      });
      expect(rollback.paymentBreakdown).toEqual({
        cash: -3000,
        credit_card: -1000,
      });
      expect(rollback.categoryPaymentMatrix).toEqual({
        items_cash: -3000,
        extraCost_credit_card: -1000,
      });
    });

    it('entryId format: {billId}_reopen_{cycleNo}', () => {
      const originalEntry = buildSettleEntry({
        billId: 'bill_021',
        cycleNo: 2,
        settledAt: ts('2025-06-15T20:00:00+09:00'),
        businessDate: '2025-06-15',
        categoryBreakdown: { items: { amountIncl: 1000 } },
        paymentTotals: { cash: 1000 },
        paymentMethodsByCategory: { items: 'cash' },
        dateRule: defaultDateRule,
        entryType: 'settle',
      });

      const rollback = buildReopenRollbackEntry({
        billId: 'bill_021',
        cycleNo: 2,
        reopenExecutedAt: ts('2025-06-16T10:00:00+09:00'),
        originalSettleEntry: originalEntry,
      });

      expect(rollback.entryId).toBe('bill_021_reopen_2');
      expect(rollback.entryType).toBe('reopen_rollback');
    });
  });

  // =========================================================================
  // buildCategoryPaymentMatrix (helper)
  // =========================================================================
  describe('buildCategoryPaymentMatrix', () => {
    it('handles mixed string and array formats', () => {
      const result = buildCategoryPaymentMatrix(
        {
          items: 'cash',
          extraCost: [
            { method: 'cash', amount: 500 },
            { method: 'credit_card', amount: 500 },
          ],
        },
        {
          items: { amountIncl: 2000 },
          extraCost: { amountIncl: 1000 },
        },
      );

      expect(result).toEqual({
        items_cash: 2000,
        extraCost_cash: 500,
        extraCost_credit_card: 500,
      });
    });

    it('skips zero amounts', () => {
      const result = buildCategoryPaymentMatrix(
        { items: 'cash' },
        { items: { amountIncl: 0 } },
      );

      expect(result).toEqual({});
    });
  });
});
