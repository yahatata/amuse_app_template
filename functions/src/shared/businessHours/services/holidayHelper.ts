/**
 * 祝日判定ユーティリティ
 * 
 * 使用ライブラリ: japanese-holidays
 */

import { isHoliday } from 'japanese-holidays';

/**
 * 日本の祝日かどうかを判定
 * @param date 判定する日付（UTCで作成されたDateオブジェクト、JSTの年月日をUTCとして扱う）
 * @returns 祝日の場合 true
 * 
 * japanese-holidays の isHoliday(date: Date): string | null
 * - 祝日の場合: 祝日名（string）を返す
 * - 祝日でない場合: null または undefined を返す
 * 
 * 注意: japanese-holidaysはUTC日付部分を見て判定するため、
 * JSTの年月日をUTCとして扱う必要がある
 */
export function isJapaneseHoliday(date: Date): boolean {
  const holiday = isHoliday(date);
  return holiday !== null && holiday !== undefined;
}

/**
 * 曜日を取得（0=日曜日, 6=土曜日）
 * @param date 日付（UTCで作成されたDateオブジェクト、JSTの年月日をUTCとして扱う）
 * @returns 曜日（0-6）
 * 
 * 注意: UTC基準で曜日を取得するため、getUTCDay()を使用
 * JSTの年月日をUTCとして扱うことで、JSTの曜日と一致する
 */
export function getWeekday(date: Date): number {
  return date.getUTCDay();
}

/**
 * 平日かどうか（月〜金かつ祝日でない）
 * @param date 日付
 * @returns 平日の場合 true
 */
export function isWeekday(date: Date): boolean {
  const weekday = getWeekday(date);
  return weekday >= 1 && weekday <= 5 && !isJapaneseHoliday(date);
}

/**
 * 週末または祝日かどうか
 * @param date 日付
 * @returns 週末または祝日の場合 true
 */
export function isWeekendOrHoliday(date: Date): boolean {
  const weekday = getWeekday(date);
  return weekday === 0 || weekday === 6 || isJapaneseHoliday(date);
}

/**
 * 日付から styleId を決定
 * - 平日 → "weekday"
 * - 土日祝 → "weekendHoliday"
 * @param date 日付
 * @returns スタイルID
 */
export function determineStyleId(date: Date): string {
  if (isWeekday(date)) {
    return "weekday";
  } else {
    return "weekendHoliday";
  }
}
