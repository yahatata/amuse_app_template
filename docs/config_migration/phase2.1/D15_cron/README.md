# D-15 CRON 設定

## 1. 項目の概要

Cloud Scheduler で実行されるバッチ処理のスケジュールを表す CRON 式と、その説明文（RUN_AT_DESCRIPTION）の定数群である。

- 週次 Planner
- 定期開催トーナメント自動生成
- enqueue バッチ（トーナメントタスク投入）

**注意**: CRON の実際の実行は TypeScript 側の Scheduler で行われる。`lib/globalConstant.dart` には定義と説明が置かれているが、実際のスケジュール値は TS 側の環境変数（未設定時は各ファイル内のデフォルト値）で決まる。Dart の定数は参照されていない（同期用のドキュメントとしての役割）。

**Phase2.1 対応状況**: CRON 3項目を環境変数化済み。TS 各ファイルで `process.env.XXX || 'default'` により未設定時はデフォルトを使用。Cloud Logging で `source: 'env' | 'default'` をログ出力し、コンソールから判別可能。

---

## 2. 設定（定数）一覧

| 定数名 | 型 | 現状の値 | 定義場所 |
|--------|------|----------|----------|
| WEEKLY_PLANNER_CRON | String | '0 20 * * 0' | lib/globalConstant.dart |
| RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON | String | '0 23 * * 0' | lib/globalConstant.dart |
| RECURRING_TOURNAMENT_GENERATION_SCHEDULER_RUN_AT_DESCRIPTION | String | （日曜23:00 JST の説明文） | lib/globalConstant.dart |
| ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON | String | '0 5 * * *' | lib/globalConstant.dart |
| ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_RUN_AT_DESCRIPTION | String | （毎日5:00 JST の説明文） | lib/globalConstant.dart |

---

## 3. 各設定の説明

| 定数 | 説明 |
|------|------|
| WEEKLY_PLANNER_CRON | 週次 Planner の実行タイミング（cron 式）。日曜 20:00 JST を想定。 |
| RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON | 定期開催トーナメント自動生成スケジューラの実行タイミング。日曜 23:00 JST。 |
| RECURRING_TOURNAMENT_GENERATION_SCHEDULER_RUN_AT_DESCRIPTION | 上記スケジューラの実行日時を人間が読める形式で説明。 |
| ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON | enqueue バッチの実行タイミング。毎日 5:00 JST。 |
| ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_RUN_AT_DESCRIPTION | 上記 enqueue バッチの実行日時を人間が読める形式で説明。 |

---

## 4. 各設定の取りうる値

| 定数 | 取りうる値 | 備考 |
|------|------------|------|
| WEEKLY_PLANNER_CRON | cron 式（分 時 日 月 曜日） | 例: '0 20 * * 0' = 日曜 20:00。JST 基準で記載。 |
| RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON | cron 式 | 例: '0 23 * * 0' = 日曜 23:00 JST |
| RECURRING_TOURNAMENT_*_RUN_AT_DESCRIPTION | 任意の説明文字列 | UI やドキュメント用 |
| ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON | cron 式 | 例: '0 5 * * *' = 毎日 5:00 JST |
| ENQUEUE_TOURNAMENT_TASKS_*_RUN_AT_DESCRIPTION | 任意の説明文字列 | UI やドキュメント用 |

---

## 5. 各値による動作の変化

| 定数 | 値 | 動作への影響 |
|------|-----|--------------|
| CRON 系 | 変更 | 実行タイミングは TS の環境変数（未設定時は各ファイル内デフォルト）で決まる。Dart の定数は「どの時刻に動くか」のドキュメントとして参照用。TS 側は `functions/.env.*` または Secret Manager で上書き可能。 |
| RUN_AT_DESCRIPTION | 変更 | 説明文のみ変わる。実行ロジックへの影響はない。 |

---

## 6. 参照ファイル一覧

### Dart（lib）

| ファイル | 参照内容 |
|----------|----------|
| lib/globalConstant.dart | 5定数の定義。**他にこれらを参照している Dart ファイルはなし**（現状、UI 等での利用も未確認） |

### TypeScript（functions）

| ファイル | 参照内容 | 備考 |
|----------|----------|------|
| GenerateRecurringTournamentsByScheduler.ts | 環境変数 `RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON`。未設定時は `"0 23 * * 0"`（日曜 23:00 JST）。コールドスタート時に schedule と source を Cloud Logging へ出力。 |
| EnqueueTournamentTasksByScheduler.ts | 環境変数 `ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON`。未設定時は `'0 5 * * *'`（毎日 5:00 JST）。同上。 |
| weeklyPlanner.ts | 環境変数 `WEEKLY_PLANNER_CRON`。未設定時は `'0 11 * * 0'`（UTC 11:00 = JST 20:00、日曜）。同上。 |
