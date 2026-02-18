/**
 * Phase6 Step2/Step3: 1 bill の表示用金額をサブコレクションから算出する。
 * getUnsettledBillsForClose と closeStoreTerminal（UNSETTLED_MARK）で共有。
 */

import { getFirestore } from 'firebase-admin/firestore';

export async function computeDisplayAmount(
  db: ReturnType<typeof getFirestore>,
  billId: string
): Promise<number> {
  const billRef = db.collection('bills').doc(billId);

  const [extrasSnap, itemsSnap, sideGameChipsSnap, tournamentsSnap] = await Promise.all([
    billRef.collection('extras').get(),
    billRef.collection('items').get(),
    billRef.collection('sideGameChips').where('action', '==', 'purchase').get(),
    billRef.collection('tournaments').get(),
  ]);

  let extraCostMonetary = 0;
  for (const doc of extrasSnap.docs) {
    const data = doc.data();
    extraCostMonetary += (data.amountIncl as number | undefined) ?? 0;
  }

  let itemsMonetary = 0;
  for (const doc of itemsSnap.docs) {
    const data = doc.data();
    if (data.voided === true) continue;
    if (data.totalPriceIncl !== undefined) {
      itemsMonetary += (data.totalPriceIncl as number) ?? 0;
    } else {
      const price = (data.unitPriceIncl as number | undefined) ?? 0;
      const quantity = (data.quantity as number | undefined) ?? 0;
      itemsMonetary += price * quantity;
    }
  }

  let sideGameChipMonetary = 0;
  for (const doc of sideGameChipsSnap.docs) {
    const data = doc.data();
    sideGameChipMonetary += (data.amountIncl as number | undefined) ?? 0;
  }

  let tournamentsMonetary = 0;
  for (const doc of tournamentsSnap.docs) {
    const data = doc.data();
    const entryFeeIncl = (data.entryFeeIncl as number | undefined) ?? 0;
    const entryCount = (data.entryCount as number | undefined) ?? 0;
    const reentryFeeIncl = (data.reentryFeeIncl as number | undefined) ?? 0;
    const reentryCount = (data.reentryCount as number | undefined) ?? 0;
    const addonFeeIncl = (data.addonFeeIncl as number | undefined) ?? 0;
    const addonCount = (data.addonCount as number | undefined) ?? 0;
    tournamentsMonetary +=
      entryFeeIncl * entryCount + reentryFeeIncl * reentryCount + addonFeeIncl * addonCount;
  }

  return extraCostMonetary + itemsMonetary + sideGameChipMonetary + tournamentsMonetary;
}
