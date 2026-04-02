# phaseC changeSpec（scheduler 各 job 移行）

作成日: 2026-04-01  
ステータス: ステップ1〜9完了（phaseC完了）

## 1. 対象仕様書と対象章

### 1.1 scheduler To-Be（phaseC担当範囲）

- `docs/環境変数きれい化/仕様書/scheduler_ToBe_詳細仕様.md`
  - 3
  - 6
  - 7.3〜7.5
  - 8.2〜8.3
  - 9
  - 10（job別テスト観点）

### 1.2 コード固定 To-Be（phaseC接続範囲）

- `docs/環境変数きれい化/仕様書/コード固定_ToBe_詳細仕様.md`
  - 5.1 scheduler job task は native Task Queue Function
  - 8.1 `SCHEDULED_JOB_QUEUE_BY_KEY`
  - 8.2 `getScheduledJobQueueName()`

### 1.3 進め方・フェーズ対応

- `docs/環境変数きれい化/進め方_仕様詳細化とフェーズ設計フロー.md`
- `docs/環境変数きれい化/フェーズ設計_詳細仕様対応表.md`
- `docs/環境変数きれい化/per_phase/phaseB/phaseB_完了サマリとphaseC引き継ぎ.md`

## 2. As-Is確認結果（phaseB実装を重点確認）

### 2.1 phaseBで実装済みの基盤（接続前）

- `schedulerConfig` v2スキーマ（`schemaVersion/supervisorEnabled/planningHorizonDays/jobs`）は実装済み。
- `schedulerSupervisorCore`（7日先読み、payload生成、deterministic task名、dispatchログ）は実装済み。
- `targetScope` 生成、`idempotencyKey`、`scheduleFingerprint` は実装済み。
- `enqueueTournamentTasksReplanRequests` の upsert/read と 60秒遅延 task 投入 helper は実装済み。

### 2.2 phaseB基盤の未接続点（phaseCで解消必須）

- `schedulerSupervisor` が `src/index.ts` へ未export（本番経路未接続）。
- 6 job（No.1/2/3/4/5/7）は依然として旧 `onSchedule` 実装のまま。
- `schedulerExecutionLogsByCloudTask` は出力関数のみ存在し、呼び出し点が未実装。
- `targetScope` は supervisor で生成済みだが、各 job 処理で未消費。
- `enqueueTournamentTasksReplanTask` は投入可能だが、受け側 job が未接続。

### 2.3 各jobの現状（移行対象）

- `weeklyPlanner`
  - `onSchedule` + `WEEKLY_PLANNER_CRON`（env）で直接 task作成。
  - `targetScope.targetWeekStartDate` を受ける経路なし。
- `enqueueTournamentTasksByScheduler`
  - `onSchedule` + env CRON。
  - `runEnqueueTournamentTasks({})` 固定（`targetScope.rangeStartAt/rangeEndAt` 未反映）。
- `generateRecurringTournamentsByScheduler`
  - `onSchedule` + env CRON。
  - `runGenerateRecurringTournaments()` 固定（`evaluationDate/windowEndDate` 未反映）。
- `scheduledCleanup`
  - `onSchedule` + env CRON。
  - cutoff を `now-7days` 固定（`targetScope.cutoffDate` 未反映）。
- `scheduleGenerateNextYearBusinessHours`
  - `onSchedule` + env CRON。
  - 対象年を実行時 `now + 1` で算出（`targetScope.targetYear` 未反映）。
- `payrollNotificationScheduler`
  - `onSchedule` 固定時刻で `processPayrollNotifications` task を投入。
  - `targetScope.targetDate` 固定の経路なし。

### 2.4 トーナメント再計画（7.3〜7.5）の現状

- `enqueueTournamentTasksReplanRequests` は未利用（callable/trigger から未接続）。
- `updateTournamentTemplate` / `updateTournamentRecurrence` で
  - `schedulePlanVersion`
  - `schedulePlanUpdatedAt`
  - `regEndAt`
  - `taskSyncNeeded`
  の更新が仕様どおり同時更新になっていないケースがある。
- 既存 `enqueueTournamentTasks` callable は「手動再実行」の保険として使えるが、replan request 集約経路とは未統合。

### 2.5 テスト現状のギャップ

- `__tests__/config_migration/D15_cron.spec.ts` は旧 env CRON 前提のまま。
- phaseC対象jobの Task Queue Function 経路を検証するテストは未整備。

## 3. 新規作成するファイル

- `functions/src/domains/scheduler/tasks/scheduledJobTaskFunctions.ts`
  - 6 job分の Task Queue Function エントリ（queueごと1関数）。
- `functions/src/domains/scheduler/tasks/scheduledJobTaskExecutors.ts`
  - payload検証・実行ログ出力・job別実行呼び分けの共通実行層。
- `functions/src/domains/tournament_createTournament/triggers/enqueueTournamentTasksReplanOnWrite.ts`
  - `scheduledTournaments` 更新時の replan request upsert + 60秒遅延 task 投入。

テスト新規:

- `functions/__tests__/scheduler/scheduledJobTaskExecutors.spec.ts`
- `functions/__tests__/scheduler/scheduledJobTaskFunctions.spec.ts`
- `functions/__tests__/tournament_createTournament/enqueueTournamentTasksReplanOnWrite.spec.ts`

## 4. 修正するファイル

### 4.1 scheduler 基盤/共通

- `functions/src/domains/scheduler/supervisor/schedulerTaskPayload.ts`
  - 実行側で使う payload 検証ヘルパーを追加（jobKey整合確認を含む）。
- `functions/src/domains/scheduler/replan/enqueueTournamentTasksReplanRequest.ts`
  - `isProcessing` / `lastCompletedAt` 更新ヘルパーを追加。
- `functions/src/domains/scheduler/replan/enqueueTournamentTasksReplanTask.ts`
  - request lifecycle 更新と重複投入防止の補強。

### 4.2 job本体（旧onScheduleからtask実行関数へ）

- `functions/src/domains/storeMeta/scheduler/weeklyPlanner.ts`
- `functions/src/domains/tournament_createTournament/scheduler/EnqueueTournamentTasksByScheduler.ts`
- `functions/src/domains/tournament_createTournament/scheduler/GenerateRecurringTournamentsByScheduler.ts`
- `functions/src/domains/staff/scheduler/scheduledCleanup.ts`
- `functions/src/shared/businessHours/scheduler/scheduleGenerateNextYearBusinessHours.ts`
- `functions/src/domains/attendance/scheduler/payrollNotificationScheduler.ts`

### 4.3 既存サービス/処理ロジック（targetScope対応）

- `functions/src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts`
  - `rangeStartAt/rangeEndAt` 指定での探索を受けられるよう拡張。
- `functions/src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts`
  - `evaluationDate/windowEndDate` 指定での生成評価に拡張。
- `functions/src/domains/attendance/tasks/processPayrollNotifications.ts`
  - `targetDate` payload を受けられるよう拡張（未指定時は従来挙動）。

### 4.4 トーナメント更新系（No.2/No.3整合）

- `functions/src/domains/tournament_createTournament/callables/updateTournamentTemplate.ts`
- `functions/src/domains/tournament_createTournament/callables/updateTournamentRecurrence.ts`
- `functions/src/domains/tournament_createTournament/callables/updateScheduledTournamentStartAt.ts`

目的:

- `schedulePlanVersion` increment
- `schedulePlanUpdatedAt` 更新
- `regEndAt` 再計算
- `taskSyncNeeded=true`

を「スケジュール影響更新時」に必ず同時更新する。

### 4.5 export / 配線

- `functions/src/domains/tournament_createTournament/index.ts`
  - replan trigger export を追加。
- `functions/src/index.ts`
  - `schedulerSupervisor` export を有効化。
  - 6 job task queue function を queue 名と一致する関数IDで export。
- `functions/src/domains/storeMeta/index.ts`
- `functions/src/domains/staff/index.ts`
- `functions/src/shared/businessHours/index.ts`
- `functions/src/domains/attendance/index.ts`
  - 旧 `onSchedule` export の整理（phaseC対象分）。

### 4.6 既存テスト更新

- `functions/__tests__/config_migration/D15_cron.spec.ts`
  - phaseC後の前提に更新（旧 env CRON 前提の検証を撤去）。

## 5. 移動するファイル

- なし

## 6. 実装方針

### 6.1 phaseB基盤を本番経路へ接続

- `schedulerSupervisor` を export 有効化し、監視schedulerの起点を作る。
- 6 job は旧 `onSchedule` から切り離し、Cloud Tasks（Task Queue Function）で実行する。
- `monthlyPayrollTrigger`（No.6）は phaseC対象外。phaseEで削除する。

### 6.2 queue名と関数IDの一致（1関数1queue）

- `SCHEDULED_JOB_QUEUE_BY_KEY` の値（`scheduled-job-*`）をそのまま queue 名として使用する。
- task queue function の関数IDも queue 名と一致させ、`getScheduledJobQueueName(jobKey)` で投入先を一意化する。
- job 追加時は `SCHEDULED_JOB_QUEUE_BY_KEY` 更新を必須運用として継続する。

### 6.3 共通実行ラッパー（execution log含む）

- 実行開始時: `schedulerExecutionLogsByCloudTask` に `eventType=started`。
- 正常終了時: `eventType=completed`。
- 判定スキップ時: `eventType=skip`（理由必須）。
- 例外時: `eventType=error`。
- ログ書き込み失敗は best-effort（業務継続、Cloud Logging に error）。

### 6.4 job別の `targetScope` 消費

- `weeklyPlanner`: `targetWeekStartDate` 起点で7日分を処理。
- `enqueueTournamentTasksByScheduler`: `rangeStartAt/rangeEndAt` を使って対象探索。
- `generateRecurringTournamentsByScheduler`: `evaluationDate/windowEndDate` で評価範囲固定。
- `scheduledCleanup`: `cutoffDate` を削除基準日に固定。
- `scheduleGenerateNextYearBusinessHours`: `targetYear` を生成対象年に固定。
- `payrollNotificationScheduler`: `targetDate` 固定で通知taskを作成し、`processPayrollNotifications` へ渡す。

### 6.5 トーナメント再計画（7.3〜7.5）

- `scheduledTournaments` 更新トリガーを主系にする。
  - スケジュール影響更新を検知したら `enqueueTournamentTasksReplanRequests` を upsert。
  - 直後に 60秒遅延 task を投入。
- `updateTournamentTemplate` / `updateTournamentRecurrence` / `updateScheduledTournamentStartAt` で
  仕様必須4点（version/updatedAt/regEndAt/taskSyncNeeded）を担保する。
- `enqueueTournamentTasksByScheduler` 実行完了時に request の `isProcessing=false`、`lastCompletedAt` を更新する。
- 手動保険は既存 `enqueueTournamentTasks` callable を維持し、日次監視は最終セーフティネットとして維持する。

### 6.6 移行順序（二重実行回避）

1. task 実行関数と共通実行層を実装  
2. 6 job の旧 `onSchedule` 経路を停止  
3. `schedulerSupervisor` export を有効化  
4. replan trigger を有効化  
5. 旧経路が残っていないことを確認

## 7. 必要テストの検討（実施予定）

### 7.1 単体テスト

- payload 検証（jobKey一致、必須項目、targetScope型）
- 共通実行層の started/completed/skip/error ログ
- 各jobの `targetScope` 消費
  - weeklyPlanner 週起点固定
  - enqueue range固定
  - recurring evaluation/window 固定
  - cleanup cutoff固定
  - businessHours targetYear固定
  - payroll targetDate固定
- replan trigger の検知条件と 60秒遅延投入
- replan request lifecycle（isProcessing / lastCompletedAt）

### 7.2 既存テスト更新

- `D15_cron.spec.ts` を phaseC後の仕様へ更新。
- 旧 `onSchedule` 前提テストが残っていないことを確認。

### 7.3 回帰・ビルド確認

- `npm run build`
- `npm run lint`
- `npm test -- __tests__/scheduler/*.spec.ts --runInBand`
- `npm test -- __tests__/tournament_createTournament/enqueueTournamentTasksReplanOnWrite.spec.ts --runInBand`
- `npm test -- __tests__/config_migration/D15_cron.spec.ts --runInBand`

## 8. 外部操作

- 原則なし（CLI内で完結）。
- phaseCでは GCP Console の手動作成は前提にしない。
- もし task queue function 名と queue 名の一致確認がデプロイ環境でのみ可能な場合は、
  その確認手順を実装後のステップ7で明示して依頼する。

## 9. リスク

- queue 名と task queue function 関数IDが一致しないと task が実行されない。
- 切替順序を誤ると旧 `onSchedule` と新 task 経路が二重実行になる。
- `targetScope` の時刻/JST解釈ミスで業務対象日がずれる。
- replan trigger が過検知すると短時間に再計画taskが増える。
- `updateTournamentTemplate` / `updateTournamentRecurrence` の一括更新で書き込み量が増える。

## 10. ロールバック方法

1. `schedulerSupervisor` export を無効化。  
2. 6 job を旧 `onSchedule` 実装へ戻す。  
3. replan trigger export を無効化。  
4. phaseCで追加した scheduler task 関連ファイルを削除。  
5. build/lint/対象テストで復旧確認。  

## 11. 完了条件（phaseCでこのchangeSpecが満たすべき状態）

- `schedulerSupervisor` が export され、6 job task の投入が行われる。
- phaseC対象6 jobの旧 `onSchedule` 経路が停止している。
- 6 jobが payload `targetScope` を実際に消費して処理している。
- `schedulerExecutionLogsByCloudTask` が started/completed/skip/error で出力される。
- `enqueueTournamentTasksReplanRequests` が更新トリガー経由で運用される。
- `D15_cron.spec.ts` を含む関連テスト・build・lintが通過する。

## 12. 実行結果（2026-04-01）

- `npm run build`: 成功
- `npm run lint`: 成功
- `npm test -- __tests__/scheduler/scheduledJobTaskExecutors.spec.ts __tests__/scheduler/scheduledJobTaskFunctions.spec.ts __tests__/scheduler/schedulerTaskPayload.spec.ts __tests__/tournament_createTournament/enqueueTournamentTasksReplanOnWrite.spec.ts __tests__/config_migration/D15_cron.spec.ts --runInBand`: 成功
- `npm test -- __tests__/config/schedulerConfigLoader.spec.ts __tests__/scheduler/schedulerConfigLoader.v2.spec.ts __tests__/scheduler/schedulerTargetScope.spec.ts __tests__/scheduler/schedulerTaskName.spec.ts __tests__/scheduler/enqueueTournamentTasksReplanRequest.spec.ts --runInBand`: 成功
- `npm test -- __tests__/attendance/payrollNotificationHelper.spec.ts --runInBand`: 成功
- `npm test -- __tests__/scheduler/schedulerSupervisorCore.spec.ts __tests__/scheduler/enqueueTournamentTasksReplanTask.spec.ts __tests__/scheduler/schedulerTargetScope.spec.ts __tests__/scheduler/scheduledJobTaskExecutors.spec.ts __tests__/tournament_createTournament/enqueueTournamentTasksReplanOnWrite.spec.ts --runInBand`: 成功
- `npm test -- __tests__/shared/runtime/projectId.spec.ts __tests__/shared/config/cloudTasksConfig.spec.ts __tests__/tournament_createTournament/step7_deprecatedRemoval.spec.ts __tests__/config/schedulerConfigLoader.spec.ts __tests__/scheduler/*.spec.ts __tests__/tournament_createTournament/enqueueTournamentTasksReplanOnWrite.spec.ts __tests__/tournament_createTournament/step3_taskSyncNeeded.spec.ts __tests__/config_migration/D15_cron.spec.ts __tests__/attendance/payrollNotificationHelper.spec.ts --runInBand`: 成功
