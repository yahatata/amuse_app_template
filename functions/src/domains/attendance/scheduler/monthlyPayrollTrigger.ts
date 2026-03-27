import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";

import { getStoreConfig } from "../../../shared/config/configLoader";
import { getSchedulerConfig } from "../../../shared/config/schedulerConfigLoader";
import { DEFAULT_PAYROLL_END_DAY, DEFAULT_PAYROLL_START_DAY } from "../../../shared/config/defaults";
import { writeAttendanceLog } from "../helpers/attendanceLogs";
import { logOpsError } from "../../../shared/logging/logOpsError";

const MONTHLY_PAYROLL_TRIGGER_CRON =
  process.env.MONTHLY_PAYROLL_TRIGGER_CRON || "59 23 25 * *"; // 毎月25日 23:59 (JST)
logger.info("monthlyPayrollTrigger schedule", {
  schedule: MONTHLY_PAYROLL_TRIGGER_CRON,
  source: process.env.MONTHLY_PAYROLL_TRIGGER_CRON ? "env" : "default",
});

export const monthlyPayrollTrigger = onSchedule(
  {
    schedule: MONTHLY_PAYROLL_TRIGGER_CRON,
    timeZone: "Asia/Tokyo",
  },
  async (event) => {
    try {
      const db = admin.firestore();
      const schedulerConfig = await getSchedulerConfig(db);
      if (!schedulerConfig.monthlyPayrollTriggerEnabled) {
        logger.info("monthlyPayrollTrigger: スキップ（schedulerConfig.monthlyPayrollTriggerEnabled != true）");
        return;
      }

      console.log("=== 月次給与計算開始 ===");

      const config = await getStoreConfig(db);
    const startDay = config.payroll?.startDay ?? DEFAULT_PAYROLL_START_DAY;
    const endDay = config.payroll?.endDay ?? DEFAULT_PAYROLL_END_DAY;
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 0-based to 1-based
    
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    
    let periodStart: Date;
    let periodEnd: Date;
    if (endDay === 0) {
      // 月を跨がない: startDay 日〜当月末日
      const lastDay = new Date(currentYear, currentMonth, 0).getDate();
      periodStart = new Date(currentYear, currentMonth - 1, startDay);
      periodEnd = new Date(currentYear, currentMonth - 1, lastDay, 23, 59, 59);
    } else {
      // 月を跨ぐ: 前月 startDay 日〜今月 endDay 日
      periodStart = new Date(prevYear, prevMonth - 1, startDay);
      periodEnd = new Date(currentYear, currentMonth - 1, endDay, 23, 59, 59);
    }
    
    const periodStartStr = periodStart.toISOString().split('T')[0];
    const periodEndStr = periodEnd.toISOString().split('T')[0];
    
    console.log(`給与計算期間: ${periodStartStr} 〜 ${periodEndStr}`);
    
    // 全スタッフを取得
    const staffsSnapshot = await db.collection('staffs').get();
    console.log(`対象スタッフ数: ${staffsSnapshot.size}`);
    
    const results = [];
    
    for (const staffDoc of staffsSnapshot.docs) {
      const staffData = staffDoc.data();
      const staffId = staffDoc.id;
      const staffName = staffData.fullName || '不明';
      const hourlyWage = staffData.hourlyWage || 0;
      
      console.log(`スタッフ ${staffName} (${staffId}) の給与計算開始`);
      
      // 該当期間の勤怠データを取得（clockOut基準、nullは除外）
      const periodStartTimestamp = admin.firestore.Timestamp.fromDate(periodStart);
      const periodEndTimestamp = admin.firestore.Timestamp.fromDate(periodEnd);
      
      const attendanceSnapshot = await db
        .collection('attendances')
        .where('staffId', '==', staffId)
        .where('clockOut', '>=', periodStartTimestamp)
        .where('clockOut', '<=', periodEndTimestamp)
        .get();
      
      // Phase4.1-F: 論理削除を除外
      const validAttendances = attendanceSnapshot.docs.filter(
        (doc) => doc.data().isDeleted !== true
      );
      console.log(`勤怠記録数: ${attendanceSnapshot.size}（論理削除除外後: ${validAttendances.length}）`);

      let totalWorkHours = 0;
      let nightTimeHours = 0;
      const payrollReflectedAtValue = `${periodStartStr}-${periodEndStr}`;
      const attendanceIdsToReflect: string[] = [];

      // 勤務時間を合計（新規は actualWorkMinutes/nightWorkMinutes、既存は totalMinutes/nightMinutes）
      for (const attendanceDoc of validAttendances) {
        const attendanceData = attendanceDoc.data();

        const workMinutes =
          attendanceData.actualWorkMinutes ?? attendanceData.totalMinutes ?? 0;
        const nightMinutes =
          attendanceData.nightWorkMinutes ?? attendanceData.nightMinutes ?? 0;

        totalWorkHours += workMinutes / 60;
        nightTimeHours += nightMinutes / 60;
        attendanceIdsToReflect.push(attendanceDoc.id);
      }

      // 給与計算
      const basicPay = Math.round(totalWorkHours * hourlyWage);
      const nightTimePay = Math.round(nightTimeHours * hourlyWage);
      const totalPay = basicPay + nightTimePay;
      
      console.log(`計算結果: 基本給=${basicPay}円, 深夜手当=${nightTimePay}円, 合計=${totalPay}円`);
      
      // 給与データを保存
      const payrollData = {
        staffId: staffId,
        staffName: staffName,
        periodStart: periodStartStr,
        periodEnd: periodEndStr,
        totalWorkHours: Math.round(totalWorkHours * 100) / 100, // 小数点2桁
        nightTimeHours: Math.round(nightTimeHours * 100) / 100, // 小数点2桁
        hourlyWage: hourlyWage,
        basicPay: basicPay,
        nightTimePay: nightTimePay,
        totalPay: totalPay,
        calculatedAt: admin.firestore.FieldValue.serverTimestamp(),
        calculatedBy: 'system'
      };
      
      // monthlyPayrollコレクションに保存
      await db.collection('monthlyPayroll').add(payrollData);

      // Phase4.1-F: 給与計算対象の attendance に payrollReflectedAt を付与し、attendanceLogs に書き込み
      for (const attendanceId of attendanceIdsToReflect) {
        await db.collection('attendances').doc(attendanceId).update({
          payrollReflectedAt: payrollReflectedAtValue,
          updatedAt: FieldValue.serverTimestamp(),
        });
        await writeAttendanceLog({
          db,
          attendanceId,
          actionType: 'monthly_payroll_reflect',
          performedByUid: null,
          performedByDeviceId: null,
        });
      }

      results.push({
        staffId,
        staffName,
        totalPay,
        success: true,
      });

      console.log(`スタッフ ${staffName} の給与計算完了`);
    }
    
    console.log('=== 月次給与計算完了 ===');
    console.log(`処理結果: ${results.length}名の給与計算が完了しました`);
    
  } catch (error) {
    logOpsError({
      message: '=== 月次給与計算エラー ===',
      failureType: 'scheduled',
      functionEntry: 'monthlyPayrollTrigger',
      cause: error,
    });
  }
});
