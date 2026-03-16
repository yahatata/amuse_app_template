/**
 * [UNUSED - Phase4 03] nightlyIntegrityCheck
 *
 * 旧仕様（bills/activeStays/analyticsMonthly の整合性チェック）は廃止。
 * Phase4 03 で閉店処理用の新規整合性チェック（未closeトーナメント・未退勤スタッフ）を別ファイルで作成する。
 *
 * 復元手順: 下記 UNUSED_BLOCK のコメントアウトを削除し、domains/analytics/scheduler に戻して export を復活させる。
 */
// ========== UNUSED_BLOCK_START ==========
/*
import { logger } from 'firebase-functions';

export async function runNightlyIntegrityCheck(): Promise<void> {
  logger.info('=== 夜間整合確認開始 ===', { timestamp: new Date().toISOString() });

  try {
    logger.info('夜間整合確認（Phase4 で実装予定）');
  } catch (error) {
    logger.error('夜間整合確認エラー:', error);
    throw error;
  }
}
*/
// ========== UNUSED_BLOCK_END ==========
