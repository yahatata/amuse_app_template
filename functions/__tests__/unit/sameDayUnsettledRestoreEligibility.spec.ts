import { buildInitialCloseSummary } from '../../src/domains/bills/services/parentSummary';
import { evaluateSameDayUnsettledRestoreEligibility } from '../../src/domains/storeMeta/services/restoreUnsettledBillsOnSameDayReopen';

const REOPEN_DATE = '2026-08-25';

function markedBill(overrides: Record<string, unknown> = {}) {
  return {
    status: 'open',
    businessDate: REOPEN_DATE,
    billType: undefined,
    party: { userId: 'user-1', pokerName: 'Guest' },
    ops: { accountingStartedAt: null },
    closeSummary: {
      unresolved: true,
      markedAt: new Date(),
      closedBusinessDate: REOPEN_DATE,
      displayAmountAtMark: 1000,
      lastCloseRunId: 'close_2026-08-25_1',
    },
    ...overrides,
  };
}

describe('evaluateSameDayUnsettledRestoreEligibility', () => {
  it('eligible for marked unresolved open bill', () => {
    expect(
      evaluateSameDayUnsettledRestoreEligibility(markedBill(), REOPEN_DATE),
    ).toEqual({ eligible: true });
  });

  it('already initial closeSummary → already_restored', () => {
    expect(
      evaluateSameDayUnsettledRestoreEligibility(
        {
          ...markedBill(),
          closeSummary: buildInitialCloseSummary(),
          closeSnapshot: buildInitialCloseSummary(),
        },
        REOPEN_DATE,
      ),
    ).toEqual({ eligible: false, reason: 'already_restored' });
  });

  it('status not open → status_not_open', () => {
    expect(
      evaluateSameDayUnsettledRestoreEligibility(
        markedBill({ status: 'settled' }),
        REOPEN_DATE,
      ),
    ).toEqual({ eligible: false, reason: 'status_not_open' });
  });

  it('accounting started → accounting_started', () => {
    expect(
      evaluateSameDayUnsettledRestoreEligibility(
        markedBill({ ops: { accountingStartedAt: new Date() } }),
        REOPEN_DATE,
      ),
    ).toEqual({ eligible: false, reason: 'accounting_started' });
  });

  it('closedBusinessDate mismatch → closed_business_date_mismatch', () => {
    expect(
      evaluateSameDayUnsettledRestoreEligibility(
        markedBill({
          closeSummary: {
            ...markedBill().closeSummary,
            closedBusinessDate: '2026-08-24',
          },
        }),
        REOPEN_DATE,
      ),
    ).toEqual({ eligible: false, reason: 'closed_business_date_mismatch' });
  });

  it('okibake_remote_payment → excluded', () => {
    expect(
      evaluateSameDayUnsettledRestoreEligibility(
        markedBill({ billType: 'okibake_remote_payment' }),
        REOPEN_DATE,
      ),
    ).toEqual({ eligible: false, reason: 'okibake_remote_payment' });
  });

  it('unresolved false → unresolved_not_true', () => {
    expect(
      evaluateSameDayUnsettledRestoreEligibility(
        markedBill({
          closeSummary: {
            ...markedBill().closeSummary,
            unresolved: false,
          },
        }),
        REOPEN_DATE,
      ),
    ).toEqual({ eligible: false, reason: 'unresolved_not_true' });
  });
});
