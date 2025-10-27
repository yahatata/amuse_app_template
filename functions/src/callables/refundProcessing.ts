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
  // 返金対象カテゴリ（部分返金の場合に指定）
  refundCategories: z.array(z.enum(['extraCost', 'tournaments', 'items', 'sideGameChip'])).optional(),
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
    const { billId, refundAmount, refundReason, refundMethod, refundCategories } = validatedData;

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

      // ポイント/サイドゲームチップの返還処理
      const userId = billData.userId;
      if (userId) {
        const paymentMethodsByCategory = billData.paymentMethodsByCategory || {};
        const categoryAmounts: Record<string, number> = {};

        // 各カテゴリの金額を計算
        const extraCosts = billData.extraCost || [];
        categoryAmounts['extraCost'] = extraCosts.reduce((sum: number, item: any) => sum + (item.price || 0), 0);

        const tournaments = billData.tournaments || {};
        categoryAmounts['tournaments'] = Object.values(tournaments).reduce((sum: number, item: any) => sum + (item.entryFee || 0), 0);

        const items = billData.items || [];
        categoryAmounts['items'] = items.reduce((sum: number, item: any) => sum + ((item.price || 0) * (item.quantity || 0)), 0);

        const sideGameChips = billData.sideGameChip || [];
        categoryAmounts['sideGameChip'] = sideGameChips.reduce((sum: number, item: any) => sum + (item.price || 0), 0);

        // 返還する金額を計算
        const refundAmounts: Record<string, number> = {
          pointA: 0,
          pointB: 0,
          sideGameTip: 0,
        };

        // 全額返金 または 指定カテゴリの返金
        const categoriesToRefund = refundCategories && refundCategories.length > 0 
          ? refundCategories 
          : Object.keys(categoryAmounts); // 全カテゴリ

        for (const category of categoriesToRefund) {
          const paymentValue = paymentMethodsByCategory[category];
          const categoryAmount = categoryAmounts[category] || 0;
          
          if (categoryAmount > 0 && paymentValue) {
            // 文字列の場合（単一支払い方法）
            if (typeof paymentValue === 'string') {
              if (paymentValue === 'pointA' || paymentValue === 'pointB' || paymentValue === 'sideGameTip') {
                refundAmounts[paymentValue] += categoryAmount;
              }
            }
            // 配列の場合（分割支払い）
            else if (Array.isArray(paymentValue)) {
              for (const split of paymentValue) {
                if (split.method === 'pointA' || split.method === 'pointB' || split.method === 'sideGameTip') {
                  refundAmounts[split.method] += split.amount;
                }
              }
            }
          }
        }

        // ユーザーにポイント/サイドゲームチップを返還
        const userRef = db.collection('users').doc(userId);
        const userUpdates: Record<string, any> = {};

        for (const [fieldName, amount] of Object.entries(refundAmounts)) {
          if (amount > 0) {
            userUpdates[fieldName] = admin.firestore.FieldValue.increment(amount);
          }
        }

        if (Object.keys(userUpdates).length > 0) {
          userUpdates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
          transaction.update(userRef, userUpdates);
        }
      }

      // accountingHistoryに返金記録を追加
      const accountingHistoryId = billData.accountingHistoryId;
      if (accountingHistoryId) {
        const accountingHistoryRef = db.collection('accountingHistory').doc(accountingHistoryId);
        
        const refundRecord = {
          type: 'refund',
          refundAmount: refundAmount,
          refundReason: refundReason,
          refundMethod: refundMethod,
          refundCategories: refundCategories || [],
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
        refundCategories: refundCategories || [],
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
