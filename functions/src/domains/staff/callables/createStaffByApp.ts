import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getCallerDeviceByUid, isActive } from "../../../shared/devices";
import { generateQRData, generateQRImage, saveQRCodeToStorage } from "../../user/services/qrCodeUtils";

const FIXED_PASSWORD = "YourFixedPassword123";

/**
 * 店舗デバイスから新規スタッフアカウントを作成する（Auth ユーザーをサーバーで作成）。
 * クライアントで createUserWithEmailAndPassword を使わないため、呼び出し元のデバイス認証が維持される。
 */
export const createStaffByApp = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "認証が必要です");
  }

  const callerUid = request.auth.uid;
  const device = await getCallerDeviceByUid(callerUid);
  if (!device || !isActive(device.status)) {
    throw new HttpsError("permission-denied", "デバイスが見つからないか、アクティブではありません");
  }
  if (device.role !== "admin") {
    throw new HttpsError("permission-denied", "スタッフアカウントの作成には管理者権限が必要です");
  }

  const { fullName, fullNameKana, email, phoneNumber, birthMonthDay } = request.data as {
    fullName?: string;
    fullNameKana?: string;
    email?: string;
    phoneNumber?: string;
    birthMonthDay?: string;
  };

  if (!fullName?.trim() || !fullNameKana?.trim() || !email?.trim() || !phoneNumber?.trim() || !birthMonthDay?.trim()) {
    throw new HttpsError("invalid-argument", "入力情報が不足しています。全ての項目を入力してください。");
  }

  if (!/^\d{4}$/.test(birthMonthDay)) {
    throw new HttpsError("invalid-argument", "誕生日は4桁の数字（MMDD）で入力してください。");
  }

  const phoneRegExp = /^(0[5789]0\d{8}|0[1-9]\d{8,9})$/;
  if (!phoneRegExp.test(phoneNumber)) {
    throw new HttpsError("invalid-argument", "無効な電話番号形式です（ハイフンなしで10〜11桁）");
  }

  const kanaRegExp = /^[ぁ-んァ-ヶー]+$/;
  if (!kanaRegExp.test(fullNameKana)) {
    throw new HttpsError("invalid-argument", "かなはひらがなまたはカタカナで入力してください。");
  }

  const db = admin.firestore();
  const existing = await db
    .collection("staffs")
    .where("fullNameKana", "==", fullNameKana)
    .limit(1)
    .get();

  if (!existing.empty) {
    throw new HttpsError("already-exists", "このスタッフ名は既に使用されています。別のスタッフ名に変更してください。");
  }

  const loginId = fullNameKana + birthMonthDay;

  const userRecord = await admin.auth().createUser({
    email,
    password: FIXED_PASSWORD,
    displayName: fullNameKana,
  });
  const uid = userRecord.uid;

  const qrData = await generateQRData(uid, loginId, "staff");
  const qrCodeImage = await generateQRImage(qrData);
  const qrCodeUrl = await saveQRCodeToStorage(uid, qrCodeImage, "staff");

  await db.collection("staffs").doc(uid).set({
    uid,
    StaffName: fullNameKana,
    StaffFullName: fullName,
    fullName,
    fullNameKana,
    email,
    phoneNumber,
    birthMonthDay,
    loginId,
    staffRole: "staff",
    status: "active",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    qrCodeUrl,
    qrExpiresAt: admin.firestore.Timestamp.fromDate(new Date(qrData.timestamp + 10 * 60 * 1000)),
  });

  return { success: true, uid, qrUrl: qrCodeUrl };
});
