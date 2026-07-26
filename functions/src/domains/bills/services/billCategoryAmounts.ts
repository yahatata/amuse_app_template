import { Firestore } from 'firebase-admin/firestore';
import { FunctionCustomError } from '../../../shared/logging/functionCustomError';

/**
 * items 1行の税込金額（会計・preview・settle 共通）
 *
 * 正本: `totalPriceIncl`（注文時 appendItem が unitPriceIncl * quantity で保存）
 * 欠損時のみ: unitPriceIncl * quantity にフォールバック（settle/getBillPreviewTotals と同式）
 */
export function itemLineAmountIncl(data: Record<string, unknown>): number {
  if (data.voided === true) {
    return 0;
  }
  if (data.totalPriceIncl !== undefined && data.totalPriceIncl !== null) {
    const total = Number(data.totalPriceIncl);
    return Number.isFinite(total) ? total : 0;
  }
  const unit = Number(data.unitPriceIncl ?? 0) || 0;
  const qty = Number(data.quantity ?? 0) || 0;
  return unit * qty;
}

/**
 * 伝票サブコレクションからカテゴリ別金額を算出（会計・検証共通）
 *
 * Flutter の getBillPreviewTotals カテゴリ monetary と同式であること。
 */
export async function loadBillCategoryAmounts(
  db: Firestore,
  billId: string,
): Promise<Record<string, number>> {
  const billRef = db.collection('bills').doc(billId);
  const categoryAmounts: Record<string, number> = {};

  const extrasSnap = await billRef.collection('extras').get();
  categoryAmounts['extraCost'] = extrasSnap.docs.reduce(
    (sum, doc) => sum + (Number(doc.data().amountIncl) || 0),
    0,
  );

  const itemsSnap = await billRef.collection('items').get();
  categoryAmounts['items'] = itemsSnap.docs.reduce(
    (sum, doc) => sum + itemLineAmountIncl(doc.data() as Record<string, unknown>),
    0,
  );

  const sideGameChipsSnap = await billRef.collection('sideGameChips').get();
  categoryAmounts['sideGameChip'] = sideGameChipsSnap.docs
    .filter((doc) => doc.data().action === 'purchase')
    .reduce((sum, doc) => sum + (Number(doc.data().amountIncl) || 0), 0);

  const tournamentsSnap = await billRef.collection('tournaments').get();
  categoryAmounts['tournaments'] = tournamentsSnap.docs.reduce((sum, doc) => {
    const data = doc.data();
    return (
      sum +
      (Number(data.entryFeeIncl) || 0) * (Number(data.entryCount) || 0) +
      (Number(data.reentryFeeIncl) || 0) * (Number(data.reentryCount) || 0) +
      (Number(data.addonFeeIncl) || 0) * (Number(data.addonCount) || 0)
    );
  }, 0);

  return categoryAmounts;
}

/** カテゴリ別合計（会計対象総額） */
export function sumCategoryAmounts(
  categoryAmounts: Record<string, number>,
): number {
  return Object.values(categoryAmounts).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

/**
 * 支払い合計（基準値）とカテゴリ請求合計の一致を強制する。
 */
export function assertPaymentTotalMatchesCategoryTotal(params: {
  categoryAmounts: Record<string, number>;
  paymentMethodsByAmount: Record<string, number>;
  billId?: string;
}): void {
  const categoryTotal = sumCategoryAmounts(params.categoryAmounts);
  const paymentTotal = Object.values(params.paymentMethodsByAmount).reduce(
    (sum, v) => sum + (Number(v) || 0),
    0,
  );
  if (paymentTotal !== categoryTotal) {
    throw new FunctionCustomError({
      errorKey: 'ACCOUNTING_PAYMENT_TOTAL_MISMATCH',
      message: `支払い総額とカテゴリ合計が一致しません。支払:${paymentTotal} / カテゴリ:${categoryTotal}`,
      context: {
        billId: params.billId,
        paymentTotal,
        categoryTotal,
      },
    });
  }
}
