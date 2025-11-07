/**
 * Firebase Functions メインエントリーポイント
 *
 * 各機能別の関数をエクスポートします
 */

// 環境変数の読み込み（開発時のみ）
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

import * as admin from "firebase-admin";

// Firebase Admin SDKの初期化
admin.initializeApp();

// 認証関連関数
export * from "./auth";
// ユーザー関連関数
export * from "./user";
// メニューアイテム関連関数
export * from "./itemOrder";
export * from "./userLogin";
export * from "./utils";
// トーナメントブラインドテンプレート関連関数
export * from "./tournamentBlind";
// トーナメントテンプレート関連関数
export * from "./tournamentTemplate";
// スタッフ関連関数
export * from "./staff";
// 勤怠管理関連関数
export * from "./attendance";
// スケジュール済みトーナメント関連関数
export * from "./callables";
// アナリティクス関連関数
export * from "./analytics";
// クロージング処理関連関数
export * from "./close_process";

// トーナメント時間管理システム（Phase1）
import { onRequest } from 'firebase-functions/v2/https';
import { controlHook } from "./http/controlHook";



// HTTP関数としてエクスポート
export const controlHookHttp = onRequest(controlHook);

