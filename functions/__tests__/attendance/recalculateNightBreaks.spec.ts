/**
 * nightWorkMinutes 休憩控除のロジックテスト
 *
 * recalculateAttendanceFromBreaks 内で使用する
 * calculateNightWorkMinutes を利用した休憩控除ロジックを検証。
 */

import type { Timestamp } from 'firebase-admin/firestore';
import { calculateNightWorkMinutes } from '../../src/domains/attendance/helpers/nightWorkMinutes';

function makeTs(isoWithOffset: string): Timestamp {
  const date = new Date(isoWithOffset);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  } as unknown as Timestamp;
}

describe('nightWorkMinutes 休憩控除ロジック', () => {
  const nightWorkStartHour = 22;
  const nightWorkEndHour = 5;

  function calcNightBreakDeduction(
    clockIn: Timestamp,
    clockOut: Timestamp,
    breaks: Array<{ startedAt: Timestamp; endedAt: Timestamp | null; isDeleted?: boolean }>
  ): { grossNight: number; nightBreak: number; netNight: number } {
    const grossNight = calculateNightWorkMinutes(clockIn, clockOut, nightWorkStartHour, nightWorkEndHour);

    let nightBreak = 0;
    for (const b of breaks) {
      if (b.isDeleted) continue;
      if (!b.endedAt) continue;
      nightBreak += calculateNightWorkMinutes(b.startedAt, b.endedAt, nightWorkStartHour, nightWorkEndHour);
    }

    const netNight = Math.max(0, grossNight - nightBreak);
    return { grossNight, nightBreak, netNight };
  }

  it('休憩なし（22:00-翌05:00 = 7h 勤務）→ nightWorkMinutes = 420', () => {
    const clockIn = makeTs('2026-03-18T22:00:00+09:00');
    const clockOut = makeTs('2026-03-19T05:00:00+09:00');
    const result = calcNightBreakDeduction(clockIn, clockOut, []);
    expect(result.grossNight).toBe(420);
    expect(result.nightBreak).toBe(0);
    expect(result.netNight).toBe(420);
  });

  it('深夜帯に30分休憩（23:00-23:30）→ 30分控除', () => {
    const clockIn = makeTs('2026-03-18T22:00:00+09:00');
    const clockOut = makeTs('2026-03-19T05:00:00+09:00');
    const breaks = [
      { startedAt: makeTs('2026-03-18T23:00:00+09:00'), endedAt: makeTs('2026-03-18T23:30:00+09:00') },
    ];
    const result = calcNightBreakDeduction(clockIn, clockOut, breaks);
    expect(result.grossNight).toBe(420);
    expect(result.nightBreak).toBe(30);
    expect(result.netNight).toBe(390);
  });

  it('休憩が深夜帯と日中帯にまたがる（21:30-22:30）→ 深夜帯部分（30分）のみ控除', () => {
    const clockIn = makeTs('2026-03-18T20:00:00+09:00');
    const clockOut = makeTs('2026-03-19T02:00:00+09:00');
    const breaks = [
      { startedAt: makeTs('2026-03-18T21:30:00+09:00'), endedAt: makeTs('2026-03-18T22:30:00+09:00') },
    ];
    const result = calcNightBreakDeduction(clockIn, clockOut, breaks);
    // gross: 20:00-02:00 の深夜帯 = 22:00-02:00 = 240分
    expect(result.grossNight).toBe(240);
    // break: 21:30-22:30 の深夜帯 = 22:00-22:30 = 30分
    expect(result.nightBreak).toBe(30);
    expect(result.netNight).toBe(210);
  });

  it('複数休憩、一部深夜帯', () => {
    const clockIn = makeTs('2026-03-18T20:00:00+09:00');
    const clockOut = makeTs('2026-03-19T06:00:00+09:00');
    const breaks = [
      { startedAt: makeTs('2026-03-18T21:00:00+09:00'), endedAt: makeTs('2026-03-18T21:30:00+09:00') },
      { startedAt: makeTs('2026-03-19T00:00:00+09:00'), endedAt: makeTs('2026-03-19T00:30:00+09:00') },
      { startedAt: makeTs('2026-03-19T05:30:00+09:00'), endedAt: makeTs('2026-03-19T06:00:00+09:00') },
    ];
    const result = calcNightBreakDeduction(clockIn, clockOut, breaks);
    // gross: 22:00-05:00 = 420分
    expect(result.grossNight).toBe(420);
    // break1: 21:00-21:30 → 深夜帯0分
    // break2: 00:00-00:30 → 深夜帯30分
    // break3: 05:30-06:00 → 深夜帯0分
    expect(result.nightBreak).toBe(30);
    expect(result.netNight).toBe(390);
  });

  it('休憩が完全に日中帯 → nightWorkMinutes 変わらず', () => {
    const clockIn = makeTs('2026-03-18T18:00:00+09:00');
    const clockOut = makeTs('2026-03-19T02:00:00+09:00');
    const breaks = [
      { startedAt: makeTs('2026-03-18T19:00:00+09:00'), endedAt: makeTs('2026-03-18T19:30:00+09:00') },
    ];
    const result = calcNightBreakDeduction(clockIn, clockOut, breaks);
    // gross: 22:00-02:00 = 240分
    expect(result.grossNight).toBe(240);
    expect(result.nightBreak).toBe(0);
    expect(result.netNight).toBe(240);
  });

  it('論理削除された break は控除対象外', () => {
    const clockIn = makeTs('2026-03-18T22:00:00+09:00');
    const clockOut = makeTs('2026-03-19T05:00:00+09:00');
    const breaks = [
      { startedAt: makeTs('2026-03-18T23:00:00+09:00'), endedAt: makeTs('2026-03-18T23:30:00+09:00'), isDeleted: true },
    ];
    const result = calcNightBreakDeduction(clockIn, clockOut, breaks);
    expect(result.netNight).toBe(420);
  });

  it('endedAt=null の break は控除対象外', () => {
    const clockIn = makeTs('2026-03-18T22:00:00+09:00');
    const clockOut = makeTs('2026-03-19T05:00:00+09:00');
    const breaks = [
      { startedAt: makeTs('2026-03-18T23:00:00+09:00'), endedAt: null },
    ];
    const result = calcNightBreakDeduction(clockIn, clockOut, breaks);
    expect(result.netNight).toBe(420);
  });
});
