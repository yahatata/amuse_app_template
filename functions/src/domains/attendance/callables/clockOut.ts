/**
 * Phase4 01: 退勤打刻 Callable
 *
 * 注意:
 * - updateManualClockOutRecord.ts とデータ更新・チェックロジックを揃えること。
 * - 片方を変更した場合、もう片方にも同等変更が必要な可能性がある。
 *
 * 警告・エラー判定あり。1時間猶予内は通常退勤可。
 * 経過時間による例外は廃止。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { getBusinessDateForAttendance } from '../../storeMeta/repos/getCurrentBusinessDateKeyOrThrow';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { writeAttendanceLog } from '../helpers/attendanceLogs';
import {
  endActiveBreaksForClockOut,
  recalculateAttendanceFromBreaks,
} from '../helpers/recalculateAttendanceFromBreaks';
import { logOpsError } from "../../../shared/logging/logOpsError";

const GRACE_HOURS = 1;

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

export const clockOut = onCall(async (request: CallableRequest) => {
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
      docId,
      adjustmentOffsetMinutes,
    } = (request.data ?? {}) as { staffId?: string; docId?: string; adjustmentOffsetMinutes?: unknown };
    const db = admin.firestore();

    let attendanceRef: admin.firestore.DocumentReference;
    let attendanceData: admin.firestore.DocumentData;

    if (docId) {
      const doc = await db.collection('attendances').doc(docId).get();
      if (!doc.exists) {
        return { success: false, code: 'no-unclocked-attendance', message: '勤務中のデータがありません' };
      }
      attendanceRef = doc.ref;
      attendanceData = doc.data()!;
    } else if (staffId) {
      const businessDate = await getBusinessDateForAttendance();
      const snap = await db
        .collection('attendances')
        .where('staffId', '==', staffId)
        .where('date', '==', businessDate)
        .where('clockOut', '==', null)
        .get();

      const targetDoc = snap.docs.find((d) => {
        const d2 = d.data();
        return d2.clockIn != null;
      });

      if (!targetDoc) {
        return { success: false, code: 'no-unclocked-attendance', message: '勤務中のデータがありません' };
      }
      attendanceRef = targetDoc.ref;
      attendanceData = targetDoc.data();
    } else {
      throw new HttpsError('invalid-argument', 'staffId or docId is required');
    }

    if (attendanceData.clockOut) {
      return { success: false, code: 'no-unclocked-attendance', message: '勤務中のデータがありません' };
    }
    if (!attendanceData.clockIn) {
      return { success: false, code: 'no-unclocked-attendance', message: '勤務中のデータがありません' };
    }

    // 1時間猶予チェック: closedStoreWithoutClockOut かつ closedAt があり、1時間超過ならパスワードフローへ
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

    const config = await getStoreConfig();
    const adjustedClockOut = resolveAdjustedClockOutTimestamp(
      adjustmentOffsetMinutes,
      config,
      attendanceData.clockIn as admin.firestore.Timestamp
    );

    // 【4.1-D】休憩中退勤時: 休憩自動終了 → breaks 反映 → 親再集計
    await endActiveBreaksForClockOut(attendanceRef, adjustedClockOut);

    // 警告: 同じスタッフに他に closedStoreWithoutClockOut の attendance があるか
    const staffIdVal = attendanceData.staffId as string;
    const otherClosedSnap = await db
      .collection('attendances')
      .where('staffId', '==', staffIdVal)
      .where('closedStoreWithoutClockOut', '==', true)
      .get();
    const hasWarning = otherClosedSnap.docs.some((d) => d.id !== attendanceRef.id);

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

    const totalMinutes = Math.floor(
      (adjustedClockOut.toDate().getTime() -
        (attendanceData.clockIn as admin.firestore.Timestamp).toDate().getTime()) /
        (1000 * 60)
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
      actionType: 'clock_out',
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
    if (error instanceof HttpsError) throw error;
    logOpsError({
      message: 'Error in clockOut:',
      failureType: 'business',
      functionEntry: 'clockOut',
      cause: error,
    });
    throw new HttpsError('internal', 'Internal server error');
  }
});
