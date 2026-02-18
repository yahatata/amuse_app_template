import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

export const checkExistingCorrectionRequest = onCall(
  { region: "us-central1", maxInstances: 10 },
  async (request) => {
    try {
      if (!request.auth) {
        throw new Error("Authentication required.");
      }

      const { staffId, date } = request.data as {
        staffId: string;
        date: string;
      };

      // 必須フィールドの検証
      if (!staffId || !date) {
        throw new Error("Required fields are missing.");
      }

      const db = admin.firestore();

      // 指定された日付で申請済みの修正申請を検索
      const correctionSnapshot = await db.collection("attendanceCorrectionRequests")
        .where("staffId", "==", staffId)
        .where("date", "==", date)
        .get();

      if (correctionSnapshot.empty) {
        // 申請済みなし
        return {
          success: true,
          hasExistingRequest: false,
          message: "申請可能です。"
        };
      }

      // 申請済みあり
      const existingRequest = correctionSnapshot.docs[0].data();
      const status = existingRequest.status;

      let message = "";
      let canReapply = false;

      switch (status) {
        case "pending":
          message = "この日付は既に申請中です。承認までお待ちください。";
          canReapply = false;
          break;
        case "approved":
          message = "この日付は既に承認済みです。";
          canReapply = false;
          break;
        case "rejected":
          message = "この日付は却下されました。再度申請する場合は、既存の申請を削除してください。";
          canReapply = true;
          break;
        default:
          message = "この日付は既に申請済みです。";
          canReapply = false;
      }

      return {
        success: true,
        hasExistingRequest: true,
        status: status,
        canReapply: canReapply,
        message: message,
        requestId: correctionSnapshot.docs[0].id
      };

    } catch (error) {
      console.error("申請済みチェックエラー:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred."
      };
    }
  }
);

