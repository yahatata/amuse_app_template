/**
 * L7-A: 勤怠修正申請作成
 *
 * - auth.uid 固定 / client identity 非信頼
 * - clientNonce + fingerprint idempotency
 * - 同一 businessDate は pending/approved/rejected いずれも再申請不可
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import {
  throwAttendanceHttpsError,
  getAttendanceErrorKeyFromUnknown,
} from '../helpers/attendanceHttpsError';
import {
  buildCorrectionLogContext,
  createAttendanceCorrectionAtomic,
} from '../helpers/createAttendanceCorrectionAtomic';
import { shortAttendanceNonceTrace } from '../helpers/attendanceCorrectionNonce';

export const createAttendanceCorrectionRequest = onCall(
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
      if (typeof raw.clientNonce === 'string' && raw.clientNonce.trim()) {
        logContext.nonceTrace = shortAttendanceNonceTrace(raw.clientNonce.trim());
      }

      const data = await createAttendanceCorrectionAtomic({
        uid,
        rawData: raw,
      });

      Object.assign(
        logContext,
        buildCorrectionLogContext({
          uid,
          clientNonce: data.clientNonce,
          date: data.date,
          requestId: data.requestId,
          reused: data.reused,
        }),
      );

      logOpsSuccess({
        message: 'createAttendanceCorrectionRequest 成功',
        functionEntry: 'createAttendanceCorrectionRequest',
        context: {
          requestId: data.requestId,
          date: data.date,
          reused: data.reused,
          nonceTrace: logContext.nonceTrace,
        },
      });

      return {
        success: true,
        data,
      };
    } catch (error) {
      const key = getAttendanceErrorKeyFromUnknown(error);
      if (
        key === 'STAFF_RETIRED' ||
        key === 'STAFF_NOT_ACTIVE' ||
        key === 'ATTENDANCE_UNAUTHENTICATED' ||
        key === 'ATTENDANCE_INVALID_ARGUMENT' ||
        key === 'ATTENDANCE_CORRECTION_NONCE_REQUIRED' ||
        key === 'ATTENDANCE_CORRECTION_NONCE_CONFLICT' ||
        key === 'ATTENDANCE_CORRECTION_ALREADY_EXISTS' ||
        key === 'ATTENDANCE_CORRECTION_INTERNAL_ERROR'
      ) {
        // 想定内業務エラーは上位監視ノイズを抑える（conflict/already は logOps 不要）
        if (
          key === 'ATTENDANCE_CORRECTION_NONCE_CONFLICT' ||
          key === 'ATTENDANCE_CORRECTION_ALREADY_EXISTS' ||
          key === 'ATTENDANCE_INVALID_ARGUMENT' ||
          key === 'ATTENDANCE_CORRECTION_NONCE_REQUIRED' ||
          key === 'ATTENDANCE_UNAUTHENTICATED' ||
          key === 'STAFF_RETIRED' ||
          key === 'STAFF_NOT_ACTIVE'
        ) {
          throw error;
        }
        throw error;
      }
      if (
        error instanceof HttpsError &&
        (error.code === 'permission-denied' ||
          error.code === 'unauthenticated' ||
          error.code === 'invalid-argument' ||
          error.code === 'already-exists' ||
          error.code === 'failed-precondition')
      ) {
        throw error;
      }

      logOpsError({
        message: '修正申請保存エラー',
        functionEntry: 'createAttendanceCorrectionRequest',
        cause: error,
        context: logContext,
      });

      throwAttendanceHttpsError(
        'internal',
        'ATTENDANCE_CORRECTION_INTERNAL_ERROR',
        'Failed to create attendance correction request',
      );
    }
  },
);
