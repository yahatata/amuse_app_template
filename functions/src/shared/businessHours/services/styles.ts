/**
 * 営業スタイル定義
 *
 * storeMeta/config.businessHoursStyles から取得する。
 * SSoT は storeMeta/config（defaults.ts でデフォルト値を提供）。
 */

import { getStoreConfig } from '../../config/configLoader';

export interface BusinessHoursStyle {
  styleId: string;
  openMinute: number;  // 60の倍数であること
  closeMinute: number; // 60の倍数であること（1500以上も許容）
  isClosed: boolean;
}

/**
 * styleIdから営業時間を取得（storeMeta/config 経由）
 * @param styleId スタイルID
 * @returns 営業時間スタイル
 * @throws Error styleIdが存在しない場合
 */
export async function getBusinessHoursByStyleId(styleId: string): Promise<BusinessHoursStyle> {
  const config = await getStoreConfig();
  const styles = config.businessHoursStyles ?? {};
  const style = styles[styleId] as BusinessHoursStyle | undefined;
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
