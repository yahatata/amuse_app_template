import { Firestore } from "firebase-admin/firestore";
import { logOpsError } from "../../../shared/logging/logOpsError";
import { processBillAnalyticsAtomically } from "../services/updateAnalyticsForBill";

/** Phase6 Step3: ターミナルから呼ぶ core。営業日を指定して移管を実行する。閉店完了ダイアログ表示用に processedPokerNames を返す。 */
export async function runMigrateSettledBillsForBusinessDay(
  db: Firestore,
  businessDate: string
): Promise<{
  processedCount: number;
  skippedCount: number;
  month: string;
  processedPokerNames: string[];
}> {
  const month = businessDate.slice(0, 7);
  const processedPokerNames: string[] = [];

  const billsQuery = await db
    .collection('bills')
    .where('status', '==', 'settled')
    .where('businessDate', '==', businessDate)
    .get();

  if (billsQuery.empty) {
    return { processedCount: 0, skippedCount: 0, month, processedPokerNames };
  }

  let processedCount = 0;
  let skippedCount = 0;

  for (const billDoc of billsQuery.docs) {
    const billId = billDoc.id;
    const billData = billDoc.data();

    try {
      const markerRef = db
        .collection('analyticsMonthly')
        .doc(month)
        .collection('aggregationMarkers')
        .doc(billId);

      const markerDoc = await markerRef.get();
      if (markerDoc.exists) {
        skippedCount++;
        continue;
      }

      await processBillAnalyticsAtomically(db, {
        month,
        businessDate,
        billId,
        billData,
        logInvocation: { functionEntry: 'migrateSettledBillsForBusinessDay' },
      });

      processedCount++;
      const pokerName = (billData.party?.pokerName as string) ?? '';
      if (pokerName.trim()) processedPokerNames.push(pokerName.trim());
    } catch (error) {
      logOpsError({
        message: `処理失敗: ${billId}`,
        functionEntry: "migrateSettledBillsForBusinessDay",
        operation: "runMigratePerBill",
        cause: error,
        context: { billId },
      });
      throw error;
    }
  }

  return { processedCount, skippedCount, month, processedPokerNames };
}
