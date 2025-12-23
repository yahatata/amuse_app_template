import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

interface GetShiftRequestsRequest {
  status?: string; // pending, confirmed, declined, expired
}

interface GetShiftRequestsResponse {
  success: boolean;
  requests?: any[];
  message?: string;
  error?: string;
}

/**
 * 希望シフト要請一覧を取得する関数（管理者用）
 * 
 * リクエスト:
 * - status: フィルタするステータス（任意）
 * 
 * レスポンス:
 * - success: 成功フラグ
 * - requests: 要請一覧
 * - error: エラーメッセージ
 */
export const getShiftRequests = onCall(
  async (request): Promise<GetShiftRequestsResponse> => {
    // 認証チェック（一時的に無効化）
    // if (!request.auth) {
    //   throw new Error("Authentication required.");
    // }

    try {
      // 管理者権限の確認（簡易版 - 後で適切な管理者チェックに変更）
      // TODO: 管理者権限の適切な確認を実装

      const db = admin.firestore();
      const now = admin.firestore.Timestamp.now();
      
      // 全要請を取得
      const requestsRef = db.collection("shiftRequests");
      const snapshot = await requestsRef.orderBy("requestedAtJST", "desc").get();

      if (snapshot.empty) {
        return {
          success: true,
          requests: []
        };
      }

      // 期限切れをチェックして更新
      const batch = db.batch();
      const requests: any[] = [];
      let hasUpdates = false;

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const expiresAt = data.expiresAt as admin.firestore.Timestamp;
        
        // 期限切れチェック
        if (data.status === "pending" && expiresAt && expiresAt < now) {
          // 期限切れとして更新
          batch.update(doc.ref, {
            status: "expired",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          data.status = "expired";
          hasUpdates = true;
        }

        requests.push({
          id: doc.id,
          ...data,
        });
      }

      // 期限切れの更新をコミット
      if (hasUpdates) {
        await batch.commit();
      }

      // ステータスでフィルタリング
      const { status } = request.data as GetShiftRequestsRequest || {};
      const filteredRequests = status 
        ? requests.filter((req: any) => req.status === status)
        : requests;

      return {
        success: true,
        requests: filteredRequests
      };

    } catch (error) {
      console.error("希望シフト要請一覧取得エラー:", error);

      if (error instanceof Error) {
        throw new Error(`要請一覧の取得に失敗しました: ${error.message}`);
      } else {
        throw new Error("要請一覧の取得に失敗しました。");
      }
    }
  }
);

