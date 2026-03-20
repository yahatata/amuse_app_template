import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * スタッフの勤怠記録を取得する関数
 * 
 * リクエスト:
 * - staffId: スタッフID
 * - year: 年
 * - month: 月（1-12）
 * 
 * レスポンス:
 * - attendances: 勤怠記録の配列
 * - success: 成功フラグ
 */
export const getStaffAttendance = onCall(
  { region: "us-central1", maxInstances: 10 },
  async (request) => {
    try {
      // 認証チェック
      if (!request.auth) {
        throw new Error("Authentication required.");
      }

      const { staffId, year, month } = request.data as {
        staffId: string;
        year: number;
        month: number;
      };

      // 入力バリデーション
      if (!staffId || !year || !month || month < 1 || month > 12) {
        throw new Error("Invalid parameters. staffId, year, and month (1-12) are required.");
      }

      // 指定された月の開始と終了日を計算
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      
      // 日付文字列形式（YYYY-MM-DD）
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      console.log(`勤怠記録取得開始: staffId=${staffId}, 期間=${startDateStr} 〜 ${endDateStr}`);

      const db = admin.firestore();
      
      // 勤怠記録を取得
      const attendanceSnapshot = await db.collection("attendances")
        .where("staffId", "==", staffId)
        .where("date", ">=", startDateStr)
        .where("date", "<=", endDateStr)
        .orderBy("date", "asc")
        .get();

      const attendances: any[] = [];

      attendanceSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.isDeleted === true) return;
        attendances.push({
          id: doc.id,
          ...data,
          breakMinutes: data.breakMinutes ?? 0,
          actualWorkMinutes: data.actualWorkMinutes ?? data.totalMinutes ?? null,
          nightWorkMinutes: data.nightWorkMinutes ?? data.nightMinutes ?? 0,
          clockIn: data.clockIn ? data.clockIn.toDate().toISOString() : null,
          clockOut: data.clockOut ? data.clockOut.toDate().toISOString() : null,
          createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
          updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null,
        });
      });

      console.log(`勤怠記録取得完了: ${attendances.length}件`);

      return {
        success: true,
        attendances: attendances,
        year: year,
        month: month,
        totalCount: attendances.length,
      };

    } catch (error) {
      console.error("勤怠記録取得エラー:", error);
      
      if (error instanceof Error) {
        throw new Error(`勤怠記録の取得に失敗しました: ${error.message}`);
      } else {
        throw new Error("勤怠記録の取得に失敗しました。");
      }
    }
  }
);

