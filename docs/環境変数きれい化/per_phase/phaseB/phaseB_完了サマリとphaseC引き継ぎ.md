# phaseB 完了サマリと phaseC 引き継ぎ

作成日: 2026-04-01

## 1. phaseB 完了サマリ

### 1.1 実装結果

- `schedulerConfig` を To-Be v2 スキーマへ拡張した。
  - `schemaVersion` / `supervisorEnabled` / `planningHorizonDays` / `jobs.<jobKey>` を扱えるようにした。
- scheduler 初期値は `defaults.ts` から分離し、`schedulerConfigDefaults.ts` を新設した。
- `schedulerConfigLoader` を再実装し、v2スキーマ + 旧boolean3項目の読み取り互換を持たせた。
- `initializeStoreConfigCallable` は新 loader helper を使って v2補完可能にした。
- scheduler基盤を新規追加した。
  - `schedulerSupervisor` / `schedulerSupervisorCore`
  - `schedulerTaskPayload` / `schedulerTargetScope` / `schedulerTaskName` / `schedulerLogs`
- 再計画request基盤を新規追加した。
  - `enqueueTournamentTasksReplanRequests` upsert/read
  - 60秒遅延の再計画task投入 helper

### 1.2 テスト結果

- `npm run build` 成功
- `npm run lint` 成功
- `__tests__/config/schedulerConfigLoader.spec.ts` 成功
- `__tests__/scheduler/schedulerConfigLoader.v2.spec.ts` 成功
- `__tests__/scheduler/schedulerTargetScope.spec.ts` 成功
- `__tests__/scheduler/schedulerTaskName.spec.ts` 成功
- `__tests__/scheduler/schedulerTaskPayload.spec.ts` 成功
- `__tests__/scheduler/enqueueTournamentTasksReplanRequest.spec.ts` 成功

### 1.3 ステップ8結果

- `step8_運用時資料判定.md` のとおり、phaseB単体では運用時資料の新規追加は不要と判定。

## 2. phaseC への引き継ぎ事項

### 2.1 既に利用可能な基盤

- `functions/src/shared/config/schedulerConfigDefaults.ts`
- `functions/src/shared/config/schedulerConfigLoader.ts`
- `functions/src/domains/scheduler/supervisor/*`
- `functions/src/domains/scheduler/replan/*`
- `functions/src/shared/config/cloudTasksConfig.ts`（phaseA済み）

### 2.2 phaseCで必ず行うこと

- 各jobの task 実行関数化（旧 onSchedule の責務分離）。
- `schedulerSupervisor` 経由への切替（旧 onSchedule 無効化とセットで管理）。
- `schedulerExecutionLogsByCloudTask` 出力点の実装。
- `targetScope` を受けた処理固定（遅延/再実行時も対象がぶれないこと）。

### 2.3 phaseCで注意すること

- 二重実行を避けるため、切替順序を `job単位` で固定する。
- 旧 `onSchedule` と新 task 実行経路が同時有効にならないようにする。
- `jobKey` 追加時は `SCHEDULED_JOB_QUEUE_BY_KEY` 更新を必須運用として守る。

## 3. 未解決事項（phaseB終了時点）

- なし（phaseBスコープ内の未完了タスクは確認されていない）。
