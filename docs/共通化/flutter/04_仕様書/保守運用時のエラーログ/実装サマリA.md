# 実装サマリ A（第1段階：既存 `logger.error` の共通形式化）

## 0. 前回セッションについて

直前の実装作業は **途中で中断**されており、多数の `logger.error` が未置換のまま残っていました。  
本サマリ時点で **置換を完了**し、`functions` の `npm run build`（`tsc`）に **成功**しています。

※ `unused_function_lib` 内の **コメントアウトされたサンプルコード**（`nightlyIntegrityCheck` 等）には、復元用として従来の `logger.error` 文字列が **コメント内に残る**場合があります。実際にコンパイルされるコードではありません。

---

## 1. 追加した共通モジュール

| ファイル | 役割 |
|----------|------|
| `functions/src/shared/logging/logOpsError.ts` | `logOpsError` / `truncateForLog`。最終的に **`logger.error(message, payload)` を1回**呼ぶ。 |

---

## 2. `logOpsError` の最終形（概要）

### シグネチャ（概念）

- `logOpsError(args: LogOpsErrorArgs): void`
- `OpsFailureType`: `config` \| `datastore` \| `external_api` \| `business` \| `scheduled` \| `webhook` \| `internal`
- 主な引数: `message`, `failureType`, `functionEntry`, `operation?`, `projectId?`（省略時は `GCLOUD_PROJECT` 等）, `cause?`, `errorMessage?`, `errorName?`, `context?`

### `jsonPayload` に載るフィールド（代表）

| キー | 説明 |
|------|------|
| `failureType` | 粗い分類（仕様 As-is §8-3-1） |
| `functionEntry` | 原則として Cloud Functions の **エクスポート名**、repo は **関数名**で統一 |
| `operation` | 任意。同一エントリ内の区別 |
| `projectId` | ランタイムのプロジェクト ID |
| `errorMessage` / `errorName` | `cause` から正規化 |
| その他 | `context` で渡した **安全な補助フィールド**（`billId`, `runId`, `lineUserId` 等）。機微・全文 payload は載せない |

### 特記

- **`lineWebhook` の postback 失敗**: `postbackData` 全文は載せず、`postbackDataPreview`（`truncateForLog`）のみ。
- **`lineMessaging` / `lineRichMenu` の API エラー**: レスポンス本文は **`lineApiErrorPreview`（先頭 200 文字程度）** に制限。
- **`appendItemWithOrderProjection`**: スタックは **`stackPreview`（先頭 500 文字）** に制限。

---

## 3. 変更のあったコードファイル（`functions/src`）

共通ヘルパーに加え、**既存 `logger.error` があったファイル**を `logOpsError` に置換済みです（`console.error` は未変更）。

主な領域:

- `shared/config/*`, `shared/http/controlHook.ts`, `shared/firebase/callables/calculateFirestoreSize.ts`
- `domains/bills/**`（callables / repos / triggers）
- `domains/webhook/**`（`lineWebhook`, `lineMessaging`, `lineRichMenu`）
- `domains/storeMeta/**`, `domains/attendance/**`, `domains/tournament_createTournament/**`
- `domains/analytics/**`, `domains/user/**`, `domains/shift/**`
- `unused_function_lib/serverStage.ts`（`logOpsError` への置換済み）

完全な一覧は `git diff --name-only` 等で確認してください。

---

## 4. 各ファイルの変更概要

- **共通**: 各 `logger.error` 呼び出しを **`logOpsError` 1 回**に置換。ログ **行数は増やしていない**（新規のエラー行は追加していない）。
- **Bills repo/callables**: `cause` と既存の `op` / `billId` / `code` 等を `context` に整理（重複する平文 `reason` は `cause` の正規化に寄せた）。
- **LINE 系**: 外部 API・設定不備・webhook ルートを `failureType` で区分。機微・長文は載せない方針を維持。
- **給与**: `functionEntry` は `executeMonthlyPayroll`, `processStaffPayroll`, `finalizePayrollRun`, `createPayrollNotification` 等 **エクスポート名または関数名**に合わせた。
- **トーナメント enqueue**: `createScheduledTournament` / `createTournamentRecurrence` / `runGenerateRecurringTournaments` / `runEnqueueTournamentTasks` など、**呼び出し元の名前**を `functionEntry` に使用。

---

## 5. 二重ログ防止の観点

- **`migrateSettledBillsForBusinessDay`**: 内側（bill 単位 `catch` でログ → `throw`）と外側（callable の `catch`）の **2 ログ**は As-is どおり維持。構造化のみ。
- **その他**: 同一失敗で意図せず行数が増えないよう、**既存の `logger.error` 箇所と 1:1** で置換。

---

## 6. 今回の範囲外（B / C 送り）

| 区分 | 内容 |
|------|------|
| **B** | `console.error` の `logger.error` 化・形式統一 |
| **C** | `success: false` のみの経路への **新規** ログ追加 |
| **その他** | 未処理例外の全面握り直し、大規模な try/catch リファクタ |

---

## 7. 検証

- `cd functions && npm run build`（`tsc`）**成功**（2026-03-26 時点のワークスペース）。
