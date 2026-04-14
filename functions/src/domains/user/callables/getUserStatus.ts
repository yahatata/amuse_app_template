import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logOpsError } from "../../../shared/logging/logOpsError";

/**
 * ユーザーの現在の入店状態と基本情報を取得するCloud Function
 *
 * When（いつ）: LIFF側でユーザーの入店状態を確認したい時
 * Where（どこで）: LIFF側のユーザーホーム画面
 * What（何を）: ユーザーの入店状態（isStaying）と基本情報を取得
 * How（どうやって）: users から基本情報、activeStays から入店状態を取得（users.isStaying は廃止）
 */
export const getUserStatus = onCall(async (request) => {
  try {
    const { uid } = request.data ?? {};

    // パラメータの検証
    if (!uid || typeof uid !== "string") {
      return {
        success: false,
        error: "ユーザーIDが無効です。"
      };
    }

    const db = admin.firestore();

    // Firestoreからユーザー情報を取得
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return {
        success: false,
        error: "ユーザーが見つかりません。"
      };
    }

    const userData = userSnap.data() || {};

    // 入店状態は activeStays から取得（users.isStaying は廃止済み）
    const activeStaySnap = await db.collection("activeStays").doc(uid).get();
    const isStaying = activeStaySnap.exists && activeStaySnap.data()?.isActive === true;

    // 成功レスポンス
    return {
      success: true,
      user: {
        uid: uid,
        loginId: userData.loginId || "",
        pokerName: userData.pokerName || "",
        isStaying, // activeStays.isActive から取得
        lastCheckInAt: userData.lastCheckInAt,   // 最後の入店時刻
        lastLogin: userData.lastLogin,           // 最後のログイン時刻
      }
    };
    
  } catch (error) {
    logOpsError({
      message: 'getUserStatus error',
      functionEntry: 'getUserStatus',
      cause: error,
      errorKey: 'USER_VISIT_STATUS_FETCH_FAILED',
    });
    return { 
      success: false, 
      error: "ユーザー状態の取得に失敗しました。" 
    };
  }
}); 