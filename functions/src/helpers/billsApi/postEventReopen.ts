/**
 * postEventReopen ヘルパAPI
 * 
 * api_contract.md §2.6 に準拠
 * 
 * 伝票再開イベントを /events サブコレクションに記録し、トリガで差分反映する方式
 * 冪等性: docID = idempotencyKey（/events/{eventId} の eventId に idempotencyKey を使用）
 */

import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { calcBusinessDate } from './calcBusinessDate';

export interface PostEventReopenRequest {
  billId: string;
  idempotencyKey: string;
  reason?: string;              // 任意: 再開理由
  createdBy: string;           // 実行者UID
  originBusinessDate?: string; // 売上帰属日（指定されない場合は bill.businessDate から取得）
  eventBusinessDate?: string;  // イベント計上日（指定されない場合は calcBusinessDate(now) で算出）
}

export interface PostEventReopenResponse {
  success: boolean;
  billId: string;
  eventId: string;
  status: 'in_progress';
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}

/**
 * 伝票再開イベントを記録
 * 
 * @param request リクエスト
 * @returns レスポンス
 */
export async function postEventReopen(request: PostEventReopenRequest): Promise<PostEventReopenResponse> {
  const { billId, idempotencyKey, reason, createdBy, originBusinessDate, eventBusinessDate } = request;

  // バリデーション
  if (!billId || !idempotencyKey || !createdBy) {
    throw new HttpsError('invalid-argument', 'billId, idempotencyKey, createdBy are required');
  }

  const db = getFirestore();
  const billRef = db.collection('bills').doc(billId);
  const eventRef = billRef.collection('events').doc(idempotencyKey); // eventId = idempotencyKey

  let reused = false;

  try {
    const result: PostEventReopenResponse = await db.runTransaction(async (tx) => {
      // 1) 冪等チェック: 既存の event ドキュメントを確認
      const eventSnap = await tx.get(eventRef);
      if (eventSnap.exists) {
        reused = true;
        
        // 既存のレスポンスを返す（トリガで既に適用済み）
        const billSnap = await tx.get(billRef);
        if (!billSnap.exists) {
          throw new HttpsError('not-found', `Bill ${billId} not found`);
        }
        
        const billData = billSnap.data()!;
        const currentStatus = billData.status || 'settled';
        
        return {
          success: true,
          billId,
          eventId: idempotencyKey,
          status: currentStatus === 'in_progress' ? 'in_progress' : 'in_progress', // トリガで in_progress に更新されているはず
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

      // postEventReopen は settled のときだけ許可
      if (currentStatus !== 'settled') {
        throw new HttpsError(
          'failed-precondition',
          `Cannot reopen. Current status: ${currentStatus}. Only 'settled' status is allowed for postEventReopen`
        );
      }

      // 3) businessDate の取得
      const finalOriginBusinessDate = originBusinessDate || billData.businessDate;
      if (!finalOriginBusinessDate) {
        throw new HttpsError('internal', 'originBusinessDate is required');
      }

      const finalEventBusinessDate = eventBusinessDate || calcBusinessDate();

      const now = admin.firestore.Timestamp.now();

      // 4) /bills/{billId}/events/{eventId} を作成
      tx.set(eventRef, {
        type: 'reopen',
        createdAt: now,
        createdBy,
        reason: reason || null,
        idempotencyKey,
        originBusinessDate: finalOriginBusinessDate,
        eventBusinessDate: finalEventBusinessDate,
        // appliedAt はトリガで設定される
      });

      return {
        success: true,
        billId,
        eventId: idempotencyKey,
        status: 'in_progress',
      };
    });

    logger.info('postEventReopen success', {
      op: 'postEventReopen',
      billId,
      eventId: idempotencyKey,
      result: reused ? 'reused' : 'ok',
    });

    return result;
  } catch (error) {
    logger.error('postEventReopen failed', {
      op: 'postEventReopen',
      billId,
      eventId: idempotencyKey,
      result: 'fail',
      code: error instanceof HttpsError ? error.code : 'internal',
      reason: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `postEventReopen failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

