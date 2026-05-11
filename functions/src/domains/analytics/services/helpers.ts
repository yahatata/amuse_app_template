// import * as admin from "firebase-admin";

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

  // storeCloseHour を正規化（24以上は翌日繰り上がり、24で割った余りを使用）
  const normalizedHour = storeCloseHour % 24;

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

export type PaymentDistributionIssueKind =
  | 'PAYMENT_TOTALS_EMPTY_WITH_FALLBACK'
  | 'PAYMENT_TOTALS_EMPTY_NO_FALLBACK'
  | 'PAYMENT_TOTALS_INVALID_METHODS_NORMALIZED';

export interface PaymentDistributionIssue {
  kind: PaymentDistributionIssueKind;
  invalidMethodCount?: number;
  fallbackCashAmount?: number;
}

export interface DistributePaymentMethodsResult {
  paymentTotalsMap: Map<string, number>;
  issues: PaymentDistributionIssue[];
}

const DEFAULT_VALID_METHODS = [
  'cash',
  'credit_card',
  'electronic_money',
  'pointA',
  'pointB',
  'sideGameChip',
] as const;

/**
 * 支払い方法の配賦を計算し、フォールバック・正規化の issue を返す（ログは呼び出し側）
 */
export function distributePaymentMethodsWithIssues(
  paymentTotals: Record<string, number> | undefined | null,
  opts?: { fallbackCashAmount?: number; validMethods?: string[] }
): DistributePaymentMethodsResult {
  const paymentTotalsMap = new Map<string, number>();
  const issues: PaymentDistributionIssue[] = [];

  const validMethods = opts?.validMethods ?? [...DEFAULT_VALID_METHODS];
  const defaultPaymentMethod = 'cash';

  if (!paymentTotals || typeof paymentTotals !== 'object' || Object.keys(paymentTotals).length === 0) {
    const fb = opts?.fallbackCashAmount;
    if (fb != null && fb > 0) {
      paymentTotalsMap.set(defaultPaymentMethod, fb);
      issues.push({
        kind: 'PAYMENT_TOTALS_EMPTY_WITH_FALLBACK',
        fallbackCashAmount: fb,
      });
    } else {
      issues.push({ kind: 'PAYMENT_TOTALS_EMPTY_NO_FALLBACK' });
    }
    return { paymentTotalsMap, issues };
  }

  let invalidMethodCount = 0;
  for (const [method, amount] of Object.entries(paymentTotals)) {
    if (amount <= 0) {
      continue;
    }

    if (validMethods.includes(method)) {
      paymentTotalsMap.set(method, (paymentTotalsMap.get(method) || 0) + amount);
    } else {
      paymentTotalsMap.set(
        defaultPaymentMethod,
        (paymentTotalsMap.get(defaultPaymentMethod) || 0) + amount
      );
      invalidMethodCount++;
    }
  }

  if (invalidMethodCount > 0) {
    issues.push({
      kind: 'PAYMENT_TOTALS_INVALID_METHODS_NORMALIZED',
      invalidMethodCount,
    });
  }

  return { paymentTotalsMap, issues };
}

/**
 * 支払い方法の配賦を計算する（互換: Map のみ返す）
 * @param paymentTotals bills 親ドキュメントの paymentTotals（既に配賦済み）
 * @param opts オプション（fallbackCashAmount, validMethods）
 */
export function distributePaymentMethods(
  paymentTotals: Record<string, number> | undefined | null,
  opts?: { fallbackCashAmount?: number; validMethods?: string[] }
): Map<string, number> {
  return distributePaymentMethodsWithIssues(paymentTotals, opts).paymentTotalsMap;
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

  return entryFee + reentryFee * reentryCount + addonFee * addonCount;
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
