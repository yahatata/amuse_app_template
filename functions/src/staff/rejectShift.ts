import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

interface RejectShiftRequest {
  shiftId: string;
}

interface RejectShiftResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * シフト削除関数（管理者用）
 * 
 * リクエスト:
 * - shiftId: 削除するシフトのID
 * 
 * レスポンス:
 * - success: 成功フラグ
 * - message: 成功メッセージ
 * - error: エラーメッセージ
 */
export const rejectShift = onCall(
  async (request): Promise<RejectShiftResponse> => {
    // 認証チェック（一時的に無効化）
    // if (!request.auth) {
    //   throw new Error("Authentication required.");
    // }

    // const uid = request.auth.uid;
    const { shiftId } = request.data as RejectShiftRequest;

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

              // シフトを却下（データは保持）
      await admin.firestore()
        .collection("shifts")
        .doc(shiftId)
        .update({
          confirmed: false,
          rejectedBy: 'admin', // 一時的に固定値
          rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      return {
        success: true,
        message: "シフトを却下しました。"
      };

    } catch (error) {
      console.error("シフト却下エラー:", error);
      
      if (error instanceof Error) {
        throw new Error(`シフトの却下に失敗しました: ${error.message}`);
      } else {
        throw new Error("シフトの却下に失敗しました。");
      }
    }
  }
);
