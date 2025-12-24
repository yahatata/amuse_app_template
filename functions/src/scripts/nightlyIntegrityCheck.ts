import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getNightlyCronTriplet } from '../config/ops';

const { integrity } = getNightlyCronTriplet();

/**
 * 夜間整合確認: データ整合性を確認し、異常を検出
 * 
 * スケジュール: (STORE_CLOSE_HOUR + 1):00 JST（例: STORE_CLOSE_HOUR=27 の場合 4:00 JST）
 * 
 * 処理内容:
 * - bills 整合性: status == 'settled' だが amounts.grandTotalRounded == 0 など
 * - activeStays 整合性: activeStays が存在するが bills.status == 'settled' など
 * - analyticsMonthly 整合性: sales.grossIncl と categoryBreakdown の合計不一致など
 */
export const nightlyIntegrityCheck = onSchedule(
  {
    schedule: integrity,
    timeZone: 'Asia/Tokyo',
    retryCount: 3,
  },
  async (event) => {
    logger.info('=== 夜間整合確認開始 ===', {
      schedule: integrity,
      timestamp: new Date().toISOString(),
    });

    try {
      // const db = getFirestore(); // TODO: 実装（P1-11）で使用予定
      
      // TODO: 実装（P1-11）
      // 1. bills 整合性チェック
      //    - status == 'settled' だが amounts.grandTotalRounded == 0
      //    - postEvents.netSalesIncl < 0
      //    - paymentsSummary.balanceDueIncl < 0
      // 2. activeStays 整合性チェック
      //    - activeStays が存在するが、対応する bills.status == 'settled'
      //    - bills.status != 'settled' だが activeStays が存在しない（想定外）
      // 3. analyticsMonthly 整合性チェック
      //    - sales.grossIncl と categoryBreakdown の合計が一致しない
      //    - net.netSalesIncl が sales.grossIncl - events.totalRefundedIncl + events.totalAdjustmentsIncl と一致しない
      // 4. 整合性レポートを integrityReports/{YYYY-MM-DD} に保存

      logger.info('夜間整合確認完了（スケルトン実装）');
    } catch (error) {
      logger.error('夜間整合確認エラー:', error);
      throw error;
    }
  }
);

