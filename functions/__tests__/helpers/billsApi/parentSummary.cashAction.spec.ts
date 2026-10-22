/**
 * services/parentSummary.ts の cashAction 派生 helper の unit test。
 *
 * Step04 で追加した:
 * - buildPostSettlementStateAfterCashAction
 * - buildCurrentSummaryAfterCashAction
 * - deriveStatusAfterCashAction
 *
 * 仕様書 04_cashActions管理.md §12.1 / §12.2 / §12.3 に対応。
 */

import {
  buildCurrentSummaryAfterCashAction,
  buildPostSettlementStateAfterCashAction,
  deriveStatusAfterCashAction,
} from '../../../src/domains/bills/services/parentSummary';

describe('parentSummary deriveStatusAfterCashAction', () => {
  it('remaining = 0 → settled', () => {
    expect(
      deriveStatusAfterCashAction({
        refundRemainingTotal: 0,
        collectionRemainingTotal: 0,
      })
    ).toBe('settled');
  });

  it('refund remaining > 0 → post_settlement_pending', () => {
    expect(
      deriveStatusAfterCashAction({
        refundRemainingTotal: 100,
        collectionRemainingTotal: 0,
      })
    ).toBe('post_settlement_pending');
  });

  it('collection remaining > 0 → post_settlement_pending', () => {
    expect(
      deriveStatusAfterCashAction({
        refundRemainingTotal: 0,
        collectionRemainingTotal: 100,
      })
    ).toBe('post_settlement_pending');
  });

  it('負の値は無視して扱う', () => {
    expect(
      deriveStatusAfterCashAction({
        refundRemainingTotal: -100,
        collectionRemainingTotal: 0,
      })
    ).toBe('settled');
  });
});

describe('parentSummary buildPostSettlementStateAfterCashAction', () => {
  const baseExisting = {
    hasPostSettlementActivity: true,
    totalAdjustmentsIncl: -1000,
    totalCollectedIncl: 0,
    totalRefundedIncl: 0,
    requiredActionType: 'refund' as const,
    requiredActionIncl: 1000,
    lastRecordType: 'adjustment' as const,
    lastRecordAt: { toMillis: () => 1700000000000 } as unknown,
    lastRecordId: 'adj-1',
  };

  it('refund cashAction で totalRefundedIncl 増 / lastRecordType=cash_action / requiredActionType=none', () => {
    const result = buildPostSettlementStateAfterCashAction({
      existingState: baseExisting,
      cashActionType: 'refund',
      cashActionAmountIncl: 1000,
      summarizedRemaining: { refundRemainingTotal: 0, collectionRemainingTotal: 0 },
      lastRecordAt: { toMillis: () => 1700001000000 } as unknown,
      lastRecordId: 'cash-1',
    });

    expect(result.totalRefundedIncl).toBe(1000);
    expect(result.totalCollectedIncl).toBe(0);
    expect(result.totalAdjustmentsIncl).toBe(-1000); // 不変
    expect(result.lastRecordType).toBe('cash_action');
    expect(result.lastRecordId).toBe('cash-1');
    expect(result.requiredActionType).toBe('none');
    expect(result.requiredActionIncl).toBe(0);
    expect(result.hasPostSettlementActivity).toBe(true);
  });

  it('collection cashAction で totalCollectedIncl 増 / lastRecordType=cash_action', () => {
    const result = buildPostSettlementStateAfterCashAction({
      existingState: {
        ...baseExisting,
        totalAdjustmentsIncl: 500,
        requiredActionType: 'collection',
        requiredActionIncl: 500,
      },
      cashActionType: 'collection',
      cashActionAmountIncl: 500,
      summarizedRemaining: { refundRemainingTotal: 0, collectionRemainingTotal: 0 },
      lastRecordAt: { toMillis: () => 1700002000000 } as unknown,
      lastRecordId: 'cash-2',
    });

    expect(result.totalCollectedIncl).toBe(500);
    expect(result.totalRefundedIncl).toBe(0);
    expect(result.totalAdjustmentsIncl).toBe(500); // 不変
    expect(result.lastRecordType).toBe('cash_action');
    expect(result.lastRecordId).toBe('cash-2');
    expect(result.requiredActionType).toBe('none');
    expect(result.requiredActionIncl).toBe(0);
  });

  it('部分解消で remaining 残り → requiredActionType 維持', () => {
    const result = buildPostSettlementStateAfterCashAction({
      existingState: baseExisting,
      cashActionType: 'refund',
      cashActionAmountIncl: 600,
      summarizedRemaining: { refundRemainingTotal: 400, collectionRemainingTotal: 0 },
      lastRecordAt: { toMillis: () => 1700001000000 } as unknown,
      lastRecordId: 'cash-3',
    });

    expect(result.totalRefundedIncl).toBe(600);
    expect(result.requiredActionType).toBe('refund');
    expect(result.requiredActionIncl).toBe(400);
  });

  it('既存累計に cashAction 額が積まれる', () => {
    const result = buildPostSettlementStateAfterCashAction({
      existingState: {
        ...baseExisting,
        totalRefundedIncl: 200,
      },
      cashActionType: 'refund',
      cashActionAmountIncl: 300,
      summarizedRemaining: { refundRemainingTotal: 0, collectionRemainingTotal: 0 },
      lastRecordAt: {} as unknown,
      lastRecordId: 'cash-4',
    });

    expect(result.totalRefundedIncl).toBe(500);
  });
});

describe('parentSummary buildCurrentSummaryAfterCashAction', () => {
  const baseExisting = {
    claimTotalIncl: 5000,
    receivedTotalIncl: 5000,
    refundedTotalIncl: 0,
    netSalesIncl: 5000,
  };

  it('refund で refundedTotalIncl 増、claim/netSales/received 不変', () => {
    const result = buildCurrentSummaryAfterCashAction({
      existingSummary: baseExisting,
      cashActionType: 'refund',
      cashActionAmountIncl: 1000,
    });

    expect(result.refundedTotalIncl).toBe(1000);
    expect(result.claimTotalIncl).toBe(5000);
    expect(result.netSalesIncl).toBe(5000);
    expect(result.receivedTotalIncl).toBe(5000);
  });

  it('collection で receivedTotalIncl 増、claim/netSales/refunded 不変', () => {
    const result = buildCurrentSummaryAfterCashAction({
      existingSummary: baseExisting,
      cashActionType: 'collection',
      cashActionAmountIncl: 800,
    });

    expect(result.receivedTotalIncl).toBe(5800);
    expect(result.claimTotalIncl).toBe(5000);
    expect(result.netSalesIncl).toBe(5000);
    expect(result.refundedTotalIncl).toBe(0);
  });

  it('既存累計に cashAction 額が積まれる', () => {
    const result = buildCurrentSummaryAfterCashAction({
      existingSummary: { ...baseExisting, refundedTotalIncl: 300 },
      cashActionType: 'refund',
      cashActionAmountIncl: 700,
    });

    expect(result.refundedTotalIncl).toBe(1000);
  });

  it('null/undefined の既存値は 0 として扱う', () => {
    const result = buildCurrentSummaryAfterCashAction({
      existingSummary: {} as Parameters<typeof buildCurrentSummaryAfterCashAction>[0]['existingSummary'],
      cashActionType: 'refund',
      cashActionAmountIncl: 100,
    });

    expect(result.refundedTotalIncl).toBe(100);
    expect(result.claimTotalIncl).toBe(0);
    expect(result.netSalesIncl).toBe(0);
    expect(result.receivedTotalIncl).toBe(0);
  });
});
