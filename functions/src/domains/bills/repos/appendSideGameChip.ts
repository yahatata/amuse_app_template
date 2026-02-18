/**
 * appendSideGameChip ヘルパAPI
 * 
 * api_contract.md §2.2 に準拠
 * helper_api_plan.md §10 に準拠
 * 
 * 強い冪等（時間窓なし、expiresAt廃止）を採用
 * サイドゲームのすべての出入り（purchase/deposit/withdraw）を /sideGameChips に集約
 */

import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as crypto from 'crypto';
import { shouldDualWrite, legacyAppendSideGameChipUpdate } from './dualWrite';

/**
 * リクエストペイロードの正規化ハッシュを生成
 */
function stableHash(input: unknown): string {
  const json = JSON.stringify(input, Object.keys((input as any) ?? {}).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
}

export interface AppendSideGameChipRequest {
  billId: string;
  action: 'purchase' | 'deposit' | 'withdraw';
  chipQty: number;
  amountIncl: number | null; // purchase の場合のみ、deposit/withdraw は null
  menuItemId: string | null; // purchase の場合のみ
  name: string | null; // 任意
  idempotencyKey: string;
}

export interface AppendSideGameChipResponse {
  success: boolean;
  billId: string;
  chipId: string;
  action: 'purchase' | 'deposit' | 'withdraw';
  orderedAt: string; // ISO8601形式
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}

/**
 * 伝票にサイドゲームチップ取引を追加
 * 
 * @param request リクエスト
 * @returns レスポンス
 */
export async function appendSideGameChip(request: AppendSideGameChipRequest): Promise<AppendSideGameChipResponse> {
  const { billId, action, chipQty, amountIncl, menuItemId, name, idempotencyKey } = request;

  // バリデーション
  if (!billId || !action || !idempotencyKey) {
    throw new HttpsError('invalid-argument', 'billId, action, idempotencyKey are required');
  }

  if (action !== 'purchase' && action !== 'deposit' && action !== 'withdraw') {
    throw new HttpsError('invalid-argument', `action must be 'purchase', 'deposit', or 'withdraw'`);
  }

  if (typeof chipQty !== 'number' || chipQty <= 0 || !Number.isInteger(chipQty)) {
    throw new HttpsError('invalid-argument', 'chipQty must be a positive integer');
  }

  if (action === 'purchase') {
    if (amountIncl === null || amountIncl === undefined || typeof amountIncl !== 'number' || amountIncl <= 0) {
      throw new HttpsError('invalid-argument', 'amountIncl is required and must be positive for purchase action');
    }
  } else {
    // deposit/withdraw の場合は amountIncl は null である必要がある
    if (amountIncl !== null) {
      throw new HttpsError('invalid-argument', 'amountIncl must be null for deposit/withdraw actions');
    }
  }

  const db = getFirestore();
  const billRef = db.collection('bills').doc(billId);
  const idempotencyRef = billRef.collection('idempotency').doc(idempotencyKey);

  // requestHash を生成（billId, action, chipQty, amountIncl, menuItemId を正規化）
  const requestHash = stableHash({
    billId,
    action,
    chipQty,
    amountIncl,
    menuItemId,
  });

  let reused = false;

  try {
    const result: AppendSideGameChipResponse = await db.runTransaction(async (tx) => {
      // 1) 強い冪等チェック
      const idemSnap = await tx.get(idempotencyRef);
      if (idemSnap.exists) {
        const prevHash = idemSnap.data()?.requestHash;
        if (prevHash && prevHash !== requestHash) {
          // ハッシュ不一致 → failed-precondition
          throw new HttpsError(
            'failed-precondition',
            'idempotency requestHash mismatch'
          );
        }
        // ハッシュ一致 → 既存docを返却（親updatedAtは更新しない）
        reused = true;
        
        // idempotency ドキュメントから chipId を取得
        const savedChipId = idemSnap.data()?.chipId as string;
        if (!savedChipId) {
          throw new HttpsError('internal', 'idempotency exists but chipId missing');
        }
        
        // 既存の sideGameChip ドキュメントを取得して orderedAt を返す
        const chipRef = billRef.collection('sideGameChips').doc(savedChipId);
        const chipSnap = await tx.get(chipRef);
        if (!chipSnap.exists) {
          throw new HttpsError('internal', 'idempotency exists but sideGameChip missing');
        }
        
        const chipData = chipSnap.data()!;
        const orderedAt = chipData.orderedAt;
        const orderedAtIso = orderedAt && orderedAt.toDate ? orderedAt.toDate().toISOString() : new Date().toISOString();
        
        // 既存レスポンスを返却（親updatedAtは更新しない）
        return {
          success: true,
          billId,
          chipId: savedChipId, // idempotencyKey と同じ値
          action: chipData.action as 'purchase' | 'deposit' | 'withdraw',
          orderedAt: orderedAtIso,
          diagnostics: {
            reason: 'idempotent replay',
            reused: true,
          },
        };
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
        throw new HttpsError('failed-precondition', `Cannot append sideGameChip to bill with status: ${status}`);
      }

      // 3) /bills/{billId}/sideGameChips/{chipId} を作成（chipId = idempotencyKey）
      const chipId = idempotencyKey; // chipId と idempotencyKey を同一化
      const chipRef = billRef.collection('sideGameChips').doc(chipId);
      const now = admin.firestore.FieldValue.serverTimestamp();

      // 4) 書き込み操作
      tx.set(chipRef, {
        action,
        chipQty,
        amountIncl: amountIncl ?? null,
        menuItemId: menuItemId ?? null,
        name: name ?? null,
        orderedAt: now,
        createdAt: now,
      });

      // 5) 親 /bills/{billId}.updatedAt を更新
      tx.update(billRef, {
        updatedAt: now,
      });

      // 6) /bills/{billId}/idempotency/{idempotencyKey} を作成（expiresAtは保存しない、chipIdを保存）
      tx.set(idempotencyRef, {
        requestHash,
        createdAt: now,
        chipId, // chipId を保存（replay 時に使用）
        // expiresAt は保存しない（会計確定時に一括削除）
      });

      // 7) トランザクション内では orderedAt の実値を取得できないため、
      // トランザクション外で取得する（戻り値は後で設定）
      return {
        success: true,
        billId,
        chipId,
        action,
        orderedAt: '', // トランザクション外で設定
      };
    });

    // 8) トランザクション後に sideGameChip ドキュメントを読み直して orderedAt の実値を取得
    // （serverTimestamp の実際の値を返すため）
    const chipRef = billRef.collection('sideGameChips').doc(result.chipId);
    const chipSnap = await chipRef.get();
    if (!chipSnap.exists) {
      throw new HttpsError('internal', 'SideGameChip document not found after transaction');
    }
    const chipData = chipSnap.data()!;
    const orderedAt = chipData.orderedAt;
    const orderedAtIso = orderedAt && orderedAt.toDate ? orderedAt.toDate().toISOString() : new Date().toISOString();

    // orderedAt を設定
    result.orderedAt = orderedAtIso;

    // 9) デュアルライト: todaysBills.sideGameChip 配列に行追加（トランザクション外でベストエフォート）
    let dualWriteResult: 'success' | 'failed' | 'skipped' = 'skipped';
    let dualWriteError: any = null;
    
    if (shouldDualWrite()) {
      try {
        const legacyRef = db.collection('todaysBills').doc(billId);
        const legacySnap = await legacyRef.get();
        
        if (legacySnap.exists) {
          // 旧スキーマに合わせた形式で追加（orderId = chipId 必須、金額フィールドは入れない）
          const legacyChip = {
            orderId: result.chipId, // chipId を必須フィールドとして保持（重複抑止）
            action,
            category: 'Chip', // 固定
            menuItemId: menuItemId ?? null,
            name: name ?? null,
            orderedAt: admin.firestore.Timestamp.fromDate(new Date(orderedAtIso)),
            amount: chipQty, // チップ枚数（金額ではない）
            // price, quantity, totalPrice などの金額フィールドは入れない（SSoTは bills）
          };
          
          // 分離した関数経由で更新（テストでモック可能）
          await legacyAppendSideGameChipUpdate(db, {
            billId,
            legacyChip,
          });
          dualWriteResult = 'success';
        } else {
          // todaysBills が存在しない場合はスキップ
          dualWriteResult = 'skipped';
        }
      } catch (error: any) {
        // 失敗時は警告ログのみ（bills を正とする）
        dualWriteResult = 'failed';
        dualWriteError = error;
      }
    }

    // DualWriteログを出力（三分岐）
    if (dualWriteResult === 'success') {
      logger.info('dualWrite appendSideGameChip ok', {
        op: 'appendSideGameChip',
        billId,
        chipId: result.chipId,
        action,
        dualWriteResult: 'success',
      });
    } else if (dualWriteResult === 'failed') {
      logger.warn('dualWrite appendSideGameChip failed', {
        op: 'appendSideGameChip',
        billId,
        chipId: result.chipId,
        action,
        dualWriteResult: 'failed',
        reason: dualWriteError?.message || String(dualWriteError),
      });
    } else if (dualWriteResult === 'skipped') {
      logger.info('dualWrite appendSideGameChip skipped', {
        op: 'appendSideGameChip',
        billId,
        chipId: result.chipId,
        action,
        dualWriteResult: 'skipped',
      });
    }

    logger.info('appendSideGameChip', {
      op: 'appendSideGameChip',
      billId,
      chipId: result.chipId,
      action,
      idempKey: idempotencyKey,
      result: reused ? 'reused' : 'ok',
      requestHash8: requestHash.substring(0, 8),
    });

    return result;
  } catch (error) {
    logger.error('appendSideGameChip: failed', {
      op: 'appendSideGameChip',
      billId,
      action,
      idempKey: idempotencyKey,
      result: 'fail',
      code: error instanceof HttpsError ? error.code : 'internal',
      reason: error instanceof Error ? error.message : String(error),
      requestHash8: requestHash.substring(0, 8),
    });
    
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Failed to append sideGameChip');
  }
}

