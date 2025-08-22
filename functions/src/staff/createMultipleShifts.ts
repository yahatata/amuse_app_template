import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

interface ShiftData {
  date: string;
  start: string;
  end: string;
}

interface CreateMultipleShiftsRequest {
  shifts: ShiftData[];
}

interface CreateMultipleShiftsResponse {
  success: boolean;
  shiftIds?: string[];
  error?: string;
}

/**
 * 複数シフト一括作成関数
 * 
 * リクエスト:
 * - shifts: シフトデータの配列
 *   - date: シフト日付 (YYYY-MM-DD)
 *   - start: 開始時刻 (HH:MM)
 *   - end: 終了時刻 (HH:MM)
 * 
 * レスポンス:
 * - success: 成功フラグ
 * - shiftIds: 作成されたシフトのID配列
 * - error: エラーメッセージ
 */
export const createMultipleShifts = onCall(
  async (request): Promise<CreateMultipleShiftsResponse> => {
    // 認証チェック
    if (!request.auth) {
      throw new Error("Authentication required.");
    }

    const uid = request.auth.uid;
    const { shifts }: CreateMultipleShiftsRequest = request.data;

    // 入力バリデーション
    if (!shifts || !Array.isArray(shifts) || shifts.length === 0) {
      throw new Error("シフトデータが正しく入力されていません。");
    }

    if (shifts.length > 31) {
      throw new Error("一度に申請できるシフトは31日分までです。");
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

      // 翌月の期間を計算
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);

      // 各シフトの妥当性チェック
      const validatedShifts = [];
      for (const shift of shifts) {
        const { date, start, end } = shift;

        if (!date || !start || !end) {
          throw new Error("すべてのシフトに日付、開始時刻、終了時刻が必要です。");
        }

        // 時刻の妥当性チェック
        if (start >= end) {
          throw new Error(`日付 ${date}: 開始時刻は終了時刻より前である必要があります。`);
        }

        // 日付の妥当性チェック（翌月分のシフトのみ）
        const shiftDate = new Date(date);
        if (shiftDate < nextMonth || shiftDate > nextMonthEnd) {
          throw new Error(`日付 ${date}: 翌月分のシフトのみ申請可能です。`);
        }

        validatedShifts.push({ date, start, end });
      }

      // 重複シフトのチェック（同じ日付に既存のシフトがあるか）
      const dates = validatedShifts.map(s => s.date);
      const uniqueDates = [...new Set(dates)];
      
      const existingShifts = await admin.firestore()
        .collection("shifts")
        .where("userId", "==", uid)
        .where("date", "in", uniqueDates)
        .get();

      if (!existingShifts.empty) {
        const existingDates = existingShifts.docs.map(doc => doc.data().date);
        throw new Error(`以下の日付に既にシフトが申請されています: ${existingDates.join(", ")}`);
      }

      // バッチ処理で複数シフトを一括作成
      const batch = admin.firestore().batch();
      const shiftIds: string[] = [];

      for (const shift of validatedShifts) {
        const shiftRef = admin.firestore().collection("shifts").doc();
        shiftIds.push(shiftRef.id);

        const shiftData = {
          userId: uid,
          date: shift.date,
          start: shift.start,
          end: shift.end,
          confirmed: null, // 申請中
          staffsFullName: staffFullName,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        batch.set(shiftRef, shiftData);
      }

      // バッチ処理を実行
      await batch.commit();

      return {
        success: true,
        shiftIds: shiftIds
      };

    } catch (error) {
      console.error("複数シフト作成エラー:", error);
      
      if (error instanceof Error) {
        throw new Error(`シフト申請に失敗しました: ${error.message}`);
      } else {
        throw new Error("シフト申請に失敗しました。");
      }
    }
  }
);
