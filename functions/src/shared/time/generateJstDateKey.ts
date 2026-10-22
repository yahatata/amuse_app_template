/**
 * JST日付キー（YYYY-MM-DD形式）を生成するヘルパー関数
 *
 * Phase1のopenStoreでは営業時間を参照しないため、JSTの暦日として生成する
 *
 * @param date 基準となる日時（省略時は現在時刻）
 * @returns YYYY-MM-DD形式の文字列
 */

export function generateJstDateKey(date?: Date): string {
  const now = date || new Date();
  const jstOffset = 9 * 60; // 9時間を分に変換
  const jstTime = now.getTime() + jstOffset * 60000;
  const jstDate = new Date(jstTime);
  return jstDate.toISOString().split('T')[0];
}
