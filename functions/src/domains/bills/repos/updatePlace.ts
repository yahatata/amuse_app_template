/**
 * updatePlace ヘルパAPI
 * 
 * 伝票の座席情報を更新する
 * 
 * ChangeSpec P1-04 に準拠:
 * - LWW（Last Write Wins）方式を採用
 * - idempotencyKey は任意（/idempotency には保存しない）
 * - DualWrite はトランザクション外でベストエフォート実行
 */

import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { logOpsError } from '../../../shared/logging/logOpsError';
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';
import { shouldDualWrite, legacyUpdatePlaceUpdate } from './dualWrite';

export interface UpdatePlaceRequest {
  billId: string;
  table: string | null;
  seat: number | null;
  idempotencyKey?: string;
  options?: {
    dualWrite?: boolean;
  };
}

export interface UpdatePlaceResponse {
  success: boolean;
  billId: string;
  place: {
    table: string | null;
    seat: number | null;
  };
  updatedAt: string;
}

/**
 * 伝票の座席情報を更新
 * 
 * @param request リクエスト
 * @returns 更新結果
 * @throws HttpsError invalid-argument: billId が未指定、table または seat の型が不正
 * @throws HttpsError not-found: billId が存在しない
 * @throws HttpsError failed-precondition: status == "settled" で更新不可
 */
export async function updatePlace(request: UpdatePlaceRequest): Promise<UpdatePlaceResponse> {
  const { billId, table, seat, idempotencyKey, options } = request;

  // バリデーション
  if (!billId) {
    throw new HttpsError('invalid-argument', 'billId is required');
  }

  if (table !== null && typeof table !== 'string') {
    throw new HttpsError('invalid-argument', 'table must be string or null');
  }

  if (seat !== null && typeof seat !== 'number') {
    throw new HttpsError('invalid-argument', 'seat must be number or null');
  }

  const db = getFirestore();

  try {
    // トランザクション内で更新（LWW方式）
    const result = await db.runTransaction(async (tx) => {
      const billRef = db.collection('bills').doc(billId);
      const billSnap = await tx.get(billRef);

      if (!billSnap.exists) {
        throw new HttpsError('not-found', `Bill ${billId} not found`);
      }

      const billData = billSnap.data()!;
      const status = billData.status as string;

      // status ガード: settled の場合は更新不可
      if (status === 'settled') {
        throw new FunctionCustomError({
          errorKey: 'ACCOUNTING_INVALID_STATE',
          message: 'Cannot update place for settled bill',
          context: { billId, billStatus: status, op: 'updatePlace' },
        });
      }

      // 座席情報を更新
      const now = admin.firestore.Timestamp.now();
      tx.update(billRef, {
        'place.table': table,
        'place.seat': seat,
        updatedAt: now,
      });

      return {
        billId,
        place: {
          table,
          seat,
        },
        updatedAt: now,
      };
    });

    // DualWrite: bills への更新完了後にベストエフォートで実行
    let dualWriteResult: 'success' | 'failed' | 'skipped' = 'skipped';
    let dualWriteError: any = null;

    const dualWriteEnabled = options?.dualWrite !== undefined ? options.dualWrite : await shouldDualWrite();
    
    if (dualWriteEnabled) {
      try {
        const legacyRef = db.collection('todaysBills').doc(billId);
        const legacySnap = await legacyRef.get();
        
        if (legacySnap.exists) {
          // 分離した関数経由で更新（テストでモック可能）
          await legacyUpdatePlaceUpdate(db, {
            billId,
            currentTable: table,
            currentSeat: seat,
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
      logger.info('dualWrite updatePlace ok', {
        op: 'updatePlace',
        billId,
        table,
        seat,
        dualWriteResult: 'success',
      });
    } else if (dualWriteResult === 'failed') {
      logger.warn('dualWrite updatePlace failed', {
        op: 'updatePlace',
        billId,
        table,
        seat,
        dualWriteResult: 'failed',
        reason: dualWriteError?.message || String(dualWriteError),
      });
    } else if (dualWriteResult === 'skipped') {
      logger.info('dualWrite updatePlace skipped', {
        op: 'updatePlace',
        billId,
        table,
        seat,
        dualWriteResult: 'skipped',
      });
    }

    // 成功ログ
    logger.info('updatePlace', {
      op: 'updatePlace',
      billId,
      table,
      seat,
      idempKey: idempotencyKey,
      result: 'ok',
    });

    return {
      success: true,
      billId: result.billId,
      place: result.place,
      updatedAt: result.updatedAt.toDate().toISOString(),
    };
  } catch (error) {
    logOpsError({
      message: 'updatePlace: failed',
      failureType: 'business',
      functionEntry: 'updatePlace',
      cause: error,
      context: {
        op: 'updatePlace',
        billId,
        table,
        seat,
        idempKey: idempotencyKey,
        result: 'fail',
        code: error instanceof HttpsError ? error.code : 'internal',
      },
    });

    if (error instanceof FunctionCustomError) {
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Failed to update place');
  }
}

