/**
 * createAttendanceCorrectionRequest の clientNonce / fingerprint
 */

import * as crypto from 'crypto';
import {
  MAX_STAFF_CLIENT_NONCE_LENGTH,
  validateStaffClientNonce,
} from '../../staff/helpers/staffClientNonce';
import { throwAttendanceHttpsError } from './attendanceHttpsError';
import { assertBusinessDateKey } from './attendanceBusinessDate';

export const SUBMIT_ATTENDANCE_CORRECTION_OPERATION = 'submit_attendance_correction';

export const MAX_ATTENDANCE_CORRECTION_REASON_LENGTH = 500;

export const CORRECTION_TYPES = ['clockIn', 'clockOut', 'both', 'other'] as const;
export type CorrectionType = (typeof CORRECTION_TYPES)[number];

const TIME_HH_MM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function validateAttendanceCorrectionClientNonce(raw: unknown): string {
  return validateStaffClientNonce(raw, 'ATTENDANCE_CORRECTION_NONCE_REQUIRED');
}

export function assertCorrectionType(raw: unknown): CorrectionType {
  if (typeof raw !== 'string' || !(CORRECTION_TYPES as readonly string[]).includes(raw)) {
    throwAttendanceHttpsError(
      'invalid-argument',
      'ATTENDANCE_INVALID_ARGUMENT',
      'type must be clockIn|clockOut|both|other',
    );
  }
  return raw as CorrectionType;
}

function normalizeOptionalTime(raw: unknown, label: string): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') {
    throwAttendanceHttpsError(
      'invalid-argument',
      'ATTENDANCE_INVALID_ARGUMENT',
      `${label} must be HH:mm string`,
    );
  }
  const v = raw.trim();
  if (!TIME_HH_MM_RE.test(v)) {
    throwAttendanceHttpsError(
      'invalid-argument',
      'ATTENDANCE_INVALID_ARGUMENT',
      `${label} must be HH:mm`,
    );
  }
  return v;
}

export function assertCorrectionReason(raw: unknown): string {
  if (typeof raw !== 'string') {
    throwAttendanceHttpsError(
      'invalid-argument',
      'ATTENDANCE_INVALID_ARGUMENT',
      'reason must be a string',
    );
  }
  const reason = raw.trim();
  if (!reason) {
    throwAttendanceHttpsError(
      'invalid-argument',
      'ATTENDANCE_INVALID_ARGUMENT',
      'reason is required',
    );
  }
  if (reason.length > MAX_ATTENDANCE_CORRECTION_REASON_LENGTH) {
    throwAttendanceHttpsError(
      'invalid-argument',
      'ATTENDANCE_INVALID_ARGUMENT',
      'reason is too long',
    );
  }
  return reason;
}

export type NormalizedCorrectionPayload = {
  date: string;
  type: CorrectionType;
  newClockIn: string | null;
  newClockOut: string | null;
  reason: string;
};

export function normalizeCorrectionPayload(raw: Record<string, unknown>): NormalizedCorrectionPayload {
  const date = assertBusinessDateKey(raw.date);
  const type = assertCorrectionType(raw.type);
  const reason = assertCorrectionReason(raw.reason);
  const newClockIn = normalizeOptionalTime(raw.newClockIn, 'newClockIn');
  const newClockOut = normalizeOptionalTime(raw.newClockOut, 'newClockOut');

  if (type === 'clockIn' && !newClockIn) {
    throwAttendanceHttpsError(
      'invalid-argument',
      'ATTENDANCE_INVALID_ARGUMENT',
      'newClockIn is required for clockIn',
    );
  }
  if (type === 'clockOut' && !newClockOut) {
    throwAttendanceHttpsError(
      'invalid-argument',
      'ATTENDANCE_INVALID_ARGUMENT',
      'newClockOut is required for clockOut',
    );
  }
  if (type === 'both' && (!newClockIn || !newClockOut)) {
    throwAttendanceHttpsError(
      'invalid-argument',
      'ATTENDANCE_INVALID_ARGUMENT',
      'newClockIn and newClockOut are required for both',
    );
  }
  if (type === 'other') {
    // other は時刻任意。余分な時刻が来ても fingerprint から除外（正規化で null）
    return { date, type, newClockIn: null, newClockOut: null, reason };
  }
  // type に不要な時刻は fingerprint から落とす
  if (type === 'clockIn') {
    return { date, type, newClockIn, newClockOut: null, reason };
  }
  if (type === 'clockOut') {
    return { date, type, newClockIn: null, newClockOut, reason };
  }
  return { date, type, newClockIn, newClockOut, reason };
}

export function buildAttendanceCorrectionFingerprint(params: {
  uid: string;
  payload: NormalizedCorrectionPayload;
}): string {
  const body = {
    date: params.payload.date,
    newClockIn: params.payload.newClockIn,
    newClockOut: params.payload.newClockOut,
    operation: SUBMIT_ATTENDANCE_CORRECTION_OPERATION,
    reason: params.payload.reason,
    type: params.payload.type,
    uid: params.uid,
  };
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export function shortAttendanceNonceTrace(clientNonce: string): string {
  return crypto.createHash('sha256').update(clientNonce).digest('hex').slice(0, 12);
}

export function attendanceCorrectionDeterministicId(uid: string, date: string): string {
  return `${uid}_${date}`;
}

export { MAX_STAFF_CLIENT_NONCE_LENGTH };
