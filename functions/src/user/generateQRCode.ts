import {onCall} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {GenerateQRResponse} from "../types";
import {generateQRData, generateQRImage, saveQRCodeToStorage} from "../utils/qrCodeUtils";

/**
 * QRコード生成関数（統合版）
 *
 * アカウント作成時と再生成時の両方に対応
 *
 * リクエスト:
 * - type: "user" | "staff"
 *
 * レスポンス:
 * - qrCode: Base64エンコードされたQRコード画像
 * - data: QRコードデータ
 * - expiresAt: 有効期限
 */
export const generateQRCode = onCall(
  async (request): Promise<GenerateQRResponse> => {
    // 認証チェック
    if (!request.auth) {
      throw new Error("Authentication required.");
    }

    const uid = request.auth.uid;
    const {type} = request.data;

    // 入力バリデーション
    if (!type || !["user", "staff"].includes(type)) {
      throw new Error("Invalid QR code type. Must be \"user\" or \"staff\".");
    }

    try {
      // ユーザー情報を取得
      const userDoc = await admin.firestore()
        .collection("users")
        .doc(uid)
        .get();

      if (!userDoc.exists) {
        throw new Error("User not found. Please create an account first.");
      }

      const userData = userDoc.data();
      const loginId = userData?.loginID || userData?.loginId; // loginID（大文字）またはloginId（小文字）に対応

      if (!loginId) {
        throw new Error("Login ID not found. Please update your profile.");
      }

      // 連続生成制限を削除（ユーザーが自由に再生成可能）

      // QRコードデータを生成
      const qrData = generateQRData(uid, loginId, type);
      const qrCodeImage = await generateQRImage(qrData);
      const expiresAt = qrData.timestamp + (10 * 60 * 1000);

      // QRコードをStorageに保存
      const qrCodeUrl = await saveQRCodeToStorage(uid, qrCodeImage, type);

      // ユーザードキュメントのQRコード情報を更新
      await admin.firestore()
        .collection("users")
        .doc(uid)
        .update({
          qrCodeUrl: qrCodeUrl,
          qrExpiresAt: new Date(expiresAt),
        });

      return {
        qrCode: qrCodeImage,
        qrCodeUrl: qrCodeUrl,
        data: qrData,
        expiresAt,
      };
    } catch (error) {
      console.error("QRコード生成エラー:", error);

      // エラーメッセージを詳細化
      if (error instanceof Error) {
        throw new Error(`QRコードの生成に失敗しました: ${error.message}`);
      } else {
        throw new Error("QRコードの生成に失敗しました。");
      }
    }
  }
);
