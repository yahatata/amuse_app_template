import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getCurrentBusinessDateKeyOrThrow } from "../helpers/stateDoc/getCurrentBusinessDateKeyOrThrow";

/**
 * When: LIFF側のユーザーが注文履歴を確認したいとき
 * Where: Cloud Functions (src/itemOrder/getUserOrderHistory.ts)
 * What: 認証済みユーザーの確定済み会計履歴を取得
 * How:
 *  - request.auth.uidでユーザーIDを自動取得
 *  - billsから確定済み伝票（status ∈ {"settled","partially_refunded","refunded","voided"}）の履歴を取得
 *  - businessDate フィルタで当日の営業日のみ取得
 *  - 日付順でソートして返却
 */
export const getUserOrderHistory = onCall(async (request) => {
  const db = getFirestore();

  try {
    // 認証チェック
    if (!request.auth) {
      return { success: false, error: "認証が必要です" };
    }

    const userId = request.auth.uid;
    
    // 当日の営業日を取得（state docから取得）
    const businessDate = await getCurrentBusinessDateKeyOrThrow();

    // クエリ条件（status フィルタは Firestore クエリ側で絞り込む）
    const billsQuery = db
      .collection("bills")
      .where("party.userId", "==", userId)
      .where("businessDate", "==", businessDate)
      .where("status", "in", ["settled", "partially_refunded", "refunded", "voided"]) // 確定済み履歴専用
      .orderBy("createdAt", "desc");

    const billsSnap = await billsQuery.get();

    // 0件でもエラーにはせず、空配列で返す
    if (billsSnap.empty) {
      return { 
        success: true, 
        data: {
          orders: [],
          totalCount: 0,
          totalAmount: 0
        }
      };
    }

    // 注文履歴を整形（各伝票の itemCount を計算するため、サブコレクションを読み取る）
    const orders = await Promise.all(
      billsSnap.docs.map(async (doc) => {
        const data = doc.data();
        const billRef = doc.ref;
        
        // 日時を確実にDateオブジェクトに変換
        let createdAt: Date | null = null;
        let updatedAt: Date | null = null;
        
        if (data.createdAt && typeof data.createdAt.toDate === 'function') {
          createdAt = data.createdAt.toDate();
        } else if (data.createdAt instanceof Date) {
          createdAt = data.createdAt;
        } else if (data.createdAt) {
          createdAt = new Date(data.createdAt);
        }
        
        if (data.updatedAt && typeof data.updatedAt.toDate === 'function') {
          updatedAt = data.updatedAt.toDate();
        } else if (data.updatedAt instanceof Date) {
          updatedAt = data.updatedAt;
        } else if (data.updatedAt) {
          updatedAt = new Date(data.updatedAt);
        }
        
        // itemCount を計算するために /items サブコレクションを読み取る
        const itemsSnap = await billRef.collection('items').get();
        const itemCount = itemsSnap.size;
        
        // totalPrice は amounts.grandTotalRounded を使用（確定済みの最終税込額）
        const totalPrice = data.amounts?.grandTotalRounded || 0;
        
        const result = {
          id: doc.id,
          createdAt: createdAt ? createdAt.toISOString() : null,
          updatedAt: updatedAt ? updatedAt.toISOString() : null,
          status: data.status,
          totalPrice,
          items: [], // 常に空配列を返す（shape 互換のため）
          currentTable: data.place?.table || null,
          currentSeat: data.place?.seat || null,
          // 注文日時を計算（ISO文字列形式で送信）
          orderDate: createdAt ? createdAt.toISOString() : null,
          // 注文アイテム数
          itemCount
        };
        
        return result;
      })
    );

    // 合計金額を計算
    const totalAmount = orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0);

    return {
      success: true,
      data: {
        orders,
        totalCount: orders.length,
        totalAmount
      }
    };

  } catch (error) {
    console.error("getUserOrderHistory エラー:", error);
    return { success: false, error: "注文履歴の取得に失敗しました" };
  }
});
