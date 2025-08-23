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
    let uid: string;
    
    try {
      // 認証チェック（一時的に無効化）
      // if (!request.auth) {
      //   throw new Error("Authentication required.");
      // }

      // const uid = request.auth.uid;
      
      // request.dataがnullの場合の処理
      if (!request.data) {
        throw new Error("リクエストデータが空です。request.data: " + JSON.stringify(request.data));
      }
      
      const { userId } = request.data as { userId?: string };
      
      if (!userId) {
        throw new Error("ユーザーIDが必要です。受信データ: " + JSON.stringify(request.data));
      }
      
      uid = userId;
      
      // デバッグ: Firestore接続テスト
      const testDoc = await admin.firestore().collection("shifts").limit(1).get();
      console.log("Firestore接続テスト成功。ドキュメント数:", testDoc.size);
      
    } catch (error) {
      console.error("初期化エラー:", error);
      if (error instanceof Error) {
        throw new Error("初期化に失敗しました: " + error.message);
      } else {
        throw new Error("初期化に失敗しました。");
      }
    }
    


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
      // エラーの詳細情報をログ出力（Firebase Consoleで確認可能）
      console.error("シフト取得エラー:", error);
      
      if (error instanceof Error) {
        // エラーの詳細情報を含めて返す
        const errorMessage = `シフト一覧の取得に失敗しました: ${error.message}`;
        console.error("詳細エラーメッセージ:", errorMessage);
        throw new Error(errorMessage);
      } else {
        const errorMessage = "シフト一覧の取得に失敗しました。";
        console.error("不明なエラー:", error);
        throw new Error(errorMessage);
      }
    }
  }
);
