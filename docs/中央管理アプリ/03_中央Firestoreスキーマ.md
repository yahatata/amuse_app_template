# 03 中央 Firestore スキーマ

> **用語は README.md の定義に従う。**  
> このファイルは中央管理アプリ実装の設計図。全コレクション・フィールド・インデックス・TTL を定義する。

---

## 全コレクション一覧

| コレクション | ドキュメント ID | 書き込み元 | 読み取り元 |
|------------|--------------|-----------|----------|
| `stores` | `{storeId}` | 管理アプリ UI（手動登録）| 管理アプリ |
| `errorLogs/{storeId}/logs` | Firestore auto ID | 店舗 Functions（best-effort）| 管理アプリ |
| `schedulerLogs/{storeId}/runs` | Firestore auto ID | 店舗 Functions（best-effort）| 管理アプリ |
| `taskLogs/{storeId}/runs` | Firestore auto ID | 店舗 Functions（best-effort）| 管理アプリ |
| `importanceRules` | `{ruleId}`（管理者が付与）| 管理アプリ UI | 管理アプリ（判定ロジック）|
| `notificationTargets` | `{targetId}`（auto ID）| 管理アプリ UI | 管理アプリ（通知 Functions）|
| `adminUsers` | `{uid}`（Firebase Auth UID）| 管理アプリ初期設定 | 管理アプリ（認証 middleware）|
| `auditLogs` | Firestore auto ID | 管理アプリ（操作時自動）| 管理アプリ（監査閲覧）|

---

## 1. `stores/{storeId}`

### 目的
監視対象の店舗マスタ。中央管理アプリが参照するすべての起点。

### ドキュメント ID
`{storeId}` = Firebase Project ID（例: `amuse-app-template`）

### フィールド定義

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:----:|------|
| `storeId` | string | ✅ | Firebase Project ID と同値。ドキュメント ID の冗長コピー（クエリ用）|
| `projectId` | string | ✅ | Firebase Project ID（`storeId` と同値。明示的に持つ）|
| `displayName` | string | ✅ | 表示用の店舗名（例: 「渋谷店」「テスト店舗」）|
| `region` | string | ✅ | Functions のリージョン。原則 `asia-northeast1` |
| `enabled` | boolean | ✅ | false = 監視・通知対象外。データは書き込まれ続ける |
| `addedAt` | Timestamp | ✅ | 登録日時（サーバー時刻）|
| `updatedAt` | Timestamp | — | 最終更新日時 |
| `note` | string | — | 運用メモ（例: 「一時休業中」「テスト期間」）|
| `functionsVersion` | string | — | デプロイ済み Functions のバージョン識別子（例: `v1.2.3` or git commit hash）|

### `enabled: false` の挙動
- 店舗 Functions からの中央 Firestore への **書き込みは継続される**（Functions は `enabled` フラグを読まない）
- 管理アプリの **HOME からは除外**される（エラー件数・scheduler 健全性の集計に含めない）
- **通知は送らない**（`enabled: false` の店舗からのエラー・scheduler 異常は通知しない）
- **店舗詳細ページには手動でアクセスすれば表示可能**（過去データの閲覧は可能）

---

## 2. `errorLogs/{storeId}/logs/{autoId}`

### 目的
各店舗 Functions の `logOpsError` が出力した ERROR ログを中央 Firestore に集約する。  
重要度判定・対応管理・フィルタ表示のすべての基盤となるコレクション。

### 書き込み元
店舗 Functions の `logOpsError.ts` に追加する best-effort write（詳細は `04_店舗アプリ側変更点.md`）。

### フィールド定義

#### 必ず存在するフィールド（logOpsError の必須出力）

| フィールド | 型 | 取得元 | 重要度判定 | 説明 |
|-----------|-----|-------|:--------:|------|
| `storeId` | string | 書き込み側で付与（= `projectId`）| — | 店舗の識別子 |
| `message` | string | logOpsError の `message` 引数 | — | 運用者向け短文（例: 「closeStore 失敗」）|
| `functionEntry` | string | logOpsError の `functionEntry` 引数 | ★★★ | 関数名（例: `closeStore`, `completeAccounting`）|
| `service` | string | `serviceByFunctionEntry.ts` から解決 | ★★★ | ドメイン名（例: `accounting`, `store`, `tournament`）|
| `errorSource` | string | `resolveErrorSource` で決定 | ★★ | `'external_api'` / `'function_common'` / `'function_custom'` |
| `projectId` | string | `getRequiredProjectId()` | — | Firebase Project ID（`storeId` と同値）|
| `occurredAt` | Timestamp | 書き込み時のサーバー時刻 | — | 中央 Firestore への書き込み時刻 |

#### 条件付きで存在するフィールド

| フィールド | 型 | 存在条件 | 重要度判定 | 説明 |
|-----------|-----|---------|:--------:|------|
| `operation` | string | 同一 functionEntry に複数 logOpsError がある場合 | ★ | 処理ステップ（例: `cloudTasksCreateTask`, `loadPayrollConfig`）|
| `errorMessage` | string | cause がある場合 | — | Error.message の値 |
| `errorName` | string | cause がある場合 | — | Error の class 名（例: `FirebaseError`, `TypeError`）|
| `errorKey` | string | `errorSource === 'function_custom'` のみ | ★★★ | 業務エラーキー（例: `STORE_CLOSE_FAILED`, `ACCOUNTING_INVALID_STATE`）|
| `sourceProduct` | string | `errorSource === 'external_api'` または `'function_custom'` で外部材料あり | ★★ | 外部サービス識別（`'firestore'` / `'auth'` / `'storage'` / `'cloud_tasks'` / `'line_api'`）|
| `sdkCode` | string | 外部エラーで取得可能な場合 | ★ | SDK エラーコード（例: `NOT_FOUND`, `auth/user-not-found`, `ALREADY_EXISTS`）|
| `httpStatus` | number or string | HTTP 系エラー | ★ | HTTP ステータスコード（例: `404`, `429`, `500`）|
| `detailReason` | string | 外部エラーで取得可能な場合 | — | 詳細理由文字列 |
| `context` | object | logOpsError 呼び出し側が指定した場合 | — | 業務コンテキスト（`staffId`, `businessDate`, `billId` 等の調査用キー群）|

#### 管理アプリが付与・更新するフィールド

| フィールド | 型 | 初期値 | 説明 |
|-----------|-----|-------|------|
| `isResolved` | boolean | `false` | 対応済みフラグ（管理アプリ UI から更新）|
| `resolvedAt` | Timestamp | — | 対応済みにした日時 |
| `resolvedBy` | string | — | 対応した管理者のメールアドレス |
| `assignedTo` | string | — | 担当者のメールアドレス（対応アサイン用）|
| `memo` | string | — | 対応時のメモ・備考 |

### インデックス

| クエリ目的 | 必要なインデックス |
|---------|----------------|
| 店舗別・時系列 | `(storeId, occurredAt DESC)` ← サブコレクションなので自動 |
| 未対応のみ表示 | `(isResolved, occurredAt DESC)` |
| functionEntry フィルタ | `(functionEntry, occurredAt DESC)` |
| service フィルタ | `(service, occurredAt DESC)` |
| errorSource フィルタ | `(errorSource, occurredAt DESC)` |
| isResolved + occurredAt | `(isResolved, occurredAt DESC)` |
| 複合（service + isResolved）| `(service, isResolved, occurredAt DESC)` |

### TTL 方針
- デフォルト保持期間: **90 日**（運用が安定したら短縮可）
- Firestore TTL フィールド: `expireAt`（書き込み時に `occurredAt + 90d` で設定）
- 対応済み（`isResolved: true`）は保持期間を短縮しない（調査履歴として残す）

---

## 3. `schedulerLogs/{storeId}/runs/{autoId}`

### 目的
scheduler supervisor → dispatch → handler 完了連鎖を中央 Firestore に集約する。  
未実行検知・完了確認・日次健全性判定の基盤。

### 書き込み元
店舗 Functions の scheduler 実行経路（`logOpsInfo` / `logOpsSuccess` / `logOpsError` の共通関数に追加）。

### フィールド定義

| フィールド | 型 | 必須 | 取得元 | 説明 |
|-----------|-----|:----:|-------|------|
| `storeId` | string | ✅ | 書き込み側で付与 | 店舗の識別子 |
| `jobKey` | string | ✅ | scheduler payload | `'weeklyPlanner'` / `'scheduledCleanup'` 等 6 種（`SchedulerJobKey` 型）|
| `planningDate` | string | ✅ | supervisor context | supervisor の実行日（例: `2026-06-01`）|
| `eventType` | string | ✅ | 書き込み時のイベント種別 | `'start'` / `'success'` / `'error'` / `'skip'` |
| `idempotencyKey` | string | ✅ | scheduler payload | 重複排除・突合キー（例: `weeklyPlanner-2026-06-01T04:40:00+09:00`）|
| `plannedRunAt` | string | ✅ | scheduler payload | 実行予定時刻（ISO 8601）。**未実行検知の判定起点** |
| `supervisorRunId` | string | — | scheduler payload | supervisor 実行の識別子（dispatch log との突合用）|
| `functionEntry` | string | ✅ | 書き込み側で付与 | handler 名（例: `scheduledCleanup`, `weeklyPlanner`）|
| `reason` | string | — | skip / error 時のみ | skip 理由（例: `task_already_exists`）またはエラー内容 |
| `decisionSnapshot` | object | — | executor の出力 | 処理件数・判断状態のスナップショット（例: `{ actionsCount: 3 }`）|
| `loggedAt` | Timestamp | ✅ | 書き込み時のサーバー時刻 | 中央 Firestore への書き込み時刻 |

### `jobKey` の取りうる値（`SchedulerJobKey` 型）

```
'weeklyPlanner'
'enqueueTournamentTasksByScheduler'
'generateRecurringTournamentsByScheduler'
'scheduledCleanup'
'scheduleGenerateNextYearBusinessHours'
'payrollNotificationScheduler'
```

### `eventType` の意味

| 値 | 意味 |
|----|------|
| `'start'` | handler が到達した（処理開始）|
| `'success'` | handler が正常完了した |
| `'error'` | handler がエラーで終了した |
| `'skip'` | 仕様どおりスキップ（例: `task_already_exists`）|

### 未実行検知のための設計

- `plannedRunAt` + grace 時間（後述 `06_スケジューラー・タスク監視仕様.md`）を過ぎても  
  同一 `idempotencyKey` で `eventType: 'success'` がなければ「要確認」と判定する
- `storeId` + `jobKey` + `planningDate` + `eventType` の組み合わせで検索

### インデックス

| クエリ目的 | 必要なインデックス |
|---------|----------------|
| 日次健全性確認 | `(planningDate, jobKey, eventType)` |
| 特定 job の履歴 | `(jobKey, loggedAt DESC)` |
| 未完了検知 | `(planningDate, eventType, loggedAt DESC)` |
| storeId + planningDate | サブコレクションなので storeId は自動 |

### TTL 方針
- 保持期間: **30 日**（毎日書かれるため、長期保持は不要）
- TTL フィールド: `expireAt`（`loggedAt + 30d`）

---

## 4. `taskLogs/{storeId}/runs/{autoId}`

### 目的
scheduler 経由以外の downstream Cloud Tasks（assessment, tournament, payroll 等）の到達・完了を集約する。

### 書き込み元
店舗 Functions の downstream task handler（`openAssessmentTask`, `closeAssessmentTask`, `controlHookHttp`, `processPayrollNotifications`, `processStaffPayroll`, `finalizePayrollRun` 等）の `logOpsInfo` / `logOpsSuccess` / `logOpsError` に追加。

### フィールド定義

| フィールド | 型 | 必須 | 取得元 | 説明 |
|-----------|-----|:----:|-------|------|
| `storeId` | string | ✅ | 書き込み側で付与 | 店舗の識別子 |
| `functionEntry` | string | ✅ | handler の名称 | 例: `openAssessmentTask`, `controlHookHttp`, `processPayrollNotifications` |
| `service` | string | ✅ | `serviceByFunctionEntry` | ドメイン（例: `store`, `tournament_schedule`, `payroll`）|
| `eventType` | string | ✅ | start/success/error | `'start'` / `'success'` / `'error'` |
| `taskId` | string | — | Cloud Tasks の task ID または idempotencyKey | 突合用 |
| `context` | object | — | logOpsInfo/Success の context | 業務コンテキスト（`businessDate`, `tournamentId`, `staffId` 等）|
| `reason` | string | — | error / skip 時 | エラー内容 |
| `loggedAt` | Timestamp | ✅ | サーバー時刻 | 書き込み時刻 |

### インデックス

| クエリ目的 | 必要なインデックス |
|---------|----------------|
| handler 種別・時系列 | `(functionEntry, loggedAt DESC)` |
| eventType フィルタ | `(eventType, loggedAt DESC)` |
| エラーのみ | `(eventType, loggedAt DESC)` where `eventType == 'error'` |

### TTL 方針
- 保持期間: **30 日**
- TTL フィールド: `expireAt`（`loggedAt + 30d`）

---

## 5. `importanceRules/{ruleId}`

### 目的
エラーログに対して「検知すべきか」「どの重要度か」を判定するルールセット。  
管理アプリ UI または Firestore コンソールから随時更新できる。

**設計の核心**: このコレクションのデータを更新するだけで、全店舗への重要度フィルタが即座に変わる。  
コードを変えずに「運用が安定したら検知を絞る」ことができる。

### ドキュメント ID
管理者が付与する識別子（例: `store-close-failed`, `accounting-errors`, `external-line-5xx`）

### フィールド定義

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:----:|------|
| `ruleId` | string | ✅ | ドキュメント ID と同値（クエリ用）|
| `displayName` | string | ✅ | ルールの表示名（例: 「閉店失敗は重要度 5」）|
| `importance` | number | ✅ | `1` / `3` / `5`（5 が最重要）|
| `isActive` | boolean | ✅ | false にするとルールが無効化される |
| `conditions` | object | ✅ | マッチング条件（下記参照）|
| `description` | string | — | ルールの意図・背景の説明文 |
| `createdAt` | Timestamp | ✅ | 作成日時 |
| `updatedAt` | Timestamp | — | 更新日時 |
| `updatedBy` | string | — | 最終更新者のメールアドレス |

### `conditions` オブジェクトの構造

すべてのフィールドは **AND 条件**（複数指定した場合は全てに一致するものが対象）。  
1 フィールドを指定しなければ「条件なし（全てにマッチ）」扱い。

```typescript
conditions: {
  // 以下は全て任意。指定したものだけが AND 条件になる。

  service?: string            // 例: "accounting", "store", "tournament"
  functionEntry?: string      // 例: "closeStore", "completeAccounting"
  errorSource?: string        // "external_api" | "function_common" | "function_custom"
  errorKey?: string           // 例: "STORE_CLOSE_FAILED", "ACCOUNTING_INVALID_STATE"
  sourceProduct?: string      // "firestore" | "auth" | "storage" | "cloud_tasks" | "line_api"
  sdkCode?: string            // 例: "NOT_FOUND", "auth/user-not-found"
  httpStatus?: number | string // 例: 500, "429"
  httpStatusMin?: number       // 例: 500（httpStatus >= 500）
}
```

### 初期ルールセット（導入時に設定するもの）

導入当初は「広めに検知」する方針で以下を設定する。

| ruleId | displayName | importance | conditions |
|--------|-------------|:----------:|-----------|
| `accounting-all` | 会計ドメイン全エラー | 5 | `{ service: "accounting" }` |
| `store-all` | 店舗開閉ドメイン全エラー | 5 | `{ service: "store" }` |
| `payroll-all` | 給与ドメイン全エラー | 5 | `{ service: "payroll" }` |
| `external-all` | 外部 API エラー全般 | 3 | `{ errorSource: "external_api" }` |
| `tournament-all` | トーナメントドメイン全エラー | 3 | `{ service: "tournament" }` |
| `function-common-all` | その他全エラー | 1 | `{ errorSource: "function_common" }` |

### 重要度の定義（`エラーログ_重要度判定要件定義.md` より）

| 値 | 意味 |
|----|------|
| `5` | 主要業務の実行不能・継続不能・状態/金額不整合を残す可能性があるもの |
| `3` | 業務への支障はあるが重大な影響には直結しないもの |
| `1` | 業務影響が限定的なもの |

---

## 6. `notificationTargets/{targetId}`

### 目的
エラー検知・scheduler 異常検知時の通知先を管理する。  
管理アプリ UI から追加・削除・有効化切り替えができる。

### フィールド定義

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:----:|------|
| `targetId` | string | ✅ | ドキュメント ID と同値 |
| `displayName` | string | ✅ | 通知先の表示名（例: 「LINE 運用グループ」「エラー通知メール」）|
| `channel` | string | ✅ | `'line'` / `'email'` |
| `destination` | string | ✅ | LINE: LINE userId または groupId / email: メールアドレス |
| `enabled` | boolean | ✅ | false にすると通知しない |
| `notifyOnImportance` | number[] | ✅ | 通知する重要度の配列（例: `[3, 5]`）|
| `notifyOnSchedulerAnomaly` | boolean | ✅ | scheduler 未実行・異常検知時に通知するか |
| `filters` | object | — | 通知対象を絞るフィルタ（下記参照）|
| `createdAt` | Timestamp | ✅ | 作成日時 |
| `updatedAt` | Timestamp | — | 更新日時 |

### `filters` オブジェクト（任意）

指定なしは「全店舗・全エラーを通知対象」。

```typescript
filters?: {
  storeIds?: string[]   // 通知する店舗を絞る（空 = 全店舗）
  services?: string[]   // 通知するサービスを絞る（空 = 全て）
}
```

### デバウンス設計
同一 `(storeId, functionEntry, errorKey)` の組み合わせで **10 分以内の重複通知は送らない**。  
デバウンス用の一時記録は Firestore の別コレクション（`_notificationDebounce`）に保持し、TTL で 10 分後に自動削除する。

---

## 7. `adminUsers/{uid}`

### 目的
中央管理アプリへのアクセスを許可する管理者ユーザーの whitelist。

### フィールド定義

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:----:|------|
| `uid` | string | ✅ | Firebase Auth の UID（ドキュメント ID と同値）|
| `email` | string | ✅ | Google メールアドレス |
| `displayName` | string | — | 表示名 |
| `role` | string | ✅ | `'admin'`（将来: `'viewer'` 等も追加可）|
| `enabled` | boolean | ✅ | false にするとアクセスブロック |
| `addedAt` | Timestamp | ✅ | 登録日時 |
| `addedBy` | string | — | 登録した管理者のメール |

### 認証フロー
1. Firebase Auth でログイン（Google アカウント）
2. ログイン後、`adminUsers/{uid}` ドキュメントが存在し `enabled: true` かを確認
3. 存在しない / `enabled: false` → アクセス拒否（403 ページを表示）

---

## 8. `auditLogs/{autoId}`

### 目的
管理アプリ上での操作（対応済みフラグ付け・重要度ルール変更・通知先変更等）の操作ログ。  
「いつ誰が何をしたか」を後から確認できるようにする。

### フィールド定義

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:----:|------|
| `actorEmail` | string | ✅ | 操作した管理者のメール |
| `actorUid` | string | ✅ | Firebase Auth UID |
| `action` | string | ✅ | 操作種別（下記参照）|
| `targetType` | string | ✅ | 操作対象のコレクション名 |
| `targetId` | string | ✅ | 操作対象のドキュメント ID |
| `before` | object | — | 変更前の値 |
| `after` | object | — | 変更後の値 |
| `occurredAt` | Timestamp | ✅ | 操作日時 |

### `action` の取りうる値

| 値 | 説明 |
|----|------|
| `'resolve'` | エラーに対応済みフラグを付けた |
| `'unresolve'` | 対応済みフラグを外した |
| `'assign'` | 担当者をアサインした |
| `'memo_update'` | メモを更新した |
| `'importance_rule_create'` | 重要度ルールを追加した |
| `'importance_rule_update'` | 重要度ルールを変更した |
| `'importance_rule_delete'` | 重要度ルールを削除した |
| `'notification_target_create'` | 通知先を追加した |
| `'notification_target_update'` | 通知先を変更した |
| `'store_register'` | 店舗を登録した |
| `'store_update'` | 店舗情報を更新した |

### TTL 方針
- 保持期間: **180 日**
- TTL フィールド: `expireAt`（`occurredAt + 180d`）

---

## 9. Firestore セキュリティルール方針

```
// 中央管理アプリの Firestore ルール（概要）
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 管理者ユーザーかどうかの判定
    function isAdminUser() {
      return request.auth != null
        && exists(/databases/$(database)/documents/adminUsers/$(request.auth.uid))
        && get(/databases/$(database)/documents/adminUsers/$(request.auth.uid)).data.enabled == true;
    }

    // 店舗 Functions の SA からの書き込み（server-side SDK は IAM で制御）
    // 管理アプリ（クライアント）からは読み取りのみ許可
    match /errorLogs/{storeId}/logs/{logId} {
      allow read: if isAdminUser();
      allow write: if false; // Functions（Admin SDK + IAM）からのみ
    }

    match /schedulerLogs/{storeId}/runs/{runId} {
      allow read: if isAdminUser();
      allow write: if false;
    }

    match /taskLogs/{storeId}/runs/{runId} {
      allow read: if isAdminUser();
      allow write: if false;
    }

    // 管理者が読み書き可能なコレクション
    match /stores/{storeId} {
      allow read, write: if isAdminUser();
    }

    match /importanceRules/{ruleId} {
      allow read, write: if isAdminUser();
    }

    match /notificationTargets/{targetId} {
      allow read, write: if isAdminUser();
    }

    match /auditLogs/{logId} {
      allow read: if isAdminUser();
      allow write: if false; // 管理アプリ Functions から書き込む
    }

    match /adminUsers/{uid} {
      allow read: if isAdminUser();
      allow write: if isAdminUser(); // 管理者のみ管理者を追加できる
    }
  }
}
```

> **注意**: 上記は概要。実装時は Functions の Admin SDK からの書き込みは IAM で制御するため、  
> セキュリティルール上は `write: if false` にして Firebase クライアントからの直接書き込みを防ぐ。

---

## 10. コレクション間の関係図

```
stores/{storeId}
  ├── errorLogs/{storeId}/logs/...      ← logOpsError から best-effort write
  ├── schedulerLogs/{storeId}/runs/...  ← scheduler handler から best-effort write
  └── taskLogs/{storeId}/runs/...       ← task handler から best-effort write

importanceRules/...
  └── errorLogs の各ドキュメントに対して条件マッチングを行い重要度を算出

notificationTargets/...
  └── 重要度がマッチしたエラー・scheduler 異常の通知先

adminUsers/...
  └── 管理アプリへのログイン可否を制御

auditLogs/...
  └── 管理アプリ上の全操作を記録
```

---

## 11. データ量の試算（100 店舗）

| コレクション | 書き込み頻度 | 月間件数 | 1 件サイズ | 月間データ量 |
|------------|-----------|--------|---------|-----------|
| `errorLogs` | エラー発生時（不定）| ~1,000 件 / 月 | ~2 KB | ~2 MB |
| `schedulerLogs` | 毎日 × 6 job × start/success/skip = ~20/日 | ~60,000 件 / 月 | ~0.5 KB | ~30 MB |
| `taskLogs` | ~50 件 / 日 × 100 店舗 | ~150,000 件 / 月 | ~0.5 KB | ~75 MB |

Firestore 無料枠（1 GiB storage / 20,000 writes/day）内に十分収まる見込み。  
詳細試算は `07+08_schedulerとCloudTasks確認/` のコスト分析を参照。
