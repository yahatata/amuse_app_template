import {
  computeOkibakeRemotePaymentClaimTotal,
} from '../../src/domains/tournament_activeTournament/callables/resolveOkibakePendingReviewWithRemotePayment';

describe('computeOkibakeRemotePaymentClaimTotal', () => {
  it('entry + addon*count', () => {
    expect(
      computeOkibakeRemotePaymentClaimTotal({
        entryFeeIncl: 2000,
        addonFeeIncl: 1000,
        addonCount: 3,
      }),
    ).toBe(5000);
  });

  it('zero fees', () => {
    expect(
      computeOkibakeRemotePaymentClaimTotal({
        entryFeeIncl: 0,
        addonFeeIncl: 1000,
        addonCount: 2,
      }),
    ).toBe(2000);
  });
});
