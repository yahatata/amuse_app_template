import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { logOpsError } from "../../../shared/logging/logOpsError";

export const getPayrollData = onCall(async (request: CallableRequest) => {
  try {
    const { data } = request;
    
    // リクエストデータの検証
    const { month, year, startDay, endDay } = data as {
      month: number;
      year: number;
      startDay: number;
      endDay: number;
    };
    
    if (!month || !year || !startDay || !endDay) {
      throw new HttpsError(
        'invalid-argument',
        'month, year, startDay, endDay are required'
      );
    }

    // 給与計算期間を計算（storeMeta/config の payroll.startDay / payroll.endDay に基づく）
    // Flutter 側から送信される month/year は選択月+1 の給与期間終了月。startDay/endDay は StoreConfigService から取得した値を渡す。
    const selectedMonth = month;
    const selectedYear = year;
    
    const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
    const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;

    let periodStart: Date;
    let periodEnd: Date;
    if (endDay === 0) {
      // 月を跨がない: startDay 日〜当月末日
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
      periodStart = new Date(selectedYear, selectedMonth - 1, startDay);
      periodEnd = new Date(selectedYear, selectedMonth - 1, lastDay, 23, 59, 59);
    } else {
      // 月を跨ぐ: 前月 startDay 日〜今月 endDay 日
      periodStart = new Date(prevYear, prevMonth - 1, startDay);
      periodEnd = new Date(selectedYear, selectedMonth - 1, endDay, 23, 59, 59);
    }
    
    const periodStartStr = periodStart.toISOString().split('T')[0];
    const periodEndStr = periodEnd.toISOString().split('T')[0];
    
    console.log(`給与データ取得期間: ${periodStartStr} 〜 ${periodEndStr}`);

    // Firestoreから給与データを取得
    // periodStartのみで検索し、後でperiodEndでフィルタリング
    const db = admin.firestore();
    const payrollSnapshot = await db
      .collection('monthlyPayroll')
      .where('periodStart', '>=', periodStartStr)
      .where('periodStart', '<=', periodEndStr)
      .get();

    console.log(`取得された給与データ件数: ${payrollSnapshot.size}`);

    // データを整形して返却（periodEndでの追加フィルタリング）
    const payrollData = payrollSnapshot.docs
      .filter(doc => {
        const data = doc.data();
        return data.periodEnd <= periodEndStr;
      })
      .map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          staffId: data.staffId,
          staffName: data.staffName,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          totalWorkHours: data.totalWorkHours,
          nightTimeHours: data.nightTimeHours,
          hourlyWage: data.hourlyWage,
          basicPay: data.basicPay,
          nightTimePay: data.nightTimePay,
          totalPay: data.totalPay,
          calculatedAt: data.calculatedAt,
          calculatedBy: data.calculatedBy,
        };
      });

    return {
      success: true,
      payrollData: payrollData,
      period: `${periodStartStr} 〜 ${periodEndStr}`,
      count: payrollData.length,
    };

  } catch (error) {
    logOpsError({
      message: 'Error in getPayrollData:',
      failureType: 'business',
      functionEntry: 'getPayrollData',
      cause: error,
    });
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError(
      'internal',
      'Internal server error'
    );
  }
});
