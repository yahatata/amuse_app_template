/**
 * A-7 Phase 3: 返金・追加徴収の残高計画 unit tests
 */

import {
  applyCollectionDetailsMerge,
  planCollectionBalanceMovements,
  planRefundBalanceMovements,
} from '../../src/domains/bills/services/a7PostSettlementBalances';
import type { ValidatedPointConfig } from '../../src/shared/config/validatePointConfig';
import type { PaymentMethodDetails } from '../../src/domains/bills/services/paymentMethodAggregation';

function baseConfig(
  overrides?: Partial<ValidatedPointConfig>,
): ValidatedPointConfig {
  return {
    pointSettings: {
      pointA: { enabled: true, displayName: 'A' },
      pointB: { enabled: true, displayName: 'B' },
      pointC: { enabled: false, displayName: 'C' },
      pointD: { enabled: false, displayName: 'D' },
      pointE: { enabled: false, displayName: 'E' },
    },
    sideGameChipSettings: { enabled: true, displayName: 'chip' },
    categoryOrder: ['items'],
    pointPriority: ['pointA'],
    categoryPaymentMethods: {
      items: ['cash', 'pointA', 'pointB', 'sideGameChip'],
    },
    balancePaymentSettings: {
      pointA: {
        conversion: { referenceUnits: 1, balanceUnits: 1 },
        usageUnit: 1,
      },
      pointB: {
        conversion: { referenceUnits: 10, balanceUnits: 1 },
        usageUnit: 10,
      },
      sideGameChip: {
        conversion: { referenceUnits: 100, balanceUnits: 1 },
        usageUnit: 100,
      },
    },
    rankingRewardPointTypes: ['pointA'],
    ...overrides,
  };
}

describe('a7PostSettlementBalances', () => {
  describe('planRefundBalanceMovements', () => {
    it('uses saved conversion (not 1:1) for partial refund', () => {
      const details: PaymentMethodDetails = {
        pointB: {
          referenceAmount: 100,
          balanceAmount: 10,
          conversion: { referenceUnits: 10, balanceUnits: 1 },
          usageUnit: 10,
          refundedBalanceAmount: 0,
        },
      };
      const { movements, nextDetails } = planRefundBalanceMovements({
        methodBreakdown: [{ method: 'pointB', amountIncl: 50 }],
        paymentMethodDetails: details,
        collectionLots: [],
      });
      expect(movements).toHaveLength(1);
      expect(movements[0].balanceAmount).toBe(5);
      expect(nextDetails.pointB.refundedBalanceAmount).toBe(5);
    });

    it('rejects non-integer conversion', () => {
      const details: PaymentMethodDetails = {
        pointB: {
          referenceAmount: 100,
          balanceAmount: 10,
          conversion: { referenceUnits: 10, balanceUnits: 1 },
          usageUnit: 10,
          refundedBalanceAmount: 0,
        },
      };
      expect(() =>
        planRefundBalanceMovements({
          methodBreakdown: [{ method: 'pointB', amountIncl: 15 }],
          paymentMethodDetails: details,
          collectionLots: [],
        }),
      ).toThrow(/整数/);
    });

    it('rejects refund exceeding remaining balance', () => {
      const details: PaymentMethodDetails = {
        pointA: {
          referenceAmount: 100,
          balanceAmount: 100,
          conversion: { referenceUnits: 1, balanceUnits: 1 },
          usageUnit: 1,
          refundedBalanceAmount: 80,
        },
      };
      expect(() =>
        planRefundBalanceMovements({
          methodBreakdown: [{ method: 'pointA', amountIncl: 30 }],
          paymentMethodDetails: details,
          collectionLots: [],
        }),
      ).toThrow(/返金可能残高量|残量/);
    });

    it('full refund restores remaining after partial', () => {
      const details: PaymentMethodDetails = {
        pointA: {
          referenceAmount: 1000,
          balanceAmount: 1000,
          conversion: { referenceUnits: 1, balanceUnits: 1 },
          usageUnit: 1,
          refundedBalanceAmount: 300,
        },
      };
      const { movements, nextDetails } = planRefundBalanceMovements({
        methodBreakdown: [{ method: 'pointA', amountIncl: 700 }],
        paymentMethodDetails: details,
        collectionLots: [],
      });
      expect(movements[0].balanceAmount).toBe(700);
      expect(nextDetails.pointA.refundedBalanceAmount).toBe(1000);
    });
  });

  describe('planCollectionBalanceMovements', () => {
    it('uses current config conversion and usageUnit', () => {
      const { movements, cashActionSnapshots } = planCollectionBalanceMovements({
        methodBreakdown: [{ method: 'pointB', amountIncl: 20 }],
        validatedConfig: baseConfig(),
        userBalances: { pointB: 5 },
      });
      expect(movements[0].balanceAmount).toBe(2);
      expect(cashActionSnapshots.pointB.conversion).toEqual({
        referenceUnits: 10,
        balanceUnits: 1,
      });
    });

    it('rejects disabled method', () => {
      expect(() =>
        planCollectionBalanceMovements({
          methodBreakdown: [{ method: 'pointC', amountIncl: 10 }],
          validatedConfig: baseConfig(),
          userBalances: { pointC: 100 },
        }),
      ).toThrow(/無効/);
    });

    it('rejects insufficient balance', () => {
      expect(() =>
        planCollectionBalanceMovements({
          methodBreakdown: [{ method: 'pointA', amountIncl: 50 }],
          validatedConfig: baseConfig(),
          userBalances: { pointA: 10 },
        }),
      ).toThrow(/不足/);
    });

    it('rejects usage unit violation', () => {
      expect(() =>
        planCollectionBalanceMovements({
          methodBreakdown: [{ method: 'pointB', amountIncl: 15 }],
          validatedConfig: baseConfig(),
          userBalances: { pointB: 100 },
        }),
      ).toThrow(/利用単位/);
    });
  });

  describe('applyCollectionDetailsMerge', () => {
    it('merges when conversion matches', () => {
      const existing: PaymentMethodDetails = {
        pointA: {
          referenceAmount: 100,
          balanceAmount: 100,
          conversion: { referenceUnits: 1, balanceUnits: 1 },
          usageUnit: 1,
          refundedBalanceAmount: 0,
        },
      };
      const snapshots = {
        pointA: {
          referenceAmount: 50,
          balanceAmount: 50,
          conversion: { referenceUnits: 1, balanceUnits: 1 },
          usageUnit: 1,
          refundedBalanceAmount: 0,
          mergedIntoBillDetails: true,
        },
      };
      const next = applyCollectionDetailsMerge({
        existingDetails: existing,
        detailsMerge: {
          pointA: {
            referenceAmount: 50,
            balanceAmount: 50,
            conversion: { referenceUnits: 1, balanceUnits: 1 },
            usageUnit: 1,
            refundedBalanceAmount: 0,
          },
        },
        cashActionSnapshots: snapshots,
      });
      expect(next.pointA.referenceAmount).toBe(150);
      expect(snapshots.pointA.mergedIntoBillDetails).toBe(true);
    });

    it('does not destroy details when conversion differs', () => {
      const existing: PaymentMethodDetails = {
        pointA: {
          referenceAmount: 100,
          balanceAmount: 100,
          conversion: { referenceUnits: 1, balanceUnits: 1 },
          usageUnit: 1,
          refundedBalanceAmount: 0,
        },
      };
      const snapshots = {
        pointA: {
          referenceAmount: 50,
          balanceAmount: 25,
          conversion: { referenceUnits: 2, balanceUnits: 1 },
          usageUnit: 2,
          refundedBalanceAmount: 0,
          mergedIntoBillDetails: true,
        },
      };
      const next = applyCollectionDetailsMerge({
        existingDetails: existing,
        detailsMerge: {
          pointA: {
            referenceAmount: 50,
            balanceAmount: 25,
            conversion: { referenceUnits: 2, balanceUnits: 1 },
            usageUnit: 2,
            refundedBalanceAmount: 0,
          },
        },
        cashActionSnapshots: snapshots,
      });
      expect(next.pointA.conversion).toEqual({
        referenceUnits: 1,
        balanceUnits: 1,
      });
      expect(next.pointA.referenceAmount).toBe(100);
      expect(snapshots.pointA.mergedIntoBillDetails).toBe(false);
    });
  });
});
