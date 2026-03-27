import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getCurrentBusinessDateKeyOrThrow } from "../../storeMeta/repos/getCurrentBusinessDateKeyOrThrow";
import { logOpsError } from "../../../shared/logging/logOpsError";

/**
 * When: LIFF側のユーザーが注文履歴を確認したいとき
 * Where: Cloud Functions (src/itemOrder/getUserOrderHistory.ts)
 * What: 認証済みユーザーの注文履歴を取得（orders/_TodaysOrders から）
 * How:
 *  - request.auth.uidでユーザーIDを自動取得
 *  - 当日の営業日（orderDocId）の orders/{orderDocId}/_TodaysOrders を取得
 *  - userId 一致（status はキャンセル含む全件）
 *  - billId でグループ化して伝票単位で返却
 *  - 合計金額は status !== 'cancel' のもののみ加算
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
    const orderDocId = businessDate.replace(/-/g, ""); // "2026-01-31" -> "20260131"

    const todaysOrdersRef = db.collection("orders").doc(orderDocId).collection("_TodaysOrders");
    const snapshot = await todaysOrdersRef
      .where("userId", "==", userId)
      .orderBy("orderedAt", "desc")
      .get();

    if (snapshot.empty) {
      return {
        success: true,
        data: {
          orders: [],
          totalCount: 0,
          totalAmount: 0,
        },
      };
    }

    // billId でグループ化（伝票単位）
    const byBillId = new Map<string, {
      id: string;
      items: Array<{ name: string; quantity: number; price: number; status: string }>;
      totalPrice: number;
      currentTable: string | null;
      currentSeat: number | null;
      orderDate: string | null;
      status: string;
    }>();

    for (const doc of snapshot.docs) {
      const d = doc.data();
      const billId = (d.billId as string) || doc.id;
      const itemStatus = (d.status as string) || "preparing";
      const price = typeof d.unitPriceIncl === "number" ? d.unitPriceIncl : 0;
      const quantity = typeof d.quantity === "number" ? d.quantity : 0;
      const lineTotal = itemStatus === "cancel" ? 0 : price * quantity;

      let orderDate: string | null = null;
      if (d.orderedAt && typeof d.orderedAt.toDate === "function") {
        orderDate = d.orderedAt.toDate().toISOString();
      } else if (d.orderedAt) {
        orderDate = new Date(d.orderedAt as unknown as string).toISOString();
      }

      if (!byBillId.has(billId)) {
        byBillId.set(billId, {
          id: billId,
          items: [],
          totalPrice: 0,
          currentTable: (d.currentTable as string) || null,
          currentSeat: typeof d.currentSeat === "number" ? d.currentSeat : null,
          orderDate,
          status: "served",
        });
      }
      const group = byBillId.get(billId)!;
      group.items.push({
        name: (d.name as string) || "",
        quantity,
        price,
        status: itemStatus,
      });
      group.totalPrice += lineTotal;
      if (orderDate && !group.orderDate) group.orderDate = orderDate;
    }

    const orders = Array.from(byBillId.values()).sort((a, b) => {
      if (!a.orderDate || !b.orderDate) return 0;
      return b.orderDate.localeCompare(a.orderDate);
    });

    const totalAmount = orders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);

    return {
      success: true,
      data: {
        orders,
        totalCount: orders.length,
        totalAmount,
      },
    };
  } catch (error) {
    logOpsError({
      message: 'getUserOrderHistory エラー:',
      failureType: 'business',
      functionEntry: 'getUserOrderHistory',
      cause: error,
    });
    if (error instanceof HttpsError) {
      if (error.code === "failed-precondition") {
        return { success: false, error: "店舗が閉店中のため注文履歴を取得できません。" };
      }
      return { success: false, error: error.message || "注文履歴の取得に失敗しました" };
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("index") || message.includes("Index")) {
      return { success: false, error: "注文履歴の取得にはFirestoreの複合インデックスが必要です。Firebaseコンソールのエラーログでインデックス作成リンクを確認してください。" };
    }
    return { success: false, error: "注文履歴の取得に失敗しました" };
  }
});
