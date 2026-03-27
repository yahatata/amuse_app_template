import { onCall } from "firebase-functions/v2/https";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { linkStaffRichMenu } from "../services/lineRichMenu";
import { logOpsError } from "../../../shared/logging/logOpsError";

/**
 * 提案C-B: スタッフ＋ユーザー登録アカウントのリッチメニューをスタッフ用に整える
 *
 * When: ユーザー LIFF 起動時、登録済みユーザーかつスタッフの場合
 * What: LINE API でスタッフ用リッチメニューを設定
 * How: staffs コレクション確認後、linkStaffRichMenu を呼び出し
 *
 * 既存のスタッフ＋ユーザーでユーザー用リッチメニューのままのアカウントを、
 * ユーザー LIFF を1回開くだけでスタッフ用に切り替える。
 */
export const ensureStaffRichMenu = onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "認証が必要です。"
    );
  }

  const uid = request.auth.uid;

  try {
    const staffDoc = await admin.firestore().collection("staffs").doc(uid).get();

    if (!staffDoc.exists) {
      // スタッフでない場合は何もしない（成功として返す）
      return { success: true, updated: false, reason: "not_staff" };
    }

    // LIFF ユーザーでは uid = LINE User ID
    const ok = await linkStaffRichMenu(uid);

    return {
      success: true,
      updated: ok,
      reason: ok ? "rich_menu_linked" : "link_failed",
    };
  } catch (error) {
    logOpsError({
      message: 'ensureStaffRichMenu error:',
      failureType: 'webhook',
      functionEntry: 'ensureStaffRichMenu',
      cause: error,
    });
    // 呼び出し元では fire-and-forget のため、エラー時も失敗させずに返す
    return { success: false, updated: false, reason: "error" };
  }
});
