import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

const db = admin.firestore();

// 会計キャンセルのスキーマ
const CancelAccountingSchema = z.object({
  billId: z.string().min(1, '請求書IDは必須です'),
  reason: z.string().min(1, 'キャンセル理由は必須です'),
  includeRefund: z.boolean().optional().default(false),
  refundAmount: z.number().min(0).optional().default(0),
});

/**
 * 会計をキャンセルするCloud Function
 * 管理者権限を持つユーザーのみが実行可能
 */
export const cancelAccounting = onCall(async (request) => {
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
    const validatedData = CancelAccountingSchema.parse(request.data);
    const { billId, reason, includeRefund, refundAmount } = validatedData;

    const billRef = db.collection('todaysBills').doc(billId);

    // 請求書の存在確認
    const billDoc = await billRef.get();
    if (!billDoc.exists) {
      throw new HttpsError('not-found', '指定された請求書が見つかりません');
    }

    const billData = billDoc.data()!;
    const currentStatus = billData.status || 'open';

    // 会計完了済みの場合のみキャンセル可能
    if (currentStatus !== 'settled') {
      throw new HttpsError('failed-precondition', '会計完了済みの請求書のみキャンセル可能です');
    }

    // トランザクションでキャンセル処理
    await db.runTransaction(async (transaction) => {
      // todaysBillsを元の状態に戻す
      transaction.update(billRef, {
        status: 'open',
        accountingStartedAt: null,
        accountingCompletedAt: null,
        accountingStartedBy: null,
        accountingCompletedBy: null,
        accountingHistoryId: null,
        settledAt: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // accountingHistoryにキャンセル記録を追加
      const accountingHistoryId = billData.accountingHistoryId;
      if (accountingHistoryId) {
        const accountingHistoryRef = db.collection('accountingHistory').doc(accountingHistoryId);
        
        const cancelRecord = {
          type: 'cancel',
          reason: reason,
          cancelledBy: adminId,
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          includeRefund: includeRefund,
          refundAmount: includeRefund ? refundAmount : 0,
        };

        transaction.update(accountingHistoryRef, {
          status: 'cancelled',
          cancelRecord: cancelRecord,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // ユーザーの退店状態を復元
      const userId = billData.userId;
      if (userId) {
        const userRef = db.collection('users').doc(userId);
        transaction.update(userRef, {
          isStaying: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // visitLogsの最新の完了ログを未完了に戻す
        const visitLogsSnapshot = await userRef.collection('visitLogs')
          .where('checkOutAt', '!=', null)
          .orderBy('checkInAt', 'desc')
          .limit(1)
          .get();

        if (!visitLogsSnapshot.empty) {
          const visitLogDoc = visitLogsSnapshot.docs[0];
          transaction.update(visitLogDoc.ref, {
            checkOutAt: null,
            stayMinutes: null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      // 返金処理が選択された場合
      if (includeRefund && refundAmount > 0) {
        // todaysBillsに返金情報を追加
        transaction.update(billRef, {
          refundAmount: refundAmount,
          refundedAt: admin.firestore.FieldValue.serverTimestamp(),
          refundedBy: adminId,
        });

        // accountingHistoryに返金記録を追加
        if (accountingHistoryId) {
          const accountingHistoryRef = db.collection('accountingHistory').doc(accountingHistoryId);
          const refundRecord = {
            type: 'refund',
            amount: refundAmount,
            refundedBy: adminId,
            refundedAt: admin.firestore.FieldValue.serverTimestamp(),
            reason: `キャンセルに伴う返金: ${reason}`,
          };

          transaction.update(accountingHistoryRef, {
            refundRecord: refundRecord,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    });

    console.log('会計キャンセル成功 - 戻り値を返します');
    return {
      success: true,
      message: includeRefund ? '会計をキャンセルし、返金処理を完了しました' : '会計をキャンセルしました',
      billId: billId,
      pokerName: billData.pokerName,
      totalPrice: billData.totalPrice,
      includeRefund: includeRefund,
      refundAmount: includeRefund ? refundAmount : 0,
    };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', '入力データが無効です', error.errors);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    console.error('会計キャンセルエラー:', error);
    throw new HttpsError('internal', '会計キャンセルに失敗しました', error.message);
  }
});
