# phaseC 完了サマリと phaseD 引き継ぎ

作成日: 2026-04-01

## 1. phaseC 完了サマリ

### 1.1 実装結果

- `schedulerSupervisor` を export 有効化し、監視schedulerを本番経路へ接続した。
- phaseC対象 6 job を旧 `onSchedule` から task 実行関数へ移行した。
  - `weeklyPlanner`
  - `enqueueTournamentTasksByScheduler`
  - `generateRecurringTournamentsByScheduler`
  - `scheduledCleanup`
  - `scheduleGenerateNextYearBusinessHours`
  - `payrollNotificationScheduler`
- `scheduledJobTaskExecutors` / `scheduledJobTaskFunctions` を追加し、queue名と Task Queue Function を一致させた。
- `targetScope` を各jobで実消費する実装へ更新した。
- tournament 再計画トリガー `enqueueTournamentTasksReplanOnWrite` を追加し、`enqueueTournamentTasksReplanRequests` 運用を接続した。
- `updateTournamentTemplate` / `updateTournamentRecurrence` / `updateScheduledTournamentStartAt` で、schedule影響更新時の
  `schedulePlanVersion` / `schedulePlanUpdatedAt` / `regEndAt` / `taskSyncNeeded` の整合を強化した。

### 1.2 テスト結果

- `npm run build` 成功
- `npm run lint` 成功
- `__tests__/scheduler/*.spec.ts` 成功
- `__tests__/tournament_createTournament/enqueueTournamentTasksReplanOnWrite.spec.ts` 成功
- `__tests__/config_migration/D15_cron.spec.ts` 成功
- `__tests__/config/schedulerConfigLoader.spec.ts` 成功
- `__tests__/attendance/payrollNotificationHelper.spec.ts` 成功
- 追加補強:
  - `__tests__/scheduler/schedulerSupervisorCore.spec.ts` 成功
  - `__tests__/scheduler/enqueueTournamentTasksReplanTask.spec.ts` 成功
  - `__tests__/scheduler/schedulerTargetScope.spec.ts`（6job観点）成功
  - `__tests__/scheduler/scheduledJobTaskExecutors.spec.ts`（6job + replan失敗経路）成功
  - `__tests__/tournament_createTournament/enqueueTournamentTasksReplanOnWrite.spec.ts`（reason分岐）成功

### 1.3 ステップ8結果

- `step8_運用時資料判定.md` のとおり、phaseCでは運用時資料の新規作成が必要と判定し、`schedulerConfig` 運用資料を追加した。

## 2. phaseD への引き継ぎ事項

### 2.1 既に整っている前提

- scheduler は `schedulerSupervisor -> scheduled-job-* task` 経路へ移行済み。
- `storeMeta/schedulerConfig` は v2スキーマで運用可能。
- 再計画 request は `enqueueTournamentTasksReplanRequests` に集約済み。

### 2.2 phaseDで必ず意識すること

- Secret Manager 移行時に、phaseCで固定化した queue/job 経路を壊さないこと。
- `getRequiredProjectId()` / 既存 config loader と整合する secret 取得実装にすること。
- `scheduler` / `task` 経路で使う URL・資格情報の参照先を、仕様どおり Secret Manager に統一すること。

### 2.3 phaseD changeSpec 作成時の確認観点

- `Secret_Manager_ToBe_詳細仕様.md` の担当章（1〜10、12〜15）を漏れなく対象化する。
- 置換対象の env / defineString / getEnv 参照を一覧化して、移行漏れを防ぐ。
- IAM と運用手順（誰が secret を作るか・更新するか）を `changeSpec` に明記する。

## 3. 未解決事項（phaseC終了時点）

- なし（phaseCスコープ内の未完了タスクは確認されていない）。
