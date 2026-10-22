/**
 * 営業スタイル定義
 *
 * storeMeta/businessStyles から取得する（Phase 2 正本）。
 */

import { getBusinessStylesOrThrow } from '../../config/businessStylesLoader';

export interface BusinessHoursStyle {
  styleId: string;
  openMinute: number;  // 60の倍数であること
  closeMinute: number; // 60の倍数であること（1500以上も許容）
  isClosed: boolean;
}

/**
 * styleIdから営業時間を取得（storeMeta/businessStyles 経由）
 * @param styleId スタイルID
 * @returns 営業時間スタイル
 * @throws Error styleIdが存在しない場合
 */
export async function getBusinessHoursByStyleId(styleId: string): Promise<BusinessHoursStyle> {
  const config = await getBusinessStylesOrThrow();
  const style = config.styles[styleId as keyof typeof config.styles];
  if (!style) {
    throw new Error(`storeMeta/businessStyles.styles.${styleId} not found`);
  }
  return {
    styleId: style.styleId,
    openMinute: style.openMinute,
    closeMinute: style.closeMinute,
    isClosed: style.isClosed,
  };
}

/**
 * 60分刻みかチェック
 * @param minutes 分数
 * @returns 60分刻みの場合 true
 */
export function isHourlyIncrement(minutes: number): boolean {
  return minutes % 60 === 0;
}
