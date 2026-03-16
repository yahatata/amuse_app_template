/**
 * Phase4 03: 閉店前未退勤スタッフ取得
 *
 * clockIn あり かつ clockOut が null の attendances をすべて取得。
 * 営業日フィルタなし（Phase4 01 決定4）。
 * 閉店前確認画面で表示する。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { requireAdmin } from '../../../shared/devices';

/** 未退勤スタッフ取得のコアロジック。getCloseIntegrityData からも利用。営業日フィルタなし。 */
export async function getUnclockedStaffForCloseCore(
  db: Firestore
): Promise<Array<{ staffName: string; clockIn: string }>> {
  const attendancesSnap = await db
    .collection('attendances')
    .where('clockOut', '==', null)
    .get();

  return attendancesSnap.docs
    .filter((doc) => {
      const d = doc.data();
      return d.clockIn != null; // clockIn あり
    })
    .map((doc) => {
      const d = doc.data();
      const clockIn = d.clockIn;
      const clockInIso =
        clockIn && typeof (clockIn as { toDate?: () => Date }).toDate === 'function'
          ? (clockIn as { toDate: () => Date }).toDate().toISOString()
          : '';
      return {
        staffName: (d.staffsFullName as string) ?? '',
        clockIn: clockInIso,
      };
    });
}

export const getUnclockedStaffForClose = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const adminId = request.auth.uid;
  const db = getFirestore();
  await requireAdmin(db, adminId);

  try {
    const data = await getUnclockedStaffForCloseCore(db);
    return {
      success: true,
      data,
      hasNoTarget: data.length === 0,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      'internal',
      `未退勤スタッフの取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});
