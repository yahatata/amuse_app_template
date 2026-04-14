/**
 * [UNUSED - Phase4.1] createClockInRecord
 *
 * 旧出勤打刻 Callable。Phase4.1 で clockIn に統合済みのため廃止。
 * 呼び出し元は存在しない（dead code）。
 *
 * 復元手順: 下記 UNUSED_BLOCK のコメントアウトを削除し、domains/attendance/callables に戻して index.ts から export を復活させる。
 */
// ========== UNUSED_BLOCK_START ==========
/*
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { getBusinessDateForAttendance } from '../../storeMeta/repos/getCurrentBusinessDateKeyOrThrow';
import { logOpsError } from "../shared/logging/logOpsError";

export const createClockInRecord = onCall(async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }
  const callerUid = request.auth.uid;
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
    const { staffId, staffName } = data as { staffId: string; staffName: string };
    if (!staffId || !staffName) {
      throw new HttpsError('invalid-argument', 'staffId and staffName are required');
    }
    const businessDate = await getBusinessDateForAttendance();
    const existingQuery = await admin.firestore()
      .collection('attendances')
      .where('staffId', '==', staffId)
      .where('date', '==', businessDate)
      .get();
    if (!existingQuery.empty) {
      throw new HttpsError('already-exists', 'Attendance record already exists for today');
    }
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
        clockIn: new Date().toISOString()
      }
    };
  } catch (error) {
    logOpsError({
      message: 'Error in createClockInRecord:',
      functionEntry: 'createClockInRecord',
      cause: error,
    });
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Internal server error');
  }
});
*/
// ========== UNUSED_BLOCK_END ==========
