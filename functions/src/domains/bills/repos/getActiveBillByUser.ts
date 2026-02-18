/**
 * getActiveBillByUser ヘルパAPI
 * 
 * アクティブな伝票を取得する
 * 
 * 取得順序:
 * 1. activeStays/{userId} → billId を取得
 * 2. フォールバック: bills を party.userId == userId AND status in ('open','in_progress') で1件取得
 */

import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

export interface GetActiveBillByUserResult {
  billId: string;
  billRef: admin.firestore.DocumentReference;
  billData: admin.firestore.DocumentData;
}

/**
 * アクティブな伝票を取得
 * 
 * @param userId ユーザーID
 * @returns アクティブな伝票情報
 * @throws HttpsError not-found: アクティブな伝票が見つからない場合
 */
export async function getActiveBillByUser(userId: string): Promise<GetActiveBillByUserResult> {
  if (!userId) {
    throw new HttpsError('invalid-argument', 'userId is required');
  }

  const db = getFirestore();

  // 1. activeStays/{userId} から billId を取得
  const activeStayRef = db.collection('activeStays').doc(userId);
  const activeStaySnap = await activeStayRef.get();

  if (activeStaySnap.exists) {
    const activeStayData = activeStaySnap.data()!;
    const billId = activeStayData.billId as string;
    
    if (billId) {
      const billRef = db.collection('bills').doc(billId);
      const billSnap = await billRef.get();
      
      if (billSnap.exists) {
        const billData = billSnap.data()!;
        // activeStays に billId がある場合は、status に関係なく返す
        // （appendItem の status ガードで拒否される）
        return {
          billId,
          billRef,
          billData,
        };
      }
    }
  }

  // 2. フォールバック: bills を直接クエリ
  const billsQuery = db
    .collection('bills')
    .where('party.userId', '==', userId)
    .where('status', 'in', ['open', 'in_progress'])
    .limit(1);
  
  const billsSnap = await billsQuery.get();
  
  if (billsSnap.empty) {
    throw new HttpsError('not-found', `No active bill found for user: ${userId}`);
  }

  const billDoc = billsSnap.docs[0];
  return {
    billId: billDoc.id,
    billRef: billDoc.ref,
    billData: billDoc.data(),
  };
}

