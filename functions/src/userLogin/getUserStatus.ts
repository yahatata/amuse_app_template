import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * ユーザーの現在の入店状態と基本情報を取得するCloud Function
 * 
 * When（いつ）: LIFF側でユーザーの入店状態を確認したい時
 * Where（どこで）: LIFF側のユーザーホーム画面
 * What（何を）: ユーザーの入店状態（isStaying）と基本情報を取得
 * How（どうやって）: Firestoreからusersコレクションのデータを読み取り
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

    // Firestoreからユーザー情報を取得
    const userRef = admin.firestore().collection("users").doc(uid);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      return { 
        success: false, 
        error: "ユーザーが見つかりません。" 
      };
    }

    const userData = userSnap.data() || {};
    
    // 成功レスポンス
    return {
      success: true,
      user: {
        uid: uid,
        loginId: userData.loginId || "",
        pokerName: userData.pokerName || "",
        isStaying: Boolean(userData.isStaying), // 入店状態
        lastCheckInAt: userData.lastCheckInAt,   // 最後の入店時刻
        lastLogin: userData.lastLogin,           // 最後のログイン時刻
      }
    };
    
  } catch (error) {
    console.error("getUserStatus error", error);
    return { 
      success: false, 
      error: "ユーザー状態の取得に失敗しました。" 
    };
  }
}); 