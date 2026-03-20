/**
 * [UNUSED - Phase4.1] updateClockOutRecord
 *
 * 旧退勤打刻 Callable。Phase4.1 で clockOut に統合済みのため廃止。
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

export const updateClockOutRecord = onCall(async (request: CallableRequest) => {
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
    const { docId } = data as { docId: string };
    if (!docId) {
      throw new HttpsError('invalid-argument', 'docId is required');
    }
    const attendanceDoc = await admin.firestore()
      .collection('attendances')
      .doc(docId)
      .get();
    if (!attendanceDoc.exists) {
      throw new HttpsError('not-found', 'Attendance record not found');
    }
    const attendanceData = attendanceDoc.data()!;
    if (attendanceData.clockOut) {
      throw new HttpsError('already-exists', 'Clock out record already exists');
    }
    if (!attendanceData.clockIn) {
      throw new HttpsError('failed-precondition', 'Clock in record not found');
    }
    const calculateMinutes = (clockIn: admin.firestore.Timestamp, clockOut: admin.firestore.Timestamp) => {
      const clockInTime = clockIn.toDate();
      const clockOutTime = clockOut.toDate();
      const jstOffset = 9 * 60 * 60 * 1000;
      const clockInJST = new Date(clockInTime.getTime() + jstOffset);
      const clockOutJST = new Date(clockOutTime.getTime() + jstOffset);
      const totalMinutes = Math.floor((clockOutJST.getTime() - clockInJST.getTime()) / (1000 * 60));
      const nightStartHour = 22;
      const nightEndHour = 5;
      let nightMinutes = 0;
      let currentTime = new Date(clockInJST);
      while (currentTime < clockOutJST) {
        const hour = currentTime.getHours();
        if (hour >= nightStartHour || hour < nightEndHour) {
          nightMinutes++;
        }
        currentTime.setMinutes(currentTime.getMinutes() + 1);
      }
      return { totalMinutes, nightMinutes };
    };
    const clockOut = admin.firestore.FieldValue.serverTimestamp();
    const updateData = {
      clockOut,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await admin.firestore()
      .collection('attendances')
      .doc(docId)
      .update(updateData);
    const updatedDoc = await admin.firestore()
      .collection('attendances')
      .doc(docId)
      .get();
    const updatedData = updatedDoc.data()!;
    const { totalMinutes, nightMinutes } = calculateMinutes(
      attendanceData.clockIn,
      updatedData.clockOut
    );
    await admin.firestore()
      .collection('attendances')
      .doc(docId)
      .update({
        totalMinutes,
        nightMinutes
      });
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
    throw new HttpsError('internal', 'Internal server error');
  }
});
*/
// ========== UNUSED_BLOCK_END ==========
