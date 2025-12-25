/**
 * Bills API 共通型定義
 */

/**
 * 営業日計算結果
 */
export interface BusinessDateResult {
  businessDate: string; // YYYY-MM-DD形式
  storeCloseHour: number; // 使用したSTORE_CLOSE_HOUR値
}

/**
 * デュアルライト結果
 */
export interface DualWriteResult {
  success: boolean;
  skipped: boolean; // フラグOFFでスキップされた場合
  error?: string; // 失敗時のエラーメッセージ
}

/**
 * 構造化ログ用の基本フィールド
 */
export interface BaseLogFields {
  op: string;
  billId: string;
  userId?: string;
  idempKey?: string;
  attempt: number;
  result: 'ok' | 'reused' | 'fail';
  code?: string;
  reason?: string;
  requestHash8?: string; // ハッシュの先頭8文字
}

