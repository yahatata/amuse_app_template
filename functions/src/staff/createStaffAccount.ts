import { onCall } from "firebase-functions/v2/https";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

/**
 * スタッフアカウント作成関数
 *
 * リクエスト:
 * - fullName: スタッフの氏名（漢字）
 * - fullNameKana: スタッフの氏名（ひらがなまたはカタカナ）
 * - email: メールアドレス
 * - phoneNumber: 電話番号
 * - birthMonthDay: 誕生日（MMDD）
 *
 * レスポンス:
 * - success: 作成成功フラグ
 * - uid: 作成されたスタッフID
 * - qrCode: QRコードのBase64画像
 * - qrCodeUrl: QRコードのStorage URL
 * - expiresAt: QRコードの有効期限
 */
export const createStaffAccount = onCall(
  async (request) => {
    // 認証チェック
    if (!request.auth) {
      throw new functions.https.HttpsError("unauthenticated", "認証が必要です。再度ログインしてください。");
    }

    const { fullName, fullNameKana, email, phoneNumber, birthMonthDay } = request.data;

    // 入力バリデーション
    if (!fullName || !fullNameKana || !email || !phoneNumber || !birthMonthDay) {
      throw new functions.https.HttpsError(
        "invalid-argument", "入力情報が不足しています。全ての項目を入力してください。"
      );
    }

    // 誕生日の形式チェック（4桁の数字）
    if (!/^\d{4}$/.test(birthMonthDay)) {
      throw new functions.https.HttpsError("invalid-argument", "誕生日は4桁の数字（MMDD）で入力してください。");
    }

    // 電話番号の形式チェック
    const phoneRegExp = /^(0[5789]0\d{8}|0[1-9]\d{8,9})$/;
    if (!phoneRegExp.test(phoneNumber)) {
      throw new functions.https.HttpsError("invalid-argument", "無効な電話番号形式です（ハイフンなしで10〜11桁）");
    }

    // かなの形式チェック（ひらがなとカタカナを許可）
    const kanaRegExp = /^[ぁ-んァ-ヶー]+$/;
    if (!kanaRegExp.test(fullNameKana)) {
      throw new functions.https.HttpsError("invalid-argument", "かなはひらがなまたはカタカナで入力してください。");
    }

    try {
      const uid = request.auth.uid;

      // スタッフ名重複チェック
      const existing = await admin
        .firestore()
        .collection("staffs")
        .where("fullNameKana", "==", fullNameKana)
        .limit(1)
        .get();

      if (!existing.empty) {
        throw new functions.https.HttpsError("already-exists", "このスタッフ名は既に使用されています。別のスタッフ名に変更してください。");
      }

      // loginIdを自動生成（fullNameKana + birthMonthDay）
      const loginId = fullNameKana + birthMonthDay;

      // QRコードデータを生成
      const { generateQRData, generateQRImage, saveQRCodeToStorage } =
        await import("../utils/qrCodeUtils");
      const qrData = generateQRData(uid, loginId, "staff");
      const qrCodeImage = await generateQRImage(qrData);
      const expiresAt = qrData.timestamp + (10 * 60 * 1000); // 10分

      // QRコードをStorageに保存
      const qrCodeUrl = await saveQRCodeToStorage(uid, qrCodeImage, "staff");

      // スタッフ情報をFirestoreに保存（QRコード情報を含む）
      await admin.firestore()
        .collection("staffs")
        .doc(uid)
        .set({
          uid: uid,
          fullName: fullName,
          fullNameKana: fullNameKana,
          email: email,
          phoneNumber: phoneNumber,
          birthMonthDay: birthMonthDay,
          loginId: loginId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          // QRコード情報を追加
          qrCodeUrl: qrCodeUrl,
          qrExpiresAt: admin.firestore.Timestamp.fromDate(new Date(expiresAt)),
        });

      return {
        success: true,
        uid,
        qrCode: qrCodeImage,
        qrCodeUrl: qrCodeUrl,
        expiresAt,
      };
    } catch (error) {
      console.error("スタッフアカウント作成エラー:", error);
      
      // 既にHttpsErrorの場合はそのまま再スロー
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      // その他のエラーの場合は汎用エラーメッセージ
      throw new functions.https.HttpsError("internal", "スタッフアカウントの作成に失敗しました。しばらく時間をおいて再度お試しください。");
    }
  }
);
