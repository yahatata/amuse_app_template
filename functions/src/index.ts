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

// 認証・ユーザー・入店（Phase4: user）
export * from "./domains/user/index";
// メニューアイテム・注文（Phase4: itemOrder）
export * from "./domains/itemOrder/index";
// トーナメント作成・スケジュール（Phase4: tournament_createTournament）
export * from "./domains/tournament_createTournament/index";
// スタッフ関連関数
export * from "./domains/staff";
// シフト関連関数
export * from "./domains/shift";
// 勤怠管理関連関数（Phase4: attendance）
export * from "./domains/attendance";
// デバイス・Firestore 等の shared 入口（旧 callables 経由分）
export * from "./shared/devices";
export * from "./shared/firebase";
// 伝票・会計（Phase4: bills）
export * from "./domains/bills";
// 開閉店管理関数（Phase2: storeMeta）
export * from "./domains/storeMeta";
// スケジュール済みトーナメント・サイドゲーム
export * from "./domains/tournament_activeTournament/index";
export * from "./domains/sideGame/index";
// アナリティクス関連関数（Phase4: analytics）
export * from "./domains/analytics";
// クロージング処理関連関数（Phase2B: domains/storeMeta に統合）
// export は domains/storeMeta 経由で行う
// Webhook関連関数（Phase4: webhook）
export * from "./domains/webhook";
// 夜間バッチ処理（analytics/scheduler に移管済み、domains/analytics 経由で export）
// 週次Planner・認定処理（Phase2: storeMeta に統合）
// export は domains/storeMeta 経由で行う
// トリガ関連（bills）は domains/bills 経由で export

// トーナメント時間管理システム（Phase1）
import { onRequest } from 'firebase-functions/v2/https';
import { controlHook } from "./shared/http/controlHook";



// HTTP関数としてエクスポート
export const controlHookHttp = onRequest(controlHook);

// リモートに存在するがローカルにない関数のスタブ（削除を防ぐため）
// 注意: この関数はリモートにのみ存在し、ローカルには実装がないため、
// デプロイ時に削除されないように一時的なスタブとして追加
import { onCall } from 'firebase-functions/v2/https';


export const processShiftsByStaff = onCall(async (request) => {
  return { message: "This function is maintained remotely" };
});

export const updateAdministrativeMenuWithDescription = onCall(async (request) => {
  return { message: "This function is maintained remotely" };
});

