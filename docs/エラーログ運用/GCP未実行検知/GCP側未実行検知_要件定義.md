# GCP側未実行検知 要件定義

## 1. 文書の目的

本書は、Cloud Functions 内の `logOpsError` では検知できない可能性がある、以下のような異常を確認するための要件を定義する。

- 関数がそもそも起動していない
- Scheduler が予定どおり処理を呼び出していない
- Task Queue / Cloud Tasks がタスクを配送していない
- HTTP Task が関数の入口まで到達していない
- Firestore trigger が期待どおり発火していない
- 本来出るべき到達ログ・実行ログ・成功ログが出ていない

本書の主眼は、エラーとしてログに出たものを検知することではなく、**本来発生するはずの実行証跡が存在しない状態を確認できるようにすること**である。

現時点では、Cloud Monitoring アラートや管理用アプリの具体仕様は確定しない。

本書では、将来の管理用アプリや運用確認で参照できるように、以下を整理する。

- どの処理を未実行検知の対象として考えるか
- 何を handler 到達証跡とするか
- どの時刻を判定起点にするか
- どのキーで予定時刻・到達ログ・完了ログ・失敗ログを突合するか
- どの情報が現状不足しているか
- 管理用アプリ作成前に、ログ・既存記録だけでどこまで確認できるか

---

## 2. 前提

現在、関数コード内で発生した業務エラー・外部APIエラー・想定外エラーについては、原則として `logOpsError` によって検知できる状態を目指している。

そのため、本書では以下を主対象としない。

- 関数内で throw / catch されたエラー
- Firestore update / set / transaction の失敗
- 外部API呼び出し失敗
- Cloud Tasks の createTask 失敗
- 業務ロジック上の例外
- `logOpsError` として出力されるエラー

これらは、既存の `logOpsError` 監視の対象とする。

本書で扱うのは、**関数コードに到達していない、または到達した証跡がない状態**である。

---

## 3. 用語定義

### 3.1 未実行

本来起動されるべき処理について、判定起点時刻または期待タイミングを過ぎても、handler 到達証跡が確認できない状態。

例:

- `schedulerSupervisor` が予定時刻を過ぎても起動していない
- scheduled job の start ログがない
- task handler の到達ログがない

### 3.2 未配送

作成された task が、一定時間以内に handler へ配送されていない状態。

例:

- Cloud Tasks / Task Queue に古い task が残っている
- task 作成記録はあるが、handler 側の start ログがない
- retry が続いているが handler 到達証跡が確認できない

### 3.3 未到達

GCP側の呼び出しは行われたが、対象の関数コード入口まで到達していない、または到達証跡が確認できない状態。

例:

- HTTP Task が 401 / 403 / 404 / timeout で関数に届かない
- Cloud Tasks は呼び出しているが、handler側ログがない

### 3.4 到達証跡

handler に到達したことを判断するための記録。

本書では、原則として以下を第一証跡とする。

- `logOpsInfo(eventType: "start")`

### 3.5 完了証跡

handler 到達後、処理が正常完了したことを判断するための記録。

例:

- `logOpsSuccess`
- 既存の成功ログ
- Firestore の完了状態

### 3.6 失敗証跡

handler 到達後、処理中に失敗したことを判断するための記録。

例:

- `logOpsError`
- Cloud Functions / Cloud Run の error log
- Cloud Tasks の retry / failure 状態

### 3.7 判定起点時刻

未実行・未配送・未到達を判定するための起点時刻。

対象によって、以下のいずれかを採用する。

- Cloud Scheduler / onSchedule の予定実行時刻
- `plannedRunAt`
- Cloud Tasks の `scheduleTime`
- HTTP body の `scheduledAt`
- task 投入時刻
- 業務状態が特定状態に到達した時刻
- run 開始時刻
- 全 staff 完了時刻

### 3.8 猶予時間

判定起点時刻から、未実行・未配送・未到達疑いと判定するまでに許容する時間。

Cloud Tasks の配送遅延、Cloud Functions の起動遅延、処理開始までの揺れを考慮して対象ごとに定義する。

### 3.9 管理用アプリでの確認対象

未実行・未配送・未到達疑いが発生していないかを、将来実装する管理用アプリ上で確認可能にする対象。

ただし、本書では管理用アプリの具体仕様は決めない。

---

## 4. 基本方針

### 4.1 `logOpsError` と未実行検知を分ける

`logOpsError` は、関数が起動した後の失敗を検知するための仕組みである。

一方、未実行検知は、関数が起動していない、task が配送されていない、handler に到達していないなど、**関数内の失敗ログが出ない可能性がある異常**を確認するための考え方である。

### 4.2 本書では検知材料を整理する

本書の目的は、現時点で Cloud Monitoring アラートや管理用アプリの仕様を確定することではない。

本書では、将来の管理用アプリや監視設計で参照できるように、以下を整理する。

- どの処理を未実行検知の対象として考えるか
- 何を handler 到達証跡とするか
- どの時刻を判定起点にするか
- どのキーで予定時刻・到達ログ・完了ログ・失敗ログを突合するか
- どの情報が現状不足しているか

### 4.3 通知分類・表示仕様は本書では確定しない

本段階では、以下は確定しない。

- 即時通知対象
- 軽め通知対象
- 高優先度 / 中優先度 / 低優先度
- 管理用アプリの画面構成
- 管理用アプリの表示項目
- 通知文面
- Cloud Monitoring アラート条件

理由は、管理用アプリの仕様が未定であり、現時点で画面や通知の詳細を決めても後で作り直しになる可能性が高いためである。

初期方針としては、未実行・未配送・未到達疑いは原則すべて確認対象とし、実データや運用負荷を見ながら、後続で表示優先度や通知条件を検討する。

### 4.4 判定は「確定」ではなく「疑い」として扱う

`logOpsInfo(eventType: "start")` が存在しない場合でも、原因は複数考えられる。

- Scheduler が起動していない
- task が作成されていない
- task が配送されていない
- HTTP request が handler に到達していない
- handler 入口より前で失敗している
- ログ出力自体が欠落している

そのため、原則として **未実行・未配送・未到達疑い** として扱い、原因切り分けは補助確認情報を用いて行う。

---

## 5. 未実行検知対象一覧（整理版）

本書では、未実行・未配送・未到達の第一証跡として、原則 **`logOpsInfo(eventType: "start")`** を使用する。

`logOpsSuccess` は正常完了の証跡、`logOpsError` は handler 到達後の失敗証跡として扱い、未実行判定の第一証跡にはしない。

| No | 対象経路 | 起動元 | 判定起点時刻 | 未実行・未配送・未到達疑いの考え方 | 到達証跡 | 補助確認 |
|---:|---|---|---|---|---|---|
| 1 | `schedulerSupervisor` | Cloud Scheduler / onSchedule | Firebase Scheduler の cron 実行時刻。現状は `03:00 JST` | `03:00 JST + 猶予時間` を過ぎても start がない | `logOpsInfo(eventType: "start")` | Cloud Scheduler 履歴 / Logs Explorer / request log |
| 2 | `executeScheduledJobTask` | Task Queue Function | payload / execution log の `plannedRunAt` | `plannedRunAt + 猶予時間` を過ぎても start がない | `logOpsInfo(eventType: "start")` | Cloud Tasks / `schedulerDispatchLogs` / `schedulerExecutionLogsByCloudTask` |
| 3 | Cloud Tasks / Firebase Task Queue 全般 | Cloud Tasks / Task Queue | queue / task ごとの `scheduleTime` または投入時刻 | task が古いまま残る、配送されない、retry が続く | handler の `logOpsInfo(eventType: "start")` または request log | Cloud Tasks metrics / Queue 画面 |
| 4 | `openAssessmentTask` | HTTP Cloud Task | HTTP Cloud Task の `scheduleTime` または body の `scheduledAt` | `scheduleTime + 猶予時間` を過ぎても start がない | `logOpsInfo(eventType: "start")` | Cloud Tasks / request log / task body |
| 5 | `closeAssessmentTask` | HTTP Cloud Task | HTTP Cloud Task の `scheduleTime` または body の `scheduledAt` | `scheduleTime + 猶予時間` を過ぎても start がない | `logOpsInfo(eventType: "start")` | Cloud Tasks / request log / task body |
| 6 | `controlHookHttp` | HTTP Cloud Task | tournament task の Cloud Tasks `scheduleTime`。実装上は `enqueueDueAt` | `scheduleTime + 猶予時間` を過ぎても start がない | `logOpsInfo(eventType: "start")` | Cloud Tasks / request log / `taskIndex` |
| 7 | `processStaffPayroll` | Payroll staff task | 現状、task に予定時刻は保存されていない。暫定的に payroll run 起点の SLA 型で扱う | `payroll run 開始時刻 + 猶予時間` を過ぎても対象 staff の start がない | `logOpsInfo(eventType: "start")` | `payrollRuns` / `staffResults` / Task Queue |
| 8 | `finalizePayrollRun` | Payroll finalize task | 現状、task に予定時刻は保存されていない。暫定的に全 staff 完了後の SLA 型で扱う | `全 staff 処理完了時刻 + 猶予時間` を過ぎても start がない | `logOpsInfo(eventType: "start")` | `payrollRuns` / `staffResults` / Task Queue |
| 9 | `payrollNotificationScheduler` | `executeScheduledJobTask` 配下 | 親 `executeScheduledJobTask` の `plannedRunAt` | 親 `plannedRunAt + 猶予時間` を過ぎても start がない | `logOpsInfo(eventType: "start")` | `schedulerExecutionLogsByCloudTask` / 親 job log |
| 10 | `processPayrollNotifications` | Notification Task Queue | notification task の Cloud Tasks `scheduleTime`。実装上は `scheduleUtc` | `scheduleTime + 猶予時間` を過ぎても start がない | `logOpsInfo(eventType: "start")` | Cloud Tasks / 親 `payrollNotificationScheduler` log |
| 11 | `enqueueTournamentTasksByScheduler` | `executeScheduledJobTask` 配下 | 親 `executeScheduledJobTask` の `plannedRunAt` | 親 `plannedRunAt + 猶予時間` を過ぎても start がない | `logOpsInfo(eventType: "start")` | `schedulerExecutionLogsByCloudTask` / 親 job log |
| 12 | `generateRecurringTournamentsByScheduler` | `executeScheduledJobTask` 配下 | 親 `executeScheduledJobTask` の `plannedRunAt` | 親 `plannedRunAt + 猶予時間` を過ぎても start がない | `logOpsInfo(eventType: "start")` | `schedulerExecutionLogsByCloudTask` / 親 job log |
| 13 | `scheduledCleanup` | scheduled job | 既存 scheduled job の予定時刻 | 予定時刻後に実行証跡がない | 既存実行ログ / 成功ログ | Logs Explorer / schedulerExecutionLogs |
| 14 | `scheduleGenerateNextYearBusinessHours` | scheduled job | 既存 scheduled job の予定時刻 | 期限までに成功証跡がない | 既存実行ログ / 成功ログ | Logs Explorer / Firestore確認 |
| 15 | Firestore trigger 系 | Firestore trigger | 元 doc の更新時刻または期待される後続状態 | 元 doc の変更後、期待する trigger 到達証跡または後続状態がない | trigger 実行ログ / 後続状態 | Logs Explorer / Firestore状態 |

---

## 6. 判定の基本形

### 6.1 基本判定

本書における基本判定は以下とする。

```text
判定起点時刻 + 猶予時間 を過ぎても
対象 handler の logOpsInfo(eventType: "start") が存在しない
=
未実行・未配送・未到達疑い

これは「未実行確定」ではなく、一次判定としての 未実行・未配送・未到達疑い である。
```

### 6.2 start 後の扱い

`logOpsInfo(eventType: "start")` が存在する場合、その処理は少なくとも handler 入口まで到達している。

その後の結果は以下で確認する。

| 状態 | 見る証跡 |
|---|---|
| 正常完了 | `logOpsSuccess` |
| handler 到達後の失敗 | `logOpsError` |
| 実行中・早期 return・追加確認 | start はあるが success / error が確認できない状態 |

### 6.3 原因切り分け

start が存在しない場合でも、原因は複数考えられる。

- Scheduler が起動していない
- task が作成されていない
- task が配送されていない
- HTTP request が handler に到達していない
- handler 入口より前で失敗している
- ログ出力自体が欠落している

原因切り分けは、以下の補助情報を使って行う。

- Cloud Scheduler 履歴
- Cloud Tasks 状態
- request log
- Firestore 実行記録
- taskIndex
- 業務状態ドキュメント

---

## 7. 対象別の判定材料

| 対象 | 判定起点時刻 | 到達証跡 | 完了証跡 | 失敗証跡 | 主な突合キー | 補助確認 |
|---|---|---|---|---|---|---|
| `schedulerSupervisor` | Firebase Scheduler の cron 実行時刻。現状 03:00 JST | `logOpsInfo(eventType: "start")` | `logOpsSuccess` | `logOpsError` | `planningDate` | Cloud Scheduler 履歴 / request log |
| `executeScheduledJobTask` | payload / execution log の `plannedRunAt` | `logOpsInfo(eventType: "start")` | `logOpsSuccess` | `logOpsError` | `jobKey`, `idempotencyKey`, `supervisorRunId`, `plannedRunAt` | Cloud Tasks / `schedulerDispatchLogs` / `schedulerExecutionLogsByCloudTask` |
| `openAssessmentTask` | HTTP Cloud Task の `scheduleTime` または body の `scheduledAt` | `logOpsInfo(eventType: "start")` | `logOpsSuccess` | `logOpsError` | `action`, `intendedBusinessDateKey`, `idempotencyKey`, `scheduledAt` | Cloud Tasks / request log / task body |
| `closeAssessmentTask` | HTTP Cloud Task の `scheduleTime` または body の `scheduledAt` | `logOpsInfo(eventType: "start")` | `logOpsSuccess` | `logOpsError` | `intendedBusinessDateKey`, `idempotencyKey`, `scheduledAt` | Cloud Tasks / request log / task body |
| `controlHookHttp` | tournament task の Cloud Tasks `scheduleTime`。実装上は `enqueueDueAt` | `logOpsInfo(eventType: "start")` | `logOpsSuccess` | `logOpsError` | 新: `tournamentId`, `taskType`, `planVersion`, `planHash` / 旧: `action`, `tournamentId`, `rev` | Cloud Tasks / request log / taskIndex |
| `processStaffPayroll` | 現状 task 単位の予定時刻なし。暫定的に payroll run 開始時刻 | `logOpsInfo(eventType: "start")` | `logOpsSuccess` | `logOpsError` | `runId`, `staffId`, `paymentPeriodKey` | payrollRuns, staffResults, Task Queue |
| `finalizePayrollRun` | 現状 task 単位の予定時刻なし。暫定的に全 staff 完了時刻 / finalize 可能状態到達時刻 | `logOpsInfo(eventType: "start")` | `logOpsSuccess` | `logOpsError` | `runId`, `paymentPeriodKey` | payrollRuns, staffResults, Task Queue |
| `payrollNotificationScheduler` | 親 `executeScheduledJobTask` の `plannedRunAt` | `logOpsInfo(eventType: "start")` | `logOpsSuccess` | `logOpsError` | `targetDate`, 親 jobKey, 親 idempotencyKey | `schedulerExecutionLogsByCloudTask` / 親 job log |
| `processPayrollNotifications` | notification task の Cloud Tasks `scheduleTime`。実装上は `scheduleUtc` | `logOpsInfo(eventType: "start")` | 既存 logger.info / 後続で logOpsSuccess 化検討 | `logOpsError` | `todayStr`, `targetDate`, notification task id | Cloud Tasks / 親 payrollNotificationScheduler log |
| `enqueueTournamentTasksByScheduler` | 親 `executeScheduledJobTask` の `plannedRunAt` | `logOpsInfo(eventType: "start")` | `logOpsSuccess` | `logOpsError` | `rangeStartAt`, `rangeEndAt`, 親 jobKey, 親 idempotencyKey | `schedulerExecutionLogsByCloudTask` / 親 job log |
| `generateRecurringTournamentsByScheduler` | 親 `executeScheduledJobTask` の `plannedRunAt` | `logOpsInfo(eventType: "start")` | `logOpsSuccess` | `logOpsError` | `evaluationDate`, `windowEndDate`, 親 jobKey, 親 idempotencyKey | `schedulerExecutionLogsByCloudTask` / 親 job log |

---

## 8. 後続検討対象

### 8.1 Firestore trigger 未発火

Firestore trigger は、コードに到達すれば `logOpsError` で検知できるが、trigger 自体が発火していない場合は関数内ログが出ない。

ただし、Firestore trigger 未発火の検知は、GCP側ログだけでなく、元docと期待される後続状態の差分確認が必要になる。

そのため、本書では後続検討対象とする。

対象例:

- billsOnSettle
- billsEventsOnCreate
- attendanceOnWrite
- enqueueTournamentTasksReplanOnWrite

### 8.2 Firestore状態監視

以下は未実行検知というより、業務状態の stuck 検知として扱う。

- payrollRuns が running / dispatching / finalizing のまま
- staffResults が pending / processing のまま
- scheduledTournaments/{id}/taskIndex.enqueueState == failed のまま
- closeRuns が running / failed のまま
- 必要な analytics marker が作られていない

これらは別文書で、Firestore状態監視として定義する。

---

## 9. 確認方法の使い分け

| 確認方法 | 用途 | 備考 |
|---|---|---|
| Logs Explorer | 個別ログの調査 | start / success / error の確認に使う |
| Cloud Tasks / Task Queue 画面 | queue 滞留、retry、古い task の確認 | task 単位の配送状況確認に使う |
| Cloud Scheduler 履歴 | Scheduler 自体が起動したかの確認 | schedulerSupervisor などに使う |
| Firestore execution logs | scheduled job の実行確認 | schedulerDispatchLogs, schedulerExecutionLogsByCloudTask など |
| Firestore 業務状態 | stuck 状態・後続状態の確認 | payrollRuns, staffResults, taskIndex など |
| 将来の管理用アプリ | 未実行・未配送・未到達疑いの一覧確認 | 本書では仕様を確定しない |
| Cloud Monitoring / Log-based alert | 将来的な通知候補 | 本書では具体設定しない |

---

## 10. 将来の管理用アプリに向けた軽い方針

### 10.1 本書で決めること

本書では、将来の管理用アプリで未実行・未配送・未到達疑いを扱えるようにするため、以下を整理する。

- 対象処理
- 判定起点時刻
- 到達証跡
- 完了証跡
- 失敗証跡
- 主な突合キー
- 補助確認情報

### 10.2 本書で決めないこと

以下は、管理用アプリの設計時に改めて決める。

- 管理用アプリの画面構成
- 一覧に出す項目
- 詳細画面の表示内容
- 表示優先度
- 絞り込み条件
- 通知条件
- 通知文面
- どの情報を中央監視プロジェクト側に集約するか

### 10.3 初期方針

初期方針としては、エラーおよび未実行疑いは原則すべて確認対象とする。

実際の運用データを見た上で、後続で表示優先度・通知条件・管理用アプリ上の見せ方を決める。

---

## 11. 管理用アプリ作成前のログ確認方針

### 11.1 目的

将来の管理用アプリを作成する前でも、運用者が Logs Explorer / Firestore 記録 / Cloud Tasks / Cloud Scheduler から、未実行・未配送・未到達疑いを確認できる状態にする。

そのため、本段階では少なくとも以下の2つを突き合わせられることを目指す。

| 種別 | 内容 |
|---|---|
| 判定起点時刻 | 本来その処理が開始される予定だった時刻、または監視上の起点時刻 |
| 実際の開始時刻 | `logOpsInfo(eventType: "start")` が出力された時刻 |

### 11.2 実際の開始時刻

実際の開始時刻は、対象 handler に追加した `logOpsInfo(eventType: "start")` のログ時刻を使用する。

このログは、handler に到達したことを示す到達証跡であり、正常完了を意味しない。

### 11.3 判定起点時刻の確認場所

対象ごとに、判定起点時刻は以下のいずれかから確認する。

| 対象 | 判定起点時刻 | 確認場所 |
|---|---|---|
| `schedulerSupervisor` | cron 実行時刻。現状 03:00 JST | Cloud Scheduler 履歴 / schedule定義 |
| `executeScheduledJobTask` | `plannedRunAt` | payload / `schedulerDispatchLogs` / `schedulerExecutionLogsByCloudTask` |
| `payrollNotificationScheduler` | 親 `executeScheduledJobTask` の `plannedRunAt` | 親 job の payload / scheduler execution log |
| `enqueueTournamentTasksByScheduler` | 親 `executeScheduledJobTask` の `plannedRunAt` | 親 job の payload / scheduler execution log |
| `generateRecurringTournamentsByScheduler` | 親 `executeScheduledJobTask` の `plannedRunAt` | 親 job の payload / scheduler execution log |
| `openAssessmentTask` | Cloud Tasks `scheduleTime` または body `scheduledAt` | Cloud Tasks / HTTP body / task作成記録 |
| `closeAssessmentTask` | Cloud Tasks `scheduleTime` または body `scheduledAt` | Cloud Tasks / HTTP body / task作成記録 |
| `controlHookHttp` | Cloud Tasks `scheduleTime`。実装上は `enqueueDueAt` | Cloud Tasks / taskIndex.enqueueDueAt / HTTP body scheduledAt |
| `processPayrollNotifications` | Cloud Tasks `scheduleTime`。実装上は `scheduleUtc` | Cloud Tasks / notification task 作成記録 |
| `processStaffPayroll` | 現状、task単位の予定時刻は保存されていない | payrollRuns.startedAt 等を暫定起点にする |
| `finalizePayrollRun` | 現状、task単位の予定時刻は保存されていない | 全 staff 完了時刻 / finalize可能状態を暫定起点にする |

### 11.4 現状不足している対象

以下の対象は、現状のログ・payload・enqueueオプションに task 単位の予定時刻が明示保存されていない。

- `processStaffPayroll`
- `finalizePayrollRun`

この2件は、管理用アプリ作成前にログ・記録だけで精度高く未実行判定するには材料が不足している。

ただし、今回はこのまま運用する。

そのため、当面は以下の暫定起点で確認する。

| 対象 | 暫定起点 |
|---|---|
| `processStaffPayroll` | payrollRuns.startedAt または run 開始を示す時刻 |
| `finalizePayrollRun` | 全 staff 完了時刻、または finalize 可能状態になった時刻 |

後続で精度を上げる場合は、task 投入時に以下のような監視用時刻を payload または Firestore に保存することを検討する。

- enqueuedAt
- expectedStartBy
- deadlineAt

ただし、この追加実装は現時点では行わない。

### 11.5 管理用アプリ作成前の確認方法

管理用アプリ作成前は、以下を手動で突き合わせる。

```text
判定起点時刻 + 猶予時間
  を過ぎている

かつ

対象 handler の logOpsInfo(eventType: "start")
  が存在しない

=

未実行・未配送・未到達疑い
```

start が存在する場合は、handler には到達しているため、以降は `logOpsSuccess` または `logOpsError` を確認する。

---

## 12. 予定時刻の定義

### 12.1 基本方針

未実行判定における「予定時刻」または「判定起点時刻」は、対象ごとに異なる。

大きく以下に分類する。

| 分類 | 判定起点時刻 |
|---|---|
| Scheduler 直起動系 | Cloud Scheduler / onSchedule の予定実行時刻 |
| scheduled job 共通実行口 | payload / execution log の plannedRunAt |
| scheduled job 配下の同期処理 | 親 executeScheduledJobTask の plannedRunAt |
| HTTP Cloud Task / Task Queue 系 | Cloud Tasks の scheduleTime または payload の scheduledAt |
| タスクに予定時刻が保存されていない処理 | run 状態や業務状態を基準に別途 SLA 定義 |

### 12.2 対象別の採用予定時刻

| 対象 | 採用する判定起点時刻 | 補助キー・補助確認 | 備考 |
|---|---|---|---|
| schedulerSupervisor | Firebase Scheduler の cron 実行時刻。現状は 03:00 JST | planningDate, Cloud Scheduler 履歴, Logs Explorer | planningDate は日付キーであり、予定実行時刻そのものではない |
| executeScheduledJobTask | payload / execution log の plannedRunAt | jobKey, idempotencyKey, supervisorRunId, Cloud Tasks scheduleTime, schedulerDispatchLogs, schedulerExecutionLogsByCloudTask | 通常経路では plannedRunAt と Cloud Tasks scheduleTime は同一意図。replan 経路は別扱い |
| payrollNotificationScheduler | 親 executeScheduledJobTask の plannedRunAt | targetDate, 親 jobKey, 親 idempotencyKey | onSchedule 直起動ではなく、scheduled job 配下の処理として扱う |
| enqueueTournamentTasksByScheduler | 親 executeScheduledJobTask の plannedRunAt | rangeStartAt, rangeEndAt, 親 jobKey, 親 idempotencyKey | onSchedule 直起動ではなく、scheduled job 配下の処理として扱う |
| generateRecurringTournamentsByScheduler | 親 executeScheduledJobTask の plannedRunAt | evaluationDate, windowEndDate, 親 jobKey, 親 idempotencyKey | onSchedule 直起動ではなく、scheduled job 配下の処理として扱う |
| openAssessmentTask | HTTP Cloud Task の scheduleTime または body の scheduledAt | intendedBusinessDateKey, idempotencyKey, task name, request log | intendedBusinessDateKey は予定時刻ではなく対象営業日キー |
| closeAssessmentTask | HTTP Cloud Task の scheduleTime または body の scheduledAt | intendedBusinessDateKey, idempotencyKey, task name, request log | intendedBusinessDateKey は予定時刻ではなく対象営業日キー |
| controlHookHttp | tournament task の Cloud Tasks scheduleTime。実装上は enqueueDueAt | tournamentId, taskType, planVersion, planHash, taskIndex.enqueueDueAt, taskIndex.taskName | 新 payload / 旧 payload で突合キーが異なる |
| processPayrollNotifications | notification task の Cloud Tasks scheduleTime。実装上は scheduleUtc | targetDate, todayStr, enqueue task id | 親 payrollNotificationScheduler の plannedRunAt とは別の時刻軸 |
| processStaffPayroll | 現状、task に予定時刻は保存されていない | runId, staffId, paymentPeriodKey, payrollRuns.startedAt, staffResults.taskStartedAt | 「予定時刻 + 猶予時間」型ではなく、run 起点の SLA 型として定義する |
| finalizePayrollRun | 現状、task に予定時刻は保存されていない | runId, paymentPeriodKey, payrollRuns, staff 完了状態 | 「予定時刻 + 猶予時間」型ではなく、全 staff 完了後の SLA 型として定義する |

### 12.3 既存認識からの修正点

以下の 3 件は、当初は Scheduler 直起動系として扱っていたが、実コード上は executeScheduledJobTask から実行される scheduled job 配下の処理として扱う。

- payrollNotificationScheduler
- enqueueTournamentTasksByScheduler
- generateRecurringTournamentsByScheduler

そのため、未実行判定の予定時刻は onSchedule の時刻ではなく、親 executeScheduledJobTask の plannedRunAt を採用する。

### 12.4 予定時刻が未保存の対象

以下 2 件は、Cloud Tasks / Task Queue の enqueue 時に scheduleTime / scheduleDelaySeconds が指定されておらず、payload にも予定時刻が含まれていない。

- processStaffPayroll
- finalizePayrollRun

そのため、他の対象と同じく「予定時刻 + 猶予時間」を直接適用することはできない。

この 2 件は、以下のように SLA 型の未実行定義を別途置く。

| 対象 | 暫定定義 |
|---|---|
| processStaffPayroll | payroll run 開始後、一定時間以内に対象 staff の logOpsInfo(start) がない場合、staff payroll 未実行疑い |
| finalizePayrollRun | 全 staff 処理が完了した後、一定時間以内に finalizePayrollRun の logOpsInfo(start) がない場合、finalize 未実行疑い |

より精度を上げる場合は、別 ChangeSpec で以下を検討する。

- staff task 投入時に expectedStartBy / enqueuedAt / deadlineAt を payload または Firestore に保存する
- finalize task 投入時に expectedStartBy / enqueuedAt / deadlineAt を payload または Firestore に保存する
- staffResults や payrollRuns に監視用の期待時刻を追加する

ただし、今回は追加実装せず、このまま運用する。

---

## 13. 対象別の未実行定義

### 13.1 schedulerSupervisor

**採用する判定起点時刻**

Firebase Scheduler の cron 実行時刻を採用する。

現状は以下とする。

- 03:00 JST

**未実行疑いの定義**

```text
03:00 JST + 猶予時間 を過ぎても
schedulerSupervisor の logOpsInfo(eventType: "start") が存在しない
=
schedulerSupervisor 未実行疑い
```

**主な確認キー**

- functionEntry = schedulerSupervisor
- eventType = start
- planningDate

**補助確認**

- Cloud Scheduler 実行履歴
- Logs Explorer
- Cloud Functions / Cloud Run request log

### 13.2 executeScheduledJobTask

**採用する判定起点時刻**

payload / execution log の `plannedRunAt` を採用する。

通常経路では、`plannedRunAt` は Cloud Tasks の `scheduleTime` と同一意図で設定される。

**未実行疑いの定義**

```text
plannedRunAt + 猶予時間 を過ぎても
executeScheduledJobTask の logOpsInfo(eventType: "start") が存在しない
=
scheduled job task 未実行・未配送・未到達疑い
```

**主な確認キー**

- functionEntry = executeScheduledJobTask
- eventType = start
- jobKey
- idempotencyKey
- supervisorRunId
- plannedRunAt

**補助確認**

- Cloud Tasks scheduleTime
- schedulerDispatchLogs
- schedulerExecutionLogsByCloudTask

**注意点**

replan 経路では `scheduleDelaySeconds` が使われるため、通常経路の `plannedRunAt` 判定とは分けて扱う。

### 13.3 payrollNotificationScheduler

**採用する判定起点時刻**

親 `executeScheduledJobTask` の `plannedRunAt` を採用する。

**未実行疑いの定義**

```text
親 scheduled job の plannedRunAt + 猶予時間 を過ぎても
payrollNotificationScheduler の logOpsInfo(eventType: "start") が存在しない
=
payrollNotificationScheduler 未実行疑い
```

**主な確認キー**

- functionEntry = payrollNotificationScheduler
- eventType = start
- targetDate
- 親 jobKey
- 親 idempotencyKey

**補助確認**

- executeScheduledJobTask の start
- schedulerExecutionLogsByCloudTask
- 親 payload の plannedRunAt

**注意点**

payrollNotificationScheduler の未実行判定と、後続の processPayrollNotifications の未実行判定は分ける。

payrollNotificationScheduler の plannedRunAt は「通知 task を作成する親ジョブの予定時刻」であり、通知 task 自体の実行予定時刻ではない。

### 13.4 processPayrollNotifications

**採用する判定起点時刻**

notification task の Cloud Tasks `scheduleTime` を採用する。

実装上は、`payrollNotificationScheduler` が算出する `scheduleUtc` に相当する。

**未実行疑いの定義**

```text
notification task の scheduleTime + 猶予時間 を過ぎても
processPayrollNotifications の logOpsInfo(eventType: "start") が存在しない
=
processPayrollNotifications 未配送・未到達疑い
```

**主な確認キー**

- functionEntry = processPayrollNotifications
- eventType = start
- todayStr
- targetDate
- notification task id

**補助確認**

- Cloud Tasks queue
- enqueue task id
- 親 payrollNotificationScheduler のログ

**注意点**

todayStr は payload の targetDate がない場合、実行時 JST の今日にフォールバックするため、予定時刻そのものではなく処理対象日として扱う。

### 13.5 enqueueTournamentTasksByScheduler

**採用する判定起点時刻**

親 `executeScheduledJobTask` の `plannedRunAt` を採用する。

**未実行疑いの定義**

```text
親 scheduled job の plannedRunAt + 猶予時間 を過ぎても
enqueueTournamentTasksByScheduler の logOpsInfo(eventType: "start") が存在しない
=
tournament enqueue job 未実行疑い
```

**主な確認キー**

- functionEntry = enqueueTournamentTasksByScheduler
- eventType = start
- rangeStartAt
- rangeEndAt
- 親 jobKey
- 親 idempotencyKey

**補助確認**

- executeScheduledJobTask の start
- schedulerExecutionLogsByCloudTask
- 親 payload の plannedRunAt

### 13.6 generateRecurringTournamentsByScheduler

**採用する判定起点時刻**

親 `executeScheduledJobTask` の `plannedRunAt` を採用する。

**未実行疑いの定義**

```text
親 scheduled job の plannedRunAt + 猶予時間 を過ぎても
generateRecurringTournamentsByScheduler の logOpsInfo(eventType: "start") が存在しない
=
定期トーナメント生成 job 未実行疑い
```

**主な確認キー**

- functionEntry = generateRecurringTournamentsByScheduler
- eventType = start
- evaluationDate
- windowEndDate
- 親 jobKey
- 親 idempotencyKey

**補助確認**

- executeScheduledJobTask の start
- schedulerExecutionLogsByCloudTask
- 親 payload の plannedRunAt

### 13.7 openAssessmentTask

**採用する判定起点時刻**

HTTP Cloud Task の `scheduleTime`、または HTTP body の `scheduledAt` を採用する。

**未実行疑いの定義**

```text
open assessment task の scheduleTime + 猶予時間 を過ぎても
openAssessmentTask の logOpsInfo(eventType: "start") が存在しない
=
openAssessmentTask 未配送・未到達疑い
```

**主な確認キー**

- functionEntry = openAssessmentTask
- eventType = start
- action
- intendedBusinessDateKey
- idempotencyKey
- scheduledAt

**補助確認**

- Cloud Tasks queue
- HTTP body scheduledAt
- task name
- request log

**注意点**

intendedBusinessDateKey は対象営業日キーであり、予定時刻そのものではない。

また、openAssessmentTask は weeklyPlanner 以外の経路からも作成される可能性があるため、経路ごとの task id / payload / scheduledAt の突合ルールを確認対象とする。

### 13.8 closeAssessmentTask

**採用する判定起点時刻**

HTTP Cloud Task の `scheduleTime`、または HTTP body の `scheduledAt` を採用する。

**未実行疑いの定義**

```text
close assessment task の scheduleTime + 猶予時間 を過ぎても
closeAssessmentTask の logOpsInfo(eventType: "start") が存在しない
=
closeAssessmentTask 未配送・未到達疑い
```

**主な確認キー**

- functionEntry = closeAssessmentTask
- eventType = start
- intendedBusinessDateKey
- idempotencyKey
- scheduledAt

**補助確認**

- Cloud Tasks queue
- HTTP body scheduledAt
- task name
- request log

**注意点**

intendedBusinessDateKey は対象営業日キーであり、予定時刻そのものではない。

また、closeAssessmentTask は weeklyPlanner 以外の経路からも作成される可能性があるため、経路ごとの task id / payload / scheduledAt の突合ルールを確認対象とする。

### 13.9 controlHookHttp

**採用する判定起点時刻**

tournament task の Cloud Tasks `scheduleTime` を採用する。

実装上は、`enqueueDueAt` と対応する。

**未実行疑いの定義**

```text
tournament task の scheduleTime + 猶予時間 を過ぎても
controlHookHttp の logOpsInfo(eventType: "start") が存在しない
=
controlHookHttp 未配送・未到達疑い
```

**主な確認キー**

新 payload の場合:

- functionEntry = controlHookHttp
- eventType = start
- tournamentId
- taskType
- planVersion
- planHash

旧 payload の場合:

- functionEntry = controlHookHttp
- eventType = start
- action
- tournamentId
- rev

**補助確認**

- Cloud Tasks queue
- HTTP body scheduledAt
- taskIndex.enqueueDueAt
- taskIndex.targetAt
- taskIndex.planHash
- taskIndex.taskName
- request log

**注意点**

新 payload と旧 payload で context のキーが異なるため、Logs Explorer ではまず functionEntry = controlHookHttp と eventType = start で横断し、その後 payload 種別に応じて taskType / planHash または action / rev を見る。

### 13.10 processStaffPayroll

**採用する判定起点時刻**

現状、task payload や enqueue オプションに staff 単位 task の予定時刻は保存されていない。

そのため、本対象は通常の「予定時刻 + 猶予時間」型ではなく、run 起点の SLA 型として扱う。

**暫定の未実行疑いの定義**

```text
payroll run 開始時刻 + 猶予時間 を過ぎても
対象 staff の processStaffPayroll logOpsInfo(eventType: "start") が存在しない
=
staff payroll task 未実行・未配送・未到達疑い
```

**主な確認キー**

- functionEntry = processStaffPayroll
- eventType = start
- runId
- staffId
- paymentPeriodKey

**補助確認**

- payrollRuns.startedAt
- staffResults.taskStartedAt
- staffResults.taskFinishedAt
- staffResults.status
- Task Queue 状態

**注意点**

この定義は暫定である。

より厳密にする場合は、staff task 投入時に enqueuedAt / expectedStartBy / deadlineAt などの監視用時刻を payload または Firestore に保存する必要がある。

ただし、今回は追加実装せず、このまま運用する。

### 13.11 finalizePayrollRun

**採用する判定起点時刻**

現状、finalize task の payload や enqueue オプションに予定時刻は保存されていない。

また、finalize は全 staff 処理完了後に enqueue される依存関係型の処理である。

そのため、本対象も通常の「予定時刻 + 猶予時間」型ではなく、run / staff 完了状態を起点にした SLA 型として扱う。

**暫定の未実行疑いの定義**

```text
全 staff 処理完了時刻 + 猶予時間 を過ぎても
finalizePayrollRun の logOpsInfo(eventType: "start") が存在しない
=
finalizePayrollRun 未実行・未配送・未到達疑い
```

**主な確認キー**

- functionEntry = finalizePayrollRun
- eventType = start
- runId
- paymentPeriodKey

**補助確認**

- payrollRuns.status
- completedStaffCount
- targetStaffCount
- staffResults
- Task Queue 状態

**注意点**

全 staff 処理完了時刻をどのフィールドから安定して取るかは、別途確認が必要である。

より厳密にする場合は、finalize task 投入時に enqueuedAt / expectedStartBy / deadlineAt などの監視用時刻を payload または Firestore に保存する必要がある。

ただし、今回は追加実装せず、このまま運用する。

---

## 14. 未実行判定の分類

未実行判定は、対象ごとに以下の分類で扱う。

| 分類 | 対象 | 判定方法 |
|---|---|---|
| Scheduler cron 型 | schedulerSupervisor | cron 予定時刻 + 猶予時間後に logOpsInfo(start) がない |
| scheduled job plannedRunAt 型 | executeScheduledJobTask | plannedRunAt + 猶予時間後に logOpsInfo(start) がない |
| scheduled job 配下処理型 | payrollNotificationScheduler, enqueueTournamentTasksByScheduler, generateRecurringTournamentsByScheduler | 親 executeScheduledJobTask.plannedRunAt + 猶予時間後に各 handler の logOpsInfo(start) がない |
| Cloud Tasks scheduleTime 型 | openAssessmentTask, closeAssessmentTask, controlHookHttp, processPayrollNotifications | Cloud Tasks scheduleTime または body scheduledAt + 猶予時間後に logOpsInfo(start) がない |
| SLA 型 | processStaffPayroll, finalizePayrollRun | run 状態・staff 完了状態を起点に定義した期待時刻 + 猶予時間後に logOpsInfo(start) がない |

---

## 15. 追加設計が必要な対象

以下は、未実行判定に必要な予定時刻または突合キーが不十分であるため、後続の ChangeSpec 候補とする。

ただし、今回は追加実装せず、現状の材料で運用する。

| 対象 | 不足している情報 | 影響 | 後続の追加実装候補 |
|---|---|---|---|
| processStaffPayroll | staff task の計画実行時刻、投入時刻、期待開始時刻 | 「予定時刻 + 猶予時間」で機械判定しづらい | task 投入時に enqueuedAt / expectedStartBy / deadlineAt を payload または Firestore に保存 |
| finalizePayrollRun | finalize task の計画実行時刻、投入時刻、期待開始時刻 | finalize 未実行の基準時刻が曖昧 | finalize task 投入時に enqueuedAt / expectedStartBy / deadlineAt を payload または Firestore に保存 |
| openAssessmentTask / closeAssessmentTask | weeklyPlanner 以外の経路で task id / payload / scheduledAt の統一度が低い | 経路ごとに突合ルールが変わる | 全経路で共通の相関 ID / scheduledAt / taskName を揃える |
| schedulerSupervisor | start には supervisorRunId が載っていない | start と後続 dispatch / success の突合が弱い | supervisorRunId を handler 先頭で生成できるか検討 |
| executeScheduledJobTask replan 経路 | plannedRunAt と実際の delay dispatch の関係 | 通常経路と同じ判定ではズレる可能性 | replan 用の予定時刻定義を別途明記 |

---

## 16. 今後決めること

本書の次の段階で、以下を検討する。

- 各対象の猶予時間
- Logs Explorer で確認する具体的なクエリ
- Cloud Tasks / Scheduler / Firestore 補助確認の導線
- 店舗別プロジェクトの情報を将来どのように確認・集約するか
- 中央監視プロジェクトへ集約するか、店舗プロジェクト側で参照するか
- processStaffPayroll / finalizePayrollRun の SLA 型監視を補強するか
- Firestore状態監視を別文書で扱うか
- 将来的に管理用アプリでどう表示するか
- 将来的に通知化する条件

---

## 17. 現時点の結論

現時点では、関数内で発生した失敗は `logOpsError` で概ね検知できる前提である。

そのため、GCP側未実行検知では、以下を中心に扱う。

- 関数がそもそも起動していない
- task が配送されていない
- HTTP Task が handler に到達していない
- 本来出るべき到達ログが出ていない

本書では、未実行・未配送・未到達疑いを将来の管理用アプリや運用確認で扱えるようにするため、以下を整理した。

- 到達証跡として `logOpsInfo(eventType: "start")` を使う
- 完了証跡として `logOpsSuccess` を使う
- 失敗証跡として `logOpsError` を使う
- 対象ごとの判定起点時刻を定義する
- 対象ごとの突合キーと補助確認情報を定義する
- 現状、判定材料が不足している対象を明記する

通知対象 / 軽め通知 / 画面確認対象の分類は、本段階では行わない。

管理用アプリの具体仕様も本書では決めない。

初期方針として、エラーおよび未実行疑いは原則すべて確認対象とし、実データを見ながら後続で表示優先度や通知条件を検討する。

processStaffPayroll / finalizePayrollRun については、task 単位の予定時刻が現状保存されていないため、精密な未実行判定には不足がある。

ただし、今回は追加実装せず、暫定的に run 起点 / 全 staff 完了起点の SLA 型として運用する。
