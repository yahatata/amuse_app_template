import * as admin from 'firebase-admin';
import { z } from 'zod';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const db = admin.firestore();

// Zodスキーマで入力データを検証
const StartAccountingSchema = z.object({
  billId: z.string().min(1, '請求書IDは必須です'),
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
    const { billId } = validatedData;

    const billRef = db.collection('todaysBills').doc(billId);

    // 請求書が存在するか確認
    const billDoc = await billRef.get();
    if (!billDoc.exists) {
      throw new HttpsError('not-found', '指定された請求書が見つかりません');
    }

    const billData = billDoc.data()!;
    const currentStatus = billData.accountingStatus || 'pending';

    // 既に会計済みの場合はエラー
    if (currentStatus === 'completed') {
      throw new HttpsError('failed-precondition', 'この請求書は既に会計済みです');
    }

    // 会計状態を更新
    await billRef.update({
      accountingStatus: 'in_progress',
      accountingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      accountingStartedBy: adminId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { 
      success: true, 
      message: '会計を開始しました',
      billId: billId,
      status: 'in_progress'
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
    const currentStatus = billData.accountingStatus || 'pending';

    // 会計中でない場合はエラー
    if (currentStatus !== 'in_progress') {
      throw new HttpsError('failed-precondition', 'この請求書は会計中ではありません');
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
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 会計状態を完了に更新
    await billRef.update({
      accountingStatus: 'completed',
      accountingCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
      accountingCompletedBy: adminId,
      accountingHistoryId: accountingHistoryRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { 
      success: true, 
      message: '会計を完了しました',
      billId: billId,
      status: 'completed',
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
