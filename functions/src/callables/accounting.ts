import * as admin from 'firebase-admin';
import { z } from 'zod';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const db = admin.firestore();

// 支払い方法の表示名を取得するヘルパー関数
function _getPaymentMethodDisplayName(paymentMethod: string): string {
  switch (paymentMethod) {
    case 'pointA':
      return 'ポイントA';
    case 'pointB':
      return 'ポイントB';
    case 'sideGameTip':
      return 'サイドゲームチップ';
    default:
      return paymentMethod;
  }
}

// Zodスキーマで入力データを検証
const StartAccountingSchema = z.object({
  billId: z.string().min(1, '請求書IDは必須です'),
  paymentMethod: z.enum(['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameTip'], {
    errorMap: () => ({ message: '有効な支払い方法を選択してください' }),
  }),
});

const CompleteAccountingSchema = z.object({
  billId: z.string().min(1, '請求書IDは必須です'),
});

/**
 * 会計開始処理
 * 管理者権限を持つユーザーのみが実行可能
 */
export const startAccounting = onCall(async (request) => {
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
    const validatedData = StartAccountingSchema.parse(request.data);
    const { billId, paymentMethod } = validatedData;

    const billRef = db.collection('todaysBills').doc(billId);

    // 請求書が存在するか確認
    const billDoc = await billRef.get();
    if (!billDoc.exists) {
      throw new HttpsError('not-found', '指定された請求書が見つかりません');
    }

    const billData = billDoc.data()!;
    const currentStatus = billData.status || 'open';

    // 既に会計済みの場合はエラー
    if (currentStatus === 'settled') {
      throw new HttpsError('failed-precondition', 'この請求書は既に会計済みです');
    }

    // pointA、pointB、sideGameTipで支払う場合は残高確認と差し引き処理
    const userId = billData.userId;
    const totalPrice = billData.totalPrice || 0;

    if (userId && (paymentMethod === 'pointA' || paymentMethod === 'pointB' || paymentMethod === 'sideGameTip')) {
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'ユーザー情報が見つかりません');
      }

      const userData = userDoc.data()!;
      let currentBalance = 0;
      let fieldName = '';

      // 支払い方法に応じて残高を取得
      if (paymentMethod === 'pointA') {
        currentBalance = userData.pointA || 0;
        fieldName = 'pointA';
      } else if (paymentMethod === 'pointB') {
        currentBalance = userData.pointB || 0;
        fieldName = 'pointB';
      } else if (paymentMethod === 'sideGameTip') {
        currentBalance = userData.sideGameTip || 0;
        fieldName = 'sideGameTip';
      }

      // 残高不足チェック
      if (currentBalance < totalPrice) {
        throw new HttpsError(
          'failed-precondition', 
          `${_getPaymentMethodDisplayName(paymentMethod)}の残高が不足しています。現在の残高: ${currentBalance}円、必要な金額: ${totalPrice}円`
        );
      }

      // 残高から差し引き
      await userRef.update({
        [fieldName]: admin.firestore.FieldValue.increment(-totalPrice),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // 会計開始時刻と支払い方法を記録（statusは変更しない）
    await billRef.update({
      accountingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      accountingStartedBy: adminId,
      paymentMethod: paymentMethod,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { 
      success: true, 
      message: '会計を開始しました',
      billId: billId,
      status: 'open'
    };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', '入力データが無効です', error.errors);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    console.error('会計開始エラー:', error);
    throw new HttpsError('internal', '会計開始に失敗しました', error.message);
  }
});

/**
 * 会計完了処理
 * 管理者権限を持つユーザーのみが実行可能
 */
export const completeAccounting = onCall(async (request) => {
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
    const validatedData = CompleteAccountingSchema.parse(request.data);
    const { billId } = validatedData;

    const billRef = db.collection('todaysBills').doc(billId);

    // 請求書が存在するか確認
    const billDoc = await billRef.get();
    if (!billDoc.exists) {
      throw new HttpsError('not-found', '指定された請求書が見つかりません');
    }

    const billData = billDoc.data()!;
    const currentStatus = billData.status || 'open';

    // 会計開始していない場合はエラー
    if (!billData.accountingStartedAt) {
      throw new HttpsError('failed-precondition', 'この請求書はまだ会計開始されていません');
    }
    
    // 既に会計済みの場合はエラー
    if (currentStatus === 'settled') {
      throw new HttpsError('failed-precondition', 'この請求書は既に会計済みです');
    }

    // 会計履歴を作成
    const accountingHistoryRef = db.collection('accountingHistory').doc();
    await accountingHistoryRef.set({
      billId: billId,
      pokerName: billData.pokerName,
      totalPrice: billData.totalPrice,
      accountingStartedAt: billData.accountingStartedAt,
      accountingCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
      accountingStartedBy: billData.accountingStartedBy,
      accountingCompletedBy: adminId,
      paymentMethod: billData.paymentMethod || 'cash', // 支払い方法を記録（デフォルトは現金）
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 会計完了
    await billRef.update({
      status: 'settled',
      settledAt: admin.firestore.FieldValue.serverTimestamp(),
      accountingCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
      accountingCompletedBy: adminId,
      accountingHistoryId: accountingHistoryRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 退店処理
    const userId = billData.userId;
    if (userId) {
      const userRef = db.collection('users').doc(userId);
      await userRef.update({
        isStaying: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // visitLogsの最新の未完了ログを更新
      const visitLogsSnapshot = await userRef.collection('visitLogs')
        .where('checkOutAt', '==', null)
        .orderBy('checkInAt', 'desc')
        .limit(1)
        .get();

      if (!visitLogsSnapshot.empty) {
        const visitLogDoc = visitLogsSnapshot.docs[0];
        const checkInAt = visitLogDoc.data().checkInAt;
        const checkOutAt = admin.firestore.Timestamp.now();
        const stayMinutes = checkInAt 
          ? Math.floor((checkOutAt.toMillis() - checkInAt.toMillis()) / 60000)
          : null;

        await visitLogDoc.ref.update({
          checkOutAt: admin.firestore.FieldValue.serverTimestamp(),
          stayMinutes: stayMinutes,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    console.log('会計完了成功 - 戻り値を返します');
    return { 
      success: true, 
      message: '会計を完了しました',
      billId: billId,
      status: 'settled',
      accountingHistoryId: accountingHistoryRef.id
    };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', '入力データが無効です', error.errors);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    console.error('会計完了エラー:', error);
    throw new HttpsError('internal', '会計完了に失敗しました', error.message);
  }
});
