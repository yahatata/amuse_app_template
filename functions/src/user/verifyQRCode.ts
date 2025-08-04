import {onCall} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {VerifyQRResponse} from "../types";
import {verifyQRData, parseQRData} from "../utils/qrCodeUtils";

/**
 * QRコード検証関数
 *
 * リクエスト:
 * - qrData: QRコードから読み取ったデータ
 *
 * レスポンス:
 * - valid: 検証結果
 * - data: QRコードデータ（有効な場合）
 * - message: メッセージ
 */
export const verifyQRCode = onCall(
  async (request): Promise<VerifyQRResponse> => {
    // 認証チェック（店舗端末からの呼び出しを想定）
    if (!request.auth) {
      throw new Error("Authentication required.");
    }

    const {qrData} = request.data;

    // 入力バリデーション
    if (!qrData || typeof qrData !== "string") {
      return {
        valid: false,
        message: "QRコードデータが無効です。",
      };
    }

    try {
      // QRコードデータを検証
      const isValid = verifyQRData(qrData);

      if (!isValid) {
        return {
          valid: false,
          message: "QRコードが無効または期限切れです。",
        };
      }

      // QRコードデータをパース
      const parsedData = parseQRData(qrData);

      if (!parsedData) {
        return {
          valid: false,
          message: "QRコードデータの解析に失敗しました。",
        };
      }

      // ユーザー情報を取得
      const userDoc = await admin.firestore()
        .collection("users")
        .doc(parsedData.uid)
        .get();

      if (!userDoc.exists) {
        return {
          valid: false,
          message: "ユーザーが見つかりません。",
        };
      }

      return {
        valid: true,
        data: parsedData,
        message: `${parsedData.type === "user" ? "ユーザー" : "スタッフ"}のQRコードが有効です。`,
      };
    } catch (error) {
      console.error("QRコード検証エラー:", error);
      return {
        valid: false,
        message: "QRコードの検証に失敗しました。",
      };
    }
  }
);
