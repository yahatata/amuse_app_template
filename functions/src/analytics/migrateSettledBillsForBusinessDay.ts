import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { resolveBusinessDate } from "./helpers";
import { processBillAnalyticsAtomically } from "./updateAnalyticsForBill";

export const migrateSettledBillsForBusinessDay = onCall(async (request) => {
  const db = getFirestore();
  const { storeCloseHour } = request.data;

  try {
    logger.info(`移管処理開始: storeCloseHour=${storeCloseHour}`);

    // 営業日を計算（現在時刻ベース）
    const now = new Date();
    const businessDate = resolveBusinessDate(now, storeCloseHour);
    const month = businessDate.slice(0, 7); // YYYY-MM

    logger.info(`営業日: ${businessDate}, 月: ${month}`);

    // 対象ドキュメントを取得（bills コレクションから親docのみ参照）
    const billsQuery = await db.collection('bills')
      .where('status', '==', 'settled')
      .where('businessDate', '==', businessDate)
      .get();

    if (billsQuery.empty) {
      logger.info('移管対象のドキュメントがありません');
      return {
        success: true,
        processedCount: 0,
        skippedCount: 0,
        month,
        businessDate,
        message: '移管対象のドキュメントがありません',
      };
    }

    logger.info(`移管対象: ${billsQuery.docs.length}件`);

    let processedCount = 0;
    let skippedCount = 0;

    // 各ドキュメントを処理
    for (const billDoc of billsQuery.docs) {
      const billId = billDoc.id;  // ✅ billDoc.id は docId（bills コレクションのドキュメントID）
      const billData = billDoc.data();

      try {
        // オプション: トランザクション外で marker チェック（早期スキップ用、パフォーマンス向上）
        const markerRef = db
          .collection('analyticsMonthly')
          .doc(month)
          .collection('aggregationMarkers')
          .doc(billId);

        const markerDoc = await markerRef.get();
        if (markerDoc.exists) {
          logger.info(`スキップ: ${billId} (既に処理済み)`);
          skippedCount++;
          continue;  // 早期スキップ（最終的な正しさは processBillAnalyticsAtomically 内で担保）
        }

        logger.info('migrateSettledBillsForBusinessDay: starting analytics update', {
          billId,
          month,
          businessDate,
        });

        // 共通関数で analytics 更新（トランザクション内で marker チェック・作成）
        // runTransaction は共通関数内で実施されるため、ネストトランザクションにならない
        await processBillAnalyticsAtomically(db, {
          month,
          businessDate,
          billId,  // ✅ billId = docId として統一
          billData,
        });

        // ⚠️ settledBills への転記は廃止（両者で転記しない仕様に統一）
        // 転記が不要な理由:
        // - settledBills コレクションは既に利用されていない／必要がない
        // - enqueueSettlement は転記を行わないため、両者の動作を揃える

        processedCount++;
        logger.info('migrateSettledBillsForBusinessDay: analytics update completed', {
          billId,
          month,
          businessDate,
        });

      } catch (error) {
        logger.error(`処理失敗: ${billId}`, error);
        throw error;
      }
    }

    logger.info(`移管処理完了: 処理=${processedCount}件, スキップ=${skippedCount}件`);

    return {
      success: true,
      processedCount,
      skippedCount,
      month,
      businessDate,
      message: `移管処理完了: 処理=${processedCount}件, スキップ=${skippedCount}件`,
    };

  } catch (error) {
    logger.error('移管処理エラー:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
