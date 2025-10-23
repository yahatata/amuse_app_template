import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { resolveBusinessDate } from "./helpers";
import { addToMonthlyIndex } from "./addToMonthlyIndex";
import { addToDailySummary } from "./addToDailySummary";
import { addToByCategory } from "./addToByCategory";
import { addToByTemplateTournaments } from "./addToByTemplateTournaments";
import { addToByUser } from "./addToByUser";

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

    // 対象ドキュメントを取得
    const billsQuery = await db.collection('todaysBills')
      .where('status', '==', 'settled')
      .where('date', '==', businessDate)
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
      const billId = billDoc.id;
      const billData = billDoc.data();

      try {
        // 重複チェック
        const markerRef = db
          .collection('analyticsMonthly')
          .doc(month)
          .collection('aggregationMarkers')
          .doc(billId);

        const markerDoc = await markerRef.get();
        if (markerDoc.exists) {
          logger.info(`スキップ: ${billId} (既に処理済み)`);
          skippedCount++;
          continue;
        }

        // 必要なドキュメントを事前に読み取り
        const monthlyRef = db.collection('analyticsMonthly').doc(month);
        const dailyRef = db.collection('analyticsMonthly').doc(month).collection('days').doc(businessDate);
        const byCategoryRef = db.collection('analyticsMonthly').doc(month).collection('byCategory').doc('summary');
        const byUserRef = db.collection('analyticsMonthly').doc(month).collection('byUser').doc(billData.userId);
        
        // 事前読み取り
        const [monthlyDoc, dailyDoc, byCategoryDoc, byUserDoc] = await Promise.all([
          monthlyRef.get(),
          dailyRef.get(),
          byCategoryRef.get(),
          byUserRef.get()
        ]);

        // トーナメントテンプレート用の読み取り
        const tournaments = billData.tournaments || {};
        const templateRefs = [];
        for (const [, tournamentData] of Object.entries(tournaments)) {
          if (tournamentData && typeof tournamentData === 'object') {
            const templateName = (tournamentData as any).templateName;
            const templateId = (tournamentData as any).templateId;
            if (templateName) {
              // templateKeyを作成（templateIdを優先、なければtemplateNameをキー化）
              const templateKey = templateId || templateName.replace(/[^a-zA-Z0-9]/g, '_');
              const templateRef = db.collection('analyticsMonthly').doc(month)
                .collection('byTemplateTournaments').doc(templateKey);
              templateRefs.push(templateRef.get());
            }
          }
        }
        const templateDocs = await Promise.all(templateRefs);

        // トランザクションで処理
        await db.runTransaction(async (transaction) => {
          // 再度重複チェック（トランザクション内）
          const markerDocInTx = await transaction.get(markerRef);
          if (markerDocInTx.exists) {
            throw new Error(`重複処理: ${billId}`);
          }

          // 1. analyticsMonthly への加算蓄積（読み取り済みデータを使用）
          await addToMonthlyIndex(transaction, month, billData, businessDate, monthlyDoc);
          await addToDailySummary(transaction, month, businessDate, billData, dailyDoc);
          await addToByCategory(transaction, month, billData, byCategoryDoc);
          await addToByTemplateTournaments(transaction, month, businessDate, billData, templateDocs);
          await addToByUser(transaction, month, businessDate, billData, byUserDoc);

          // 2. settledBills への転記
          const settledBillsRef = db
            .collection('settledBills')
            .doc(businessDate.replace(/-/g, '')) // YYYY-MM-DD → YYYYMMDD
            .collection('bills')
            .doc(billId);

          transaction.set(settledBillsRef, {
            ...billData,
            migratedAt: admin.firestore.FieldValue.serverTimestamp(),
            originalBillId: billId,
          });

          // 3. マーカー作成
          transaction.set(markerRef, {
            billId,
            businessDate,
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });

        processedCount++;
        logger.info(`処理完了: ${billId}`);

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
