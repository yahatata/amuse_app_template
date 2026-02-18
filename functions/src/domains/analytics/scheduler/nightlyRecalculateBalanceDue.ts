import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getNightlyCronTriplet } from '../../../shared/time';

const { recalc } = getNightlyCronTriplet();

/**
 * 夜間再計算: analyticsMonthly.net.balanceDueIncl を再計算
 * 
 * スケジュール: STORE_CLOSE_HOUR:00 JST（例: STORE_CLOSE_HOUR=27 の場合 3:00 JST）
 * 
 * 処理内容:
 * - 対象月の全 bills の paymentsSummary.balanceDueIncl を合算
 * - analyticsMonthly/{monthKey}.net.balanceDueIncl を上書き（set）
 * - 各日次の analyticsMonthly/{monthKey}/days/{businessDate}.net.balanceDueIncl も再計算
 */
export const nightlyRecalculateBalanceDue = onSchedule(
  {
    schedule: recalc,
    timeZone: 'Asia/Tokyo',
    retryCount: 3,
  },
  async (event) => {
    logger.info('=== 夜間再計算開始 ===', {
      schedule: recalc,
      timestamp: new Date().toISOString(),
    });

    try {
      // const db = getFirestore(); // TODO: 実装（P1-10 以降）で使用予定
      
      // TODO: 実装（P1-10 以降）
      // 1. 対象月を決定（前月の最終日時点で実行）
      // 2. 対象月の全 bills を businessDate でフィルタして取得
      // 3. status == 'settled' の bills のみを対象
      // 4. 各 bill の paymentsSummary.balanceDueIncl を合算
      // 5. analyticsMonthly/{monthKey}.net.balanceDueIncl を上書き（set、increment禁止）
      // 6. 各日次の analyticsMonthly/{monthKey}/days/{businessDate}.net.balanceDueIncl も同様に再計算

      logger.info('夜間再計算完了（スケルトン実装）');
    } catch (error) {
      logger.error('夜間再計算エラー:', error);
      throw error;
    }
  }
);

