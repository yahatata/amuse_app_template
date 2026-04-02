# phaseB changeSpec（scheduler基盤）

作成日: 2026-04-01  
ステータス: ステップ1〜9完了（phaseB完了）

## 1. 対象仕様書と対象章

### 1.1 scheduler To-Be（phaseB担当範囲）

- `docs/環境変数きれい化/仕様書/scheduler_ToBe_詳細仕様.md`
  - 1〜5
  - 7（基盤部分）
  - 8
  - 9（基盤部分）
  - 10（基盤テスト観点）

### 1.2 コード固定 To-Be（phaseB担当範囲）

- `docs/環境変数きれい化/仕様書/コード固定_ToBe_詳細仕様.md`
  - 5.1 scheduler job task
  - 8.1 `SCHEDULED_JOB_QUEUE_BY_KEY`
  - 8.2 `getScheduledJobQueueName()`

補足:

- scheduler 各jobの実処理切替（旧 `onSchedule` 停止含む）は phaseC で実施する。

## 2. As-Is確認結果

### 2.1 監視scheduler基盤が未実装

- `schedulerSupervisor` が未実装。
- `schedulerDispatchLogs` / `schedulerExecutionLogsByCloudTask` を出力する共通基盤が未実装。
- `targetScope` 生成、deterministic task名生成、payload標準化が未実装。

### 2.2 schedulerConfig が旧スキーマ（boolean3項目）で残存

- `functions/src/shared/config/schedulerConfigTypes.ts`
  - `monthlyPayrollTriggerEnabled` / `scheduledCleanupEnabled` / `scheduleGenerateNextYearBusinessHoursEnabled` のみ。
- `functions/src/shared/config/schedulerConfigLoader.ts`
  - 旧3項目のみを読み込み。
- `functions/src/domains/storeMeta/callables/initializeStoreConfigCallable.ts`
  - 初期作成時に旧3項目のみ作成/補完。

### 2.3 旧 onSchedule が直接業務処理を実行中

- `weeklyPlanner.ts`
- `EnqueueTournamentTasksByScheduler.ts`
- `GenerateRecurringTournamentsByScheduler.ts`
- `scheduledCleanup.ts`
- `scheduleGenerateNextYearBusinessHours.ts`
- `payrollNotificationScheduler.ts`

現時点ではいずれも監視scheduler経由ではなく、各 `onSchedule` から直接処理している。

### 2.4 再計画request基盤が未実装

- `enqueueTournamentTasksReplanRequests` の保存ロジック未実装。
- 60秒遅延の再計画task投入基盤未実装。

### 2.5 既存で利用可能な部品

- `functions/src/shared/config/cloudTasksConfig.ts`
  - `SCHEDULED_JOB_QUEUE_BY_KEY`
  - `getScheduledJobQueueName()`
  - `SCHEDULED_JOB_TASKS_REGION`
- `functions/src/shared/runtime/projectId.ts`
  - `getRequiredProjectId()`

## 3. 新規作成するファイル

- `functions/src/shared/config/schedulerConfigDefaults.ts`
  - schedulerConfig 専用の初期値定数（`payrollConfigDefaults.ts` と同様の責務分離）。
- `functions/src/domains/scheduler/supervisor/schedulerSupervisor.ts`
  - 監視schedulerエントリ（03:00 JST）。
- `functions/src/domains/scheduler/supervisor/schedulerSupervisorCore.ts`
  - `schedulerConfig` 読み取り、7日先計画、task投入本体。
- `functions/src/domains/scheduler/supervisor/schedulerTaskPayload.ts`
  - payload型、バリデーション、`schemaVersion` 管理。
- `functions/src/domains/scheduler/supervisor/schedulerTargetScope.ts`
  - job別 `targetScope` 生成ロジック。
- `functions/src/domains/scheduler/supervisor/schedulerTaskName.ts`
  - deterministic task名（`{jobKey}_{YYYYMMDDTHHmmssZ}`）生成。
- `functions/src/domains/scheduler/supervisor/schedulerLogs.ts`
  - `schedulerDispatchLogs` / `schedulerExecutionLogsByCloudTask` への best-effort 出力。
- `functions/src/domains/scheduler/replan/enqueueTournamentTasksReplanRequest.ts`
  - `enqueueTournamentTasksReplanRequests` upsert / 読み取りヘルパー。
- `functions/src/domains/scheduler/replan/enqueueTournamentTasksReplanTask.ts`
  - 60秒遅延の再計画task投入ヘルパー。

テスト新規:

- `functions/__tests__/scheduler/schedulerConfigLoader.v2.spec.ts`
- `functions/__tests__/scheduler/schedulerTargetScope.spec.ts`
- `functions/__tests__/scheduler/schedulerTaskName.spec.ts`
- `functions/__tests__/scheduler/schedulerTaskPayload.spec.ts`
- `functions/__tests__/scheduler/enqueueTournamentTasksReplanRequest.spec.ts`

## 4. 修正するファイル

- `functions/src/shared/config/schedulerConfigTypes.ts`
- `functions/src/shared/config/schedulerConfigDefaults.ts`
- `functions/src/shared/config/schedulerConfigLoader.ts`
- `functions/src/domains/storeMeta/callables/initializeStoreConfigCallable.ts`
- `functions/src/shared/config/defaults.ts`（旧 schedulerConfig 初期値の撤去）
- `functions/__tests__/config/schedulerConfigLoader.spec.ts`

必要に応じて追加修正候補:

- `functions/src/index.ts`（phaseB時点では原則未変更。phaseCでexport有効化予定）
- 各 `domains/*/index.ts`（phaseBでは原則未変更）

## 5. 移動するファイル

- なし

## 6. 実装方針

### 6.1 schedulerConfig を To-Beスキーマへ拡張

- `storeMeta/schedulerConfig` を以下のTo-Be構造で扱えるようにする。
  - `schemaVersion`
  - `updatedAt`
  - `supervisorEnabled`
  - `planningHorizonDays`
  - `jobs.<jobKey>.*`
- `jobs.<jobKey>` は `scheduleKind/runAtJst/timezone` と必要な補助項目（`dayOfWeek` / `month` / `dayOfMonth`）を持つ。
- `jobKey` は仕様どおり6件（No.6除外）を固定。
- schedulerConfig の初期値は `defaults.ts` へ追記せず、`payrollConfigDefaults.ts` と同様に
  `functions/src/shared/config/schedulerConfigDefaults.ts` を新設して集約する。
- `schedulerConfigLoader.ts` / `initializeStoreConfigCallable.ts` は上記 defaults ファイルのみを参照する。

### 6.2 互換性維持（phaseB限定）

- 旧 `onSchedule` が phaseCまで生きているため、phaseBでは以下の互換を維持する。
  - loader が旧ドキュメントを読んでも壊れない（不足項目はデフォルト補完）。
  - `initializeStoreConfigCallable` 実行時、既存環境で安全に v2スキーマへ補完できる。
- 旧3項目booleanは phaseE削除対象だが、phaseB時点では「読み取り互換」を残す。

### 6.3 監視scheduler基盤を実装（ただし切替はしない）

- `schedulerSupervisor` の計画処理を実装。
  - 毎日03:00 JST
  - `planningHorizonDays`（デフォルト7）を上限に task計画
  - queue は `getScheduledJobQueueName(jobKey)` で解決
  - task名は deterministic
  - `ALREADY_EXISTS` は skip扱い
- phaseBでは安全のため、**本番export有効化は行わない**。
  - 実際の起動経路切替は phaseCの責務とする。

### 6.4 payload / targetScope / ログの共通化

- payload必須項目を型で固定し、生成時に必須チェックする。
- `targetScope` は job別生成関数に分離し、遅延実行時でも対象が固定されるようにする。
- ログは best-effort とし、書き込み失敗時は Cloud Logging に `error` を出力。
- `processName` は任意、`decisionSnapshot` は最小保存。

### 6.5 再計画request基盤（enqueueTournamentTasks専用）を実装

- コレクション: `enqueueTournamentTasksReplanRequests`
- ドキュメントID: `enqueueTournamentTasksByScheduler`
- request upsert と 60秒遅延task投入ヘルパーを作成。
- 30日超を作成しない制約を前提に、再計画対象範囲は `now-6h ～ +14日` を維持。
- 掃除運用は実装しない（既存ドキュメントに将来検討として記録済み）。

## 7. 必要テストの検討（実施予定）

### 7.1 単体テスト

- schedulerConfig v2のデフォルト補完・バリデーション
- `targetScope` 生成（job別）
- task名正規化（`{jobKey}_{YYYYMMDDTHHmmssZ}`）
- payload必須項目バリデーション
- 再計画request upsert・遅延投入パラメータ

### 7.2 既存テスト更新

- `__tests__/config/schedulerConfigLoader.spec.ts`
  - v2スキーマ前提へ更新
  - 旧形式doc読み取り互換ケースを追加

### 7.3 回帰・ビルド確認

- `npm run build`
- `npm run lint`
- `npm test -- __tests__/config/schedulerConfigLoader.spec.ts --runInBand`
- `npm test -- __tests__/scheduler/*.spec.ts --runInBand`

## 8. 外部操作

- 現時点では不要（CLI内で完結）。
- phaseBではGCPコンソール上の Scheduler/Queue 作成は実施しない（切替はphaseC以降）。

## 9. リスク

- schedulerConfig v2化で旧参照コードとの互換を崩すと、未移行jobが停止する。
- `targetScope` 実装ミスで、遅延時に意図しない業務対象を処理する可能性がある。
- phaseBで誤って新経路をexport有効化すると、旧onScheduleと二重実行になる。
- 再計画requestを過剰更新すると、短時間に不要な再計画taskが増える可能性がある。

## 10. ロールバック方法

1. `domains/scheduler/**` の新規基盤ファイルを削除。
2. `schedulerConfigTypes.ts` / `schedulerConfigLoader.ts` / `initializeStoreConfigCallable.ts` を旧実装へ戻す。
3. `scheduler`系新規テストを削除し、既存テストを旧前提へ戻す。
4. `npm run build` / `npm run lint` / 主要テストで復旧確認。

## 11. 完了条件（phaseBでこのchangeSpecが満たすべき状態）

- `storeMeta/schedulerConfig` を To-Beスキーマで読み書きできる。
- `schedulerSupervisor` 基盤（計画/payload/targetScope/ログ/冪等）が実装される。
- 再計画request基盤（専用コレクション + 60秒遅延task投入）が実装される。
- phaseB終了時点で export切替は行わず、phaseCに引き継ぐ前提が明記される。
- build/lint/対象テストが通過する。

## 12. 実行結果（2026-04-01）

- `npm run build`: 成功
- `npm run lint`: 成功
- `npm test -- __tests__/config/schedulerConfigLoader.spec.ts --runInBand`: 成功
- `npm test -- __tests__/scheduler/schedulerConfigLoader.v2.spec.ts --runInBand`: 成功
- `npm test -- __tests__/scheduler/schedulerTargetScope.spec.ts __tests__/scheduler/schedulerTaskName.spec.ts __tests__/scheduler/schedulerTaskPayload.spec.ts --runInBand`: 成功
- `npm test -- __tests__/scheduler/enqueueTournamentTasksReplanRequest.spec.ts --runInBand`: 成功
