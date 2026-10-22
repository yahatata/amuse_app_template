/**
 * appendExtra ヘルパAPI
 * 
 * bills/{billId}/extras サブコレクションに追加料金を追加する
 * appendItem のパターンに従い、冪等性を保証
 */

import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';
import * as crypto from 'crypto';
import { shouldDualWrite } from './dualWrite';

/**
 * リクエストペイロードの正規化ハッシュを生成
 */
function stableHash(input: unknown): string {
  const json = JSON.stringify(input, Object.keys((input as any) ?? {}).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
}

export interface AppendExtraRequest {
  billId: string;
  name: string;
  amountIncl: number;
  idempotencyKey?: string; // オプション（指定されない場合は自動生成）
}

export interface AppendExtraResponse {
  success: boolean;
  billId: string;
  extraId: string;
  createdAt: string; // ISO8601形式
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}

/**
 * appendExtraCore: トランザクション内で extras を作成するコアロジック
 */
export interface AppendExtraCoreParams {
  billId: string;
  name: string;
  amountIncl: number;
  idempotencyKey: string;
  requestHash: string;
}

export interface AppendExtraCoreResult {
  success: boolean;
  billId: string;
  extraId: string;
  createdAt: string; // ISO8601形式（トランザクション内では空文字、後で設定）
  reused: boolean;
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
  dualWriteResult?: 'success' | 'failed' | 'skipped';
  dualWriteError?: any;
}

export async function appendExtraCore(
  tx: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  params: AppendExtraCoreParams
): Promise<AppendExtraCoreResult> {
  const { billId, name, amountIncl, idempotencyKey, requestHash } = params;
  
  const billRef = db.collection('bills').doc(billId);
  const idempotencyRef = billRef.collection('idempotency').doc(idempotencyKey);

  // 1) 強い冪等チェック
  const idemSnap = await tx.get(idempotencyRef);
  if (idemSnap.exists) {
    const prevHash = idemSnap.data()?.requestHash;
    if (prevHash && prevHash !== requestHash) {
      throw new FunctionCustomError({
        errorKey: 'ACCOUNTING_IDEMPOTENCY_MISMATCH',
        message: `Idempotency key conflict: ${idempotencyKey} (hash mismatch)`,
        context: { billId, idempotencyKey, op: 'appendExtraCore' },
      });
    }
    // ハッシュ一致 → 再利用
    const extraId = idemSnap.data()?.extraId as string | undefined;
    if (extraId) {
      // 既存のextraドキュメントを確認
      const extraRef = billRef.collection('extras').doc(extraId);
      const extraSnap = await tx.get(extraRef);
      if (extraSnap.exists) {
        return {
          success: true,
          billId,
          extraId,
          createdAt: '', // 後で設定
          reused: true,
          diagnostics: {
            reason: 'Idempotency key reused',
            reused: true,
          },
        };
      }
    }
  }

  // 2) bills/{billId} を読み込み、status チェック
  const billSnap = await tx.get(billRef);
  if (!billSnap.exists) {
    throw new HttpsError('not-found', `Bill not found: ${billId}`);
  }

  const billData = billSnap.data()!;
  const status = billData.status as string;
  
  // 許可: open/in_progress、拒否: settling/settled/voided
  const allowed = status === 'open' || status === 'in_progress';
  if (!allowed) {
    throw new FunctionCustomError({
      errorKey: 'ACCOUNTING_INVALID_STATE',
      message: `Cannot append extra to bill with status: ${status}`,
      context: { billId, billStatus: status, op: 'appendExtra' },
    });
  }

  // 3) /bills/{billId}/extras/{extraId} を作成（extraId = idempotencyKey）
  const extraId = idempotencyKey;
  const extraRef = billRef.collection('extras').doc(extraId);
  const now = admin.firestore.FieldValue.serverTimestamp();

  // 4) デュアルライト: todaysBills の読み取りを書き込みの前に実行（トランザクションの制約）
  let legacyRef: admin.firestore.DocumentReference | null = null;
  let legacySnap: admin.firestore.DocumentSnapshot | null = null;
  if (await shouldDualWrite()) {
    legacyRef = db.collection('todaysBills').doc(billId);
    legacySnap = await tx.get(legacyRef);
  }
  
  // 5) 書き込み操作（すべての読み取りの後に実行）
  tx.set(extraRef, {
    name,
    amountIncl,
    createdAt: now,
  });

  // 6) 親 /bills/{billId}.updatedAt を更新
  tx.update(billRef, {
    updatedAt: now,
  });

  // 7) /bills/{billId}/idempotency/{idempotencyKey} を作成（extraIdを保存）
  tx.set(idempotencyRef, {
    requestHash,
    extraId,
    createdAt: now,
  });

  // 8) DualWrite（必要に応じて）
  let dualWriteResult: 'success' | 'failed' | 'skipped' = 'skipped';
  let dualWriteError: any = null;
  
  if ((await shouldDualWrite()) && legacyRef && legacySnap) {
    try {
      // DualWriteの実装は省略（必要に応じて追加）
      dualWriteResult = 'skipped';
    } catch (error) {
      dualWriteResult = 'failed';
      dualWriteError = error;
      logger.warn('DualWrite failed for appendExtra', { billId, extraId, error });
    }
  }

  return {
    success: true,
    billId,
    extraId,
    createdAt: '', // 後で設定
    reused: false,
    dualWriteResult,
    dualWriteError,
  };
}

/**
 * 伝票に追加料金を追加
 * 
 * @param request リクエスト
 * @returns レスポンス
 */
export async function appendExtra(request: AppendExtraRequest): Promise<AppendExtraResponse> {
  const { billId, name, amountIncl, idempotencyKey } = request;

  // バリデーション
  if (!billId || !name || amountIncl === undefined) {
    throw new HttpsError('invalid-argument', 'billId, name, amountIncl are required');
  }

  if (amountIncl < 0) {
    throw new HttpsError('invalid-argument', 'amountIncl must be 0 or greater');
  }

  const db = getFirestore();
  const billRef = db.collection('bills').doc(billId);

  // idempotencyKeyが指定されていない場合は自動生成
  const finalIdempotencyKey = idempotencyKey || `extra_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // requestHash を生成（billId, name, amountIncl を正規化）
  const requestHash = stableHash({
    billId,
    name,
    amountIncl,
  });

  let reused = false;

  try {
    const result: AppendExtraCoreResult = await db.runTransaction(async (tx) => {
      return await appendExtraCore(tx, db, {
        billId,
        name,
        amountIncl,
        idempotencyKey: finalIdempotencyKey,
        requestHash,
      });
    });
    
    reused = result.reused;

    // トランザクション後に extra ドキュメントを読み直して createdAt の実値を取得
    const extraRef = billRef.collection('extras').doc(result.extraId);
    const extraSnap = await extraRef.get();
    if (!extraSnap.exists) {
      throw new HttpsError('internal', 'Extra document not found after transaction');
    }
    const extraData = extraSnap.data()!;
    const createdAt = extraData.createdAt;
    const createdAtIso = createdAt && createdAt.toDate ? createdAt.toDate().toISOString() : new Date().toISOString();

    // createdAt を設定
    result.createdAt = createdAtIso;

    logger.info('appendExtra', {
      op: 'appendExtra',
      billId,
      extraId: result.extraId,
      idempKey: finalIdempotencyKey,
      result: reused ? 'reused' : 'ok',
      requestHash8: requestHash.substring(0, 8),
    });

    // dualWriteResult と dualWriteError を戻り値から削除（内部情報のみ）
    const { dualWriteResult: _, dualWriteError: __, ...response } = result;logOpsSuccess({
  message: "appendExtra 成功",
  functionEntry: "appendExtra",
  context: {
    op: 'appendExtra',
    billId,
    idempKey: finalIdempotencyKey,
    result: reused ? 'reused' : 'ok',
    code: 'ok',
    requestHash8: requestHash.substring(0, 8),
  },
});

    return response as AppendExtraResponse;
  } catch (error) {
    logOpsError({
      message: 'appendExtra: failed',
      functionEntry: 'appendExtra',
      cause: error,
      context: {
        op: 'appendExtra',
        billId,
        idempKey: finalIdempotencyKey,
        result: 'fail',
        code: error instanceof HttpsError ? error.code : 'internal',
        requestHash8: requestHash.substring(0, 8),
      },
    });
    
    if (error instanceof FunctionCustomError) {
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Failed to append extra');
  }
}

