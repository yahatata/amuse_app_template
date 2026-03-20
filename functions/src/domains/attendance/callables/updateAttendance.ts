/**
 * Phase4.1-E: 管理者用勤怠編集 Callable
 *
 * 必須: attendanceId
 * 任意: clockIn, clockOut, addBreak, deleteBreakIds, markDeleted
 * 制約: attendanceId, staffId の変更不可
 * 権限: admin ロールのみ
 *
 * 参照: Flow1_DETAILED_SPEC セクション 6.4, 6.5
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getCallerDeviceByUid, isActive } from '../../../shared/devices';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { writeAttendanceLog } from '../helpers/attendanceLogs';
import { recalculateAttendanceFromBreaks } from '../helpers/recalculateAttendanceFromBreaks';

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

export const updateAttendance = onCall(async (request: CallableRequest) => {
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
      attendanceId,
      clockIn: clockInArg,
      clockOut: clockOutArg,
      addBreak: addBreakArg,
      updateBreaks: updateBreaksArg,
      deleteBreakIds,
      restoreBreakIds,
      markDeleted,
    } = (request.data ?? {}) as {
      attendanceId?: string;
      clockIn?: unknown;
      clockOut?: unknown;
      addBreak?: { startedAt: unknown; endedAt: unknown };
      updateBreaks?: Array<{ breakId: string; startedAt: unknown; endedAt: unknown }>;
      deleteBreakIds?: string[];
      restoreBreakIds?: string[];
      markDeleted?: boolean;
    };

    if (!attendanceId || typeof attendanceId !== 'string') {
      throw new HttpsError('invalid-argument', 'attendanceId is required');
    }

    const db = admin.firestore();
    const attendanceRef = db.collection('attendances').doc(attendanceId);
    const attendanceSnap = await attendanceRef.get();

    if (!attendanceSnap.exists) {
      throw new HttpsError('not-found', '勤怠データが見つかりません');
    }

    const attendanceData = attendanceSnap.data()!;
    if (attendanceData.isDeleted === true) {
      throw new HttpsError('failed-precondition', '既に削除済みの勤怠です');
    }

    if (markDeleted === true) {
      const nowTs = admin.firestore.Timestamp.now();
      await attendanceRef.update({
        isDeleted: true,
        deletedAt: nowTs,
        deletedBy: 'admin',
        updatedAt: FieldValue.serverTimestamp(),
      });

      await writeAttendanceLog({
        db,
        attendanceId,
        actionType: 'update_attendance',
        performedByUid: null,
        performedByDeviceId: device.id,
      });

      return {
        success: true,
        message: '勤怠を削除しました',
      };
    }

    const updatePayload: Record<string, unknown> = {
      lastActionType: 'update_attendance',
      lastActionAt: FieldValue.serverTimestamp(),
      lastActionByDeviceId: device.id,
      updatedAt: FieldValue.serverTimestamp(),
    };

    let clockIn = attendanceData.clockIn as admin.firestore.Timestamp | undefined;
    let clockOut = attendanceData.clockOut as admin.firestore.Timestamp | null | undefined;

    if (clockInArg != null) {
      clockIn = parseTimestamp(clockInArg);
      updatePayload.clockIn = clockIn;
    }
    if (clockOutArg !== undefined) {
      clockOut = clockOutArg != null ? parseTimestamp(clockOutArg) : null;
      updatePayload.clockOut = clockOut;
    }

    if (addBreakArg) {
      const startedAt = parseTimestamp(addBreakArg.startedAt);
      const endedAt = parseTimestamp(addBreakArg.endedAt);
      const breakRef = attendanceRef.collection('breaks').doc();
      await breakRef.set({
        startedAt,
        endedAt,
        isDeleted: false,
        deletedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    if (updateBreaksArg && Array.isArray(updateBreaksArg) && updateBreaksArg.length > 0) {
      for (const ub of updateBreaksArg) {
        if (!ub.breakId || ub.startedAt == null || ub.endedAt == null) continue;
        const startedAt = parseTimestamp(ub.startedAt);
        const endedAt = parseTimestamp(ub.endedAt);
        if (endedAt.toMillis() < startedAt.toMillis()) continue;
        const breakRef = attendanceRef.collection('breaks').doc(ub.breakId);
        await breakRef.update({
          startedAt,
          endedAt,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    if (deleteBreakIds && Array.isArray(deleteBreakIds) && deleteBreakIds.length > 0) {
      const nowTs = admin.firestore.Timestamp.now();
      const batch = db.batch();
      for (const breakId of deleteBreakIds) {
        const breakRef = attendanceRef.collection('breaks').doc(breakId);
        batch.update(breakRef, {
          isDeleted: true,
          deletedAt: nowTs,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }

    if (restoreBreakIds && Array.isArray(restoreBreakIds) && restoreBreakIds.length > 0) {
      const batch = db.batch();
      for (const breakId of restoreBreakIds) {
        const breakRef = attendanceRef.collection('breaks').doc(breakId);
        batch.update(breakRef, {
          isDeleted: false,
          deletedAt: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }

    if (Object.keys(updatePayload).length > 4) {
      await attendanceRef.update(updatePayload);
    }

    const config = await getStoreConfig();
    const recalcResult = await recalculateAttendanceFromBreaks({
      attendanceRef,
      attendanceData: {
        clockIn: clockIn ?? attendanceData.clockIn,
        clockOut: clockOut !== undefined ? clockOut : attendanceData.clockOut,
        staffId: attendanceData.staffId,
        date: attendanceData.date,
      },
      config,
    });

    const effectiveClockIn = clockIn ?? attendanceData.clockIn;
    const effectiveClockOut = clockOut !== undefined ? clockOut : attendanceData.clockOut;
    if (effectiveClockOut && effectiveClockIn) {
      const totalMinutes = Math.floor(
        (effectiveClockOut.toMillis() - effectiveClockIn.toMillis()) / (1000 * 60)
      );
      await attendanceRef.update({
        totalMinutes,
        nightMinutes: recalcResult.nightWorkMinutes,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await writeAttendanceLog({
      db,
      attendanceId,
      actionType: 'update_attendance',
      performedByUid: null,
      performedByDeviceId: device.id,
    });

    return {
      success: true,
      message: '勤怠を更新しました',
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('Error in updateAttendance:', error);
    throw new HttpsError('internal', 'Internal server error');
  }
});
