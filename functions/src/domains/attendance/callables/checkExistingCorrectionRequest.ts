/**
 * L7-A: 同日勤怠修正申請の有無確認
 *
 * request: { date } のみ
 * staffId = request.auth.uid
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
import { assertBusinessDateKey } from '../helpers/attendanceBusinessDate';

const KNOWN_STATUSES = new Set(['pending', 'approved', 'rejected']);

export const checkExistingCorrectionRequest = onCall(
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

      const date = assertBusinessDateKey(raw.date);
      Object.assign(logContext, { date });

      await assertActiveStaff(uid);

      const db = admin.firestore();
      const correctionSnapshot = await db
        .collection('attendanceCorrectionRequests')
        .where('staffId', '==', uid)
        .where('date', '==', date)
        .limit(1)
        .get();

      if (correctionSnapshot.empty) {
        logOpsSuccess({
          message: 'checkExistingCorrectionRequest 成功',
          functionEntry: 'checkExistingCorrectionRequest',
          context: { date, exists: false },
        });

        return {
          success: true,
          data: {
            exists: false,
            date,
            status: null,
            requestId: null,
          },
        };
      }

      const doc = correctionSnapshot.docs[0];
      const statusRaw = doc.data()?.status;
      const status =
        typeof statusRaw === 'string' && KNOWN_STATUSES.has(statusRaw)
          ? statusRaw
          : null;

      logOpsSuccess({
        message: 'checkExistingCorrectionRequest 成功',
        functionEntry: 'checkExistingCorrectionRequest',
        context: {
          date,
          exists: true,
          status,
          requestId: doc.id,
        },
      });

      return {
        success: true,
        data: {
          exists: true,
          date,
          status,
          requestId: doc.id,
        },
      };
    } catch (error) {
      const key = getAttendanceErrorKeyFromUnknown(error);
      if (
        key === 'STAFF_RETIRED' ||
        key === 'STAFF_NOT_ACTIVE' ||
        key === 'ATTENDANCE_UNAUTHENTICATED' ||
        key === 'ATTENDANCE_INVALID_ARGUMENT'
      ) {
        throw error;
      }
      if (
        error instanceof HttpsError &&
        (error.code === 'permission-denied' ||
          error.code === 'unauthenticated' ||
          error.code === 'invalid-argument')
      ) {
        throw error;
      }

      logOpsError({
        message: '申請済みチェックエラー',
        functionEntry: 'checkExistingCorrectionRequest',
        cause: error,
        context: logContext,
      });

      throwAttendanceHttpsError(
        'internal',
        'ATTENDANCE_CORRECTION_CHECK_INTERNAL_ERROR',
        'Failed to check existing correction request',
      );
    }
  },
);
