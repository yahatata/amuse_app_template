/**
 * 仕様書 [04_仕様書/07_analyticsMonthly更新と日付帰属とline配賦.md] §13 / §14 / §15 / §16 と
 * [02_changeSpec.md §5.2.1] / [04_確認観点と確認方法.md §1.1] に基づく純粋関数 unit test。
 */

import { buildAdjustmentAnalyticsDelta } from '../../src/domains/analytics/services/aggregator/adjustmentDelta';
import type { AdjustmentLine } from '../../src/domains/bills/services/adjustments';

function makeLine(partial: Partial<AdjustmentLine> & Pick<AdjustmentLine, 'targetCategory' | 'amountInclDelta'>): AdjustmentLine {
  return {
    lineNo: partial.lineNo ?? 1,
    targetCategory: partial.targetCategory,
    targetId: partial.targetId ?? null,
    targetName: partial.targetName ?? '',
    operationType: partial.operationType ?? 'sale',
    qtyDelta: partial.qtyDelta ?? 0,
    amountInclDelta: partial.amountInclDelta,
    note: partial.note ?? '',
  };
}

describe('buildAdjustmentAnalyticsDelta', () => {
  describe('byCategory 配賦（仕様書 §13 / §14.1）', () => {
    it('1 line / item / amountInclDelta=-1000 → grossSales=-1000、items=-1000', () => {
      const delta = buildAdjustmentAnalyticsDelta({
        lines: [makeLine({ targetCategory: 'item', amountInclDelta: -1000, operationType: 'sale', targetName: 'Beer' })],
      });
      expect(delta.grossSales).toBe(-1000);
      expect(delta.byCategory).toEqual({ items: -1000, extraCost: 0, sideGameChip: 0, tournaments: 0 });
      expect(delta.byTemplateTournaments).toEqual([]);
    });

    it('1 line / extra / amountInclDelta=+500 → extraCost=+500', () => {
      const delta = buildAdjustmentAnalyticsDelta({
        lines: [makeLine({ targetCategory: 'extra', amountInclDelta: 500, operationType: 'extra', targetName: 'service' })],
      });
      expect(delta.grossSales).toBe(500);
      expect(delta.byCategory.extraCost).toBe(500);
      expect(delta.byCategory.items).toBe(0);
    });

    it('1 line / sideGameChip / amountInclDelta=-300 → sideGameChip=-300', () => {
      const delta = buildAdjustmentAnalyticsDelta({
        lines: [makeLine({ targetCategory: 'sideGameChip', amountInclDelta: -300, operationType: 'chip', targetName: 'chip' })],
      });
      expect(delta.byCategory.sideGameChip).toBe(-300);
    });

    it('複数 line 混在: items + extraCost + sideGameChip + tournament', () => {
      const delta = buildAdjustmentAnalyticsDelta({
        lines: [
          makeLine({ lineNo: 1, targetCategory: 'item', amountInclDelta: -200, operationType: 'sale', targetName: 'A' }),
          makeLine({ lineNo: 2, targetCategory: 'extra', amountInclDelta: -300, operationType: 'extra', targetName: 'B' }),
          makeLine({ lineNo: 3, targetCategory: 'sideGameChip', amountInclDelta: -100, operationType: 'chip', targetName: 'C' }),
          makeLine({
            lineNo: 4,
            targetCategory: 'tournament',
            targetId: 'tmpl-A',
            targetName: 'Daily',
            operationType: 'entry',
            qtyDelta: -1,
            amountInclDelta: -500,
          }),
        ],
      });
      expect(delta.grossSales).toBe(-1100);
      expect(delta.byCategory).toEqual({ items: -200, extraCost: -300, sideGameChip: -100, tournaments: -500 });
    });
  });

  describe('byTemplateTournaments 配賦（仕様書 §16）', () => {
    it('tournament + entry / qtyDelta=+1, amountInclDelta=+5000 → entryCount=1, entrySales=5000, totalSales=5000', () => {
      const delta = buildAdjustmentAnalyticsDelta({
        lines: [
          makeLine({
            targetCategory: 'tournament',
            targetId: 'tmpl-A',
            targetName: 'Daily',
            operationType: 'entry',
            qtyDelta: 1,
            amountInclDelta: 5000,
          }),
        ],
      });
      expect(delta.byTemplateTournaments).toHaveLength(1);
      expect(delta.byTemplateTournaments[0]).toEqual({
        templateKey: 'tmpl-A',
        templateName: 'Daily',
        entryCount: 1,
        entrySales: 5000,
        reentryCount: 0,
        reentrySales: 0,
        addonCount: 0,
        addonSales: 0,
        totalSales: 5000,
      });
    });

    it('tournament + reentry → reentryCount, reentrySales', () => {
      const delta = buildAdjustmentAnalyticsDelta({
        lines: [
          makeLine({
            targetCategory: 'tournament',
            targetId: 'tmpl-A',
            targetName: 'Daily',
            operationType: 'reentry',
            qtyDelta: 1,
            amountInclDelta: 3000,
          }),
        ],
      });
      expect(delta.byTemplateTournaments[0].reentryCount).toBe(1);
      expect(delta.byTemplateTournaments[0].reentrySales).toBe(3000);
      expect(delta.byTemplateTournaments[0].totalSales).toBe(3000);
    });

    it('tournament + addon / qtyDelta=+2, amountInclDelta=+4000 → addonCount=2, addonSales=4000', () => {
      const delta = buildAdjustmentAnalyticsDelta({
        lines: [
          makeLine({
            targetCategory: 'tournament',
            targetId: 'tmpl-B',
            targetName: 'Hyper',
            operationType: 'addon',
            qtyDelta: 2,
            amountInclDelta: 4000,
          }),
        ],
      });
      expect(delta.byTemplateTournaments[0]).toMatchObject({
        templateKey: 'tmpl-B',
        templateName: 'Hyper',
        addonCount: 2,
        addonSales: 4000,
        totalSales: 4000,
      });
    });

    it('複数 line / 同 template の entry + addon → 同 key にまとまる', () => {
      const delta = buildAdjustmentAnalyticsDelta({
        lines: [
          makeLine({
            lineNo: 1,
            targetCategory: 'tournament',
            targetId: 'tmpl-A',
            targetName: 'Daily',
            operationType: 'entry',
            qtyDelta: 1,
            amountInclDelta: 5000,
          }),
          makeLine({
            lineNo: 2,
            targetCategory: 'tournament',
            targetId: 'tmpl-A',
            targetName: 'Daily',
            operationType: 'addon',
            qtyDelta: 1,
            amountInclDelta: 1000,
          }),
        ],
      });
      expect(delta.byTemplateTournaments).toHaveLength(1);
      expect(delta.byTemplateTournaments[0]).toMatchObject({
        templateKey: 'tmpl-A',
        entryCount: 1,
        entrySales: 5000,
        addonCount: 1,
        addonSales: 1000,
        totalSales: 6000,
      });
    });

    it('複数 line / 異 template の tournament → key が分かれる', () => {
      const delta = buildAdjustmentAnalyticsDelta({
        lines: [
          makeLine({
            lineNo: 1,
            targetCategory: 'tournament',
            targetId: 'tmpl-A',
            targetName: 'Daily',
            operationType: 'entry',
            qtyDelta: 1,
            amountInclDelta: 5000,
          }),
          makeLine({
            lineNo: 2,
            targetCategory: 'tournament',
            targetId: 'tmpl-B',
            targetName: 'Hyper',
            operationType: 'entry',
            qtyDelta: 1,
            amountInclDelta: 3000,
          }),
        ],
      });
      expect(delta.byTemplateTournaments).toHaveLength(2);
      const keys = delta.byTemplateTournaments.map((t) => t.templateKey).sort();
      expect(keys).toEqual(['tmpl-A', 'tmpl-B']);
    });

    it('tournament line で targetId が空 → throw', () => {
      expect(() =>
        buildAdjustmentAnalyticsDelta({
          lines: [
            makeLine({
              targetCategory: 'tournament',
              targetId: null,
              targetName: 'Daily',
              operationType: 'entry',
              qtyDelta: 1,
              amountInclDelta: 5000,
            }),
          ],
        })
      ).toThrow(/targetId/);
    });
  });

  describe('userId 配賦（仕様書 §15）', () => {
    it('billUserId="u1" → delta.userId="u1"', () => {
      const delta = buildAdjustmentAnalyticsDelta({
        lines: [makeLine({ targetCategory: 'item', amountInclDelta: -100, operationType: 'sale', targetName: 'A' })],
        billUserId: 'u1',
      });
      expect(delta.userId).toBe('u1');
    });

    it('billUserId=null → delta.userId=null', () => {
      const delta = buildAdjustmentAnalyticsDelta({
        lines: [makeLine({ targetCategory: 'item', amountInclDelta: -100, operationType: 'sale', targetName: 'A' })],
        billUserId: null,
      });
      expect(delta.userId).toBeNull();
    });

    it('billUserId 未指定 → delta.userId=null', () => {
      const delta = buildAdjustmentAnalyticsDelta({
        lines: [makeLine({ targetCategory: 'item', amountInclDelta: -100, operationType: 'sale', targetName: 'A' })],
      });
      expect(delta.userId).toBeNull();
    });

    it('billUserId="" 空文字 → delta.userId=null', () => {
      const delta = buildAdjustmentAnalyticsDelta({
        lines: [makeLine({ targetCategory: 'item', amountInclDelta: -100, operationType: 'sale', targetName: 'A' })],
        billUserId: '',
      });
      expect(delta.userId).toBeNull();
    });
  });

  describe('複合ケース（仕様書 §14.1 grossSales = 全 line 合計）', () => {
    it('item -200 + extra -300 + tournament entry -500（同 template） → grossSales=-1000', () => {
      const delta = buildAdjustmentAnalyticsDelta({
        lines: [
          makeLine({ lineNo: 1, targetCategory: 'item', amountInclDelta: -200, operationType: 'sale', targetName: 'A' }),
          makeLine({ lineNo: 2, targetCategory: 'extra', amountInclDelta: -300, operationType: 'extra', targetName: 'B' }),
          makeLine({
            lineNo: 3,
            targetCategory: 'tournament',
            targetId: 'tmpl-A',
            targetName: 'Daily',
            operationType: 'entry',
            qtyDelta: -1,
            amountInclDelta: -500,
          }),
        ],
      });
      expect(delta.grossSales).toBe(-1000);
      expect(delta.byCategory).toEqual({ items: -200, extraCost: -300, sideGameChip: 0, tournaments: -500 });
      expect(delta.byTemplateTournaments[0].entryCount).toBe(-1);
      expect(delta.byTemplateTournaments[0].entrySales).toBe(-500);
    });
  });

  describe('境界ケース', () => {
    it('empty lines → grossSales=0、各 category 0、tournament 配列 empty', () => {
      const delta = buildAdjustmentAnalyticsDelta({ lines: [] });
      expect(delta.grossSales).toBe(0);
      expect(delta.byCategory).toEqual({ items: 0, extraCost: 0, sideGameChip: 0, tournaments: 0 });
      expect(delta.byTemplateTournaments).toEqual([]);
    });
  });
});
