import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getNightlyCronTriplet } from '../config/ops';

const { reconcile } = getNightlyCronTriplet();

/**
 * デュアルライト差分チェック: todaysBills と bills の差分を検出
 * 
 * スケジュール: STORE_CLOSE_HOUR:30 JST（例: STORE_CLOSE_HOUR=27 の場合 3:30 JST）
 * 
 * 処理内容:
 * - Phase1 期間中、WRITE_TODAYS_BILLS_IN_PARALLEL フラグが有効な場合のみ実行
 * - billId をキーに grandTotalRounded、categoryBreakdown、paymentTotals を比較
 * - 差分を Cloud Logging に記録し、reconciliationReports/{YYYY-MM-DD} に保存
 */
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
      // const db = getFirestore(); // TODO: 実装で使用予定
      
      // Phase1 限定: WRITE_TODAYS_BILLS_IN_PARALLEL フラグをチェック
      const WRITE_TODAYS_BILLS_IN_PARALLEL = process.env.WRITE_TODAYS_BILLS_IN_PARALLEL === 'true';
      
      if (!WRITE_TODAYS_BILLS_IN_PARALLEL) {
        logger.info('デュアルライトが無効のため、差分チェックをスキップ');
        return;
      }

      // TODO: 実装（P1-11）
      // 1. 対象日の全 bills を取得
      // 2. 各 billId について todaysBills と比較
      // 3. grandTotalRounded、categoryBreakdown、paymentTotals の差分を検出
      // 4. 差分を Cloud Logging に記録（警告レベル）
      // 5. reconciliationReports/{YYYY-MM-DD} に保存

      logger.info('デュアルライト差分チェック完了（スケルトン実装）');
    } catch (error) {
      logger.error('デュアルライト差分チェックエラー:', error);
      throw error;
    }
  }
);

