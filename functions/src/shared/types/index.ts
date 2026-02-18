/**
 * LINEユーザー情報の型定義
 */
export interface LineUserInfo {
  sub: string; // LINEユーザーID
  name: string; // 表示名
  picture?: string; // プロフィール画像URL
  email?: string; // メールアドレス（取得可能な場合）
}

/**
 * pokerNameチェック用のデータ型
 */
export interface CheckPokerNameData {
  pokerName: string;
}

/**
 * pokerNameチェック結果の型
 */
export interface CheckPokerNameResult {
  exists: boolean;
}

/**
 * QRコードデータの型定義
 */
export interface QRCodeData {
  uid: string; // Firebase UID
  loginId: string; // ログインID（LINE IDなど）
  timestamp: number;
  token: string;
  type: "user" | "staff";
}

/**
 * QRコード生成レスポンスの型
 */
export interface GenerateQRResponse {
  qrCode: string; // Base64エンコードされたQRコード画像
  qrCodeUrl: string; // Storageに保存されたQRコードのURL
  data: QRCodeData;
  expiresAt: number;
}

/**
 * QRコード検証レスポンスの型
 */
export interface VerifyQRResponse {
  valid: boolean;
  data?: QRCodeData;
  message: string;
}

/**
 * 入退店処理レスポンスの型
 */
export interface ProcessVisitByQRResponse {
  success: boolean;
  action: "checkin" | "checkout" | null;
  message: string;
  user?: {
    uid: string;
    loginId: string;
  };
}
