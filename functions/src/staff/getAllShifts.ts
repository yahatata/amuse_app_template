import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

interface GetAllShiftsResponse {
  success: boolean;
  shifts?: any[];
  stats?: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
  error?: string;
}

/**
 * 全シフト取得関数（管理者用）
 * 
 * リクエスト:
 * - なし（認証済み管理者の全シフトを取得）
 * 
 * レスポンス:
 * - success: 成功フラグ
 * - shifts: シフト一覧（日付順）
 * - error: エラーメッセージ
 */
export const getAllShifts = onCall(
  async (request): Promise<GetAllShiftsResponse> => {
    // 認証チェック（一時的に無効化）
    // if (!request.auth) {
    //   throw new Error("Authentication required.");
    // }

    // const uid = request.auth.uid; // 未使用のためコメントアウト

    try {
      // 管理者権限の確認（簡易版 - 後で適切な管理者チェックに変更）
      // TODO: 管理者権限の適切な確認を実装
      
      // 全シフトを取得（日付順：早い日付から遅い日付）
      const shiftsRef = admin.firestore().collection("shifts");
      const q = shiftsRef.orderBy("date", "asc");

      const snapshot = await q.get();

      if (snapshot.empty) {
        return {
          success: true,
          shifts: []
        };
      }

      const shifts = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data
        };
      });

      // ステータス別に分類
      const pendingShifts = shifts.filter((shift: any) => shift.confirmed === null);
      const approvedShifts = shifts.filter((shift: any) => shift.confirmed === true);
      const rejectedShifts = shifts.filter((shift: any) => shift.confirmed === false);

      // 統計情報を追加
      const stats = {
        total: shifts.length,
        pending: pendingShifts.length,
        approved: approvedShifts.length,
        rejected: rejectedShifts.length
      };

      return {
        success: true,
        shifts: shifts,
        stats: stats
      };

    } catch (error) {
      console.error("全シフト取得エラー:", error);
      
      if (error instanceof Error) {
        throw new Error(`全シフトの取得に失敗しました: ${error.message}`);
      } else {
        throw new Error("全シフトの取得に失敗しました。");
      }
    }
  }
);
