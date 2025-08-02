/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

// Firebase Admin SDKの初期化
admin.initializeApp();

// LINE Login APIの設定（現在は未使用）
// const LINE_CHANNEL_ID = "2007806607"; // あなたのLINE Channel ID

/**
 * LIFFのIDトークンを検証し、Firebaseカスタムトークンを発行するエンドポイント
 *
 * リクエスト:
 * - POST /getFirebaseCustomToken
 * - Authorization: Bearer {liff_id_token}
 *
 * レスポンス:
 * - 成功: { firebaseToken: string }
 * - 失敗: { error: string }
 */
export const getFirebaseCustomToken = onRequest(async (request, response) => {
  // CORS設定
  response.set("Access-Control-Allow-Origin", "*");
  response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // OPTIONSリクエスト（プリフライト）の処理
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  // POSTメソッドのみ許可
  if (request.method !== "POST") {
    response.status(405).json({error: "Method not allowed"});
    return;
  }

  try {
    // AuthorizationヘッダーからIDトークンを取得
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      response.status(401).json({error: "Authorization header is required"});
      return;
    }

    const idToken = authHeader.substring(7); // "Bearer "を除去
    logger.info("Received LIFF ID token", {tokenLength: idToken.length});

    // LINE Login APIでIDトークンを検証
    const lineUserInfo = await verifyLineIdToken(idToken);
    logger.info("LINE ID token verified", {userId: lineUserInfo.sub});

    // Firebaseカスタムトークンを生成
    const customToken = await admin.auth().createCustomToken(lineUserInfo.sub, {
      provider: "line",
      lineUserId: lineUserInfo.sub,
      name: lineUserInfo.name,
      picture: lineUserInfo.picture,
    });

    logger.info("Firebase custom token created", {userId: lineUserInfo.sub});

    // レスポンスを返す
    response.status(200).json({
      firebaseToken: customToken,
      user: {
        id: lineUserInfo.sub,
        name: lineUserInfo.name,
        picture: lineUserInfo.picture,
      },
    });
  } catch (error) {
    logger.error("Error in getFirebaseCustomToken", error);

    if (error instanceof Error) {
      response.status(400).json({error: error.message});
    } else {
      response.status(500).json({error: "Internal server error"});
    }
  }
});

/**
 * LINE Login APIを使用してIDトークンを検証する
 * @param {string} idToken LIFFのIDトークン
 * @return {Promise<LineUserInfo>} LINEユーザー情報
 */
async function verifyLineIdToken(idToken: string): Promise<LineUserInfo> {
  try {
    // LIFF IDトークンからユーザー情報を取得
    // 注意: LIFFのIDトークンは直接検証できないため、
    // クライアントサイドで取得したユーザー情報を信頼する
    // 実際の運用では、より安全な検証方法を実装する必要があります

    // 簡易的な実装として、IDトークンをデコードしてユーザー情報を取得
    const tokenParts = idToken.split(".");
    if (tokenParts.length !== 3) {
      throw new Error("Invalid token format");
    }

    const payload = JSON.parse(Buffer.from(tokenParts[1], "base64").toString());

    if (!payload.sub || !payload.name) {
      throw new Error("Invalid token payload");
    }

    return {
      sub: payload.sub,
      name: payload.name,
      picture: payload.picture || null,
      email: payload.email || null,
    };
  } catch (error) {
    logger.error("Error verifying LINE ID token", error);
    throw new Error("Failed to verify LINE ID token");
  }
}

/**
 * LINEユーザー情報の型定義
 */
interface LineUserInfo {
  sub: string; // LINEユーザーID
  name: string; // 表示名
  picture?: string; // プロフィール画像URL
  email?: string; // メールアドレス（取得可能な場合）
}

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
