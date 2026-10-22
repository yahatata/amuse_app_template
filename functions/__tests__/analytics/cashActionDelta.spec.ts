/**
 * 仕様書 [04_仕様書/07_analyticsMonthly更新と日付帰属とline配賦.md] §8.4 / §10.3 / §11 と
 * [02_changeSpec.md §5.2.2] / [04_確認観点と確認方法.md §1.2] に基づく純粋関数 unit test。
 */

import { buildCashActionAnalyticsDelta } from '../../src/domains/analytics/services/aggregator/cashActionDelta';

describe('buildCashActionAnalyticsDelta', () => {
  describe('collection（仕様書 §11 増額系 + 追加徴収完了）', () => {
    it('単一 method (cash 1000) → byPaymentMethod={cash:1000}', () => {
      const delta = buildCashActionAnalyticsDelta({
        cashActionType: 'collection',
        methodBreakdown: [{ method: 'cash', amountIncl: 1000 }],
      });
      expect(delta.byPaymentMethod).toEqual({ cash: 1000 });
    });

    it('複数 method (cash 600 + credit_card 400) → 両方 increment', () => {
      const delta = buildCashActionAnalyticsDelta({
        cashActionType: 'collection',
        methodBreakdown: [
          { method: 'cash', amountIncl: 600 },
          { method: 'credit_card', amountIncl: 400 },
        ],
      });
      expect(delta.byPaymentMethod).toEqual({ cash: 600, credit_card: 400 });
    });

    it('5 method 混在 → 全 method が出る', () => {
      const delta = buildCashActionAnalyticsDelta({
        cashActionType: 'collection',
        methodBreakdown: [
          { method: 'cash', amountIncl: 100 },
          { method: 'credit_card', amountIncl: 200 },
          { method: 'electronic_money', amountIncl: 300 },
          { method: 'qr', amountIncl: 400 },
          { method: 'bank_transfer', amountIncl: 500 },
        ],
      });
      expect(Object.keys(delta.byPaymentMethod).sort()).toEqual([
        'bank_transfer',
        'cash',
        'credit_card',
        'electronic_money',
        'qr',
      ]);
      expect(delta.byPaymentMethod.bank_transfer).toBe(500);
    });

    it('同 method が複数 entry → 合算される', () => {
      const delta = buildCashActionAnalyticsDelta({
        cashActionType: 'collection',
        methodBreakdown: [
          { method: 'cash', amountIncl: 300 },
          { method: 'cash', amountIncl: 200 },
        ],
      });
      expect(delta.byPaymentMethod).toEqual({ cash: 500 });
    });
  });

  describe('refund（仕様書 §8.4 paymentTotals 直接減らさない）', () => {
    it('refund + 単一 method → byPaymentMethod={}（空）', () => {
      const delta = buildCashActionAnalyticsDelta({
        cashActionType: 'refund',
        methodBreakdown: [{ method: 'cash', amountIncl: 1000 }],
      });
      expect(delta.byPaymentMethod).toEqual({});
    });

    it('refund + 複数 method → byPaymentMethod={}（空）', () => {
      const delta = buildCashActionAnalyticsDelta({
        cashActionType: 'refund',
        methodBreakdown: [
          { method: 'cash', amountIncl: 600 },
          { method: 'credit_card', amountIncl: 400 },
        ],
      });
      expect(delta.byPaymentMethod).toEqual({});
    });
  });

  describe('入力検証', () => {
    it('method 空文字 → throw', () => {
      expect(() =>
        buildCashActionAnalyticsDelta({
          cashActionType: 'collection',
          methodBreakdown: [{ method: '', amountIncl: 100 }],
        })
      ).toThrow(/non-empty string/);
    });

    it('amountIncl が NaN → throw', () => {
      expect(() =>
        buildCashActionAnalyticsDelta({
          cashActionType: 'collection',
          methodBreakdown: [{ method: 'cash', amountIncl: NaN }],
        })
      ).toThrow(/finite/);
    });
  });
});
