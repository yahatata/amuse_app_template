import { onCall } from "firebase-functions/v2/https";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

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
 * - uid: スタッフID（認証 UID）
 * - alreadyRegistered: 既に staffs/{uid} がある場合 true（作成処理は行わない）
 * - qrCode: QRコードのBase64画像（新規作成時のみ）
 * - qrCodeUrl: QRコードのStorage URL（新規作成時のみ）
 * - expiresAt: QRコードの有効期限（新規作成時のみ）
 */
export const createStaffAccount = onCall(
  async (request) => {
    // 認証チェック
    if (!request.auth) {
      throw new functions.https.HttpsError("unauthenticated", "認証が必要です。再度ログインしてください。");
    }

    const uidEarly = request.auth.uid;
    const staffRefEarly = admin.firestore().collection("staffs").doc(uidEarly);
    const existingStaffSnap = await staffRefEarly.get();
    if (existingStaffSnap.exists) {
      logOpsSuccess({
        message: 'createStaffAccount スキップ（既存スタッフ・冪等）',
        functionEntry: 'createStaffAccount',
        context: { uid: uidEarly, outcome: 'already_registered' },
      });
      return {
        success: true,
        alreadyRegistered: true,
        uid: uidEarly,
      };
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

    const logContext: Record<string, unknown> = {
      uid: request.auth.uid,
      fullNameKana,
    };

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
      Object.assign(logContext, { loginId });

      // QRコードデータを生成
      const { generateQRData, generateQRImage, saveQRCodeToStorage } =
        await import("../../user/services/qrCodeUtils");
      const qrData = await generateQRData(uid, loginId, "staff");
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
          status: "active",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          // QRコード情報を追加
          qrCodeUrl: qrCodeUrl,
          qrExpiresAt: admin.firestore.Timestamp.fromDate(new Date(expiresAt)),
        });

      // 提案C-A: スタッフ登録時にスタッフ用リッチメニューを設定（LIFF では uid = LINE User ID）
      try {
        const { linkStaffRichMenu } = await import("../../webhook/services/lineRichMenu");
        await linkStaffRichMenu(uid);
      } catch (richMenuError) {
        // リッチメニュー更新失敗はログのみ。スタッフ登録は成功とする
        functions.logger.warn("スタッフ登録は成功しましたが、リッチメニュー更新に失敗しました", {
          uid,
          richMenuErrorMessage:
            richMenuError instanceof Error
              ? richMenuError.message
              : typeof richMenuError === "object" &&
                  richMenuError !== null &&
                  "message" in richMenuError &&
                  typeof (richMenuError as { message?: unknown }).message === "string"
                ? (richMenuError as { message: string }).message
                : String(richMenuError),
        });
      }

      logOpsSuccess({
        message: 'createStaffAccount 成功',
        functionEntry: 'createStaffAccount',
        context: { uid, loginId, fullNameKana },
      });

      return {
        success: true,
        uid,
        qrCode: qrCodeImage,
        qrCodeUrl: qrCodeUrl,
        expiresAt,
      };
    } catch (error) {
      logOpsError({
      message: 'スタッフアカウント作成エラー:',
      functionEntry: 'createStaffAccount',
      cause: error,
      context: logContext,
    });
      
      // 既にHttpsErrorの場合はそのまま再スロー
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      // その他のエラーの場合は汎用エラーメッセージ
      throw new functions.https.HttpsError("internal", "スタッフアカウントの作成に失敗しました。しばらく時間をおいて再度お試しください。");
    }
  }
);
