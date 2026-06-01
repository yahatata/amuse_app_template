# Phase 5〜6 クローズ & 中央管理アプリへの引き継ぎ

作成日: 2026-06-01

---

## 1. Phase 5 の変更方針

当初 Phase 5 で予定していた「手動日次確認手順 + Logs Explorer クエリ草案」は、  
**中央管理アプリ（新規プロジェクト）で代替する**方針に変更した。

### 変更前（計画）
- Logs Explorer クエリ草案を人が毎日叩く
- 日次確認チェックリストを文書化
- `.cursor/rules/scheduler-task-reachability-logging.mdc` を更新

### 変更後（実際）
- 中央管理アプリが各店舗の scheduler/task 実行履歴を Firestore 経由で一覧表示する
- 異常検知（未完了、エラーあり）は管理アプリがシステム的に判定・通知する
- 手動日次手順は不要（管理アプリが代替）

**`.cursor/rules/scheduler-task-reachability-logging.mdc` の更新（新規 handler 追加時のチェックリスト）は残タスク**として中央管理アプリ実装の中で対応する。

---

## 2. 07+08 の完了定義の充足状況

[01_目的.md](./01_目的.md) の完了定義に照らした確認:

| 完了条件 | 状態 |
|---------|------|
| 6 つの scheduled job が完了まで動いていることの確認 | ✅ Phase 3 で PASS（[09_Phase3_実施結果.md](./09_Phase3_実施結果.md)）|
| 不要・重複・旧版 queue の整理 | ✅ Phase 0 で候補 0 件確認（[08_Phase0_実環境diff.md](./08_Phase0_実環境diff.md)）|
| ログの統一（start/success が追える状態） | ✅ Phase 4 完了（[10_Phase4_実施結果.md](./10_Phase4_実施結果.md)）|
| 検知の仕組み | 🔁 **管理アプリへ移管**（本 doc §3 参照）|
| 新規 scheduler/task 追加時のルール | 🔁 **管理アプリ実装中に rule 更新**（本 doc §3 参照）|

---

## 3. 中央管理アプリへ移管するもの

### 3-1. 機能として引き継ぐもの

| 07+08 での役割 | 管理アプリでの代替 |
|--------------|-----------------|
| 手動 Logs Explorer で scheduler 実行確認 | 管理アプリの「scheduler 履歴」画面 |
| 手動で ERROR を確認 | 管理アプリの「エラー一覧」画面（重要度フィルター付き）|
| 未完了 job を目視で検知 | 管理アプリが自動判定（start あり + success なし = 要確認）|
| 通知なし（手動確認のみ） | 管理アプリが異常検知時に通知 |

### 3-2. 中央 Firestore に保存すべきデータ

管理アプリが必要とするデータを、各店舗 Functions から **best-effort write** で中央 Firestore に書く。

#### エラーログ（`errorLogs/{storeId}/logs/{autoId}`）

| フィールド | 型 | 取得元 | 用途 |
|-----------|-----|--------|------|
| `storeId` | string | Functions env | 店舗の識別 |
| `functionEntry` | string | logOpsError args | 機能ごとのフィルタ |
| `service` | string | serviceByFunctionEntry | サービス分類 |
| `message` | string | logOpsError args | 表示用 |
| `errorKey` | string | logOpsError args | 重要度ルール適用に使う |
| `errorSource` | string | logOpsError args | 分類（business/external等）|
| `context` | object | logOpsError args | 調査用の詳細情報 |
| `severity` | string | 固定 "ERROR" | フィルタ用 |
| `occurredAt` | Timestamp | サーバー時刻 | 時系列ソート |
| `isResolved` | boolean | 初期 false | 対応済みフラグ（管理アプリで更新）|

#### Scheduler ログ（`schedulerLogs/{storeId}/runs/{autoId}`）

| フィールド | 型 | 取得元 | 用途 |
|-----------|-----|--------|------|
| `storeId` | string | Functions env | 店舗の識別 |
| `jobKey` | string | scheduler payload | job の識別 |
| `planningDate` | string | supervisor context | いつの実行か |
| `idempotencyKey` | string | scheduler payload | 重複排除・突合 |
| `plannedRunAt` | Timestamp | scheduler payload | 予定時刻（未実行検知の判定起点）|
| `eventType` | string | "start" / "success" / "error" / "skip" | 状態判定 |
| `reason` | string? | skip/error 時のみ | skip 理由・エラー内容 |
| `loggedAt` | Timestamp | サーバー時刻 | 時系列ソート |

#### Task ログ（`taskLogs/{storeId}/runs/{autoId}`）

scheduler 経由以外の代表 task handler（assessment, tournament, processPayrollNotifications 等）

| フィールド | 型 | 取得元 | 用途 |
|-----------|-----|--------|------|
| `storeId` | string | Functions env | 店舗の識別 |
| `functionEntry` | string | logOpsInfo/Success args | handler の識別 |
| `eventType` | string | "start" / "success" / "error" | 状態判定 |
| `context` | object | logOpsInfo/Success args | taskId / runId 等の突合キー |
| `loggedAt` | Timestamp | サーバー時刻 | 時系列ソート |

### 3-3. クエリパターン（管理アプリで使う）

```
// HOME: 店舗別・直近24h のエラー件数
errorLogs/{storeId}/logs
  where occurredAt >= now - 24h
  where isResolved == false

// HOME: scheduler 異常店舗の検知（plannedRunAt + grace を超えて success がない）
schedulerLogs/{storeId}/runs
  where planningDate == today
  where eventType == "start"
  → success の対応がなければ「要確認」と判定

// 店舗詳細: エラー一覧（フィルタ付き）
errorLogs/{storeId}/logs
  where occurredAt >= [指定日時]
  where functionEntry == [指定] (任意)
  orderBy occurredAt desc

// 店舗詳細: scheduler 実行履歴
schedulerLogs/{storeId}/runs
  where planningDate == [指定日]
  where jobKey == [指定] (任意)
  orderBy loggedAt desc
```

### 3-4. 各店舗 Functions 側の変更点（管理アプリ実装時に行う）

| 変更箇所 | 内容 |
|---------|------|
| `logOpsError.ts` | best-effort で中央 Firestore の `errorLogs` に write |
| `logOpsInfo` / `logOpsSuccess`（scheduler 経路） | scheduler / task log を中央 Firestore に write |
| Functions env / params | `CENTRAL_PROJECT_ID`, `CENTRAL_DB` を追加 |
| SA 権限 | 各店舗の Functions SA に中央 Firestore への write 権限を付与 |

---

## 4. 横断マトリクス更新

| 項目 | 更新後 |
|------|--------|
| `07(+08)` 運用安心度 | 中（検知は管理アプリ待ち）|
| 依存先 | `07(+08)` → 中央管理アプリ（新規プロジェクト）|

---

## 5. 新規プロジェクトについて

中央管理アプリは **このリポジトリ（amuse_app_template）とは別の新規リポジトリ**で管理する。

理由:
- 店舗向けアプリ（Flutter）と管理アプリ（Next.js）は技術スタックが異なる
- デプロイ先 Firebase プロジェクトが別（中央プロジェクト）
- 店舗テンプレートのバージョン管理と独立して進める必要がある

**新規プロジェクト名（案）**: `amuse-admin` または `amuse-central-admin`

このリポジトリの `docs/残タスク整理/` に本引き継ぎ文書を残し、  
管理アプリ側リポジトリで詳細な実装 docs を管理する。
