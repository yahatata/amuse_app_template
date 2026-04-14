/**
 * Phase4.1-C: 休憩開始 Callable
 *
 * 引数: { attendanceId: string }
 * 成功時: { success: true, breakId: string, message: string }
 * エラー: already-exists（休憩中）, not-found, permission-denied 等
 *
 * 参照: Flow1_DETAILED_SPEC セクション 6.1
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { writeAttendanceLog } from '../helpers/attendanceLogs';
import { logOpsError } from "../../../shared/logging/logOpsError";

function resolveAdjustedTimestamp(
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
    throw new HttpsError('failed-precondition', '出勤時刻より過去の時刻は登録できません');
  }
  return adjusted;
}

export const startBreak = onCall(async (request: CallableRequest) => {
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
    const { attendanceId, adjustmentOffsetMinutes } = (request.data ?? {}) as {
      attendanceId?: string;
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

    const attendanceData = attendanceSnap.data()!;
    if (attendanceData.clockOut) {
      throw new HttpsError('failed-precondition', '既に退勤済みです');
    }
    if (attendanceData.isOnBreak === true) {
      throw new HttpsError('already-exists', '既に休憩中です');
    }

    const clockIn = attendanceData.clockIn as admin.firestore.Timestamp;
    if (!clockIn) {
      throw new HttpsError('failed-precondition', '出勤時刻が取得できません');
    }
    const config = await getStoreConfig();
    const startedAt = resolveAdjustedTimestamp(
      adjustmentOffsetMinutes,
      config,
      clockIn
    );

    const nowTs = FieldValue.serverTimestamp();
    const breakRef = attendanceRef.collection('breaks').doc();

    await db.runTransaction(async (tx) => {
      tx.set(breakRef, {
        startedAt,
        endedAt: null,
        isDeleted: false,
        deletedAt: null,
        createdAt: nowTs,
        updatedAt: nowTs,
      });

      tx.update(attendanceRef, {
        isOnBreak: true,
        currentBreakStartedAt: startedAt,
        breakCount: (attendanceData.breakCount ?? 0) + 1,
        lastActionType: 'break_start',
        lastActionAt: nowTs,
        lastActionByDeviceId: device.id,
        updatedAt: nowTs,
      });
    });

    await writeAttendanceLog({
      db,
      attendanceId,
      actionType: 'start_break',
      performedByUid: null,
      performedByDeviceId: device.id,
    });

    return {
      success: true,
      breakId: breakRef.id,
      message: '休憩を開始しました',
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logOpsError({
      message: 'Error in startBreak:',
      functionEntry: 'startBreak',
      cause: error,
    });
    throw new HttpsError('internal', 'Internal server error');
  }
});
