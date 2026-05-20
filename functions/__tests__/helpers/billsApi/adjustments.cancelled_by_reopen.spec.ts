/**
 * services/adjustments.ts の reopen 用 helper の unit test。
 *
 * Step05 で追加した:
 * - buildAdjustmentCancelledByReopenPatch
 *
 * 仕様書 05_reopenと再会計.md §7.2 に対応。
 */

import { buildAdjustmentCancelledByReopenPatch } from '../../../src/domains/bills/services/adjustments';

describe('adjustments buildAdjustmentCancelledByReopenPatch', () => {
  it('adjustmentState=cancelled_by_reopen, cancelledAt, cancelledBy, cancelReason=reopen を返す', () => {
    const ts = { _seconds: 100, _nanoseconds: 0 };
    const patch = buildAdjustmentCancelledByReopenPatch({
      cancelledAt: ts,
      cancelledBy: 'user-1',
    });

    expect(patch).toEqual({
      adjustmentState: 'cancelled_by_reopen',
      cancelledAt: ts,
      cancelledBy: 'user-1',
      cancelReason: 'reopen',
    });
  });

  it('cancelledBy が null でも受け付ける', () => {
    const patch = buildAdjustmentCancelledByReopenPatch({
      cancelledAt: null,
      cancelledBy: null,
    });
    expect(patch.cancelledBy).toBeNull();
  });

  it('requiredActionRemainingIncl / adjustmentAmountIncl / lines[] 等は patch に含めない（履歴として維持）', () => {
    const patch = buildAdjustmentCancelledByReopenPatch({
      cancelledAt: null,
      cancelledBy: 'user-1',
    });
    expect(Object.keys(patch).sort()).toEqual(
      ['adjustmentState', 'cancelledAt', 'cancelledBy', 'cancelReason'].sort()
    );
  });
});
