import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

interface CreateShiftRequest {
  date: string;
  start: string;
  end: string;
}

interface CreateShiftResponse {
  success: boolean;
  shiftId?: string;
  error?: string;
}

/**
 * シフト申請作成関数
 * 
 * リクエスト:
 * - date: シフト日付 (YYYY-MM-DD)
 * - start: 開始時刻 (HH:MM)
 * - end: 終了時刻 (HH:MM)
 * 
 * レスポンス:
 * - success: 成功フラグ
 * - shiftId: 作成されたシフトのID
 * - error: エラーメッセージ
 */
export const createShift = onCall(
  async (request): Promise<CreateShiftResponse> => {
    // 認証チェック
    if (!request.auth) {
      throw new Error("Authentication required.");
    }

    const uid = request.auth.uid;
    const { date, start, end }: CreateShiftRequest = request.data;

    // 入力バリデーション
    if (!date || !start || !end) {
      throw new Error("日付、開始時刻、終了時刻は必須です。");
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

      const staffData = staffDoc.data();
      const staffFullName = staffData?.fullName || staffData?.name || "不明";

      // 時刻の妥当性チェック
      if (start >= end) {
        throw new Error("開始時刻は終了時刻より前である必要があります。");
      }

      // 日付の妥当性チェック（翌月分のシフトのみ作成可能）
      const shiftDate = new Date(date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // 翌月の最初の日を計算
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0); // 翌月の最終日
      
      // 翌月分のシフトのみ作成可能
      if (shiftDate < nextMonth || shiftDate > nextMonthEnd) {
        throw new Error("翌月分のシフトのみ申請可能です。");
      }

      // 重複シフトのチェック（同じ日付に既存のシフトがあるか）
      const existingShifts = await admin.firestore()
        .collection("shifts")
        .where("userId", "==", uid)
        .where("date", "==", date)
        .get();

      if (!existingShifts.empty) {
        throw new Error("同じ日付に既にシフトが申請されています。");
      }

      // シフト申請を作成
      const shiftData = {
        userId: uid,
        date: date,
        start: start,
        end: end,
        confirmed: null, // 申請中
        staffsFullName: staffFullName,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const shiftRef = await admin.firestore()
        .collection("shifts")
        .add(shiftData);

      return {
        success: true,
        shiftId: shiftRef.id
      };

    } catch (error) {
      console.error("シフト作成エラー:", error);
      
      if (error instanceof Error) {
        throw new Error(`シフト申請に失敗しました: ${error.message}`);
      } else {
        throw new Error("シフト申請に失敗しました。");
      }
    }
  }
);
