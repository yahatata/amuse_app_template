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
    const settledStatuses = new Set([
      "settled",
      "partially_refunded",
      "refunded",
      "voided",
    ]);
    const billsSnap = await db
      .collection("bills")
      .where("party.userId", "==", userId)
      .where("businessDate", "==", businessDate)
      .get();

    if (billsSnap.empty) {
      return {
        success: true,
        data: {
          orders: [],
          totalCount: 0,
          totalAmount: 0,
        },
      };
    }

    const orders = await Promise.all(
      billsSnap.docs
        .filter((doc) => {
          const status = (doc.data()?.status as string) || "";
          return settledStatuses.has(status);
        })
        .map(async (doc) => {
          const d = doc.data() as Record<string, any>;
          const itemsSnap = await doc.ref.collection("items").get();

          let orderDate: string | null = null;
          const createdAt = d.createdAt;
          const updatedAt = d.updatedAt;
          if (createdAt && typeof createdAt.toDate === "function") {
            orderDate = createdAt.toDate().toISOString();
          } else if (updatedAt && typeof updatedAt.toDate === "function") {
            orderDate = updatedAt.toDate().toISOString();
          }

          return {
            id: doc.id,
            items: [] as Array<{ name: string; quantity: number; price: number; status: string }>,
            itemCount: itemsSnap.size,
            totalPrice:
              typeof d.amounts?.grandTotalRounded === "number"
                ? d.amounts.grandTotalRounded
                : 0,
            currentTable:
              typeof d.place?.table === "string" ? (d.place.table as string) : null,
            currentSeat:
              typeof d.place?.seat === "number" ? (d.place.seat as number) : null,
            orderDate,
            status: typeof d.status === "string" ? d.status : "settled",
          };
        })
    );

    orders.sort((a, b) => {
      const aTime = a.orderDate ? new Date(a.orderDate).getTime() : 0;
      const bTime = b.orderDate ? new Date(b.orderDate).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return b.id.localeCompare(a.id);
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
