/**
 * paymentMethodsByCategory 自動推論ユーティリティ
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

/**
 * calculatePaymentSplit の結果を paymentMethodsByCategory 形式に変換する。
 *
 * 変換ルール:
 *   - カテゴリの金額が 0 → スキップ
 *   - ポイントなし → selectedBaseMethod の文字列形式
 *   - ポイントあり（混在含む）→ 配列形式（ポイント先頭、baseMethod 末尾）
 */
export function buildPaymentMethodsByCategory(params: {
  categoryOrder: string[];
  billForSplit: Record<string, number>;
  splitCategoryBreakdown: Record<
    string,
    { pointsUsed: number; baseMethodAmount: number }
  >;
  usedPoints: Record<string, number>;
  pointPriority: string[];
  selectedBaseMethod: BaseMethod;
}): Record<string, PaymentMethodValue> {
  const {
    categoryOrder,
    billForSplit,
    splitCategoryBreakdown,
    usedPoints,
    pointPriority,
    selectedBaseMethod,
  } = params;

  const result: Record<string, PaymentMethodValue> = {};

  for (const category of categoryOrder) {
    const catAmount = billForSplit[category] ?? 0;
    if (catAmount <= 0) continue;

    const breakdown = splitCategoryBreakdown[category];
    if (!breakdown) continue;

    const { pointsUsed, baseMethodAmount } = breakdown;

    if (pointsUsed <= 0) {
      result[category] = selectedBaseMethod;
      continue;
    }

    // ポイントあり → 配列形式
    // pointPriority 順で pointsUsed 総量を按分する
    const splits: Array<{ method: string; amount: number }> = [];
    let remainingCategoryPoints = pointsUsed;

    for (const pointType of pointPriority) {
      if (remainingCategoryPoints <= 0) break;
      const totalUsedForPoint = usedPoints[pointType] ?? 0;
      if (totalUsedForPoint <= 0) continue;

      const usedHere = Math.min(remainingCategoryPoints, totalUsedForPoint);
      if (usedHere > 0) {
        splits.push({ method: pointType, amount: usedHere });
        remainingCategoryPoints -= usedHere;
      }
    }

    if (baseMethodAmount > 0) {
      splits.push({ method: selectedBaseMethod, amount: baseMethodAmount });
    }

    result[category] = splits;
  }

  return result;
}
