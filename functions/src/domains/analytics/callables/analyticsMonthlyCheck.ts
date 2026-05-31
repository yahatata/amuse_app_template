/**
 * analyticsMonthlyCheck
 *
 * 確認内容:
 *   Check A: grossSales == itemsSales + extraCostSales + sideGameChipSales + tournamentsSales
 *   Check B: sum(dailySales.values) == grossSales
 *   Check C: 前回ログと比較して grossSales が変化していないか（遡及変更検知）
 *
 * ※ aggregationMarkers への直接クエリは不使用（インデックスビルド待ちによる誤エラーを回避）。
 *   orderCount はドキュメント内部フィールドとして details に記録するのみ。
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import {
  writeBatchJobLog,
  lastMonthJst,
  toAnalyticsMonthKey,
  type BatchJobJudgment,
} from '../../../shared/batchJobLogs/writeBatchJobLog';
import { logOpsSuccess, logOpsError } from '../../../shared/logging/logOpsError';

const JOB_KEY = 'analyticsMonthlyCheck';
const FN_ENTRY = 'analyticsMonthlyCheck';

export const analyticsMonthlyCheck = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  const startedAt = Date.now();
  const db = getFirestore();
  const executedAt = admin.firestore.Timestamp.now();

  const targetMonth: string =
    typeof request.data?.targetMonth === 'string'
      ? request.data.targetMonth
      : lastMonthJst();

  const monthKey = toAnalyticsMonthKey(targetMonth); // "YYYY-MM"

  let status: 'success' | 'failed' = 'failed';
  let judgment: BatchJobJudgment = null;
  const failedChecks: string[] = [];
  let errorMessage: string | null = null;
  const details: Record<string, unknown> = { targetMonth };

  try {
    // Step 1: analyticsMonthly/{YYYY-MM} を読む
    const monthlyRef = db.collection('analyticsMonthly').doc(monthKey);
    const monthlySnap = await monthlyRef.get();

    if (!monthlySnap.exists) {
      details['monthlyDocExists'] = false;
      judgment = 'warning';
      status = 'success';
      logOpsSuccess({
        message: `analyticsMonthlyCheck: ${targetMonth} の月次ドキュメントが存在しない（会計なし？）`,
        functionEntry: FN_ENTRY,
        operation: 'consistencyCheck',
        context: { targetMonth, judgment },
      });
    } else {
      const data = monthlySnap.data() ?? {};
      const grossSales: number = (data['grossSales'] as number) ?? 0;
      const itemsSales: number = (data['itemsSales'] as number) ?? 0;
      const extraCostSales: number = (data['extraCostSales'] as number) ?? 0;
      const sideGameChipSales: number = (data['sideGameChipSales'] as number) ?? 0;
      const tournamentsSales: number = (data['tournamentsSales'] as number) ?? 0;
      const orderCount: number = (data['orderCount'] as number) ?? 0;
      const dailySales: Record<string, number> = (data['dailySales'] as Record<string, number>) ?? {};

      // Step 2: 前回の月次ログを取得（遡及変更検知用）
      const prevLogsSnap = await db
        .collection('batchJobLogs')
        .doc(JOB_KEY)
        .collection('executions')
        .where('status', '==', 'success')
        .where('targetMonth', '==', targetMonth)
        .orderBy('executedAt', 'desc')
        .limit(1)
        .get();
      const prevLog = prevLogsSnap.empty ? null : prevLogsSnap.docs[0].data();
      const prevGrossSales: number | null = prevLog
        ? ((prevLog['details'] as Record<string, unknown>)?.['grossSales'] as number) ?? null
        : null;
      const prevExecutionId: string | null = prevLog ? (prevLog['executionId'] as string) : null;

      // Step 3: チェック
      // Check A: grossSales == カテゴリ合算
      const computedCategorySum = itemsSales + extraCostSales + sideGameChipSales + tournamentsSales;
      const categorySumMatch = grossSales === computedCategorySum;
      if (!categorySumMatch) {
        failedChecks.push('checkA_categorySum');
      }

      // Check B: dailySales 全日合算 == grossSales
      const dailySalesSum = Object.values(dailySales).reduce((s, v) => s + (v ?? 0), 0);
      const dailySumMatchMonthly = grossSales === dailySalesSum;
      if (!dailySumMatchMonthly) {
        failedChecks.push('checkB_dailySum');
      }

      // Check C: 遡及変更検知（前回チェックから grossSales が変化）
      const retroactiveChangeDetected =
        prevGrossSales !== null && prevGrossSales !== grossSales;
      if (retroactiveChangeDetected) {
        failedChecks.push('checkC_retroactiveChange');
      }

      Object.assign(details, {
        monthlyDocExists: true,
        grossSales,
        itemsSales,
        extraCostSales,
        sideGameChipSales,
        tournamentsSales,
        computedCategorySum,
        categorySumMatch,
        dailySalesSum,
        dailySumMatchMonthly,
        orderCount,
        prevGrossSales,
        retroactiveChangeDetected,
        prevExecutionId,
      });

      // judgment 決定
      const hardFails = failedChecks.filter(c => c !== 'checkC_retroactiveChange');
      if (hardFails.length === 0 && !retroactiveChangeDetected) {
        judgment = 'ok';
      } else if (hardFails.length === 0 && retroactiveChangeDetected) {
        judgment = 'warning';
      } else {
        judgment = 'ng';
      }

      status = 'success';

      logOpsSuccess({
        message: `analyticsMonthlyCheck 完了: ${targetMonth} → ${judgment}`,
        functionEntry: FN_ENTRY,
        operation: 'consistencyCheck',
        context: { targetMonth, judgment, failedChecks, grossSales, orderCount },
      });
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    judgment = null;
    logOpsError({
      message: 'analyticsMonthlyCheck 処理中にエラー',
      functionEntry: FN_ENTRY,
      operation: 'consistencyCheck',
      cause: err,
      context: { targetMonth },
    });
  }

  const durationMs = Date.now() - startedAt;

  const executionId = await writeBatchJobLog(db, {
    jobKey: JOB_KEY,
    triggeredBy: 'admin_callable',
    targetDate: null,
    targetMonth,
    executedAt,
    durationMs,
    status,
    judgment,
    failedChecks,
    errorMessage,
    details,
  }).catch((logErr) => {
    logger.warn('analyticsMonthlyCheck: batchJobLog write failed', { error: String(logErr) });
    return 'unknown';
  });

  return {
    jobKey: JOB_KEY,
    executionId,
    targetMonth,
    status,
    judgment,
    failedChecks,
    errorMessage,
  };
});
