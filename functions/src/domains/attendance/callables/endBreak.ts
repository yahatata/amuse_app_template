/**
 * Phase4.1-C: 休憩終了 Callable
 *
 * 引数: { attendanceId: string, breakId?: string, adjustmentOffsetMinutes?: number }
 * - breakId 未指定時はサーバー側で endedAt==null の break を検索して終了する
 * 成功時: { success: true, message: string }
 * エラー: not-found, failed-precondition（既に終了済み）等
 *
 * 参照: Flow1_DETAILED_SPEC セクション 6.2
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { writeAttendanceLog } from '../helpers/attendanceLogs';
import { recalculateAttendanceFromBreaks } from '../helpers/recalculateAttendanceFromBreaks';
import { logOpsError } from "../../../shared/logging/logOpsError";

function resolveAdjustedEndTimestamp(
  adjustmentOffsetMinutes: unknown,
  config: Awaited<ReturnType<typeof getStoreConfig>>,
  minTimestamp: admin.firestore.Timestamp
): admin.firestore.Timestamp {
  const now = admin.firestore.Timestamp.now();
  const adjustment = config.attendanceTimeAdjustment;
  let adjusted = now;

  if (adjustment?.enabled) {
    const offset = adjustmentOffsetMinutes == null ? 0 : Number(adjustmentOffsetMinutes);
    if (!Number.isInteger(offset)) {
      throw new HttpsError('invalid-argument', 'adjustmentOffsetMinutes must be an integer');
    }

    if (adjustment.maxFutureMinutes == null || adjustment.maxPastMinutes == null) {
      if (offset !== 0) {
        throw new HttpsError('failed-precondition', '時間調整は現在時刻での登録のみ許可されています');
      }
    } else if (offset > adjustment.maxFutureMinutes || offset < -adjustment.maxPastMinutes) {
      throw new HttpsError('failed-precondition', '選択した時刻は許可範囲外です');
    } else {
      adjusted = admin.firestore.Timestamp.fromMillis(now.toMillis() + offset * 60 * 1000);
    }
  }

  if (adjusted.toMillis() < minTimestamp.toMillis()) {
    throw new HttpsError('failed-precondition', '休憩開始時刻より過去の時刻は登録できません');
  }
  return adjusted;
}

export const endBreak = onCall(async (request: CallableRequest) => {
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
    const { attendanceId, breakId, adjustmentOffsetMinutes } = (request.data ?? {}) as {
      attendanceId?: string;
      breakId?: string;
      adjustmentOffsetMinutes?: unknown;
    };
    if (!attendanceId) {
      throw new HttpsError('invalid-argument', 'attendanceId is required');
    }

    const db = admin.firestore();
    const attendanceRef = db.collection('attendances').doc(attendanceId);
    const attendanceSnap = await attendanceRef.get();

    if (!attendanceSnap.exists) {
      throw new HttpsError('not-found', '勤怠データが見つかりません');
    }

    let breakRef: admin.firestore.DocumentReference;
    if (breakId) {
      breakRef = attendanceRef.collection('breaks').doc(breakId);
    } else {
      const activeBreakSnap = await attendanceRef
        .collection('breaks')
        .where('endedAt', '==', null)
        .limit(1)
        .get();
      if (activeBreakSnap.empty) {
        throw new HttpsError('not-found', '休憩中の break が見つかりません');
      }
      breakRef = activeBreakSnap.docs[0].ref;
    }

    const breakSnap = await breakRef.get();
    if (!breakSnap.exists) {
      throw new HttpsError('not-found', '休憩データが見つかりません');
    }

    const breakData = breakSnap.data()!;
    if (breakData.endedAt != null) {
      throw new HttpsError('failed-precondition', '既に休憩終了済みです');
    }
    if (breakData.isDeleted === true) {
      throw new HttpsError('failed-precondition', '削除済みの休憩です');
    }

    const startedAt = breakData.startedAt as admin.firestore.Timestamp;
    if (!startedAt) {
      throw new HttpsError('failed-precondition', '休憩開始時刻が取得できません');
    }
    const config = await getStoreConfig();
    const endedAt = resolveAdjustedEndTimestamp(
      adjustmentOffsetMinutes,
      config,
      startedAt
    );

    await breakRef.update({
      endedAt,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const attendanceData = attendanceSnap.data()!;
    await attendanceRef.update({
      isOnBreak: false,
      currentBreakStartedAt: null,
      lastActionType: 'break_end',
      lastActionAt: FieldValue.serverTimestamp(),
      lastActionByDeviceId: device.id,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await recalculateAttendanceFromBreaks({
      attendanceRef,
      attendanceData: {
        clockIn: attendanceData.clockIn,
        clockOut: attendanceData.clockOut,
        staffId: attendanceData.staffId,
        date: attendanceData.date,
      },
      config,
    });

    await writeAttendanceLog({
      db,
      attendanceId,
      actionType: 'end_break',
      performedByUid: null,
      performedByDeviceId: device.id,
    });

    return {
      success: true,
      message: '休憩を終了しました',
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logOpsError({
      message: 'Error in endBreak:',
      functionEntry: 'endBreak',
      cause: error,
    });
    throw new HttpsError('internal', 'Internal server error');
  }
});
