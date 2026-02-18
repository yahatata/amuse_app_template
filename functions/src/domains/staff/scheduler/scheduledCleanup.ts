import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

/**
 * 毎日午前2時に却下されたシフトを自動削除するスケジュール関数
 * 
 * スケジュール: 毎日午前2時（JST）
 * 保持期間: 却下後7日
 */
export const scheduledCleanup = onSchedule(
  {
    schedule: "0 17 * * *", // UTC 17:00 = JST 02:00
    timeZone: "Asia/Tokyo",
    retryCount: 3,
  },
  async (event) => {
    console.log("スケジュール削除開始:", new Date().toISOString());

    try {
      // 削除対象日時を計算（現在時刻から7日を引く）
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);

      console.log(`自動削除実行: 却下後7日経過したシフトを削除`);
      console.log(`削除対象日時: ${cutoffDate.toISOString()}`);

      // 却下されてから7日経過したシフトを検索
      const rejectedShiftsSnapshot = await admin.firestore()
        .collection("shifts")
        .where("confirmed", "==", false)
        .where("rejectedAt", "<=", cutoffDate)
        .get();

      if (rejectedShiftsSnapshot.empty) {
        console.log("削除対象の却下シフトはありません（却下後7日経過）。");
        return;
      }

      // バッチ削除の準備
      const batch = admin.firestore().batch();
      const shiftsToDelete: string[] = [];

      rejectedShiftsSnapshot.docs.forEach(doc => {
        const shiftData = doc.data();
        const rejectedAt = shiftData.rejectedAt?.toDate();
        const daysSinceRejection = Math.floor(
          (Date.now() - rejectedAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        console.log(`削除対象シフト: ${doc.id}, 日付: ${shiftData.date}, スタッフ: ${shiftData.staffsFullName}, 却下後${daysSinceRejection}日`);
        
        batch.delete(doc.ref);
        shiftsToDelete.push(doc.id);
      });

      // バッチ削除の実行
      await batch.commit();

      console.log(`${shiftsToDelete.length}件の却下シフトを自動削除しました`);

    } catch (error) {
      console.error("スケジュール削除エラー:", error);
      throw error; // スケジュール関数ではエラーを再スロー
    }
  }
);
