/**
 * startAccounting 用 idempotency document の状態契約。
 *
 * - commit 失敗補償: document 削除（開始未成立）
 * - 手動 cancel: status=cancelled（同一 key の再 start を拒否）
 * - status 欠損: 旧形式として active 扱い
 */

import type { firestore } from 'firebase-admin';

export type AccountingStartIdempotencyStatus = 'active' | 'cancelled';

export const ACCOUNTING_START_REQUEST_CANCELLED = 'ACCOUNTING_START_REQUEST_CANCELLED';
export const ACCOUNTING_START_IDEMPOTENCY_STALE = 'ACCOUNTING_START_IDEMPOTENCY_STALE';

/** ops 上の active key field */
export const ACTIVE_ACCOUNTING_START_IDEMPOTENCY_KEY_FIELD =
  'ops.activeAccountingStartIdempotencyKey';

export function readIdempotencyStatus(
  data: FirebaseFirestore.DocumentData | undefined,
): AccountingStartIdempotencyStatus {
  if (!data) return 'active';
  if (data.status === 'cancelled') return 'cancelled';
  // 欠損・未知値は旧形式 = active
  return 'active';
}

export function isIdempotencyActive(
  data: FirebaseFirestore.DocumentData | undefined,
): boolean {
  return readIdempotencyStatus(data) === 'active';
}

export function isIdempotencyCancelled(
  data: FirebaseFirestore.DocumentData | undefined,
): boolean {
  return readIdempotencyStatus(data) === 'cancelled';
}

export function buildActiveAccountingStartIdempotencyDoc(params: {
  requestHash: string;
  previousStatus: 'open' | 'in_progress';
  now: firestore.Timestamp;
  expiresAt: firestore.Timestamp;
}): Record<string, unknown> {
  return {
    requestHash: params.requestHash,
    previousStatus: params.previousStatus,
    status: 'active' as const,
    createdAt: params.now,
    expiresAt: params.expiresAt,
  };
}
