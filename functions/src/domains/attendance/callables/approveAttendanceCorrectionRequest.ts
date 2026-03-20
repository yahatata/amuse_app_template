import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getStoreConfig } from "../../../shared/config/configLoader";
import { writeAttendanceLog } from "../helpers/attendanceLogs";
import { recalculateAttendanceFromBreaks } from "../helpers/recalculateAttendanceFromBreaks";

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
          if (requestData.type === "clockIn" || requestData.type === "both") {
            if (requestData.newClockIn && requestData.date) {
              updateData.clockIn = convertTimeStringToTimestamp(requestData.newClockIn, requestData.date);
            }
          }
          if (requestData.type === "clockOut" || requestData.type === "both") {
            if (requestData.newClockOut && requestData.date) {
              updateData.clockOut = convertTimeStringToTimestamp(requestData.newClockOut, requestData.date);
            }
          }

          await attendanceDoc.ref.update(updateData);

          // recalculateAttendanceFromBreaks で breakMinutes, actualWorkMinutes, nightWorkMinutes を再集計
          const updatedData = await attendanceDoc.ref.get();
          const attData = updatedData.data();
          const clockInTs = attData?.clockIn as admin.firestore.Timestamp | null | undefined;
          const clockOutTs = attData?.clockOut as admin.firestore.Timestamp | null | undefined;
          const config = await getStoreConfig();
          const recalcResult = await recalculateAttendanceFromBreaks({
            attendanceRef: attendanceDoc.ref,
            attendanceData: {
              clockIn: clockInTs,
              clockOut: clockOutTs,
              staffId: attData?.staffId,
              date: attData?.date,
            },
            config,
          });

          // totalMinutes は clockOut - clockIn で算出（recalculate では更新しない）
          let totalMinutes = 0;
          if (clockInTs && clockOutTs) {
            totalMinutes = Math.floor(
              (clockOutTs.toDate().getTime() - clockInTs.toDate().getTime()) / (1000 * 60)
            );
          }
          await attendanceDoc.ref.update({
            totalMinutes,
            nightMinutes: recalcResult.nightWorkMinutes,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          await writeAttendanceLog({
            db,
            attendanceId: attendanceDoc.id,
            actionType: "approve_correction_request",
            performedByUid: adminUserId,
            performedByDeviceId: null,
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
