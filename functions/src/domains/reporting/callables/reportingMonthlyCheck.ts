/**
 * reportingMonthlyCheck
 *
 * 確認内容:
 *   Check A: markerCount == entriesCount（件数突合）
 *   Check B: monthlyTotalAmountIncl == sum(entries.totalAmountIncl)（金額突合）
 *   Check C: カテゴリ別合算突合
 *   Check D: paymentMethodBreakdown 突合
 *   Check E: 前回月次ログと比較して遡及変更がないか
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import {
  writeBatchJobLog,
  lastMonthJst,
  toReportingMonthKey,
  type BatchJobJudgment,
} from '../../../shared/batchJobLogs/writeBatchJobLog';
import { logOpsSuccess, logOpsError } from '../../../shared/logging/logOpsError';

const JOB_KEY = 'reportingMonthlyCheck';
const FN_ENTRY = 'reportingMonthlyCheck';

export const reportingMonthlyCheck = onCall(async (request) => {
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

  const reportingMonthKey = toReportingMonthKey(targetMonth); // "YYYYMM"

  let status: 'success' | 'failed' = 'failed';
  let judgment: BatchJobJudgment = null;
  const failedChecks: string[] = [];
  let errorMessage: string | null = null;
  const details: Record<string, unknown> = { targetMonth, reportingMonthKey };

  try {
    // Step 1: reportingMonthly/{YYYYMM} を読む
    const monthlyRef = db.collection('reportingMonthly').doc(reportingMonthKey);
    const monthlySnap = await monthlyRef.get();

    if (!monthlySnap.exists) {
      details['monthlyDocExists'] = false;
      judgment = 'warning';
      status = 'success';
      logOpsSuccess({
        message: `reportingMonthlyCheck: ${targetMonth} の月次ドキュメントが存在しない（会計なし？）`,
        functionEntry: FN_ENTRY,
        operation: 'consistencyCheck',
        context: { targetMonth, judgment },
      });
    } else {
      const monthlyData = monthlySnap.data()!;
      const monthlyTotalAmountIncl: number = (monthlyData['totalAmountIncl'] as number) ?? 0;
      const monthlyCategoryBreakdown: Record<string, { amountIncl: number }> =
        (monthlyData['categoryBreakdown'] as Record<string, { amountIncl: number }>) ?? {};
      const monthlyPaymentBreakdown: Record<string, number> =
        (monthlyData['paymentMethodBreakdown'] as Record<string, number>) ?? {};

      // Step 2: reportingEntries where reportingMonth == YYYYMM を全件取得
      const entriesSnap = await db
        .collection('reportingEntries')
        .where('reportingMonth', '==', reportingMonthKey)
        .get();
      const entriesCount = entriesSnap.size;

      // Step 3: aggregationMarkers の件数
      const markerCountSnap = await monthlyRef
        .collection('aggregationMarkers')
        .count()
        .get();
      const markerCount = markerCountSnap.data().count;

      // Step 4: entries から合算計算
      let computedTotalFromEntries = 0;
      const computedCategoryBreakdown: Record<string, number> = {};
      const computedPaymentBreakdown: Record<string, number> = {};

      for (const doc of entriesSnap.docs) {
        const d = doc.data();
        const totalAmountIncl: number = (d['totalAmountIncl'] as number) ?? 0;
        computedTotalFromEntries += totalAmountIncl;

        const catBreakdown: Record<string, { amountIncl: number }> =
          (d['categoryBreakdown'] as Record<string, { amountIncl: number }>) ?? {};
        for (const [key, val] of Object.entries(catBreakdown)) {
          computedCategoryBreakdown[key] = (computedCategoryBreakdown[key] ?? 0) + val.amountIncl;
        }

        const payBreakdown: Record<string, number> =
          (d['paymentBreakdown'] as Record<string, number>) ?? {};
        for (const [method, amount] of Object.entries(payBreakdown)) {
          computedPaymentBreakdown[method] = (computedPaymentBreakdown[method] ?? 0) + amount;
        }
      }

      // Step 5: 前回ログ取得（遡及変更検知用）
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
      const prevMonthlyLogTotal: number | null = prevLog
        ? ((prevLog['details'] as Record<string, unknown>)?.['monthlyTotalAmountIncl'] as number) ?? null
        : null;
      const prevExecutionId: string | null = prevLog ? (prevLog['executionId'] as string) : null;

      // チェック実行
      // Check A: markerCount == entriesCount
      const markerCountMatch = markerCount === entriesCount;
      if (!markerCountMatch) {
        failedChecks.push('checkA_markerCount');
      }

      // Check B: totalAmountIncl 突合（diff > 0 で checkB に積む。diff ≤ 1 は warning 扱い）
      const totalAmountDiff = Math.abs(monthlyTotalAmountIncl - computedTotalFromEntries);
      const totalAmountMatch = totalAmountDiff === 0;
      if (!totalAmountMatch) {
        failedChecks.push('checkB_totalAmount');
      }

      // Check C: カテゴリ別突合
      const mismatchedCategories: string[] = [];
      const allCategoryKeys = new Set([
        ...Object.keys(monthlyCategoryBreakdown),
        ...Object.keys(computedCategoryBreakdown),
      ]);
      for (const key of allCategoryKeys) {
        const monthlyVal = monthlyCategoryBreakdown[key]?.amountIncl ?? 0;
        const computedVal = computedCategoryBreakdown[key] ?? 0;
        if (Math.abs(monthlyVal - computedVal) > 1) {
          mismatchedCategories.push(key);
        }
      }
      const categoryBreakdownMatch = mismatchedCategories.length === 0;
      if (!categoryBreakdownMatch) {
        failedChecks.push('checkC_categoryBreakdown');
      }

      // Check D: 支払い方法別突合（paymentMethodBreakdown）
      const mismatchedPayments: string[] = [];
      const allPaymentKeys = new Set([
        ...Object.keys(monthlyPaymentBreakdown),
        ...Object.keys(computedPaymentBreakdown),
      ]);
      for (const method of allPaymentKeys) {
        const monthlyVal = monthlyPaymentBreakdown[method] ?? 0;
        const computedVal = computedPaymentBreakdown[method] ?? 0;
        if (Math.abs(monthlyVal - computedVal) > 1) {
          mismatchedPayments.push(method);
        }
      }
      const paymentBreakdownMatch = mismatchedPayments.length === 0;
      if (!paymentBreakdownMatch) {
        failedChecks.push('checkD_paymentBreakdown');
      }

      // Check E: 遡及変更検知
      const retroactiveChangeDetected =
        prevMonthlyLogTotal !== null && prevMonthlyLogTotal !== monthlyTotalAmountIncl;
      if (retroactiveChangeDetected) {
        failedChecks.push('checkE_retroactiveChange');
      }

      Object.assign(details, {
        monthlyDocExists: true,
        entriesCount,
        markerCount,
        markerCountMatch,
        monthlyTotalAmountIncl,
        computedTotalFromEntries,
        totalAmountDiff,
        totalAmountMatch,
        categoryBreakdownMatch,
        mismatchedCategories,
        paymentBreakdownMatch,
        mismatchedPayments,
        retroactiveChangeDetected,
        prevMonthlyLogTotal,
        prevExecutionId,
      });

      // judgment 決定
      const hardFails = failedChecks.filter(
        c => c !== 'checkB_totalAmount' && c !== 'checkE_retroactiveChange',
      );
      const softOnly = failedChecks.every(
        c => c === 'checkB_totalAmount' || c === 'checkE_retroactiveChange',
      );

      if (failedChecks.length === 0) {
        judgment = 'ok';
      } else if (softOnly && failedChecks.includes('checkB_totalAmount') && totalAmountDiff <= 1) {
        judgment = 'warning';
      } else if (softOnly && failedChecks.every(c => c === 'checkE_retroactiveChange')) {
        judgment = 'warning';
      } else if (hardFails.length > 0) {
        judgment = 'ng';
      } else {
        judgment = 'warning';
      }

      status = 'success';

      logOpsSuccess({
        message: `reportingMonthlyCheck 完了: ${targetMonth} → ${judgment}`,
        functionEntry: FN_ENTRY,
        operation: 'consistencyCheck',
        context: {
          targetMonth,
          judgment,
          failedChecks,
          entriesCount,
          markerCount,
          monthlyTotalAmountIncl,
          computedTotalFromEntries,
        },
      });
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    judgment = null;
    logOpsError({
      message: 'reportingMonthlyCheck 処理中にエラー',
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
    logger.warn('reportingMonthlyCheck: batchJobLog write failed', { error: String(logErr) });
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
