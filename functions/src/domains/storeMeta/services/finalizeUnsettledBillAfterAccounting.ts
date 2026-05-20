/**
 * 未会計ラベル付き bill の会計完了後に呼ぶ Callable。
 * 通常の会計処理（completeAccountingV2）とは別に、未会計専用の後処理のみ行う。
 * - bills/{billId}.closeSummary.unresolved を false に更新
 * - bills/{billId}.closeSnapshot.unresolved も互換のため false に更新
 * - users/{userId}.unsettledBillsCount を 1 減らす
 *
 * ※ Step3 で storeMeta 内のサブコレクション（閉店実行ログ・未会計索引等）の更新が必要になる可能性あり。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { requireAdmin } from '../../../shared/devices';
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';

export const finalizeUnsettledBillAfterAccounting = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '認証が必要です');
    }

    const adminId = request.auth.uid;
    const db = getFirestore();
    await requireAdmin(db, adminId);

    const billId = request.data?.billId;
    if (typeof billId !== 'string' || !billId.trim()) {
      throw new HttpsError('invalid-argument', 'billId は必須です');
    }

    const billRef = db.collection('bills').doc(billId);
    const billSnap = await billRef.get();
    if (!billSnap.exists) {
      throw new HttpsError('not-found', '指定された請求書が見つかりません');
    }

    const billData = billSnap.data()!;
    const userId = (billData.party as { userId?: string } | undefined)?.userId;
    const userIdTrimmed = typeof userId === 'string' ? userId.trim() : '';
    if (!userIdTrimmed) {
      throw new FunctionCustomError({
        errorKey: 'ACCOUNTING_INVALID_STATE',
        message: '請求書に userId が設定されていません',
        context: { billId, op: 'finalizeUnsettledBillAfterAccounting' },
      });
    }

    const closeSummary = billData.closeSummary;
    const closeSnapshot = billData.closeSnapshot;
    const isCloseSummaryUnresolved = closeSummary != null &&
      typeof closeSummary === 'object' &&
      (closeSummary as { unresolved?: boolean }).unresolved === true;
    const isCloseSnapshotUnresolved = closeSnapshot != null &&
      typeof closeSnapshot === 'object' &&
      (closeSnapshot as { unresolved?: boolean }).unresolved === true;

    if (!isCloseSummaryUnresolved && !isCloseSnapshotUnresolved) {
      return { success: true, message: '既に unresolved が true でないためスキップしました' };
    }

    await billRef.update({
      'closeSummary.unresolved': false,
      'closeSnapshot.unresolved': false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const userRef = db.collection('users').doc(userIdTrimmed);
    await userRef.update({
      unsettledBillsCount: admin.firestore.FieldValue.increment(-1),
    });
    logOpsSuccess({
      message: 'finalizeUnsettledBillAfterAccounting 成功',
      functionEntry: 'finalizeUnsettledBillAfterAccounting',
      context: {
        billId,
        userId: userIdTrimmed,
        adminId,
        outcome: 'finalized',
      },
    });

    return { success: true, message: '未会計後処理を完了しました' };
  } catch (error) {
    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: 'finalizeUnsettledBillAfterAccounting failed',
        functionEntry: 'finalizeUnsettledBillAfterAccounting',
        cause: error,
        context: {
          billId: typeof request.data?.billId === 'string' ? request.data.billId : undefined,
          adminId: request.auth?.uid,
        },
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }
    throw error;
  }
});
