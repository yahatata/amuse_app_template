/**
 * [UNUSED - Phase4 01] configOps
 *
 * STORE_CLOSE_HOUR（店舗締め時間）・夜間 cron 取得。
 * Phase4 01 で determineAttendanceMode 廃止、夜間ジョブは閉店処理/Cloud Task 起動に移行したため本番利用なし。
 *
 * 復元手順: shared/time/configOps.ts に戻し、shared/time/index.ts から export を復活させる。
 */
import * as functions from 'firebase-functions';

/**
 * STORE_CLOSE_HOUR を正規化（24以上は翌日繰り上がりとして扱う）
 * @param storeCloseHour 0-48 の整数
 *   - 0-23: 当日の時刻としてそのまま使用
 *   - 24-48: 翌日の時刻として扱い、24で割った余りを使用（例: 25 → 1, 27 → 3, 48 → 0）
 * @returns 0-23 の整数（営業日判定で使用する時刻）
 */
export function normalizeStoreCloseHour(storeCloseHour: number): number {
  return storeCloseHour % 24;
}

/**
 * 店舗締め時間（STORE_CLOSE_HOUR）を取得
 * @returns 0-48 の整数（使用時は normalizeStoreCloseHour() で正規化すること）
 */
export function getStoreCloseHour(): number {
  if (process.env.STORE_CLOSE_HOUR) {
    const hour = parseInt(process.env.STORE_CLOSE_HOUR, 10);
    if (!isNaN(hour) && hour >= 0 && hour <= 48) {
      return hour;
    }
  }
  try {
    const config = functions.config();
    if (config?.ops?.store_close_hour) {
      const hour = parseInt(config.ops.store_close_hour, 10);
      if (!isNaN(hour) && hour >= 0 && hour <= 48) {
        return hour;
      }
    }
  } catch {
    // config が未設定の場合は無視
  }
  return 27;
}

/**
 * JST の時刻から cron 文字列を生成
 * @param hour0to29 0-48 の整数（24以上は翌日繰り上がり）
 * @param minute 0-59 の整数
 */
export function cronFromHourAndMinuteJst(hour0to29: number, minute: number): string {
  const hour = hour0to29 % 24;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid hour (${hour0to29}) or minute (${minute})`);
  }
  return `${minute} ${hour} * * *`;
}

/**
 * Nightly ジョブの cron 文字列を取得
 */
export function getNightlyCronTriplet() {
  const base = getStoreCloseHour();
  return {
    recalc: cronFromHourAndMinuteJst(base, 0),
    reconcile: cronFromHourAndMinuteJst(base, 30),
    integrity: cronFromHourAndMinuteJst(base + 1, 0),
  };
}
