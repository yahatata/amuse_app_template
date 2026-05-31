import { Firestore } from 'firebase-admin/firestore';

/**
 * 伝票サブコレクションからカテゴリ別金額を算出（会計・検証共通）
 */
export async function loadBillCategoryAmounts(
  db: Firestore,
  billId: string,
): Promise<Record<string, number>> {
  const billRef = db.collection('bills').doc(billId);
  const categoryAmounts: Record<string, number> = {};

  const extrasSnap = await billRef.collection('extras').get();
  categoryAmounts['extraCost'] = extrasSnap.docs.reduce(
    (sum, doc) => sum + (doc.data().amountIncl || 0),
    0,
  );

  const itemsSnap = await billRef.collection('items').get();
  categoryAmounts['items'] = itemsSnap.docs
    .filter((doc) => doc.data().voided !== true)
    .reduce((sum, doc) => sum + (doc.data().totalPriceIncl || 0), 0);

  const sideGameChipsSnap = await billRef.collection('sideGameChips').get();
  categoryAmounts['sideGameChip'] = sideGameChipsSnap.docs
    .filter((doc) => doc.data().action === 'purchase')
    .reduce((sum, doc) => sum + (doc.data().amountIncl || 0), 0);

  const tournamentsSnap = await billRef.collection('tournaments').get();
  categoryAmounts['tournaments'] = tournamentsSnap.docs.reduce((sum, doc) => {
    const data = doc.data();
    return (
      sum +
      (data.entryFeeIncl || 0) * (data.entryCount || 0) +
      (data.reentryFeeIncl || 0) * (data.reentryCount || 0) +
      (data.addonFeeIncl || 0) * (data.addonCount || 0)
    );
  }, 0);

  return categoryAmounts;
}
