/**
 * 営業日計算ユーティリティ
 * 
 * schema_plan.md に準拠: businessDate は Functions が calcBusinessDate で確定
 * クライアントからの businessDate は完全無視・受理しない
 * 
 * STORE_CLOSE_HOUR の取得は config/ops.ts#getStoreCloseHour() に統一
 * 24-48指定の正規化は resolveBusinessDate 側（normalizeStoreCloseHour）に任せる
 */

import { resolveBusinessDate } from '../../analytics/helpers';
import { getStoreCloseHour } from '../../config/ops';

/**
 * 営業日を計算する（Functions 専用、サーバ専任）
 * 
 * @param nowUtc 基準時刻（UTC、デフォルト: 現在時刻）
 * @returns 営業日（YYYY-MM-DD形式）
 * 
 * 注意: 
 * - クライアントからの businessDate は完全無視・受理しない
 * - STORE_CLOSE_HOUR は config/ops.ts#getStoreCloseHour() から取得（単一路線）
 * - 24-48指定の正規化は resolveBusinessDate 側（normalizeStoreCloseHour）に任せる（重複正規化を避ける）
 * - 既存の `resolveBusinessDate` 関数を使用（ロジック統一）
 */
export function calcBusinessDate(nowUtc?: Date): string {
  const now = nowUtc || new Date();
  const storeCloseHour = getStoreCloseHour(); // 単一路線: env → config → デフォルト27
  
  // resolveBusinessDate 側で normalizeStoreCloseHour が実行される（重複正規化を避ける）
  return resolveBusinessDate(now, storeCloseHour);
}
