import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

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

    // 給与計算期間を計算（globalConstant.dartの設定に基づく）
    // PAYROLL_START_DAY = 26, PAYROLL_END_DAY = 25
    // 選択された月の期間を計算（8月選択→8月26日〜9月25日）
    // Flutter側から送信されるmonthは選択月+1なので、そのまま使用
    const selectedMonth = month;
    const selectedYear = year;
    
    const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
    const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;

    const periodStart = new Date(prevYear, prevMonth - 1, 26); // 前月26日
    const periodEnd = new Date(selectedYear, selectedMonth - 1, 25, 23, 59, 59); // 今月25日
    
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
    console.error('Error in getPayrollData:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError(
      'internal',
      'Internal server error'
    );
  }
});
