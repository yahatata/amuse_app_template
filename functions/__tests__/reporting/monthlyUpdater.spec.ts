import * as admin from 'firebase-admin';

import { applyEntryToReportingMonthly } from '../../src/domains/reporting/services/monthlyUpdater';
import type { ReportingEntry } from '../../src/domains/reporting/types';
import { Timestamp } from 'firebase-admin/firestore';

function makeMockEntry(overrides?: Partial<ReportingEntry>): ReportingEntry {
  return {
    entryId: 'bill_001_settle_1',
    entryType: 'settle',
    billId: 'bill_001',
    cycleNo: 1,
    reportingMonth: '202506',
    eventAt: Timestamp.fromDate(new Date('2025-06-15T20:00:00+09:00')),
    originBusinessDate: '2025-06-15',
    linkedAdjustmentId: null,
    linkedCashActionId: null,
    categoryBreakdown: { items: { amountIncl: 3000 }, extraCost: { amountIncl: 1000 } },
    paymentBreakdown: { cash: 3000, credit_card: 1000 },
    categoryPaymentMatrix: { items_cash: 3000, extraCost_credit_card: 1000 },
    ...overrides,
  };
}

function buildMockDb(opts: {
  markerExists: boolean;
  monthlyExists: boolean;
}) {
  const markerGetFn = jest.fn().mockResolvedValue({ exists: opts.markerExists });
  const markerSetFn = jest.fn().mockResolvedValue(undefined);
  const markerDocFn = jest.fn().mockReturnValue({ get: markerGetFn, set: markerSetFn });
  const markerCollectionFn = jest.fn().mockReturnValue({ doc: markerDocFn });

  const monthlyGetFn = jest.fn().mockResolvedValue({ exists: opts.monthlyExists });
  const monthlySetFn = jest.fn().mockResolvedValue(undefined);
  const monthlyUpdateFn = jest.fn().mockResolvedValue(undefined);

  const monthlyDocFn = jest.fn().mockReturnValue({
    get: monthlyGetFn,
    set: monthlySetFn,
    update: monthlyUpdateFn,
    collection: markerCollectionFn,
  });
  const collectionFn = jest.fn().mockReturnValue({ doc: monthlyDocFn });
  const mockDb = { collection: collectionFn } as any;

  return {
    mockDb,
    collectionFn,
    monthlyDocFn,
    monthlyGetFn,
    monthlySetFn,
    monthlyUpdateFn,
    markerDocFn,
    markerGetFn,
    markerSetFn,
    markerCollectionFn,
  };
}

describe('applyEntryToReportingMonthly', () => {
  it('new entry with no existing monthly doc: creates monthly doc then updates', async () => {
    const mocks = buildMockDb({ markerExists: false, monthlyExists: false });
    const entry = makeMockEntry();

    await applyEntryToReportingMonthly(mocks.mockDb, entry);

    expect(mocks.collectionFn).toHaveBeenCalledWith('reportingMonthly');
    expect(mocks.monthlyDocFn).toHaveBeenCalledWith('202506');

    expect(mocks.markerSetFn).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: 'bill_001_settle_1' }),
    );

    expect(mocks.monthlySetFn).toHaveBeenCalledWith(
      expect.objectContaining({
        monthKey: '202506',
        totalAmountIncl: 0,
      }),
    );

    expect(mocks.monthlyUpdateFn).toHaveBeenCalledTimes(1);
    const updateArg = mocks.monthlyUpdateFn.mock.calls[0][0];
    expect(updateArg['totalAmountIncl']).toEqual(admin.firestore.FieldValue.increment(4000));
    expect(updateArg['categoryBreakdown.items.amountIncl']).toEqual(admin.firestore.FieldValue.increment(3000));
    expect(updateArg['categoryBreakdown.extraCost.amountIncl']).toEqual(admin.firestore.FieldValue.increment(1000));
    expect(updateArg['paymentMethodBreakdown.cash']).toEqual(admin.firestore.FieldValue.increment(3000));
    expect(updateArg['paymentMethodBreakdown.credit_card']).toEqual(admin.firestore.FieldValue.increment(1000));
    expect(updateArg['categoryPaymentMatrix.items_cash']).toEqual(admin.firestore.FieldValue.increment(3000));
    expect(updateArg['categoryPaymentMatrix.extraCost_credit_card']).toEqual(admin.firestore.FieldValue.increment(1000));
  });

  it('existing monthly doc: increments values correctly (no set call)', async () => {
    const mocks = buildMockDb({ markerExists: false, monthlyExists: true });
    const entry = makeMockEntry();

    await applyEntryToReportingMonthly(mocks.mockDb, entry);

    expect(mocks.monthlySetFn).not.toHaveBeenCalled();
    expect(mocks.monthlyUpdateFn).toHaveBeenCalledTimes(1);
  });

  it('idempotency: if marker exists, no update happens', async () => {
    const mocks = buildMockDb({ markerExists: true, monthlyExists: true });
    const entry = makeMockEntry();

    await applyEntryToReportingMonthly(mocks.mockDb, entry);

    expect(mocks.markerSetFn).not.toHaveBeenCalled();
    expect(mocks.monthlySetFn).not.toHaveBeenCalled();
    expect(mocks.monthlyUpdateFn).not.toHaveBeenCalled();
  });

  it('negative values (rollback): decrements correctly', async () => {
    const mocks = buildMockDb({ markerExists: false, monthlyExists: true });
    const entry = makeMockEntry({
      entryId: 'bill_001_reopen_1',
      entryType: 'reopen_rollback',
      categoryBreakdown: { items: { amountIncl: -3000 } },
      paymentBreakdown: { cash: -3000 },
      categoryPaymentMatrix: { items_cash: -3000 },
    });

    await applyEntryToReportingMonthly(mocks.mockDb, entry);

    const updateArg = mocks.monthlyUpdateFn.mock.calls[0][0];
    expect(updateArg['totalAmountIncl']).toEqual(admin.firestore.FieldValue.increment(-3000));
    expect(updateArg['categoryBreakdown.items.amountIncl']).toEqual(admin.firestore.FieldValue.increment(-3000));
    expect(updateArg['paymentMethodBreakdown.cash']).toEqual(admin.firestore.FieldValue.increment(-3000));
    expect(updateArg['categoryPaymentMatrix.items_cash']).toEqual(admin.firestore.FieldValue.increment(-3000));
  });
});
