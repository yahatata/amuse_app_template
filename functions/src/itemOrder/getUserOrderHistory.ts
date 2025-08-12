import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

/**
 * When: LIFF側のユーザーが注文履歴を確認したいとき
 * Where: Cloud Functions (src/itemOrder/getUserOrderHistory.ts)
 * What: 認証済みユーザーの注文履歴を取得
 * How:
 *  - request.auth.uidでユーザーIDを自動取得
 *  - todaysBillsから注文履歴を取得
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
    
    // クエリパラメータの取得（オプション）
    const { limit = 50, startDate, endDate } = request.data || {};

    // 対象ユーザーのtodaysBillsを取得
    let billsQuery = db
      .collection("todaysBills")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc");

    // 日付フィルタリング（オプション）
    if (startDate) {
      billsQuery = billsQuery.where("createdAt", ">=", new Date(startDate));
    }
    if (endDate) {
      billsQuery = billsQuery.where("createdAt", "<=", new Date(endDate));
    }

    // 件数制限
    if (limit && limit > 0) {
      billsQuery = billsQuery.limit(limit);
    }

    const billsSnap = await billsQuery.get();

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

    // 注文履歴を整形
    const orders = billsSnap.docs.map(doc => {
      const data = doc.data();
      
      console.log('Raw createdAt data:', data.createdAt);
      console.log('Raw createdAt type:', typeof data.createdAt);
      console.log('Raw createdAt constructor:', data.createdAt?.constructor?.name);
      
      // 日時を確実にDateオブジェクトに変換
      let createdAt, updatedAt, orderDate;
      
      if (data.createdAt && typeof data.createdAt.toDate === 'function') {
        console.log('Processing createdAt as Firestore Timestamp');
        createdAt = data.createdAt.toDate();
        orderDate = createdAt;
      } else if (data.createdAt instanceof Date) {
        console.log('Processing createdAt as Date object');
        createdAt = data.createdAt;
        orderDate = createdAt;
      } else if (data.createdAt) {
        console.log('Processing createdAt as other format, converting to Date');
        createdAt = new Date(data.createdAt);
        orderDate = createdAt;
      } else {
        console.log('No createdAt data found');
      }
      
      if (data.updatedAt && typeof data.updatedAt.toDate === 'function') {
        updatedAt = data.updatedAt.toDate();
      } else if (data.updatedAt instanceof Date) {
        updatedAt = data.updatedAt;
      } else if (data.updatedAt) {
        updatedAt = new Date(data.updatedAt);
      }
      
      const result = {
        id: doc.id,
        createdAt: createdAt ? createdAt.toISOString() : null,
        updatedAt: updatedAt ? updatedAt.toISOString() : null,
        status: data.status,
        totalPrice: data.totalPrice || 0,
        items: data.items || [],
        currentTable: data.currentTable,
        currentSeat: data.currentSeat,
        // 注文日時を計算（ISO文字列形式で送信）
        orderDate: orderDate ? orderDate.toISOString() : null,
        // 注文アイテム数
        itemCount: Array.isArray(data.items) ? data.items.length : 0
      };
      
      console.log('Processed order result:', result);
      console.log('Final orderDate (ISO string):', result.orderDate);
      
      return result;
    });

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
