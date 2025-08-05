import {onCall} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {GenerateQRResponse} from "../types";
import {generateQRData, generateQRImage} from "../utils/qrCodeUtils";

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

      // 連続生成制限チェック（1分間に1回まで）
      const oneMinuteAgo = Date.now() - (60 * 1000);
      const recentQRQuery = await admin.firestore()
        .collection("qrCodeHistory")
        .where("uid", "==", uid)
        .where("type", "==", type)
        .where("generatedAt", ">", new Date(oneMinuteAgo))
        .limit(1)
        .get();

      if (!recentQRQuery.empty) {
        throw new Error("QR code generation is limited to once per minute.");
      }

      // QRコードデータを生成
      const qrData = generateQRData(uid, loginId, type);
      const qrCodeImage = await generateQRImage(qrData);
      const expiresAt = qrData.timestamp + (5 * 60 * 1000);

      // QRコードをStorageに保存
      const {saveQRCodeToStorage} = await import("../utils/qrCodeUtils");
      const qrCodeUrl = await saveQRCodeToStorage(uid, qrCodeImage, type);

      await admin.firestore()
        .collection("qrCodeHistory")
        .add({
          uid,
          loginId: loginId, // 変数名を明確化
          type,
          generatedAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: new Date(expiresAt),
          qrCodeUrl: qrCodeUrl,
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
