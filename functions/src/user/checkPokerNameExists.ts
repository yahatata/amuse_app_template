import {onCall} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {CheckPokerNameResult} from "../types";

export const checkPokerNameExists = onCall(
  async (request): Promise<CheckPokerNameResult> => {
    // 認証チェック
    if (!request.auth) {
      throw new Error("Authentication required.");
    }

    const pokerName = request.data.pokerName;

    // 入力バリデーション
    if (!pokerName || typeof pokerName !== "string") {
      throw new Error("PokerName is required and must be a string.");
    }

    try {
      const usersRef = admin.firestore().collection("users");
      const snapshot = await usersRef
        .where("pokerName", "==", pokerName)
        .limit(1)
        .get();

      return {exists: !snapshot.empty};
    } catch (error) {
      console.error("PokerName チェックエラー:", error);
      throw new Error("PokerName チェックに失敗しました。");
    }
  }
);
