import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logOpsError } from "../../../shared/logging/logOpsError";

export const getAllStaffAttendance = onCall(
  {
    region: "asia-northeast1",
    maxInstances: 10,
  },
  async (request) => {
    try {
      const { month, year, startDay, endDay } = request.data as { 
        month: number; 
        year: number; 
        startDay: number; 
        endDay: number; 
      };

      if (!month || !year || startDay === undefined || endDay === undefined) {
        throw new Error("月、年、開始日、終了日が必要です");
      }

      const db = admin.firestore();
      
      // 給与計算期間の開始日と終了日を計算
      let periodStart: Date;
      let periodEnd: Date;
      
      if (endDay === 0) {
        // 終了日が0の場合：同じ月内
        periodStart = new Date(year, month - 1, startDay);
        periodEnd = new Date(year, month, 0, 23, 59, 59);
      } else {
        // 終了日が0以外の場合：月を跨ぐ
        if (startDay >= 1) {
          // 今月開始日以降の場合：今月開始日〜来月終了日
          periodStart = new Date(year, month - 1, startDay);
          const nextMonth = month === 12 ? 1 : month + 1;
          const nextYear = month === 12 ? year + 1 : year;
          periodEnd = new Date(nextYear, nextMonth - 1, endDay, 23, 59, 59);
        } else {
          // 今月開始日以前の場合：先月開始日〜今月終了日
          const prevMonth = month === 1 ? 12 : month - 1;
          const prevYear = month === 1 ? year - 1 : year;
          periodStart = new Date(prevYear, prevMonth - 1, startDay);
          periodEnd = new Date(year, month - 1, endDay, 23, 59, 59);
        }
      }
      
      console.log(`勤怠記録取得開始: ${year}年${month}月 (${startDay}日〜${endDay === 0 ? '月末' : endDay}日)`);
      console.log(`期間: ${periodStart.toISOString()} - ${periodEnd.toISOString()}`);

      // 期間内の日付文字列を生成
      const startDateStr = periodStart.toISOString().split('T')[0];
      const endDateStr = periodEnd.toISOString().split('T')[0];
      
      console.log(`日付範囲（文字列）: ${startDateStr} - ${endDateStr}`);
      
      // attendancesコレクションから期間内のデータを取得
      const attendanceSnapshot = await db
        .collection("attendances")
        .where("date", ">=", startDateStr)
        .where("date", "<=", endDateStr)
        .get();

      console.log(`勤怠記録取得件数: ${attendanceSnapshot.size}`);
      
      // デバッグ用：取得したドキュメントの詳細をログ出力
      if (attendanceSnapshot.size > 0) {
        console.log('取得された勤怠記録の最初のドキュメント:', attendanceSnapshot.docs[0].data());
      } else {
        console.log('勤怠記録が見つかりませんでした');
      }

      const attendances: any[] = [];
      
      for (const doc of attendanceSnapshot.docs) {
        const attendanceData = doc.data();
        const actualWorkMinutes = attendanceData.actualWorkMinutes ?? attendanceData.totalMinutes;
        const nightWorkMinutes = attendanceData.nightWorkMinutes ?? attendanceData.nightMinutes ?? 0;

        attendances.push({
          id: doc.id,
          staffId: attendanceData.staffId,
          staffName: attendanceData.staffsFullName || "不明",
          date: attendanceData.date,
          clockIn: attendanceData.clockIn?.toDate(),
          clockOut: attendanceData.clockOut?.toDate(),
          shiftStart: attendanceData.shiftStart?.toDate(),
          shiftEnd: attendanceData.shiftEnd?.toDate(),
          isManual: attendanceData.isManual || false,
          breakMinutes: attendanceData.breakMinutes ?? 0,
          actualWorkMinutes,
          nightWorkMinutes,
          nightTimeHours: nightWorkMinutes / 60,
          totalWorkHours: (actualWorkMinutes ?? 0) / 60,
          isDeleted: attendanceData.isDeleted ?? false,
          ...attendanceData,
        });
      }

      // shiftsコレクションから期間内のデータを取得
      const shiftsSnapshot = await db
        .collection("shifts")
        .where("date", ">=", startDateStr)
        .where("date", "<=", endDateStr)
        .get();

      console.log(`シフト記録取得件数: ${shiftsSnapshot.size}`);

      const shifts: any[] = [];
      
      for (const doc of shiftsSnapshot.docs) {
        const shiftData = doc.data();
        console.log('シフトデータ:', shiftData); // デバッグ用
        
        // 元のデータをそのまま保持（時刻は文字列のまま）
        const shiftItem = {
          id: doc.id,
          staffId: shiftData.userId || shiftData.staffId || "不明",
          staffName: shiftData.staffsFullName || shiftData.staffName || "不明",
          date: shiftData.date,
          start: shiftData.start, // 文字列のまま保持
          end: shiftData.end,     // 文字列のまま保持
          confirmed: shiftData.confirmed,
          approvedBy: shiftData.approvedBy,
          approvedAt: shiftData.approvedAt,
          createdAt: shiftData.createdAt,
          updatedAt: shiftData.updatedAt,
          status: shiftData.confirmed ? "確定" : "未確定",
          // デバッグ用：元のデータも保持
          originalData: shiftData,
        };
        
        console.log('作成されたシフトアイテム:', shiftItem);
        console.log('startフィールド:', shiftItem.start);
        console.log('endフィールド:', shiftItem.end);
        
        shifts.push(shiftItem);
      }

      // 日付順にソート（文字列として比較）
      attendances.sort((a, b) => {
        if (a.date && b.date) {
          return a.date.localeCompare(b.date);
        }
        return 0;
      });

      // シフトも日付順にソート
      shifts.sort((a, b) => {
        if (a.date && b.date) {
          return a.date.localeCompare(b.date);
        }
        return 0;
      });

      console.log(`勤怠記録取得完了: ${attendances.length}件`);
      console.log(`シフト記録取得完了: ${shifts.length}件`);

      return {
        success: true,
        attendances: attendances,
        shifts: shifts,
        month: month,
        year: year,
        totalCount: attendances.length,
        shiftCount: shifts.length,
      };

    } catch (error) {
      logOpsError({
      message: '勤怠記録取得エラー:',
      failureType: 'business',
      functionEntry: 'getAllStaffAttendance',
      cause: error,
    });
      throw new Error(`勤怠記録の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
);

