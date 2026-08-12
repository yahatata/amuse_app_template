/**
 * L7-A helpers（Emulator 不要）
 */

import {
  assertBusinessDateKey,
  assertYearMonth,
  getBusinessMonthDateRange,
} from '../../src/domains/attendance/helpers/attendanceBusinessDate';
import {
  buildAttendanceCorrectionFingerprint,
  normalizeCorrectionPayload,
} from '../../src/domains/attendance/helpers/attendanceCorrectionNonce';

describe('L7-A attendance helpers', () => {
  it('getBusinessMonthDateRange is timezone-safe for Feb/March', () => {
    expect(getBusinessMonthDateRange(2026, 2)).toEqual({
      startDateStr: '2026-02-01',
      endDateStr: '2026-02-28',
    });
    expect(getBusinessMonthDateRange(2024, 2)).toEqual({
      startDateStr: '2024-02-01',
      endDateStr: '2024-02-29',
    });
    expect(getBusinessMonthDateRange(2026, 3)).toEqual({
      startDateStr: '2026-03-01',
      endDateStr: '2026-03-31',
    });
  });

  it('assertYearMonth rejects invalid', () => {
    expect(() => assertYearMonth(2026.5, 3)).toThrow();
    expect(() => assertYearMonth(2026, 0)).toThrow();
    expect(() => assertBusinessDateKey('2026-13-01')).toThrow();
    expect(() => assertBusinessDateKey('2026-02-30')).toThrow();
  });

  it('fingerprint ignores type-irrelevant times', () => {
    const a = normalizeCorrectionPayload({
      date: '2026-03-01',
      type: 'clockIn',
      newClockIn: '18:00',
      newClockOut: '23:00',
      reason: 'x',
    });
    const b = normalizeCorrectionPayload({
      date: '2026-03-01',
      type: 'clockIn',
      newClockIn: '18:00',
      reason: 'x',
    });
    expect(a.newClockOut).toBeNull();
    expect(
      buildAttendanceCorrectionFingerprint({ uid: 'u1', payload: a }),
    ).toBe(buildAttendanceCorrectionFingerprint({ uid: 'u1', payload: b }));
  });
});
