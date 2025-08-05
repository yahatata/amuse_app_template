import {onCall} from "firebase-functions/v2/https";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as bcrypt from "bcryptjs";
import * as QRCode from "qrcode";

export const createUserByApp = onCall(async (request) => {
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
      "already-exists", "このPokerNameは既に使用されています");
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
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    pointA: 0,
    pointB: 0,
    sideGameTip: 0,
    lastLogin: admin.firestore.FieldValue.serverTimestamp(),
    isStaying: false,
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

  return {success: true, uid, qrUrl: url};
}); 