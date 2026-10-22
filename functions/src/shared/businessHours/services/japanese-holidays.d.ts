/**
 * japanese-holidays の型定義
 */

declare module 'japanese-holidays' {
  /**
   * 日本の祝日かどうかを判定
   * @param date 判定する日付
   * @returns 祝日の場合は祝日名（string）、祝日でない場合は null
   */
  export function isHoliday(date: Date): string | null;

  /**
   * 指定期間内の祝日一覧を取得
   * @param start 開始日
   * @param end 終了日
   * @returns 祝日の配列
   */
  export function getHolidays(start: Date, end: Date): Array<{ date: Date; name: string }>;
}
