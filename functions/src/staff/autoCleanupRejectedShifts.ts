import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

interface AutoCleanupRejectedShiftsRequest {
  retentionDays?: number; // 保持日数（デフォルト7日）
}

interface AutoCleanupRejectedShiftsResponse {
  success: boolean;
  deletedCount: number;
  message?: string;
  error?: string;
}

/**
 * 却下されたシフト申請の自動削除関数
 * 
 * リクエスト:
 * - retentionDays: 却下後の保持日数（デフォルト7日）
 * 
 * レスポンス:
 * - success: 成功フラグ
 * - deletedCount: 削除されたシフト数
 * - message: 成功メッセージ
 * - error: エラーメッセージ
 */
export const autoCleanupRejectedShifts = onCall(
  async (request): Promise<AutoCleanupRejectedShiftsResponse> => {
    // 認証チェック（一時的に無効化）
    // if (!request.auth) {
    //   throw new Error("Authentication required.");
    // }

    const { retentionDays = 7 } = request.data as AutoCleanupRejectedShiftsRequest;

    if (retentionDays < 1 || retentionDays > 365) {
      throw new Error("保持日数は1日から365日の間で指定してください。");
    }

    try {
      // 削除対象日時を計算（現在時刻から保持日数を引く）
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      console.log(`自動削除実行: 却下後${retentionDays}日経過したシフトを削除`);
      console.log(`削除対象日時: ${cutoffDate.toISOString()}`);

      // 却下されてから指定日数経過したシフトを検索
      const rejectedShiftsSnapshot = await admin.firestore()
        .collection("shifts")
        .where("confirmed", "==", false)
        .where("rejectedAt", "<=", cutoffDate)
        .get();

      if (rejectedShiftsSnapshot.empty) {
        return {
          success: true,
          deletedCount: 0,
          message: `削除対象の却下シフトはありません（却下後${retentionDays}日経過）。`
        };
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

      return {
        success: true,
        deletedCount: shiftsToDelete.length,
        message: `${shiftsToDelete.length}件の却下シフトを自動削除しました（却下後${retentionDays}日経過）。`
      };

    } catch (error) {
      console.error("自動削除エラー:", error);
      
      if (error instanceof Error) {
        throw new Error(`却下シフトの自動削除に失敗しました: ${error.message}`);
      } else {
        throw new Error("却下シフトの自動削除に失敗しました。");
      }
    }
  }
);
