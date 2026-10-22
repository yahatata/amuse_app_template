# scheduler To-Be 詳細仕様書

作成日: 2026-03-30  
最終整理: 2026-03-31  
元仕様: `docs/環境変数きれい化/仕様書/tobe仕様書_全体像.md`

## 1. スコープ

Cloud Scheduler 起点の定期実行を、監視用 scheduler + Cloud Tasks 駆動へ統一する。  
定期実行設定は `storeMeta/schedulerConfig` に一本化する。  
`monthlyPayrollTrigger` は削除対象のため本仕様の対象外とする。

## 2. 全体アーキテクチャ（確定）

- 監視用 scheduler（`schedulerSupervisor`）を毎日 `03:00 JST` に実行する。
- `schedulerSupervisor` は `storeMeta/schedulerConfig` を参照し、今後 7 日分の実行計画を task 化する。
- 監視用 scheduler が投入する queue は `1関数1queue` とする。
- queue 命名規約は `scheduled-job-{kebab-case(jobKey)}` に統一する。
- 監視用 scheduler が投入する job task の実行先は Task Queue Function とする。
- 実装では、許可された `jobKey` ごとの fixed map で queue 名を管理する。
- job を追加する場合は queue 名 map の更新を必須とする。
- 自動 catch-up は初期実装では必須としない。必要時は手動再実行で補完する。
- 再実行は許容する（idempotency 前提）。
- 監視 scheduler の 7 日先読みは全ジョブ共通とする。
- ただし、task 起動後に各ジョブが扱う業務対象範囲はジョブごとに個別定義とする。
- `schedulerSupervisor` は計画責務と dispatch 管理責務を持つ。
- `schedulerSupervisor` が担うのは `schedulerConfig` 検証、実行計画作成、`targetScope` 生成、task 作成、dispatch ログ出力、重複 task skip までとする。
- 各業務ロジック本体、業務データ更新、実行結果に応じた業務補正は各 job の task 実行関数が担う。

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
- No.1 は木曜 `04:40 JST` 起動をデフォルトとし、翌週の日曜〜土曜分の開店/閉店認定 task を前倒しで計画する。
- No.2 の内部検索範囲（`now-6h ～ +14日`）は現行どおり維持する。
- No.7 は通知時刻変更の即時反映を優先し、当日分のみ task 作成とする。
- 監視 scheduler は 7 日先まで task を計画するが、task 実行関数が処理する業務対象日は payload で固定する。

## 4. `storeMeta/schedulerConfig` 最終スキーマ

### 4.1 ルート項目

| 項目 | 型 | 必須 | デフォルト | バリデーション | 役割 |
|---|---|---|---|---|---|
| `schemaVersion` | `number` | はい | `1` | 整数、`>=1` | スキーマ互換管理 |
| `updatedAt` | `Timestamp` | はい | `serverTimestamp()` | Firestore Timestamp | 変更監査 |
| `supervisorEnabled` | `boolean` | はい | `true` | boolean | 監視scheduler全体のON/OFF |
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

- `jobKey` は関数名と同一にする。
- `schedulerConfig.jobs` のキー、queue 名、task 名、ログ識別子は `jobKey` を基準に統一する。
- queue 名は `jobKey` を kebab-case に正規化して使用する。
- 実装では `jobKey -> queue 名` の固定 map を使用し、map の値が `scheduled-job-{kebab-case(jobKey)}` 規約に一致するよう管理する。

| key | 対象 |
|---|---|
| `weeklyPlanner` | No.1 |
| `enqueueTournamentTasksByScheduler` | No.2 |
| `generateRecurringTournamentsByScheduler` | No.3 |
| `scheduledCleanup` | No.4 |
| `scheduleGenerateNextYearBusinessHours` | No.5 |
| `payrollNotificationScheduler` | No.7 |

### 4.4 `schedulerConfig` 実データ例

```json
{
  "schemaVersion": 1,
  "updatedAt": "<serverTimestamp>",
  "supervisorEnabled": true,
  "planningHorizonDays": 7,
  "jobs": {
    "weeklyPlanner": {
      "enabled": true,
      "scheduleKind": "weekly",
      "runAtJst": "04:40",
      "dayOfWeek": 4,
      "timezone": "Asia/Tokyo"
    },
    "enqueueTournamentTasksByScheduler": {
      "enabled": true,
      "scheduleKind": "daily",
      "runAtJst": "05:00",
      "timezone": "Asia/Tokyo"
    },
    "generateRecurringTournamentsByScheduler": {
      "enabled": true,
      "scheduleKind": "weekly",
      "runAtJst": "04:50",
      "dayOfWeek": 4,
      "timezone": "Asia/Tokyo"
    },
    "scheduledCleanup": {
      "enabled": true,
      "scheduleKind": "daily",
      "runAtJst": "05:00",
      "timezone": "Asia/Tokyo"
    },
    "scheduleGenerateNextYearBusinessHours": {
      "enabled": true,
      "scheduleKind": "yearly",
      "runAtJst": "05:10",
      "month": 1,
      "dayOfMonth": 29,
      "timezone": "Asia/Tokyo"
    },
    "payrollNotificationScheduler": {
      "enabled": true,
      "scheduleKind": "daily",
      "runAtJst": "05:00",
      "timezone": "Asia/Tokyo"
    }
  }
}
```

### 4.5 `jobKey` ごとのデフォルト実行設定

以下は初期投入するデフォルト値であり、最終的な有効値は `storeMeta/schedulerConfig` の設定値を正とする。

| `jobKey` | `scheduleKind` | `runAtJst` | 補助項目 | 意図 |
|---|---|---|---|---|
| `weeklyPlanner` | `weekly` | `04:40` | `dayOfWeek=4` | 水曜までに翌週分を整理し、木曜早朝に翌週の日曜〜土曜分 task を前倒し作成する |
| `enqueueTournamentTasksByScheduler` | `daily` | `05:00` | なし | 毎朝の tournament task 同期 |
| `generateRecurringTournamentsByScheduler` | `weekly` | `04:50` | `dayOfWeek=4` | `weeklyPlanner` の前後関係を崩さず、木曜早朝に recurring 生成を行う |
| `scheduledCleanup` | `daily` | `05:00` | なし | 毎朝の cleanup 実行 |
| `scheduleGenerateNextYearBusinessHours` | `yearly` | `05:10` | `month=1`, `dayOfMonth=29` | 翌年営業時間生成 |
| `payrollNotificationScheduler` | `daily` | `05:00` | なし | 当日分通知 task 作成 |

## 5. 監視schedulerが作成する task 仕様

### 5.1 payload 必須項目

| 項目 | 型 | バリデーション | 役割 |
|---|---|---|---|
| `schemaVersion` | `number` | 整数、`>=1` | payload互換管理 |
| `jobKey` | `string` | 許可関数名 enum | 起動対象関数識別 |
| `plannedRunAt` | `string` | ISO8601 UTC | 予定実行時刻 |
| `planningDate` | `string` | `YYYY-MM-DD` | 計画基準日 |
| `targetScope` | `object` | jobごとの必須項目を含む object | 業務対象の固定 |
| `idempotencyKey` | `string` | 空文字不可 | 再実行/重複判定 |
| `supervisorRunId` | `string` | 空文字不可 | 監視実行単位の追跡 |
| `scheduleFingerprint` | `string` | 空文字不可 | 設定差分の識別 |
| `projectId` | `string` | 空文字不可 | 店舗識別 |
| `enqueuedAt` | `string` | ISO8601 UTC | 投入時刻 |

### 5.2 `targetScope` 定義

| 対象関数 | `targetScope` 必須項目 | 役割 |
|---|---|---|
| `weeklyPlanner` | `targetWeekStartDate: string` | どの週の開閉店認定 task を作るか固定する |
| `enqueueTournamentTasksByScheduler` | `rangeStartAt: string`, `rangeEndAt: string` | どの期間の tournament を評価するか固定する |
| `generateRecurringTournamentsByScheduler` | `evaluationDate: string`, `windowEndDate: string` | どの時点基準で生成判定するか固定する |
| `scheduledCleanup` | `cutoffDate: string` | どの時点以前を削除対象にするか固定する |
| `scheduleGenerateNextYearBusinessHours` | `targetYear: number` | 何年分を生成するか固定する |
| `payrollNotificationScheduler` | `targetDate: string` | どの日付の通知判定か固定する |

### 5.3 `targetScope` 生成ルール

`targetScope` は、task が遅延実行または再実行された場合でも、当初意図した業務対象を固定するために `schedulerSupervisor` が task 作成時に決定する。

| 対象関数 | 生成ルール |
|---|---|
| `weeklyPlanner` | `plannedRunAt` を JST 解釈した基準日から見て、翌週の日曜を `targetWeekStartDate` とする |
| `enqueueTournamentTasksByScheduler` | `rangeStartAt = plannedRunAt - 6時間`、`rangeEndAt = plannedRunAt + 14日` とする |
| `generateRecurringTournamentsByScheduler` | `evaluationDate = plannedRunAt` の JST 日付、`windowEndDate = evaluationDate + 3か月` とする |
| `scheduledCleanup` | `cutoffDate = plannedRunAt - 7日` の JST 日付とする |
| `scheduleGenerateNextYearBusinessHours` | `targetYear = plannedRunAt` の JST 年 + 1 とする |
| `payrollNotificationScheduler` | `targetDate = plannedRunAt` の JST 日付とする |

### 5.4 task 名

- deterministic task name を使用する。
- 形式: `{jobKey}_{YYYYMMDDTHHmmssZ}`
- `plannedRunAt` は task 名に含める際、UTC 基準の `YYYYMMDDTHHmmssZ` 形式へ正規化する。
- 例: `weeklyPlanner_20260402T194000Z`
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
- 更新後は日次待ちのみとせず、`enqueueTournamentTasksByScheduler` 向けの再計画経路を速やかに実行する。

## 7. 再計画トリガー

### 7.1 対象

- 本章の再計画は `enqueueTournamentTasksByScheduler` 向けの再計画を対象とする。
- `scheduledTournaments` の `taskSyncNeeded`、`schedulePlanVersion`、`schedulePlanUpdatedAt`、`regEndAt` を用いた現行の整合管理は維持する。
- 旧 task を `controlHook` 側で無害化する前提も維持する。

### 7.2 保存場所

- 再計画要求は `storeMeta` 配下ではなく、独立コレクション `enqueueTournamentTasksReplanRequests` に保存する。
- ドキュメントIDは固定で `enqueueTournamentTasksByScheduler` とする。
- 本コレクションは「設定」ではなく「再計画要求」を表す一時的な制御情報として扱う。

#### `enqueueTournamentTasksReplanRequests` 推奨スキーマ

```typescript
export interface EnqueueTournamentTasksReplanRequest {
  requestType: 'enqueueTournamentTasksByScheduler';
  projectId: string;
  requestedAt: Timestamp;
  requestedBy: 'firestore-trigger' | 'manual-callable';
  reason:
    | 'scheduledTournamentUpdated'
    | 'templateUpdated'
    | 'recurrenceUpdated'
    | 'manual';
  isProcessing: boolean;
  lastTriggeredAt?: Timestamp;
  lastCompletedAt?: Timestamp;
  targetRangeStartAt: Timestamp;
  targetRangeEndAt: Timestamp;
  aggregateVersion: number;
}
```

#### `enqueueTournamentTasksReplanRequests` 運用ルール

- 再計画要求は 1 ドキュメントに集約し、更新時は `upsert` する。
- `requestedAt` は request 更新のたびに最新値へ更新する。
- `requestedBy` は request 起点の識別に用いる。
- `reason` は再計画要求の代表理由を保持する。
- `isProcessing` は再計画 task の二重起動防止の補助に用いる。
- `lastTriggeredAt` は再計画 task を投入した時刻、`lastCompletedAt` は再計画処理完了時刻を保持する。
- `targetRangeStartAt` / `targetRangeEndAt` は今回の再計画対象範囲を明示する。
- `aggregateVersion` は request 更新回数の追跡用とし、上書きのたびにインクリメントする。
- 掃除運用は現時点では実装しない。将来検討事項として [掃除検討の必要性があるデータ.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/掃除検討の必要性があるデータ.md) に記録する。

### 7.3 更新時の動作

- 主系は Firestore 更新トリガーとする。
- `scheduledTournaments`、template、recurrence のうち、tournament の実行計画に影響する更新が発生した場合は、更新処理の中で直接重い再計画を行わない。
- 代わりに、対象ドキュメント更新完了後に `enqueueTournamentTasksReplanRequests/enqueueTournamentTasksByScheduler` を upsert し、再計画要求を集約する。
- その後、再計画実行用の Cloud Tasks を `60秒` 遅延で投入する。
- `60秒` は短時間の連続更新をまとめて吸収しやすく、一般的な debounce として扱いやすい値とする。

### 7.4 再計画時の対象範囲

- 再計画処理が task を再作成する範囲は、日次処理と同じく `now-6h ～ +14日` とする。
- 更新起点の再計画でも、この範囲を超える将来 task は作成しない。
- 30日超の将来 task は Cloud Tasks の制約に抵触しうるため、本再計画処理では対象外とする。
- 30日超の将来分や今回の対象範囲外の分は、後続の日次監視で順次補完する。

### 7.5 補助手段

- 保険として、手動 callable による任意再計画を可能にする。
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

## 11. フェーズ対応メモ

- 本仕様書は `フェーズ B: scheduler 基盤` と `フェーズ C: scheduler 各 job 移行` に分割して実装する。
- `2. 全体アーキテクチャ`、`4. schedulerConfig 最終スキーマ`、`5. task 仕様`、`7. 再計画トリガー`、`8. ログ・冪等・保持` の基盤部分はフェーズ B で反映する。
- `3. 対象ジョブ`、`6. トーナメント No.2 / No.3 の扱い`、`7.3 以降の job 別再計画動作`、`9. onSchedule から task 実行関数への移行` はフェーズ C で反映する。
- `monthlyPayrollTrigger` 除外と旧経路削除の完了確認はフェーズ E と接続する。
- 本仕様書の内容は `docs/環境変数きれい化/フェーズ設計_詳細仕様対応表.md` で全体フェーズに割り当て済みであり、未対応章はない。
