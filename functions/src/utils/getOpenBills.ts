import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

/**
 * When: 入店中ユーザー一覧が必要なとき（例: 注文ダイアログ表示前、利用者一覧画面表示時）
 * Where: Cloud Functions (src/utils/getOpenBills.ts)
 * What: todaysBills から status=open のユーザー情報（最小限）を取得
 * How: Firestore クエリで抽出し、ソートして返却
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

    data.sort((a, b) => (a.pokerName || "").localeCompare(b.pokerName || ""));

    return { success: true, data };
  } catch (error) {
    console.error("getOpenBills エラー:", error);
    return { success: false, error: "入店中ユーザーの取得に失敗しました" };
  }
});


