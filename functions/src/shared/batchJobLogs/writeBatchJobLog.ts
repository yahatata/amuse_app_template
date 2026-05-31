/**
 * batchJobLogs コレクションへの書き込みユーティリティ
 *
 * 親ドキュメント: batchJobLogs/{jobKey}  ← サマリ（直近5件・最終結果）
 * サブコレクション: batchJobLogs/{jobKey}/executions/{executionId}  ← 実行詳細
 */

import * as admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

export type BatchJobStatus = 'success' | 'failed';
export type BatchJobJudgment = 'ok' | 'ng' | 'warning' | null;
export type BatchJobTriggeredBy = 'admin_callable' | 'scheduler_cloud_task';

export interface BatchJobExecutionInput {
  jobKey: string;
  triggeredBy: BatchJobTriggeredBy;
  targetDate: string | null;
  targetMonth: string | null;
  executedAt: admin.firestore.Timestamp;
  durationMs: number;
  status: BatchJobStatus;
  judgment: BatchJobJudgment;
  failedChecks: string[];
  errorMessage: string | null;
  details: Record<string, unknown>;
}

function buildExecutionId(
  jobKey: string,
  target: string | null,
  executedAt: Date,
): string {
  const ts = executedAt
    .toISOString()
    .replace(/[-:T]/g, '')
    .substring(0, 14);
  const targetPart = (target ?? 'manual').replace(/-/g, '');
  return `${jobKey}_${targetPart}_${ts}`;
}

/**
 * 実行詳細を executions サブコレクションに書き込み、
 * 親ドキュメントのサマリをベストエフォートで更新する。
 *
 * @returns executionId
 */
export async function writeBatchJobLog(
  db: Firestore,
  input: BatchJobExecutionInput,
): Promise<string> {
  const {
    jobKey,
    triggeredBy,
    targetDate,
    targetMonth,
    executedAt,
    durationMs,
    status,
    judgment,
    failedChecks,
    errorMessage,
    details,
  } = input;

  const target = targetDate ?? targetMonth;
  const executionId = buildExecutionId(jobKey, target, executedAt.toDate());

  const parentRef = db.collection('batchJobLogs').doc(jobKey);
  const executionRef = parentRef.collection('executions').doc(executionId);

  const executionDoc = {
    executionId,
    jobKey,
    triggeredBy,
    targetDate,
    targetMonth,
    executedAt,
    durationMs,
    status,
    judgment,
    failedChecks,
    errorMessage,
    details,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await executionRef.set(executionDoc);

  // 親ドキュメントをベストエフォートで更新（失敗しても callable 自体は成功扱い）
  try {
    const parentSnap = await parentRef.get();
    const existing = parentSnap.exists ? (parentSnap.data() ?? {}) : {};

    const prevRecent: Array<{
      executedAt: admin.firestore.Timestamp;
      status: BatchJobStatus;
      judgment: BatchJobJudgment;
    }> = (existing['recentResults'] ?? []) as Array<{
      executedAt: admin.firestore.Timestamp;
      status: BatchJobStatus;
      judgment: BatchJobJudgment;
    }>;

    const newEntry = { executedAt, status, judgment };
    const recentResults = [newEntry, ...prevRecent].slice(0, 5);

    const recentNgCount = recentResults.filter(r => r.judgment === 'ng').length;
    const recentFailureCount = recentResults.filter(r => r.status === 'failed').length;

    const parentUpdate: Record<string, unknown> = {
      jobKey,
      lastExecutedAt: executedAt,
      lastStatus: status,
      lastJudgment: judgment,
      recentResults,
      recentNgCount,
      recentFailureCount,
      totalCount: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (parentSnap.exists) {
      await parentRef.update(parentUpdate);
    } else {
      await parentRef.set({ ...parentUpdate, totalCount: 1 });
    }
  } catch (err) {
    logger.warn('writeBatchJobLog: parent doc update failed (best-effort)', {
      jobKey,
      executionId,
      error: String(err),
    });
  }

  return executionId;
}

// ---------------------------------------------------------------------------
// JST 日付ユーティリティ（チェック callable 共通）
// ---------------------------------------------------------------------------

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** JST の "YYYY-MM-DD" 文字列から UTC の Timestamp 範囲 [start, end) を返す */
export function jstDateToUtcRange(jstDate: string): {
  startUtc: admin.firestore.Timestamp;
  endUtc: admin.firestore.Timestamp;
} {
  const [year, month, day] = jstDate.split('-').map(Number);
  const startJst = new Date(Date.UTC(year, month - 1, day) - JST_OFFSET_MS);
  const endJst = new Date(Date.UTC(year, month - 1, day + 1) - JST_OFFSET_MS);
  return {
    startUtc: admin.firestore.Timestamp.fromDate(startJst),
    endUtc: admin.firestore.Timestamp.fromDate(endJst),
  };
}

/** JST の "YYYY-MM" 文字列から analyticsMonthly の月キー（YYYY-MM 形式）をそのまま返す */
export function toAnalyticsMonthKey(yyyyMm: string): string {
  return yyyyMm; // analyticsMonthly は "2026-05" 形式
}

/** JST の "YYYY-MM" 文字列から reportingMonthly の月キー（YYYYMM 形式）を返す */
export function toReportingMonthKey(yyyyMm: string): string {
  return yyyyMm.replace('-', ''); // reportingMonthly は "202605" 形式
}

/** JST の今日の日付を "YYYY-MM-DD" 形式で返す */
export function todayJst(): string {
  const now = new Date(Date.now() + JST_OFFSET_MS);
  return now.toISOString().substring(0, 10);
}

/** JST の昨日の日付を "YYYY-MM-DD" 形式で返す */
export function yesterdayJst(): string {
  const now = new Date(Date.now() + JST_OFFSET_MS - 24 * 60 * 60 * 1000);
  return now.toISOString().substring(0, 10);
}

/** JST の先月を "YYYY-MM" 形式で返す */
export function lastMonthJst(): string {
  const now = new Date(Date.now() + JST_OFFSET_MS);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed: 0 = 先月
  const lastMonth = month === 0 ? 12 : month;
  const lastYear = month === 0 ? year - 1 : year;
  return `${lastYear}-${String(lastMonth).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" の businessDate の月キー（YYYY-MM 形式）を返す */
export function businessDateToMonthKey(businessDate: string): string {
  return businessDate.substring(0, 7);
}
