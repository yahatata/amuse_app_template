/**
 * [UNUSED - Phase4 02] nightlyRecalculateBalanceDue
 *
 * 夜間再計算（analyticsMonthly.net.balanceDueIncl）は管理用別プロジェクトで週1実施予定。
 * 本プロジェクトでは実装しない。
 *
 * 復元手順: 下記 UNUSED_BLOCK のコメントアウトを削除し、domains/analytics/scheduler に戻して export を復活させる。
 */
// ========== UNUSED_BLOCK_START ==========
/*
import { logger } from 'firebase-functions';

export async function runNightlyRecalculateBalanceDue(): Promise<void> {
  logger.info('=== 夜間再計算開始 ===', { timestamp: new Date().toISOString() });

  try {
    logger.info('夜間再計算（Phase4 で実装予定）');
  } catch (error) {
    logger.error('夜間再計算エラー:', error);
    throw error;
  }
}
*/
// ========== UNUSED_BLOCK_END ==========
