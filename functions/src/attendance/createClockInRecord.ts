import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

export const createClockInRecord = onCall(async (request: CallableRequest) => {
  try {
    const { data } = request;
    
    // リクエストデータの検証
    const { staffId, staffName } = data as { staffId: string; staffName: string };
    
    if (!staffId || !staffName) {
      throw new HttpsError(
        'invalid-argument',
        'staffId and staffName are required'
      );
    }

    // 今日の日付を取得（JST）
    const now = new Date();
    const jstOffset = 9 * 60; // JST = UTC+9
    const jstDate = new Date(now.getTime() + jstOffset * 60000);
    const today = jstDate.toISOString().split('T')[0]; // YYYY-MM-DD形式

    // 既に当日の出勤記録がないかチェック
    const existingQuery = await admin.firestore()
      .collection('attendances')
      .where('staffId', '==', staffId)
      .where('date', '==', today)
      .get();

    if (!existingQuery.empty) {
      throw new HttpsError(
        'already-exists',
        'Attendance record already exists for today'
      );
    }

    // 出勤記録を作成
    const attendanceData = {
      staffId,
      date: today,
      clockIn: admin.firestore.FieldValue.serverTimestamp(),
      clockOut: null,
      isManual: false,
      nightMinutes: 0,
      totalMinutes: 0,
      staffsFullName: staffName,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await admin.firestore()
      .collection('attendances')
      .add(attendanceData);

    return {
      success: true,
      docId: docRef.id,
      message: `${staffName}さんの出勤記録を作成しました`,
      data: {
        ...attendanceData,
        docId: docRef.id,
        clockIn: new Date().toISOString() // 仮の値（実際はサーバータイムスタンプ）
      }
    };

  } catch (error) {
    console.error('Error in createClockInRecord:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError(
      'internal',
      'Internal server error'
    );
  }
});
