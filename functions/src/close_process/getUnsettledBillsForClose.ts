/**
 * Phase6 Step2: 未会計bills取得用 Callable
 *
 * 当日営業日で status in ['open','in_progress','settling'] の bills を取得し、
 * 表示用（pokerName, displayAmount, createdAt）を server-side で算出して返す。
 * 取得のみで、bills / activeStays の書き換えは行わない。
 * 件数上限を設け、超過分は切り捨て（truncated/returnedCount で通知）。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getCurrentBusinessDateKeyOrThrow } from '../helpers/stateDoc/getCurrentBusinessDateKeyOrThrow';
import { requireAdmin } from './requireAdmin';
import { computeDisplayAmount } from './computeDisplayAmount';

/** 1件あたりの表示用金額算出上限（管理画面手動実行のため、極端な件数暴走を防ぐ） */
const MAX_UNSETTLED_BILLS_RETURNED = 100;

export const getUnsettledBillsForClose = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const adminId = request.auth.uid;
  const db = getFirestore();
  await requireAdmin(db, adminId);

  try {
    const businessDate = await getCurrentBusinessDateKeyOrThrow();

    const billsSnap = await db
      .collection('bills')
      .where('businessDate', '==', businessDate)
      .where('status', 'in', ['open', 'in_progress', 'settling'])
      .limit(MAX_UNSETTLED_BILLS_RETURNED + 1)
      .get();

    const docs = billsSnap.docs.slice(0, MAX_UNSETTLED_BILLS_RETURNED);
    const truncated = billsSnap.docs.length > MAX_UNSETTLED_BILLS_RETURNED;

    const data = await Promise.all(
      docs.map(async (doc) => {
        const d = doc.data();
        const billId = doc.id;
        const createdAt = d.createdAt;
        const createdAtIso =
          createdAt && typeof createdAt.toDate === 'function'
            ? createdAt.toDate().toISOString()
            : '';

        const displayAmount = await computeDisplayAmount(db, billId);

        return {
          billId,
          userId: (d.party?.userId as string) ?? '',
          pokerName: (d.party?.pokerName as string) ?? '',
          displayAmount,
          createdAt: createdAtIso,
          status: d.status,
          businessDate: d.businessDate,
        };
      })
    );

    return {
      success: true,
      data,
      returnedCount: data.length,
      truncated,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      'internal',
      `未会計billsの取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});
