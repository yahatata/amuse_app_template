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
// シフト・営業時間関連関数（人員不足日、募集、確定、営業時間スタイル等）
export * from "./shift";
// スケジュール済みトーナメント関連関数
export * from "./callables";
// 開閉店管理関数（Phase1）
export * from "./storeManagement";
// アナリティクス関連関数
export * from "./analytics";
// クロージング処理関連関数
export * from "./close_process";
// Webhook関連関数
export * from "./webhook";
// 夜間バッチ処理関連関数
export * from "./scripts/nightlyRecalculateBalanceDue";
export * from "./scripts/nightlyReconciliationCheck";
export * from "./scripts/nightlyIntegrityCheck";
// 週次Planner（Phase5）
export * from "./scheduler/weeklyPlanner";
// 認定処理（Phase5）
export * from "./tasks/closeAssessmentTask";
export * from "./tasks/openAssessmentTask";
// トリガ関連関数
export * from "./triggers/bills.events.onCreate";
export * from "./triggers/bills.onSettle";

// トーナメント時間管理システム（Phase1）
import { onRequest } from 'firebase-functions/v2/https';
import { controlHook } from "./http/controlHook";



// HTTP関数としてエクスポート
export const controlHookHttp = onRequest(controlHook);

// リモートに存在するがローカルにない関数のスタブ（削除を防ぐため）
// 注意: この関数はリモートにのみ存在し、ローカルには実装がないため、
// デプロイ時に削除されないように一時的なスタブとして追加
import { onCall } from 'firebase-functions/v2/https';

export const lineWebhook = onRequest(async (request, response) => {
  response.status(200).json({ message: "This function is maintained remotely" });
});

export const processShiftsByStaff = onCall(async (request) => {
  return { message: "This function is maintained remotely" };
});

export const updateAdministrativeMenuWithDescription = onCall(async (request) => {
  return { message: "This function is maintained remotely" };
});

