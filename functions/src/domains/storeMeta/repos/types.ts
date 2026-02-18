/**
 * state doc関連の型定義
 */

import * as admin from 'firebase-admin';

/**
 * Phase6 Step3: processing(lease) フィールドの型。
 * storeMeta/currentBusinessDay に追加する。runId と closeRuns/openRuns の docId を一致させる。
 */
export interface ProcessingLeaseDoc {
  runId: string;
  startedAt: admin.firestore.Timestamp;
  leaseExpiresAt: admin.firestore.Timestamp;
  kind: 'close' | 'open';
}

/**
 * storeMeta/currentBusinessDay ドキュメントの型定義
 */
export interface CurrentBusinessDayDoc {
  status: 'closed' | 'running' | 'error';
  currentBusinessDateKey: string | null;
  lastClosedBusinessDateKey: string | null;
  updatedAt: admin.firestore.Timestamp;
  source: string;
  lastError: {
    code: string;
    message: string;
    failedStep: string;
    at: admin.firestore.Timestamp;
    context?: any;
  } | null;
  /** Phase6 Step3 で追加。閉店/開店ターミナル実行中の lease。 */
  processing?: ProcessingLeaseDoc | null;
}

/**
 * storeMeta/currentBusinessDay/logs サブコレクションのエントリ型定義
 */
export interface StateDocLogEntry {
  type: 'open' | 'close';
  businessDateKey: string | null;
  trigger: 'manual' | 'auto';
  failedStep: string;
  errorCode: string;
  errorMessage: string;
  causeHint: string | null;
  createdAt: admin.firestore.Timestamp;
  context: any | null;
}
