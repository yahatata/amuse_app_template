import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

const db = admin.firestore();

// 返金処理のスキーマ
const ProcessRefundSchema = z.object({
  billId: z.string().min(1, '請求書IDは必須です'),
  refundAmount: z.number().min(0, '返金額は0以上である必要があります'),
  refundReason: z.string().min(1, '返金理由は必須です'),
  refundMethod: z.enum(['cash', 'bank_transfer', 'other']).optional().default('cash'),
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
    const { billId, refundAmount, refundReason, refundMethod } = validatedData;

    const billRef = db.collection('todaysBills').doc(billId);

    // 請求書の存在確認
    const billDoc = await billRef.get();
    if (!billDoc.exists) {
      throw new HttpsError('not-found', '指定された請求書が見つかりません');
    }

    const billData = billDoc.data()!;
    const currentStatus = billData.status || 'open';

    // 会計完了済みの場合のみ返金可能
    if (currentStatus !== 'settled') {
      throw new HttpsError('failed-precondition', '会計完了済みの請求書のみ返金可能です');
    }

    const totalPrice = billData.totalPrice || 0;

    // 返金額が請求金額を超えないかチェック
    if (refundAmount > totalPrice) {
      throw new HttpsError('invalid-argument', '返金額が請求金額を超えています');
    }

    // トランザクションで返金処理
    await db.runTransaction(async (transaction) => {
      // todaysBillsに返金情報を追加
      transaction.update(billRef, {
        refundAmount: refundAmount,
        refundReason: refundReason,
        refundMethod: refundMethod,
        refundProcessedBy: adminId,
        refundProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // accountingHistoryに返金記録を追加
      const accountingHistoryId = billData.accountingHistoryId;
      if (accountingHistoryId) {
        const accountingHistoryRef = db.collection('accountingHistory').doc(accountingHistoryId);
        
        const refundRecord = {
          type: 'refund',
          refundAmount: refundAmount,
          refundReason: refundReason,
          refundMethod: refundMethod,
          processedBy: adminId,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        transaction.update(accountingHistoryRef, {
          refunds: admin.firestore.FieldValue.arrayUnion(refundRecord),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // 返金履歴コレクションに記録
      const refundHistoryRef = db.collection('refundHistory').doc();
      transaction.set(refundHistoryRef, {
        billId: billId,
        pokerName: billData.pokerName,
        originalAmount: totalPrice,
        refundAmount: refundAmount,
        refundReason: refundReason,
        refundMethod: refundMethod,
        processedBy: adminId,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    console.log('返金処理成功 - 戻り値を返します');
    return {
      success: true,
      message: '返金処理を完了しました',
      billId: billId,
      pokerName: billData.pokerName,
      originalAmount: totalPrice,
      refundAmount: refundAmount,
      refundMethod: refundMethod,
    };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', '入力データが無効です', error.errors);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    console.error('返金処理エラー:', error);
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
    // デバイス権限の確認（role: adminのみ）
    const deviceQuery = await db.collection('devices')
      .where('uid', '==', adminId)
      .where('role', '==', 'admin')
      .limit(1)
      .get();

    if (deviceQuery.empty) {
      throw new HttpsError('permission-denied', '管理者権限がありません');
    }

    // 日付範囲の取得（デフォルトは過去30日）
    const { startDate, endDate } = request.data || {};
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    // 返金履歴を取得
    const refundHistorySnapshot = await db.collection('refundHistory')
      .where('processedAt', '>=', start)
      .where('processedAt', '<=', end)
      .orderBy('processedAt', 'desc')
      .get();

    const refundHistory = refundHistorySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return {
      success: true,
      refundHistory: refundHistory,
      totalRefunds: refundHistory.length,
      totalRefundAmount: refundHistory.reduce((sum, refund) => sum + ((refund as any).refundAmount || 0), 0),
    };

  } catch (error: any) {
    if (error instanceof HttpsError) {
      throw error;
    }
    console.error('返金履歴取得エラー:', error);
    throw new HttpsError('internal', '返金履歴の取得に失敗しました', error.message);
  }
});
