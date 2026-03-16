/**
 * Phase4 03: 閉店前確認データの統合取得
 *
 * 未会計 bills・未退勤スタッフ・未 close トーナメントを一括取得する。
 * 閉店前確認画面の表示・再取得に利用。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getCurrentBusinessDateKeyOrThrow } from '../repos/getCurrentBusinessDateKeyOrThrow';
import { requireAdmin } from '../../../shared/devices';
import { getUnsettledBillsForCloseCore } from './getUnsettledBillsForClose';
import { getUnclockedStaffForCloseCore } from './getUnclockedStaffForClose';
import { getUnclosedTournamentsForCloseCore } from './getUnclosedTournamentsForClose';

export const getCloseIntegrityData = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const adminId = request.auth.uid;
  const db = getFirestore();
  await requireAdmin(db, adminId);

  try {
    const businessDate = await getCurrentBusinessDateKeyOrThrow();

    const [unsettledResult, unclockedStaff, unclosedTournaments] = await Promise.all([
      getUnsettledBillsForCloseCore(db, businessDate),
      getUnclockedStaffForCloseCore(db),
      getUnclosedTournamentsForCloseCore(db, businessDate),
    ]);

    const hasNoTarget =
      unsettledResult.data.length === 0 &&
      unclockedStaff.length === 0 &&
      unclosedTournaments.length === 0;

    return {
      success: true,
      unsettledBills: unsettledResult.data,
      unsettledBillsReturnedCount: unsettledResult.returnedCount,
      unsettledBillsTruncated: unsettledResult.truncated,
      unclockedStaff,
      unclosedTournaments,
      hasNoTarget,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      'internal',
      `閉店前確認データの取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});
