import * as logger from "firebase-functions/logger";
import {LineUserInfo} from "../types";

/**
 * LINE Login APIを使用してIDトークンを検証する
 * @param {string} idToken LIFFのIDトークン
 * @return {Promise<LineUserInfo>} LINEユーザー情報
 */
export async function verifyLineIdToken(
  idToken: string
): Promise<LineUserInfo> {
  try {
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
