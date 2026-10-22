/**
 * services/parentSummary.ts に Step03 で追加した adjustment 派生 helper の unit test。
 *
 * 仕様書 03_adjustments管理.md §16.1 / §16.2 / §16.4 をカバーする。
 */

import {
  buildCurrentSummaryAfterAdjustment,
  buildPostSettlementStateAfterAdjustment,
  deriveStatusAfterAdjustment,
  buildInitialCurrentSummary,
  buildInitialPostSettlementState,
} from '../../../src/domains/bills/services/parentSummary';

describe('services/parentSummary adjustment 派生 helper', () => {
  describe('deriveStatusAfterAdjustment', () => {
    it('片側でも remaining が残れば post_settlement_pending', () => {
      expect(
        deriveStatusAfterAdjustment({
          refundRemainingTotal: 500,
          collectionRemainingTotal: 0,
        })
      ).toBe('post_settlement_pending');
      expect(
        deriveStatusAfterAdjustment({
          refundRemainingTotal: 0,
          collectionRemainingTotal: 200,
        })
      ).toBe('post_settlement_pending');
    });

    it('両方 0 なら settled', () => {
      expect(
        deriveStatusAfterAdjustment({
          refundRemainingTotal: 0,
          collectionRemainingTotal: 0,
        })
      ).toBe('settled');
    });
  });

  describe('buildPostSettlementStateAfterAdjustment', () => {
    const baseExisting = buildInitialPostSettlementState();

    it('decrease 系で totalAdjustmentsIncl を負方向に積む', () => {
      const result = buildPostSettlementStateAfterAdjustment({
        existingState: baseExisting,
        adjustmentSignedAmountIncl: -1000,
        summarizedRemaining: { refundRemainingTotal: 1000, collectionRemainingTotal: 0 },
        lastRecordAt: 'ts1',
        lastRecordId: 'adj-1',
      });
      expect(result).toMatchObject({
        hasPostSettlementActivity: true,
        totalAdjustmentsIncl: -1000,
        totalCollectedIncl: 0,
        totalRefundedIncl: 0,
        requiredActionType: 'refund',
        requiredActionIncl: 1000,
        lastRecordType: 'adjustment',
        lastRecordAt: 'ts1',
        lastRecordId: 'adj-1',
      });
    });

    it('increase 系で totalAdjustmentsIncl を正方向に積む', () => {
      const result = buildPostSettlementStateAfterAdjustment({
        existingState: baseExisting,
        adjustmentSignedAmountIncl: 500,
        summarizedRemaining: { refundRemainingTotal: 0, collectionRemainingTotal: 500 },
        lastRecordAt: 'ts2',
        lastRecordId: 'adj-2',
      });
      expect(result).toMatchObject({
        totalAdjustmentsIncl: 500,
        requiredActionType: 'collection',
        requiredActionIncl: 500,
      });
    });

    it('immediate refund で totalRefundedIncl を加算しつつ remaining 0 → status settled', () => {
      const result = buildPostSettlementStateAfterAdjustment({
        existingState: baseExisting,
        adjustmentSignedAmountIncl: -1000,
        immediateRefundAmountIncl: 1000,
        summarizedRemaining: { refundRemainingTotal: 0, collectionRemainingTotal: 0 },
        lastRecordAt: 'ts',
        lastRecordId: 'adj-3',
      });
      expect(result).toMatchObject({
        totalAdjustmentsIncl: -1000,
        totalRefundedIncl: 1000,
        totalCollectedIncl: 0,
        requiredActionType: 'none',
        requiredActionIncl: 0,
      });
    });

    it('immediate collection で totalCollectedIncl を加算', () => {
      const result = buildPostSettlementStateAfterAdjustment({
        existingState: baseExisting,
        adjustmentSignedAmountIncl: 700,
        immediateCollectionAmountIncl: 700,
        summarizedRemaining: { refundRemainingTotal: 0, collectionRemainingTotal: 0 },
        lastRecordAt: 'ts',
        lastRecordId: 'adj-4',
      });
      expect(result).toMatchObject({
        totalAdjustmentsIncl: 700,
        totalCollectedIncl: 700,
        requiredActionType: 'none',
        requiredActionIncl: 0,
      });
    });

    it('既存の totals に積み上げる', () => {
      const result = buildPostSettlementStateAfterAdjustment({
        existingState: {
          ...baseExisting,
          hasPostSettlementActivity: true,
          totalAdjustmentsIncl: -300,
          totalRefundedIncl: 200,
        },
        adjustmentSignedAmountIncl: -500,
        immediateRefundAmountIncl: 500,
        summarizedRemaining: { refundRemainingTotal: 0, collectionRemainingTotal: 0 },
        lastRecordAt: 'ts',
        lastRecordId: 'adj-5',
      });
      expect(result.totalAdjustmentsIncl).toBe(-800);
      expect(result.totalRefundedIncl).toBe(700);
    });

    it('lastRecordType は adjustment 固定', () => {
      const result = buildPostSettlementStateAfterAdjustment({
        existingState: baseExisting,
        adjustmentSignedAmountIncl: -100,
        summarizedRemaining: { refundRemainingTotal: 100, collectionRemainingTotal: 0 },
        lastRecordAt: 'ts',
        lastRecordId: 'adj-6',
      });
      expect(result.lastRecordType).toBe('adjustment');
    });
  });

  describe('buildCurrentSummaryAfterAdjustment', () => {
    const base = buildInitialCurrentSummary();

    it('claimTotalIncl / netSalesIncl を符号付きで増減', () => {
      const result = buildCurrentSummaryAfterAdjustment({
        existingSummary: { ...base, claimTotalIncl: 5000, netSalesIncl: 5000 },
        adjustmentSignedAmountIncl: -1000,
      });
      expect(result.claimTotalIncl).toBe(4000);
      expect(result.netSalesIncl).toBe(4000);
    });

    it('immediate refund で refundedTotalIncl を増やす', () => {
      const result = buildCurrentSummaryAfterAdjustment({
        existingSummary: { ...base, claimTotalIncl: 5000, netSalesIncl: 5000 },
        adjustmentSignedAmountIncl: -1000,
        immediateRefundAmountIncl: 1000,
      });
      expect(result.refundedTotalIncl).toBe(1000);
      expect(result.receivedTotalIncl).toBe(0);
      expect(result.claimTotalIncl).toBe(4000);
    });

    it('immediate collection で receivedTotalIncl を増やす', () => {
      const result = buildCurrentSummaryAfterAdjustment({
        existingSummary: { ...base, claimTotalIncl: 5000, netSalesIncl: 5000 },
        adjustmentSignedAmountIncl: 500,
        immediateCollectionAmountIncl: 500,
      });
      expect(result.receivedTotalIncl).toBe(500);
      expect(result.refundedTotalIncl).toBe(0);
      expect(result.claimTotalIncl).toBe(5500);
    });
  });
});
