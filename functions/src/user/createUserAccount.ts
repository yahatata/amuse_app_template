import {onCall} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * ユーザーアカウント作成関数
 *
 * リクエスト:
 * - pokerName: ポーカー名
 * - email: メールアドレス
 * - pin: PIN（4桁）
 * - birthMonth: 誕生月
 * - birthDay: 誕生日
 *
 * レスポンス:
 * - success: 作成成功フラグ
 * - uid: 作成されたユーザーID
 * - qrCode: QRコードのBase64画像
 * - expiresAt: QRコードの有効期限
 */
export const createUserAccount = onCall(
  async (request) => {
    // 認証チェック
    if (!request.auth) {
      throw new Error("Authentication required.");
    }

    const {pokerName, email, pin, birthMonth, birthDay} = request.data;

    // 入力バリデーション
    if (!pokerName || !email || !pin || !birthMonth || !birthDay) {
      throw new Error(
        "Invalid input data. Please provide all required fields."
      );
    }

    // PINの形式チェック（4桁の数字）
    if (!/^\d{4}$/.test(pin)) {
      throw new Error("PIN must be 4 digits.");
    }

    try {
      const uid = request.auth.uid;

      // PINをハッシュ化
      const crypto = await import("crypto");
      const pinHash = crypto.default
        .createHash("sha256")
        .update(pin)
        .digest("hex");

      // birthMonthDayを組み合わせて作成
      const birthMonthDay = birthMonth + birthDay;

      // loginIDを自動生成（pokerName + birthMonthDay）
      const loginID = pokerName + birthMonthDay;

      // ユーザー情報をFirestoreに保存（HTMLと同じスキーマ）
      await admin.firestore()
        .collection("users")
        .doc(uid)
        .set({
          uid: uid,
          pokerName: pokerName,
          email: email,
          pinHash: pinHash,
          birthMonthDay: birthMonthDay,
          loginID: loginID,
          pointA: 0,
          pointB: 0,
          sideGameTip: 0,
          isStaying: false,
          lastLogin: null,
          role: "user",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      // QRコードデータを直接生成
      const {generateQRData, generateQRImage, saveQRCodeToStorage} =
        await import("../utils/qrCodeUtils");
      const qrData = generateQRData(uid, loginID, "user");
      const qrCodeImage = await generateQRImage(qrData);
      const expiresAt = qrData.timestamp + (5 * 60 * 1000);

      // QRコードをStorageに保存
      const qrCodeUrl = await saveQRCodeToStorage(uid, qrCodeImage, "user");

      // QRコード履歴をFirestoreに保存
      await admin.firestore()
        .collection("qrCodeHistory")
        .add({
          uid,
          loginId: loginID,
          type: "user",
          generatedAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: new Date(expiresAt),
          qrCodeUrl: qrCodeUrl,
        });

      return {
        success: true,
        uid,
        qrCode: qrCodeImage,
        qrCodeUrl: qrCodeUrl,
        expiresAt,
      };
    } catch (error) {
      console.error("ユーザーアカウント作成エラー:", error);

      // エラーメッセージを詳細化
      if (error instanceof Error) {
        throw new Error(`ユーザーアカウントの作成に失敗しました: ${error.message}`);
      } else {
        throw new Error("ユーザーアカウントの作成に失敗しました。");
      }
    }
  }
);
