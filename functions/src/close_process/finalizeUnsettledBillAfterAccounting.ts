/**
 * 未会計ラベル付き bill の会計完了後に呼ぶ Callable。
 * 通常の会計処理（completeAccountingV2）とは別に、未会計専用の後処理のみ行う。
 * - bills/{billId}.closeSnapshot.unresolved を false に更新
 * - users/{userId}.unsettledBillsCount を 1 減らす
 *
 * ※ Step3 で storeMeta 内のサブコレクション（閉店実行ログ・未会計索引等）の更新が必要になる可能性あり。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { requireAdmin } from './requireAdmin';

export const finalizeUnsettledBillAfterAccounting = onCall(async (request) => {
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
    throw new HttpsError(
      'failed-precondition',
      '請求書に userId が設定されていません'
    );
  }

  const closeSnapshot = billData.closeSnapshot;
  if (closeSnapshot == null || typeof closeSnapshot !== 'object') {
    return { success: true, message: 'closeSnapshot が無いためスキップしました' };
  }
  if (closeSnapshot.unresolved !== true) {
    return { success: true, message: '既に unresolved が true でないためスキップしました' };
  }

  await billRef.update({
    'closeSnapshot.unresolved': false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const userRef = db.collection('users').doc(userIdTrimmed);
  await userRef.update({
    unsettledBillsCount: admin.firestore.FieldValue.increment(-1),
  });

  return { success: true, message: '未会計後処理を完了しました' };
});
