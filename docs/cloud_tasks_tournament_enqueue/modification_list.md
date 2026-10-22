# 修正が必要な項目一覧：Scheduled Tournament Cloud Tasks 投入（30日制限対応）

本ドキュメントは `spec.md` と現行実装の差分を整理し、修正・追加が必要な項目を網羅した一覧です。  
ステップ別の詳細な changeSpec 作成時の参照用です。具体実装コードは含めず、「どのファイルに何を行うか」を漏れなく記載しています。

---

## ステップ1：既存の Cloud Tasks 投入処理の廃止

### 1.1 単発作成時 Cloud Tasks 投入の削除

| 対象ファイル | 修正内容 |
|-------------|----------|
| `functions/src/domains/tournament_createTournament/callables/createScheduledTournament.ts` | トランザクション後の `enqueueStartTask` / `enqueueRegistTask` 呼び出しおよびその try-catch ブロックを削除する。import から `enqueueStartTask`, `enqueueRegistTask` を削除する。 |

### 1.2 定期作成時 Cloud Tasks 投入の削除

| 対象ファイル | 修正内容 |
|-------------|----------|
| `functions/src/domains/tournament_createTournament/callables/createTournamentRecurrence.ts` | `createScheduledTournamentFromRecurrence` 内の `enqueueStartTask` / `enqueueRegistTask` 呼び出しおよびその try-catch ブロックを削除する。import から `enqueueStartTask`, `enqueueRegistTask` を削除する。 |

### 1.3 定期生成時 Cloud Tasks 投入の削除

| 対象ファイル | 修正内容 |
|-------------|----------|
| `functions/src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts` | `createScheduledTournamentFromRecurrence` 内の `enqueueStartTask` / `enqueueRegistTask` 呼び出しおよびその try-catch ブロックを削除する。`enqueueStartTask`, `enqueueRegistTask` の import を削除する。`recurringTaskOptions`（RECURRING_TOURNAMENT_TASKS_* 取得）に関する処理を削除する。**getEnv**：tasks 投入以外で使っていないことを確認し、未使用なら `import { getEnv }` を削除する。 |

### 1.4 死コード・整理対象（changeSpec で残す/消すを決定）

| 対象 | 内容 |
|------|------|
| `functions/src/domains/tournament_createTournament/services/tasks.ts` | `enqueueStartTask`, `enqueueRegistTask` を呼ぶ箇所削除後、以下が未使用となる。**`enqueueStartTask`, `enqueueRegistTask` は Step 4 で置き換える前提で当面残す（deprecated 扱い）**。Step 4 で新 enqueue 関数を追加する際に削除し、残すことで「どっちを使うか」のブレを防ぐ。`EnqueueTaskOptions` は上記関数の型定義のため残す。`scheduleTask`, `listTasks`, `deleteTask`, `TaskKind`, `ScheduleTaskParams` は他から import されていない（死コードの可能性）。使っていないデバッグ関数（listTasks/deleteTask）を残すと「安全に公開して良いのか」「権限/監査」の論点が発生しうるため、必要なければ別途削除を検討する。 |

---

## ステップ2：scheduledTournament データモデル拡張

### 2.1 scheduledTournament ドキュメントへの管理フィールド追加

| 対象ファイル | 修正内容 |
|-------------|----------|
| `functions/src/domains/tournament_createTournament/callables/createScheduledTournament.ts` | `scheduledTournamentData` に `schedulePlanVersion: 1`, `taskSyncNeeded: true`, `taskSyncReason: ['created']`, `schedulePlanUpdatedAt`（任意）を追加する。 |
| `functions/src/domains/tournament_createTournament/callables/createTournamentRecurrence.ts` | `createScheduledTournamentFromRecurrence` 内の `scheduledTournamentData` に同上のフィールドを追加する。 |
| `functions/src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts` | `createScheduledTournamentFromRecurrence` 内の `scheduledTournamentData` に同上のフィールドを追加する。 |

### 2.2 taskIndex サブコレクションの利用

| 対象 | 修正内容 |
|------|----------|
| Firestore 構造 | `scheduledTournaments/{tournamentId}/taskIndex/{taskType}` を新規サブコレクションとして定義する。enqueue function および実行 function から読み書きする。 |
| `firestore.rules` | `scheduledTournaments/{tournamentId}/taskIndex/{taskType}` に対する read ルールを追加する（write は Functions 経由の想定で現状どおりでよいか確認）。 |

---

## ステップ3：scheduledTournament 編集処理への version/taskSync 対応

### 3.1 編集時に schedulePlanVersion と taskSyncNeeded を更新する

| 対象ファイル | 修正内容 |
|-------------|----------|
| `functions/src/domains/tournament_createTournament/callables/updateTournamentTemplate.ts` | 選択された scheduledTournaments の `snapshot` を更新する際、`schedulePlanVersion` をインクリメントし、`taskSyncNeeded: true`、`taskSyncReason`（任意）を設定する。snapshot の変更が開始/レジスト時刻に影響するかは要検討（現状 snapshot は名前・エントリー料等であり、時刻は変更しない想定）。 |
| `functions/src/domains/tournament_createTournament/callables/updateTournamentRecurrence.ts` | 選択された scheduledTournaments を更新する際（`startAt` 変更、`status: cancelled` 等）、`schedulePlanVersion` をインクリメントし、`taskSyncNeeded: true`、`taskSyncReason` を設定する。 |

### 3.2 その他 scheduledTournament を更新する処理の洗い出し

| 対象ファイル | 修正内容 |
|-------------|----------|
| `functions/src/domains/tournament_activeTournament/callables/endTournament.ts` | status を `ended` にするだけのため、本仕様の対象外と判断。必要に応じて確認。 |
| `functions/src/domains/tournament_activeTournament/callables/api.pause.ts` | 一時停止のみで、開始/レジスト時刻は変更しない。対象外。 |
| `functions/src/domains/tournament_activeTournament/callables/api.resume.ts` | 同上。対象外。 |
| `functions/src/domains/tournament_createTournament/callables/deleteTournamentRecurrence.ts` | `isArchived: true` を設定するが status は変更しない。enqueue 対象クエリで `isArchived` が false のもののみ取得するようにするか、または `status: 'cancelled'` に変更するかを changeSpec で検討する。 |
| その他 | startAt, regEndAt, plannedRegistAt 等の予定時刻を変更する Functions や API が他にないか確認し、あれば同様に `schedulePlanVersion` と `taskSyncNeeded` を更新する。 |

---

## ステップ4：enqueue 専用 function の新規作成

### 4.1 enqueue ロジックのコア実装

| 対象ファイル | 修正内容 |
|-------------|----------|
| 新規：`functions/src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts`（仮称） | 以下を実装する。（1）期間パラメータ（horizonDays=14, lookbackHours=6）に基づく対象期間の算出。（2）status='scheduled' かつ startAt が対象期間内の scheduledTournaments の取得。isArchived が true のものは除外する条件を検討（deleteTournamentRecurrence との整合）。（3）各 tournament について taskType（startTournament, closeRegistration 等）ごとに targetAt, planHash を計算。（4）taskIndex の読み取りと planHash 突合による pending/enqueued 判定。（5）enqueueState=pending かつ enqueueDueAt が 30 日以内のものについて Cloud Tasks を作成。（6）作成成功時に taskIndex を enqueued に更新、失敗時に failed と error を記録。（7）必要に応じて taskSyncNeeded=false を更新する。 |

### 4.2 enqueue 用 Cloud Tasks 投入ヘルパーの拡張・新規

| 対象ファイル | 修正内容 |
|-------------|----------|
| `functions/src/domains/tournament_createTournament/services/tasks.ts` | 新 payload 仕様（tournamentId, taskType, planVersion, planHash, scheduledAt, storeId 等）に対応したタスク投入関数を追加する。既存の `enqueueStartTask` / `enqueueRegistTask` は Step 1 で deprecated 扱いとしたため、**本ステップで置き換え・削除する**。 |

### 4.3 enqueue Callable の新規作成

| 対象ファイル | 修正内容 |
|-------------|----------|
| 新規：`functions/src/domains/tournament_createTournament/callables/enqueueTournamentTasks.ts`（仮称） | enqueueTournamentTasksCore を呼び出す Callable を定義する。手動実行および作成処理からの即時呼び出し用。 |
| `functions/src/domains/tournament_createTournament/index.ts` | 上記 Callable を export する。 |

### 4.4 enqueue Scheduler の新規作成

| 対象ファイル | 修正内容 |
|-------------|----------|
| 新規：`functions/src/domains/tournament_createTournament/scheduler/EnqueueTournamentTasksByScheduler.ts`（仮称） | 日次（JST 固定）で enqueueTournamentTasksCore を実行する onSchedule 関数を定義する。 |
| `functions/src/domains/tournament_createTournament/index.ts` | 上記 Scheduler を export する。 |
| `lib/globalConstant.dart` | enqueue Scheduler の cron 式を定数として追加する（他 Scheduler との整合性のため）。 |

### 4.5 Firestore クエリに必要なインデックス

| 対象 | 修正内容 |
|------|----------|
| `firestore.indexes.json` | status='scheduled' かつ startAt で期間フィルタするクエリに必要な複合インデックスを追加する。既存インデックスで賄えるか確認する。 |

---

## ステップ5：scheduledTournament 作成完了後の enqueue 呼び出し

### 5.1 単発作成完了後の enqueue 呼び出し

| 対象ファイル | 修正内容 |
|-------------|----------|
| `functions/src/domains/tournament_createTournament/callables/createScheduledTournament.ts` | トーナメント作成成功後、enqueue function（Callable または Core の直接呼び出し）を起動する。Cloud Tasks 投入処理を削除した箇所の代替として追加する。 |

### 5.2 定期作成完了後の enqueue 呼び出し

| 対象ファイル | 修正内容 |
|-------------|----------|
| `functions/src/domains/tournament_createTournament/callables/createTournamentRecurrence.ts` | リカレンス作成および複数 scheduledTournament 生成完了後、enqueue function を 1 回起動する。 |

### 5.3 定期生成完了後の enqueue 呼び出し

| 対象ファイル | 修正内容 |
|-------------|----------|
| `functions/src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts` | `runGenerateRecurringTournaments` 内で、全 recurrence の処理完了後に enqueue function を 1 回起動する。 |

### 5.4（任意）直近前倒し enqueue

| 対象 | 修正内容 |
|------|----------|
| 上記 5.1〜5.3 | 開始まで 1 時間未満等の条件で、enqueue function を即時呼び出すオプションを検討する。本対応は任意とする。 |

---

## ステップ6：Cloud Tasks 実行関数（controlHook）の修正

### 6.1 payload 受付仕様の変更

| 対象ファイル | 修正内容 |
|-------------|----------|
| `functions/src/shared/http/controlHook.ts` | 受付 payload を新仕様に合わせる。必須項目：`tournamentId`, `taskType`, `planVersion`, `planHash`, `scheduledAt`。`action` と `rev` は廃止または後方互換のため残すかを検討する。 |

### 6.2 no-op 判定ロジックの追加

| 対象ファイル | 修正内容 |
|-------------|----------|
| `functions/src/shared/http/controlHook.ts` | 実行前に以下を行う。（1）scheduledTournament の `schedulePlanVersion` と payload の `planVersion` を比較。（2）taskIndex（該当 taskType）の `planHash` と payload の `planHash` を比較。（3）いずれかが不一致の場合、no-op として成功終了する。 |

### 6.3 action と taskType の対応

| 対象ファイル | 修正内容 |
|-------------|----------|
| `functions/src/shared/http/controlHook.ts` | 現行の `action: 'start'` / `'regist'` を、仕様の `taskType`（startTournament, closeRegistration 等）にマッピングする。後方互換が必要な場合は両方を受け付ける。 |

### 6.4 taskIndex への実行結果反映

| 対象ファイル | 修正内容 |
|-------------|----------|
| `functions/src/shared/http/controlHook.ts` | 実行成功時に taskIndex の `enqueueState: 'executed'`, `lastRunAt`, `lastRunResult: 'success'` を更新する。no-op 時は `lastRunResult: 'noop'` を記録する。エラー時は `failed`, `error` を記録する。 |

---

## ステップ7：taskType と既存フローの対応

### 7.1 taskType の定義

| 項目 | 内容 |
|------|------|
| 対応関係 | 現行の `start` → `startTournament`、`regist` → `closeRegistration` にマッピングする。`openRegistration` は現行フローに明示的な対応がなければ、初期実装では省略するか startTournament と同一扱いとする。 |

---

## ステップ8：既存データ・オンライン移行

**※本プロジェクトでは実施しない（スキップ）**

- **理由**：リリース前アプリのため、既存 scheduledTournament は運用側で削除する。オンライン移行が不要
- **前提**：本番投入前に既存データを削除し、Step 2 以降に作成されるドキュメントのみが存在する状態で運用する
- **詳細**：`step8/changeSpec.md`、`step8/README.md` を参照

以下は他プロジェクトでオンライン移行が必要な場合の参考仕様。

### 8.1 既存 scheduledTournament（version 未設定）の扱い

| 対象 | 修正内容 |
|------|----------|
| enqueue function | **推奨（簡潔で安全）**：`schedulePlanVersion` 未設定の場合は 0 とみなす。enqueue 時に schedulePlanVersion を 1 に初期化しつつ taskIndex を作成する。バッチ移行スクリプトは不要（オンライン移行）。実装で曖昧にしないこと。 |
| `enqueueTournamentTasksCore.ts` | 対象 scheduledTournament 取得後、schedulePlanVersion が未定義の場合は 0 として扱う。taskIndex 作成・Cloud Tasks 投入を行う際に、scheduledTournament の schedulePlanVersion を 1 に更新する（オンライン移行）。 |

### 8.2 taskIndex の初回作成

| 対象 | 修正内容 |
|------|----------|
| enqueue function | taskIndex が存在しない場合は pending として新規作成する。既存トーナメントについても enqueue 実行時に taskIndex が自動作成される。8.1 と合わせて schedulePlanVersion の初期化も行う。 |

---

## ステップ9：Firestore ルール・インデックス

### 9.1 Firestore ルール

| 対象ファイル | 修正内容 |
|-------------|----------|
| `firestore.rules` | `scheduledTournaments/{tournamentId}/taskIndex/{taskType}` の read ルールを追加する。write は Cloud Functions 経由のみとする。docID は taskType（例：startTournament, closeRegistration）と一致する。 |

### 9.2 Firestore インデックス

| 対象ファイル | 修正内容 |
|-------------|----------|
| `firestore.indexes.json` | enqueue 用クエリ（status, startAt による期間フィルタ）に必要なインデックスを追加する。既存インデックスとの重複を避ける。 |

---

## ステップ10：ドキュメント・参照の更新

### 10.1 関連ドキュメント

| 対象ファイル | 修正内容 |
|-------------|----------|
| `docs/cloud_scheduler_and_tasks_summary.md` | 新 enqueue function、新 Scheduler、controlHook の payload 変更、taskIndex の説明を追記する。 |
| `docs/アプリフロー一覧_Step2_詳細フロー列挙.md`（存在する場合） | トーナメント作成〜タスク投入のフローを新仕様に合わせて更新する。 |

---

## 補足：現行実装の整理

### 現行で Cloud Tasks を投入している箇所

| ファイル | 呼び出し |
|----------|----------|
| `createScheduledTournament.ts` | enqueueStartTask, enqueueRegistTask |
| `createTournamentRecurrence.ts` | 同上（createScheduledTournamentFromRecurrence 内） |
| `generateRecurringTournamentsCore.ts` | 同上（createScheduledTournamentFromRecurrence 内） |

### 現行の controlHook の payload

- `action`: 'start' | 'regist'
- `tournamentId`: string
- `rev`: number

### 現行で scheduledTournament を更新している箇所

| ファイル | 更新内容 |
|----------|----------|
| `updateTournamentTemplate.ts` | snapshot, updatedAt |
| `updateTournamentRecurrence.ts` | startAt, status, snapshot, templateId, updatedAt |
| `controlHook.ts` | status（scheduled→running, running→registered） |
| `endTournament.ts` | status（ended） |
| `api.pause.ts` | status（paused） |
| `api.resume.ts` | status（running） |

### 仕様の registerOpenAt / registerCloseAt について

- 現行は `regEndAt`（レジスト終了）と `views/runtime` の `plannedRegistAt` を使用している。
- 仕様の `registerOpenAt`, `registerCloseAt` が現行のどのフィールドに対応するか、データモデルとの対応を changeSpec で明確にする。

---

## 既存実装確認に基づくその他の問題点

| 項目 | 内容 |
|------|------|
| controlHook の startRev / registRev | 現行は `views/runtime` の `startRev`, `registRev` で古いタスクを無視している。新仕様では `schedulePlanVersion` と `planHash` で判定する。`startRev`/`registRev` を後方互換のため残すか、段階的に廃止するかを changeSpec で検討する。 |
| キューの統一 | 現行は `createTournamentRecurrence` が TASKS_QUEUE、`generateRecurringTournamentsCore` が RECURRING_TOURNAMENT_TASKS_QUEUE を使用。新設計では日次 enqueue バッチが単一キューに投入するため、RECURRING_* 環境変数の要否を changeSpec で検討する。 |
| payload の kind vs action | `tasks.ts` の `scheduleTask` は payload に `kind` を使用。`enqueueStartTask`/`enqueueRegistTask` は `action` を使用。controlHook は `action` を受け付けている。`scheduleTask` は未使用のため死コード候補（1.4 参照）。 |
| isArchived と enqueue 対象 | `deleteTournamentRecurrence` は `isArchived: true` を設定するが `status` は変更しない。enqueue 対象クエリに `isArchived != true`（または同等条件）を追加するか、delete 時に `status: 'cancelled'` を併せて設定するかを changeSpec で決定する。 |

---

## 修正対象ファイル一覧（サマリ）

| 種別 | ファイルパス |
|------|--------------|
| 修正 | `functions/src/domains/tournament_createTournament/callables/createScheduledTournament.ts` |
| 修正 | `functions/src/domains/tournament_createTournament/callables/createTournamentRecurrence.ts` |
| 修正 | `functions/src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts` |
| 修正 | `functions/src/domains/tournament_createTournament/callables/updateTournamentTemplate.ts` |
| 修正 | `functions/src/domains/tournament_createTournament/callables/updateTournamentRecurrence.ts` |
| 修正 | `functions/src/domains/tournament_createTournament/services/tasks.ts` |
| 修正 | `functions/src/shared/http/controlHook.ts` |
| 修正 | `functions/src/domains/tournament_createTournament/index.ts` |
| 修正 | `firestore.rules` |
| 修正 | `firestore.indexes.json` |
| 修正 | `lib/globalConstant.dart` |
| 新規 | `functions/src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts`（仮称） |
| 新規 | `functions/src/domains/tournament_createTournament/callables/enqueueTournamentTasks.ts`（仮称） |
| 新規 | `functions/src/domains/tournament_createTournament/scheduler/EnqueueTournamentTasksByScheduler.ts`（仮称） |
