import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logOpsError } from "../../../shared/logging/logOpsError";

export const rejectAttendanceCorrectionRequest = onCall(
  { region: "us-central1", maxInstances: 10 },
  async (request) => {
    try {
      // 認証チェックをスキップ

      const { requestId, adminUserId, rejectionReason } = request.data as {
        requestId: string;
        adminUserId: string;
        rejectionReason: string;
      };

      if (!requestId || !adminUserId || !rejectionReason) {
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

      // 却下処理
      await db.collection("attendanceCorrectionRequests").doc(requestId).update({
        status: "rejected",
        rejectedAt: admin.firestore.Timestamp.fromDate(new Date()),
        rejectedBy: adminUserId,
        rejectionReason: rejectionReason.trim(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        message: "勤怠修正申請を却下しました。",
        requestId: requestId,
      };

    } catch (error) {
      logOpsError({
      message: '勤怠修正申請却下エラー:',
      failureType: 'business',
      functionEntry: 'rejectAttendanceCorrectionRequest',
      cause: error,
    });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred.",
      };
    }
  }
);
