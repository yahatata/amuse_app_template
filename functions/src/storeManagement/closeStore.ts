/**
 * 手動閉店関数
 * 
 * 管理者が手動で店舗を閉店するためのCloud Function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { getCallerDeviceByUid, hasStoreManagementPermission, isActive } from '../lib/devicePermissions';
import { Timestamp } from 'firebase-admin/firestore';

const db = getFirestore();

export const closeStore = onCall(
  {
    region: 'us-central1',
  },
  async (request) => {
  // 認証・権限チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  try {
    const device = await getCallerDeviceByUid(callerUid);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }

    if (!hasStoreManagementPermission(device)) {
      throw new HttpsError('permission-denied', '営業管理の権限がありません');
    }

    // state docの更新（トランザクション）
    let lastClosedBusinessDateKey: string | null = null;

    await db.runTransaction(async (transaction) => {
      const docRef = db.collection('storeMeta').doc('currentBusinessDay');
      const doc = await transaction.get(docRef);

      if (!doc.exists) {
        throw new HttpsError(
          'failed-precondition',
          'storeMeta/currentBusinessDay document does not exist. Please run initialization script.'
        );
      }

      const currentData = doc.data();
      const currentStatus = currentData?.status;
      const currentBusinessDateKey = currentData?.currentBusinessDateKey;

      if (currentStatus === 'closed') {
        throw new HttpsError('failed-precondition', 'Store is already closed');
      }

      // status === 'running' かつ currentBusinessDateKey !== null の場合のみ更新
      if (currentStatus === 'running' && currentBusinessDateKey !== null) {
        lastClosedBusinessDateKey = currentBusinessDateKey;
        transaction.update(docRef, {
          status: 'closed',
          lastClosedBusinessDateKey: currentBusinessDateKey,
          currentBusinessDateKey: null,
          updatedAt: FieldValue.serverTimestamp(),
          source: 'manual',
          lastError: null,
        });
      } else {
        throw new HttpsError(
          'failed-precondition',
          `Store is not in a valid state to close. Current status: ${currentStatus}, currentBusinessDateKey: ${currentBusinessDateKey}`
        );
      }
    });

    logger.info('closeStore succeeded', { uid: callerUid, lastClosedBusinessDateKey });

    return {
      success: true,
      lastClosedBusinessDateKey,
      status: 'closed',
    };
  } catch (error) {
    // トランザクションエラー時のエラーハンドリング
    if (error instanceof HttpsError) {
      throw error;
    }

    logger.error('closeStore failed', {
      uid: callerUid,
      error: error instanceof Error ? error.message : String(error),
    });

    // best-effortでlogsサブコレクションに記録を試みる（失敗しても致命ではない）
    try {
      const docRef = db.collection('storeMeta').doc('currentBusinessDay');
      const doc = await docRef.get();
      const currentBusinessDateKey = doc.data()?.currentBusinessDateKey || null;

      const logsRef = docRef.collection('logs');
      await logsRef.add({
        type: 'close',
        businessDateKey: currentBusinessDateKey,
        trigger: 'manual',
        failedStep: 'close:setStateDoc',
        errorCode: 'internal',
        errorMessage: error instanceof Error ? error.message : String(error),
        causeHint: 'Transaction failed',
        createdAt: Timestamp.now(),
        context: null,
      });
    } catch (logError) {
      // ログ記録の失敗は無視（best-effort）
      logger.warn('Failed to write error log to logs subcollection', { logError });
    }

    throw new HttpsError(
      'internal',
      `Failed to close store: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  }
);
