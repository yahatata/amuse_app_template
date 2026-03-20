/**
 * 夜間労働時間（nightWorkMinutes）算出ヘルパー
 *
 * Phase4.1: config の nightWorkStartHour, nightWorkEndHour を使用して算出する。
 * 参照: Flow1_DETAILED_SPEC セクション 4
 */

import type { Timestamp } from 'firebase-admin/firestore';

/**
 * clockIn 〜 clockOut の間で、夜間時間帯に該当する分数を算出する
 * @param clockIn 出勤時刻
 * @param clockOut 退勤時刻
 * @param nightWorkStartHour 夜間開始時（0-23）。例: 22 = 22:00〜
 * @param nightWorkEndHour 夜間終了時（0-23）。例: 5 = 〜05:00（翌日）
 */
export function calculateNightWorkMinutes(
  clockIn: Timestamp,
  clockOut: Timestamp,
  nightWorkStartHour: number,
  nightWorkEndHour: number
): number {
  const jstOffset = 9 * 60 * 60 * 1000;
  const clockInJST = new Date(clockIn.toDate().getTime() + jstOffset);
  const clockOutJST = new Date(clockOut.toDate().getTime() + jstOffset);

  let nightMinutes = 0;
  let currentTime = new Date(clockInJST);

  while (currentTime < clockOutJST) {
    const hour = currentTime.getHours();
    if (hour >= nightWorkStartHour || hour < nightWorkEndHour) {
      nightMinutes++;
    }
    currentTime.setMinutes(currentTime.getMinutes() + 1);
  }

  return nightMinutes;
}
