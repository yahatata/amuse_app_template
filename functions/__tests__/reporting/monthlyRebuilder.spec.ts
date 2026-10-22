import { rebuildReportingMonthly } from '../../src/domains/reporting/services/monthlyRebuilder';
import type { ReportingEntry } from '../../src/domains/reporting/types';
import { Timestamp } from 'firebase-admin/firestore';

function makeMockEntry(overrides?: Partial<ReportingEntry>): ReportingEntry {
  return {
    entryId: 'bill_001_settle_1',
    entryType: 'settle',
    billId: 'bill_001',
    cycleNo: 1,
    reportingMonth: '202605',
    eventAt: Timestamp.fromDate(new Date('2025-06-15T20:00:00+09:00')),
    originBusinessDate: '2025-06-15',
    linkedAdjustmentId: null,
    linkedCashActionId: null,
    categoryBreakdown: { items: { amountIncl: 3000 }, extraCost: { amountIncl: 1000 } },
    paymentBreakdown: { cash: 3000, credit_card: 1000 },
    categoryPaymentMatrix: { items_cash: 3000, extraCost_credit_card: 1000 },
    totalAmountIncl: 4000,
    createdAt: Timestamp.fromDate(new Date('2025-06-15T20:00:00+09:00')),
    ...overrides,
  };
}

function buildMockDb(opts: {
  entries: ReportingEntry[];
  existingMarkerIds?: string[];
}) {
  const entryDocs = opts.entries.map((e) => ({
    id: e.entryId,
    data: () => e,
    ref: { path: `reportingEntries/${e.entryId}` },
  }));

  const markerDocs = (opts.existingMarkerIds ?? []).map((id) => ({
    id,
    ref: { path: `reportingMonthly/202605/aggregationMarkers/${id}` },
  }));

  const batchOps: { type: string; path: string; data?: unknown }[] = [];
  const batchObj = {
    delete: jest.fn((ref: { path: string }) => {
      batchOps.push({ type: 'delete', path: ref.path });
    }),
    set: jest.fn((ref: { path: string }, data: unknown) => {
      batchOps.push({ type: 'set', path: ref.path, data });
    }),
    commit: jest.fn().mockResolvedValue(undefined),
  };

  const markerCollectionGetFn = jest.fn().mockResolvedValue({ docs: markerDocs });
  const markerDocFn = jest.fn((docId: string) => ({
    path: `reportingMonthly/202605/aggregationMarkers/${docId}`,
  }));
  const markerCollectionFn = jest.fn().mockReturnValue({
    get: markerCollectionGetFn,
    doc: markerDocFn,
  });

  const monthlyDocRef = {
    path: 'reportingMonthly/202605',
    collection: markerCollectionFn,
  };

  const entriesCollectionGetFn = jest.fn().mockResolvedValue({ docs: entryDocs });
  const entriesWhereFn = jest.fn().mockReturnValue({ get: entriesCollectionGetFn });

  const collectionFn = jest.fn((name: string) => {
    if (name === 'reportingEntries') {
      return { where: entriesWhereFn };
    }
    if (name === 'reportingMonthly') {
      return { doc: jest.fn().mockReturnValue(monthlyDocRef) };
    }
    throw new Error(`Unexpected collection: ${name}`);
  });

  const mockDb = {
    collection: collectionFn,
    batch: jest.fn().mockReturnValue(batchObj),
  } as any;

  return {
    mockDb,
    batchObj,
    batchOps,
    entriesWhereFn,
    markerCollectionGetFn,
  };
}

describe('rebuildReportingMonthly', () => {
  it('3 entries: produces correct totals and recreates markers', async () => {
    const entries: ReportingEntry[] = [
      makeMockEntry({
        entryId: 'bill_001_settle_1',
        categoryBreakdown: { items: { amountIncl: 3000 } },
        paymentBreakdown: { cash: 3000 },
        categoryPaymentMatrix: { items_cash: 3000 },
      }),
      makeMockEntry({
        entryId: 'bill_002_settle_1',
        billId: 'bill_002',
        categoryBreakdown: { items: { amountIncl: 2000 }, extraCost: { amountIncl: 500 } },
        paymentBreakdown: { cash: 1500, credit_card: 1000 },
        categoryPaymentMatrix: { items_cash: 1500, extraCost_credit_card: 500, items_credit_card: 500 },
      }),
      makeMockEntry({
        entryId: 'bill_003_cashAction_adj1',
        billId: 'bill_003',
        entryType: 'cashAction',
        categoryBreakdown: { items: { amountIncl: -500 } },
        paymentBreakdown: { cash: -500 },
        categoryPaymentMatrix: { items_cash: -500 },
      }),
    ];

    const mocks = buildMockDb({
      entries,
      existingMarkerIds: ['entries_bill_001_settle_1', 'entries_bill_002_settle_1'],
    });

    const result = await rebuildReportingMonthly(mocks.mockDb, '202605');

    expect(result.monthKey).toBe('202605');
    expect(result.totalEntriesProcessed).toBe(3);
    expect(result.totalAmountIncl).toBe(5000); // 3000 + 2500 - 500

    // Old markers deleted
    const deletes = mocks.batchOps.filter((op) => op.type === 'delete');
    expect(deletes).toHaveLength(2);

    // Monthly doc set
    const sets = mocks.batchOps.filter((op) => op.type === 'set');
    const monthlySet = sets.find((op) => op.path === 'reportingMonthly/202605');
    expect(monthlySet).toBeDefined();
    expect((monthlySet!.data as any).totalAmountIncl).toBe(5000);
    expect((monthlySet!.data as any).categoryBreakdown.items.amountIncl).toBe(4500);
    expect((monthlySet!.data as any).categoryBreakdown.extraCost.amountIncl).toBe(500);
    expect((monthlySet!.data as any).paymentMethodBreakdown.cash).toBe(4000);
    expect((monthlySet!.data as any).paymentMethodBreakdown.credit_card).toBe(1000);

    // New markers created (3 entries)
    const markerSets = sets.filter((op) =>
      op.path.includes('aggregationMarkers'),
    );
    expect(markerSets).toHaveLength(3);

    // Phase 1: delete old markers (1 batch), Phase 2: set monthly + new markers (1 batch)
    expect(mocks.batchObj.commit).toHaveBeenCalledTimes(2);
  });

  it('0 entries: produces empty monthly doc', async () => {
    const mocks = buildMockDb({ entries: [], existingMarkerIds: [] });

    const result = await rebuildReportingMonthly(mocks.mockDb, '202605');

    expect(result.totalEntriesProcessed).toBe(0);
    expect(result.totalAmountIncl).toBe(0);

    const sets = mocks.batchOps.filter((op) => op.type === 'set');
    const monthlySet = sets.find((op) => op.path === 'reportingMonthly/202605');
    expect(monthlySet).toBeDefined();
    expect((monthlySet!.data as any).totalAmountIncl).toBe(0);
    expect((monthlySet!.data as any).categoryBreakdown).toEqual({});
    expect((monthlySet!.data as any).paymentMethodBreakdown).toEqual({});
    expect((monthlySet!.data as any).categoryPaymentMatrix).toEqual({});

    const markerSets = sets.filter((op) => op.path.includes('aggregationMarkers'));
    expect(markerSets).toHaveLength(0);
  });

  it('existing markers are cleared before new ones are created', async () => {
    const entries: ReportingEntry[] = [
      makeMockEntry({ entryId: 'bill_001_settle_1' }),
    ];

    const mocks = buildMockDb({
      entries,
      existingMarkerIds: ['entries_old_1', 'entries_old_2', 'entries_old_3'],
    });

    await rebuildReportingMonthly(mocks.mockDb, '202605');

    const deletes = mocks.batchOps.filter((op) => op.type === 'delete');
    expect(deletes).toHaveLength(3);

    const sets = mocks.batchOps.filter(
      (op) => op.type === 'set' && op.path.includes('aggregationMarkers'),
    );
    expect(sets).toHaveLength(1);
    expect(sets[0].path).toContain('entries_bill_001_settle_1');

    // Deletes come before sets in the ops array
    const firstDeleteIdx = mocks.batchOps.findIndex((op) => op.type === 'delete');
    const lastDeleteIdx = mocks.batchOps.filter((op) => op.type === 'delete').length - 1;
    const firstMarkerSetIdx = mocks.batchOps.findIndex(
      (op) => op.type === 'set' && op.path.includes('aggregationMarkers'),
    );
    expect(firstDeleteIdx).toBeLessThan(firstMarkerSetIdx);
    expect(lastDeleteIdx).toBeLessThan(firstMarkerSetIdx);
  });
});
