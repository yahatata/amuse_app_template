import { isCarryoverUnsettledBillFromCloseSummary } from '../../src/domains/bills/services/carryoverUnsettled';

describe('isCarryoverUnsettledBillFromCloseSummary', () => {
  it('unresolved=true → true', () => {
    expect(
      isCarryoverUnsettledBillFromCloseSummary({ unresolved: true }),
    ).toBe(true);
  });

  it('証跡のみ（settle 後 unresolved=false）→ true', () => {
    expect(
      isCarryoverUnsettledBillFromCloseSummary({
        unresolved: false,
        closedBusinessDate: '2026-08-23',
        lastCloseRunId: 'close-1',
        displayAmountAtMark: 1000,
        markedAt: { seconds: 1 },
      }),
    ).toBe(true);
  });

  it('証跡なし → false', () => {
    expect(
      isCarryoverUnsettledBillFromCloseSummary({ unresolved: false }),
    ).toBe(false);
    expect(isCarryoverUnsettledBillFromCloseSummary(null)).toBe(false);
    expect(isCarryoverUnsettledBillFromCloseSummary(undefined)).toBe(false);
  });
});
