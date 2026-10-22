/**
 * L7-A: スタッフ本人の月次勤怠取得
 *
 * request: { year, month } のみ（staffId/uid/userId 拒否）
 * staffId = request.auth.uid
 * date は businessDate (YYYY-MM-DD) として月境界を文字列比較
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { assertActiveStaff } from '../../staff/helpers/staffStatus';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import {
  rejectClientIdentityFields,
  throwAttendanceHttpsError,
  getAttendanceErrorKeyFromUnknown,
} from '../helpers/attendanceHttpsError';
import {
  assertYearMonth,
  getBusinessMonthDateRange,
} from '../helpers/attendanceBusinessDate';

function toIsoOrNull(value: unknown): string | null {
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export const getStaffAttendance = onCall(
  { region: 'asia-northeast1', maxInstances: 10 },
  async (request) => {
    const logContext: Record<string, unknown> = {
      callerUidPresent: !!request.auth?.uid,
    };

    try {
      if (!request.auth) {
        throwAttendanceHttpsError(
          'unauthenticated',
          'ATTENDANCE_UNAUTHENTICATED',
          'Authentication required',
        );
      }

      const uid = request.auth.uid;
      const raw = (request.data ?? {}) as Record<string, unknown>;
      rejectClientIdentityFields(raw);

      const { year, month } = assertYearMonth(raw.year, raw.month);
      Object.assign(logContext, { year, month });

      await assertActiveStaff(uid);

      const { startDateStr, endDateStr } = getBusinessMonthDateRange(year, month);
      Object.assign(logContext, { startDateStr, endDateStr });

      const db = admin.firestore();
      const attendanceSnapshot = await db
        .collection('attendances')
        .where('staffId', '==', uid)
        .where('date', '>=', startDateStr)
        .where('date', '<=', endDateStr)
        .orderBy('date', 'asc')
        .get();

      const attendances: Array<Record<string, unknown>> = [];

      attendanceSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.isDeleted === true) return;
        attendances.push({
          attendanceId: doc.id,
          date: data.date,
          clockIn: toIsoOrNull(data.clockIn),
          clockOut: toIsoOrNull(data.clockOut),
          breakMinutes: data.breakMinutes ?? 0,
          actualWorkMinutes: data.actualWorkMinutes ?? data.totalMinutes ?? null,
          nightWorkMinutes: data.nightWorkMinutes ?? data.nightMinutes ?? 0,
          isOnBreak: data.isOnBreak === true,
          isManual: data.isManual === true,
          closedStoreWithoutClockOut: data.closedStoreWithoutClockOut === true,
        });
      });

      logOpsSuccess({
        message: 'getStaffAttendance 成功',
        functionEntry: 'getStaffAttendance',
        context: {
          year,
          month,
          attendanceCount: attendances.length,
          startDateStr,
          endDateStr,
        },
      });

      return {
        success: true,
        data: {
          year,
          month,
          attendances,
          count: attendances.length,
        },
      };
    } catch (error) {
      const key = getAttendanceErrorKeyFromUnknown(error);
      if (key === 'STAFF_RETIRED' || key === 'STAFF_NOT_ACTIVE' || key === 'ATTENDANCE_UNAUTHENTICATED' || key === 'ATTENDANCE_INVALID_ARGUMENT') {
        throw error;
      }
      if (error instanceof HttpsError && (error.code === 'permission-denied' || error.code === 'unauthenticated' || error.code === 'invalid-argument')) {
        throw error;
      }

      logOpsError({
        message: '勤怠記録取得エラー',
        functionEntry: 'getStaffAttendance',
        cause: error,
        context: logContext,
      });

      throwAttendanceHttpsError(
        'internal',
        'ATTENDANCE_INTERNAL_ERROR',
        'Failed to get staff attendance',
      );
    }
  },
);
