/**
 * analyticsDailyCheck
 *
 * 確認内容:
 *   - analyticsMonthly/{YYYY-MM}/days/{targetDate} の存在と件数チェック
 *   - days/{targetDate}.orderCount >= bills.count（当日の処理回数 >= 伝票数）
 *   - days doc が存在しない かつ billsCount > 0 → ng（未反映）
 *
 * ※ 集計用複合インデックス不要の設計：
 *   aggregationMarkers への直接クエリは行わず、
 *   days/{targetDate}.orderCount（analytics が書き込む settle 処理回数）で代替。
 *   bills の grossSales 合算も行わず、件数チェックのみ実施。
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import {
  writeBatchJobLog,
  yesterdayJst,
  businessDateToMonthKey,
  type BatchJobJudgment,
} from '../../../shared/batchJobLogs/writeBatchJobLog';
import { logOpsSuccess, logOpsError } from '../../../shared/logging/logOpsError';

const JOB_KEY = 'analyticsDailyCheck';
const FN_ENTRY = 'analyticsDailyCheck';

export const analyticsDailyCheck = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  const startedAt = Date.now();
  const db = getFirestore();
  const executedAt = admin.firestore.Timestamp.now();

  const targetDate: string =
    typeof request.data?.targetDate === 'string'
      ? request.data.targetDate
      : yesterdayJst();

  const monthKey = businessDateToMonthKey(targetDate); // "YYYY-MM"

  let status: 'success' | 'failed' = 'failed';
  let judgment: BatchJobJudgment = null;
  const failedChecks: string[] = [];
  let errorMessage: string | null = null;
  const details: Record<string, unknown> = { targetDate };

  try {
    // Step 1: days/{targetDate} を読む（analytics が settle ごとに更新）
    const dayRef = db
      .collection('analyticsMonthly')
      .doc(monthKey)
      .collection('days')
      .doc(targetDate);
    const daySnap = await dayRef.get();
    const dayExists = daySnap.exists;
    const dayData = daySnap.data() ?? {};
    const dayGrossSales: number = typeof dayData['grossSales'] === 'number' ? dayData['grossSales'] : 0;
    // orderCount = その businessDate に settle 処理が走った回数（resettle 含む）
    const dayOrderCount: number = typeof dayData['orderCount'] === 'number' ? dayData['orderCount'] : 0;

    // Step 2: bills where businessDate==targetDate AND status==settled → count のみ
    // （単一フィールド等値クエリ2つの count → 既存インデックスで対応可能）
    const billsCountSnap = await db
      .collection('bills')
      .where('businessDate', '==', targetDate)
      .where('status', '==', 'settled')
      .count()
      .get();
    const billsCount: number = billsCountSnap.data().count;

    // Step 3: チェック
    // Check A: dayOrderCount >= billsCount
    //   settle→reopen→resettle で dayOrderCount > billsCount になるのは正常
    //   dayOrderCount < billsCount は analytics に未反映の伝票が存在 → 異常
    const dayOrderCountGeBills = !dayExists ? billsCount === 0 : dayOrderCount >= billsCount;
    if (!dayOrderCountGeBills) {
      failedChecks.push('checkA_orderCount');
    }

    // Check B: days doc が存在しない かつ billsCount > 0 → 書き込み自体が未実行
    const dayMissing = !dayExists && billsCount > 0;
    if (dayMissing) {
      failedChecks.push('checkB_dayDocMissing');
    }

    Object.assign(details, {
      billsCount,
      dayGrossSales,
      dayOrderCount,
      dayExists,
      dayOrderCountGeBills,
      dayMissing,
    });

    // judgment 決定
    if (failedChecks.length === 0) {
      judgment = 'ok';
    } else if (dayMissing) {
      judgment = 'ng';
    } else if (failedChecks.includes('checkA_orderCount')) {
      const diff = billsCount - dayOrderCount;
      judgment = diff === 1 ? 'warning' : 'ng';
    } else {
      judgment = 'ng';
    }

    status = 'success';

    logOpsSuccess({
      message: `analyticsDailyCheck 完了: ${targetDate} → ${judgment}`,
      functionEntry: FN_ENTRY,
      operation: 'consistencyCheck',
      context: { targetDate, judgment, failedChecks, billsCount, dayOrderCount },
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    judgment = null;
    logOpsError({
      message: 'analyticsDailyCheck 処理中にエラー',
      functionEntry: FN_ENTRY,
      operation: 'consistencyCheck',
      cause: err,
      context: { targetDate },
    });
  }

  const durationMs = Date.now() - startedAt;

  const executionId = await writeBatchJobLog(db, {
    jobKey: JOB_KEY,
    triggeredBy: 'admin_callable',
    targetDate,
    targetMonth: null,
    executedAt,
    durationMs,
    status,
    judgment,
    failedChecks,
    errorMessage,
    details,
  }).catch((logErr) => {
    logger.warn('analyticsDailyCheck: batchJobLog write failed', { error: String(logErr) });
    return 'unknown';
  });

  return {
    jobKey: JOB_KEY,
    executionId,
    targetDate,
    status,
    judgment,
    failedChecks,
    errorMessage,
  };
});
