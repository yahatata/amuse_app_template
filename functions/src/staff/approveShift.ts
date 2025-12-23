import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { sendLinePushMessage, formatDateToJapanese } from "../utils/lineMessaging";

interface ApproveShiftRequest {
  shiftId: string;
}

interface ApproveShiftResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * シフト承認関数（管理者用）
 * 
 * リクエスト:
 * - shiftId: 承認するシフトのID
 * 
 * レスポンス:
 * - success: 成功フラグ
 * - message: 成功メッセージ
 * - error: エラーメッセージ
 */
export const approveShift = onCall(
  async (request): Promise<ApproveShiftResponse> => {
    // 認証チェック（一時的に無効化）
    // if (!request.auth) {
    //   throw new Error("Authentication required.");
    // }

    // const uid = request.auth.uid;
    const { shiftId } = request.data as ApproveShiftRequest;

    if (!shiftId) {
      throw new Error("シフトIDが必要です。");
    }

    try {
      // 管理者権限の確認（簡易版 - 後で適切な管理者チェックに変更）
      // TODO: 管理者権限の適切な確認を実装
      
      // シフトの存在確認
      const shiftDoc = await admin.firestore()
        .collection("shifts")
        .doc(shiftId)
        .get();

      if (!shiftDoc.exists) {
        throw new Error("シフトが見つかりません。");
      }

      const shiftData = shiftDoc.data();
      if (shiftData?.confirmed !== null) {
        throw new Error("このシフトは既に処理済みです。");
      }

      // シフトを承認
      await admin.firestore()
        .collection("shifts")
        .doc(shiftId)
        .update({
          confirmed: true,
          approvedBy: 'admin', // 一時的に固定値
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      // LINE通知を送信（非同期、エラー時も処理は続行）
      const userId = shiftData?.userId;
      if (userId) {
        const date = shiftData?.date || '';
        const start = shiftData?.start || '';
        const end = shiftData?.end || '';
        
        const formattedDate = formatDateToJapanese(date);
        const message = `（承認）${formattedDate}　${start}〜${end}のシフト申請が承認されました。ミニアプリの確定シフトページから確認可能です。`;
        
        // 通知送信（エラー時もログのみで処理は続行）
        sendLinePushMessage(userId, message).catch((error) => {
          console.error("通知送信エラー（処理は完了）:", error);
        });
      } else {
        console.warn("シフト承認通知: userIdが見つかりません", { shiftId });
      }

      return {
        success: true,
        message: "シフトを承認しました。"
      };

    } catch (error) {
      console.error("シフト承認エラー:", error);
      
      if (error instanceof Error) {
        throw new Error(`シフトの承認に失敗しました: ${error.message}`);
      } else {
        throw new Error("シフトの承認に失敗しました。");
      }
    }
  }
);
