import { Timestamp } from 'firebase-admin/firestore';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface JstDayRangeUtc {
  start: Date;
  end: Date;
  dateKey: string;
}

/** JST 基準の「今日」00:00〜明日 00:00（UTC Date） */
export function getJstTodayRangeUtc(now: Date = new Date()): JstDayRangeUtc {
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  const jstToday = new Date(jstNow.getFullYear(), jstNow.getMonth(), jstNow.getDate());
  const jstTomorrow = new Date(jstToday);
  jstTomorrow.setDate(jstTomorrow.getDate() + 1);

  const start = new Date(jstToday.getTime() - JST_OFFSET_MS);
  const end = new Date(jstTomorrow.getTime() - JST_OFFSET_MS);
  const dateKey = `${jstToday.getFullYear()}-${String(jstToday.getMonth() + 1).padStart(2, '0')}-${String(jstToday.getDate()).padStart(2, '0')}`;

  return { start, end, dateKey };
}

export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'number') {
    return new Date(value * 1000);
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

export function convertFirestoreTimestampToIso(timestamp: unknown): string {
  const date = toDate(timestamp);
  return date ? date.toISOString() : '';
}

export function isStartAtWithinRange(
  startAt: unknown,
  range: { start: Date; end: Date }
): boolean {
  const date = toDate(startAt);
  if (!date) return false;
  const ms = date.getTime();
  return ms >= range.start.getTime() && ms < range.end.getTime();
}

export function isRegEndAtPast(regEndAt: unknown, now: Date = new Date()): boolean {
  const date = toDate(regEndAt);
  if (!date) return false;
  return date.getTime() <= now.getTime();
}
