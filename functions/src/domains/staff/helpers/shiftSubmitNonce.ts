/**
 * submitShiftRequests の clientNonce / fingerprint
 */

import * as crypto from 'crypto';
import { validateStaffClientNonce } from './staffClientNonce';
import { throwShiftHttpsError } from './shiftHttpsError';

export const SUBMIT_SHIFT_REQUESTS_OPERATION = 'submit_shift_requests';
export const MAX_SHIFT_SUBMIT_ITEMS = 31;

export interface NormalizedShiftItem {
  dateKey: string;
  yearMonth: string;
  startMinute: number;
  endMinute: number;
}

export function validateShiftSubmitClientNonce(raw: unknown): string {
  return validateStaffClientNonce(raw, 'SHIFT_SUBMIT_NONCE_REQUIRED');
}

function parseTimeToMinutes(raw: unknown, label: string): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && Number.isInteger(raw)) {
    return raw;
  }
  if (typeof raw === 'string' && /^\d{2}:\d{2}$/.test(raw.trim())) {
    const [h, m] = raw.trim().split(':').map(Number);
    if (h === 24 && m === 0) return 1440;
    return h * 60 + m;
  }
  throwShiftHttpsError(
    'invalid-argument',
    'SHIFT_INVALID_ARGUMENT',
    `${label} must be integer minutes or HH:MM`,
  );
}

function getDateKey(raw: Record<string, unknown>): string {
  const dateKey =
    typeof raw.dateKey === 'string'
      ? raw.dateKey.trim()
      : typeof raw.date === 'string'
        ? raw.date.trim()
        : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throwShiftHttpsError(
      'invalid-argument',
      'SHIFT_INVALID_ARGUMENT',
      'dateKey must be YYYY-MM-DD',
    );
  }
  return dateKey;
}

/**
 * request.shifts を正規化（dateKey 昇順・重複禁止）
 */
export function normalizeShiftSubmitItems(raw: unknown): NormalizedShiftItem[] {
  if (!Array.isArray(raw)) {
    throwShiftHttpsError(
      'invalid-argument',
      'SHIFT_INVALID_ARGUMENT',
      'shifts must be a non-empty array',
    );
  }
  if (raw.length === 0) {
    throwShiftHttpsError(
      'invalid-argument',
      'SHIFT_INVALID_ARGUMENT',
      'shifts must not be empty',
    );
  }
  if (raw.length > MAX_SHIFT_SUBMIT_ITEMS) {
    throwShiftHttpsError(
      'invalid-argument',
      'SHIFT_INVALID_ARGUMENT',
      `shifts max is ${MAX_SHIFT_SUBMIT_ITEMS}`,
    );
  }

  const items: NormalizedShiftItem[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
      throwShiftHttpsError(
        'invalid-argument',
        'SHIFT_INVALID_ARGUMENT',
        'each shift must be an object',
      );
    }
    const row = entry as Record<string, unknown>;
    const dateKey = getDateKey(row);
    if (seen.has(dateKey)) {
      throwShiftHttpsError(
        'invalid-argument',
        'SHIFT_INVALID_ARGUMENT',
        `duplicate dateKey: ${dateKey}`,
      );
    }
    seen.add(dateKey);

    const startMinute = parseTimeToMinutes(
      row.startMinute !== undefined ? row.startMinute : row.start,
      'startMinute',
    );
    const endMinute = parseTimeToMinutes(
      row.endMinute !== undefined ? row.endMinute : row.end,
      'endMinute',
    );

    if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute)) {
      throwShiftHttpsError(
        'invalid-argument',
        'SHIFT_INVALID_ARGUMENT',
        'startMinute/endMinute must be integers',
      );
    }
    if (startMinute < 0 || endMinute < 0 || startMinute > 1440 || endMinute > 1440) {
      throwShiftHttpsError(
        'invalid-argument',
        'SHIFT_INVALID_ARGUMENT',
        'minutes must be between 0 and 1440',
      );
    }
    if (startMinute % 60 !== 0 || endMinute % 60 !== 0) {
      throwShiftHttpsError(
        'invalid-argument',
        'SHIFT_INVALID_ARGUMENT',
        'minutes must be hour-step (multiple of 60)',
      );
    }
    if (startMinute >= endMinute) {
      throwShiftHttpsError(
        'invalid-argument',
        'SHIFT_INVALID_ARGUMENT',
        'startMinute must be less than endMinute',
      );
    }

    items.push({
      dateKey,
      yearMonth: dateKey.substring(0, 7),
      startMinute,
      endMinute,
    });
  }

  items.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));
  return items;
}

export function buildShiftSubmitFingerprint(params: {
  uid: string;
  items: NormalizedShiftItem[];
}): string {
  const payload = {
    operation: SUBMIT_SHIFT_REQUESTS_OPERATION,
    uid: params.uid,
    shifts: params.items.map((it) => ({
      dateKey: it.dateKey,
      startMinute: it.startMinute,
      endMinute: it.endMinute,
    })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function shortShiftNonceTrace(clientNonce: string): string {
  return crypto.createHash('sha256').update(clientNonce).digest('hex').slice(0, 12);
}

/** JST 基準の「次月」YYYY-MM（createMultipleShifts と同方式） */
export function getJstNextYearMonth(now: Date = new Date()): string {
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const nextMonthDate = new Date(
    Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth() + 1, 1),
  );
  const nextYear = nextMonthDate.getUTCFullYear();
  const nextMonth = nextMonthDate.getUTCMonth() + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

export function assertAllDatesAreNextMonth(items: NormalizedShiftItem[], now?: Date): void {
  const nextYm = getJstNextYearMonth(now);
  for (const it of items) {
    if (it.yearMonth !== nextYm) {
      throwShiftHttpsError(
        'failed-precondition',
        'SHIFT_NOT_NEXT_MONTH',
        `Only next month shifts are allowed: ${it.dateKey}`,
      );
    }
  }
}
