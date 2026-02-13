import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import {
  getCallerDeviceByUid,
  hasStoreManagementPermission,
  isActive,
} from '../lib/devicePermissions';

/** Phase6 Step3: ターミナルから呼ぶ core。共通化用。 */
export async function runCleanupActiveStays(
  db: ReturnType<typeof getFirestore>
): Promise<{ deleted: number; failed: number; unsettledBillIds: string[] }> {
  let deleted = 0;
  let failed = 0;
  const unsettledBillIds: string[] = [];

  const snap = await db.collection('activeStays').get();

  for (const doc of snap.docs) {
    const billId = doc.get('billId') as string | undefined;

    try {
      if (billId) {
        const billRef = db.doc(`bills/${billId}`);
        const bill = await billRef.get();
        if (bill.exists) {
          const status = bill.get('status');
          if (status && !['settling', 'settled', 'in_progress', 'open'].includes(status)) {
            unsettledBillIds.push(billId);
          }
        }
      }

      let retryCount = 0;
      const maxRetries = 3;
      let deleteSuccess = false;

      while (retryCount < maxRetries && !deleteSuccess) {
        try {
          await doc.ref.delete();
          deleteSuccess = true;
          deleted++;
        } catch (deleteError) {
          retryCount++;
          if (retryCount < maxRetries) {
            const delayMs = 100 * Math.pow(2, retryCount - 1);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          } else {
            throw deleteError;
          }
        }
      }
    } catch (e) {
      failed++;
      console.warn('cleanupActiveStaysOnClose: delete failed', {
        id: doc.id,
        billId,
        error: String(e),
      });
    }
  }

  return { deleted, failed, unsettledBillIds };
}

/**
 * 閉店時に activeStays をクリーンアップする callable
 * 営業管理可能（admin または terminal＋store_management）かつ有効なデバイスのみ実行可能
 */
export const cleanupActiveStaysOnClose = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;
  const db = getFirestore();

  const device = await getCallerDeviceByUid(callerUid);
  if (!device || !isActive(device.status) || !hasStoreManagementPermission(device)) {
    throw new HttpsError('permission-denied', '営業管理の権限がありません');
  }

  try {
    const start = Date.now();
    const result = await runCleanupActiveStays(db);
    const elapsedMs = Date.now() - start;

    return {
      success: true,
      deleted: result.deleted,
      failed: result.failed,
      elapsedMs,
      unsettledBillIds:
        result.unsettledBillIds.length > 0 ? result.unsettledBillIds : undefined,
    };
  } catch (error) {
    console.error('cleanupActiveStaysOnClose: error', error);
    throw new HttpsError(
      'internal',
      `閉店クリーンアップに失敗しました: ${error}`
    );
  }
});

