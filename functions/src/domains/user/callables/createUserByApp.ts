import {onCall} from "firebase-functions/v2/https";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as bcrypt from "bcryptjs";
import * as QRCode from "qrcode";
import { initializeUserLogs } from "../services/logUtils";
import { getCallerDeviceByUid, isActive } from "../../../shared/devices";
import { USER_TYPE_STORE_MANAGED } from "../types/userType";
import { initialZeroBalanceFields } from "../types/pointIds";

export const createUserByApp = onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "認証が必要です", {
      errorKey: "UNAUTHENTICATED",
    });
  }

  const callerUid = request.auth.uid;
  const device = await getCallerDeviceByUid(callerUid);
  if (!device || !isActive(device.status)) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "デバイスが見つからないか、アクティブではありません",
      {errorKey: "PERMISSION_DENIED"},
    );
  }
  if (device.role !== "admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "ユーザーアカウントの作成には管理者権限が必要です",
      {errorKey: "PERMISSION_DENIED"},
    );
  }

  const {pokerName, email, pin, birthMonthDay} = request.data;

  if (!pokerName || !pin || !birthMonthDay) {
    throw new functions.https.HttpsError("invalid-argument", "必要な情報が不足しています");
  }

  // pokerName重複チェック
  const existing = await admin
    .firestore()
    .collection("users")
    .where("pokerName", "==", pokerName)
    .limit(1)
    .get();

  if (!existing.empty) {
    throw new functions.https.HttpsError(
      "already-exists", "このpokerNameは既に使用されています。別のpokerNameに変更してください。");
  }

  const fixedPassword = "YourFixedPassword123";
  const loginId = `${pokerName}${birthMonthDay}`;
  const hashedPin = bcrypt.hashSync(pin, 10);

  // FirebaseAuth ユーザー作成
  const userRecord = await admin.auth().createUser({
    email,
    password: fixedPassword,
    displayName: pokerName,
  });

  const uid = userRecord.uid;

  // Firestore: ユーザーデータ作成
  await admin.firestore().collection("users").doc(uid).set({
    uid,
    pokerName,
    email,
    birthMonthDay,
    loginId,
    hashedPin,
    role: "user",
    userType: USER_TYPE_STORE_MANAGED,
    isMigrated: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...initialZeroBalanceFields(),
    currentTable: null,
    currentSeat: null,
    qrCodeUrl: "",
  });

  // QRコード生成
  const qrData = JSON.stringify({uid, loginId});
  const qrImageBuffer = await QRCode.toBuffer(qrData, {type: "png"});

  const bucket = admin.storage().bucket();
  const file = bucket.file(`qr_codes/${loginId}.png`);
  await file.save(qrImageBuffer, {
    metadata: {
      contentType: "image/png",
    },
  });

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: "2099-12-31",
  });

  await admin.firestore().collection("users").doc(uid).update({
    qrCodeUrl: url,
  });

  // ログサブコレクションを初期化
  await initializeUserLogs(uid);

  return {success: true, uid, qrUrl: url};
});
