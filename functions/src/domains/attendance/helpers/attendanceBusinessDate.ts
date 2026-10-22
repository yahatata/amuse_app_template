/**
 * attendance の date（businessDate YYYY-MM-DD）向けユーティリティ
 * host timezone の Date コンストラクタに依存しない。
 */

import { throwAttendanceHttpsError } from './attendanceHttpsError';

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertBusinessDateKey(raw: unknown): string {
  if (typeof raw !== 'string' || !DATE_KEY_RE.test(raw.trim())) {
    throwAttendanceHttpsError(
      'invalid-argument',
      'ATTENDANCE_INVALID_ARGUMENT',
      'date must be YYYY-MM-DD',
    );
  }
  const date = raw.trim();
  const [y, m, d] = date.split('-').map(Number);
  // UTC で暦日妥当性を検証（ローカル TZ 非依存）
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (
    utc.getUTCFullYear() !== y ||
    utc.getUTCMonth() !== m - 1 ||
    utc.getUTCDate() !== d
  ) {
    throwAttendanceHttpsError(
      'invalid-argument',
      'ATTENDANCE_INVALID_ARGUMENT',
      'date is not a valid calendar day',
    );
  }
  return date;
}

export function assertYearMonth(yearRaw: unknown, monthRaw: unknown): {
  year: number;
  month: number;
} {
  if (typeof yearRaw !== 'number' || !Number.isInteger(yearRaw)) {
    throwAttendanceHttpsError(
      'invalid-argument',
      'ATTENDANCE_INVALID_ARGUMENT',
      'year must be an integer',
    );
  }
  if (typeof monthRaw !== 'number' || !Number.isInteger(monthRaw)) {
    throwAttendanceHttpsError(
      'invalid-argument',
      'ATTENDANCE_INVALID_ARGUMENT',
      'month must be an integer',
    );
  }
  if (monthRaw < 1 || monthRaw > 12) {
    throwAttendanceHttpsError(
      'invalid-argument',
      'ATTENDANCE_INVALID_ARGUMENT',
      'month must be 1-12',
    );
  }
  if (yearRaw < 2000 || yearRaw > 2100) {
    throwAttendanceHttpsError(
      'invalid-argument',
      'ATTENDANCE_INVALID_ARGUMENT',
      'year out of range',
    );
  }
  return { year: yearRaw, month: monthRaw };
}

/** 指定年月の businessDate 範囲（両端含む YYYY-MM-DD） */
export function getBusinessMonthDateRange(
  year: number,
  month: number,
): { startDateStr: string; endDateStr: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const startDateStr = `${year}-${pad(month)}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDateStr = `${year}-${pad(month)}-${pad(lastDay)}`;
  return { startDateStr, endDateStr };
}

/** Timestamp / Date を JST の HH:mm に変換（correction current* 用） */
export function formatTimestampToJstHhMm(value: unknown): string | null {
  if (value == null) return null;
  let ms: number | null = null;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    ms = (value as { toDate: () => Date }).toDate().getTime();
  } else if (value instanceof Date) {
    ms = value.getTime();
  }
  if (ms == null || !Number.isFinite(ms)) return null;
  const jst = new Date(ms + 9 * 60 * 60 * 1000);
  const hh = String(jst.getUTCHours()).padStart(2, '0');
  const mm = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
