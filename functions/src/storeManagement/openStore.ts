/**
 * 手動開店関数
 * 
 * 管理者が手動で店舗を開店するためのCloud Function
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { getCallerDeviceByUid, hasStoreManagementPermission, isActive } from '../lib/devicePermissions';
import { generateJstDateKey } from '../helpers/stateDoc/generateJstDateKey';
import { Timestamp } from 'firebase-admin/firestore';

const db = getFirestore();

export const openStore = onCall(
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

    // リクエストデータの取得・バリデーション
    const data = request.data as { businessDateKey?: string } | undefined;
    let businessDateKey: string;

    if (data?.businessDateKey) {
      // 形式チェック: YYYY-MM-DD形式
      const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateKeyPattern.test(data.businessDateKey)) {
        throw new HttpsError('invalid-argument', 'businessDateKeyはYYYY-MM-DD形式である必要があります');
      }
      businessDateKey = data.businessDateKey;
    } else {
      // サーバ基準のJST日付キー（暦日）を生成
      businessDateKey = generateJstDateKey();
    }

    // state docの更新（トランザクション）
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

      if (currentStatus === 'running') {
        throw new HttpsError('failed-precondition', 'Store is already running');
      }

      // status === 'closed' または 'error' の場合のみ更新
      transaction.update(docRef, {
        status: 'running',
        currentBusinessDateKey: businessDateKey,
        lastClosedBusinessDateKey: currentData?.lastClosedBusinessDateKey || null,
        updatedAt: FieldValue.serverTimestamp(),
        source: 'manual',
        lastError: null,
      });
    });

    logger.info('openStore succeeded', { uid: callerUid, businessDateKey });

    return {
      success: true,
      businessDateKey,
      status: 'running',
    };
  } catch (error) {
    // トランザクションエラー時のエラーハンドリング
    if (error instanceof HttpsError) {
      throw error;
    }

    logger.error('openStore failed', {
      uid: callerUid,
      businessDateKey: (request.data as any)?.businessDateKey || 'auto-generated',
      error: error instanceof Error ? error.message : String(error),
    });

    // best-effortでlogsサブコレクションに記録を試みる（失敗しても致命ではない）
    try {
      const logsRef = db.collection('storeMeta').doc('currentBusinessDay').collection('logs');
      await logsRef.add({
        type: 'open',
        businessDateKey: (request.data as any)?.businessDateKey || null,
        trigger: 'manual',
        failedStep: 'open:setStateDoc',
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
      `Failed to open store: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  }
);
