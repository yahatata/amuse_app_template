import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

/**
 * When: 注文ダイアログ表示時に入店中ユーザー一覧を取得
 * Where: Cloud Functions (src/itemOrder/getOpenBills.ts)
 * What: todaysBills から status=open のユーザー情報を取得
 * How: Firestore クエリで該当ドキュメントを取得して必要最小限の情報を返却
 */
export const getOpenBills = onCall(async () => {
  try {
    const db = getFirestore();
    const snap = await db
      .collection("todaysBills")
      .where("status", "==", "open")
      .get();

    const data = snap.docs.map((doc) => {
      const d = doc.data() as any;
      return {
        todaysBillsId: doc.id,
        userId: d?.userId ?? "",
        pokerName: d?.pokerName ?? "",
        currentTable: d?.currentTable ?? null,
        currentSeat: d?.currentSeat ?? null,
      };
    });

    // 表示のためにポーカーネームで昇順ソート
    data.sort((a, b) => (a.pokerName || "").localeCompare(b.pokerName || ""));

    return { success: true, data };
  } catch (error) {
    console.error("getOpenBills エラー:", error);
    return { success: false, error: "入店中ユーザーの取得に失敗しました" };
  }
});


