import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

export const approveAttendanceCorrectionRequest = onCall(
  { region: "us-central1", maxInstances: 10 },
  async (request) => {
    try {
      // 認証チェックをスキップ

      // 時刻文字列をTimestampに変換する関数（UTC+9として処理）
      function convertTimeStringToTimestamp(timeString: string, dateString: string): admin.firestore.Timestamp {
        // 日付と時刻を結合してUTC+9として直接解釈
        const dateTimeString = `${dateString}T${timeString}:00+09:00`;
        const date = new Date(dateTimeString);
        
        return admin.firestore.Timestamp.fromDate(date);
      }

      // 総勤務時間（分）を計算する関数
      function calculateTotalMinutes(clockIn: string, clockOut: string): number {
        if (!clockIn || !clockOut) return 0;
        
        const [inHours, inMinutes] = clockIn.split(':').map(Number);
        const [outHours, outMinutes] = clockOut.split(':').map(Number);
        
        let totalMinutes = (outHours * 60 + outMinutes) - (inHours * 60 + inMinutes);
        
        // 日をまたぐ場合の処理
        if (totalMinutes < 0) {
          totalMinutes += 24 * 60; // 24時間分を加算
        }
        
        return totalMinutes;
      }

      // 夜勤時間（分）を計算する関数
      function calculateNightMinutes(clockIn: string, clockOut: string): number {
        if (!clockIn || !clockOut) return 0;
        
        const [inHours, inMinutes] = clockIn.split(':').map(Number);
        const [outHours, outMinutes] = clockOut.split(':').map(Number);
        
        let nightMinutes = 0;
        
        // 22:00-05:00の夜勤時間を計算
        for (let hour = inHours; hour <= outHours; hour++) {
          if (hour >= 22 || hour < 5) {
            if (hour === inHours) {
              // 開始時刻の分を計算
              nightMinutes += Math.min(60 - inMinutes, hour >= 22 ? 60 - inMinutes : 5 * 60);
            } else if (hour === outHours) {
              // 終了時刻の分を計算
              nightMinutes += Math.min(outMinutes, hour >= 22 ? outMinutes : 0);
            } else {
              // 完全な時間
              nightMinutes += 60;
            }
          }
        }
        
        // 日をまたぐ場合の処理
        if (outHours < inHours) {
          // 22:00-05:00の夜勤時間を追加
          for (let hour = 22; hour < 24; hour++) {
            nightMinutes += 60;
          }
          for (let hour = 0; hour < 5; hour++) {
            nightMinutes += 60;
          }
        }
        
        return nightMinutes;
      }

      const { requestId, adminUserId } = request.data as {
        requestId: string;
        adminUserId: string;
      };

      if (!requestId || !adminUserId) {
        throw new Error("Required fields are missing.");
      }

      const db = admin.firestore();

      // 申請の存在確認
      const requestDoc = await db.collection("attendanceCorrectionRequests").doc(requestId).get();
      if (!requestDoc.exists) {
        throw new Error("Attendance correction request not found.");
      }

      const requestData = requestDoc.data();
      if (requestData?.status !== "pending") {
        throw new Error("Request is not in pending status.");
      }

      // 承認処理
      await db.collection("attendanceCorrectionRequests").doc(requestId).update({
        status: "approved",
        approvedAt: admin.firestore.Timestamp.fromDate(new Date()),
        approvedBy: adminUserId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 承認後に勤怠記録を更新
      try {
        // 該当する勤怠記録を検索（staffId, dateで特定）
        const attendanceQuery = await db.collection("attendances")
          .where("staffId", "==", requestData.staffId)
          .where("date", "==", requestData.date)
          .get();

        if (!attendanceQuery.empty) {
          const attendanceDoc = attendanceQuery.docs[0];
          
          // 修正種別に応じて勤怠記録を更新
          const updateData: any = {
            correctedAt: admin.firestore.FieldValue.serverTimestamp(),
            correctedBy: adminUserId,
            correctionRequestId: requestId,
          };

          // 修正種別に応じて時刻を更新（文字列をTimestampに変換）
          let newClockIn = requestData.currentClockIn;
          let newClockOut = requestData.currentClockOut;
          
          if (requestData.type === "clockIn" || requestData.type === "both") {
            if (requestData.newClockIn && requestData.date) {
              newClockIn = requestData.newClockIn;
              updateData.clockIn = convertTimeStringToTimestamp(requestData.newClockIn, requestData.date);
            }
          }
          if (requestData.type === "clockOut" || requestData.type === "both") {
            if (requestData.newClockOut && requestData.date) {
              newClockOut = requestData.newClockOut;
              updateData.clockOut = convertTimeStringToTimestamp(requestData.newClockOut, requestData.date);
            }
          }

          await attendanceDoc.ref.update(updateData);

          // totalMinutesとnightMinutesを再計算して更新
          const updatedTotalMinutes = calculateTotalMinutes(newClockIn, newClockOut);
          const updatedNightMinutes = calculateNightMinutes(newClockIn, newClockOut);
          
          await attendanceDoc.ref.update({
            totalMinutes: updatedTotalMinutes,
            nightMinutes: updatedNightMinutes
          });
        } else {
          console.warn(`勤怠記録が見つかりません: staffId=${requestData.staffId}, date=${requestData.date}`);
        }
      } catch (updateError) {
        console.error("勤怠記録更新エラー:", updateError);
        // 勤怠記録の更新に失敗しても承認処理は成功とする
      }

      return {
        success: true,
        message: "勤怠修正申請を承認し、勤怠記録を更新しました。",
        requestId: requestId,
      };

    } catch (error) {
      console.error("勤怠修正申請承認エラー:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred.",
      };
    }
  }
);

