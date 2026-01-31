/**
 * state doc関連の型定義
 */

import * as admin from 'firebase-admin';

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
