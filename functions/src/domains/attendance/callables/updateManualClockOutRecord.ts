/**
 * 注意:
 * - clockOut.ts とデータ更新・チェックロジックを揃えること。
 * - 片方を変更した場合、もう片方にも同等変更が必要な可能性がある。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { writeAttendanceLog } from '../helpers/attendanceLogs';
import {
  endActiveBreaksForClockOut,
  recalculateAttendanceFromBreaks,
} from '../helpers/recalculateAttendanceFromBreaks';
import { logOpsError } from "../../../shared/logging/logOpsError";

const GRACE_HOURS = 1;

function calculateTotalMinutes(
  clockIn: admin.firestore.Timestamp,
  clockOut: admin.firestore.Timestamp
): number {
  const jstOffset = 9 * 60 * 60 * 1000;
  const clockInJST = new Date(clockIn.toDate().getTime() + jstOffset);
  const clockOutJST = new Date(clockOut.toDate().getTime() + jstOffset);
  return Math.floor((clockOutJST.getTime() - clockInJST.getTime()) / (1000 * 60));
}

function resolveAdjustedClockOutTimestamp(
  adjustmentOffsetMinutes: unknown,
  config: Awaited<ReturnType<typeof getStoreConfig>>,
  clockIn: admin.firestore.Timestamp
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

  if (adjusted.toMillis() < clockIn.toMillis()) {
    throw new HttpsError('failed-precondition', '出勤時刻より過去の退勤時間は登録できません');
  }
  return adjusted;
}

export const updateManualClockOutRecord = onCall(async (request: CallableRequest) => {
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
      docId,
      adjustmentOffsetMinutes,
    } = (request.data ?? {}) as { docId?: string; adjustmentOffsetMinutes?: unknown };
    if (!docId) {
      throw new HttpsError('invalid-argument', 'docId is required');
    }

    const config = await getStoreConfig();
    if (config.features?.createAttendanceByManual !== true) {
      throw new HttpsError('failed-precondition', '手動打刻は現在無効です');
    }

    const db = admin.firestore();
    const attendanceDoc = await db.collection('attendances').doc(docId).get();
    if (!attendanceDoc.exists) {
      return { success: false, code: 'no-unclocked-attendance', message: '勤務中のデータがありません' };
    }
    const attendanceRef = attendanceDoc.ref;
    const attendanceData = attendanceDoc.data()!;

    if (attendanceData.clockOut || !attendanceData.clockIn) {
      return { success: false, code: 'no-unclocked-attendance', message: '勤務中のデータがありません' };
    }

    const closedAt = attendanceData.closedAt as admin.firestore.Timestamp | undefined;
    if (attendanceData.closedStoreWithoutClockOut === true && closedAt) {
      const closedAtMs = closedAt.toDate().getTime();
      const nowMs = Date.now();
      const elapsedHours = (nowMs - closedAtMs) / (1000 * 60 * 60);
      if (elapsedHours >= GRACE_HOURS) {
        return {
          success: false,
          code: 'grace-period-expired',
          message: '閉店から1時間を経過しています。未退勤一覧からパスワードを入力して退勤してください。',
        };
      }
    }

    const staffIdVal = attendanceData.staffId as string;
    const otherClosedSnap = await db
      .collection('attendances')
      .where('staffId', '==', staffIdVal)
      .where('closedStoreWithoutClockOut', '==', true)
      .get();
    const hasWarning = otherClosedSnap.docs.some((d) => d.id !== attendanceRef.id);

    const adjustedClockOut = resolveAdjustedClockOutTimestamp(
      adjustmentOffsetMinutes,
      config,
      attendanceData.clockIn as admin.firestore.Timestamp
    );

    await endActiveBreaksForClockOut(attendanceRef, adjustedClockOut);

    const nowTs = admin.firestore.FieldValue.serverTimestamp();
    await attendanceRef.update({
      clockOut: adjustedClockOut,
      updatedAt: nowTs,
    });

    const recalcResult = await recalculateAttendanceFromBreaks({
      attendanceRef,
      attendanceData: {
        clockIn: attendanceData.clockIn as admin.firestore.Timestamp,
        clockOut: adjustedClockOut,
        staffId: attendanceData.staffId,
        date: attendanceData.date,
      },
      config,
    });

    const totalMinutes = calculateTotalMinutes(
      attendanceData.clockIn as admin.firestore.Timestamp,
      adjustedClockOut
    );
    await attendanceRef.update({
      totalMinutes,
      nightMinutes: recalcResult.nightWorkMinutes,
      lastActionType: 'clock_out',
      lastActionAt: nowTs,
      lastActionByDeviceId: device.id,
    });

    await writeAttendanceLog({
      db,
      attendanceId: attendanceRef.id,
      actionType: 'update_manual_clock_out',
      performedByUid: null,
      performedByDeviceId: device.id,
    });

    const staffName = (attendanceData.staffsFullName as string) ?? '';
    const result: Record<string, unknown> = {
      success: true,
      docId: attendanceRef.id,
      message: `${staffName}さんの退勤記録を更新しました`,
    };
    if (hasWarning) {
      result.warning = '管理者に確認して、以前の出勤について正しいデータを入力して下さい。';
    }
    return result;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logOpsError({
      message: 'Error in updateManualClockOutRecord:',
      functionEntry: 'updateManualClockOutRecord',
      cause: error,
    });
    throw new HttpsError('internal', 'Internal server error');
  }
});
