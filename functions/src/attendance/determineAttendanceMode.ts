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

    // 現在時刻を取得（JST）
    const now = new Date();
    const jstOffset = 9 * 60; // JST = UTC+9
    const jstDate = new Date(now.getTime() + jstOffset * 60000);
    const today = jstDate.toISOString().split('T')[0]; // YYYY-MM-DD形式
    const currentHour = jstDate.getHours(); // 現在時刻（0-23）
    
    // 店舗締め時間設定（globalConstant.dartの値と同期）
    const STORE_CLOSE_HOUR = 9; // 9:00まで（日付跨ぎ勤務可能）

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

    let isClockIn = true; // デフォルトは出勤
    let existingDocId = null;

    if (currentHour < STORE_CLOSE_HOUR) {
      // 締め時間前：前日の勤務を継続する可能性をチェック
      const yesterday = new Date(jstDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      // 前日の未完了勤務を確認
      const yesterdayAttendanceQuery = await admin.firestore()
        .collection('attendances')
        .where('staffId', '==', staffId)
        .where('date', '==', yesterdayStr)
        .where('clockOut', '==', null)
        .get();

      if (!yesterdayAttendanceQuery.empty) {
        // 前日の未完了勤務がある場合：退勤処理
        const attendanceDoc = yesterdayAttendanceQuery.docs[0];
        isClockIn = false; // 退勤
        existingDocId = attendanceDoc.id;
      } else {
        // 前日の未完了勤務がない場合：新しい出勤処理
        isClockIn = true;
      }
    } else {
      // 締め時間後：当日の勤務をチェック
      const attendanceQuery = await admin.firestore()
        .collection('attendances')
        .where('staffId', '==', staffId)
        .where('date', '==', today)
        .get();

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
      
      // TODO: 前日の未完了勤務がある場合の通知機能
      // if (currentHour >= STORE_CLOSE_HOUR) {
      //   const yesterday = new Date(jstDate);
      //   yesterday.setDate(yesterday.getDate() - 1);
      //   const yesterdayStr = yesterday.toISOString().split('T')[0];
      //   
      //   const yesterdayIncompleteQuery = await admin.firestore()
      //     .collection('attendances')
      //     .where('staffId', '==', staffId)
      //     .where('date', '==', yesterdayStr)
      //     .where('clockOut', '==', null)
      //     .get();
      //   
      //   if (!yesterdayIncompleteQuery.empty) {
      //     // 前日の未完了勤務がある場合の通知
      //     await sendNotification(staffId, "前日の勤務が未完了です");
      //   }
      // }
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
