/**
 * startAccounting ヘルパAPI
 * 
 * api_contract.md §2.5 に準拠
 * helper_api_plan.md §2 に準拠
 * 
 * 強い冪等性（/idempotency コレクション使用、requestHash保存）を採用
 * 会計開始処理を /bills/{billId} の status, ops.accountingStartedAt/By 更新に集約
 */

import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import * as crypto from 'crypto';
import { shouldDualWrite, legacyStartAccountingUpdate } from './dualWrite';
import { buildDraftAccountingInput } from '../services/parentSummary';
import {
  ACCOUNTING_START_IDEMPOTENCY_STALE,
  ACCOUNTING_START_REQUEST_CANCELLED,
  ACTIVE_ACCOUNTING_START_IDEMPOTENCY_KEY_FIELD,
  buildActiveAccountingStartIdempotencyDoc,
  isIdempotencyCancelled,
} from './accountingStartIdempotency';

/**
 * リクエストペイロードの正規化ハッシュを生成
 */
function stableHash(input: unknown): string {
  const json = JSON.stringify(input, Object.keys((input as any) ?? {}).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
}

export interface StartAccountingRequest {
  billId: string;
  idempotencyKey: string;
  accountingStartedBy: string; // オペレータUID
  requestHash?: string; // 任意（指定されない場合は内部で生成）
}

export interface StartAccountingResponse {
  success: boolean;
  billId: string;
  status: 'settling';
  ops: {
    accountingStartedAt: string; // ISO8601形式
    accountingStartedBy: string;
  };
  /** 開始直前の status。commit 失敗時の補償で復元する */
  previousStatus: 'open' | 'in_progress';
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}

/**
 * 会計開始処理
 * 
 * @param request リクエスト
 * @returns レスポンス
 */
export async function startAccounting(request: StartAccountingRequest): Promise<StartAccountingResponse> {
  const { billId, idempotencyKey, accountingStartedBy, requestHash: providedRequestHash } = request;

  // バリデーション
  if (!billId || !idempotencyKey || !accountingStartedBy) {
    throw new HttpsError('invalid-argument', 'billId, idempotencyKey, accountingStartedBy are required');
  }

  const db = getFirestore();
  const billRef = db.collection('bills').doc(billId);
  const idempotencyRef = billRef.collection('idempotency').doc(idempotencyKey);

  // requestHash を生成（billId, accountingStartedBy を正規化）
  const requestHash = providedRequestHash || stableHash({
    billId,
    accountingStartedBy,
  });

  let reused = false;

  try {
    const result: StartAccountingResponse = await db.runTransaction(async (tx) => {
      // 1) 強い冪等チェック
      const idemSnap = await tx.get(idempotencyRef);
      if (idemSnap.exists) {
        const idemData = idemSnap.data()!;

        if (isIdempotencyCancelled(idemData)) {
          throw new FunctionCustomError({
            errorKey: ACCOUNTING_START_REQUEST_CANCELLED,
            message:
              'この会計開始リクエストは取り消されています。画面を更新してやり直してください。',
            context: {
              billId,
              idempotencyKey,
              idempotencyStatus: 'cancelled',
            },
          });
        }

        const existingRequestHash = idemData.requestHash;

        if (existingRequestHash && existingRequestHash !== requestHash) {
          throw new FunctionCustomError({
            errorKey: 'ACCOUNTING_IDEMPOTENCY_MISMATCH',
            message: `requestHash mismatch. Expected: ${existingRequestHash.substring(0, 8)}, got: ${requestHash.substring(0, 8)}`,
            context: {
              expectedHash8: existingRequestHash.substring(0, 8),
              gotHash8: requestHash.substring(0, 8),
            },
          });
        }

        // 既存の idempotency ドキュメントから情報を取得
        reused = true;

        const billSnap = await tx.get(billRef);
        if (!billSnap.exists) {
          throw new HttpsError('not-found', `Bill ${billId} not found`);
        }

        const billData = billSnap.data()!;
        const accountingStartedAt = billData.ops?.accountingStartedAt;

        if (!accountingStartedAt) {
          // active idem だが startedAt 欠落 = stale（cancel後の旧形式など）。internal 禁止。
          throw new FunctionCustomError({
            errorKey: ACCOUNTING_START_IDEMPOTENCY_STALE,
            message:
              '会計開始の再送状態が不正です。画面を更新してやり直してください。',
            context: {
              billId,
              idempotencyKey,
              billStatus: billData.status ?? null,
              reason: 'active_idem_without_started_at',
            },
          });
        }

        const accountingStartedAtIso = accountingStartedAt.toDate
          ? accountingStartedAt.toDate().toISOString()
          : new Date().toISOString();
        const reusedPrevious =
          billData.ops?.accountingStartPreviousStatus === 'in_progress'
            ? 'in_progress'
            : 'open';

        return {
          success: true,
          billId,
          status: 'settling' as const,
          ops: {
            accountingStartedAt: accountingStartedAtIso,
            accountingStartedBy: billData.ops?.accountingStartedBy || accountingStartedBy,
          },
          previousStatus: reusedPrevious,
          diagnostics: {
            reused: true,
          },
        };
      }

      // 2) bill の存在確認と status チェック
      const billSnap = await tx.get(billRef);
      if (!billSnap.exists) {
        throw new HttpsError('not-found', `Bill ${billId} not found`);
      }

      const billData = billSnap.data()!;
      const currentStatus = billData.status || 'open';

      // status が open または in_progress の場合のみ許可
      if (currentStatus !== 'open' && currentStatus !== 'in_progress') {
        throw new FunctionCustomError({
          errorKey: 'ACCOUNTING_INVALID_STATE',
          message: `Cannot start accounting. Current status: ${currentStatus}. Allowed statuses: open, in_progress`,
          context: { currentStatus, allowedStatuses: ['open', 'in_progress'] },
        });
      }

      // 3) 既に accountingStartedAt が設定されている場合はエラー（重複開始防止）
      if (billData.ops?.accountingStartedAt) {
        throw new FunctionCustomError({
          errorKey: 'ACCOUNTING_ALREADY_STARTED',
          message: 'Accounting has already been started',
          context: { billId },
        });
      }

      const now = admin.firestore.Timestamp.now();
      const previousStatus = currentStatus as 'open' | 'in_progress';

      // 4–7) settling + ops + active key
      tx.update(billRef, {
        status: 'settling',
        'ops.accountingStartedAt': now,
        'ops.accountingStartedBy': accountingStartedBy,
        'ops.accountingStartPreviousStatus': previousStatus,
        [ACTIVE_ACCOUNTING_START_IDEMPOTENCY_KEY_FIELD]: idempotencyKey,
        updatedAt: now,
      });

      // 8) idempotency document（status: active）
      const expiresAt = admin.firestore.Timestamp.fromMillis(
        now.toMillis() + 48 * 60 * 60 * 1000,
      );
      tx.set(
        idempotencyRef,
        buildActiveAccountingStartIdempotencyDoc({
          requestHash,
          previousStatus,
          now,
          expiresAt,
        }),
      );

      const accountingStartedAtIso = now.toDate().toISOString();

      return {
        success: true,
        billId,
        status: 'settling' as const,
        ops: {
          accountingStartedAt: accountingStartedAtIso,
          accountingStartedBy,
        },
        previousStatus,
      };
    });

    // 9) デュアルライト: todaysBills.status のみ更新（トランザクション外でベストエフォート）
    let dualWriteResult: 'success' | 'failed' | 'skipped' = 'skipped';
    
    if ((await shouldDualWrite()) && !reused) {
      try {
        await legacyStartAccountingUpdate(db, {
          billId,
        });
        dualWriteResult = 'success';
      } catch (error: any) {
        // 失敗時は警告ログのみ（bills を正とする）
        dualWriteResult = 'failed';
        logger.warn('dualWrite startAccounting failed', {
          op: 'startAccounting',
          billId,
          idempKey: idempotencyKey,
          dualWriteResult: 'failed',
          reason: error?.message || String(error),
        });
      }
    }

    logOpsSuccess({
      message: 'startAccounting 成功',
      functionEntry: 'startAccounting',
      operation: 'startAccountingRepo',
      context: {
        billId,
        idempotencyKey,
        reused,
        requestHash8: requestHash.substring(0, 8),
        dualWriteResult,
      },
    });

    return result;
  } catch (error) {
    // 想定内 FCE は Callable 境界で 1 回だけ logOpsError する（二重計上禁止）。
    // helper 固有の phase / idempKey は context へ載せて引き継ぐ。
    if (error instanceof FunctionCustomError) {
      throw new FunctionCustomError({
        errorKey: error.errorKey,
        message: error.message,
        context: {
          ...error.context,
          billId,
          idempKey: idempotencyKey,
          phase: operationForStartAccountingKey(error.errorKey),
          result: 'fail',
        },
        cause: (error as Error & { cause?: unknown }).cause,
      });
    }

    // 想定外 / HttpsError: helper が運用境界として記録し、Callable は HttpsError を再throwのみ
    logOpsError({
      message: 'startAccounting failed',
      functionEntry: 'startAccounting',
      operation: 'startAccountingRepoCatch',
      cause: error,
      context: {
        billId,
        idempKey: idempotencyKey,
        result: 'fail',
        code: error instanceof HttpsError ? error.code : 'internal',
      },
    });

    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `startAccounting failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function buildDraftAccountingInputUpdate(options: {
  paymentMethodsByCategory?: Record<string, unknown> | null;
  paymentMethodsByAmount?: Record<string, number> | null;
}) {
  const draftAccountingInput = buildDraftAccountingInput({
    paymentMethodsByCategory: options.paymentMethodsByCategory ?? null,
    paymentMethodsByAmount: options.paymentMethodsByAmount ?? null,
  });

  return {
    'draftAccountingInput.paymentMethodsByCategory': draftAccountingInput.paymentMethodsByCategory,
    'draftAccountingInput.paymentMethodsByAmount': draftAccountingInput.paymentMethodsByAmount,
  };
}

function operationForStartAccountingKey(key: string): string {
  switch (key) {
    case 'ACCOUNTING_ALREADY_STARTED':
    case 'ACCOUNTING_INVALID_STATE':
      return 'validateAccountingState';
    case 'ACCOUNTING_IDEMPOTENCY_MISMATCH':
    case ACCOUNTING_START_REQUEST_CANCELLED:
    case ACCOUNTING_START_IDEMPOTENCY_STALE:
      return 'validateIdempotencyRequest';
    default:
      return 'runAccountingTransaction';
  }
}
