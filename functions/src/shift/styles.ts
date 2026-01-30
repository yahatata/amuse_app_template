/**
 * 営業スタイル定義
 * 
 * ⚠️ 重要: この定義は Flutter側（lib/globalConstant.dart）の businessHoursStyles と同期必須です
 * globalConstant.dart を変更する場合は、必ずこのファイルも同じ値に更新してください
 * 
 * 同期箇所:
 * - Flutter側: lib/globalConstant.dart の businessHoursStyles
 * - Functions側: functions/src/shift/styles.ts の BUSINESS_HOURS_STYLES
 */

export interface BusinessHoursStyle {
  styleId: string;
  openMinute: number;  // 60の倍数であること
  closeMinute: number; // 60の倍数であること（1500以上も許容）
  isClosed: boolean;
}

/**
 * 営業スタイルの定義
 * - weekday: 平日（月〜金、祝日を除く）
 * - weekendHoliday: 週末・祝日（土・日・祝日）
 * - event: イベント（10:00-25:00）
 * - allDay: 終日（6:00-25:00）
 * - closed: 休業日
 */
export const BUSINESS_HOURS_STYLES: Record<string, BusinessHoursStyle> = {
  weekday: {
    styleId: "weekday",
    openMinute: 900,   // 15:00
    closeMinute: 1500, // 25:00
    isClosed: false,
  },
  weekendHoliday: {
    styleId: "weekendHoliday",
    openMinute: 720,   // 12:00
    closeMinute: 1500, // 25:00
    isClosed: false,
  },
  event: {
    styleId: "event",
    openMinute: 600,   // 10:00
    closeMinute: 1500, // 25:00
    isClosed: false,
  },
  allDay: {
    styleId: "allDay",
    openMinute: 360,   // 6:00
    closeMinute: 1500, // 25:00
    isClosed: false,
  },
  closed: {
    styleId: "closed",
    openMinute: 0,     // 任意だが検証簡略のため0
    closeMinute: 0,    // 任意だが検証簡略のため0
    isClosed: true,
  },
};

/**
 * styleIdから営業時間を取得
 * @param styleId スタイルID
 * @returns 営業時間スタイル
 * @throws Error styleIdが存在しない場合
 */
export function getBusinessHoursByStyleId(styleId: string): BusinessHoursStyle {
  const style = BUSINESS_HOURS_STYLES[styleId];
  if (!style) {
    throw new Error(`Unknown styleId: ${styleId}`);
  }
  return style;
}

/**
 * 60分刻みかチェック
 * @param minutes 分数
 * @returns 60分刻みの場合 true
 */
export function isHourlyIncrement(minutes: number): boolean {
  return minutes % 60 === 0;
}
