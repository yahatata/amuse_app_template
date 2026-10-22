/**
 * A-7 Phase 6: analytics 未知 method は cash へ落とさず停止する
 */

import {
  distributePaymentMethodsWithIssues,
} from '../../src/domains/analytics/services/helpers';

describe('A-7 Phase6 analytics unknown method', () => {
  it('pointC〜E と sideGameChip は既知として配賦される', () => {
    const result = distributePaymentMethodsWithIssues({
      pointC: 100,
      pointD: 200,
      pointE: 300,
      sideGameChip: 50,
    });
    expect(result.issues).toEqual([]);
    expect(result.paymentTotalsMap.get('pointC')).toBe(100);
    expect(result.paymentTotalsMap.get('pointD')).toBe(200);
    expect(result.paymentTotalsMap.get('pointE')).toBe(300);
    expect(result.paymentTotalsMap.get('sideGameChip')).toBe(50);
  });

  it('未知 method は Map に含めず UNKNOWN issue（cash 混入なし）', () => {
    const result = distributePaymentMethodsWithIssues({
      cash: 1000,
      bitcoin: 999,
    });
    expect(result.paymentTotalsMap.get('cash')).toBe(1000);
    expect(result.paymentTotalsMap.has('bitcoin')).toBe(false);
    expect(result.paymentTotalsMap.get('cash')).not.toBe(1999);
    expect(result.issues[0]?.kind).toBe('PAYMENT_TOTALS_UNKNOWN_METHODS');
  });
});
