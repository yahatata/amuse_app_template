/**
 * services/parentSummary.ts の reopen 派生 helper の unit test。
 *
 * Step05 で追加した:
 * - buildReopenSummaryAfterReopen
 * - buildParentDocPatchForReopen
 *
 * 仕様書 05_reopenと再会計.md §7.3 / §7.4 に対応。
 */

import {
  buildDraftAccountingInput,
  buildInitialCurrentSummary,
  buildInitialOps,
  buildInitialPostSettlementState,
  buildInitialReopenSummary,
  buildParentDocPatchForReopen,
  buildReopenSummaryAfterReopen,
} from '../../../src/domains/bills/services/parentSummary';

describe('parentSummary buildReopenSummaryAfterReopen', () => {
  const baseExisting = {
    hasReopenHistory: false,
    reopenCount: 0,
    currentSettlementCycle: 1,
    latestSettledCycle: 1,
    lastReopenedAt: null,
    lastReopenedBy: null,
    lastResettledAt: null,
  };

  it('初回 reopen で hasReopenHistory=true, reopenCount=1, currentSettlementCycle=2', () => {
    const ts = { _seconds: 100, _nanoseconds: 0 };
    const result = buildReopenSummaryAfterReopen({
      existing: baseExisting,
      oldCycleNo: 1,
      reopenedAt: ts,
      reopenedBy: 'user-1',
    });

    expect(result.hasReopenHistory).toBe(true);
    expect(result.reopenCount).toBe(1);
    expect(result.currentSettlementCycle).toBe(2);
    expect(result.latestSettledCycle).toBe(1);
    expect(result.lastReopenedAt).toEqual(ts);
    expect(result.lastReopenedBy).toBe('user-1');
    expect(result.lastResettledAt).toBeNull();
  });

  it('2 回目 reopen で reopenCount=2, currentSettlementCycle=3', () => {
    const existing = {
      hasReopenHistory: true,
      reopenCount: 1,
      currentSettlementCycle: 2,
      latestSettledCycle: 2,
      lastReopenedAt: { _seconds: 50, _nanoseconds: 0 },
      lastReopenedBy: 'user-prev',
      lastResettledAt: { _seconds: 80, _nanoseconds: 0 },
    };
    const ts = { _seconds: 200, _nanoseconds: 0 };
    const result = buildReopenSummaryAfterReopen({
      existing,
      oldCycleNo: 2,
      reopenedAt: ts,
      reopenedBy: 'user-2',
    });

    expect(result.reopenCount).toBe(2);
    expect(result.currentSettlementCycle).toBe(3);
    expect(result.latestSettledCycle).toBe(2);
    expect(result.lastReopenedAt).toEqual(ts);
    expect(result.lastReopenedBy).toBe('user-2');
    expect(result.lastResettledAt).toEqual(existing.lastResettledAt);
  });

  it('latestSettledCycle は据え置き（仕様書 §7.4）', () => {
    const result = buildReopenSummaryAfterReopen({
      existing: { ...baseExisting, latestSettledCycle: 5 },
      oldCycleNo: 5,
      reopenedAt: null,
      reopenedBy: null,
    });
    expect(result.latestSettledCycle).toBe(5);
    expect(result.currentSettlementCycle).toBe(6);
  });

  it('reopenedBy が null でも受け付ける', () => {
    const result = buildReopenSummaryAfterReopen({
      existing: baseExisting,
      oldCycleNo: 1,
      reopenedAt: null,
      reopenedBy: null,
    });
    expect(result.lastReopenedBy).toBeNull();
  });

  it('existing が `buildInitialReopenSummary()` 由来でも整合的に処理される', () => {
    const initial = buildInitialReopenSummary();
    const result = buildReopenSummaryAfterReopen({
      existing: { ...initial, latestSettledCycle: 1 },
      oldCycleNo: 1,
      reopenedAt: null,
      reopenedBy: 'user-1',
    });
    expect(result.hasReopenHistory).toBe(true);
    expect(result.reopenCount).toBe(1);
    expect(result.currentSettlementCycle).toBe(2);
  });
});

describe('parentSummary buildParentDocPatchForReopen', () => {
  const baseExisting = buildInitialReopenSummary();

  it('status を open にする', () => {
    const patch = buildParentDocPatchForReopen({
      existingReopenSummary: { ...baseExisting, latestSettledCycle: 1 },
      oldCycleNo: 1,
      reopenedAt: null,
      reopenedBy: 'user-1',
    });
    expect(patch['status']).toBe('open');
  });

  it('currentSummary を初期値で reset する', () => {
    const patch = buildParentDocPatchForReopen({
      existingReopenSummary: { ...baseExisting, latestSettledCycle: 1 },
      oldCycleNo: 1,
      reopenedAt: null,
      reopenedBy: 'user-1',
    });
    expect(patch['currentSummary']).toEqual(buildInitialCurrentSummary());
  });

  it('postSettlementState を初期値で reset する（requiredActionType=none, requiredActionIncl=0）', () => {
    const patch = buildParentDocPatchForReopen({
      existingReopenSummary: { ...baseExisting, latestSettledCycle: 1 },
      oldCycleNo: 1,
      reopenedAt: null,
      reopenedBy: 'user-1',
    });
    expect(patch['postSettlementState']).toEqual(buildInitialPostSettlementState());
    const pss = patch['postSettlementState'] as { requiredActionType: string; requiredActionIncl: number };
    expect(pss.requiredActionType).toBe('none');
    expect(pss.requiredActionIncl).toBe(0);
  });

  it('ops を初期値で reset する', () => {
    const patch = buildParentDocPatchForReopen({
      existingReopenSummary: { ...baseExisting, latestSettledCycle: 1 },
      oldCycleNo: 1,
      reopenedAt: null,
      reopenedBy: 'user-1',
    });
    expect(patch['ops']).toEqual(buildInitialOps());
  });

  it('draftAccountingInput を初期値で reset する', () => {
    const patch = buildParentDocPatchForReopen({
      existingReopenSummary: { ...baseExisting, latestSettledCycle: 1 },
      oldCycleNo: 1,
      reopenedAt: null,
      reopenedBy: 'user-1',
    });
    expect(patch['draftAccountingInput']).toEqual(buildDraftAccountingInput());
  });

  it('meta.contentHash を null に reset する', () => {
    const patch = buildParentDocPatchForReopen({
      existingReopenSummary: { ...baseExisting, latestSettledCycle: 1 },
      oldCycleNo: 1,
      reopenedAt: null,
      reopenedBy: 'user-1',
    });
    expect(patch['meta.contentHash']).toBeNull();
  });

  it('reopenSummary を更新する', () => {
    const ts = { _seconds: 100, _nanoseconds: 0 };
    const patch = buildParentDocPatchForReopen({
      existingReopenSummary: { ...baseExisting, latestSettledCycle: 1 },
      oldCycleNo: 1,
      reopenedAt: ts,
      reopenedBy: 'user-1',
    });
    const rs = patch['reopenSummary'] as Record<string, unknown>;
    expect(rs.hasReopenHistory).toBe(true);
    expect(rs.reopenCount).toBe(1);
    expect(rs.currentSettlementCycle).toBe(2);
    expect(rs.latestSettledCycle).toBe(1);
    expect(rs.lastReopenedAt).toEqual(ts);
    expect(rs.lastReopenedBy).toBe('user-1');
  });

  it('patch に touch すべきでない field（requireSpecialAttention / closeSummary / amounts 等）が含まれない', () => {
    const patch = buildParentDocPatchForReopen({
      existingReopenSummary: { ...baseExisting, latestSettledCycle: 1 },
      oldCycleNo: 1,
      reopenedAt: null,
      reopenedBy: null,
    });
    expect(Object.keys(patch).sort()).toEqual(
      [
        'currentSummary',
        'draftAccountingInput',
        'meta.contentHash',
        'ops',
        'postSettlementState',
        'reopenSummary',
        'status',
      ].sort()
    );
  });

  it('複数回 reopen でも累積的に reopenCount が増える', () => {
    const existing = {
      hasReopenHistory: true,
      reopenCount: 3,
      currentSettlementCycle: 4,
      latestSettledCycle: 4,
      lastReopenedAt: null,
      lastReopenedBy: 'user-prev',
      lastResettledAt: null,
    };
    const patch = buildParentDocPatchForReopen({
      existingReopenSummary: existing,
      oldCycleNo: 4,
      reopenedAt: null,
      reopenedBy: 'user-now',
    });
    const rs = patch['reopenSummary'] as Record<string, unknown>;
    expect(rs.reopenCount).toBe(4);
    expect(rs.currentSettlementCycle).toBe(5);
    expect(rs.latestSettledCycle).toBe(4);
  });
});
