# schedulerSupervisor / jobs 設定と運用確認

## 1. 設定の説明

`storeMeta/schedulerConfig` は、監視 scheduler が「どの job を、いつ、どの粒度で task 化するか」を決める設定。

主な項目:

- `schemaVersion`: スキーマバージョン
- `supervisorEnabled`: 監視 scheduler 全体の有効/無効
- `planningHorizonDays`: 先読み日数（通常 7）
- `jobs.<jobKey>.enabled`: job 単位の有効/無効
- `jobs.<jobKey>.scheduleKind`: `daily` / `weekly` / `yearly`
- `jobs.<jobKey>.runAtJst`: task 作成対象時刻（JST、`HH:mm`）
- `jobs.<jobKey>.dayOfWeek` / `month` / `dayOfMonth`: `weekly` / `yearly` の補助
- `jobs.<jobKey>.timezone`: 現行は `Asia/Tokyo` 固定

## 2. デフォルト値（実装値）

| jobKey | scheduleKind | runAtJst | 補助項目 |
|---|---|---|---|
| `weeklyPlanner` | `weekly` | `04:40` | `dayOfWeek: 4`（木） |
| `enqueueTournamentTasksByScheduler` | `daily` | `05:00` | - |
| `generateRecurringTournamentsByScheduler` | `weekly` | `04:50` | `dayOfWeek: 4`（木） |
| `scheduledCleanup` | `daily` | `05:00` | - |
| `scheduleGenerateNextYearBusinessHours` | `yearly` | `05:10` | `month: 1`, `dayOfMonth: 29` |
| `payrollNotificationScheduler` | `daily` | `05:00` | - |

補足:

- `schedulerSupervisor` 自体の実行時刻は固定で `03:00 JST`。
- `jobs.<jobKey>.runAtJst` は「その job task の plannedRunAt」を決める値。

## 3. 監視に使うログ

### 3.1 `schedulerDispatchLogs`

監視 scheduler が task 作成を試みた結果を記録する。

- 主な `eventType`: `enqueued` / `skip` / `error`
- 重要確認項目:
  - `jobKey`
  - `plannedRunAt`
  - `reason`（skip/error 時）
  - `idempotencyKey`
  - `supervisorRunId`

### 3.2 `schedulerExecutionLogsByCloudTask`

task 実行関数側の実行結果を記録する。

- 主な `eventType`: `started` / `completed` / `skip` / `error`
- 重要確認項目:
  - `jobKey`
  - `idempotencyKey`
  - `reason`（error/skip 時）
  - `decisionSnapshot`（処理件数など）

## 4. 日次の確認ポイント（最小）

1. `schedulerDispatchLogs` に当日分の `enqueued` が job ごとに出ているか
2. `schedulerExecutionLogsByCloudTask` に `started` と `completed` が対応しているか
3. `error` が出ている場合は `jobKey` と `reason` を確認し、再実行要否を判断

## 4.1 中央管理アプリとの関係

`storeMeta/schedulerConfig` は、中央管理アプリでも次のために使われる。

- `Scheduler 監視` の区分 C 判定
- queue 説明
- 設定参照 UI

そのため、`schedulerConfig` を変更したあとは、店舗側だけでなく中央管理アプリでも再同期が必要。

手順:

1. 店舗側 `storeMeta/schedulerConfig` を更新
2. 中央管理アプリ `設定 > 店舗 Config 同期` を再実行
3. `Scheduler 監視` に Config 未同期バナーが出ていないか確認

## 5. tournament 再計画（replan）確認

対象コレクション: `enqueueTournamentTasksReplanRequests`（固定 doc: `enqueueTournamentTasksByScheduler`）

見る項目:

- `isProcessing`
- `lastTriggeredAt`
- `lastCompletedAt`
- `aggregateVersion`
- `reason`

基本判断:

- 一時的に `isProcessing=true` は正常
- 長時間 `isProcessing=true` が続き、`lastCompletedAt` が進まない場合は、関連 `schedulerExecutionLogsByCloudTask` の `enqueueTournamentTasksByScheduler` を確認する

## 6. 変更時の注意

- `runAtJst` や `enabled` を変更したら、次回 `schedulerSupervisor` 実行後に dispatch/execution ログで反映確認を行う。
- `planningHorizonDays` を変更したら、中央 `Scheduler 監視` の解釈も変わるため Config 再同期を行う。
- `planningHorizonDays` は `1〜14` の範囲外を指定してもデフォルト値へ補正される。
