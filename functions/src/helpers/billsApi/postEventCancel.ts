/**
 * postEventCancel ヘルパAPI
 * 
 * api_contract.md §2.6 に準拠
 * 
 * 伝票キャンセルイベントを /events サブコレクションに記録し、トリガで差分反映する方式
 * **post-settlement 専用**（updateAccounting から利用する会計後キャンセル用）
 * 冪等性: docID = idempotencyKey（/events/{eventId} の eventId に idempotencyKey を使用）
 */

import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { calcBusinessDate } from './calcBusinessDate';

export interface PostEventCancelRequest {
  billId: string;
  idempotencyKey: string;
  reason?: string;              // 任意: キャンセル理由
  createdBy: string;           // 実行者UID
  originBusinessDate?: string; // 売上帰属日（指定されない場合は bill.businessDate から取得）
  eventBusinessDate?: string;  // イベント計上日（指定されない場合は calcBusinessDate(now) で算出）
  selectedBusinessDateKey?: string; // AMBIGUOUS時の選択された営業日（YYYY-MM-DD形式）
}

export interface PostEventCancelResponse {
  success: boolean;
  billId: string;
  eventId: string;
  status: 'voided';
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}

/**
 * 伝票キャンセルイベントを記録
 * 
 * @param request リクエスト
 * @returns レスポンス
 */
export async function postEventCancel(request: PostEventCancelRequest): Promise<PostEventCancelResponse> {
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
    const result: PostEventCancelResponse = await db.runTransaction(async (tx) => {
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
          status: currentStatus === 'voided' ? 'voided' : 'voided', // トリガで voided に更新されているはず
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

      // postEventCancel は settled のときだけ許可
      if (currentStatus !== 'settled') {
        throw new HttpsError(
          'failed-precondition',
          `Cannot cancel. Current status: ${currentStatus}. Only 'settled' status is allowed for postEventCancel`
        );
      }

      // 3) 支払い・返金が一切ない状態のみ許可
      const paidTotalIncl = billData.paymentsSummary?.paidTotalIncl || 0;
      const totalRefundedIncl = billData.postEvents?.totalRefundedIncl || 0;

      if (paidTotalIncl !== 0 || totalRefundedIncl !== 0) {
        throw new HttpsError(
          'failed-precondition',
          `Cannot cancel. paidTotalIncl (${paidTotalIncl}) or totalRefundedIncl (${totalRefundedIncl}) is not zero. Refund must be processed first.`
        );
      }

      // 4) businessDate の取得
      const finalOriginBusinessDate = originBusinessDate || billData.businessDate;
      if (!finalOriginBusinessDate) {
        throw new HttpsError('internal', 'originBusinessDate is required');
      }

      // eventBusinessDateが指定されていない場合はcalcBusinessDateで計算
      let finalEventBusinessDate: string;
      if (eventBusinessDate) {
        finalEventBusinessDate = eventBusinessDate;
      } else {
        const businessDateResult = await calcBusinessDate();
        if (businessDateResult.status === 'NONE') {
          throw new HttpsError(
            'failed-precondition',
            'The event time does not belong to any business day.'
          );
        }
        if (businessDateResult.status === 'AMBIGUOUS') {
          // AMBIGUOUSの場合は、UIでどちらの営業日に属するデータなのかを選択させる
          // リクエストにselectedBusinessDateKeyが含まれている場合はそれを使用
          const selectedBusinessDateKey = request.selectedBusinessDateKey;
          if (!selectedBusinessDateKey || !businessDateResult.candidates.includes(selectedBusinessDateKey)) {
            throw new HttpsError(
              'failed-precondition',
              `The event time is ambiguous. Please select a business date from candidates: ${businessDateResult.candidates.join(', ')}`,
              { candidates: businessDateResult.candidates }
            );
          }
          finalEventBusinessDate = selectedBusinessDateKey;
        } else {
          // OKの場合
          finalEventBusinessDate = businessDateResult.businessDateKey;
        }
      }

      const now = admin.firestore.Timestamp.now();

      // 5) /bills/{billId}/events/{eventId} を作成
      tx.set(eventRef, {
        type: 'cancel',
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
        status: 'voided',
      };
    });

    logger.info('postEventCancel success', {
      op: 'postEventCancel',
      billId,
      eventId: idempotencyKey,
      result: reused ? 'reused' : 'ok',
    });

    return result;
  } catch (error) {
    logger.error('postEventCancel failed', {
      op: 'postEventCancel',
      billId,
      eventId: idempotencyKey,
      result: 'fail',
      code: error instanceof HttpsError ? error.code : 'internal',
      reason: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `postEventCancel failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

