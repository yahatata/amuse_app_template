/**
 * services/settlementCycles.ts の reopen 用 helper の unit test。
 *
 * Step05 で追加した:
 * - buildReopenedCycleDocPatch
 *
 * 仕様書 05_reopenと再会計.md §7.1 に対応。
 */

import {
  buildInitialCycleDoc,
  buildReopenedCycleDocPatch,
} from '../../../src/domains/bills/services/settlementCycles';

describe('settlementCycles buildReopenedCycleDocPatch', () => {
  it('cycleState=reopened, closedAt, closedReason=reopen を返す', () => {
    const ts = { _seconds: 100, _nanoseconds: 0 };
    const patch = buildReopenedCycleDocPatch({ closedAt: ts });

    expect(patch).toEqual({
      cycleState: 'reopened',
      closedAt: ts,
      closedReason: 'reopen',
    });
  });

  it('settled / openedAt / settledAt 等は patch に含めない（既存値を維持する設計）', () => {
    const patch = buildReopenedCycleDocPatch({ closedAt: null });
    expect(Object.keys(patch).sort()).toEqual(
      ['cycleState', 'closedAt', 'closedReason'].sort()
    );
  });

  it('closedAt に null を渡すこともできる（unused 引数の柔軟性確認）', () => {
    const patch = buildReopenedCycleDocPatch({ closedAt: null });
    expect(patch.closedAt).toBeNull();
  });
});

describe('settlementCycles buildInitialCycleDoc with reopen', () => {
  it('openedReason=reopen, openedFromCycleNo=oldCycleNo で初期化できる', () => {
    const doc = buildInitialCycleDoc({
      cycleNo: 2,
      openedAt: null,
      openedBy: 'user-1',
      openedReason: 'reopen',
      openedFromCycleNo: 1,
    });

    expect(doc.cycleNo).toBe(2);
    expect(doc.cycleState).toBe('open');
    expect(doc.openedReason).toBe('reopen');
    expect(doc.openedFromCycleNo).toBe(1);
    expect(doc.openedBy).toBe('user-1');
    expect(doc.nextSequenceNo).toBe(1);
    expect(doc.baselineSummary).toBeNull();
    expect(doc.settledAt).toBeNull();
    expect(doc.settledBy).toBeNull();
    expect(doc.closedAt).toBeNull();
    expect(doc.closedReason).toBeNull();
  });
});
