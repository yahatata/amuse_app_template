/**
 * payroll 実行直前の attendance doc 整合性検証（Firestore 非依存）
 *
 * ChangeSpec: docs/エラーログ運用/logOps/changeSpec/changeSpec_payroll実行前_attendance整合性チェック.md
 */

import { Timestamp } from 'firebase-admin/firestore';

/** `executeMonthlyPayroll` のリクエスト検証と同一 */
export const PAYROLL_PERIOD_KEY_REGEX = /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/;
export const PAYROLL_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_INVALID_ATTENDANCE_SAMPLE_LIMIT = 10;

const ALLOWED_PAYROLL_STATUSES = new Set([
  'unreflected',
  'reflected',
  'corrected_after_reflection',
]);

export type PayrollAttendanceValidationItem = {
  attendanceId: string;
  exists: boolean;
  /** exists が false のときは null */
  data: Record<string, unknown> | null;
};

export type InvalidAttendanceSample = {
  attendanceId: string;
  staffId?: string | null;
  date?: string | null;
  reasons: string[];
};

export type PayrollAttendanceValidationSuccess = { ok: true };

export type PayrollAttendanceValidationFailure = {
  ok: false;
  invalidAttendanceCount: number;
  invalidAttendanceSamples: InvalidAttendanceSample[];
};

export type PayrollAttendanceValidationResult =
  | PayrollAttendanceValidationSuccess
  | PayrollAttendanceValidationFailure;

export type ValidatePayrollAttendanceDocumentsOptions = {
  /** `invalidAttendanceSamples` の最大件数（既定 10） */
  invalidSampleLimit?: number;
};

function pushReason(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

/**
 * 単一 attendance の検証。Firestore Timestamp は firebase-admin の `Timestamp` で判定する。
 */
export function validateSingleAttendanceForPayroll(
  item: PayrollAttendanceValidationItem
): InvalidAttendanceSample | null {
  const { attendanceId, exists, data } = item;

  if (!exists || data === null) {
    return {
      attendanceId,
      staffId: null,
      date: null,
      reasons: ['missingAttendanceDoc'],
    };
  }

  const reasons: string[] = [];

  const staffIdRaw = data.staffId;
  if (staffIdRaw === undefined || staffIdRaw === null) {
    pushReason(reasons, 'missingStaffId');
  } else if (typeof staffIdRaw !== 'string') {
    pushReason(reasons, 'invalidStaffIdType');
  } else if (staffIdRaw.trim() === '') {
    pushReason(reasons, 'emptyStaffId');
  }

  const dateRaw = data.date;
  if (dateRaw === undefined || dateRaw === null) {
    pushReason(reasons, 'missingDate');
  } else if (typeof dateRaw !== 'string') {
    pushReason(reasons, 'invalidDateType');
  } else if (!PAYROLL_DATE_REGEX.test(dateRaw)) {
    pushReason(reasons, 'invalidDateFormat');
  }

  if (data.isDeleted === true) {
    pushReason(reasons, 'attendanceDeleted');
  }

  const clockOut = data.clockOut;
  if (clockOut === undefined || clockOut === null) {
    pushReason(reasons, 'missingClockOut');
  } else if (!(clockOut instanceof Timestamp)) {
    pushReason(reasons, 'invalidClockOutType');
  }

  const ppkRaw = data.paymentPeriodKey;
  if (ppkRaw === undefined || ppkRaw === null) {
    pushReason(reasons, 'missingPaymentPeriodKey');
  } else if (typeof ppkRaw !== 'string') {
    pushReason(reasons, 'invalidPaymentPeriodKeyType');
  } else if (ppkRaw.trim() === '') {
    pushReason(reasons, 'emptyPaymentPeriodKey');
  } else if (!PAYROLL_PERIOD_KEY_REGEX.test(ppkRaw)) {
    pushReason(reasons, 'invalidPaymentPeriodKeyFormat');
  }

  const statusRaw = data.payrollStatus;
  if (statusRaw === undefined || statusRaw === null) {
    pushReason(reasons, 'missingPayrollStatus');
  } else if (typeof statusRaw !== 'string') {
    pushReason(reasons, 'invalidPayrollStatusType');
  } else if (!ALLOWED_PAYROLL_STATUSES.has(statusRaw)) {
    pushReason(reasons, 'invalidPayrollStatusEnum');
  }

  const wsRaw = data.weekStartDate;
  if (wsRaw === undefined || wsRaw === null) {
    pushReason(reasons, 'missingWeekStartDate');
  } else if (typeof wsRaw !== 'string') {
    pushReason(reasons, 'invalidWeekStartDateType');
  } else if (wsRaw.trim() === '') {
    pushReason(reasons, 'emptyWeekStartDate');
  } else if (!PAYROLL_DATE_REGEX.test(wsRaw)) {
    pushReason(reasons, 'invalidWeekStartDateFormat');
  }

  const weekdayRaw = data.weekday;
  if (weekdayRaw === undefined || weekdayRaw === null) {
    pushReason(reasons, 'missingWeekday');
  } else if (typeof weekdayRaw !== 'number' || Number.isNaN(weekdayRaw)) {
    pushReason(reasons, 'invalidWeekdayType');
  } else if (!Number.isInteger(weekdayRaw)) {
    pushReason(reasons, 'invalidWeekdayType');
  } else if (weekdayRaw < 0 || weekdayRaw > 6) {
    pushReason(reasons, 'weekdayOutOfRange');
  }

  if (reasons.length === 0) {
    return null;
  }

  const staffIdForSample = typeof staffIdRaw === 'string' ? staffIdRaw : null;
  const dateForSample = typeof dateRaw === 'string' ? dateRaw : null;

  return {
    attendanceId,
    staffId: staffIdForSample,
    date: dateForSample,
    reasons,
  };
}

/**
 * リクエストの全 attendance を検証する。
 * `requestPaymentPeriodKey` は API 互換のため受け取れるが、doc と一致必須にはしない（キャリー設計）。
 */
export function validatePayrollAttendanceDocuments(
  items: PayrollAttendanceValidationItem[],
  _requestPaymentPeriodKey: string,
  options?: ValidatePayrollAttendanceDocumentsOptions
): PayrollAttendanceValidationResult {
  const limit = options?.invalidSampleLimit ?? DEFAULT_INVALID_ATTENDANCE_SAMPLE_LIMIT;

  const invalid: InvalidAttendanceSample[] = [];
  for (const item of items) {
    const sample = validateSingleAttendanceForPayroll(item);
    if (sample) {
      invalid.push(sample);
    }
  }

  if (invalid.length === 0) {
    return { ok: true };
  }

  return {
    ok: false,
    invalidAttendanceCount: invalid.length,
    invalidAttendanceSamples: invalid.slice(0, Math.max(0, limit)),
  };
}
