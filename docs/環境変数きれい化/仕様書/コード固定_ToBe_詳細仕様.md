# コード固定 To-Be 詳細仕様書

作成日: 2026-03-31  
元仕様: `docs/環境変数きれい化/仕様書/tobe仕様書_全体像.md`  
関連仕様: `docs/環境変数きれい化/仕様書/scheduler_ToBe_詳細仕様.md`

## 1. スコープ

本仕様書は、環境変数から撤去しコード固定とする値、コード計算で求める値、実行環境注入のまま使う値の境界を確定する。  
対象は主に Cloud Tasks / Task Queue Function / Invoker SA / projectId 取得まわりの定数とヘルパーである。

以下は本仕様の対象外とする。

- Secret Manager に置く値
- Firestore に置く値
- scheduler の業務ロジックそのもの
- テスト専用の実行時変数

## 2. 基本方針

1. 機密でなく、全 Firebase プロジェクトで共通に扱える値はコード固定する。
2. プロジェクトごとに異なるが `projectId` から安全に計算できる値はコード計算にする。
3. プラットフォームが注入する `GCLOUD_PROJECT` / `GCP_PROJECT` / `PROJECT_ID` は実行環境注入のまま使う。
4. 誤プロジェクト操作を防ぐため、`projectId` のフォールバック文字列は持たない。
5. 新しい scheduler 系 job task は native Task Queue Function を実行先とし、URL 管理と scheduler job 専用 Invoker SA を持ち込まない。
6. 既存の downstream task で HTTP を使っているものは、本仕様書作成時点では存続を許容する。
7. 最終的なリージョンは Cloud Tasks / Cloud Functions / Cloud Run を含めて `asia-northeast1` に統一する。

## 3. コード固定とする対象

### 3.1 Cloud Tasks / Task Queue Function の定数

以下はコード固定対象とする。

- tournament 系 queue 名
- openclose 系 queue 名
- schedulerSupervisor が投入する scheduled-job 系 queue 名一覧
- Cloud Tasks リージョン定数
- Invoker SA のプレフィックス

### 3.2 コード計算とする対象

以下は固定文字列にせず、コードで計算する。

- Invoker SA メールアドレス

### 3.3 コード固定しない対象

以下はコード固定しない。

- `CONTROL_HOOK_URL`
- `CLOSE_ASSESSMENT_URL`
- `OPEN_ASSESSMENT_URL`
- `GCLOUD_PROJECT`
- `GCP_PROJECT`
- `PROJECT_ID`

上記のうち URL 3 件は Secret Manager、`projectId` 系 3 件は実行環境注入で扱う。

## 4. 最終 To-Be の固定値

### 4.1 リージョン方針

最終 To-Be では、Cloud Tasks / Cloud Functions / Cloud Run のリージョンをすべて `asia-northeast1` に統一する。

現状は `us-central1` と `asia-northeast1` が混在しているが、それは As-Is であり最終状態ではない。  
仕様書上の正は、あくまで `asia-northeast1` 統一である。

### 4.2 `shared/config/cloudTasksConfig.ts`

```typescript
// Cloud Tasks / Task Queue Function / schedulerSupervisor 関連の最終 To-Be 定数

export const TOURNAMENT_TASKS_REGION = 'asia-northeast1';
export const OPENCLOSE_TASKS_REGION = 'asia-northeast1';
export const SCHEDULED_JOB_TASKS_REGION = 'asia-northeast1';

export const TOURNAMENT_TASKS_QUEUE = 'tournament-queue';
export const OPENCLOSE_TASKS_QUEUE = 'business-date-assessment-queue';
export const SCHEDULED_JOB_QUEUE_BY_KEY = {
  weeklyPlanner: 'scheduled-job-weekly-planner',
  enqueueTournamentTasksByScheduler: 'scheduled-job-enqueue-tournament-tasks-by-scheduler',
  generateRecurringTournamentsByScheduler: 'scheduled-job-generate-recurring-tournaments-by-scheduler',
  scheduledCleanup: 'scheduled-job-scheduled-cleanup',
  scheduleGenerateNextYearBusinessHours: 'scheduled-job-schedule-generate-next-year-business-hours',
  payrollNotificationScheduler: 'scheduled-job-payroll-notification-scheduler',
} as const;

export const TOURNAMENT_INVOKER_SA_PREFIX = 'tasks-invoker';
export const OPENCLOSE_INVOKER_SA_PREFIX = 'openclose-tasks-invoker';
```

### 4.3 queue 名の生成規約

scheduled-job 系 queue は、許可された `jobKey` ごとの固定 map で管理する。  
各値は `scheduled-job-{kebab-case(jobKey)}` 規約に従う。

```typescript
export function getScheduledJobQueueName(
  jobKey: keyof typeof SCHEDULED_JOB_QUEUE_BY_KEY
): string {
  return SCHEDULED_JOB_QUEUE_BY_KEY[jobKey];
}
```

例:

- `weeklyPlanner` -> `scheduled-job-weekly-planner`
- `enqueueTournamentTasksByScheduler` -> `scheduled-job-enqueue-tournament-tasks-by-scheduler`
- `payrollNotificationScheduler` -> `scheduled-job-payroll-notification-scheduler`

運用上の注意:

- job を追加する場合は `SCHEDULED_JOB_QUEUE_BY_KEY` を必ず更新する。
- queue 名の規約自体を変えない場合でも、map 更新を漏らすと task 投入先が未定義になる。

### 4.4 Invoker SA メールアドレスの生成規約

```typescript
export function buildInvokerSaEmail(prefix: string, projectId: string): string {
  return `${prefix}@${projectId}.iam.gserviceaccount.com`;
}
```

用途別に以下を使い分ける。

- tournament 系 task: `TOURNAMENT_INVOKER_SA_PREFIX`
- openclose 系 task: `OPENCLOSE_INVOKER_SA_PREFIX`

## 5. Task Queue Function 前提の整理

### 5.1 scheduler job task

`schedulerSupervisor` が投入する job task は、すべて native Task Queue Function を起動する前提とする。

これにより以下のメリットを得る。

- scheduler job 用 URL を新規管理しなくてよい
- URL の Secret Manager 管理対象を増やさなくてよい
- scheduler job 用 Invoker SA を新規管理しなくてよい
- queue 名と関数責務の対応が明確になる
- scheduler の実行系を Cloud Tasks / Task Queue Function に寄せて統一しやすい

### 5.2 既存 downstream task

以下の既存 downstream task は、本仕様書時点では HTTP ベースのまま残存を許容する。

- `controlHookUrl`
- `closeAssessmentUrl`
- `openAssessmentUrl`

これらは scheduler job task ではなく、job の内部処理から作成される既存 task の実行先である。  
そのため、本仕様書では引き続き Secret Manager 管理とする。

## 6. 実行環境注入の扱い

### 6.1 `projectId` の取得方針

```typescript
export function getRequiredProjectId(): string {
  const projectId =
    process.env.GCLOUD_PROJECT ??
    process.env.GCP_PROJECT ??
    process.env.PROJECT_ID;

  if (!projectId) {
    throw new Error('プロジェクト ID が未設定です。実行環境を確認してください。');
  }

  return projectId;
}
```

`getRequiredProjectId()` は「実行中の Functions がどの Firebase / GCP プロジェクトに属しているか」を、
実行環境注入値から安全に取得するための共通ヘルパーとする。  
各ファイルが独自に `GCLOUD_PROJECT` / `GCP_PROJECT` / `PROJECT_ID` を読むことは禁止し、
`projectId` が必要な箇所だけこのヘルパーを参照する。

### 6.2 `getRequiredProjectId()` の適用対象

以下は `projectId` を処理時に必要とするため、`getRequiredProjectId()` 適用対象とする。

- `functions/src/domains/tournament_createTournament/services/tasks.ts`
- `functions/src/domains/storeMeta/scheduler/weeklyPlanner.ts`
- `functions/src/domains/storeMeta/callables/continueBusinessTerminal.ts`
- `functions/src/shared/logging/logOpsError.ts`
- 今後追加する `schedulerSupervisor` / scheduled-job enqueue 関連の新規ファイル
- 今後追加する Secret Manager SDK ラッパー（例: `shared/secrets/secretManager.ts`）

### 6.3 適用不要ファイルの考え方

以下に該当しないファイルは、`getRequiredProjectId()` を導入しない。

- Cloud Tasks の `queuePath` / `taskPath` を組み立てない
- Secret Manager の `projects/{projectId}/...` を組み立てない
- SA メールアドレスを組み立てない
- ログに `projectId` を明示的に付与しない

つまり、repo 全体の全 `.ts` ファイルに一律導入するのではなく、
`projectId` を必要とする処理にのみ導入する。

### 6.4 禁止事項

以下は禁止とする。

- `'amuse-app-template'` のような固定文字列フォールバック
- リージョン名のフォールバック文字列
- queue 名のフォールバック文字列
- Invoker SA メールアドレスの `.env` 依存
- 各ファイルで独自に `GCLOUD_PROJECT ?? GCP_PROJECT ?? PROJECT_ID` を繰り返すこと

### 6.5 関連運用資料

3 レイヤー整合とリリース時の運用については、以下の運用資料を参照する。

- `docs/運用時資料/導入時設定/fireBase紐付け/3レイヤー整合_設計方針.md`
- `docs/運用時資料/導入時設定/fireBase紐付け/リリース前後チェックリスト.md`

## 7. 既存環境変数からの置き換え対応

| 置き換え前 | 置き換え後 |
|---|---|
| `getEnv('TASKS_QUEUE')` | `TOURNAMENT_TASKS_QUEUE` |
| `getEnv('TASKS_LOCATION')` | `TOURNAMENT_TASKS_REGION` |
| `getEnv('TASKS_INVOKER_SA')` in `tasks.ts` | `buildInvokerSaEmail(TOURNAMENT_INVOKER_SA_PREFIX, getRequiredProjectId())` |
| `getEnv('WEEKLYPLANNER_TASKS_QUEUE')` | `OPENCLOSE_TASKS_QUEUE` |
| `getEnv('WEEKLYPLANNER_TASKS_LOCATION')` | `OPENCLOSE_TASKS_REGION` |
| `getEnv('TASKS_INVOKER_SA')` in `weeklyPlanner.ts` / `continueBusinessTerminal.ts` | `buildInvokerSaEmail(OPENCLOSE_INVOKER_SA_PREFIX, getRequiredProjectId())` |
| scheduler job queue 名 | `getScheduledJobQueueName(jobKey)` |

## 8. 新規追加する定数・ヘルパー

### 8.1 新規定数

- `SCHEDULED_JOB_TASKS_REGION`
- `SCHEDULED_JOB_QUEUE_BY_KEY`

### 8.2 新規ヘルパー

- `getScheduledJobQueueName(jobKey)`
- `buildInvokerSaEmail(prefix, projectId)`
- `getRequiredProjectId()`

### 8.3 推奨ファイル構成

- `shared/config/cloudTasksConfig.ts`
- `shared/runtime/projectId.ts`

`getScheduledJobQueueName` と `buildInvokerSaEmail` は `cloudTasksConfig.ts` に置いてよい。  
`getRequiredProjectId()` は実行環境注入値を扱うため `shared/runtime/projectId.ts` に分離する。

## 9. 削除対象

### 9.1 `.env` から削除するもの

- `TASKS_QUEUE`
- `TASKS_LOCATION`
- `TASKS_INVOKER_SA`
- `WEEKLYPLANNER_TASKS_QUEUE`
- `WEEKLYPLANNER_TASKS_LOCATION`
- `RECURRING_TOURNAMENT_TASKS_QUEUE`
- `RECURRING_TOURNAMENT_TASKS_INVOKER_SA`

### 9.2 コードから削除するもの

- `projectId` の固定文字列フォールバック
- `CLOUD_TASKS_REGION` のような曖昧な総称定数
- scheduler job を URL 前提で扱う実装案

### 9.3 GCP 側で削除対象として管理すべきもの

- 使わなくなった旧 Invoker SA
- `us-central1` に残る旧 queue
- `us-central1` の旧 Cloud Run / Cloud Functions エンドポイント

古いものを残すと運用者が誤認しやすいため、移行後は明示的な削除対象として扱う。

## 10. As-Is から To-Be への注意点

1. 現在 `tournament` と `openclose` のリージョンは混在しているが、最終 To-Be の正は `asia-northeast1` 統一である。
2. 現在 `TASKS_INVOKER_SA` は一部共用されているが、最終 To-Be では用途別に分離する。
3. scheduler job 用 queue / region は新規追加対象であり、既存の tournament / openclose 用定数とは別に扱う。
4. scheduler job は native Task Queue Function 前提とするため、新規の scheduler job URL と scheduler job 用 Invoker SA は作らない。
5. 既存 downstream task の HTTP URL は、別途 Secret Manager 管理として存続する。

## 11. テスト・確認観点

1. `getRequiredProjectId()` が未設定時に確実に fail-fast すること
2. `buildInvokerSaEmail()` が projectId ごとに正しい SA メールを返すこと
3. `getScheduledJobQueueName()` が許可済み `jobKey` に対して想定どおりの queue 名を返すこと
4. job 追加時に `SCHEDULED_JOB_QUEUE_BY_KEY` を更新しないとテストで検出できること
5. queue / region / SA の置き換え後に `.env` を参照しないこと
6. scheduler job 用 task が URL ではなく Task Queue Function を実行先にしていること
7. `us-central1` 前提の値が新規実装へ混入していないこと

## 12. 本仕様書での最終結論

1. Cloud Tasks / Task Queue Function 関連のインフラ定数はコード固定とする。
2. projectId は実行環境注入のまま使い、固定文字列フォールバックは削除する。
3. scheduler job 系 queue は固定 map `SCHEDULED_JOB_QUEUE_BY_KEY` で管理し、job 追加時は map 更新を必須とする。
4. scheduler job は native Task Queue Function を起動し、URL 管理と scheduler job 用 Invoker SA は増やさない。
5. 最終的なリージョンはすべて `asia-northeast1` に統一する。

## 13. フェーズ対応メモ

- 本仕様書の主実装フェーズは `フェーズ A: 基盤の安全化` である。
- `4. 最終 To-Be の固定値`、`6. 実行環境注入の扱い`、`7. 既存環境変数からの置き換え対応`、`8. 新規追加する定数・ヘルパー` はフェーズ A で反映する。
- `5. Task Queue Function 前提の整理` のうち scheduler job 側はフェーズ B、既存 downstream task 側はフェーズ D と接続する。
- `4.1 リージョン方針` と `9.3 GCP 側で削除対象として管理すべきもの` はフェーズ F で最終実体に揃える。
- 本仕様書の内容は `docs/環境変数きれい化/フェーズ設計_詳細仕様対応表.md` で全体フェーズに割り当て済みであり、未対応章はない。
