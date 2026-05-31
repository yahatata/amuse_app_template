/**
 * reportingDailyCheck
 *
 * 確認内容:
 *   Check A: settle 型 entries 数 == その日 settledAt の bills 数
 *   Check B: 昨日の entries 合算 ≈ reportingMonthly.totalAmountIncl の前日ログからの増分
 *
 * 日付基準: settledAt / cashActionExecutedAt（= eventAt）の JST 日付
 * ※ analytics の businessDate とは異なる
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import {
  writeBatchJobLog,
  yesterdayJst,
  jstDateToUtcRange,
  toReportingMonthKey,
  type BatchJobJudgment,
} from '../../../shared/batchJobLogs/writeBatchJobLog';
import { logOpsSuccess, logOpsError } from '../../../shared/logging/logOpsError';

const JOB_KEY = 'reportingDailyCheck';
const FN_ENTRY = 'reportingDailyCheck';

export const reportingDailyCheck = onCall(async (request) => {
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

  // JST 日付範囲 → UTC Timestamp 範囲
  const { startUtc, endUtc } = jstDateToUtcRange(targetDate);

  // reporting の月キー（"YYYYMM" 形式）は targetDate の月から算出
  const reportingMonthKey = toReportingMonthKey(targetDate.substring(0, 7));

  let status: 'success' | 'failed' = 'failed';
  let judgment: BatchJobJudgment = null;
  const failedChecks: string[] = [];
  let errorMessage: string | null = null;
  const details: Record<string, unknown> = { targetDate };

  try {
    // Step 1: 前日ログを取得
    const prevLogsSnap = await db
      .collection('batchJobLogs')
      .doc(JOB_KEY)
      .collection('executions')
      .where('status', '==', 'success')
      .orderBy('executedAt', 'desc')
      .limit(1)
      .get();
    const prevLog = prevLogsSnap.empty ? null : prevLogsSnap.docs[0].data();
    const prevReportingTotal: number | null = prevLog
      ? ((prevLog['details'] as Record<string, unknown>)?.['currentReportingTotal'] as number) ?? null
      : null;
    const prevLogExecutionId: string | null = prevLog ? (prevLog['executionId'] as string) : null;

    // Step 2: 昨日 JST に eventAt がある reporting entries を取得・集計
    const entriesQuery = db
      .collection('reportingEntries')
      .where('eventAt', '>=', startUtc)
      .where('eventAt', '<', endUtc);

    const allEntriesSnap = await entriesQuery.get();
    let newSettleEntriesCount = 0;
    let newCashActionEntriesCount = 0;
    let newReopenEntriesCount = 0;
    let newEntriesTotal = 0;

    for (const doc of allEntriesSnap.docs) {
      const d = doc.data();
      const entryType: string = d['entryType'] ?? '';
      const totalAmountIncl: number = (d['totalAmountIncl'] as number) ?? 0;
      newEntriesTotal += totalAmountIncl;
      if (entryType === 'settle' || entryType === 'resettle') {
        newSettleEntriesCount++;
      } else if (entryType === 'cashAction') {
        newCashActionEntriesCount++;
      } else if (entryType === 'reopen_rollback') {
        newReopenEntriesCount++;
      }
    }

    // Step 3: 昨日 JST に closedAt がある settled bills → count
    // ※ bill ドキュメントの settle タイムスタンプは closedAt（settledAt ではない）
    const [settledBillsSnap] = await Promise.all([
      db
        .collection('bills')
        .where('closedAt', '>=', startUtc)
        .where('closedAt', '<', endUtc)
        .where('status', '==', 'settled')
        .count()
        .get(),
    ]);
    const settledBillsCount: number = settledBillsSnap.data().count;

    // Step 4: 現在の reportingMonthly.totalAmountIncl を取得（Check B 用）
    const monthlySnap = await db.collection('reportingMonthly').doc(reportingMonthKey).get();
    const currentReportingTotal: number = monthlySnap.exists
      ? ((monthlySnap.data()?.['totalAmountIncl'] as number) ?? 0)
      : 0;

    // チェック実行
    // Check A: settle 型 entries 数 == settled bills 数
    const settleCountMatch = newSettleEntriesCount === settledBillsCount;
    if (!settleCountMatch) {
      failedChecks.push('checkA_settleCount');
    }

    // Check B: 昨日 entries 合算 ≈ reporting total の増分（初回は skip）
    const reportingTotalDelta = prevReportingTotal !== null
      ? currentReportingTotal - prevReportingTotal
      : null;
    const totalAmountDiff = reportingTotalDelta !== null
      ? Math.abs(reportingTotalDelta - newEntriesTotal)
      : 0;
    const totalAmountDeltaMatch = prevReportingTotal === null || totalAmountDiff <= 2;
    if (!totalAmountDeltaMatch) {
      failedChecks.push('checkB_totalAmountDelta');
    }

    Object.assign(details, {
      newSettleEntriesCount,
      newCashActionEntriesCount,
      newReopenEntriesCount,
      newEntriesTotal,
      settledBillsCount,
      settleCountMatch,
      currentReportingTotal,
      prevReportingTotal,
      reportingTotalDelta,
      totalAmountDiff,
      totalAmountDeltaMatch,
      prevLogExecutionId,
      isFirstRun: prevLog === null,
    });

    // judgment 決定
    if (prevLog === null) {
      // 初回実行: スナップショット保存のみ
      judgment = 'ok';
    } else if (failedChecks.length === 0) {
      judgment = 'ok';
    } else if (failedChecks.includes('checkA_settleCount')) {
      const diff = Math.abs(newSettleEntriesCount - settledBillsCount);
      judgment = diff === 1 ? 'warning' : 'ng';
    } else if (failedChecks.includes('checkB_totalAmountDelta')) {
      judgment = 'ng';
    } else {
      judgment = 'ng';
    }

    status = 'success';

    logOpsSuccess({
      message: `reportingDailyCheck 完了: ${targetDate} → ${judgment}`,
      functionEntry: FN_ENTRY,
      operation: 'consistencyCheck',
      context: { targetDate, judgment, failedChecks, newSettleEntriesCount, settledBillsCount },
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    judgment = null;
    logOpsError({
      message: 'reportingDailyCheck 処理中にエラー',
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
    logger.warn('reportingDailyCheck: batchJobLog write failed', { error: String(logErr) });
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
