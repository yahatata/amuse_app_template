import * as QRCode from "qrcode";
import * as crypto from "crypto";
import * as admin from "firebase-admin";
import { QRCodeData } from "../../../shared/types";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { getBusinessSecrets } from "../../../shared/secrets/secretManager";

/**
 * QRコードの有効期限（分）
 */
const QR_EXPIRY_MINUTES = 10;

/**
 * セキュリティトークンを生成する
 * @param {string} uid Firebase UID
 * @param {string} loginId ログインID
 * @param {number} timestamp タイムスタンプ
 * @return {string} セキュリティトークン
 */
async function generateSecurityToken(
  uid: string,
  loginId: string,
  timestamp: number
): Promise<string> {
  const { qrSecretKey: secret } = await getBusinessSecrets();
  const data = `${uid}:${loginId}:${timestamp}:${secret}`;
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * QRコードデータを生成する
 * @param {string} uid Firebase UID
 * @param {string} loginId ログインID
 * @param {"user" | "staff"} type QRコードの種類
 * @return {QRCodeData} QRコードデータ
 */
export async function generateQRData(
  uid: string,
  loginId: string,
  type: "user" | "staff"
): Promise<QRCodeData> {
  const timestamp = Date.now();
  const token = await generateSecurityToken(uid, loginId, timestamp);

  return {
    uid,
    loginId,
    timestamp,
    token,
    type,
  };
}

/**
 * QRコード画像を生成する
 * @param {QRCodeData} data QRコードデータ
 * @return {Promise<string>} Base64エンコードされたQRコード画像
 */
export async function generateQRImage(data: QRCodeData): Promise<string> {
  const jsonData = JSON.stringify(data);

  const options: QRCode.QRCodeToDataURLOptions = {
    errorCorrectionLevel: "M",
    type: "image/png",
    margin: 1,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  };

  return await QRCode.toDataURL(jsonData, options);
}

/**
 * QRコード画像をFirebase Storageに保存する
 * @param {string} uid ユーザーID
 * @param {string} qrCodeImage Base64エンコードされたQRコード画像
 * @param {"user" | "staff"} type QRコードの種類
 * @return {Promise<string>} StorageのURL
 */
export async function saveQRCodeToStorage(
  uid: string,
  qrCodeImage: string,
  type: "user" | "staff"
): Promise<string> {
  try {
    console.log(`QRコードStorage保存開始: uid=${uid}, type=${type}`);

    // Base64からBufferに変換
    const base64Data = qrCodeImage.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // 古いQRコードファイルを削除
    const deletedOldFileCount = await deleteOldQRCodeFiles(uid, type);

    // Storageのファイルパスを生成
    const fileName = `qr-codes/${type}/${uid}_${Date.now()}.png`;
    console.log(`ファイルパス: ${fileName}`);

    const bucket = admin.storage().bucket();
    console.log(`Storage bucket取得: ${bucket.name}`);

    const file = bucket.file(fileName);

    // ファイルをアップロード
    console.log("ファイルアップロード開始...");
    await file.save(buffer, {
      metadata: {
        contentType: "image/png",
        metadata: {
          uid: uid,
          type: type,
          generatedAt: new Date().toISOString(),
        },
      },
    });

    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 1000 * 60 * 60 * 24 * 365, // 1年間有効
    });

    logOpsSuccess({
      message: "saveQRCodeToStorage 成功",
      functionEntry: "saveQRCodeToStorage",
      context: {
        uid,
        type,
        bufferBytes: buffer.length,
        storagePath: fileName,
        deletedOldFileCount,
      },
    });

    return url;
  } catch (error) {
    logOpsError({
      message: "QRコードStorage保存エラー",
      functionEntry: "saveQRCodeToStorage",
      cause: error,
      context: { uid, type },
    });
    const errorMessage = error instanceof Error ?
      error.message : "Unknown error";
    throw new Error(`QRコードの保存に失敗しました: ${errorMessage}`);
  }
}

/**
 * 古いQRコードファイルを削除する
 * @param {string} uid ユーザーID
 * @param {"user" | "staff"} type QRコードの種類
 */
async function deleteOldQRCodeFiles(uid: string, type: "user" | "staff"): Promise<number> {
  try {
    const bucket = admin.storage().bucket();
    const prefix = `qr-codes/${type}/${uid}_`;

    const [files] = await bucket.getFiles({ prefix });

    if (files.length > 0) {
      const deletePromises = files.map((f) => f.delete());
      await Promise.all(deletePromises);
      return files.length;
    }
    return 0;
  } catch (error) {
    logOpsError({
      message: '古いQRコードファイル削除エラー:',
      functionEntry: 'deleteOldQRCodeFiles',
      cause: error,
      context: { uid, type },
    });
    // 削除に失敗しても処理を続行
    return 0;
  }
}

/** Cloud Functions の export 名を渡し、内部失敗時の logOpsError と相関させる */
export type VerifyQRDataLogContext = {
  functionEntry: string;
  operation?: string;
};

const VERIFY_QR_INTERNAL_OPERATION = 'verifyQRDataInternal';

/**
 * QRコードデータを検証する
 * @param {string} qrDataString QRコードから読み取ったJSON文字列
 * @param logContext 呼び出し元 Callable の functionEntry（service は functionEntry から自動解決）
 * @return {boolean} 検証結果
 */
export async function verifyQRData(
  qrDataString: string,
  logContext: VerifyQRDataLogContext
): Promise<boolean> {
  let raw: unknown;
  try {
    raw = JSON.parse(qrDataString);
  } catch {
    // 不正・破損 QR で自然に起きるパース失敗はログしない
    return false;
  }

  if (typeof raw !== 'object' || raw === null) {
    return false;
  }

  const d = raw as Record<string, unknown>;
  const uid = d.uid;
  const loginId = d.loginId;
  const timestamp = d.timestamp;
  const token = d.token;
  const type = d.type;

  if (
    typeof uid !== 'string' ||
    typeof loginId !== 'string' ||
    typeof timestamp !== 'number' ||
    !Number.isFinite(timestamp) ||
    typeof token !== 'string' ||
    (type !== 'user' && type !== 'staff')
  ) {
    return false;
  }

  if (!uid || !loginId || !token) {
    return false;
  }

  const now = Date.now();
  const expiryTime = timestamp + QR_EXPIRY_MINUTES * 60 * 1000;
  if (!Number.isFinite(expiryTime) || now > expiryTime) {
    return false;
  }

  try {
    const expectedToken = await generateSecurityToken(uid, loginId, timestamp);
    if (token !== expectedToken) {
      return false;
    }
    return true;
  } catch (error) {
    logOpsError({
      message: 'QR検証中に内部処理が失敗しました',
      functionEntry: logContext.functionEntry,
      operation: logContext.operation ?? VERIFY_QR_INTERNAL_OPERATION,
      cause: error,
      context: { uid, type },
    });
    return false;
  }
}

/**
 * QRコードデータをパースする
 * @param {string} qrDataString QRコードから読み取ったJSON文字列
 * @return {QRCodeData | null} パースされたデータ
 */
export function parseQRData(qrDataString: string): QRCodeData | null {
  try {
    const data: QRCodeData = JSON.parse(qrDataString);
    return data;
  } catch (error) {
    return null;
  }
}
