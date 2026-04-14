import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logOpsError } from "../../../shared/logging/logOpsError";

const db = admin.firestore();

/**
 * 既存のtodaysBillsドキュメントに会計履歴用フィールドを追加するマイグレーション関数
 * 管理者権限を持つユーザーのみが実行可能
 */
export const migrateTodaysBillsAccountingFields = onCall(async (request) => {
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

    // 今日のtodaysBillsドキュメントを取得
    const today = new Date().toISOString().split('T')[0];
    const todaysBillsQuery = await db.collection('todaysBills')
      .where('date', '==', today)
      .get();

    if (todaysBillsQuery.empty) {
      return { 
        success: true, 
        message: '今日の請求書はありません',
        updatedCount: 0
      };
    }

    let updatedCount = 0;
    const batch = db.batch();

    // 各ドキュメントに会計履歴用フィールドを追加
    for (const doc of todaysBillsQuery.docs) {
      const data = doc.data();
      
      // 既に会計履歴用フィールドがある場合はスキップ
      if (data.accountingStartedAt !== undefined) {
        continue;
      }

      // 会計履歴用フィールドを追加
      batch.update(doc.ref, {
        accountingStartedAt: null,
        accountingCompletedAt: null,
        accountingStartedBy: null,
        accountingCompletedBy: null,
        accountingHistoryId: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      updatedCount++;
    }

    // バッチ更新を実行
    if (updatedCount > 0) {
      await batch.commit();
    }

    return { 
      success: true, 
      message: `${updatedCount}件の請求書に会計履歴用フィールドを追加しました`,
      updatedCount: updatedCount
    };
  } catch (error: any) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logOpsError({
      message: 'マイグレーションエラー:',
      functionEntry: 'migrateTodaysBillsAccountingFields',
      cause: error,
    });
    throw new HttpsError('internal', 'マイグレーションに失敗しました', error.message);
  }
});
