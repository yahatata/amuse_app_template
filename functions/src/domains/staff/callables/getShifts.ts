/**
 * スタッフ本人のシフト一覧取得（L6-A 契約）
 *
 * - request.auth.uid 固定（client userId は拒否）
 * - 正常 0 件は success + empty array
 * - failure は HttpsError（soft-fail / {success:false} 禁止）
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { isInsufficientDaysNotificationSent } from '../../shift/services/helpers';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { assertActiveStaff } from '../helpers/staffStatus';
import { getShiftErrorKeyFromUnknown, throwShiftHttpsError } from '../helpers/shiftHttpsError';

export interface GetShiftsItem {
  requestId: string;
  dateKey: string;
  /** LINE 互換エイリアス（dateKey と同値） */
  date: string;
  startMinute: number;
  endMinute: number;
  start: string;
  end: string;
  /** assignment 由来は true、pending request は null */
  confirmed: boolean | null;
  /** pending request のみ 'pending'。assignment は null */
  requestStatus: 'pending' | null;
  source: 'assignment' | 'pending_request';
}

export interface GetShiftsResponse {
  success: true;
  data: {
    shifts: GetShiftsItem[];
    count: number;
  };
}

function minutesToHhMm(minutes: number): string {
  if (minutes === 1440) return '24:00';
  const hour = Math.floor(minutes / 60);
  const min = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function coerceMinutes(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && /^\d{2}:\d{2}$/.test(raw.trim())) {
    const [h, m] = raw.trim().split(':').map(Number);
    if (h === 24 && m === 0) return 1440;
    return h * 60 + m;
  }
  return null;
}

function jstYearMonthsAroundNow(now: Date = new Date()): string[] {
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const months: string[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth() + i, 1));
    months.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
    );
  }
  return months;
}

export const getShifts = onCall(async (request): Promise<GetShiftsResponse> => {
  if (!request.auth) {
    throwShiftHttpsError(
      'unauthenticated',
      'SHIFT_UNAUTHENTICATED',
      'Authentication required',
    );
  }

  const uid = request.auth.uid;
  const data = (request.data ?? {}) as Record<string, unknown>;

  if (data.userId !== undefined || data.staffId !== undefined || data.uid !== undefined) {
    throwShiftHttpsError(
      'invalid-argument',
      'SHIFT_INVALID_ARGUMENT',
      'userId/staffId/uid must not be provided',
    );
  }

  try {
    await assertActiveStaff(uid);

    const db = admin.firestore();
    const shifts: GetShiftsItem[] = [];
    const months = jstYearMonthsAroundNow();

    for (const yearMonth of months) {
      const daysSnapshot = await db
        .collection('shifts')
        .doc(yearMonth)
        .collection('days')
        .get();

      for (const dayDoc of daysSnapshot.docs) {
        const dayData = dayDoc.data();
        const dateKey = dayDoc.id;
        const businessHours = dayData.businessHours as { isClosed?: boolean } | undefined;
        if (businessHours?.isClosed === true) {
          continue;
        }

        const assignments = Array.isArray(dayData.assignments) ? dayData.assignments : [];
        for (const assignment of assignments) {
          if (assignment == null || typeof assignment !== 'object') continue;
          const row = assignment as Record<string, unknown>;
          const staffIdStr = row.staffId != null ? String(row.staffId) : '';
          if (staffIdStr !== String(uid)) continue;

          const startMinute = coerceMinutes(row.startMinute);
          const endMinute = coerceMinutes(row.endMinute);
          if (startMinute == null || endMinute == null) {
            throwShiftHttpsError(
              'internal',
              'SHIFT_INTERNAL_ERROR',
              `Malformed assignment minutes on ${dateKey}`,
            );
          }

          const sourceRequestId =
            typeof row.sourceRequestId === 'string' && row.sourceRequestId
              ? row.sourceRequestId
              : 'assignment';

          shifts.push({
            requestId: `${dateKey}_${sourceRequestId}`,
            dateKey,
            date: dateKey,
            startMinute,
            endMinute,
            start: minutesToHhMm(startMinute),
            end: minutesToHhMm(endMinute),
            confirmed: true,
            requestStatus: null,
            source: 'assignment',
          });
        }
      }
    }

    const requestsSnapshot = await db
      .collection('shiftRequests')
      .where('staffId', '==', uid)
      .where('status', '==', 'pending')
      .get();

    for (const requestDoc of requestsSnapshot.docs) {
      const requestData = requestDoc.data();
      const dateKey = typeof requestData.dateKey === 'string' ? requestData.dateKey : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        throwShiftHttpsError(
          'internal',
          'SHIFT_INTERNAL_ERROR',
          'Malformed pending shiftRequest dateKey',
        );
      }
      const yearMonth = dateKey.substring(0, 7);

      const dayDoc = await db
        .collection('shifts')
        .doc(yearMonth)
        .collection('days')
        .doc(dateKey)
        .get();

      if (dayDoc.exists) {
        const businessHours = dayDoc.data()?.businessHours as { isClosed?: boolean } | undefined;
        if (businessHours?.isClosed === true) {
          continue;
        }
      }

      let notificationSent = false;
      try {
        notificationSent = await isInsufficientDaysNotificationSent(yearMonth);
      } catch {
        throwShiftHttpsError(
          'internal',
          'SHIFT_INTERNAL_ERROR',
          'Failed to read month notification flag',
        );
      }
      if (notificationSent) {
        continue;
      }

      const monthDoc = await db.collection('shifts').doc(yearMonth).get();
      if (monthDoc.exists && monthDoc.data()?.allDaysFinalized === true) {
        continue;
      }

      const startMinute = coerceMinutes(requestData.startMinute ?? requestData.start);
      const endMinute = coerceMinutes(requestData.endMinute ?? requestData.end);
      if (startMinute == null || endMinute == null) {
        throwShiftHttpsError(
          'internal',
          'SHIFT_INTERNAL_ERROR',
          `Malformed pending request minutes: ${requestDoc.id}`,
        );
      }

      const startTime = minutesToHhMm(startMinute);
      const endTime = minutesToHhMm(endMinute);

      const alreadyExists = shifts.some(
        (s) =>
          s.dateKey === dateKey && s.startMinute === startMinute && s.endMinute === endMinute,
      );
      if (alreadyExists) {
        continue;
      }

      shifts.push({
        requestId: requestDoc.id,
        dateKey,
        date: dateKey,
        startMinute,
        endMinute,
        start: startTime,
        end: endTime,
        confirmed: null,
        requestStatus: 'pending',
        source: 'pending_request',
      });
    }

    shifts.sort((a, b) => {
      if (a.dateKey < b.dateKey) return 1;
      if (a.dateKey > b.dateKey) return -1;
      return a.startMinute - b.startMinute;
    });

    logOpsSuccess({
      message: 'getShifts 成功',
      functionEntry: 'getShifts',
      operation: 'fetchShifts',
      context: { shiftCount: shifts.length },
    });

    return {
      success: true,
      data: {
        shifts,
        count: shifts.length,
      },
    };
  } catch (error) {
    const errorKey = getShiftErrorKeyFromUnknown(error);
    if (!(error instanceof HttpsError && errorKey)) {
      logOpsError({
        message: 'getShifts 失敗',
        functionEntry: 'getShifts',
        operation: 'shiftFetchCatch',
        cause: error,
      });
    }

    if (error instanceof HttpsError) {
      throw error;
    }

    throwShiftHttpsError('internal', 'SHIFT_INTERNAL_ERROR', 'Failed to fetch shifts');
  }
});
