import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getCurrentBusinessDateKeyOrThrow } from "../../storeMeta/repos/getCurrentBusinessDateKeyOrThrow";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

/**
 * When: 入店中ユーザー一覧が必要なとき（例: 注文ダイアログ表示前、利用者一覧画面表示時）
 * Where: Cloud Functions (src/utils/getOpenBills.ts)
 * What: bills から status=open のユーザー情報（最小限）を取得
 * How: Firestore クエリで抽出し、ソートして返却
 */
export const getOpenBills = onCall(async () => {
  let businessDate: string | undefined;
  try {
    const db = getFirestore();
    
    // 当日の営業日を取得（state docから取得）
    businessDate = await getCurrentBusinessDateKeyOrThrow();

    const snap = await db
      .collection("bills")
      .where("businessDate", "==", businessDate)
      .where("status", "==", "open")
      .get();

    const data = snap.docs.map((doc) => {
      const d = doc.data() as any;
      return {
        billId: doc.id, // todaysBillsId → billId に変更
        userId: d?.party?.userId ?? "",
        pokerName: d?.party?.pokerName ?? "",
        currentTable: d?.place?.table ?? null,
        currentSeat: d?.place?.seat ?? null,
      };
    });

    // ソート（pokerName順）
    data.sort((a, b) => (a.pokerName || "").localeCompare(b.pokerName || ""));
    logOpsSuccess({
  message: "getOpenBills 成功",
  functionEntry: "getOpenBills",
  context: { businessDate },
});


    return { success: true, data };
  } catch (error) {
    logOpsError({
      message: 'getOpenBills エラー:',
      functionEntry: 'getOpenBills',
      cause: error,
      context: { businessDate },
    });
    return { success: false, error: "入店中ユーザーの取得に失敗しました" };
  }
});


