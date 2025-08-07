/**
 * Firebase Functions メインエントリーポイント
 *
 * 各機能別の関数をエクスポートします
 */

import * as admin from "firebase-admin";

// Firebase Admin SDKの初期化
admin.initializeApp();

// 認証関連関数
export * from "./auth";
// ユーザー関連関数
export * from "./user";
// メニューアイテム関連関数
export * from "./itemOrder";
export * from "./userLogIn";
