# Phase5: 自動開閉店（補助機能） - 認定処理 実装サマリー

## 実装日
2025-01-XX（初回実装）
2026-02-08（環境変数の分離と時間計算の修正）

## 実装内容

### 1. グローバル定数の追加

**ファイル**: `lib/globalConstant.dart`

**追加した定数**:
- `ENABLE_AUTO_OPEN_CLOSE`: 自動開閉店（補助機能）の有効/無効（デフォルト: `true`）
- `TASK_CLOSE_OFFSET_MINUTES`: 閉店認定タスクの実行時刻オフセット（デフォルト: `120`分）
- `TASK_OPEN_OFFSET_MINUTES`: 開店認定タスクの実行時刻オフセット（デフォルト: `-30`分）
- `WEEKLY_PLANNER_CRON`: 週次Plannerのcron式（デフォルト: `'0 20 * * 0'`、日曜20:00 JST）

**変更内容**:
- `CALC_BUSINESS_DATE_BUFFER_DESCRIPTION`の後に4つの定数を追加

### 2. 週次Plannerの実装

**ファイル**: `functions/src/scheduler/weeklyPlanner.ts`（新規作成）

**処理内容**:
1. `ENABLE_AUTO_OPEN_CLOSE`を確認（`false`の場合はno-op）
2. `businessHoursMonthlyMap`から翌週（月〜日）分の営業時間を取得（月跨ぎの場合は複数のドキュメントを取得、同一monthIdはキャッシュ）
3. 各日の「閉店認定」「開店認定」タスクをCloud Tasksに投入
   - 閉店認定: 閉店時間 + `TASK_CLOSE_OFFSET_MINUTES`（デフォルト: 120分）
   - 開店認定: 開店時間 + `TASK_OPEN_OFFSET_MINUTES`（デフォルト: -30分）
4. `task.name`を`tasksClient.taskPath(...)`で固定し、`createTask`で`AlreadyExists`（`error.code === 6`）は成功扱いにして冪等化

**主要な実装ポイント**:
- `PROJECT_ID`の取得時にfail-fast（未設定の場合は`throw new Error`）
- `days`キーの揺れ対応（`"1"`/`"01"`の両方を確認）
- `closeMinute > 1440`の場合は翌日へ繰り越す処理
- JST基準で計算してからUTC epoch秒へ変換（`setUTCHours`を使用してUTC時刻を設定）

**環境変数の分離（2026-02-08修正）**:
- `TASKS_QUEUE`と`TASKS_LOCATION`は`tasks.ts`の`enqueueStartTask`/`enqueueRegistTask`で使用（`asia-northeast1`の`tournament-queue`）
- `weeklyPlanner`は専用の環境変数`WEEKLYPLANNER_TASKS_QUEUE`と`WEEKLYPLANNER_TASKS_LOCATION`を使用（`us-central1`の`business-date-assessment-queue`）
- これにより、環境変数の重複問題を解決し、各機能が適切なキューとロケーションを使用できるようになった

### 3. 閉店認定処理の実装

**ファイル**: `functions/src/tasks/closeAssessmentTask.ts`（新規作成）

**処理内容**:
1. `idempotencyKey`の生成（`close_assessment_${intendedBusinessDateKey}_${scheduledAt}`）
2. トランザクション内で冪等性チェック
3. `businessDateKey`の許容範囲検証（当日または前日）
4. 既に閉店済みか確認
5. 次営業日が開始しているか確認
6. `manualOverride`の確認
7. 閉店時間超過の確認
8. `blockers`の判定（`needs_manual_close`または`needs_manual_close_suppressed`の場合、`activeStays where isActive == true limit 1`で存在確認）
9. 認定結果の更新（トランザクション内）

**認定結果**:
- `needs_manual_close`: 閉店時間超過、手動閉店が必要
- `needs_manual_close_suppressed`: `manualOverride`により抑制された
- `already_closed`: 既に閉店済み
- `next_day_started`: 次営業日が開始している
- `skipped`: スキップ（許容範囲外など）

### 4. 開店認定処理の実装

**ファイル**: `functions/src/tasks/openAssessmentTask.ts`（新規作成）

**処理内容**:
1. `idempotencyKey`の生成（`open_assessment_${intendedBusinessDateKey}_${scheduledAt}`）
2. トランザクション内で冪等性チェック
3. `businessDateKey`の許容範囲検証（当日または翌日）
4. 既に営業中か確認
5. 営業中に別日付の開店が走ることを防止
6. 開店条件の確認（`storeMeta`のみで判定、`businessHoursMonthlyMap`参照や「前営業日＝前日」計算は行わない）
7. `manualOverride`の確認
8. 認定結果の更新（トランザクション内）

**認定結果**:
- `ready_to_open`: 開店条件を満たしている
- `needs_manual_open`: 手動開店が必要
- `already_running`: 既に営業中
- `skipped`: スキップ（許容範囲外など）

**重要な実装ポイント**:
- `lastClosedBusinessDateKey`と`intendedBusinessDateKey`の厳密整合は Phase5 では要求しない（「前営業日＝前日とは限らない」ため）
- `storeMeta/currentBusinessDay`のフィールドのみで判定（ドキュメント走査をしない）

### 5. State Docの初期化更新

**ファイル**: `functions/src/storeManagement/createInitialStateDocCallable.ts`（既存、更新）

**更新内容**:
- 新規フィールド（`closeAssessment`, `openAssessment`, `manualOverride`）の初期化を追加
- 初期値は`null`

### 6. エクスポートの追加

**ファイル**: `functions/src/index.ts`（既存、更新）

**追加したエクスポート**:
- `export * from "./scheduler/weeklyPlanner";`
- `export * from "./tasks/closeAssessmentTask";`
- `export * from "./tasks/openAssessmentTask";`

## 作成・更新したファイル一覧

### 新規作成
1. `functions/src/scheduler/weeklyPlanner.ts`
2. `functions/src/tasks/closeAssessmentTask.ts`
3. `functions/src/tasks/openAssessmentTask.ts`

### 更新
1. `lib/globalConstant.dart`
2. `functions/src/storeManagement/createInitialStateDocCallable.ts`
3. `functions/src/index.ts`

## 処理フロー

### 週次Planner（weeklyPlanner）
```
Cloud Scheduler（日曜20:00 JST）
  ↓
weeklyPlanner起動
  ↓
ENABLE_AUTO_OPEN_CLOSE確認
  ↓
businessHoursMonthlyMapから翌週（月〜日）分の営業時間を取得
  ↓
各日の「閉店認定」「開店認定」タスクをCloud Tasksに投入
  - 開店認定: 開店時間の30分前
  - 閉店認定: 閉店時間の2時間後
```

### 閉店認定処理（closeAssessmentTask）
```
Cloud Tasks（指定時刻に実行）
  ↓
closeAssessmentTask起動
  ↓
idempotencyKeyで冪等性チェック
  ↓
businessDateKeyの許容範囲検証
  ↓
既に閉店済みか確認
  ↓
次営業日が開始しているか確認
  ↓
manualOverrideの確認
  ↓
閉店時間超過の確認
  ↓
blockersの判定（activeStays確認）
  ↓
認定結果をstoreMeta/currentBusinessDayに記録
```

### 開店認定処理（openAssessmentTask）
```
Cloud Tasks（指定時刻に実行）
  ↓
openAssessmentTask起動
  ↓
idempotencyKeyで冪等性チェック
  ↓
businessDateKeyの許容範囲検証
  ↓
既に営業中か確認
  ↓
営業中に別日付の開店が走ることを防止
  ↓
開店条件の確認（storeMetaのみで判定）
  ↓
manualOverrideの確認
  ↓
認定結果をstoreMeta/currentBusinessDayに記録
```

## 実装時の注意事項

### 環境変数の設定
以下の環境変数が必要です：
- `ENABLE_AUTO_OPEN_CLOSE`: 自動開閉店の有効/無効（`true`/`false`）
- `TASK_CLOSE_OFFSET_MINUTES`: 閉店認定タスクの実行時刻オフセット（分単位、デフォルト: 120）
- `TASK_OPEN_OFFSET_MINUTES`: 開店認定タスクの実行時刻オフセット（分単位、デフォルト: -30）
- `CLOSE_ASSESSMENT_URL`: 閉店認定HTTP FunctionsのURL（Cloud Run URL形式、例: `https://closeassessmenttask-iigzogr4ca-uc.a.run.app`）
- `OPEN_ASSESSMENT_URL`: 開店認定HTTP FunctionsのURL（Cloud Run URL形式、例: `https://openassessmenttask-iigzogr4ca-uc.a.run.app`）
- `WEEKLYPLANNER_TASKS_QUEUE`: Cloud Tasksのキュー名（`weeklyPlanner`専用、例: `business-date-assessment-queue`）
- `WEEKLYPLANNER_TASKS_LOCATION`: Cloud Tasksのロケーション（`weeklyPlanner`専用、例: `us-central1`）
- `TASKS_INVOKER_SA`: サービスアカウントのメールアドレス（既存の`TASKS_INVOKER_SA`を使用）

**注意**: `TASKS_QUEUE`と`TASKS_LOCATION`は`tasks.ts`のトーナメント関連機能で使用されるため、`weeklyPlanner`では使用しません。

### IAM権限の設定
- Cloud Run（HTTP Functions）側で、`roles/run.invoker`を`TASKS_INVOKER_SA`に付与する必要があります

### 破壊的操作を行わない
- Phase5では破壊的操作（reset/cleanup/migrate/state更新）を行わず、認定結果のみを`storeMeta/currentBusinessDay`に記録します
- 実際の開店/閉店処理はPhase6で実装予定です

## 実装時の問題と解決

### 1. 環境変数の重複問題（2026-02-08解決）

**問題**:
- `.env.amuse-app-template`に`TASKS_QUEUE`と`TASKS_LOCATION`が重複して定義されていた
- `weeklyPlanner`と`tasks.ts`の`enqueueStartTask`/`enqueueRegistTask`が同じ環境変数名を使用していた
- これにより、異なるキューとロケーションを使用する必要があるにもかかわらず、環境変数の値が競合していた

**解決**:
- `weeklyPlanner`専用の環境変数`WEEKLYPLANNER_TASKS_QUEUE`と`WEEKLYPLANNER_TASKS_LOCATION`を導入
- `weeklyPlanner.ts`でこれらの環境変数を使用するように修正
- `tasks.ts`の既存機能は引き続き`TASKS_QUEUE`と`TASKS_LOCATION`を使用（影響なし）

### 2. 時間計算の修正（2026-02-08修正）

**問題**:
- `weeklyPlanner.ts`の時間計算で、JST時刻を意図していたが`setHours`がUTCで動作するため、時刻がずれていた

**解決**:
- JST時刻を計算してから、UTCに変換する処理に修正
- `setUTCHours`を使用してUTC時刻を正しく設定
- 開店時刻と閉店時刻の計算を修正

### 3. デプロイ時の環境変数の扱い

**確認事項**:
- Firebase Functions v2の本番環境では、Firebase Consoleで設定した環境変数が使用される
- `.env.amuse-app-template`は主にローカル開発用
- デプロイ時に`.env.amuse-app-template`が読み込まれても、本番実行時はFirebase Consoleの環境変数が優先される

**対応**:
- Firebase Consoleで`WEEKLYPLANNER_TASKS_QUEUE`と`WEEKLYPLANNER_TASKS_LOCATION`を設定する必要がある
- `.env.amuse-app-template`にも設定を追加（ローカル開発用）
