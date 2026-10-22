/**
 * services/adjustments.ts の純粋関数 unit test。
 *
 * 仕様書 03_adjustments管理.md §8 / §13 / §15 / §16.3 に対応する。
 * Firestore に依存しないので Emulator 不要。
 */

import {
  applyOppositeDirectionOffset,
  assertSingleSidedRemaining,
  buildAdjustmentDoc,
  signedAmountFromDirection,
  summarizeRemainingByDirection,
  validateAdjustmentInput,
  validateLines,
} from '../../../src/domains/bills/services/adjustments';

describe('services/adjustments', () => {
  describe('validateAdjustmentInput', () => {
    it('current-scope の adjustmentType を全て受理する', () => {
      expect(() =>
        validateAdjustmentInput({ adjustmentType: 'decrease_refund_pending', adjustmentAmountIncl: 1 })
      ).not.toThrow();
      expect(() =>
        validateAdjustmentInput({ adjustmentType: 'decrease_refunded', adjustmentAmountIncl: 1 })
      ).not.toThrow();
      expect(() =>
        validateAdjustmentInput({ adjustmentType: 'increase_collection_pending', adjustmentAmountIncl: 1 })
      ).not.toThrow();
      expect(() =>
        validateAdjustmentInput({ adjustmentType: 'increase_collected', adjustmentAmountIncl: 1 })
      ).not.toThrow();
    });

    it('未対応の adjustmentType を弾く', () => {
      expect(() =>
        validateAdjustmentInput({
          adjustmentType: 'totally_unknown' as any,
          adjustmentAmountIncl: 1,
        })
      ).toThrow(/not in current-scope/);
    });

    it('amountIncl <= 0 を弾く', () => {
      expect(() =>
        validateAdjustmentInput({
          adjustmentType: 'decrease_refund_pending',
          adjustmentAmountIncl: 0,
        })
      ).toThrow(/must be > 0/);
      expect(() =>
        validateAdjustmentInput({
          adjustmentType: 'decrease_refund_pending',
          adjustmentAmountIncl: -100,
        })
      ).toThrow(/must be > 0/);
    });

    it('amountIncl が NaN / Infinity を弾く', () => {
      expect(() =>
        validateAdjustmentInput({
          adjustmentType: 'decrease_refund_pending',
          adjustmentAmountIncl: Number.NaN,
        })
      ).toThrow(/finite/);
      expect(() =>
        validateAdjustmentInput({
          adjustmentType: 'decrease_refund_pending',
          adjustmentAmountIncl: Number.POSITIVE_INFINITY,
        })
      ).toThrow(/finite/);
    });
  });

  describe('validateLines', () => {
    it('空 lines を弾く（line-less は不可）', () => {
      expect(() =>
        validateLines({
          lines: [],
          direction: 'decrease',
          adjustmentAmountIncl: 1000,
        })
      ).toThrow(/at least 1 entry/);
    });

    it('decrease 方向で sum(amountInclDelta) = -adjustmentAmountIncl のとき OK', () => {
      expect(() =>
        validateLines({
          lines: [
            {
              lineNo: 1,
              targetCategory: 'item',
              targetId: null,
              targetName: 'apple',
              operationType: 'sale',
              qtyDelta: -1,
              amountInclDelta: -1000,
            },
          ],
          direction: 'decrease',
          adjustmentAmountIncl: 1000,
        })
      ).not.toThrow();
    });

    it('increase 方向で sum(amountInclDelta) = +adjustmentAmountIncl のとき OK', () => {
      expect(() =>
        validateLines({
          lines: [
            {
              lineNo: 1,
              targetCategory: 'item',
              targetId: null,
              targetName: 'apple',
              operationType: 'sale',
              qtyDelta: 1,
              amountInclDelta: 1000,
            },
          ],
          direction: 'increase',
          adjustmentAmountIncl: 1000,
        })
      ).not.toThrow();
    });

    it('sum mismatch を弾く', () => {
      expect(() =>
        validateLines({
          lines: [
            {
              lineNo: 1,
              targetCategory: 'item',
              targetId: null,
              targetName: 'apple',
              operationType: 'sale',
              qtyDelta: -1,
              amountInclDelta: -800,
            },
          ],
          direction: 'decrease',
          adjustmentAmountIncl: 1000,
        })
      ).toThrow(/sum\(lines/);
    });

    it('amountInclDelta の符号が direction と一致しない line を弾く', () => {
      expect(() =>
        validateLines({
          lines: [
            {
              lineNo: 1,
              targetCategory: 'item',
              targetId: null,
              targetName: 'apple',
              operationType: 'sale',
              qtyDelta: -1,
              amountInclDelta: 1000, // direction=decrease なのに正
            },
          ],
          direction: 'decrease',
          adjustmentAmountIncl: 1000,
        })
      ).toThrow(/sign must match adjustmentDirection/);
    });

    it('qtyDelta の符号が direction と一致しない line を弾く', () => {
      expect(() =>
        validateLines({
          lines: [
            {
              lineNo: 1,
              targetCategory: 'item',
              targetId: null,
              targetName: 'apple',
              operationType: 'sale',
              qtyDelta: 1, // direction=decrease なのに正
              amountInclDelta: -1000,
            },
          ],
          direction: 'decrease',
          adjustmentAmountIncl: 1000,
        })
      ).toThrow(/qtyDelta sign must match/);
    });

    it('tournament line で targetId が無いと弾く', () => {
      expect(() =>
        validateLines({
          lines: [
            {
              lineNo: 1,
              targetCategory: 'tournament',
              targetId: null,
              targetName: 'tour-A',
              operationType: 'entry',
              qtyDelta: 1,
              amountInclDelta: 1000,
            },
          ],
          direction: 'increase',
          adjustmentAmountIncl: 1000,
        })
      ).toThrow(/tournament line requires targetId/);
    });

    it('tournament line に entry/reentry/addon 以外の operationType を弾く', () => {
      expect(() =>
        validateLines({
          lines: [
            {
              lineNo: 1,
              targetCategory: 'tournament',
              targetId: 'tpl-A',
              targetName: 'tour-A',
              operationType: 'sale' as any,
              qtyDelta: 1,
              amountInclDelta: 1000,
            },
          ],
          direction: 'increase',
          adjustmentAmountIncl: 1000,
        })
      ).toThrow(/operationType .* is not allowed for targetCategory/);
    });

    it('item line に sale 以外の operationType を弾く', () => {
      expect(() =>
        validateLines({
          lines: [
            {
              lineNo: 1,
              targetCategory: 'item',
              targetId: null,
              targetName: 'apple',
              operationType: 'entry' as any,
              qtyDelta: 1,
              amountInclDelta: 1000,
            },
          ],
          direction: 'increase',
          adjustmentAmountIncl: 1000,
        })
      ).toThrow(/operationType .* is not allowed for targetCategory/);
    });

    it('複数 line の合算で一致するとき OK', () => {
      expect(() =>
        validateLines({
          lines: [
            {
              lineNo: 1,
              targetCategory: 'item',
              targetId: null,
              targetName: 'apple',
              operationType: 'sale',
              qtyDelta: 1,
              amountInclDelta: 600,
            },
            {
              lineNo: 2,
              targetCategory: 'extra',
              targetId: null,
              targetName: 'late-fee',
              operationType: 'extra',
              qtyDelta: 1,
              amountInclDelta: 400,
            },
          ],
          direction: 'increase',
          adjustmentAmountIncl: 1000,
        })
      ).not.toThrow();
    });
  });

  describe('buildAdjustmentDoc', () => {
    it('decrease_refund_pending で初期 remaining = adjustmentAmountIncl, state = effective', () => {
      const doc = buildAdjustmentDoc({
        sequenceNo: 1,
        adjustmentType: 'decrease_refund_pending',
        adjustmentAmountIncl: 1000,
        createdAt: new Date('2026-05-09T00:00:00Z'),
        createdBy: 'uid-A',
        note: 'memo',
        lines: [
          {
            lineNo: 1,
            targetCategory: 'item',
            targetId: null,
            targetName: 'apple',
            operationType: 'sale',
            qtyDelta: -1,
            amountInclDelta: -1000,
          },
        ],
      });
      expect(doc).toMatchObject({
        sequenceNo: 1,
        adjustmentType: 'decrease_refund_pending',
        adjustmentDirection: 'decrease',
        adjustmentAmountIncl: 1000,
        cashActionTypeAtCreation: 'refund',
        cashActionHandledAtCreation: false,
        adjustmentState: 'effective',
        requiredActionRemainingIncl: 1000,
        createdBy: 'uid-A',
        note: 'memo',
        supersededByAdjustmentId: null,
      });
      expect(doc.lines).toHaveLength(1);
    });

    it('decrease_refunded でも state は effective、remaining = amount（immediate cashAction 適用前）', () => {
      const doc = buildAdjustmentDoc({
        sequenceNo: 2,
        adjustmentType: 'decrease_refunded',
        adjustmentAmountIncl: 500,
        createdAt: new Date('2026-05-09T00:00:00Z'),
        createdBy: null,
        lines: [
          {
            lineNo: 1,
            targetCategory: 'item',
            targetId: null,
            targetName: 'apple',
            operationType: 'sale',
            qtyDelta: -1,
            amountInclDelta: -500,
          },
        ],
      });
      expect(doc).toMatchObject({
        adjustmentDirection: 'decrease',
        cashActionTypeAtCreation: 'refund',
        cashActionHandledAtCreation: true,
        adjustmentState: 'effective',
        requiredActionRemainingIncl: 500,
      });
    });

    it('increase_collection_pending', () => {
      const doc = buildAdjustmentDoc({
        sequenceNo: 3,
        adjustmentType: 'increase_collection_pending',
        adjustmentAmountIncl: 200,
        createdAt: new Date('2026-05-09T00:00:00Z'),
        createdBy: 'uid-B',
        lines: [
          {
            lineNo: 1,
            targetCategory: 'extra',
            targetId: null,
            targetName: 'late-fee',
            operationType: 'extra',
            qtyDelta: 1,
            amountInclDelta: 200,
          },
        ],
      });
      expect(doc).toMatchObject({
        adjustmentDirection: 'increase',
        cashActionTypeAtCreation: 'collection',
        cashActionHandledAtCreation: false,
        adjustmentState: 'effective',
        requiredActionRemainingIncl: 200,
      });
    });

    it('increase_collected', () => {
      const doc = buildAdjustmentDoc({
        sequenceNo: 4,
        adjustmentType: 'increase_collected',
        adjustmentAmountIncl: 700,
        createdAt: new Date('2026-05-09T00:00:00Z'),
        createdBy: 'uid-B',
        lines: [
          {
            lineNo: 1,
            targetCategory: 'tournament',
            targetId: 'tpl-A',
            targetName: 'tour-A',
            operationType: 'addon',
            qtyDelta: 1,
            amountInclDelta: 700,
          },
        ],
      });
      expect(doc).toMatchObject({
        adjustmentDirection: 'increase',
        cashActionTypeAtCreation: 'collection',
        cashActionHandledAtCreation: true,
      });
    });

    it('note 省略時は空文字、line.note 省略時も空文字で正規化', () => {
      const doc = buildAdjustmentDoc({
        sequenceNo: 5,
        adjustmentType: 'decrease_refund_pending',
        adjustmentAmountIncl: 100,
        createdAt: new Date(),
        createdBy: null,
        lines: [
          {
            lineNo: 1,
            targetCategory: 'item',
            targetId: null,
            targetName: 'apple',
            operationType: 'sale',
            qtyDelta: -1,
            amountInclDelta: -100,
          },
        ],
      });
      expect(doc.note).toBe('');
      expect(doc.lines[0].note).toBe('');
    });

    it('lineNo 未指定時は 1-based に自動採番される', () => {
      const doc = buildAdjustmentDoc({
        sequenceNo: 6,
        adjustmentType: 'increase_collection_pending',
        adjustmentAmountIncl: 300,
        createdAt: new Date(),
        createdBy: null,
        lines: [
          {
            targetCategory: 'item',
            targetId: null,
            targetName: 'apple',
            operationType: 'sale',
            qtyDelta: 1,
            amountInclDelta: 100,
          } as any,
          {
            targetCategory: 'item',
            targetId: null,
            targetName: 'banana',
            operationType: 'sale',
            qtyDelta: 1,
            amountInclDelta: 200,
          } as any,
        ],
      });
      expect(doc.lines.map((line) => line.lineNo)).toEqual([1, 2]);
    });
  });

  describe('applyOppositeDirectionOffset', () => {
    it('refund 1000 既存 → collection 1500 新規 で collection 残 500（仕様書 §15.4）', () => {
      const result = applyOppositeDirectionOffset({
        existingAdjustments: [
          {
            adjustmentId: 'adj-1',
            sequenceNo: 1,
            adjustmentDirection: 'decrease',
            adjustmentState: 'effective',
            requiredActionRemainingIncl: 1000,
          },
        ],
        newDirection: 'increase',
        newRemaining: 1500,
      });
      expect(result.patches.get('adj-1')).toEqual({
        adjustmentState: 'completed_by_offset',
        requiredActionRemainingIncl: 0,
      });
      expect(result.newAdjustmentRemaining).toBe(500);
      expect(result.newAdjustmentState).toBe('effective');
    });

    it('完全相殺で両 adjustment が 0 になる', () => {
      const result = applyOppositeDirectionOffset({
        existingAdjustments: [
          {
            adjustmentId: 'adj-1',
            sequenceNo: 1,
            adjustmentDirection: 'decrease',
            adjustmentState: 'effective',
            requiredActionRemainingIncl: 1000,
          },
        ],
        newDirection: 'increase',
        newRemaining: 1000,
      });
      expect(result.patches.get('adj-1')).toEqual({
        adjustmentState: 'completed_by_offset',
        requiredActionRemainingIncl: 0,
      });
      expect(result.newAdjustmentRemaining).toBe(0);
      expect(result.newAdjustmentState).toBe('completed_by_offset');
    });

    it('既存より新規が小さければ新規が消え、既存に部分残が残る（state は effective のまま）', () => {
      const result = applyOppositeDirectionOffset({
        existingAdjustments: [
          {
            adjustmentId: 'adj-1',
            sequenceNo: 1,
            adjustmentDirection: 'decrease',
            adjustmentState: 'effective',
            requiredActionRemainingIncl: 1500,
          },
        ],
        newDirection: 'increase',
        newRemaining: 500,
      });
      const patch = result.patches.get('adj-1');
      expect(patch?.requiredActionRemainingIncl).toBe(1000);
      expect(patch?.adjustmentState).toBeUndefined();
      expect(result.newAdjustmentRemaining).toBe(0);
      expect(result.newAdjustmentState).toBe('completed_by_offset');
    });

    it('同方向のみ存在の場合は何もしない', () => {
      const result = applyOppositeDirectionOffset({
        existingAdjustments: [
          {
            adjustmentId: 'adj-1',
            sequenceNo: 1,
            adjustmentDirection: 'increase',
            adjustmentState: 'effective',
            requiredActionRemainingIncl: 800,
          },
        ],
        newDirection: 'increase',
        newRemaining: 200,
      });
      expect(result.patches.size).toBe(0);
      expect(result.newAdjustmentRemaining).toBe(200);
      expect(result.newAdjustmentState).toBe('effective');
    });

    it('completed_by_offset / completed_by_cash_action / cancelled_by_reopen は対象外', () => {
      const result = applyOppositeDirectionOffset({
        existingAdjustments: [
          {
            adjustmentId: 'adj-already-offset',
            sequenceNo: 1,
            adjustmentDirection: 'decrease',
            adjustmentState: 'completed_by_offset',
            requiredActionRemainingIncl: 0,
          },
          {
            adjustmentId: 'adj-paid',
            sequenceNo: 2,
            adjustmentDirection: 'decrease',
            adjustmentState: 'completed_by_cash_action',
            requiredActionRemainingIncl: 0,
          },
          {
            adjustmentId: 'adj-reopened',
            sequenceNo: 3,
            adjustmentDirection: 'decrease',
            adjustmentState: 'cancelled_by_reopen',
            requiredActionRemainingIncl: 500,
          },
        ],
        newDirection: 'increase',
        newRemaining: 700,
      });
      expect(result.patches.size).toBe(0);
      expect(result.newAdjustmentRemaining).toBe(700);
      expect(result.newAdjustmentState).toBe('effective');
    });

    it('複数の既存 adjustment を sequenceNo 昇順で消化する', () => {
      const result = applyOppositeDirectionOffset({
        existingAdjustments: [
          {
            adjustmentId: 'adj-2',
            sequenceNo: 2,
            adjustmentDirection: 'decrease',
            adjustmentState: 'effective',
            requiredActionRemainingIncl: 600,
          },
          {
            adjustmentId: 'adj-1',
            sequenceNo: 1,
            adjustmentDirection: 'decrease',
            adjustmentState: 'effective',
            requiredActionRemainingIncl: 400,
          },
        ],
        newDirection: 'increase',
        newRemaining: 700,
      });
      // 古い順（adj-1, adj-2）から消化されるので、adj-1 は完全相殺、adj-2 は 300 残
      expect(result.patches.get('adj-1')).toEqual({
        adjustmentState: 'completed_by_offset',
        requiredActionRemainingIncl: 0,
      });
      expect(result.patches.get('adj-2')?.requiredActionRemainingIncl).toBe(300);
      expect(result.patches.get('adj-2')?.adjustmentState).toBeUndefined();
      expect(result.newAdjustmentRemaining).toBe(0);
      expect(result.newAdjustmentState).toBe('completed_by_offset');
    });

    it('newRemaining = 0 で開始した場合は何もしない', () => {
      const result = applyOppositeDirectionOffset({
        existingAdjustments: [
          {
            adjustmentId: 'adj-1',
            sequenceNo: 1,
            adjustmentDirection: 'decrease',
            adjustmentState: 'effective',
            requiredActionRemainingIncl: 500,
          },
        ],
        newDirection: 'increase',
        newRemaining: 0,
      });
      expect(result.patches.size).toBe(0);
      expect(result.newAdjustmentRemaining).toBe(0);
      expect(result.newAdjustmentState).toBe('completed_by_offset');
    });
  });

  describe('summarizeRemainingByDirection', () => {
    it('effective only / direction 別に集計', () => {
      const summary = summarizeRemainingByDirection([
        {
          adjustmentDirection: 'decrease',
          adjustmentState: 'effective',
          requiredActionRemainingIncl: 1000,
        },
        {
          adjustmentDirection: 'decrease',
          adjustmentState: 'completed_by_cash_action',
          requiredActionRemainingIncl: 0,
        },
        {
          adjustmentDirection: 'increase',
          adjustmentState: 'effective',
          requiredActionRemainingIncl: 200,
        },
        {
          adjustmentDirection: 'increase',
          adjustmentState: 'cancelled_by_reopen',
          requiredActionRemainingIncl: 500,
        },
      ]);
      expect(summary).toEqual({
        refundRemainingTotal: 1000,
        collectionRemainingTotal: 200,
      });
    });
  });

  describe('assertSingleSidedRemaining', () => {
    it('片側のみは OK', () => {
      expect(() =>
        assertSingleSidedRemaining({ refundRemainingTotal: 1000, collectionRemainingTotal: 0 })
      ).not.toThrow();
      expect(() =>
        assertSingleSidedRemaining({ refundRemainingTotal: 0, collectionRemainingTotal: 500 })
      ).not.toThrow();
      expect(() =>
        assertSingleSidedRemaining({ refundRemainingTotal: 0, collectionRemainingTotal: 0 })
      ).not.toThrow();
    });

    it('両側 > 0 を弾く（仕様書 §16.3）', () => {
      expect(() =>
        assertSingleSidedRemaining({ refundRemainingTotal: 1, collectionRemainingTotal: 1 })
      ).toThrow(/invariant violation/);
    });
  });

  describe('signedAmountFromDirection', () => {
    it('decrease は負', () => {
      expect(signedAmountFromDirection('decrease', 100)).toBe(-100);
    });
    it('increase は正', () => {
      expect(signedAmountFromDirection('increase', 100)).toBe(100);
    });
  });
});
