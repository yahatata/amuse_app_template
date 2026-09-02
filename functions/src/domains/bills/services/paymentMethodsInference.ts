/**
 * paymentMethodsByCategory 関連ユーティリティ
 *
 * billsOnSettle トリガから切り出した pure 関数群。
 * テスト・再利用のために独立ファイルとする。
 */

export const NON_SPECIAL_METHODS = ['cash', 'credit_card', 'electronic_money'] as const;
export type BaseMethod = (typeof NON_SPECIAL_METHODS)[number];

export type PaymentMethodValue =
  | string
  | Array<{ method: string; amount: number }>;

/**
 * paymentTotals から selectedBaseMethod（最大金額の non-special 手段）を特定する。
 * non-special が存在しない場合は null を返す（全額ポイント払い等）。
 * 同額の場合は NON_SPECIAL_METHODS の先頭順（cash 優先）。
 */
export function resolveBaseMethod(
  paymentTotals: Record<string, number>,
): BaseMethod | null {
  let selected: BaseMethod | null = null;
  let maxAmount = 0;
  for (const method of NON_SPECIAL_METHODS) {
    const amount = paymentTotals[method] ?? 0;
    if (amount > maxAmount) {
      maxAmount = amount;
      selected = method;
    }
  }
  return selected;
}
