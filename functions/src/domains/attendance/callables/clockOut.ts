/**
 * Phase4 01 / L7-A: 退勤打刻 Callable
 *
 * - open attendance 特定 → active break 終了 → clockOut / 集計を 1 transaction
 * - Flutter 互換: no-unclocked-attendance / grace-period-expired は soft { success:false, code }
 * - attendanceLogs は commit 後 best-effort
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue, type Timestamp } from 'firebase-admin/firestore';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { getBusinessDateForAttendance } from '../../storeMeta/repos/getCurrentBusinessDateKeyOrThrow';
import { getStoreConfig } from '../../../shared/config/configLoader';
import {
  DEFAULT_NIGHT_WORK_END_HOUR,
  DEFAULT_NIGHT_WORK_START_HOUR,
} from '../../../shared/config/defaults';
import type { StoreConfig } from '../../../shared/config/types';
import { writeAttendanceLog } from '../helpers/attendanceLogs';
import { calculateNightWorkMinutes } from '../helpers/nightWorkMinutes';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { logger } from 'firebase-functions';

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

function computeTotalsFromBreakDocs(params: {
  clockIn: Timestamp;
  clockOut: Timestamp;
  breakDocs: Array<FirebaseFirestore.DocumentData>;
  endingBreakIds: Set<string>;
  endTs: Timestamp;
  config: StoreConfig;
}): {
  breakMinutes: number;
  actualWorkMinutes: number;
  nightWorkMinutes: number;
  totalMinutes: number;
} {
  const { clockIn, clockOut, breakDocs, endingBreakIds, endTs, config } = params;
  const nightWorkStartHour =
    config.attendance?.nightWorkStartHour ?? DEFAULT_NIGHT_WORK_START_HOUR;
  const nightWorkEndHour = config.attendance?.nightWorkEndHour ?? DEFAULT_NIGHT_WORK_END_HOUR;

  let breakMinutes = 0;
  let nightBreakMinutes = 0;

  for (const row of breakDocs) {
    const d = row.data as FirebaseFirestore.DocumentData;
    const id = row.id as string;
    if (d.isDeleted === true) continue;
    const startedAt = d.startedAt as Timestamp;
    let endedAt = d.endedAt as Timestamp | null;
    if (endingBreakIds.has(id)) {
      endedAt = endTs;
    }
    if (!endedAt) continue;
    breakMinutes += Math.floor((endedAt.toMillis() - startedAt.toMillis()) / (1000 * 60));
    nightBreakMinutes += calculateNightWorkMinutes(
      startedAt,
      endedAt,
      nightWorkStartHour,
      nightWorkEndHour,
    );
  }

  const totalMinutes = Math.floor(
    (clockOut.toMillis() - clockIn.toMillis()) / (1000 * 60),
  );
  const actualWorkMinutes = Math.max(0, totalMinutes - breakMinutes);
  const grossNight = calculateNightWorkMinutes(
    clockIn,
    clockOut,
    nightWorkStartHour,
    nightWorkEndHour,
  );
  const nightWorkMinutes = Math.max(0, grossNight - nightBreakMinutes);

  return { breakMinutes, actualWorkMinutes, nightWorkMinutes, totalMinutes };
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

  const reqData = (request.data ?? {}) as { staffId?: string; docId?: string };
  const logContext: Record<string, unknown> = { callerUid, deviceId: device.id };
  if (reqData.staffId) logContext.staffId = reqData.staffId;
  if (reqData.docId) logContext.docId = reqData.docId;

  try {
    const {
      staffId,
      docId,
      adjustmentOffsetMinutes,
    } = (request.data ?? {}) as { staffId?: string; docId?: string; adjustmentOffsetMinutes?: unknown };
    const db = admin.firestore();

    let attendanceRef: admin.firestore.DocumentReference;

    if (docId) {
      const doc = await db.collection('attendances').doc(docId).get();
      if (!doc.exists) {
        return { success: false, code: 'no-unclocked-attendance', message: '勤務中のデータがありません' };
      }
      attendanceRef = doc.ref;
    } else if (staffId) {
      const businessDate = await getBusinessDateForAttendance();
      const snap = await db
        .collection('attendances')
        .where('staffId', '==', staffId)
        .where('date', '==', businessDate)
        .where('clockOut', '==', null)
        .get();

      const targetDoc = snap.docs.find((d) => d.data().clockIn != null);
      if (!targetDoc) {
        return { success: false, code: 'no-unclocked-attendance', message: '勤務中のデータがありません' };
      }
      attendanceRef = targetDoc.ref;
    } else {
      throw new HttpsError('invalid-argument', 'staffId or docId is required');
    }

    // grace / staff 活性は tx 前に判定（業務メッセージ互換のため）
    const preSnap = await attendanceRef.get();
    if (!preSnap.exists) {
      return { success: false, code: 'no-unclocked-attendance', message: '勤務中のデータがありません' };
    }
    const preData = preSnap.data()!;

    const { assertActiveStaff } = await import('../../staff/helpers/staffStatus');
    await assertActiveStaff(String(preData.staffId));

    Object.assign(logContext, {
      docId: attendanceRef.id,
      staffId: preData.staffId,
      date: preData.date,
    });

    if (preData.clockOut || !preData.clockIn) {
      return { success: false, code: 'no-unclocked-attendance', message: '勤務中のデータがありません' };
    }

    const closedAt = preData.closedAt as admin.firestore.Timestamp | undefined;
    if (preData.closedStoreWithoutClockOut === true && closedAt) {
      const closedAtMs = closedAt.toDate().getTime();
      const elapsedHours = (Date.now() - closedAtMs) / (1000 * 60 * 60);
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
      preData.clockIn as admin.firestore.Timestamp,
    );

    const staffIdVal = preData.staffId as string;
    const otherClosedSnap = await db
      .collection('attendances')
      .where('staffId', '==', staffIdVal)
      .where('closedStoreWithoutClockOut', '==', true)
      .get();
    const hasWarning = otherClosedSnap.docs.some((d) => d.id !== attendanceRef.id);
    Object.assign(logContext, { hasWarning });

    type TxOutcome =
      | { kind: 'missing' }
      | { kind: 'ok'; staffName: string };

    const outcome = await db.runTransaction(async (tx): Promise<TxOutcome> => {
      const attSnap = await tx.get(attendanceRef);
      if (!attSnap.exists) return { kind: 'missing' };
      const attendanceData = attSnap.data()!;
      if (attendanceData.clockOut || !attendanceData.clockIn) {
        return { kind: 'missing' };
      }

      const breaksSnap = await tx.get(attendanceRef.collection('breaks'));
      const endingBreakIds = new Set<string>();
      for (const b of breaksSnap.docs) {
        const bd = b.data();
        if (bd.isDeleted === true) continue;
        if (bd.endedAt == null) {
          endingBreakIds.add(b.id);
          tx.update(b.ref, {
            endedAt: adjustedClockOut,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      const totals = computeTotalsFromBreakDocs({
        clockIn: attendanceData.clockIn as Timestamp,
        clockOut: adjustedClockOut,
        breakDocs: breaksSnap.docs.map((d) => ({ id: d.id, data: d.data() })),
        endingBreakIds,
        endTs: adjustedClockOut,
        config,
      });

      tx.update(attendanceRef, {
        clockOut: adjustedClockOut,
        isOnBreak: false,
        currentBreakStartedAt: null,
        breakMinutes: totals.breakMinutes,
        actualWorkMinutes: totals.actualWorkMinutes,
        nightWorkMinutes: totals.nightWorkMinutes,
        totalMinutes: totals.totalMinutes,
        nightMinutes: totals.nightWorkMinutes,
        lastActionType: 'clock_out',
        lastActionAt: FieldValue.serverTimestamp(),
        lastActionByDeviceId: device.id,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        kind: 'ok',
        staffName: (attendanceData.staffsFullName as string) ?? '',
      };
    });

    if (outcome.kind === 'missing') {
      return { success: false, code: 'no-unclocked-attendance', message: '勤務中のデータがありません' };
    }

    try {
      await writeAttendanceLog({
        db,
        attendanceId: attendanceRef.id,
        actionType: 'clock_out',
        performedByUid: null,
        performedByDeviceId: device.id,
      });
    } catch (logErr) {
      logger.warn('clockOut: attendanceLogs write failed (non-fatal)', {
        attendanceId: attendanceRef.id,
        deviceId: device.id,
      });
    }

    const result: Record<string, unknown> = {
      success: true,
      docId: attendanceRef.id,
      message: `${outcome.staffName}さんの退勤記録を更新しました`,
    };

    if (hasWarning) {
      result.warning = '管理者に確認して、以前の出勤について正しいデータを入力して下さい。';
    }

    logOpsSuccess({
      message: 'clockOut 成功',
      functionEntry: 'clockOut',
      context: {
        staffId: preData.staffId,
        date: preData.date,
        docId: attendanceRef.id,
        deviceId: device.id,
        hasWarning,
      },
    });

    return result;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logOpsError({
      message: 'Error in clockOut:',
      functionEntry: 'clockOut',
      cause: error,
      context: logContext,
    });
    throw new HttpsError('internal', 'Internal server error');
  }
});
