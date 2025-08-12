import { onCall } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/**
 * When: LIFF側のユーザーが注文確定ボタンを押下したとき
 * Where: Cloud Functions (src/itemOrder/placeOrderByUser.ts)
 * What: 認証済みユーザーのtodaysBillsにアイテムを追加し、同時にordersコレクションへ当日の注文記録を作成
 * How:
 *  - 引数で受け取った注文アイテム情報 (item または items) を使用
 *  - request.auth.uidでユーザーIDを自動取得
 *  - status=open の todaysBills を userId で特定
 *  - トランザクションで以下を実行
 *    1) todaysBills.items へ注文アイテムを追記し、totalPrice を加算
 *    2) orders/{YYYYMMDD} ドキュメントを作成/更新し、_TodaysOrders に注文行を作成
 */
export const placeOrderByUser = onCall(async (request) => {
  const db = getFirestore();

  try {
    // 認証チェック
    if (!request.auth) {
      return { success: false, error: "認証が必要です" };
    }

    const userId = request.auth.uid;
    
    // 単一アイテムまたはアイテム配列の両方に対応
    let items: Array<{
      menuItemId: string;
      category: string;
      name: string;
      price: number;
      quantity: number;
    }> = [];

    if (request.data.item) {
      // 単一アイテムの場合
      items = [request.data.item];
    } else if (request.data.items && Array.isArray(request.data.items)) {
      // アイテム配列の場合（一括注文）
      items = request.data.items;
    } else {
      return { success: false, error: "アイテム情報が不正です" };
    }

    // 入力バリデーション
    if (items.length === 0) {
      return { success: false, error: "アイテムが指定されていません" };
    }

    for (const item of items) {
      if (!item.menuItemId || !item.name || typeof item.price !== "number" || typeof item.quantity !== "number") {
        return { success: false, error: "アイテム情報が不正です" };
      }
      if (item.quantity <= 0 || item.price < 0) {
        return { success: false, error: "数量または価格が不正です" };
      }
    }

    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const orderDocId = `${yyyy}${mm}${dd}`; // 親ドキュメントID: YYYYMMDD
    const dateString = `${yyyy}-${mm}-${dd}`; // 表示/集計用: YYYY-MM-DD

    // 対象ユーザーの open な todaysBills を特定
    const billsSnap = await db
      .collection("todaysBills")
      .where("userId", "==", userId)
      .where("status", "==", "open")
      .limit(1)
      .get();

    if (billsSnap.empty) {
      return { success: false, error: "入店していません。先に入店してください。" };
    }

    const billsDoc = billsSnap.docs[0];
    const billsRef = billsDoc.ref;

    // トランザクションで整合性を保つ
    const result = await db.runTransaction(async (tx) => {
      // すべての読み取りは書き込みより前に実行する
      const ordersRef = db.collection("orders").doc(orderDocId);
      const [billsSnapInTx, ordersSnap] = await Promise.all([
        tx.get(billsRef),
        tx.get(ordersRef),
      ]);

      // 1) todaysBills 更新用データの計算
      const billsData = billsSnapInTx.data() as any;
      const pokerName: string = billsData?.pokerName || "";
      const currentTable: string | null = billsData?.currentTable ?? null;
      const currentSeat: string | null = billsData?.currentSeat ?? null;

      const orderedAt = now;
      let totalItemsPrice = 0;
      const newEntries: any[] = [];

      // 各アイテムの処理
      for (const item of items) {
        const itemTotal = Number(item.price) * Number(item.quantity);
        totalItemsPrice += itemTotal;
        
        newEntries.push({
          menuItemId: item.menuItemId,
          category: item.category,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          totalPrice: itemTotal,
          orderedAt,
        });
      }

      const existingItems: any[] = Array.isArray(billsData?.items) ? billsData.items : [];
      const updatedItems = [...existingItems, ...newEntries];
      const updatedTotal = (Number(billsData?.totalPrice) || 0) + totalItemsPrice;

      tx.update(billsRef, {
        items: updatedItems,
        totalPrice: updatedTotal,
        updatedAt: now,
      });

      // 2) orders/{YYYYMMDD} と _TodaysOrders の作成/更新

      if (!ordersSnap.exists) {
        tx.set(ordersRef, {
          date: dateString,
          onedayOrderQuantity: 0,
          onedayTotalPrice: 0,
          createdAt: now,
          updatedAt: now,
        });
      }

      // _TodaysOrders へ行追加（一括注文の場合は1つの注文として記録）
      const todaysOrderRef = ordersRef.collection("_TodaysOrders").doc();
      tx.set(todaysOrderRef, {
        orderDocId,
        userId,
        userName: pokerName,
        items: newEntries,
        orderingAt: now,
        status: "preparing",
        currentTable,
        currentSeat,
        createdAt: now,
        updatedAt: now,
      });

      // 親 orders の集計をインクリメント（注文数は1、金額は合計）
      tx.update(ordersRef, {
        onedayOrderQuantity: FieldValue.increment(1),
        onedayTotalPrice: FieldValue.increment(totalItemsPrice),
        date: dateString,
        updatedAt: now,
      });

      return {
        todaysBillsId: billsRef.id,
        ordersDocId: orderDocId,
        todaysOrderId: todaysOrderRef.id,
        totalPrice: updatedTotal,
        itemsCount: items.length,
        totalItemsPrice: totalItemsPrice,
      };
    });

    return { success: true, data: result };
  } catch (error) {
    console.error("placeOrderByUser エラー:", error);
    return { success: false, error: "注文の登録に失敗しました" };
  }
});
