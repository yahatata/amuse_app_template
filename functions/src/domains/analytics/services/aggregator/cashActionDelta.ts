/**
 * 仕様書 [04_仕様書/07_analyticsMonthly更新と日付帰属とline配賦.md] §8.4 / §10.3 / §11 に基づき、
 * cashAction の `methodBreakdown[]` から analyticsMonthly 更新用の純粋 delta を構築する。
 *
 * 設計方針（[02_changeSpec.md] §5.2.2）:
 * - Firestore に直接 write しない pure function
 * - `cashActionType === 'refund'` の場合は paymentTotals を直接減らさない（仕様書 §8.4）→ 空 delta を返す
 * - `cashActionType === 'collection'` の場合のみ `methodBreakdown[]` を method 別に集計
 */

export interface CashActionAnalyticsDelta {
  /** method ごとの increment 量（collection のみ非空、refund では空 object） */
  byPaymentMethod: Record<string, number>;
}

export function buildCashActionAnalyticsDelta(input: {
  cashActionType: 'collection' | 'refund';
  methodBreakdown: { method: string; amountIncl: number }[];
}): CashActionAnalyticsDelta {
  if (input.cashActionType === 'refund') {
    return { byPaymentMethod: {} };
  }

  const byPaymentMethod: Record<string, number> = {};
  for (const entry of input.methodBreakdown) {
    if (typeof entry.method !== 'string' || entry.method.length === 0) {
      throw new Error('buildCashActionAnalyticsDelta: methodBreakdown[].method must be a non-empty string');
    }
    if (typeof entry.amountIncl !== 'number' || !Number.isFinite(entry.amountIncl)) {
      throw new Error(
        `buildCashActionAnalyticsDelta: methodBreakdown[].amountIncl must be a finite number for method '${entry.method}'`
      );
    }
    byPaymentMethod[entry.method] = (byPaymentMethod[entry.method] ?? 0) + entry.amountIncl;
  }

  return { byPaymentMethod };
}
