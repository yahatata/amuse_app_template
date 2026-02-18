/**
 * postEventAdjustment ヘルパAPI
 * 
 * api_contract.md §2.6 に準拠
 * 
 * 追加徴収/減額イベントを /events サブコレクションに記録し、トリガで差分反映する方式
 * 冪等性: docID = idempotencyKey（/events/{eventId} の eventId に idempotencyKey を使用）
 */

import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { calcBusinessDate } from './calcBusinessDate';

export interface PostEventAdjustmentRequest {
  billId: string;
  idempotencyKey: string;
  eventPayload: {
    amountIncl: number;         // 調整額（税込、正の値）
    sign: 1 | -1;              // +1: 追加徴収、-1: 減額
    reason?: string;
  };
  createdBy: string;           // 実行者UID
  originBusinessDate?: string; // 売上帰属日（指定されない場合は bill.businessDate から取得）
  eventBusinessDate?: string;  // イベント計上日（指定されない場合は calcBusinessDate(now) で算出）
  selectedBusinessDateKey?: string; // AMBIGUOUS時の選択された営業日（YYYY-MM-DD形式）
}

export interface PostEventAdjustmentResponse {
  success: boolean;
  billId: string;
  eventId: string;
  postEvents: {
    totalAdjustmentsIncl: number;
    netSalesIncl: number;
  };
  paymentsSummary: {
    paidTotalIncl: number;
    balanceDueIncl: number;
    byMethod?: Record<string, number>;
  };
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}

/**
 * 追加徴収/減額イベントを記録
 * 
 * @param request リクエスト
 * @returns レスポンス
 */
export async function postEventAdjustment(request: PostEventAdjustmentRequest): Promise<PostEventAdjustmentResponse> {
  const { billId, idempotencyKey, eventPayload, createdBy, originBusinessDate, eventBusinessDate } = request;
  const { amountIncl, sign, reason } = eventPayload;

  // バリデーション
  if (!billId || !idempotencyKey || !createdBy) {
    throw new HttpsError('invalid-argument', 'billId, idempotencyKey, createdBy are required');
  }

  if (amountIncl === undefined || amountIncl === null || amountIncl <= 0) {
    throw new HttpsError('invalid-argument', 'amountIncl must be greater than 0');
  }

  if (sign !== 1 && sign !== -1) {
    throw new HttpsError('invalid-argument', 'sign must be 1 or -1');
  }

  const db = getFirestore();
  const billRef = db.collection('bills').doc(billId);
  const eventRef = billRef.collection('events').doc(idempotencyKey); // eventId = idempotencyKey

  let reused = false;

  try {
    const result: PostEventAdjustmentResponse = await db.runTransaction(async (tx) => {
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
        const postEvents = billData.postEvents || {};
        const paymentsSummary = billData.paymentsSummary || {};
        
        return {
          success: true,
          billId,
          eventId: idempotencyKey,
          postEvents: {
            totalAdjustmentsIncl: postEvents.totalAdjustmentsIncl || 0,
            netSalesIncl: postEvents.netSalesIncl || 0,
          },
          paymentsSummary: {
            paidTotalIncl: paymentsSummary.paidTotalIncl || 0,
            balanceDueIncl: paymentsSummary.balanceDueIncl || 0,
            byMethod: paymentsSummary.byMethod || {},
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

      // post-settlement 状態のみ許可（refund/adjustment: settled, partially_refunded, refunded）
      const allowedStatuses = ['settled', 'partially_refunded', 'refunded'];
      if (!allowedStatuses.includes(currentStatus)) {
        throw new HttpsError(
          'failed-precondition',
          `Cannot process adjustment. Current status: ${currentStatus}. Allowed statuses: ${allowedStatuses.join(', ')}`
        );
      }

      // 3) businessDate の取得
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

      // 4) /bills/{billId}/events/{eventId} を作成
      tx.set(eventRef, {
        type: 'adjustment',
        createdAt: now,
        createdBy,
        reason: reason || null,
        idempotencyKey,
        originBusinessDate: finalOriginBusinessDate,
        eventBusinessDate: finalEventBusinessDate,
        adjustment: {
          sign,
          amountIncl,
        },
        // appliedAt はトリガで設定される
      });

      // 5) レスポンスを返す（実際の postEvents と paymentsSummary の更新はトリガで行う）
      // ここでは現在の値 + 今回の調整額を計算して返す（トリガ適用前の暫定値）
      const postEvents = billData.postEvents || {};
      const paymentsSummary = billData.paymentsSummary || {};
      const grandTotalRounded = billData.amounts?.grandTotalRounded || 0;
      const newTotalAdjustmentsIncl = (postEvents.totalAdjustmentsIncl || 0) + (sign * amountIncl);
      const totalRefundedIncl = postEvents.totalRefundedIncl || 0;
      const netSalesIncl = grandTotalRounded - totalRefundedIncl + newTotalAdjustmentsIncl;

      // バリデーション: netSalesIncl が負にならないことを確認
      if (netSalesIncl < 0) {
        throw new HttpsError(
          'failed-precondition',
          `Adjustment would result in negative netSalesIncl: ${netSalesIncl}`
        );
      }

      // balanceDueIncl の計算（暫定）
      const paidTotalIncl = paymentsSummary.paidTotalIncl || 0;
      const balanceDueIncl = grandTotalRounded - paidTotalIncl - totalRefundedIncl + newTotalAdjustmentsIncl;

      // バリデーション: balanceDueIncl が負にならないことを確認
      if (balanceDueIncl < 0) {
        throw new HttpsError(
          'failed-precondition',
          `Adjustment would result in negative balanceDueIncl: ${balanceDueIncl}`
        );
      }

      return {
        success: true,
        billId,
        eventId: idempotencyKey,
        postEvents: {
          totalAdjustmentsIncl: newTotalAdjustmentsIncl,
          netSalesIncl,
        },
        paymentsSummary: {
          paidTotalIncl,
          balanceDueIncl,
          byMethod: paymentsSummary.byMethod || {},
        },
      };
    });

    logger.info('postEventAdjustment success', {
      op: 'postEventAdjustment',
      billId,
      eventId: idempotencyKey,
      result: reused ? 'reused' : 'ok',
      sign,
      amountIncl,
    });

    return result;
  } catch (error) {
    logger.error('postEventAdjustment failed', {
      op: 'postEventAdjustment',
      billId,
      eventId: idempotencyKey,
      result: 'fail',
      code: error instanceof HttpsError ? error.code : 'internal',
      reason: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `postEventAdjustment failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

