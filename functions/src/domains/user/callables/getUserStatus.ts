import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

/**
 * ユーザーの現在の入店状態と基本情報を取得するCloud Function
 *
 * When（いつ）: LIFF側でユーザーの入店状態を確認したい時
 * Where（どこで）: LIFF側のユーザーホーム画面
 * What（何を）: ユーザーの入店状態（isStaying）と基本情報を取得
 * How（どうやって）: users から基本情報、activeStays から入店状態を取得（users.isStaying は廃止）
 *
 * 認証: request.auth 必須。照会対象は常に request.auth.uid。
 * request.data.uid が渡されても一致する場合のみ許容し、不一致は permission-denied。
 */
export const getUserStatus = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "認証が必要です。");
  }

  const uid = request.auth.uid;
  const requestedUid = (request.data as { uid?: unknown } | undefined)?.uid;
  if (typeof requestedUid === "string" && requestedUid.length > 0 && requestedUid !== uid) {
    throw new HttpsError("permission-denied", "他のユーザー情報は参照できません。");
  }

  const logContext: Record<string, unknown> = { uid };

  try {
    const db = admin.firestore();

    // Firestoreからユーザー情報を取得（auth UID のみ）
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return {
        success: false,
        error: "ユーザーが見つかりません。",
      };
    }

    const userData = userSnap.data() || {};

    // 入店状態は activeStays から取得（users.isStaying は廃止済み）
    const activeStaySnap = await db.collection("activeStays").doc(uid).get();
    const isStaying = activeStaySnap.exists && activeStaySnap.data()?.isActive === true;

    logOpsSuccess({
      message: "getUserStatus 成功",
      functionEntry: "getUserStatus",
      context: { uid, isStaying },
    });

    // 成功レスポンス（L2 LINE 契約維持）
    return {
      success: true,
      user: {
        uid: uid,
        loginId: userData.loginId || "",
        pokerName: userData.pokerName || "",
        isStaying, // activeStays.isActive から取得
        lastCheckInAt: userData.lastCheckInAt, // 最後の入店時刻
      },
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logOpsError({
      message: "getUserStatus error",
      functionEntry: "getUserStatus",
      cause: error,
      errorKey: "USER_VISIT_STATUS_FETCH_FAILED",
      context: logContext,
    });
    return {
      success: false,
      error: "ユーザー状態の取得に失敗しました。",
    };
  }
});
