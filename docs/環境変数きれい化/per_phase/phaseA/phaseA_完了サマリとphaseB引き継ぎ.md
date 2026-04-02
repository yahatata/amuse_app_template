# phaseA 完了サマリと phaseB 引き継ぎ

作成日: 2026-03-31

## 1. phaseA 完了サマリ

### 1.1 実装結果

- `getRequiredProjectId()` を新規追加し、`projectId` 解決を共通化した。
- Cloud Tasks 関連の固定定数 / ヘルパー（`cloudTasksConfig.ts`）を新規追加した。
- 以下の既存ファイルを方針どおり置換した。
  - `functions/src/domains/tournament_createTournament/services/tasks.ts`
  - `functions/src/domains/storeMeta/scheduler/weeklyPlanner.ts`
  - `functions/src/domains/storeMeta/callables/continueBusinessTerminal.ts`
  - `functions/src/shared/logging/logOpsError.ts`
- `functions/.env.amuse-app-template` から phaseA対象の不要キーを削除した。
- テストを追加 / 更新し、build・lint・対象テストの成功を確認した。

### 1.2 テスト結果

- `npm run build` 成功
- `npm run lint` 成功
- `__tests__/shared/runtime/projectId.spec.ts` 成功
- `__tests__/shared/config/cloudTasksConfig.spec.ts` 成功
- `__tests__/tournament_createTournament/step7_deprecatedRemoval.spec.ts` 成功
- `__tests__/config_migration/D15_cron.spec.ts` 成功

### 1.3 ステップ8結果

- `step8_運用時資料判定.md` のとおり、phaseA単体では新規運用資料の追加作成は不要と判定。

## 2. phaseB への引き継ぎ事項

### 2.1 既に使える共通部品

- `functions/src/shared/runtime/projectId.ts`
  - `getRequiredProjectId()`
- `functions/src/shared/config/cloudTasksConfig.ts`
  - `SCHEDULED_JOB_QUEUE_BY_KEY`
  - `getScheduledJobQueueName(jobKey)`
  - `SCHEDULED_JOB_TASKS_REGION`
  - その他 queue/region/SA 関連定数

### 2.2 phaseB で必ず意識すること

- scheduler job 追加時は `SCHEDULED_JOB_QUEUE_BY_KEY` 更新が必須。
- `projectId` を使う新規コードは `getRequiredProjectId()` を使う。
- scheduler基盤実装で queue 名を直書きしない（`getScheduledJobQueueName` を使う）。

### 2.3 phaseB changeSpec 作成時の確認観点

- `scheduler_ToBe_詳細仕様.md` の基盤章（1〜5、7、8、9の基盤部分）を対象化する。
- `targetScope` / payload / task命名 / idempotency / ログを最初に確定し、実装順を固定する。
- 再計画 request（`enqueueTournamentTasksReplanRequests`）の扱いをphaseBの責務として明記する。

## 3. 未解決事項（phaseA終了時点）

- なし（phaseAスコープ内での未完了タスクは確認されていない）。
