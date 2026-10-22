/**
 * Bills API 共通型定義
 */

/**
 * 営業日計算結果
 * Phase2: businessHoursMonthlyMap導入により、OK/NONE/AMBIGUOUSの3つの状態を返す
 */
export type BusinessDateResult = 
  | { status: 'OK'; businessDateKey: string }  // 単一の営業日に属する（営業日を返す）
  | { status: 'NONE' }  // どの営業日にも属さない
  | { status: 'AMBIGUOUS'; candidates: string[] };  // 複数営業日に跨る（候補のリストを返す）

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

