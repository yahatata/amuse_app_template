/**
 * Phase4 01 / L7-A: 出勤打刻 Callable
 *
 * - 未退勤 open attendance の作成を transaction 化（同時 clockIn で 1 件のみ）
 * - Flutter 互換: already-clock-in は soft { success:false, code }
 * - QR token consume なし
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { getBusinessDateForAttendance } from '../../storeMeta/repos/getCurrentBusinessDateKeyOrThrow';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { writeAttendanceLog } from '../helpers/attendanceLogs';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { logger } from 'firebase-functions';

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

function isOpenUnclockedAttendance(data: FirebaseFirestore.DocumentData): boolean {
  return data.clockIn != null && data.closedStoreWithoutClockOut !== true && data.clockOut == null;
}

export const clockIn = onCall(async (request: CallableRequest) => {
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

  const logContext: Record<string, unknown> = { callerUid, deviceId: device.id };

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

    const { assertActiveStaff } = await import('../../staff/helpers/staffStatus');
    await assertActiveStaff(staffId);

    Object.assign(logContext, { staffId });

    const config = await getStoreConfig();
    const adjustedClockIn = resolveAdjustedClockInTimestamp(adjustmentOffsetMinutes, config);

    const db = admin.firestore();
    let staffName = staffNameArg;
    if (!staffName) {
      const staffDoc = await db.collection('staffs').doc(staffId).get();
      staffName = staffDoc.exists ? (staffDoc.data()?.fullName as string) ?? 'Unknown' : 'Unknown';
    }
    const businessDate = await getBusinessDateForAttendance();
    Object.assign(logContext, { businessDate });

    const closedWithoutClockOutSnap = await db
      .collection('attendances')
      .where('staffId', '==', staffId)
      .where('closedStoreWithoutClockOut', '==', true)
      .limit(1)
      .get();
    const hasWarning = !closedWithoutClockOutSnap.empty;
    Object.assign(logContext, { hasWarning });

    const newRef = db.collection('attendances').doc();
    const nowTs = FieldValue.serverTimestamp();
    const attendanceData = {
      staffId,
      date: businessDate,
      clockIn: adjustedClockIn,
      clockOut: null,
      closedStoreWithoutClockOut: false,
      isManual: false,
      nightMinutes: 0,
      totalMinutes: 0,
      staffsFullName: staffName,
      createdAt: nowTs,
      updatedAt: nowTs,
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
      payrollStatus: 'unreflected',
      reflectedPayrollRunId: null,
      reflectedAt: null,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    };

    type TxOutcome =
      | { kind: 'duplicate' }
      | { kind: 'created'; docId: string };

    const outcome = await db.runTransaction(async (tx): Promise<TxOutcome> => {
      const existingSnap = await tx.get(
        db
          .collection('attendances')
          .where('staffId', '==', staffId)
          .where('clockOut', '==', null),
      );

      const hasUnclockedNormal = existingSnap.docs.some((d) => isOpenUnclockedAttendance(d.data()));
      if (hasUnclockedNormal) {
        return { kind: 'duplicate' };
      }

      tx.set(newRef, attendanceData);
      return { kind: 'created', docId: newRef.id };
    });

    if (outcome.kind === 'duplicate') {
      return {
        success: false,
        code: 'already-clock-in',
        message: 'すでに出勤登録がされています。',
      };
    }

    Object.assign(logContext, { docId: outcome.docId });

    try {
      await writeAttendanceLog({
        db,
        attendanceId: outcome.docId,
        actionType: 'clock_in',
        performedByUid: null,
        performedByDeviceId: device.id,
      });
    } catch (logErr) {
      logger.warn('clockIn: attendanceLogs write failed (non-fatal)', {
        attendanceId: outcome.docId,
        deviceId: device.id,
      });
    }

    const result: Record<string, unknown> = {
      success: true,
      docId: outcome.docId,
      message: `${staffName}さんの出勤記録を作成しました`,
    };

    if (hasWarning) {
      result.warning = '管理者に確認して、以前の出勤について正しいデータを入力して下さい。';
    }

    logOpsSuccess({
      message: 'clockIn 成功',
      functionEntry: 'clockIn',
      context: {
        staffId,
        businessDate,
        docId: outcome.docId,
        deviceId: device.id,
        hasWarning,
      },
    });

    return result;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logOpsError({
      message: 'Error in clockIn:',
      functionEntry: 'clockIn',
      cause: error,
      context: logContext,
    });
    throw new HttpsError('internal', 'Internal server error');
  }
});
