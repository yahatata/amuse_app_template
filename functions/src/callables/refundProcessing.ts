/**
 * refundProcessing callable
 * 
 * P1-07: postEventRefund ヘルパAPIを使用するように変更
 * 
 * - 旧実装（todaysBillsベース、refundAmountを更新）を削除
 * - postEventRefund ヘルパAPIを呼び出すように変更（/events 追加のみ、トリガで差分反映）
 * - ユーザー残高返還処理は postEventRefund のスコープ外（必要に応じて別途処理）
 */

import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { logger } from 'firebase-functions';
import { postEventRefund } from '../helpers/billsApi/postEventRefund';

// 返金処理のスキーマ
const ProcessRefundSchema = z.object({
  billId: z.string().min(1, '請求書IDは必須です'),
  idempotencyKey: z.string().min(1, 'idempotencyKeyは必須です'),
  eventPayload: z.object({
    amountIncl: z.number().min(0, '返金額は0以上である必要があります'),
    reason: z.string().optional(),
    method: z.string().optional(),
  }),
});

/**
 * 返金処理を行うCloud Function
 * 管理者権限を持つユーザーのみが実行可能
 */
export const processRefund = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const adminId = request.auth.uid;

  try {
    const db = getFirestore();

    // デバイス権限の確認（role: adminのみ）
    const deviceQuery = await db.collection('devices')
      .where('uid', '==', adminId)
      .where('role', '==', 'admin')
      .limit(1)
      .get();

    if (deviceQuery.empty) {
      throw new HttpsError('permission-denied', '管理者権限がありません');
    }

    // 入力データの検証
    const validatedData = ProcessRefundSchema.parse(request.data);
    const { billId, idempotencyKey, eventPayload } = validatedData;

    // postEventRefund ヘルパAPIを呼び出す
    const result = await postEventRefund({
      billId,
      idempotencyKey,
      eventPayload,
      createdBy: adminId,
    });

    logger.info('processRefund success', {
      op: 'processRefund',
      billId,
      eventId: result.eventId,
    });

    return {
      success: true,
      message: '返金処理を完了しました',
      billId: result.billId,
      eventId: result.eventId,
      status: result.status,
      postEvents: result.postEvents,
      paymentsSummary: result.paymentsSummary,
    };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', '入力データが無効です', error.errors);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error('processRefund failed', {
      op: 'processRefund',
      code: 'internal',
      reason: error?.message || String(error),
    });
    throw new HttpsError('internal', '返金処理に失敗しました', error.message);
  }
});

/**
 * 返金履歴を取得するCloud Function
 * 管理者権限を持つユーザーのみが実行可能
 */
export const getRefundHistory = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const adminId = request.auth.uid;

  try {
    const db = getFirestore();

    // デバイス権限の確認（role: adminのみ）
    const deviceQuery = await db.collection('devices')
      .where('uid', '==', adminId)
      .where('role', '==', 'admin')
      .limit(1)
      .get();

    if (deviceQuery.empty) {
      throw new HttpsError('permission-denied', '管理者権限がありません');
    }

    // 返金履歴を取得（/bills/{billId}/events から refund イベントを取得）
    // TODO: 効率的なクエリ方法を検討（現時点では全 bills をスキャンする必要がある）
    // 将来的には refundHistory コレクションを作成するか、Analytics から取得することを検討
    // 日付範囲の取得は将来的に実装（現時点では未使用）

    return {
      success: true,
      refundHistory: [],
      totalRefunds: 0,
      totalRefundAmount: 0,
    };

  } catch (error: any) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error('getRefundHistory failed', {
      op: 'getRefundHistory',
      code: 'internal',
      reason: error?.message || String(error),
    });
    throw new HttpsError('internal', '返金履歴の取得に失敗しました', error.message);
  }
});
