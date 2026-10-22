/**
 * Phase6 Step3: processing(lease) の獲得・延長・解放。
 * すべて transaction で read → 判定 → update。§6.5 の分岐に従う。
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import type { ProcessingLeaseDoc } from '../repos/types';

const LEASE_SECONDS = 120;
const STATE_DOC_PATH = 'storeMeta/currentBusinessDay';

type Kind = 'close' | 'open';

function isProcessingValid(
  processing: ProcessingLeaseDoc | null | undefined,
  nowMs: number
): boolean {
  if (!processing || typeof processing.leaseExpiresAt?.toMillis !== 'function') return false;
  const expiresMs = processing.leaseExpiresAt.toMillis();
  return nowMs <= expiresMs;
}

export interface AcquireResult {
  acquired: true;
  resumed?: boolean;
  staleTakeover?: boolean;
}

/**
 * §6.5 に従い processing を獲得する。
 * - requestRunId なし: 通常実行。processing なしなら新規獲得、有効なら failed-precondition。
 * - requestRunId ありかつ一致: resume。有効なら継続OK。
 * - requestRunId ありかつ不一致: failed-precondition。
 * - 期限切れ (now > leaseExpiresAt): stale takeover。旧 run を stale にし新 runId で獲得。
 */
export async function acquireProcessing(
  db: ReturnType<typeof getFirestore>,
  options: { runId: string; kind: Kind; requestRunId?: string | null }
): Promise<AcquireResult> {
  const { runId, kind, requestRunId } = options;
  const stateRef = db.doc(STATE_DOC_PATH);
  const nowMs = Date.now();
  const newLeaseExpiresAt = Timestamp.fromMillis(nowMs + LEASE_SECONDS * 1000);
  const newStartedAt = Timestamp.fromMillis(nowMs);

  const result = await db.runTransaction(async (txn) => {
    const snap = await txn.get(stateRef);
    if (!snap.exists) {
      throw new HttpsError('invalid-argument', 'storeMeta/currentBusinessDay does not exist');
    }
    const data = snap.data()!;
    const processing = data.processing as ProcessingLeaseDoc | null | undefined;
    const hasRequestRunId = requestRunId != null && String(requestRunId).trim() !== '';

    // (1) processing が存在しない
    if (!processing || (typeof processing === 'object' && processing.runId == null)) {
      txn.update(stateRef, {
        processing: {
          runId,
          startedAt: newStartedAt,
          leaseExpiresAt: newLeaseExpiresAt,
          kind,
        },
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { acquired: true as const, resumed: false, staleTakeover: false };
    }

    const valid = isProcessingValid(processing, nowMs);

    // (2) processing が存在し、有効 (now <= leaseExpiresAt)
    if (valid) {
      if (!hasRequestRunId) {
        throw new FunctionCustomError({
          errorKey: 'STORE_PROCESSING_LEASE_CONFLICT',
          message:
            kind === 'close'
              ? '閉店処理が他の操作で実行中です。完了するまでお待ちください。'
              : '開店処理が実行中です。完了するまでお待ちください。',
          context: { kind, runId: processing.runId },
        });
      }
      if (processing.runId !== requestRunId) {
        throw new FunctionCustomError({
          errorKey: 'STORE_PROCESSING_LEASE_CONFLICT',
          message:
            kind === 'close'
              ? '閉店処理が他の操作で実行中です。完了するまでお待ちください。'
              : '開店処理が実行中です。完了するまでお待ちください。',
          context: { kind, runId: processing.runId, requestRunId },
        });
      }
      if (processing.kind !== kind) {
        throw new FunctionCustomError({
          errorKey: 'STORE_PROCESSING_KIND_MISMATCH',
          message: `processing.kind (${processing.kind}) がリクエスト (${kind}) と一致しません`,
          context: { actualKind: processing.kind, expectedKind: kind, runId: processing.runId },
        });
      }
      return { acquired: true as const, resumed: true, staleTakeover: false };
    }

    // (3) 期限切れ → stale takeover（旧 run を stale 記録）。仕様: storeMeta/closeRuns/{runId}, storeMeta/openRuns/{runId}
    const oldRunId = processing.runId;
    const runDocId = kind === 'close' ? 'closeRuns' : 'openRuns';
    const oldRunRef = db.collection('storeMeta').doc(runDocId).collection('runs').doc(oldRunId);
    txn.set(oldRunRef, { status: 'stale', staleAt: Timestamp.now() }, { merge: true });
    txn.update(stateRef, {
      processing: {
        runId,
        startedAt: newStartedAt,
        leaseExpiresAt: newLeaseExpiresAt,
        kind,
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { acquired: true as const, resumed: false, staleTakeover: true };
  });

  return result;
}

/**
 * step 成功時に lease を延長。runId 一致かつ有効な場合のみ更新。
 */
export async function extendProcessing(
  db: ReturnType<typeof getFirestore>,
  options: { runId: string; kind: Kind }
): Promise<void> {
  const stateRef = db.doc(STATE_DOC_PATH);
  const nowMs = Date.now();
  const newLeaseExpiresAt = Timestamp.fromMillis(nowMs + LEASE_SECONDS * 1000);

  await db.runTransaction(async (txn) => {
    const snap = await txn.get(stateRef);
    if (!snap.exists) return;
    const data = snap.data()!;
    const processing = data.processing as ProcessingLeaseDoc | null | undefined;
    if (!processing || processing.runId !== options.runId || processing.kind !== options.kind) {
      return;
    }
    if (!isProcessingValid(processing, nowMs)) {
      return;
    }
    txn.update(stateRef, {
      'processing.leaseExpiresAt': newLeaseExpiresAt,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * 処理完了または失敗時に processing を解放。
 */
export async function releaseProcessing(
  db: ReturnType<typeof getFirestore>,
  options: { runId: string }
): Promise<void> {
  const stateRef = db.doc(STATE_DOC_PATH);

  await db.runTransaction(async (txn) => {
    const snap = await txn.get(stateRef);
    if (!snap.exists) return;
    const data = snap.data()!;
    const processing = data.processing as ProcessingLeaseDoc | null | undefined;
    if (!processing || processing.runId !== options.runId) {
      return;
    }
    txn.update(stateRef, {
      processing: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}
