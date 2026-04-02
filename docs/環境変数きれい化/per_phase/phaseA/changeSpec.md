# phaseA changeSpec（基盤の安全化）

作成日: 2026-03-31  
ステータス: ステップ1〜9完了（phaseA完了）

## 1. 対象仕様書と対象章

### 1.1 実行環境注入のまま使うもの To-Be

- `docs/環境変数きれい化/仕様書/実行環境注入のまま使うもの_ToBe_詳細仕様.md`
  - 1〜13（全体）

### 1.2 コード固定 To-Be（phaseA担当範囲）

- `docs/環境変数きれい化/仕様書/コード固定_ToBe_詳細仕様.md`
  - 1〜3
  - 4.2〜4.4
  - 5.1
  - 6
  - 7
  - 8
  - 9.1〜9.2
  - 10〜12

補足:

- 4.1（リージョン最終統一）と 9.3（GCP側削除対象）は phaseF で最終反映する。

## 2. As-Is確認結果

### 2.1 `projectId` 取得の分散と危険なフォールバック

- `functions/src/domains/tournament_createTournament/services/tasks.ts`
  - `process.env.PROJECT_ID || 'amuse-app-template'` の固定フォールバックあり
- `functions/src/domains/storeMeta/scheduler/weeklyPlanner.ts`
  - 関数内で `GCLOUD_PROJECT || GCP_PROJECT || PROJECT_ID || 'amuse-app-template'` を都度計算
- `functions/src/domains/storeMeta/callables/continueBusinessTerminal.ts`
  - モジュールスコープで `... || 'amuse-app-template'` を保持
- `functions/src/shared/logging/logOpsError.ts`
  - `resolveProjectId()` が独自実装（未設定時は `'unknown'`）

### 2.2 queue / region / SA の `.env` 依存

- `tasks.ts` が以下を `getEnv()` で取得:
  - `TASKS_QUEUE`
  - `TASKS_LOCATION`
  - `TASKS_INVOKER_SA`
- `weeklyPlanner.ts` / `continueBusinessTerminal.ts` が以下を `getEnv()` で取得:
  - `WEEKLYPLANNER_TASKS_QUEUE`
  - `WEEKLYPLANNER_TASKS_LOCATION`
  - `TASKS_INVOKER_SA`

### 2.3 `.env` テンプレートの現状

- `functions/.env.amuse-app-template` に phaseAで撤去対象のキーが残っている:
  - `TASKS_QUEUE`
  - `TASKS_LOCATION`
  - `TASKS_INVOKER_SA`
  - `WEEKLYPLANNER_TASKS_QUEUE`
  - `WEEKLYPLANNER_TASKS_LOCATION`
  - `RECURRING_TOURNAMENT_TASKS_QUEUE`
  - `RECURRING_TOURNAMENT_TASKS_INVOKER_SA`

### 2.4 テスト現状（影響あり）

- `functions/__tests__/tournament_createTournament/step7_deprecatedRemoval.spec.ts`
  - `tasks.ts` に `getEnv('TASKS_QUEUE')` などが存在することを前提にしており、phaseA方針と衝突する。
- `getRequiredProjectId()` / `cloudTasksConfig` の専用テストは未作成。

## 3. 新規作成するファイル

- `functions/src/shared/runtime/projectId.ts`
  - `getRequiredProjectId()` を実装。
- `functions/src/shared/config/cloudTasksConfig.ts`
  - queue / region / SA prefix の固定値とヘルパーを実装。
- `functions/__tests__/shared/runtime/projectId.spec.ts`
  - `getRequiredProjectId()` の fail-fast / 優先順位テスト。
- `functions/__tests__/shared/config/cloudTasksConfig.spec.ts`
  - `buildInvokerSaEmail()` と `getScheduledJobQueueName()` のテスト。

## 4. 修正するファイル

- `functions/src/domains/tournament_createTournament/services/tasks.ts`
- `functions/src/domains/storeMeta/scheduler/weeklyPlanner.ts`
- `functions/src/domains/storeMeta/callables/continueBusinessTerminal.ts`
- `functions/src/shared/logging/logOpsError.ts`
- `functions/.env.amuse-app-template`
- `functions/__tests__/tournament_createTournament/step7_deprecatedRemoval.spec.ts`

必要に応じて追加修正候補:

- `functions/src/shared/config/index.ts`（`cloudTasksConfig` 再exportが必要な場合）

## 5. 移動するファイル

- なし

## 6. 実装方針

### 6.1 共通 `projectId` 取得へ一本化

- `shared/runtime/projectId.ts` に `getRequiredProjectId()` を新規実装。
- 既存の `process.env.GCLOUD_PROJECT ?? ...` 直読みは対象ファイルで廃止。
- 固定文字列フォールバック（`'amuse-app-template'`）は削除。
- `projectId` が解決できない場合は即時 `throw`。

### 6.2 Cloud Tasks 関連値のコード固定化

- `shared/config/cloudTasksConfig.ts` に以下を実装:
  - `TOURNAMENT_TASKS_REGION`
  - `OPENCLOSE_TASKS_REGION`
  - `SCHEDULED_JOB_TASKS_REGION`
  - `TOURNAMENT_TASKS_QUEUE`
  - `OPENCLOSE_TASKS_QUEUE`
  - `SCHEDULED_JOB_QUEUE_BY_KEY`
  - `TOURNAMENT_INVOKER_SA_PREFIX`
  - `OPENCLOSE_INVOKER_SA_PREFIX`
  - `getScheduledJobQueueName(jobKey)`
  - `buildInvokerSaEmail(prefix, projectId)`
- phaseAでは schedulerSupervisor 本体は作らず、phaseB/Cで使う定数を先に固定化する。

### 6.3 既存3ファイルの env 依存置換

- `tasks.ts`
  - queue / region を固定定数へ置換
  - invoker SA を `buildInvokerSaEmail(TOURNAMENT_INVOKER_SA_PREFIX, getRequiredProjectId())` に置換
- `weeklyPlanner.ts` / `continueBusinessTerminal.ts`
  - queue / region を `OPENCLOSE_*` 固定定数へ置換
  - invoker SA を `buildInvokerSaEmail(OPENCLOSE_INVOKER_SA_PREFIX, getRequiredProjectId())` に置換
- `CONTROL_HOOK_URL` / `OPEN_ASSESSMENT_URL` / `CLOSE_ASSESSMENT_URL` はこのフェーズでは現行どおり `getEnv` のまま維持（Secret Manager フェーズDで移行）。

### 6.4 `logOpsError` の `projectId` 解決統一

- `resolveProjectId()` 内部実装を `getRequiredProjectId()` ベースへ変更し、独自解決ロジックを廃止。
- ログ用途であっても取得不能時は fail-fast に合わせる（仕様準拠）。

### 6.5 `.env` テンプレートの不要キー整理

- phaseA対象の削除キーを `functions/.env.amuse-app-template` から削除。
- URL系やSecret Manager移行前の値は残置する。

### 6.6 テストの更新

- `step7_deprecatedRemoval.spec.ts` の前提を新仕様に更新
  - 旧 `TASKS_*` 直読みを要求しない
  - 新規定数/ヘルパー利用前提へ差し替え
- 新規ユニットテストで以下を検証
  - `getRequiredProjectId()` の優先順位
  - 未設定時の例外
  - `getScheduledJobQueueName()` の返却
  - `buildInvokerSaEmail()` の生成値

## 7. 必要テストの検討（実施予定）

### 7.1 単体テスト

- `npm test -- __tests__/shared/runtime/projectId.spec.ts`
- `npm test -- __tests__/shared/config/cloudTasksConfig.spec.ts`
- `npm test -- __tests__/tournament_createTournament/step7_deprecatedRemoval.spec.ts`

### 7.2 回帰・ビルド確認

- `npm run build`
- `npm run lint`

必要に応じて追加:

- `npm test -- __tests__/config_migration/D15_cron.spec.ts`（weeklyPlanner編集の副作用確認）

## 8. 外部操作

- 現時点では不要（CLI内で完結）。
- GCP / GitHub / Firebase Console 操作は phaseA実装時点では想定しない。

## 9. リスク

- 既存テストが旧 env 依存前提のため、更新漏れで CI 失敗する可能性。
- `logOpsError` の fail-fast 化により、`projectId` 未設定時の障害検知タイミングが早まる（意図通りだが挙動変化）。
- `cloudTasksConfig` の定数導入後、今後 job追加時の map 更新漏れに注意が必要。

## 10. ロールバック方法

1. 新規追加ファイル（`projectId.ts`, `cloudTasksConfig.ts`, 新規テスト）を削除。
2. `tasks.ts` / `weeklyPlanner.ts` / `continueBusinessTerminal.ts` / `logOpsError.ts` を As-Is に戻す。
3. `.env.amuse-app-template` の削除キーを戻す。
4. `npm run build` と主要テストを再実行して復旧確認。

## 11. 完了条件（phaseAでこのchangeSpecが満たすべき状態）

- `projectId` の固定文字列フォールバックが対象ファイルから除去される。
- 対象ファイルが `getRequiredProjectId()` を参照する。
- queue / region / SA の対象 env 依存がコード固定へ置換される。
- `.env.amuse-app-template` から phaseA対象の不要キーが削除される。
- 追加/更新テスト + build/lint が通過する。

## 12. 実行結果（2026-03-31）

- `npm run build`: 成功
- `npm run lint`: 成功
- `npm test -- __tests__/shared/runtime/projectId.spec.ts --runInBand`: 成功
- `npm test -- __tests__/shared/config/cloudTasksConfig.spec.ts --runInBand`: 成功
- `npm test -- __tests__/tournament_createTournament/step7_deprecatedRemoval.spec.ts --runInBand`: 成功
- `npm test -- __tests__/config_migration/D15_cron.spec.ts --runInBand`: 成功
