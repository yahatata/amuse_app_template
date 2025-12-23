import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getStoreCloseHour, normalizeStoreCloseHour } from '../config/ops';

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

    // 営業日の概念を適用（店舗締め時間は STORE_CLOSE_HOUR）
    // 営業日の開始: 指定日の正規化後の時刻
    // 営業日の終了: 翌日の正規化後の時刻の直前
    const STORE_CLOSE_HOUR = getStoreCloseHour(); // globalConstant.dartと同期
    const normalizedHour = normalizeStoreCloseHour(STORE_CLOSE_HOUR);
    
    // JST時間で営業日の開始時刻を作成（例: 2025-10-22 09:00:00 JST）
    const businessDayStart = new Date(`${date}T${normalizedHour.toString().padStart(2, '0')}:00:00+09:00`);
    
    // 営業日の終了時刻（翌日の正規化後の時刻直前、例: normalizedHour=9 の場合 翌日の8:59:59 JST）
    const nextDay = new Date(businessDayStart);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setSeconds(-1); // 8:59:59
    
    console.log('営業日クエリ範囲:', { 
      date, 
      businessDayStart: businessDayStart.toISOString(), 
      businessDayEnd: nextDay.toISOString() 
    });

    const querySnapshot = await db.collection('accountingHistory')
      .where('accountingCompletedAt', '>=', admin.firestore.Timestamp.fromDate(businessDayStart))
      .where('accountingCompletedAt', '<=', admin.firestore.Timestamp.fromDate(nextDay))
      .orderBy('accountingCompletedAt', 'desc')
      .get();

    // 顧客単位でグループ化
    const customerGroups: { [key: string]: any[] } = {};

    querySnapshot.docs.forEach(doc => {
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
      
      // 返金記録の処理
      const refundRecord = data.refundRecord ? {
        ...data.refundRecord,
        refundedAt: data.refundRecord.refundedAt ? 
          new Date(data.refundRecord.refundedAt.toDate().getTime() + (9 * 60 * 60 * 1000)).toISOString() : null
      } : null;
      
      const processedData = {
        id: doc.id,
        ...data,
        // TimestampをJST時間のISO文字列に変換（UTC+9を保持）
        accountingCompletedAt: data.accountingCompletedAt ? 
          new Date(data.accountingCompletedAt.toDate().getTime() + (9 * 60 * 60 * 1000)).toISOString() : null,
        accountingStartedAt: data.accountingStartedAt ? 
          new Date(data.accountingStartedAt.toDate().getTime() + (9 * 60 * 60 * 1000)).toISOString() : null,
        createdAt: data.createdAt ? 
          new Date(data.createdAt.toDate().getTime() + (9 * 60 * 60 * 1000)).toISOString() : null,
        // 修正履歴、キャンセル記録、返金記録を追加
        corrections: corrections,
        cancelRecord: cancelRecord,
        refundRecord: refundRecord,
      };
      
      // 顧客名でグループ化
      const customerName = data.pokerName || '不明';
      if (!customerGroups[customerName]) {
        customerGroups[customerName] = [];
      }
      customerGroups[customerName].push(processedData);
    });

    // 顧客単位のデータを配列に変換
    const customerBasedHistory = Object.keys(customerGroups).map(customerName => {
      const accountingRecords = customerGroups[customerName];
      
      // 顧客の統計情報を計算
      const totalAmount = accountingRecords.reduce((sum, record) => {
        // キャンセルされた会計は0、修正された会計は修正後の金額を使用
        if (record.cancelRecord) {
          return sum; // キャンセルされた会計は0
        } else if (record.corrections && record.corrections.length > 0) {
          const latestCorrection = record.corrections[record.corrections.length - 1];
          return sum + (latestCorrection.newData?.totalPrice || 0);
        } else {
          return sum + (record.totalPrice || 0);
        }
      }, 0);

      const totalRefundAmount = accountingRecords.reduce((sum, record) => {
        return sum + (record.refundRecord?.amount || 0);
      }, 0);

      const hasCancelled = accountingRecords.some(record => record.cancelRecord);
      const hasCorrections = accountingRecords.some(record => record.corrections && record.corrections.length > 0);
      const hasRefunds = accountingRecords.some(record => record.refundRecord);

      return {
        customerName: customerName,
        accountingRecords: accountingRecords,
        totalAmount: totalAmount,
        totalRefundAmount: totalRefundAmount,
        recordCount: accountingRecords.length,
        hasCancelled: hasCancelled,
        hasCorrections: hasCorrections,
        hasRefunds: hasRefunds,
        // 最新の会計完了日時
        latestAccountingDate: accountingRecords[0]?.accountingCompletedAt,
      };
    });

    // 最新の会計完了日時でソート
    customerBasedHistory.sort((a, b) => {
      if (!a.latestAccountingDate && !b.latestAccountingDate) return 0;
      if (!a.latestAccountingDate) return 1;
      if (!b.latestAccountingDate) return -1;
      return new Date(b.latestAccountingDate).getTime() - new Date(a.latestAccountingDate).getTime();
    });

    console.log('顧客単位の会計履歴:', customerBasedHistory);

    return {
      success: true,
      customerBasedHistory: customerBasedHistory,
      count: customerBasedHistory.length,
    };
  } catch (error: any) {
    if (error instanceof HttpsError) {
      throw error;
    }
    console.error('会計履歴取得エラー:', error);
    throw new HttpsError('internal', '会計履歴の取得に失敗しました', error.message);
  }
});
