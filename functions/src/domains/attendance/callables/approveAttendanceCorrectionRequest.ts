import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getStoreConfig } from "../../../shared/config/configLoader";
import { writeAttendanceLog } from "../helpers/attendanceLogs";
import { recalculateAttendanceFromBreaks } from "../helpers/recalculateAttendanceFromBreaks";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

export const approveAttendanceCorrectionRequest = onCall(
  { region: "asia-northeast1", maxInstances: 10 },
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

      // 先に勤怠の存在確認（承認のみ先行すると pending でない申請かつ勤怠未更新が残るため）
      const attendanceQuery = await db.collection("attendances")
        .where("staffId", "==", requestData.staffId)
        .where("date", "==", requestData.date)
        .get();

      if (attendanceQuery.empty) {
        logOpsError({
          message:
            "勤怠修正承認: staffId/date で該当勤怠が見つからず承認を中止しました",
          functionEntry: "approveAttendanceCorrectionRequest",
          operation: "approveAttendanceMissingTarget",
          cause: new Error("approve_attendance_correction_no_attendance_doc"),
          context: {
            requestId,
            adminUserId,
            staffId: requestData.staffId ?? null,
            date: requestData.date ?? null,
            requestAttendanceId:
              typeof requestData.attendanceId === "string"
                ? requestData.attendanceId
                : null,
          },
        });
        return {
          success: false,
          error:
            "該当する勤怠記録が見つかりません。申請は承認されていません。データを確認してください。",
          requestId,
        };
      }

      const attendanceDoc = attendanceQuery.docs[0];

      await db.collection("attendanceCorrectionRequests").doc(requestId).update({
        status: "approved",
        approvedAt: admin.firestore.Timestamp.fromDate(new Date()),
        approvedBy: adminUserId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      try {
        const updateData: Record<string, unknown> = {
          correctedAt: admin.firestore.FieldValue.serverTimestamp(),
          correctedBy: adminUserId,
          correctionRequestId: requestId,
        };

        if (requestData.type === "clockIn" || requestData.type === "both") {
          if (requestData.newClockIn && requestData.date) {
            updateData.clockIn = convertTimeStringToTimestamp(
              requestData.newClockIn,
              requestData.date
            );
          }
        }
        if (requestData.type === "clockOut" || requestData.type === "both") {
          if (requestData.newClockOut && requestData.date) {
            updateData.clockOut = convertTimeStringToTimestamp(
              requestData.newClockOut,
              requestData.date
            );
          }
        }

        await attendanceDoc.ref.update(updateData);

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
      } catch (updateError) {
        logOpsError({
          message:
            "勤怠記録更新エラー（申請は approved のままです。勤怠を手動確認してください）:",
          functionEntry: "approveAttendanceCorrectionRequest",
          operation: "attendanceRecordUpdate",
          cause: updateError,
          context: {
            requestId,
            adminUserId,
            attendanceId: attendanceDoc.id,
          },
        });
        return {
          success: false,
          error:
            "申請は承認されましたが、勤怠記録の更新に失敗しました。勤怠と申請状態を手動で確認してください。",
          requestId,
          approvedButAttendanceUpdateFailed: true,
        };
      }

      logOpsSuccess({
        message: "approveAttendanceCorrectionRequest 成功",
        functionEntry: "approveAttendanceCorrectionRequest",
        operation: "approveRequest",
        context: {
          requestId,
          adminUserId,
          staffId: requestData?.staffId,
          date: requestData?.date,
          correctionType: requestData?.type,
        },
      });

      return {
        success: true,
        message: "勤怠修正申請を承認し、勤怠記録を更新しました。",
        requestId: requestId,
      };

    } catch (error) {
      logOpsError({
        message: '勤怠修正申請承認エラー:',
        functionEntry: 'approveAttendanceCorrectionRequest',
        operation: 'approveRequestOuterCatch',
        cause: error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred.",
      };
    }
  }
);
