# Phase0A Before/After 決定メモ（タスク3 成果物）

作成日: 2026-03-04  
対象: D-01, D-12, D-13

---

## 1. 目的

Phase0A で扱う3つの対象について、次を明確にする。

- Before（現SSoT / 現状の実装）
- After（To-Be 方針）
- 変更理由
- 影響範囲
- ユーザー判断が必要な事項

---

## 2. D-01 `LINE_CHANNEL_ACCESS_TOKEN`

### Before

- `defineString("LINE_CHANNEL_ACCESS_TOKEN", { default: "<平文トークン>" })`
- 定義が2ファイルに重複:
  - `functions/src/domains/webhook/callables/lineWebhook.ts`
  - `functions/src/domains/webhook/services/lineMessaging.ts`

### After（決定）

- 共通必須:
  - 平文 default を削除
  - 未設定時はエラー扱い
- 採用:
  - default なし。**環境変数はコマンドまたはコンソールで設定し、env ファイルは使用しない**（リリース開始後は絶対に使用しない）。
- 補足:
  - 将来的に `defineSecret` + Secret Manager へ移行可能。

### なぜ

- 平文 token のソース埋め込みは漏えいリスクが高い。
- 2ファイル重複で修正漏れリスクがある。

### 影響

- `lineWebhook`（Webhook処理）
- `lineMessaging`（Push/ボタン通知）
- `sendRecruitmentNotification`（LINE通知経路）

### 決定事項

1. 環境変数の設定方法
   - [x] コマンドまたはコンソールで設定。env ファイルは使用しない（リリース開始後は絶対に使用しない）。
2. 未設定時の挙動
   - [x] 本番/ステージングは 500 エラーで即失敗
   - [x] 開発段階ではローカル用に限り .env 等を許容（詳細は `DEV_DEBUG_CONFIG_POLICY.md`）

---

## 3. D-12 `QR_SECRET_KEY`

### Before

- `process.env.QR_SECRET_KEY || "default-secret-key"`
- 定義:
  - `functions/src/domains/user/services/qrCodeUtils.ts`

### After（決定）

- 共通必須:
  - `"default-secret-key"` fallback を削除
  - 未設定時はエラー扱い
- 採用:
  - 環境変数はコマンドまたはコンソールで設定（default/fallback なし、env ファイルは使用しない）。
- 補足:
  - 将来的に `defineSecret` + Secret Manager へ移行可能。

### なぜ

- fallback があると本番未設定でも弱い鍵で動作してしまう。
- QR 署名の安全性に直結する。

### 影響

- QR 生成:
  - `generateQRCode`
  - `createUserAccount`
  - `createStaffAccount`
  - `createStaffByApp`
- QR 検証:
  - `processVisitByQR`
  - `verifyQRCode`

### 決定事項

1. 鍵ローテーション時の既存QR扱い
   - [x] 旧QRを無効化（即切替）

---

## 4. D-13 `default-store` / `default-tenant`

### Before

- 本番コードに `default-store` / `default-tenant` がハードコード
- 主な場所:
  - tournament create callable 2箇所（Zod default）
  - tournament service 2箇所（fallback）
  - Flutter 3箇所（明示引数/デフォルト引数）

### After（パターンA前提）

- 本番では default 値を禁止
- `storeId` / `tenantId` は店舗固有値を Build/Deploy で注入
- 未設定時はガード（エラー or feature flag 停止）
- default 値は開発用途のみに限定（本番経路から排除）

### なぜ

- 本番残存で店舗識別が誤ると、店舗横断誤動作を招く。
- パターンA（店舗別アプリ/店舗別プロジェクト）と不整合。

### 影響

- Functions:
  - `createScheduledTournament.ts`
  - `createTournamentRecurrence.ts`
  - `enqueueTournamentTasksCore.ts`
  - `generateRecurringTournamentsCore.ts`
- Flutter:
  - `lib/tournament/active/tournament_service.dart`
  - `create_tournament_from_calendar_page.dart`
  - `scheduled_tournament_list_page.dart`

### 要確認（ユーザー判断）

1. 本番での値注入方式
   - [x] Build 時 `--dart-define` + Deploy 時 params/env
   - [ ] Firestore `storeMeta/config.identity.*` を主参照にする
2. 開発環境の default 許容範囲
   - [x] local/emulator のみ許容
   - [ ] dev/stg でも許容
3. 未設定時挙動
   - [x] 即エラー（推奨）
   - [ ] feature flag で停止

---

## 5. タスク3時点の結論

- D-01 / D-12:
  - 環境変数はコマンドまたはコンソールで設定し、env ファイルは使用しない。default/fallback 削除は必須。
- D-13:
  - 本番 default 禁止は確定。
  - 注入経路は Build/Deploy、未設定時は本番即エラーで確定。

---

## 6. タスク4への入力（引き継ぎ）

タスク4（互換期間・ロールバック方針決定）で使用する決定値は、本ドキュメントにすべて記載済み。
