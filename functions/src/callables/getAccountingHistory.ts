import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const db = admin.firestore();

/**
 * 会計履歴を取得するCloud Function
 * 管理者権限を持つユーザーのみが実行可能
 */
export const getAccountingHistory = onCall(async (request) => {
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

    // 日付パラメータを取得
    const { date } = request.data;
    if (!date) {
      throw new HttpsError('invalid-argument', '日付パラメータが必要です');
    }

    // 指定された日付の会計履歴を取得
    const startOfDay = new Date(`${date}T00:00:00`);
    const endOfDay = new Date(`${date}T23:59:59`);

    const querySnapshot = await db.collection('accountingHistory')
      .where('accountingCompletedAt', '>=', admin.firestore.Timestamp.fromDate(startOfDay))
      .where('accountingCompletedAt', '<=', admin.firestore.Timestamp.fromDate(endOfDay))
      .orderBy('accountingCompletedAt', 'desc')
      .get();

    const accountingHistory = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        // TimestampをDateに変換
        accountingCompletedAt: data.accountingCompletedAt?.toDate(),
        accountingStartedAt: data.accountingStartedAt?.toDate(),
        createdAt: data.createdAt?.toDate(),
      };
    });

    return {
      success: true,
      accountingHistory: accountingHistory,
      count: accountingHistory.length,
    };
  } catch (error: any) {
    if (error instanceof HttpsError) {
      throw error;
    }
    console.error('会計履歴取得エラー:', error);
    throw new HttpsError('internal', '会計履歴の取得に失敗しました', error.message);
  }
});
