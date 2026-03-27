import { onCall } from "firebase-functions/v2/https";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { logOpsError } from "../../../shared/logging/logOpsError";
import { processBillAnalyticsAtomically } from "../services/updateAnalyticsForBill";

/** storeMeta/currentBusinessDay のドキュメントパス */
const STORE_META_CURRENT_BUSINESS_DAY = "currentBusinessDay";

/**
 * 移管対象の営業日を storeMeta から取得する。
 * - currentBusinessDateKey が設定されていればそれを使用（営業中＝その日を移管対象とする）。
 * - null の場合は lastClosedBusinessDateKey を使用（閉店後＝直近に閉店した営業日を移管対象とする）。
 */
async function getBusinessDateFromStoreMeta(db: Firestore): Promise<string> {
  const docRef = db.collection("storeMeta").doc(STORE_META_CURRENT_BUSINESS_DAY);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new Error(
      "storeMeta/currentBusinessDay が存在しません。初期化スクリプトを実行してください。"
    );
  }

  const data = doc.data();
  if (!data) {
    throw new Error("storeMeta/currentBusinessDay のデータが取得できません。");
  }

  const currentBusinessDateKey = data.currentBusinessDateKey as string | null | undefined;
  const lastClosedBusinessDateKey = data.lastClosedBusinessDateKey as string | null | undefined;

  const businessDate =
    currentBusinessDateKey != null && typeof currentBusinessDateKey === "string" && currentBusinessDateKey.trim() !== ""
      ? currentBusinessDateKey.trim()
      : lastClosedBusinessDateKey != null && typeof lastClosedBusinessDateKey === "string" && lastClosedBusinessDateKey.trim() !== ""
        ? lastClosedBusinessDateKey.trim()
        : null;

  if (businessDate == null) {
    throw new Error(
      "storeMeta/currentBusinessDay に currentBusinessDateKey も lastClosedBusinessDateKey も設定されていません。営業日を特定できません。"
    );
  }

  return businessDate;
}

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
      });

      processedCount++;
      const pokerName = (billData.party?.pokerName as string) ?? '';
      if (pokerName.trim()) processedPokerNames.push(pokerName.trim());
    } catch (error) {
      logOpsError({
        message: `処理失敗: ${billId}`,
        failureType: "business",
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

export const migrateSettledBillsForBusinessDay = onCall(async (request) => {
  const db = getFirestore();

  try {
    logger.info("移管処理開始: storeMeta から営業日を取得します");

    const businessDate = await getBusinessDateFromStoreMeta(db);
    const result = await runMigrateSettledBillsForBusinessDay(db, businessDate);
    const { processedCount, skippedCount, month } = result;

    logger.info(`移管処理完了: 処理=${processedCount}件, スキップ=${skippedCount}件`);

    return {
      success: true,
      processedCount,
      skippedCount,
      month,
      businessDate,
      message:
        result.processedCount === 0 && result.skippedCount === 0
          ? '移管対象のドキュメントがありません'
          : `移管処理完了: 処理=${processedCount}件, スキップ=${skippedCount}件`,
    };
  } catch (error) {
    logOpsError({
      message: '移管処理エラー:',
      failureType: 'business',
      functionEntry: 'migrateSettledBillsForBusinessDay',
      operation: 'callable',
      cause: error,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
