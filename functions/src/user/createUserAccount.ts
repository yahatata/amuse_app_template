import {onCall} from "firebase-functions/v2/https";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as bcrypt from "bcryptjs";

/**
 * ユーザーアカウント作成関数
 *
 * リクエスト:
 * - pokerName: pokerName
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
      throw new functions.https.HttpsError("unauthenticated", "認証が必要です。再度ログインしてください。");
    }

    const {pokerName, email, pin, birthMonth, birthDay} = request.data;

    // 入力バリデーション
    if (!pokerName || !email || !pin || !birthMonth || !birthDay) {
      throw new functions.https.HttpsError(
        "invalid-argument", "入力情報が不足しています。全ての項目を入力してください。"
      );
    }

    // PINの形式チェック（4桁の数字）
    if (!/^\d{4}$/.test(pin)) {
      throw new functions.https.HttpsError("invalid-argument", "PINは4桁の数字で入力してください。");
    }

    // pokerName重複チェック
    const existing = await admin
      .firestore()
      .collection("users")
      .where("pokerName", "==", pokerName)
      .limit(1)
      .get();

    if (!existing.empty) {
      throw new functions.https.HttpsError("already-exists", "このpokerNameは既に使用されています。別のpokerNameに変更してください。");
    }

    try {
      const uid = request.auth.uid;

      // PINをハッシュ化（bcryptで統一）
      const hashedPin = bcrypt.hashSync(pin, 10);

      // birthMonthDayを組み合わせて作成
      const birthMonthDay = birthMonth + birthDay;

      // loginIDを自動生成（pokerName + birthMonthDay）
      const loginID = pokerName + birthMonthDay;

      // QRコードデータを直接生成
      const {generateQRData, generateQRImage, saveQRCodeToStorage} =
        await import("../utils/qrCodeUtils");
      const qrData = generateQRData(uid, loginID, "user");
      const qrCodeImage = await generateQRImage(qrData);
      const expiresAt = qrData.timestamp + (10 * 60 * 1000); // 10分に修正

      // QRコードをStorageに保存
      const qrCodeUrl = await saveQRCodeToStorage(uid, qrCodeImage, "user");

      // ユーザー情報をFirestoreに保存（QRコード情報を含む）
      await admin.firestore()
        .collection("users")
        .doc(uid)
        .set({
          uid: uid,
          pokerName: pokerName,
          email: email,
          hashedPin: hashedPin,
          birthMonthDay: birthMonthDay,
          loginID: loginID,
          pointA: 0,
          pointB: 0,
          sideGameTip: 0,
          isStaying: false,
          lastLogin: null,
          role: "user",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          currentTable: null,
          currentSeat: null,
          // QRコード情報を追加
          qrCodeUrl: qrCodeUrl,
          qrExpiresAt: new Date(expiresAt),
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
      
      // 既にHttpsErrorの場合はそのまま再スロー
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      // その他のエラーの場合は汎用エラーメッセージ
      throw new functions.https.HttpsError("internal", "ユーザーアカウントの作成に失敗しました。しばらく時間をおいて再度お試しください。");
    }
  }
);
