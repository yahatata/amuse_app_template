// import * as admin from "firebase-admin";
import { normalizeStoreCloseHour } from '../config/ops';

/**
 * 営業日を計算する
 * @param createdAt 作成日時
 * @param storeCloseHour 店舗締め時間（時、0-48の整数）
 *   - 0-23: 「当日の何時まで」を指定（例: 9 → 当日の9:00まで）
 *   - 24-48: 「翌日の何時まで」を指定（例: 25 → 翌日の1:00まで、27 → 翌日の3:00まで）
 * @returns YYYY-MM-DD形式の営業日
 * 
 * 例: STORE_CLOSE_HOUR=9 → 当日の9:00まで（9:00以降は当日の営業日）
 * 例: STORE_CLOSE_HOUR=25 → 翌日の1:00まで（当日の1:00以降は当日の営業日）
 * 例: STORE_CLOSE_HOUR=27 → 翌日の3:00まで（当日の3:00以降は当日の営業日）
 */
export function resolveBusinessDate(createdAt: Date, storeCloseHour: number): string {
  // JST（UTC+9）に変換
  const jstOffset = 9 * 60; // 9時間を分に変換
  const jstTime = createdAt.getTime() + jstOffset * 60000;
  const jstDate = new Date(jstTime);
  
  // STORE_CLOSE_HOUR を正規化（24以上は翌日繰り上がり）
  const normalizedHour = normalizeStoreCloseHour(storeCloseHour);
  
  // 現在時刻が店舗締め時間より前の場合は前日の営業日
  if (jstDate.getUTCHours() < normalizedHour) {
    // 前日の日付を取得（JST基準）
    const prevDay = new Date(jstTime - 24 * 60 * 60 * 1000);
    const year = prevDay.getUTCFullYear();
    const month = String(prevDay.getUTCMonth() + 1).padStart(2, '0');
    const day = String(prevDay.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } else {
    // 店舗締め時間以降は当日の営業日（JST基準）
    const year = jstDate.getUTCFullYear();
    const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(jstDate.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * 支払い方法の配賦を計算する
 * @param paymentTotals bills 親ドキュメントの paymentTotals（既に配賦済み）
 * @param opts オプション（fallbackCashAmount, validMethods）
 * @returns 支払い方法別金額
 */
export function distributePaymentMethods(
  paymentTotals: Record<string, number> | undefined | null,
  opts?: { fallbackCashAmount?: number; validMethods?: string[] }
): Map<string, number> {
  const paymentTotalsMap = new Map<string, number>();
  
  // 有効な支払い方法のリスト（デフォルト）
  const validMethods = opts?.validMethods || ['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameChip'];
  const defaultPaymentMethod = 'cash';
  
  // paymentTotals が null/undefined/空の場合
  if (!paymentTotals || typeof paymentTotals !== 'object' || Object.keys(paymentTotals).length === 0) {
    if (opts?.fallbackCashAmount && opts.fallbackCashAmount > 0) {
      // fallbackCashAmount がある場合は cash に配賦
      paymentTotalsMap.set(defaultPaymentMethod, opts.fallbackCashAmount);
      console.warn('distributePaymentMethods: paymentTotals is empty, using fallbackCashAmount', {
        fallbackCashAmount: opts.fallbackCashAmount,
      });
    } else {
      // fallbackCashAmount も無い場合は空Mapを返す（警告のみ）
      console.warn('distributePaymentMethods: paymentTotals is empty and no fallbackCashAmount provided');
    }
    return paymentTotalsMap;
  }
  
  // paymentTotals がある場合
  let invalidMethodCount = 0;
  for (const [method, amount] of Object.entries(paymentTotals)) {
    if (amount <= 0) {
      // amount <= 0 は無視
      continue;
    }
    
    // validMethods チェック
    if (validMethods.includes(method)) {
      // 有効な method はそのまま使用
      paymentTotalsMap.set(method, (paymentTotalsMap.get(method) || 0) + amount);
    } else {
      // 無効な method は cash に加算（正規化）
      paymentTotalsMap.set(defaultPaymentMethod, (paymentTotalsMap.get(defaultPaymentMethod) || 0) + amount);
      invalidMethodCount++;
    }
  }
  
  // 無効methodをcashへ寄せた場合は警告
  if (invalidMethodCount > 0) {
    console.warn('distributePaymentMethods: invalid methods normalized to cash', {
      invalidMethodCount,
      validMethods,
    });
  }
  
  return paymentTotalsMap;
}

/**
 * トーナメント売上を計算する
 * @param tournamentData トーナメントデータ
 * @returns 合計売上
 */
export function calculateTournamentSales(tournamentData: any): number {
  if (!tournamentData || typeof tournamentData !== 'object') {
    return 0;
  }
  
  const entryFee = tournamentData.entryFee || 0;
  const reentryCount = tournamentData.reentryCount || 0;
  const reentryFee = tournamentData.reentryFee || 0;
  const addonCount = tournamentData.addonCount || 0;
  const addonFee = tournamentData.addonFee || 0;
  
  return entryFee + (reentryFee * reentryCount) + (addonFee * addonCount);
}

/**
 * 安全な加算を行う
 * @param current 現在の値
 * @param increment 加算する値
 * @returns 加算後の値
 */
export function safeAdd(current: number | undefined, increment: number): number {
  return (current || 0) + increment;
}

/**
 * 安全なMap更新を行う
 * @param map Mapオブジェクト
 * @param key キー
 * @param value 値
 */
export function safeMapUpdate(map: Map<string, number>, key: string, value: number): void {
  const current = map.get(key) || 0;
  map.set(key, current + value);
}

/**
 * カテゴリ別金額を計算する
 * @param billData bills 親ドキュメントのデータ（categoryBreakdown を直接参照）
 * @returns カテゴリ別金額
 */
export function calculateCategoryAmounts(billData: any): Map<string, number> {
  const categoryAmounts = new Map<string, number>();
  
  // categoryBreakdown を直接参照（bills 親スナップショット）
  const categoryBreakdown = billData.categoryBreakdown || {};
  
  // items
  if (categoryBreakdown.items) {
    categoryAmounts.set('items', categoryBreakdown.items);
  }
  
  // sideGameChip (categoryBreakdown.sideGameChips → analyticsキーは sideGameChip（単数）にマップ)
  if (categoryBreakdown.sideGameChips) {
    categoryAmounts.set('sideGameChip', categoryBreakdown.sideGameChips);
  }
  
  // extraCost
  if (categoryBreakdown.extraCost) {
    categoryAmounts.set('extraCost', categoryBreakdown.extraCost);
  }
  
  // tournaments
  if (categoryBreakdown.tournaments) {
    categoryAmounts.set('tournaments', categoryBreakdown.tournaments);
  }
  
  return categoryAmounts;
}
