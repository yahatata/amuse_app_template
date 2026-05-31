import { writeReportingEntry } from '../../src/domains/reporting/services/entryWriter';
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
    categoryBreakdown: { items: { amountIncl: 3000 } },
    paymentBreakdown: { cash: 3000 },
    categoryPaymentMatrix: { items_cash: 3000 },
    ...overrides,
  };
}

describe('writeReportingEntry', () => {
  it('new entry: document created successfully, returns { written: true }', async () => {
    const createFn = jest.fn().mockResolvedValue(undefined);
    const docFn = jest.fn().mockReturnValue({ create: createFn });
    const collectionFn = jest.fn().mockReturnValue({ doc: docFn });
    const mockDb = { collection: collectionFn } as any;

    const entry = makeMockEntry();
    const result = await writeReportingEntry(mockDb, entry);

    expect(result).toEqual({ written: true });
    expect(collectionFn).toHaveBeenCalledWith('reportingEntries');
    expect(docFn).toHaveBeenCalledWith('bill_001_settle_1');
    expect(createFn).toHaveBeenCalledWith(entry as any);
  });

  it('duplicate entry: returns { written: false }, no error thrown', async () => {
    const alreadyExistsError = Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
    const createFn = jest.fn().mockRejectedValue(alreadyExistsError);
    const docFn = jest.fn().mockReturnValue({ create: createFn });
    const collectionFn = jest.fn().mockReturnValue({ doc: docFn });
    const mockDb = { collection: collectionFn } as any;

    const entry = makeMockEntry();
    const result = await writeReportingEntry(mockDb, entry);

    expect(result).toEqual({ written: false });
  });

  it('other errors are re-thrown', async () => {
    const otherError = Object.assign(new Error('PERMISSION_DENIED'), { code: 7 });
    const createFn = jest.fn().mockRejectedValue(otherError);
    const docFn = jest.fn().mockReturnValue({ create: createFn });
    const collectionFn = jest.fn().mockReturnValue({ doc: docFn });
    const mockDb = { collection: collectionFn } as any;

    const entry = makeMockEntry();
    await expect(writeReportingEntry(mockDb, entry)).rejects.toThrow('PERMISSION_DENIED');
  });
});
