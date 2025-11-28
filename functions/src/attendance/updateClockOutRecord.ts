import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../lib/devicePermissions';

export const updateClockOutRecord = onCall(async (request: CallableRequest) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  // デバイス権限の確認（role: admin または options.staff_entry_exit: true）
  const device = await getCallerDeviceByUid(callerUid);
  if (!device || !isActive(device.status)) {
    throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
  }

  const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'staff_entry_exit');
  if (!hasPermission) {
    throw new HttpsError('permission-denied', 'スタッフ出退勤操作の権限がありません');
  }

  try {
    const { data } = request;
    
    // リクエストデータの検証
    const { docId } = data as { docId: string };
    
    if (!docId) {
      throw new HttpsError(
        'invalid-argument',
        'docId is required'
      );
    }

    // 既存の出勤記録を取得
    const attendanceDoc = await admin.firestore()
      .collection('attendances')
      .doc(docId)
      .get();

    if (!attendanceDoc.exists) {
      throw new HttpsError(
        'not-found',
        'Attendance record not found'
      );
    }

    const attendanceData = attendanceDoc.data()!;

    // 既に退勤記録があるかチェック
    if (attendanceData.clockOut) {
      throw new HttpsError(
        'already-exists',
        'Clock out record already exists'
      );
    }

    // 出勤時刻がない場合
    if (!attendanceData.clockIn) {
      throw new HttpsError(
        'failed-precondition',
        'Clock in record not found'
      );
    }

    // 時間計算のためのヘルパー関数
    const calculateMinutes = (clockIn: admin.firestore.Timestamp, clockOut: admin.firestore.Timestamp) => {
      const clockInTime = clockIn.toDate();
      const clockOutTime = clockOut.toDate();
      
      // 日本時間（JST）に変換（UTC+9）
      const jstOffset = 9 * 60 * 60 * 1000; // 9時間をミリ秒で
      const clockInJST = new Date(clockInTime.getTime() + jstOffset);
      const clockOutJST = new Date(clockOutTime.getTime() + jstOffset);
      
      // 総勤務時間（分）
      const totalMinutes = Math.floor((clockOutJST.getTime() - clockInJST.getTime()) / (1000 * 60));
      
      // 深夜時間帯の定義（22:00-05:00）
      const nightStartHour = 22;
      const nightEndHour = 5;
      
      let nightMinutes = 0;
      let currentTime = new Date(clockInJST);
      
      // 1分ずつ進めて深夜時間帯をカウント
      while (currentTime < clockOutJST) {
        const hour = currentTime.getHours();
        
        // 深夜時間帯の判定（22:00-05:00）
        // 22時以上 または 5時未満
        if (hour >= nightStartHour || hour < nightEndHour) {
          nightMinutes++;
        }
        
        currentTime.setMinutes(currentTime.getMinutes() + 1);
      }
      
      return { totalMinutes, nightMinutes };
    };

    // 退勤時刻を更新
    const clockOut = admin.firestore.FieldValue.serverTimestamp();
    const updateData = {
      clockOut,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await admin.firestore()
      .collection('attendances')
      .doc(docId)
      .update(updateData);

    // 更新後のデータを取得して時間計算
    const updatedDoc = await admin.firestore()
      .collection('attendances')
      .doc(docId)
      .get();

    const updatedData = updatedDoc.data()!;
    
    // 時間計算を実行
    const { totalMinutes, nightMinutes } = calculateMinutes(
      attendanceData.clockIn,
      updatedData.clockOut
    );
    
    // 時間計算結果を更新
    await admin.firestore()
      .collection('attendances')
      .doc(docId)
      .update({
        totalMinutes,
        nightMinutes
      });
    
    // 最終的なデータを取得
    const finalDoc = await admin.firestore()
      .collection('attendances')
      .doc(docId)
      .get();

    const finalData = finalDoc.data()!;

    return {
      success: true,
      docId,
      message: `${attendanceData.staffsFullName}さんの退勤記録を更新しました`,
      data: {
        ...finalData,
        docId
      }
    };

  } catch (error) {
    console.error('Error in updateClockOutRecord:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError(
      'internal',
      'Internal server error'
    );
  }
});
