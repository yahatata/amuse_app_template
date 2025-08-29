import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

export const createAttendanceCorrectionRequest = onCall(
  { region: "us-central1", maxInstances: 10 },
  async (request) => {
    try {
      console.log('=== createAttendanceCorrectionRequest 開始 ===');
      console.log('認証情報:', request.auth);
      console.log('リクエストデータ:', request.data);
      
      if (!request.auth) {
        throw new Error("Authentication required.");
      }

      const {
        date,
        type,
        currentClockIn,
        currentClockOut,
        newClockIn,
        newClockOut,
        reason,
        staffId,
        staffName,
        status,
        createdAt
      } = request.data as {
        date: string;
        type: string;
        currentClockIn: string | null;
        currentClockOut: string | null;
        newClockIn: string;
        newClockOut: string;
        reason: string;
        staffId: string;
        staffName: string;
        status: string;
        createdAt: string;
      };

      // 必須フィールドの検証
      if (!date || !type || !reason || !staffId || !staffName) {
        throw new Error("Required fields are missing.");
      }

      // 修正種別に応じた時刻の検証
      if (type === "clockIn" && !newClockIn) {
        throw new Error("New clock-in time is required for clock-in correction.");
      }
      if (type === "clockOut" && !newClockOut) {
        throw new Error("New clock-out time is required for clock-out correction.");
      }
      if (type === "both" && (!newClockIn || !newClockOut)) {
        throw new Error("Both new clock-in and clock-out times are required for both correction.");
      }

      const db = admin.firestore();

      // 修正申請データを作成
      const correctionRequestData = {
        date,                    // 修正を行った勤怠の日付
        type,                    // 修正種別
        currentClockIn: currentClockIn || null,  // 修正前の出勤時刻
        currentClockOut: currentClockOut || null, // 修正前の退勤時刻
        newClockIn: newClockIn || null,  // 修正後の出勤時刻
        newClockOut: newClockOut || null, // 修正後の退勤時刻
        reason,                  // 修正理由
        staffId,                 // スタッフID
        staffName,               // スタッフ名
        status,                  // 申請ステータス
        createdAt: admin.firestore.Timestamp.fromDate(new Date(createdAt)), // 申請日
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedAt: null,        // 承認日時
        rejectedAt: null,        // 却下日時
        approvedBy: null,        // 承認者
        rejectedBy: null,        // 却下者
        rejectionReason: null    // 却下理由
      };

      // Firestoreに保存
      const docRef = await db.collection("attendanceCorrectionRequests").add(correctionRequestData);

      return {
        success: true,
        requestId: docRef.id,
        message: "修正申請が正常に保存されました。"
      };

    } catch (error) {
      console.error("修正申請保存エラー:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred."
      };
    }
  }
);
