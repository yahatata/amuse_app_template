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
import * as crypto from 'crypto';
import { shouldDualWrite, legacyStartAccountingUpdate } from './dualWrite';

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
        const existingRequestHash = idemData.requestHash;
        
        if (existingRequestHash && existingRequestHash !== requestHash) {
          throw new HttpsError(
            'failed-precondition',
            `requestHash mismatch. Expected: ${existingRequestHash.substring(0, 8)}, got: ${requestHash.substring(0, 8)}`
          );
        }
        
        // 既存の idempotency ドキュメントから情報を取得
        reused = true;
        
        // 既存のレスポンスを返す（updatedAt は変更しない）
        const billSnap = await tx.get(billRef);
        if (!billSnap.exists) {
          throw new HttpsError('not-found', `Bill ${billId} not found`);
        }
        
        const billData = billSnap.data()!;
        const accountingStartedAt = billData.ops?.accountingStartedAt;
        
        if (!accountingStartedAt) {
          throw new HttpsError('internal', 'Accounting started but ops.accountingStartedAt is missing');
        }
        
        const accountingStartedAtIso = accountingStartedAt.toDate ? accountingStartedAt.toDate().toISOString() : new Date().toISOString();
        
        return {
          success: true,
          billId,
          status: 'settling' as const,
          ops: {
            accountingStartedAt: accountingStartedAtIso,
            accountingStartedBy: billData.ops?.accountingStartedBy || accountingStartedBy,
          },
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
        throw new HttpsError(
          'failed-precondition',
          `Cannot start accounting. Current status: ${currentStatus}. Allowed statuses: open, in_progress`
        );
      }

      // 3) 既に accountingStartedAt が設定されている場合はエラー（重複開始防止）
      if (billData.ops?.accountingStartedAt) {
        throw new HttpsError(
          'failed-precondition',
          'Accounting has already been started'
        );
      }

      const now = admin.firestore.Timestamp.now();

      // 4) /bills/{billId} の status を 'settling' に更新
      // 5) /bills/{billId}.ops.accountingStartedAt を設定
      // 6) /bills/{billId}.ops.accountingStartedBy を設定
      // 7) /bills/{billId}.updatedAt を更新（初回のみ）
      tx.update(billRef, {
        status: 'settling',
        'ops.accountingStartedAt': now,
        'ops.accountingStartedBy': accountingStartedBy,
        updatedAt: now,
      });

      // 8) /bills/{billId}/idempotency/{idempotencyKey} を作成
      //    - requestHash を保持
      //    - expiresAt = now + 48h（Firestore TTL で自動削除）
      const expiresAt = admin.firestore.Timestamp.fromMillis(
        now.toMillis() + 48 * 60 * 60 * 1000,
      );
      tx.set(idempotencyRef, {
        requestHash,
        createdAt: now,
        expiresAt, // TTL 対象フィールド（48h 後に自動削除）
      });

      const accountingStartedAtIso = now.toDate().toISOString();

      return {
        success: true,
        billId,
        status: 'settling' as const,
        ops: {
          accountingStartedAt: accountingStartedAtIso,
          accountingStartedBy,
        },
      };
    });

    // 9) デュアルライト: todaysBills.status のみ更新（トランザクション外でベストエフォート）
    let dualWriteResult: 'success' | 'failed' | 'skipped' = 'skipped';
    
    if (shouldDualWrite() && !reused) {
      try {
        await legacyStartAccountingUpdate(db, {
          billId,
        });
        dualWriteResult = 'success';
        logger.info('dualWrite startAccounting ok', {
          op: 'startAccounting',
          billId,
          idempKey: idempotencyKey,
          dualWriteResult: 'success',
        });
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
    } else {
      logger.info('dualWrite startAccounting skipped', {
        op: 'startAccounting',
        billId,
        idempKey: idempotencyKey,
        dualWriteResult: 'skipped',
      });
    }

    logger.info('startAccounting success', {
      op: 'startAccounting',
      billId,
      idempKey: idempotencyKey,
      result: reused ? 'reused' : 'ok',
      requestHash8: requestHash.substring(0, 8),
      dualWriteResult,
    });

    return result;
  } catch (error) {
    logger.error('startAccounting failed', {
      op: 'startAccounting',
      billId,
      idempKey: idempotencyKey,
      result: 'fail',
      code: error instanceof HttpsError ? error.code : 'internal',
      reason: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `startAccounting failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

