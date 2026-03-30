# scheduler To-Be 詳細仕様書

作成日: 2026-03-30  
最終整理: 2026-03-30  
元仕様: `docs/環境変数きれい化/仕様書/tobe仕様書_全体像.md`

## 1. スコープ

Cloud Scheduler 起点の定期実行を、監視用 scheduler + Cloud Tasks 駆動へ統一する。  
定期実行設定は `storeMeta/schedulerConfig` に一本化する。  
`monthlyPayrollTrigger` は削除対象のため本仕様の対象外とする。

## 2. 全体アーキテクチャ（確定）

- 監視用 scheduler（`schedulerSupervisor`）を毎日 `03:00 JST` に実行する。
- `schedulerSupervisor` は `storeMeta/schedulerConfig` を参照し、今後 7 日分の実行計画を task 化する。
- 監視用 scheduler が投入する queue は `1関数1queue` とする。
- queue 命名規約は `scheduled-job-{function}` に統一する。
- 自動 catch-up は初期実装では必須としない。必要時は手動再実行で補完する。
- 再実行は許容する（idempotency 前提）。

## 3. 対象ジョブ（No.6除外）

| No | 対象関数 | queue 名 | 実行関数の振る舞い |
|---|---|---|---|
| 1 | `weeklyPlanner` | `scheduled-job-weekly-planner` | task起動後、翌週7日分の開店/閉店認定 task を作成 |
| 2 | `enqueueTournamentTasksByScheduler` | `scheduled-job-enqueue-tournament-tasks-by-scheduler` | task起動後、現行ロジックで tournament task を作成 |
| 3 | `generateRecurringTournamentsByScheduler` | `scheduled-job-generate-recurring-tournaments-by-scheduler` | task起動後、直接 Firestore 読み書き処理。現行どおり条件付き enqueue を残す |
| 4 | `scheduledCleanup` | `scheduled-job-scheduled-cleanup` | task起動後、直接削除処理を実行 |
| 5 | `scheduleGenerateNextYearBusinessHours` | `scheduled-job-schedule-generate-next-year-business-hours` | task起動後、直接生成処理を実行 |
| 7 | `payrollNotificationScheduler` | `scheduled-job-payroll-notification-scheduler` | task起動後、通知系 task を作成（当日分のみ） |

補足:
- No.2 の内部検索範囲（`now-6h ～ +14日`）は現行どおり維持する。
- No.7 は通知時刻変更の即時反映を優先し、当日分のみ task 作成とする。

## 4. `storeMeta/schedulerConfig` 最終スキーマ

### 4.1 ルート項目

| 項目 | 型 | 必須 | デフォルト | バリデーション | 役割 |
|---|---|---|---|---|---|
| `schemaVersion` | `number` | はい | `1` | 整数、`>=1` | スキーマ互換管理 |
| `updatedAt` | `Timestamp` | はい | `serverTimestamp()` | Firestore Timestamp | 変更監査 |
| `supervisorEnabled` | `boolean` | はい | `true` | boolean | 監視scheduler全体のON/OFF |
| `supervisorRunAtJst` | `string` | はい | `"03:00"` | `HH:mm` | 監視scheduler起動時刻 |
| `planningHorizonDays` | `number` | はい | `7` | 整数、`1..14` | 先行作成日数 |
| `jobs` | `object` | はい | `{}` | object | ジョブ別設定コンテナ |

### 4.2 `jobs.<jobKey>` 共通項目

| 項目 | 型 | 必須 | デフォルト | バリデーション | 役割 |
|---|---|---|---|---|---|
| `enabled` | `boolean` | はい | `true` | boolean | ジョブ単位ON/OFF |
| `scheduleKind` | `"daily" \| "weekly" \| "yearly"` | はい | ジョブ依存 | enum | 実行周期 |
| `runAtJst` | `string` | はい | ジョブ依存 | `HH:mm` | 実行時刻 |
| `dayOfWeek` | `number` | `weekly` 時のみ必須 | なし | `0..6` | 週次の曜日 |
| `month` | `number` | `yearly` 時のみ必須 | なし | `1..12` | 年次の月 |
| `dayOfMonth` | `number` | `yearly` 時のみ必須 | なし | `1..31` | 年次の日 |
| `timezone` | `string` | はい | `"Asia/Tokyo"` | `"Asia/Tokyo"` 固定 | 時刻解釈の統一 |

### 4.3 `jobKey` 定義

| key | 対象 |
|---|---|
| `weeklyPlanner` | No.1 |
| `enqueueTournamentTasks` | No.2 |
| `generateRecurringTournaments` | No.3 |
| `scheduledCleanup` | No.4 |
| `generateNextYearBusinessHours` | No.5 |
| `payrollNotification` | No.7 |

## 5. 監視schedulerが作成する task 仕様

### 5.1 payload 必須項目

| 項目 | 型 | バリデーション | 役割 |
|---|---|---|---|
| `schemaVersion` | `number` | 整数、`>=1` | payload互換管理 |
| `functionName` | `string` | 許可関数名 enum | 起動対象関数識別 |
| `plannedRunAt` | `string` | ISO8601 UTC | 予定実行時刻 |
| `planningDate` | `string` | `YYYY-MM-DD` | 計画基準日 |
| `idempotencyKey` | `string` | 空文字不可 | 再実行/重複判定 |
| `supervisorRunId` | `string` | 空文字不可 | 監視実行単位の追跡 |
| `scheduleFingerprint` | `string` | 空文字不可 | 設定差分の識別 |
| `projectId` | `string` | 空文字不可 | 店舗識別 |
| `enqueuedAt` | `string` | ISO8601 UTC | 投入時刻 |

### 5.2 task 名

- deterministic task name を使用する。
- 形式: `{functionName}_{plannedRunAtIso}`
- 衝突（`ALREADY_EXISTS`）は skip 扱いとする。

## 6. トーナメント No.2 / No.3 の扱い

### 6.1 現行で有効な点（維持）

- No.2 は `now-6h ～ +14日` で対象探索し、task 作成する。
- `taskSyncNeeded=true` を再同期の起点にできる。
- `controlHook` の `schedulePlanVersion` / `planHash` 照合で古い task を no-op 化できる。
- No.3 は条件付きで enqueue に委譲する現行挙動を維持する。

### 6.2 補正必須点（To-Be）

- スケジュールに影響する更新（`startAt` / `blindStructure` / `startTime` / recurrence由来の時間変更）では、必ず同時に以下を更新する。
  - `schedulePlanVersion` をインクリメント
  - `schedulePlanUpdatedAt` を更新
  - `regEndAt` を再計算して保存
  - `taskSyncNeeded=true` を設定
- 更新後は日次待ちのみとせず、速やかに再計画を実行する経路を持つ。

## 7. 再計画トリガー

- 主系: Firestore 更新トリガー
- 更新トリガーは直接重い再計画をせず、`replan request` を記録して Cloud Tasks に遅延投入（30〜60秒）する。
- 保険: 手動 callable で任意再計画を可能にする。
- 日次監視は最終セーフティネットとして残す。

## 8. ログ・冪等・保持

### 8.1 ログコレクション

- `schedulerDispatchLogs`
- `schedulerExecutionLogsByCloudTask`

### 8.2 ログ方針

- スキップ時は理由、判定値、日付、`projectId`、関数名を必須出力
- 正常時もログ出力
- `processName` は任意
- `decisionSnapshot` は最小保存（boolean/数値/IDのみ）
- 機密/個人情報は保存禁止
- ログ書き込み失敗は best-effort（業務継続）
- ログ書き込み失敗は Cloud Logging に `error` 出力
- TTL は設定せず恒久保持

### 8.3 冪等方針

- 再実行許容
- deterministic task 名 + `idempotencyKey` を併用
- 重複系は `isSuccess=true` + `eventType=skip` として記録

## 9. onSchedule から task 実行関数への移行

1. 共通基盤実装（`schedulerSupervisor`、payload検証、共通ログ、idempotency）。
2. ジョブ単位で task 実行関数を追加（既存ロジックは services に維持）。
3. ジョブ単位で片系切替（旧 `onSchedule` 無効化、監視経由有効化）。
4. 観測期間で取りこぼし・重複・遅延を確認。
5. 安定後に旧 scheduler コード・export・設定・テストを削除。

## 10. テスト観点

- 監視schedulerの7日先読み
- queue振り分け（1関数1queue）
- payloadバリデーション
- task名衝突時の重複スキップ
- 各関数の task 起動後処理
- 再実行許容時の整合性
- ログ出力の成功/失敗経路
