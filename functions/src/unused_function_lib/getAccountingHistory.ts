/**
 * [UNUSED - Phase0B] getAccountingHistory
 *
 * 旧 accountingHistory コレクションを参照する Callable。
 * Dart は bills コレクションを直接参照するため未使用。accountingHistory は廃止予定。
 * STORE_CLOSE_HOUR を使用しているため Phase0B でデプロイ対象から除外。
 
 */
// ========== UNUSED_BLOCK_START ==========
/*
import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getStoreCloseHour, normalizeStoreCloseHour } from '../../../shared/time';
import { logOpsError } from "../shared/logging/logOpsError";

const db = admin.firestore();

export const getAccountingHistory = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const adminId = request.auth.uid;

  try {
    const deviceQuery = await db.collection('devices')
      .where('uid', '==', adminId)
      .where('role', '==', 'admin')
      .limit(1)
      .get();

    if (deviceQuery.empty) {
      throw new HttpsError('permission-denied', '管理者権限がありません');
    }

    const { date } = request.data;
    if (!date) {
      throw new HttpsError('invalid-argument', '日付パラメータが必要です');
    }

    const STORE_CLOSE_HOUR = getStoreCloseHour();
    const normalizedHour = normalizeStoreCloseHour(STORE_CLOSE_HOUR);

    const businessDayStart = new Date(`${date}T${normalizedHour.toString().padStart(2, '0')}:00:00+09:00`);
    const nextDay = new Date(businessDayStart);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setSeconds(-1);

    const querySnapshot = await db.collection('accountingHistory')
      .where('accountingCompletedAt', '>=', admin.firestore.Timestamp.fromDate(businessDayStart))
      .where('accountingCompletedAt', '<=', admin.firestore.Timestamp.fromDate(nextDay))
      .orderBy('accountingCompletedAt', 'desc')
      .get();

    const customerGroups: { [key: string]: any[] } = {};

    querySnapshot.docs.forEach(doc => {
      const data = doc.data();
      const corrections = data.corrections ? data.corrections.map((correction: any) => ({
        ...correction,
        correctedAt: correction.correctedAt ?
          new Date(correction.correctedAt.toDate ? correction.correctedAt.toDate().getTime() + (9 * 60 * 60 * 1000) : correction.correctedAt.getTime() + (9 * 60 * 60 * 1000)).toISOString() : null
      })) : [];
      const cancelRecord = data.cancelRecord ? {
        ...data.cancelRecord,
        cancelledAt: data.cancelRecord.cancelledAt ?
          new Date(data.cancelRecord.cancelledAt.toDate().getTime() + (9 * 60 * 60 * 1000)).toISOString() : null
      } : null;
      const refundRecord = data.refundRecord ? {
        ...data.refundRecord,
        refundedAt: data.refundRecord.refundedAt ?
          new Date(data.refundRecord.refundedAt.toDate().getTime() + (9 * 60 * 60 * 1000)).toISOString() : null
      } : null;

      const processedData = {
        id: doc.id,
        ...data,
        accountingCompletedAt: data.accountingCompletedAt ?
          new Date(data.accountingCompletedAt.toDate().getTime() + (9 * 60 * 60 * 1000)).toISOString() : null,
        accountingStartedAt: data.accountingStartedAt ?
          new Date(data.accountingStartedAt.toDate().getTime() + (9 * 60 * 60 * 1000)).toISOString() : null,
        createdAt: data.createdAt ?
          new Date(data.createdAt.toDate().getTime() + (9 * 60 * 60 * 1000)).toISOString() : null,
        corrections,
        cancelRecord,
        refundRecord,
      };

      const customerName = data.pokerName || '不明';
      if (!customerGroups[customerName]) {
        customerGroups[customerName] = [];
      }
      customerGroups[customerName].push(processedData);
    });

    const customerBasedHistory = Object.keys(customerGroups).map(customerName => {
      const accountingRecords = customerGroups[customerName];
      const totalAmount = accountingRecords.reduce((sum, record) => {
        if (record.cancelRecord) return sum;
        if (record.corrections && record.corrections.length > 0) {
          const latestCorrection = record.corrections[record.corrections.length - 1];
          return sum + (latestCorrection.newData?.totalPrice || 0);
        }
        return sum + (record.totalPrice || 0);
      }, 0);
      const totalRefundAmount = accountingRecords.reduce((sum, record) =>
        sum + (record.refundRecord?.amount || 0), 0);
      const hasCancelled = accountingRecords.some(record => record.cancelRecord);
      const hasCorrections = accountingRecords.some(record => record.corrections && record.corrections.length > 0);
      const hasRefunds = accountingRecords.some(record => record.refundRecord);

      return {
        customerName,
        accountingRecords,
        totalAmount,
        totalRefundAmount,
        recordCount: accountingRecords.length,
        hasCancelled,
        hasCorrections,
        hasRefunds,
        latestAccountingDate: accountingRecords[0]?.accountingCompletedAt,
      };
    });

    customerBasedHistory.sort((a, b) => {
      if (!a.latestAccountingDate && !b.latestAccountingDate) return 0;
      if (!a.latestAccountingDate) return 1;
      if (!b.latestAccountingDate) return -1;
      return new Date(b.latestAccountingDate).getTime() - new Date(a.latestAccountingDate).getTime();
    });

    return {
      success: true,
      customerBasedHistory,
      count: customerBasedHistory.length,
    };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logOpsError({
      message: '会計履歴取得エラー:',
      failureType: 'internal',
      functionEntry: 'getAccountingHistory',
      cause: error,
    });
    throw new HttpsError('internal', '会計履歴の取得に失敗しました', error.message);
  }
});
*/
// ========== UNUSED_BLOCK_END ==========
