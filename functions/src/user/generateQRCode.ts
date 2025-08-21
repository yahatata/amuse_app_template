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
      let userData: any;
      let collectionName: string;

      // typeに応じてコレクションを選択
      if (type === "staff") {
        const staffDoc = await admin.firestore()
          .collection("staffs")
          .doc(uid)
          .get();

        if (!staffDoc.exists) {
          throw new Error("Staff not found. Please create an account first.");
        }

        userData = staffDoc.data();
        collectionName = "staffs";
      } else {
        const userDoc = await admin.firestore()
          .collection("users")
          .doc(uid)
          .get();

        if (!userDoc.exists) {
          throw new Error("User not found. Please create an account first.");
        }

        userData = userDoc.data();
        collectionName = "users";
      }

      const loginId = userData?.loginID || userData?.loginId; // loginID（大文字）またはloginId（小文字）に対応

      if (!loginId) {
        throw new Error("Login ID not found. Please update your profile.");
      }

      // 連続生成制限を削除（ユーザーが自由に再生成可能）

      // QRコードデータを生成
      const qrData = generateQRData(uid, loginId, type);
      const qrCodeImage = await generateQRImage(qrData);
      // 10分後に期限切れ
      const expiresAt = Date.now() + (10 * 60 * 1000);

      // QRコードをStorageに保存
      const qrCodeUrl = await saveQRCodeToStorage(uid, qrCodeImage, type);

      // ドキュメントのQRコード情報を更新
      console.log(`Firestore更新開始: ${collectionName}/${uid}`);
      console.log(`更新データ: qrCodeUrl=${qrCodeUrl}, qrExpiresAt=${new Date(expiresAt)}`);
      
      try {
        await admin.firestore()
          .collection(collectionName)
          .doc(uid)
          .update({
            qrCodeUrl: qrCodeUrl,
            qrExpiresAt: new Date(expiresAt),
          });
        console.log(`Firestore更新成功: ${collectionName}/${uid}`);
      } catch (updateError) {
        console.error(`Firestore更新エラー: ${collectionName}/${uid}`, updateError);
        const errorMessage = updateError instanceof Error ? updateError.message : String(updateError);
        throw new Error(`Firestore更新に失敗しました: ${errorMessage}`);
      }

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
