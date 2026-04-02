import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * errorShapeProbe 用: devices で role === admin のみ許可（completeAccountingV2 と同様）。
 */
export async function requireProbeAdmin(uid: string): Promise<void> {
  const db = getFirestore();
  const deviceQuery = await db
    .collection('devices')
    .where('uid', '==', uid)
    .where('role', '==', 'admin')
    .limit(1)
    .get();

  if (deviceQuery.empty) {
    throw new HttpsError('permission-denied', '管理者権限がありません');
  }
}
