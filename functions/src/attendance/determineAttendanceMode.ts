import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

export const determineAttendanceMode = onCall(async (request: CallableRequest) => {
  try {
    const { data } = request;
    
    // リクエストデータの検証
    const { staffId } = data as { staffId: string };
    
    if (!staffId) {
      throw new HttpsError(
        'invalid-argument',
        'staffId is required'
      );
    }

    // 今日の日付を取得（JST）
    const now = new Date();
    const jstOffset = 9 * 60; // JST = UTC+9
    const jstDate = new Date(now.getTime() + jstOffset * 60000);
    const today = jstDate.toISOString().split('T')[0]; // YYYY-MM-DD形式

    // スタッフ情報を取得
    const staffDoc = await admin.firestore()
      .collection('staffs')
      .doc(staffId)
      .get();

    if (!staffDoc.exists) {
      throw new HttpsError(
        'not-found',
        'Staff not found'
      );
    }

    const staffData = staffDoc.data()!;
    const staffName = staffData.fullName || 'Unknown Staff';

    // 当日の出勤記録を確認
    const attendanceQuery = await admin.firestore()
      .collection('attendances')
      .where('staffId', '==', staffId)
      .where('date', '==', today)
      .get();

    let isClockIn = true; // デフォルトは出勤
    let existingDocId = null;

    if (!attendanceQuery.empty) {
      const attendanceDoc = attendanceQuery.docs[0];
      const attendanceData = attendanceDoc.data();
      
      // 出勤記録はあるが退勤記録がない場合
      if (attendanceData.clockIn && !attendanceData.clockOut) {
        isClockIn = false; // 退勤
        existingDocId = attendanceDoc.id;
      }
      // 既に出勤・退勤が完了している場合
      else if (attendanceData.clockIn && attendanceData.clockOut) {
        throw new HttpsError(
          'already-exists',
          'Attendance record already completed for today'
        );
      }
    }

    return {
      success: true,
      isClockIn,
      staffName,
      existingDocId,
      date: today,
      message: isClockIn 
        ? `${staffName}さんの出勤処理を行います`
        : `${staffName}さんの退勤処理を行います`
    };

  } catch (error) {
    console.error('Error in determineAttendanceMode:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError(
      'internal',
      'Internal server error'
    );
  }
});
