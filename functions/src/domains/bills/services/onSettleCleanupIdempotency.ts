/**
 * onSettleCleanupIdempotency
 * 
 * 会計確定時に /bills/{billId}/idempotency/* を一括削除
 * 
 * TODO: P1-06 で本実装
 * 今回は stub として作成
 */

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

/**
 * 会計確定時に idempotency を一括削除
 * 
 * @param billId 伝票ID
 */
export async function cleanupIdempotencyOnSettle(billId: string): Promise<void> {
  // TODO: P1-06 で本実装
  // 会計確定トリガ（settlement.ts）から呼び出される想定
  // /bills/{billId}/idempotency/* を一括削除
  
  logger.info('cleanupIdempotencyOnSettle: stub', { billId });
  
  // stub 実装（実際の削除処理は P1-06 で実装）
  const db = getFirestore();
  const idempotencyRef = db.collection('bills').doc(billId).collection('idempotency');
  
  // 全ドキュメントを取得して削除（stub 実装）
  const snapshot = await idempotencyRef.get();
  const batch = db.batch();
  
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  
  if (snapshot.docs.length > 0) {
    await batch.commit();
    logger.info('cleanupIdempotencyOnSettle: deleted', {
      billId,
      count: snapshot.docs.length,
    });
  }
}

