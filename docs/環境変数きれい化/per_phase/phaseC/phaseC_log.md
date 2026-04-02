# phaseC 作業ログ

## 2026-04-01

### 実施

- phaseC開始。
- `phaseC/README.md` と `進め方_仕様詳細化とフェーズ設計フロー.md` を確認。
- phaseC担当範囲（`scheduler_ToBe` 3, 6, 7.3〜7.5, 8.2〜8.3, 9, 10）を再確認。
- As-Is調査を実施し、以下を確認:
  - phaseB基盤（`schedulerSupervisorCore` / `schedulerConfig` v2 / `targetScope` / replan helper）は実装済み。
  - ただし基盤は未接続（`schedulerSupervisor` 未export、6jobは旧 `onSchedule` のまま）。
  - `schedulerExecutionLogsByCloudTask` は出力点未接続。
  - `enqueueTournamentTasksReplanRequests` は helper のみで、更新トリガー未接続。
  - `updateTournamentTemplate` / `updateTournamentRecurrence` は仕様必須4点の同時更新が未充足なケースあり。
  - `D15_cron.spec.ts` は旧 env CRON 前提のまま。
- `phaseC/changeSpec.md` を作成（実装未着手）。
- ユーザー承認後、phaseC実装を実施。
  - 追加: `domains/scheduler/tasks/scheduledJobTaskExecutors.ts`
  - 追加: `domains/scheduler/tasks/scheduledJobTaskFunctions.ts`
  - 追加: `domains/tournament_createTournament/triggers/enqueueTournamentTasksReplanOnWrite.ts`
  - 修正: 6job の scheduler 実装（旧 `onSchedule` から task 実行関数化）
  - 修正: `index.ts`（`schedulerSupervisor` export + queue名ベース task function 登録）
  - 修正: `enqueueTournamentTasksCore.ts`（`rangeStartAt/rangeEndAt` 明示受け取り）
  - 修正: `generateRecurringTournamentsCore.ts`（`evaluationDate/windowEndDate` 明示受け取り）
  - 修正: `processPayrollNotifications.ts`（`targetDate` payload 対応）
  - 修正: `enqueueTournamentTasksReplanRequest.ts` / `enqueueTournamentTasksReplanTask.ts`（request lifecycle 補強）
  - 修正: `updateTournamentTemplate.ts` / `updateTournamentRecurrence.ts`（schedule影響更新時の version/updatedAt/regEndAt/taskSyncNeeded 同時更新）
  - 修正: domain index 群（旧 scheduler export 整理）
  - 修正: `__tests__/config_migration/D15_cron.spec.ts`（phaseC後仕様へ更新）
  - 追加: `__tests__/scheduler/scheduledJobTaskExecutors.spec.ts`
  - 追加: `__tests__/scheduler/scheduledJobTaskFunctions.spec.ts`
  - 追加: `__tests__/tournament_createTournament/enqueueTournamentTasksReplanOnWrite.spec.ts`
  - 修正: `__tests__/scheduler/schedulerTaskPayload.spec.ts`
- テスト実行:
  - `npm run build` 成功
  - `npm run lint` 成功
  - `__tests__/scheduler/scheduledJobTaskExecutors.spec.ts` 成功
  - `__tests__/scheduler/scheduledJobTaskFunctions.spec.ts` 成功
  - `__tests__/scheduler/schedulerTaskPayload.spec.ts` 成功
  - `__tests__/tournament_createTournament/enqueueTournamentTasksReplanOnWrite.spec.ts` 成功
  - `__tests__/config_migration/D15_cron.spec.ts` 成功
  - `__tests__/config/schedulerConfigLoader.spec.ts` 成功
  - `__tests__/scheduler/schedulerConfigLoader.v2.spec.ts` 成功
  - `__tests__/scheduler/schedulerTargetScope.spec.ts` 成功
  - `__tests__/scheduler/schedulerTaskName.spec.ts` 成功
  - `__tests__/scheduler/enqueueTournamentTasksReplanRequest.spec.ts` 成功
  - `__tests__/attendance/payrollNotificationHelper.spec.ts` 成功
- 追加の網羅性強化を実施。
  - 追加: `__tests__/scheduler/schedulerSupervisorCore.spec.ts`
  - 追加: `__tests__/scheduler/enqueueTournamentTasksReplanTask.spec.ts`
  - 拡張: `__tests__/scheduler/schedulerTargetScope.spec.ts`（6job分）
  - 拡張: `__tests__/scheduler/scheduledJobTaskExecutors.spec.ts`（6job + replan失敗経路）
  - 拡張: `__tests__/tournament_createTournament/enqueueTournamentTasksReplanOnWrite.spec.ts`（reason分岐）
- 追加テスト実行:
  - `npm test -- __tests__/scheduler/schedulerSupervisorCore.spec.ts __tests__/scheduler/enqueueTournamentTasksReplanTask.spec.ts __tests__/scheduler/schedulerTargetScope.spec.ts __tests__/scheduler/scheduledJobTaskExecutors.spec.ts __tests__/tournament_createTournament/enqueueTournamentTasksReplanOnWrite.spec.ts --runInBand`: 成功
  - `npm test -- __tests__/shared/runtime/projectId.spec.ts __tests__/shared/config/cloudTasksConfig.spec.ts __tests__/tournament_createTournament/step7_deprecatedRemoval.spec.ts __tests__/config/schedulerConfigLoader.spec.ts __tests__/scheduler/*.spec.ts __tests__/tournament_createTournament/enqueueTournamentTasksReplanOnWrite.spec.ts __tests__/tournament_createTournament/step3_taskSyncNeeded.spec.ts __tests__/config_migration/D15_cron.spec.ts __tests__/attendance/payrollNotificationHelper.spec.ts --runInBand`: 成功
- ステップ8を実施し、運用時資料の追加が必要と判定。
  - 追加: `docs/運用時資料/設定/storeMeta/schedulerConfigによる設定の詳細/README.md`
  - 追加: `docs/運用時資料/設定/storeMeta/schedulerConfigによる設定の詳細/scheduler_supervisor_jobs.md`
  - 記録: `phaseC/step8_運用時資料判定.md`
- ステップ9を実施し、完了サマリと次フェーズ引き継ぎを作成。
  - 追加: `phaseC/phaseC_完了サマリとphaseD引き継ぎ.md`

### 現在ステータス

- 標準ステップ:
  - 1. As-Is確認: 完了
  - 2. changeSpec作成: 完了
  - 3. 必要テスト検討: 完了（changeSpecへ反映済み）
  - 4. ユーザーレビュー依頼: 完了
  - 5. 実装: 完了
  - 6. テスト実行: 完了
  - 7. テスト結果の出力 / 実機確認依頼: 完了
  - 8. 運用時資料の必要性検討 / 必要時作成: 完了
  - 9. サマリ作成と引き継ぎ事項の記録: 完了
