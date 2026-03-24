/**
 * 給与計算の期間計算ユーティリティ
 *
 * 参照: docs/config_migration/phase4_3/specs/02_CONFIG_SPEC.md セクション5-7
 */

/**
 * 月の末日を返す。
 * @param year 4桁の年
 * @param month 1-12
 */
function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * YYYY-MM-DD を解析する。
 */
function parseDate(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { year: y, month: m, day: d };
}

/**
 * year/month/day を YYYY-MM-DD に変換する。
 */
function formatDate(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/**
 * 日付を1日進める/戻す。
 */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return formatDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/**
 * startDay/endDay から、指定 date が属する給与期間の開始日・終了日を算出する。
 *
 * - endDay=0 は月末を意味する
 * - startDay > endDay（例: 26日〜25日）は翌月跨ぎ
 * - date は出勤日（JST の YYYY-MM-DD）
 */
export function getPayrollPeriodRange(
  date: string,
  startDay: number,
  endDay: number
): { periodStart: string; periodEnd: string } {
  const { year, month, day } = parseDate(date);

  if (endDay === 0) {
    // 月初〜月末パターン: startDay は 1 想定だが、startDay > 1 の場合も考慮
    const lastDay = getLastDayOfMonth(year, month);
    if (day >= startDay) {
      const periodEndDay = lastDay;
      return {
        periodStart: formatDate(year, month, startDay),
        periodEnd: formatDate(year, month, periodEndDay),
      };
    } else {
      // date < startDay → 前月の期間に属する
      let prevMonth = month - 1;
      let prevYear = year;
      if (prevMonth < 1) { prevMonth = 12; prevYear--; }
      const prevLastDay = getLastDayOfMonth(prevYear, prevMonth);
      return {
        periodStart: formatDate(prevYear, prevMonth, startDay),
        periodEnd: formatDate(prevYear, prevMonth, prevLastDay),
      };
    }
  }

  // startDay <= endDay: 同一月内（例: 1日〜31日, 1日〜25日）
  if (startDay <= endDay) {
    if (day >= startDay && day <= endDay) {
      return {
        periodStart: formatDate(year, month, startDay),
        periodEnd: formatDate(year, month, endDay),
      };
    } else if (day < startDay) {
      // 前月の期間
      let prevMonth = month - 1;
      let prevYear = year;
      if (prevMonth < 1) { prevMonth = 12; prevYear--; }
      return {
        periodStart: formatDate(prevYear, prevMonth, startDay),
        periodEnd: formatDate(prevYear, prevMonth, endDay),
      };
    } else {
      // day > endDay → 翌月の期間
      let nextMonth = month + 1;
      let nextYear = year;
      if (nextMonth > 12) { nextMonth = 1; nextYear++; }
      return {
        periodStart: formatDate(nextYear, nextMonth, startDay),
        periodEnd: formatDate(nextYear, nextMonth, endDay),
      };
    }
  }

  // startDay > endDay: 翌月跨ぎ（例: 26日〜25日）
  if (day >= startDay) {
    // 今月の startDay から翌月の endDay まで
    let nextMonth = month + 1;
    let nextYear = year;
    if (nextMonth > 12) { nextMonth = 1; nextYear++; }
    return {
      periodStart: formatDate(year, month, startDay),
      periodEnd: formatDate(nextYear, nextMonth, endDay),
    };
  } else if (day <= endDay) {
    // 前月の startDay から今月の endDay まで
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth < 1) { prevMonth = 12; prevYear--; }
    return {
      periodStart: formatDate(prevYear, prevMonth, startDay),
      periodEnd: formatDate(year, month, endDay),
    };
  } else {
    // endDay < day < startDay → 翌月の期間の startDay から
    let nextMonth = month + 1;
    let nextYear = year;
    if (nextMonth > 12) { nextMonth = 1; nextYear++; }
    return {
      periodStart: formatDate(year, month, startDay),
      periodEnd: formatDate(nextYear, nextMonth, endDay),
    };
  }
}

/**
 * paymentPeriodKey を算出する。
 *
 * @returns "YYYY-MM-DD_YYYY-MM-DD" 形式
 */
export function getPaymentPeriodKey(
  date: string,
  startDay: number,
  endDay: number
): string {
  const { periodStart, periodEnd } = getPayrollPeriodRange(date, startDay, endDay);
  return `${periodStart}_${periodEnd}`;
}

/**
 * weekStartDate を算出する。
 *
 * date から直近の過去方向にある weekStartDay 曜日の日付を返す。
 * date 自体が weekStartDay と同じ曜日なら date そのもの。
 *
 * @param date YYYY-MM-DD
 * @param weekStartDay 0（日曜）〜 6（土曜）
 * @returns YYYY-MM-DD
 */
export function getWeekStartDate(date: string, weekStartDay: number): string {
  const d = new Date(`${date}T00:00:00`);
  const currentDay = d.getDay();
  let diff = currentDay - weekStartDay;
  if (diff < 0) diff += 7;
  d.setDate(d.getDate() - diff);
  return formatDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/**
 * 計算可能期間を算出する。
 *
 * @returns { calcStart, calcEnd } | null
 *          paymentDate が null の場合は null（常時計算可能）
 */
export function getCalculablePeriod(
  periodEnd: string,
  paymentDate: string | null
): { calcStart: string; calcEnd: string } | null {
  if (paymentDate === null) return null;
  const calcStart = addDays(periodEnd, 1);
  const calcEnd = addDays(paymentDate, -1);
  return { calcStart, calcEnd };
}
