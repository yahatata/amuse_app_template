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

    // 指定された日付の会計履歴を取得（JST時間で設定）
    // JST時間の00:00:00をUTC時間に変換（9時間引く）
    const startOfDay = new Date(`${date}T00:00:00`);
    startOfDay.setHours(startOfDay.getHours() - 9);
    
    // JST時間の23:59:59をUTC時間に変換（9時間引く）
    const endOfDay = new Date(`${date}T23:59:59`);
    endOfDay.setHours(endOfDay.getHours() - 9);
    
    console.log('クエリ日付範囲:', { date, startOfDay, endOfDay });

    const querySnapshot = await db.collection('accountingHistory')
      .where('accountingCompletedAt', '>=', admin.firestore.Timestamp.fromDate(startOfDay))
      .where('accountingCompletedAt', '<=', admin.firestore.Timestamp.fromDate(endOfDay))
      .orderBy('accountingCompletedAt', 'desc')
      .get();

    const accountingHistory = querySnapshot.docs.map(doc => {
      const data = doc.data();
      console.log('Firestoreデータ:', data);
      console.log('accountingCompletedAt:', data.accountingCompletedAt);
      console.log('accountingCompletedAtの型:', typeof data.accountingCompletedAt);
      
      // 修正履歴の処理
      const corrections = data.corrections ? data.corrections.map((correction: any) => ({
        ...correction,
        correctedAt: correction.correctedAt ? 
          new Date(correction.correctedAt.toDate ? correction.correctedAt.toDate().getTime() + (9 * 60 * 60 * 1000) : correction.correctedAt.getTime() + (9 * 60 * 60 * 1000)).toISOString() : null
      })) : [];
      
      // キャンセル記録の処理
      const cancelRecord = data.cancelRecord ? {
        ...data.cancelRecord,
        cancelledAt: data.cancelRecord.cancelledAt ? 
          new Date(data.cancelRecord.cancelledAt.toDate().getTime() + (9 * 60 * 60 * 1000)).toISOString() : null
      } : null;
      
      const result = {
        id: doc.id,
        ...data,
        // TimestampをJST時間のISO文字列に変換（UTC+9を保持）
        accountingCompletedAt: data.accountingCompletedAt ? 
          new Date(data.accountingCompletedAt.toDate().getTime() + (9 * 60 * 60 * 1000)).toISOString() : null,
        accountingStartedAt: data.accountingStartedAt ? 
          new Date(data.accountingStartedAt.toDate().getTime() + (9 * 60 * 60 * 1000)).toISOString() : null,
        createdAt: data.createdAt ? 
          new Date(data.createdAt.toDate().getTime() + (9 * 60 * 60 * 1000)).toISOString() : null,
        // 修正履歴とキャンセル記録を追加
        corrections: corrections,
        cancelRecord: cancelRecord,
      };
      
      console.log('変換後のデータ:', result);
      console.log('accountingCompletedAt変換後:', result.accountingCompletedAt);
      console.log('accountingCompletedAt変換後の型:', typeof result.accountingCompletedAt);
      console.log('修正履歴:', corrections);
      console.log('キャンセル記録:', cancelRecord);
      
      return result;
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
