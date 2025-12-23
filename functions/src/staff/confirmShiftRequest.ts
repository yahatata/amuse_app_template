import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

interface ConfirmShiftRequestRequest {
  requestId: string;
}

interface ConfirmShiftRequestResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * 希望シフト要請を確認する関数（スタッフ用）
 * シフト申請ページへの遷移時に呼び出される
 * 
 * リクエスト:
 * - requestId: 要請ID
 * 
 * レスポンス:
 * - success: 成功フラグ
 * - message: 成功メッセージ
 * - error: エラーメッセージ
 */
export const confirmShiftRequest = onCall(
  async (request): Promise<ConfirmShiftRequestResponse> => {
    // 認証チェック
    if (!request.auth) {
      throw new Error("Authentication required.");
    }

    const staffId = request.auth.uid;
    const { requestId } = request.data as ConfirmShiftRequestRequest;

    if (!requestId) {
      throw new Error("要請IDが必要です。");
    }

    try {
      const db = admin.firestore();
      
      // 要請ドキュメントを取得
      const requestRef = db.collection("shiftRequests").doc(requestId);
      const requestDoc = await requestRef.get();

      if (!requestDoc.exists) {
        throw new Error("要請が見つかりません。");
      }

      const requestData = requestDoc.data()!;

      // スタッフIDの確認
      if (requestData.staffId !== staffId) {
        throw new Error("この要請を確認する権限がありません。");
      }

      // 既に処理済みかチェック
      if (requestData.status !== "pending") {
        // 既に確認済みの場合は成功として返す（重複呼び出しを許容）
        if (requestData.status === "confirmed") {
          return {
            success: true,
            message: "既に確認済みです。",
          };
        }
        throw new Error("この要請は既に処理済みです。");
      }

      // JST（日本時間）で日付を計算
      const now = new Date();
      const jstOffset = 9 * 60; // JST = UTC+9
      const jstDate = new Date(now.getTime() + jstOffset * 60000);
      const confirmedAt = admin.firestore.Timestamp.fromDate(jstDate);

      // 要請を確認済み状態に更新
      await requestRef.update({
        status: "confirmed",
        confirmedAt,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        message: "要請を確認しました。",
      };

    } catch (error) {
      console.error("希望シフト要請確認エラー:", error);

      if (error instanceof Error) {
        throw new Error(`要請の確認に失敗しました: ${error.message}`);
      } else {
        throw new Error("要請の確認に失敗しました。");
      }
    }
  }
);

