import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

export const getAttendanceCorrectionRequests = onCall(
  { region: "us-central1", maxInstances: 10 },
  async (request) => {
    try {
      // 認証チェックをスキップ

      const { status, limit } = request.data as {
        status?: string;
        limit?: number;
      };

      const db = admin.firestore();
      let query: admin.firestore.Query = db.collection("attendanceCorrectionRequests");

      // ステータスフィルター（デフォルトはpending）
      if (status) {
        query = query.where("status", "==", status);
      } else {
        query = query.where("status", "==", "pending");
      }

      // 作成日時順でソート
      query = query.orderBy("createdAt", "desc");

      // 件数制限
      if (limit && limit > 0) {
        query = query.limit(limit);
      }

      const snapshot = await query.get();

      const requests = [];
      for (const doc of snapshot.docs) {
        const data = doc.data();
        
        // デバッグログ
        console.log('=== ドキュメントデータ ===');
        console.log('doc.id:', doc.id);
        console.log('data.createdAt:', data.createdAt);
        console.log('data.createdAt type:', typeof data.createdAt);
        console.log('data.createdAt constructor:', data.createdAt?.constructor?.name);
        console.log('data.createdAt seconds:', data.createdAt?.seconds);
        console.log('data.createdAt nanoseconds:', data.createdAt?.nanoseconds);
        
        requests.push({
          id: doc.id,
          ...data,
          // Timestampデータを適切な形式で返す
          createdAt: data.createdAt ? {
            seconds: data.createdAt.seconds,
            nanoseconds: data.createdAt.nanoseconds,
          } : null,
          updatedAt: data.updatedAt ? {
            seconds: data.updatedAt.seconds,
            nanoseconds: data.updatedAt.nanoseconds,
          } : null,
          approvedAt: data.approvedAt ? {
            seconds: data.approvedAt.seconds,
            nanoseconds: data.approvedAt.nanoseconds,
          } : null,
          rejectedAt: data.rejectedAt ? {
            seconds: data.rejectedAt.seconds,
            nanoseconds: data.rejectedAt.nanoseconds,
          } : null,
        });
      }

      return {
        success: true,
        requests: requests,
        total: requests.length,
      };

    } catch (error) {
      console.error("勤怠修正申請取得エラー:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred.",
      };
    }
  }
);
