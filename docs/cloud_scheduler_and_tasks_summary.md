# Cloud Scheduler と Cloud Tasks の使用状況まとめ

このドキュメントでは、プロジェクト内でCloud Schedulerを作成している処理と、Cloud Tasksにキューを投入している処理をまとめます。

## 1. Cloud Scheduler の作成処理

このプロジェクトでは、Firebase Functions v2の`onSchedule`を使用してスケジュール関数を定義しています。これらは内部的にCloud Schedulerを使用しますが、コード内で明示的にCloud Schedulerを作成しているわけではありません。

### 1.1 夜間再計算 (`nightlyRecalculateBalanceDue`)

**ファイル**: `functions/src/scripts/nightlyRecalculateBalanceDue.ts`

```17:46:functions/src/scripts/nightlyRecalculateBalanceDue.ts
export const nightlyRecalculateBalanceDue = onSchedule(
  {
    schedule: recalc,
    timeZone: 'Asia/Tokyo',
    retryCount: 3,
  },
  async (event) => {
    // ... 処理内容 ...
  }
);
```

- **スケジュール**: `STORE_CLOSE_HOUR:00 JST`（例: STORE_CLOSE_HOUR=27 の場合 3:00 JST）
- **処理内容**: `analyticsMonthly.net.balanceDueIncl` を再計算
- **cron文字列**: `getNightlyCronTriplet()` の `recalc` を使用

### 1.2 デュアルライト差分チェック (`nightlyReconciliationCheck`)

**ファイル**: `functions/src/scripts/nightlyReconciliationCheck.ts`

```17:53:functions/src/scripts/nightlyReconciliationCheck.ts
export const nightlyReconciliationCheck = onSchedule(
  {
    schedule: reconcile,
    timeZone: 'Asia/Tokyo',
    retryCount: 3,
  },
  async (event) => {
    // ... 処理内容 ...
  }
);
```

- **スケジュール**: `STORE_CLOSE_HOUR:30 JST`（例: STORE_CLOSE_HOUR=27 の場合 3:30 JST）
- **処理内容**: `todaysBills` と `bills` の差分を検出
- **cron文字列**: `getNightlyCronTriplet()` の `reconcile` を使用

### 1.3 夜間整合確認 (`nightlyIntegrityCheck`)

**ファイル**: `functions/src/scripts/nightlyIntegrityCheck.ts`

```17:51:functions/src/scripts/nightlyIntegrityCheck.ts
export const nightlyIntegrityCheck = onSchedule(
  {
    schedule: integrity,
    timeZone: 'Asia/Tokyo',
    retryCount: 3,
  },
  async (event) => {
    // ... 処理内容 ...
  }
);
```

- **スケジュール**: `(STORE_CLOSE_HOUR + 1):00 JST`（例: STORE_CLOSE_HOUR=27 の場合 4:00 JST）
- **処理内容**: データ整合性を確認し、異常を検出
- **cron文字列**: `getNightlyCronTriplet()` の `integrity` を使用

### 1.4 月次給与計算 (`monthlyPayrollTrigger`)

**ファイル**: `functions/src/attendance/monthlyPayrollTrigger.ts`

```4:117:functions/src/attendance/monthlyPayrollTrigger.ts
export const monthlyPayrollTrigger = onSchedule({
  schedule: '59 23 25 * *', // 毎月25日 23:59 (JST)
  timeZone: 'Asia/Tokyo',
}, async (event) => {
  // ... 処理内容 ...
});
```

- **スケジュール**: 毎月25日 23:59 JST
- **処理内容**: 月次給与計算を実行（前月26日〜今月25日の期間）

### 1.5 スケジュール削除 (`scheduledCleanup`)

**ファイル**: `functions/src/staff/scheduledCleanup.ts`

```10:66:functions/src/staff/scheduledCleanup.ts
export const scheduledCleanup = onSchedule(
  {
    schedule: "0 17 * * *", // UTC 17:00 = JST 02:00
    timeZone: "Asia/Tokyo",
    retryCount: 3,
  },
  async (event) => {
    // ... 処理内容 ...
  }
);
```

- **スケジュール**: 毎日午前2時 JST（UTC 17:00）
- **処理内容**: 却下後7日経過したシフトを自動削除

### 1.6 enqueue バッチ (`enqueueTournamentTasksByScheduler`)

**ファイル**: `functions/src/domains/tournament_createTournament/scheduler/EnqueueTournamentTasksByScheduler.ts`

- **スケジュール**: 毎日 5:00 JST（`lib/globalConstant.dart` の `ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON` と同期）
- **処理内容**: `runEnqueueTournamentTasks` を実行し、対象期間内の scheduledTournament について taskIndex 突合・Cloud Tasks 投入
- **有効化**: `ENQUEUE_SCHEDULER_ENABLED === 'true'` であること。Step 6 デプロイ完了まで無効化推奨
- **詳細**: `docs/cloud_tasks_tournament_enqueue/step8.5/scheduler_enable_procedure.md`

### 1.7 cron文字列生成関数

**ファイル**: `functions/src/config/ops.ts`

```71:98:functions/src/config/ops.ts
export function cronFromHourAndMinuteJst(hour0to29: number, minute: number): string {
  // ... cron文字列を生成 ...
}

export function getNightlyCronTriplet() {
  // ... 3つのcron文字列を返す ...
}
```

- `cronFromHourAndMinuteJst`: JST時刻からcron文字列を生成
- `getNightlyCronTriplet`: 夜間ジョブ用の3つのcron文字列（recalc, reconcile, integrity）を返す

## 2. Cloud Tasks へのキュー投入処理

### 2.1 現行フロー（Step 4〜6 移行済み、Step 7 で deprecated 削除済み）

**ファイル**: `functions/src/domains/tournament_createTournament/services/tasks.ts`

#### 2.1.1 タスク投入関数 (`enqueueTournamentTask`)

新 payload 仕様で Cloud Tasks に投入する唯一の関数。

- **ペイロード**: `{ tournamentId, taskType, planVersion, planHash, scheduledAt, storeId }`
- **taskType**: `startTournament` | `closeRegistration`
- **呼び出し元**: `enqueueTournamentTasksCore`（日次 enqueue バッチ、作成完了後の即時 enqueue）
- **controlHook**: 新 payload を受付し、no-op 判定・taskIndex 更新を行う

#### 2.1.2 enqueue Callable (`enqueueTournamentTasks`)

**ファイル**: `functions/src/domains/tournament_createTournament/callables/enqueueTournamentTasks.ts`

- **用途**: 手動実行用。Firebase Functions SDK で `enqueueTournamentTasks` Callable を invoke して `runEnqueueTournamentTasks()` を実行する
- **処理**: `runEnqueueTournamentTasks()` を呼び出し、enqueue バッチと同様の処理を行う

#### 2.1.3 taskIndex サブコレクション

| 項目 | 内容 |
|------|------|
| パス | `scheduledTournaments/{tournamentId}/taskIndex/{taskType}` |
| 役割 | 内部台帳。enqueue バッチと controlHook が planHash・enqueueState を管理 |
| taskType | startTournament, closeRegistration |
| フィールド例 | planHash, enqueueState, enqueuedAt, cloudTaskName, lastRunAt, lastRunResult |
| クライアント | 非公開（firestore.rules で read/write: false） |

#### 2.1.4 controlHook payload

- **新 payload（推奨）**: `{ tournamentId, taskType, planVersion, planHash, scheduledAt, storeId }`
- **旧 payload（後方互換）**: `{ action: 'start' \| 'regist', tournamentId, rev }` は残存タスク処理のため受付継続
- **no-op 判定**: planVersion 不一致または planHash 不一致時は no-op で成功終了。taskIndex に lastRunResult: 'noop' を記録

#### 2.1.5 廃止した関数（Step 7 で削除）

| 関数 | 備考 |
|------|------|
| enqueueStartTask | 旧 payload（action/rev）で投入。enqueueTournamentTask に統合 |
| enqueueRegistTask | 同上 |
| scheduleTask | 未使用のため削除。payload 形式が controlHook と不一致だった |
| listTasks, deleteTask | デバッグ用。削除後は Cloud Tasks API / gcloud CLI / Console で一覧・削除可能 |

#### 2.1.6 新 enqueue フロー概要

1. **enqueue バッチ**（日次 Scheduler または作成完了後）が `runEnqueueTournamentTasks` を実行
2. 対象期間内の scheduledTournament を取得し、taskIndex と突合
3. `enqueueState === 'pending'` かつ 30 日以内のものについて `enqueueTournamentTask` で Cloud Tasks に投入
4. **controlHook** が HTTP でタスクを受領し、version/hash 一致時に status 遷移を実行

詳細は `docs/cloud_tasks_tournament_enqueue/spec.md` および各 Step の changeSpec を参照。

## 3. 環境変数

Cloud Tasksの設定に使用される環境変数：

- `CONTROL_HOOK_URL`: タスク実行時のHTTPエンドポイントURL
- `TASKS_QUEUE`: Cloud Tasksのキュー名
- `TASKS_LOCATION`: Cloud Tasksのリージョン
- `TASKS_INVOKER_SA`: タスク実行用のサービスアカウント
- `PROJECT_ID`: GCPプロジェクトID（デフォルト: `amuse-app-template`）

## 4. まとめ

### Cloud Scheduler
- **合計6つのスケジュール関数**を定義
  - 夜間再計算（`nightlyRecalculateBalanceDue`）
  - デュアルライト差分チェック（`nightlyReconciliationCheck`）
  - 夜間整合確認（`nightlyIntegrityCheck`）
  - 月次給与計算（`monthlyPayrollTrigger`）
  - スケジュール削除（`scheduledCleanup`）
  - enqueue バッチ（`enqueueTournamentTasksByScheduler`）

### Cloud Tasks
- **enqueueTournamentTask** により新 payload でタスク投入
- **呼び出し経路**: 日次 enqueue バッチ（Scheduler）、作成完了後の即時 enqueue（createScheduledTournament / createTournamentRecurrence / generateRecurringTournamentsCore）
- **taskIndex** と突合し、30 日以内分を Cloud Tasks に投入
- **Scheduler 有効化手順**：`docs/cloud_tasks_tournament_enqueue/step8.5/scheduler_enable_procedure.md`
- 詳細: `docs/cloud_tasks_tournament_enqueue/`
