/**
 * 注意:
 * - clockIn.ts とデータ更新・チェックロジックを揃えること。
 * - 片方を変更した場合、もう片方にも同等変更が必要な可能性がある。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { getBusinessDateForAttendance } from '../../storeMeta/repos/getCurrentBusinessDateKeyOrThrow';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { writeAttendanceLog } from '../helpers/attendanceLogs';

function resolveAdjustedClockInTimestamp(
  adjustmentOffsetMinutes: unknown,
  config: Awaited<ReturnType<typeof getStoreConfig>>
): admin.firestore.Timestamp {
  const now = admin.firestore.Timestamp.now();
  const adjustment = config.attendanceTimeAdjustment;
  if (!adjustment?.enabled) {
    return now;
  }

  const offset = adjustmentOffsetMinutes == null ? 0 : Number(adjustmentOffsetMinutes);
  if (!Number.isInteger(offset)) {
    throw new HttpsError('invalid-argument', 'adjustmentOffsetMinutes must be an integer');
  }

  if (adjustment.maxFutureMinutes == null || adjustment.maxPastMinutes == null) {
    if (offset !== 0) {
      throw new HttpsError('failed-precondition', '時間調整は現在時刻での登録のみ許可されています');
    }
    return now;
  }

  if (offset > adjustment.maxFutureMinutes || offset < -adjustment.maxPastMinutes) {
    throw new HttpsError('failed-precondition', '選択した時刻は許可範囲外です');
  }

  return admin.firestore.Timestamp.fromMillis(now.toMillis() + offset * 60 * 1000);
}

export const createManualClockInRecord = onCall(async (request: CallableRequest) => {
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
    const {
      staffId,
      staffName: staffNameArg,
      adjustmentOffsetMinutes,
    } = (request.data ?? {}) as {
      staffId?: string;
      staffName?: string;
      adjustmentOffsetMinutes?: unknown;
    };

    if (!staffId) {
      throw new HttpsError('invalid-argument', 'staffId is required');
    }

    const config = await getStoreConfig();
    if (config.features?.createAttendanceByManual !== true) {
      throw new HttpsError('failed-precondition', '手動打刻は現在無効です');
    }
    const adjustedClockIn = resolveAdjustedClockInTimestamp(adjustmentOffsetMinutes, config);

    const db = admin.firestore();
    let staffName = staffNameArg;
    if (!staffName) {
      const staffDoc = await db.collection('staffs').doc(staffId).get();
      staffName = staffDoc.exists ? (staffDoc.data()?.fullName as string) ?? 'Unknown' : 'Unknown';
    }
    const businessDate = await getBusinessDateForAttendance();

    // エラー: 全期間で closedStoreWithoutClockOut!==true の未退勤（clockIn あり & clockOut null）が存在する
    const existingSnap = await db
      .collection('attendances')
      .where('staffId', '==', staffId)
      .where('clockOut', '==', null)
      .get();

    const hasUnclockedNormal = existingSnap.docs.some((d) => {
      const data = d.data();
      return data.clockIn != null && data.closedStoreWithoutClockOut !== true;
    });

    if (hasUnclockedNormal) {
      return {
        success: false,
        code: 'already-clock-in',
        message: 'すでに出勤登録がされています。',
      };
    }

    // 警告: closedStoreWithoutClockOut === true の attendance が存在する
    const closedWithoutClockOutSnap = await db
      .collection('attendances')
      .where('staffId', '==', staffId)
      .where('closedStoreWithoutClockOut', '==', true)
      .limit(1)
      .get();
    const hasWarning = !closedWithoutClockOutSnap.empty;

    const nowTs = admin.firestore.FieldValue.serverTimestamp();
    const attendanceData = {
      staffId,
      date: businessDate,
      clockIn: adjustedClockIn,
      clockOut: null,
      closedStoreWithoutClockOut: false,
      isManual: true,
      nightMinutes: 0,
      totalMinutes: 0,
      staffsFullName: staffName,
      createdAt: nowTs,
      updatedAt: nowTs,
      // Phase4.1-B: 新フィールド
      breakMinutes: 0,
      actualWorkMinutes: null,
      nightWorkMinutes: 0,
      isOnBreak: false,
      currentBreakStartedAt: null,
      breakCount: 0,
      lastActionType: 'clock_in',
      lastActionAt: nowTs,
      lastActionByDeviceId: device.id,
      manualReason: null,
      payrollReflectedAt: null,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    };

    const docRef = await db.collection('attendances').add(attendanceData);

    await writeAttendanceLog({
      db,
      attendanceId: docRef.id,
      actionType: 'create_manual_clock_in',
      performedByUid: null,
      performedByDeviceId: device.id,
    });

    const result: Record<string, unknown> = {
      success: true,
      docId: docRef.id,
      message: `${staffName}さんの出勤記録を作成しました`,
    };
    if (hasWarning) {
      result.warning = '管理者に確認して、以前の出勤について正しいデータを入力して下さい。';
    }
    return result;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    console.error('Error in createManualClockInRecord:', error);
    throw new HttpsError('internal', 'Internal server error');
  }
});
