/**
 * [UNUSED - UI 未配線] closeStore
 *
 * 手動閉店 Callable。`lib/Home/terminalHomePage.dart` の `_callCloseStore` は定義のみで未使用。
 * 実運用の閉店は `closeStoreTerminal`。
 *
 * `unused_function_lib` に置くことで logOps 系スクリプト（Step2-1 269 件スコープ等）の走査対象外とする。
 * デプロイは `domains/storeMeta/index` から再エクスポートして維持。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { logOpsError } from '../shared/logging/logOpsError';
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../shared/logging/functionCustomError';
import { getCallerDeviceByUid, hasStoreManagementPermission, isActive } from '../shared/devices';

const db = getFirestore();

export const closeStore = onCall(
  { region: 'asia-northeast1' },
  async (request) => {
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
      let lastClosedBusinessDateKey: string | null = null;
      await db.runTransaction(async (transaction) => {
        const docRef = db.collection('storeMeta').doc('currentBusinessDay');
        const doc = await transaction.get(docRef);
        if (!doc.exists) {
          throw new FunctionCustomError({
            errorKey: 'STORE_STATE_DOC_MISSING',
            message:
              'storeMeta/currentBusinessDay document does not exist. Please run initialization script.',
            context: { phase: 'manual_close' },
          });
        }
        const currentData = doc.data();
        const currentStatus = currentData?.status;
        const currentBusinessDateKey = currentData?.currentBusinessDateKey;
        if (currentStatus === 'closed') {
          throw new FunctionCustomError({
            errorKey: 'STORE_ALREADY_CLOSED',
            message: 'Store is already closed',
            context: { currentStatus },
          });
        }
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
          throw new FunctionCustomError({
            errorKey: 'STORE_INVALID_STATE',
            message: `Store is not in a valid state to close. Current status: ${currentStatus}, currentBusinessDateKey: ${currentBusinessDateKey}`,
            context: { currentStatus, currentBusinessDateKey, phase: 'manual_close' },
          });
        }
      });
      logger.info('closeStore succeeded', { uid: callerUid, lastClosedBusinessDateKey });
      return { success: true, lastClosedBusinessDateKey, status: 'closed' };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error instanceof FunctionCustomError) {
        logOpsError({
          message: 'closeStore failed',
          functionEntry: 'closeStore',
          operation: 'closeStoreCatch',
          cause: error,
          context: { uid: callerUid },
        });
        throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
      }
      logOpsError({
        message: 'closeStore failed',
        functionEntry: 'closeStore',
        operation: 'closeStoreGenericCatch',
        cause: error,
        context: { uid: callerUid },
      });
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
        logger.warn('Failed to write error log to logs subcollection', { logError });
      }
      throw new HttpsError('internal', `Failed to close store: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
);
