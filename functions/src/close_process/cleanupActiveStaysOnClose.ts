import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * 閉店時に activeStays をクリーンアップする callable
 * 管理者権限を持つユーザーのみが実行可能
 */
export const cleanupActiveStaysOnClose = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const adminId = request.auth.uid;
  const db = getFirestore();

  try {
    // デバイス権限の確認（role: adminのみ）
    const deviceQuery = await db.collection('devices')
      .where('uid', '==', adminId)
      .where('role', '==', 'admin')
      .limit(1)
      .get();

    if (deviceQuery.empty) {
      throw new HttpsError('permission-denied', '管理者権限がありません');
    }

    const start = Date.now();
    let deleted = 0;
    let failed = 0;
    const unsettledBillIds: string[] = [];

    // 単一店舗前提。storeIdフィルタは不要。
    // isActiveの値に関係なく、すべてのactiveStaysドキュメントを削除
    const snap = await db.collection('activeStays')
      .get();

    console.log(`cleanupActiveStaysOnClose: found ${snap.size} active stays to cleanup (including isActive=false)`);

    // 逐次削除（try/catch で個別エラーハンドリング）
    for (const doc of snap.docs) {
      const billId = doc.get('billId') as string | undefined;
      
      try {
        // 任意: 関連 bill を軽く参照して status を監査（時間かけない）
        if (billId) {
          const billRef = db.doc(`bills/${billId}`);
          const bill = await billRef.get();
          
          if (bill.exists) {
            const status = bill.get('status');
            // 会計未確定で残存していた場合は監査ログに記録
            if (status && !['settling', 'settled', 'in_progress', 'open'].includes(status)) {
              unsettledBillIds.push(billId);
              console.warn(`cleanupActiveStaysOnClose: unsettled bill found`, {
                billId,
                status,
                uid: doc.id,
              });
            }
          }
        }

        // 指数バックオフでリトライ（最大3回）
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
              // 指数バックオフ: 100ms, 200ms, 400ms
              const delayMs = 100 * Math.pow(2, retryCount - 1);
              await new Promise(resolve => setTimeout(resolve, delayMs));
            } else {
              throw deleteError;
            }
          }
        }
      } catch (e) {
        failed++;
        // リトライしてもダメなら warning ログのみ（翌営業の手動再実行前提）
        console.warn('cleanupActiveStaysOnClose: delete failed', {
          id: doc.id,
          billId,
          error: String(e),
        });
      }
    }

    const elapsedMs = Date.now() - start;

    // 監査ログ: 会計未確定で残存していた billId を記録
    if (unsettledBillIds.length > 0) {
      console.warn('cleanupActiveStaysOnClose: unsettled bills found', {
        count: unsettledBillIds.length,
        billIds: unsettledBillIds,
      });
    }

    console.info('cleanupActiveStaysOnClose: summary', {
      deleted,
      failed,
      elapsedMs,
      unsettledCount: unsettledBillIds.length,
    });

    return {
      success: true,
      deleted,
      failed,
      elapsedMs,
      unsettledBillIds: unsettledBillIds.length > 0 ? unsettledBillIds : undefined,
    };
  } catch (error) {
    console.error('cleanupActiveStaysOnClose: error', error);
    throw new HttpsError(
      'internal',
      `閉店クリーンアップに失敗しました: ${error}`
    );
  }
});

