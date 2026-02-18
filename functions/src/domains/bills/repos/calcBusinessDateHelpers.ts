/**
 * calcBusinessDate ヘルパー関数
 * 
 * businessHoursMonthlyMapを参照して営業日を計算するためのヘルパー関数群
 */

/**
 * businessHoursMonthlyMapのdaysマップ内の1日のデータ構造
 */
interface DayData {
  openMinute: number;
  closeMinute: number;
  isClosed: boolean;
  source?: string;
  styleId?: string;
}

/**
 * UTCをJST（UTC+9）に変換
 */
export function convertToJst(date: Date): Date {
  const jstOffset = 9 * 60; // 9時間を分に変換
  const jstTime = date.getTime() + jstOffset * 60000;
  return new Date(jstTime);
}

/**
 * YYYY-MM形式の月キーを生成
 */
export function formatMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * 前月の月キーを生成
 */
export function getPrevMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

/**
 * 次月の月キーを生成
 */
export function getNextMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (month === 12) {
    return `${year + 1}-01`;
  }
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * daysキーの正規化（"1"/"01"の揺れに対応）
 */
export function normalizeDayKey(dayKey: string): string {
  // 数値に変換してから文字列に戻すことで、"01" → "1"に正規化
  const dayNum = parseInt(dayKey, 10);
  if (isNaN(dayNum)) {
    return dayKey; // 数値でない場合はそのまま返す
  }
  return String(dayNum);
}

/**
 * 該当日のデータを取得（月跨ぎ対応）
 */
export async function getDayData(
  currentMonthDoc: FirebaseFirestore.DocumentSnapshot,
  prevMonthDoc: FirebaseFirestore.DocumentSnapshot | null,
  nextMonthDoc: FirebaseFirestore.DocumentSnapshot | null,
  dayKey: string,
  jstDate: Date
): Promise<{
  openMinute: number;
  closeMinute: number;
  isClosed: boolean;
  businessDateKey: string;
} | null> {
  // まず当月のデータを確認
  if (currentMonthDoc.exists) {
    const data = currentMonthDoc.data();
    const days = data?.days || {};
    
    // 正規化されたキーと元のキーの両方をチェック
    const normalizedKey = normalizeDayKey(dayKey);
    const dayDataRaw = days[normalizedKey] || days[dayKey];
    
    if (dayDataRaw && typeof dayDataRaw === 'object') {
      const dayData = dayDataRaw as DayData;
      const businessDateKey = formatBusinessDateKey(jstDate);
      return {
        openMinute: dayData.openMinute || 0,
        closeMinute: dayData.closeMinute || 1440,
        isClosed: dayData.isClosed || false,
        businessDateKey,
      };
    }
  }

  // 1日の場合は前月の最終日を確認
  if (jstDate.getUTCDate() === 1 && prevMonthDoc?.exists) {
    const data = prevMonthDoc.data();
    const days = data?.days || {};
    
    // 前月の最終日を取得（28-31日のいずれか）
    for (let day = 31; day >= 28; day--) {
      const dayKeyStr = String(day);
      const normalizedKey = normalizeDayKey(dayKeyStr);
      const dayDataRaw = days[normalizedKey] || days[dayKeyStr];
      
      if (dayDataRaw && typeof dayDataRaw === 'object') {
        const dayData = dayDataRaw as DayData;
        if (!dayData.isClosed) {
          // 前月の最終営業日として扱う
          const prevMonthKey = getPrevMonthKey(formatMonthKey(jstDate));
          const [year, month] = prevMonthKey.split('-').map(Number);
          const businessDateKey = `${year}-${String(month).padStart(2, '0')}-${dayKeyStr.padStart(2, '0')}`;
          return {
            openMinute: dayData.openMinute || 0,
            closeMinute: dayData.closeMinute || 1440,
            isClosed: false,
            businessDateKey,
          };
        }
      }
    }
  }

  // 28-31日の場合は次月の1日を確認
  if (jstDate.getUTCDate() >= 28 && nextMonthDoc?.exists) {
    const data = nextMonthDoc.data();
    const days = data?.days || {};
    
    // 次月の1日を確認
    const dayKeyStr = '1';
    const normalizedKey = normalizeDayKey(dayKeyStr);
    const dayDataRaw = days[normalizedKey] || days[dayKeyStr];
    
    if (dayDataRaw && typeof dayDataRaw === 'object') {
      const dayData = dayDataRaw as DayData;
      if (!dayData.isClosed) {
        // 次月の最初の営業日として扱う
        const nextMonthKey = getNextMonthKey(formatMonthKey(jstDate));
        const businessDateKey = `${nextMonthKey}-01`;
        return {
          openMinute: dayData.openMinute || 0,
          closeMinute: dayData.closeMinute || 1440,
          isClosed: false,
          businessDateKey,
        };
      }
    }
  }

  return null;
}

/**
 * 分単位から時刻に変換（baseDateを基準に）
 * 
 * @param minutes 分単位（0-2880、1440=24:00、2880=48:00）
 * @param baseDate 基準日（JST）
 * @returns 時刻（Date）
 * 
 * 注意: closeMinute > 1440の場合は翌日に伸びる（例: 1680 = 28:00 = 翌日04:00）
 */
export function minutesToTime(minutes: number, baseDate: Date): Date {
  const date = new Date(baseDate);
  date.setUTCHours(0, 0, 0, 0); // 時刻を00:00:00にリセット
  
  // closeMinute > 1440の場合は翌日に伸びる
  if (minutes > 1440) {
    const extraDays = Math.floor(minutes / 1440);
    date.setUTCDate(date.getUTCDate() + extraDays);
    const remainingMinutes = minutes % 1440;
    const hours = Math.floor(remainingMinutes / 60);
    const mins = remainingMinutes % 60;
    date.setUTCHours(hours, mins, 0, 0);
  } else {
    // 1440以下の場合
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    date.setUTCHours(hours, mins, 0, 0);
  }
  
  return date;
}

/**
 * 時刻から分を減算
 */
export function subtractMinutes(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setUTCMinutes(result.getUTCMinutes() - minutes);
  return result;
}

/**
 * 時刻に分を加算
 */
export function addMinutes(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setUTCMinutes(result.getUTCMinutes() + minutes);
  return result;
}

/**
 * 営業日キー（YYYY-MM-DD形式）を生成
 */
export function formatBusinessDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 営業日候補を列挙（バッファ適用済みのウィンドウを使用）
 */
export async function findBusinessDateCandidates(
  jstDate: Date,
  bufferedOpenTime: Date,
  bufferedCloseTime: Date,
  currentMonthDoc: FirebaseFirestore.DocumentSnapshot,
  prevMonthDoc: FirebaseFirestore.DocumentSnapshot | null,
  nextMonthDoc: FirebaseFirestore.DocumentSnapshot | null
): Promise<string[]> {
  const candidates: string[] = [];
  const inputTime = jstDate.getTime();

  // 当月の営業日をチェック
  if (currentMonthDoc.exists) {
    const data = currentMonthDoc.data();
    const days = data?.days || {};
    
    for (const [dayKey, dayDataRaw] of Object.entries(days)) {
      if (typeof dayDataRaw !== 'object' || dayDataRaw === null) continue;
      const dayData = dayDataRaw as DayData;
      if (dayData.isClosed) continue;
      
      const normalizedDayKey = normalizeDayKey(dayKey);
      const dayNum = parseInt(normalizedDayKey, 10);
      if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) continue;
      
      // 該当日の営業時間ウィンドウを計算
      const baseDate = new Date(jstDate);
      baseDate.setUTCDate(dayNum);
      baseDate.setUTCHours(0, 0, 0, 0);
      
      const openTime = minutesToTime(dayData.openMinute || 0, baseDate);
      const closeTime = minutesToTime(dayData.closeMinute || 1440, baseDate);
      
      // バッファを適用したウィンドウ内かチェック
      // 入力時刻が、この営業日のバッファ適用済みウィンドウ（openTime - buffer から closeTime + buffer）内にあるか
      const bufferMinutes = getCalcBusinessDateBufferMinutes();
      const dayBufferedOpenTime = subtractMinutes(openTime, bufferMinutes);
      const dayBufferedCloseTime = addMinutes(closeTime, bufferMinutes);
      
      if (inputTime >= dayBufferedOpenTime.getTime() && inputTime <= dayBufferedCloseTime.getTime()) {
        const businessDateKey = formatBusinessDateKey(baseDate);
        if (!candidates.includes(businessDateKey)) {
          candidates.push(businessDateKey);
        }
      }
    }
  }

  // 前月の最終営業日をチェック（1日の場合）
  if (jstDate.getUTCDate() === 1 && prevMonthDoc?.exists) {
    const data = prevMonthDoc.data();
    const days = data?.days || {};
    
    for (let day = 31; day >= 28; day--) {
      const dayKeyStr = String(day);
      const normalizedKey = normalizeDayKey(dayKeyStr);
      const dayDataRaw = days[normalizedKey] || days[dayKeyStr];
      
      if (dayDataRaw && typeof dayDataRaw === 'object') {
        const dayData = dayDataRaw as DayData;
        if (!dayData.isClosed) {
          const prevMonthKey = getPrevMonthKey(formatMonthKey(jstDate));
          const [year, month] = prevMonthKey.split('-').map(Number);
          const baseDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
          
          const openTime = minutesToTime(dayData.openMinute || 0, baseDate);
          const closeTime = minutesToTime(dayData.closeMinute || 1440, baseDate);
          
          const bufferMinutes = getCalcBusinessDateBufferMinutes();
          const dayBufferedOpenTime = subtractMinutes(openTime, bufferMinutes);
          const dayBufferedCloseTime = addMinutes(closeTime, bufferMinutes);
          
          if (inputTime >= dayBufferedOpenTime.getTime() && inputTime <= dayBufferedCloseTime.getTime()) {
            const businessDateKey = `${prevMonthKey}-${dayKeyStr.padStart(2, '0')}`;
            if (!candidates.includes(businessDateKey)) {
              candidates.push(businessDateKey);
            }
          }
        }
      }
    }
  }

  // 次月の最初の営業日をチェック（28-31日の場合）
  if (jstDate.getUTCDate() >= 28 && nextMonthDoc?.exists) {
    const data = nextMonthDoc.data();
    const days = data?.days || {};
    
    const dayKeyStr = '1';
    const normalizedKey = normalizeDayKey(dayKeyStr);
    const dayDataRaw = days[normalizedKey] || days[dayKeyStr];
    
    if (dayDataRaw && typeof dayDataRaw === 'object') {
      const dayData = dayDataRaw as DayData;
      if (!dayData.isClosed) {
        const nextMonthKey = getNextMonthKey(formatMonthKey(jstDate));
        const [year, month] = nextMonthKey.split('-').map(Number);
        const baseDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
        
        const openTime = minutesToTime(dayData.openMinute || 0, baseDate);
        const closeTime = minutesToTime(dayData.closeMinute || 1440, baseDate);
        
        const bufferMinutes = getCalcBusinessDateBufferMinutes();
        const dayBufferedOpenTime = subtractMinutes(openTime, bufferMinutes);
        const dayBufferedCloseTime = addMinutes(closeTime, bufferMinutes);
        
        if (inputTime >= dayBufferedOpenTime.getTime() && inputTime <= dayBufferedCloseTime.getTime()) {
          const businessDateKey = `${nextMonthKey}-01`;
          if (!candidates.includes(businessDateKey)) {
            candidates.push(businessDateKey);
          }
        }
      }
    }
  }

  return candidates;
}

/**
 * globalConstantからバッファ時間（分）を取得
 * デフォルト: 30分
 */
export function getCalcBusinessDateBufferMinutes(): number {
  // TODO: globalConstant.dartから取得する機能を実装
  // 現時点ではデフォルト値30分を返す
  // 将来的にはFirestoreのglobalConstantドキュメントから取得するか、
  // 環境変数から取得する実装を追加
  return 70;
}
