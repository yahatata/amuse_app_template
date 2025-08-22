import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

interface GetShiftsResponse {
  success: boolean;
  shifts?: any[];
  error?: string;
}

/**
 * シフト一覧取得関数
 * 
 * リクエスト:
 * - なし（認証済みユーザーのシフトを取得）
 * 
 * レスポンス:
 * - success: 成功フラグ
 * - shifts: シフト一覧
 * - error: エラーメッセージ
 */
export const getShifts = onCall(
  async (request): Promise<GetShiftsResponse> => {
    // 認証チェック
    if (!request.auth) {
      throw new Error("Authentication required.");
    }

    const uid = request.auth.uid;

    try {
      // スタッフ情報の確認
      const staffDoc = await admin.firestore()
        .collection("staffs")
        .doc(uid)
        .get();

      if (!staffDoc.exists) {
        throw new Error("スタッフ情報が見つかりません。");
      }

      // 現在のスタッフのシフト申請を取得
      const shiftsRef = admin.firestore().collection("shifts");
      const q = shiftsRef
        .where("userId", "==", uid)
        .orderBy("date", "asc"); // 昇順に変更（インデックス要件に合わせる）

      const snapshot = await q.get();

      if (snapshot.empty) {
        return {
          success: true,
          shifts: []
        };
      }

      const shifts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // フロントエンド側で降順にソート（最新のシフトを先頭に）
      shifts.sort((a: any, b: any) => {
        if (a.date < b.date) return 1;
        if (a.date > b.date) return -1;
        return 0;
      });

      return {
        success: true,
        shifts: shifts
      };

    } catch (error) {
      console.error("シフト取得エラー:", error);
      
      if (error instanceof Error) {
        throw new Error(`シフト一覧の取得に失敗しました: ${error.message}`);
      } else {
        throw new Error("シフト一覧の取得に失敗しました。");
      }
    }
  }
);
