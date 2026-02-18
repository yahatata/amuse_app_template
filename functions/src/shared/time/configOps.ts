import * as functions from 'firebase-functions';

/**
 * STORE_CLOSE_HOUR を正規化（24以上は翌日繰り上がりとして扱う）
 * @param storeCloseHour 0-48 の整数
 *   - 0-23: 当日の時刻としてそのまま使用
 *   - 24-48: 翌日の時刻として扱い、24で割った余りを使用（例: 25 → 1, 27 → 3, 48 → 0）
 * @returns 0-23 の整数（営業日判定で使用する時刻）
 *
 * 注意: 24以上を指定した場合、元の値が「翌日の何時まで」を意味することを示す。
 * 例: storeCloseHour=25 → 1（翌日の1:00まで）、storeCloseHour=27 → 3（翌日の3:00まで）
 */
export function normalizeStoreCloseHour(storeCloseHour: number): number {
  // 24以上は翌日繰り上がりとして扱い、24で割った余りを使用
  return storeCloseHour % 24;
}

/**
 * 店舗締め時間（STORE_CLOSE_HOUR）を取得
 *
 * 優先度:
 * 1. 環境変数 STORE_CLOSE_HOUR
 * 2. functions:config().ops.store_close_hour
 * 3. デフォルト値 27（翌日の3:00 JST）
 *
 * STORE_CLOSE_HOUR の意味:
 * - 0-23: 「当日の何時まで」を指定（例: 9 → 当日の9:00まで）
 * - 24-48: 「翌日の何時まで」を指定（例: 25 → 翌日の1:00まで、27 → 翌日の3:00まで）
 *
 * 例: STORE_CLOSE_HOUR=9 → 当日の9:00まで（9:00以降は当日の営業日）
 * 例: STORE_CLOSE_HOUR=25 → 翌日の1:00まで（当日の1:00以降は当日の営業日）
 * 例: STORE_CLOSE_HOUR=27 → 翌日の3:00まで（当日の3:00以降は当日の営業日）
 *
 * @returns 0-48 の整数（使用時は normalizeStoreCloseHour() で正規化すること）
 */
export function getStoreCloseHour(): number {
  // 環境変数を優先
  if (process.env.STORE_CLOSE_HOUR) {
    const hour = parseInt(process.env.STORE_CLOSE_HOUR, 10);
    if (!isNaN(hour) && hour >= 0 && hour <= 48) {
      return hour;
    }
  }

  // functions:config を次に試行
  try {
    const config = functions.config();
    if (config?.ops?.store_close_hour) {
      const hour = parseInt(config.ops.store_close_hour, 10);
      if (!isNaN(hour) && hour >= 0 && hour <= 48) {
        return hour;
      }
    }
  } catch (error) {
    // config が未設定の場合は無視
  }

  // デフォルト値: 27（翌日の3:00 JST）
  return 27;
}

/**
 * JST の時刻から cron 文字列を生成
 *
 * @param hour0to29 0-48 の整数（24以上は翌日繰り上がり）
 * @param minute 0-59 の整数
 * @returns cron 文字列（例: "0 3 * * *"）
 *
 * 注意: timeZone は呼び出し側で 'Asia/Tokyo' を指定すること
 */
export function cronFromHourAndMinuteJst(hour0to29: number, minute: number): string {
  // 24以上は翌日繰り上がりとして扱い、24で割った余りを使用
  const hour = hour0to29 % 24;

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid hour (${hour0to29}) or minute (${minute})`);
  }

  // cron 形式: "分 時 * * *"
  return `${minute} ${hour} * * *`;
}

/**
 * Nightly ジョブの cron 文字列を取得
 *
 * @returns 3つの cron 文字列（recalc, reconcile, integrity）
 *
 * - recalc: STORE_CLOSE_HOUR:00（例: 27 → 3:00 JST）
 * - reconcile: STORE_CLOSE_HOUR:30（例: 27 → 3:30 JST、+30分）
 * - integrity: (STORE_CLOSE_HOUR + 1):00（例: 27 → 4:00 JST、+60分）
 */
export function getNightlyCronTriplet() {
  const base = getStoreCloseHour();

  return {
    recalc: cronFromHourAndMinuteJst(base, 0),           // H:00
    reconcile: cronFromHourAndMinuteJst(base, 30),       // H:30 (+30m)
    integrity: cronFromHourAndMinuteJst(base + 1, 0),    // H+1:00 (+60m)
  };
}
