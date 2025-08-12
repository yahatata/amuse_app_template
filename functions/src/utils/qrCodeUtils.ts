import * as QRCode from "qrcode";
import * as crypto from "crypto";
import * as admin from "firebase-admin";
import {QRCodeData} from "../types";

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
function generateSecurityToken(
  uid: string,
  loginId: string,
  timestamp: number
): string {
  const secret = process.env.QR_SECRET_KEY || "default-secret-key";
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
export function generateQRData(
  uid: string,
  loginId: string,
  type: "user" | "staff"
): QRCodeData {
  const timestamp = Date.now();
  const token = generateSecurityToken(uid, loginId, timestamp);

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

    console.log(`Buffer作成完了: サイズ=${buffer.length} bytes`);

    // 古いQRコードファイルを削除
    await deleteOldQRCodeFiles(uid, type);

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
    console.log("ファイルアップロード完了");

    // 公開URLを取得
    console.log("署名付きURL生成開始...");
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 1000 * 60 * 60 * 24 * 365, // 1年間有効
    });
    console.log(`署名付きURL生成完了: ${url}`);

    return url;
  } catch (error) {
    console.error("QRコードStorage保存エラー詳細:", {
      error: error,
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      uid: uid,
      type: type,
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
async function deleteOldQRCodeFiles(uid: string, type: "user" | "staff"): Promise<void> {
  try {
    const bucket = admin.storage().bucket();
    const prefix = `qr-codes/${type}/${uid}_`;
    
    console.log(`古いQRコードファイル削除開始: prefix=${prefix}`);
    
    const [files] = await bucket.getFiles({ prefix });
    
    if (files.length > 0) {
      console.log(`${files.length}個の古いファイルを削除します`);
      
      const deletePromises = files.map(file => file.delete());
      await Promise.all(deletePromises);
      
      console.log(`古いQRコードファイル削除完了: ${files.length}個`);
    } else {
      console.log('削除する古いファイルはありません');
    }
  } catch (error) {
    console.error('古いQRコードファイル削除エラー:', error);
    // 削除に失敗しても処理を続行
  }
}

/**
 * QRコードデータを検証する
 * @param {string} qrDataString QRコードから読み取ったJSON文字列
 * @return {boolean} 検証結果
 */
export function verifyQRData(qrDataString: string): boolean {
  try {
    const data: QRCodeData = JSON.parse(qrDataString);

    // 必須フィールドのチェック
    if (!data.uid || !data.loginId || !data.timestamp ||
        !data.token || !data.type) {
      return false;
    }

    // 有効期限のチェック
    const now = Date.now();
    const expiryTime = data.timestamp + (QR_EXPIRY_MINUTES * 60 * 1000);
    if (now > expiryTime) {
      return false;
    }

    // セキュリティトークンの検証
    const expectedToken = generateSecurityToken(
      data.uid,
      data.loginId,
      data.timestamp
    );
    if (data.token !== expectedToken) {
      return false;
    }

    return true;
  } catch (error) {
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
