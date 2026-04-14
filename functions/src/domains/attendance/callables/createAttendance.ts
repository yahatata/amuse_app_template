/**
 * Phase4.1-E: 管理者用勤怠作成 Callable
 *
 * 必須: staffId, date (YYYY-MM-DD), clockIn
 * 任意: clockOut, breaks
 * 権限: admin ロールのみ
 *
 * 参照: Flow1_DETAILED_SPEC セクション 6.3
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getCallerDeviceByUid, isActive } from '../../../shared/devices';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { writeAttendanceLog } from '../helpers/attendanceLogs';
import { recalculateAttendanceFromBreaks } from '../helpers/recalculateAttendanceFromBreaks';
import { logOpsError } from "../../../shared/logging/logOpsError";

function parseTimestamp(v: unknown): admin.firestore.Timestamp {
  if (v instanceof admin.firestore.Timestamp) return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const seconds = o.seconds ?? o._seconds;
    const nanoseconds = o.nanoseconds ?? o._nanoseconds ?? 0;
    if (typeof seconds === 'number') {
      return new admin.firestore.Timestamp(seconds, typeof nanoseconds === 'number' ? nanoseconds : 0);
    }
  }
  if (typeof v === 'string') {
    const date = new Date(v);
    if (isNaN(date.getTime())) {
      throw new HttpsError('invalid-argument', 'Invalid timestamp format');
    }
    return admin.firestore.Timestamp.fromDate(date);
  }
  throw new HttpsError('invalid-argument', 'Invalid timestamp format');
}

export const createAttendance = onCall(async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;
  const device = await getCallerDeviceByUid(callerUid);
  if (!device || !isActive(device.status)) {
    throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
  }

  if (device.role !== 'admin') {
    throw new HttpsError('permission-denied', '管理者のみ実行できます');
  }

  try {
    const {
      staffId,
      staffName: staffNameArg,
      staffsFullName: staffsFullNameArg,
      date,
      clockIn: clockInArg,
      clockOut: clockOutArg,
      breaks: breaksArg,
    } = (request.data ?? {}) as {
      staffId?: string;
      staffName?: string;
      staffsFullName?: string;
      date?: string;
      clockIn?: unknown;
      clockOut?: unknown;
      breaks?: Array<{ startedAt: unknown; endedAt: unknown }>;
    };

    if (!staffId || typeof staffId !== 'string') {
      throw new HttpsError('invalid-argument', 'staffId is required');
    }
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new HttpsError('invalid-argument', 'date is required (YYYY-MM-DD)');
    }
    if (clockInArg == null) {
      throw new HttpsError('invalid-argument', 'clockIn is required');
    }

    const clockIn = parseTimestamp(clockInArg);
    const clockOut = clockOutArg != null ? parseTimestamp(clockOutArg) : null;

    const db = admin.firestore();
    let staffName = staffNameArg ?? staffsFullNameArg;
    if (!staffName) {
      const staffDoc = await db.collection('staffs').doc(staffId).get();
      staffName = staffDoc.exists ? (staffDoc.data()?.fullName as string) ?? 'Unknown' : 'Unknown';
    }

    const nowTs = FieldValue.serverTimestamp();
    const totalMinutes =
      clockOut != null
        ? Math.floor((clockOut.toMillis() - clockIn.toMillis()) / (1000 * 60))
        : 0;

    const attendanceData: Record<string, unknown> = {
      staffId,
      staffsFullName: staffName,
      date,
      clockIn,
      clockOut: clockOut ?? null,
      closedStoreWithoutClockOut: false,
      isManual: true,
      nightMinutes: 0,
      totalMinutes,
      createdAt: nowTs,
      updatedAt: nowTs,
      breakMinutes: 0,
      actualWorkMinutes: null,
      nightWorkMinutes: 0,
      isOnBreak: false,
      currentBreakStartedAt: null,
      breakCount: 0,
      lastActionType: 'create_attendance',
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

    const docRef = await db.collection('attendances').add(attendanceData);

    if (breaksArg && Array.isArray(breaksArg) && breaksArg.length > 0) {
      const batch = db.batch();
      for (const b of breaksArg) {
        const startedAt = parseTimestamp(b.startedAt);
        const endedAt = parseTimestamp(b.endedAt);
        const breakRef = docRef.collection('breaks').doc();
        batch.set(breakRef, {
          startedAt,
          endedAt,
          isDeleted: false,
          deletedAt: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }

    const config = await getStoreConfig();
    await recalculateAttendanceFromBreaks({
      attendanceRef: docRef,
      attendanceData: {
        clockIn,
        clockOut,
        staffId,
        date,
      },
      config,
    });

    await writeAttendanceLog({
      db,
      attendanceId: docRef.id,
      actionType: 'create_attendance',
      performedByUid: null,
      performedByDeviceId: device.id,
    });

    return {
      success: true,
      docId: docRef.id,
      message: `${staffName}さんの勤怠を作成しました`,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logOpsError({
      message: 'Error in createAttendance:',
      functionEntry: 'createAttendance',
      cause: error,
    });
    throw new HttpsError('internal', 'Internal server error');
  }
});
