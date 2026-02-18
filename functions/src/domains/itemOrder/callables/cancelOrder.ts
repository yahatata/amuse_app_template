/**
 * cancelOrder
 * 
 * 注文取り消しボタンが押下されたとき
 * 
 * 処理内容:
 * - billId がある場合: /bills/{billId}/items/{orderId} の voided を true に更新
 * - 常に: /orders/{dateString}/_TodaysOrders/{orderId} の status を 'cancel' に更新（論理削除）
 * - dateString は billId がある場合は bills/{billId}.businessDate から取得、ない場合は当日の日付を使用
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getCallerDeviceByUid, hasRequiredOption, isActive } from "../../../shared/devices";

export const cancelOrder = onCall(async (request) => {
  const db = getFirestore();

  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  try {
    // デバイス権限の確認（role: admin または options.order: true）
    const device = await getCallerDeviceByUid(callerUid);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }

    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'order');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', '注文操作の権限がありません');
    }

    const { orderId, billId } = request.data as {
      orderId: string;
      billId?: string;
    };

    // 入力バリデーション
    if (!orderId) {
      throw new HttpsError('invalid-argument', 'orderIdが指定されていません');
    }

    // dateString を取得
    let dateString: string;
    let orderDocId: string;

    if (billId && billId.trim() !== '') {
      // billId がある場合: bills/{billId}.businessDate から取得
      const billRef = db.collection('bills').doc(billId);
      const billSnap = await billRef.get();

      if (!billSnap.exists) {
        throw new HttpsError('not-found', `伝票が見つかりません: ${billId}`);
      }

      const billData = billSnap.data()!;
      const businessDate = billData.businessDate as string; // "2025-11-15" (YYYY-MM-DD)
      
      if (!businessDate || typeof businessDate !== 'string') {
        throw new HttpsError('failed-precondition', `伝票にbusinessDateが設定されていません: ${billId}`);
      }

      // YYYY-MM-DD を YYYYMMDD に変換
      orderDocId = businessDate.replace(/-/g, '');
      dateString = businessDate;
    } else {
      // billId がない場合: 当日の日付を使用
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      orderDocId = `${year}${month}${day}`;
      dateString = `${year}-${month}-${day}`;
    }

    // トランザクションで両方のコレクションを更新
    // Firestoreトランザクションでは、すべての読み取りを先に実行してから、すべての書き込みを実行する必要がある
    await db.runTransaction(async (tx) => {
      // すべての読み取りを先に実行
      const itemRef = billId && billId.trim() !== '' 
        ? db.collection('bills').doc(billId).collection('items').doc(orderId)
        : null;
      const todaysOrderRef = db.collection('orders').doc(orderDocId).collection('_TodaysOrders').doc(orderId);

      // 読み取り1: billId がある場合、items ドキュメントを取得
      const itemSnap = itemRef ? await tx.get(itemRef) : null;
      
      // 読み取り2: _TodaysOrders ドキュメントを取得
      const todaysOrderSnap = await tx.get(todaysOrderRef);

      // バリデーション: billId がある場合、items ドキュメントが存在することを確認
      if (itemRef && (!itemSnap || !itemSnap.exists)) {
        throw new HttpsError('not-found', `注文アイテムが見つかりません: ${orderId}`);
      }

      // すべての書き込みを実行
      // 書き込み1: billId がある場合、items ドキュメントを更新
      if (itemRef && itemSnap && itemSnap.exists) {
        tx.update(itemRef, {
          voided: true,
        });
      }

      // 書き込み2: _TodaysOrders ドキュメントを更新（存在する場合のみ）
      if (todaysOrderSnap.exists) {
        tx.update(todaysOrderRef, {
          status: 'cancel',
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        // ドキュメントが存在しない場合は警告ログを出して続行（後方互換性のため）
        console.warn(`_TodaysOrders ドキュメントが見つかりません: ${orderId}`);
      }
    });

    return {
      success: true,
      data: {
        orderId,
        billId: billId || null,
        dateString,
      },
    };
  } catch (error) {
    console.error("cancelOrder エラー:", error);

    // HttpsError の場合はそのまま throw
    if (error instanceof HttpsError) {
      throw error;
    }

    // その他のエラーは internal エラーとして throw
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new HttpsError('internal', errorMessage || "注文の取り消しに失敗しました");
  }
});
