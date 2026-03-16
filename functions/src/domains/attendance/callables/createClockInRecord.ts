import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { getBusinessDateForAttendance } from '../../storeMeta/repos/getCurrentBusinessDateKeyOrThrow';

export const createClockInRecord = onCall(async (request: CallableRequest) => {
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
    const { staffId, staffName } = data as { staffId: string; staffName: string };
    
    if (!staffId || !staffName) {
      throw new HttpsError(
        'invalid-argument',
        'staffId and staffName are required'
      );
    }

    // 営業日を取得（status=running なら currentBusinessDateKey、そうでなければ JST 当日）
    const businessDate = await getBusinessDateForAttendance();

    // 既に当日の出勤記録がないかチェック
    const existingQuery = await admin.firestore()
      .collection('attendances')
      .where('staffId', '==', staffId)
      .where('date', '==', businessDate)
      .get();

    if (!existingQuery.empty) {
      throw new HttpsError(
        'already-exists',
        'Attendance record already exists for today'
      );
    }

    // 出勤記録を作成（date に営業日を格納）
    const attendanceData = {
      staffId,
      date: businessDate,
      clockIn: admin.firestore.FieldValue.serverTimestamp(),
      clockOut: null,
      closedStoreWithoutClockOut: false,
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
