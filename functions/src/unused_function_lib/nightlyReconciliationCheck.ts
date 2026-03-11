/**
 * [UNUSED - Phase0B] nightlyReconciliationCheck
 *
 * デュアルライト差分チェック（STORE_CLOSE_HOUR 使用のため廃止）。
 * 閉店処理または Cloud Task で起動する方針のため、スケジューラは廃止。
 *
 * 復元手順: 下記 UNUSED_BLOCK の /* と */ を削除し、domains/analytics/scheduler に戻して export を復活させる。
 */
// ========== UNUSED_BLOCK_START ==========
/*
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getNightlyCronTriplet } from '../../../shared/time';

const { reconcile } = getNightlyCronTriplet();

export const nightlyReconciliationCheck = onSchedule(
  {
    schedule: reconcile,
    timeZone: 'Asia/Tokyo',
    retryCount: 3,
  },
  async (event) => {
    logger.info('=== デュアルライト差分チェック開始 ===', {
      schedule: reconcile,
      timestamp: new Date().toISOString(),
    });

    try {
      const WRITE_TODAYS_BILLS_IN_PARALLEL = process.env.WRITE_TODAYS_BILLS_IN_PARALLEL === 'true';

      if (!WRITE_TODAYS_BILLS_IN_PARALLEL) {
        logger.info('デュアルライトが無効のため、差分チェックをスキップ');
        return;
      }

      logger.info('デュアルライト差分チェック完了（スケルトン実装）');
    } catch (error) {
      logger.error('デュアルライト差分チェックエラー:', error);
      throw error;
    }
  }
);
*/
// ========== UNUSED_BLOCK_END ==========
