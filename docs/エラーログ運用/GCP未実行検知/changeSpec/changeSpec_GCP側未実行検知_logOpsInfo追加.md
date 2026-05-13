# changeSpec: GCP側未実行検知 — `logOpsInfo` 追加と start ログ

## 1. 文書情報

- **文書名**: changeSpec: GCP側未実行検知 — `logOpsInfo` 追加と start ログ
- **作成日**: 2026-05-14
- **対象フェーズ**: Firebase Cloud Functions（ログ出力のみ。GCP アラート設定は含まない）
- **対象範囲**:
  - 共通ヘルパ `logOpsInfo` の追加
  - 本書 §6 に列挙する **11 ターゲット** の handler 入口における **`eventType: "start"`** の構造化ログ追加
- **非対象範囲**:
  - §12「今回やらないこと」に記載のものすべて
  - 本書 §6 に含まれない関数（例: `weeklyPlanner`、`scheduledCleanup`、`scheduleGenerateNextYearBusinessHours`、HTTP Cloud Tasks のみで動く assessment 以外の経路など）

---

## 2. 背景

Cloud Functions 内で発生した業務エラー・外部 API エラー・想定外エラーは、原則 **`logOpsError`** で検知できる前提とする。

一方、次のような異常は **関数コードに到達しない**、または **到達した証跡がログ上で一意に追えない** ことがあり、`logOpsError` だけでは拾えない。

- Scheduler が関数を呼んでいない
- Task Queue / Cloud Tasks が handler に配送していない
- HTTP Task が handler 入口に到達していない
- task は作成済みだが対象 handler が呼ばれていない
- 本来あるべき「到達」ログが無く、未実行・未配送・未到達と完了・失敗が区別しづらい

既存の **`logOpsSuccess`** は **正常完了の証跡**であり、handler ごとに「完了まで進んだことを意味しないログ」（早期 return、noop、別経路）や **`logger.info` のみ**のケースもあり、**到達証跡として一律には使えない**。

そのため、**handler に到達したことを示す構造化ログ**として、`logOpsInfo`（`eventType: "start"`）を追加する。

---

## 3. 目的

- **handler に到達したこと**を構造化ログで残す。
- **未実行・未配送・未到達**の検知に使える証跡を用意する（後続の Cloud Monitoring / Logs Explorer / 未実行検知設計で利用可能な検索キーを整える）。
- **到達（info）・完了（success）・失敗（error）** のログ責務を分離する。

---

## 4. 非目的

- **`logOpsError` の設計変更**（フィールド定義・`*Source` の変更など）はしない。
- 既存 **`logOpsSuccess` を削除・置換**しない。
- **業務ロジックの変更**はしない（分岐・計算結果・DB 更新内容を変えない）。※ログ追加および **`logOpsInfo` ヘルパ追加のみ**とする。
- **retry / replay / 自動復旧**は実装しない。
- **Firestore 状態監視**（doc の stuck 検知など）は今回の対象外。
- **GCP アラート設定そのもの**（ポリシー JSON、通知チャネル）は今回の対象外。
- **大きな payload・個人情報・不要なリクエスト全文**をログに載せない。

---

## 5. 変更方針

### 5.1 ログの役割分担（確定）

| ログ | 役割 |
|------|------|
| `logOpsInfo` | handler に**到達した**証跡。未実行・未配送・未到達の検知に使う |
| `logOpsSuccess` | 処理が**正常完了した**証跡。既存の完了ログとして残す |
| `logOpsError` | 処理中に**失敗した**証跡。既存の失敗ログとして残す |

### 5.2 `logOpsInfo` 共通ヘルパ

- **`functions/src/shared/logging/logOpsError.ts`**（既存ファイル）に **`logOpsInfo`** を追加する（実装時にファイル分割するかは任意だが、既存 `logOpsSuccess` と同一ファイル内での追加が望ましい）。
- 出力は **`logger.info`** を使用し、**構造化ペイロード**を第 2 引数として渡す（`logOpsSuccess` と同様のパターン）。
- 付与するフィールド（基本仕様・確定）:

```text
{
  outcome: "info",
  eventType: "start",
  service,       // 既存の functionEntry -> service マッピング（serviceByFunctionEntry）に従う
  functionEntry, // 対象 handler の entry 名（既存 logOps 系と同一命名）
  operation,     // 原則 "start"
  projectId,     // 既存 logOps 系と同様に付与
  context        // 対象特定に必要な最小限の相関 ID のみ（任意キーは実装時に §6 と整合させる）
}
```

- **本 ChangeSpec では `eventType` は `"start"` のみを使用する。** 将来的に `checkpoint` や `received`、`skip` など別種の info ログを `logOpsInfo` に載せる場合は、**別 ChangeSpec で用途・検索キー・運用判定を定義する**（必須ではないが、`logOpsInfo` が雑多な info ログの置き場になるのを防ぐための方針）。
- **メッセージ文字列**（第 1 引数）は実装時に決めるが、`functionEntry` と `eventType` がログ検索で追える短文とすること（例: `` `${functionEntry} start` `` など）。既存 `logOpsSuccess` / `logOpsError` の文体と揃える。

### 5.3 start ログの出力位置（原則）

| 原則 | 内容 |
|------|------|
| タイミング | handler 入口で **request / payload から相関 ID を最小限取り出した直後** |
| 禁止寄りの順序 | **Firestore read より前**、**外部 API より前**、**主要 validation より前**、**業務処理より前** |
| 例外 | 入口直後では相関 ID が取れない場合は、**無理に遅らせず**取得可能な **最小 ID のみ**で start を出す（詳細は §10） |
| `controlHookHttp` | **payload 形式の分岐判定の直後**に start を出す（理由: 新 payload と旧 payload で載せられる相関 ID が異なるため。**この時点で取得できないフィールドは context に含めない**） |

### 5.4 既存ログとの関係

- 既存 **`logOpsSuccess` / `logOpsError` はそのまま残す**。
- start の **`logOpsInfo` は追加のみ**。同一 handler で **start →（処理）→ success または error** の順で残ることを期待する。

---

## 6. 対象関数と start `context`（最小項目）

実装対象は **次の 11 件**。

| # | 対象 | `operation` | `context` 最小項目（目標） |
|---|------|---------------|---------------------------|
| 1 | `schedulerSupervisor` | `start` | `planningDate`, `supervisorRunId` |
| 2 | `executeScheduledJobTask` | `start` | `jobKey`, `idempotencyKey`, `supervisorRunId`, `plannedRunAt` |
| 3 | `processStaffPayroll` | `start` | `runId`, `paymentPeriodKey`, `staffId` |
| 4 | `finalizePayrollRun` | `start` | `runId`, `paymentPeriodKey` |
| 5 | `openAssessmentTask` | `start` | `action`, `intendedBusinessDateKey`, `idempotencyKey` |
| 6 | `closeAssessmentTask` | `start` | `intendedBusinessDateKey`, `idempotencyKey` |
| 7 | `controlHookHttp` | `start` | `tournamentId`, `taskType`, `planVersion`, `planHash`（**新 payload で取得できる場合**） |
| 8 | `processPayrollNotifications` | `start` | `todayStr` **または** `targetDate`、`recentPeriodKey` |
| 9 | `payrollNotificationScheduler` | `start` | `targetDate`, `notificationHour`, `scheduleTimeUtc` |
| 10 | `enqueueTournamentTasksByScheduler` | `start` | **スケジュールレンジ相当**（実装上は `rangeStartAt`, `rangeEndAt` など入力フィールド名に合わせる） |
| 11 | `generateRecurringTournamentsByScheduler` | `start` | `evaluationDate`, `windowEndDate` |

### 6.1 実装時に確認すること（相関 ID と「Firestore read より前」の両立）

- **`schedulerSupervisor`**: 現状、`supervisorRunId` は **`runSchedulerSupervisorCore` 内部で生成**される場合、`handler` 先頭では未取得の可能性がある。**実装時に確認**。対応案の例: （a）start では **`planningDate` のみ**（JST 日付キーをハンドラ先頭で算出できる場合）にし、`supervisorRunId` は省略；（b）**ID 生成だけを業務処理に影響しない形で先頭へ移動できるか**を確認（※業務ロジック変更にならないこと）。
- **`payrollNotificationScheduler`**: `notificationHour` / `scheduleTimeUtc` は **`getPayrollConfig` 等の読み取り後**でしか確定しない可能性がある。**Firestore read より前**の方針と矛盾する場合は、start の `context` は **`targetDate` のみ**など取得可能な最小セットに留め、時刻系は **`logOpsSuccess` 側で担保**する。実装時に確認。
- **`processPayrollNotifications`**: `recentPeriodKey` は **store の payroll 設定読み取り後**でしか算出できない場合がある。その場合、start は **`todayStr` / `targetDate` のみ**とし、`recentPeriodKey` は省略する。実装時に確認。
- **`controlHookHttp`**: **旧 payload** では `taskType` / `planVersion` / `planHash` が無い。**新／旧で context のキー構成が異なる**ため、start の `context` は **その時点で取得可能な最小項目のみ**（例: 旧は `action`, `tournamentId`, `rev` など）。**request ボディ全文は載せない**。
- **`openAssessmentTask` / `closeAssessmentTask`**: `idempotencyKey` は payload 検証・組み立て後でないと確定しない場合、**確定直後（かつ Firestore read より前）**で start を出す。それでも無理なら **`intendedBusinessDateKey` と `action` のみ**で start する。実装時に確認。

---

## 7. 実装単位

### Step 1: `logOpsInfo` 共通ヘルパ追加

- **ファイル**: `functions/src/shared/logging/logOpsError.ts`
- **内容**:
  - 型 `LogOpsInfoArgs`（例: `message`, `functionEntry`, `operation`, `projectId?`, `context?`）を定義
  - `logOpsInfo(args)` を実装し、`logger.info(message, payload)` で出力
  - `payload` に **`outcome: "info"`**, **`eventType: "start"`**（今回は start のみ使用）、`service`（既存 `resolveServiceForFunctionEntry` と同等の解決）、`functionEntry`, `projectId`, `operation`, `context` を載せる
- **`serviceByFunctionEntry.ts`**: §6 の対象はいずれも **既存の `functionEntry` 名**と揃える前提である。その場合は **マッピング変更不要**でよい。一方、`logOpsInfo` 実装で **`service` 解決が必須**となり、**既存マッピングで解決できない `functionEntry` が生じた場合**は、**本 ChangeSpec の実装範囲内で必要最小限の mapping 追加を行う**（ビルド・実行時エラー回避のため）。任意の新規命名で `functionEntry` を増やす場合は避け、増やす場合も別 ChangeSpec で名前と service を明示する。

### Step 2: start ログ追加（11 ターゲット）

- §6 の表に従い、各 handler で **`logOpsInfo`** を 1 回呼ぶ。
- §5.3 の出力位置方針を守る。
- **`scheduledJobTaskExecutors.ts`** の `executeScheduledJobTask` は、**payload パース成功直後**かつ **既存の `writeSchedulerExecutionLogByCloudTaskBestEffort({ eventType: "started" })` より前**に start を置くこと（Firestore write より前であること）。

### Step 3: テスト追加・更新

- 既存テスト構成を確認し、必要範囲で以下を検証する。
  - `logOpsInfo` が **`logger.info` を呼ぶ**
  - payload に **`outcome: "info"`**, **`eventType: "start"`** が含まれる
  - `functionEntry` / `operation` / `context` が含まれる
  - 対象 handler で start が呼ばれる（モックまたはスパイ）
  - 既存 **`logOpsSuccess` / `logOpsError`** の挙動を壊していない

---

## 8. ログ検索・未実行検知での使い方（考え方）

- **未実行検知の第一候補**: `logOpsInfo` 相当の構造化ログで **`eventType == "start"`**（実装時にフィールド名が Cloud Logging 上でどう見えるかは環境確認）。
- **`functionEntry`** で対象関数を絞る。
- 必要に応じて **`context.runId`**, **`context.staffId`**, **`context.jobKey`**, **`context.tournamentId`** などで絞る。
- **start が無い** → **未実行・未配送・未到達疑い**（GCP 側ログとの併用は別設計）。
- **start あり + `logOpsError` あり** → handler **到達後に失敗**。
- **start あり + `logOpsSuccess` あり** → handler **到達後、正常完了**（実装上、noop など完了ログの意味が薄い handler は別紙の運用判定で吸収）。

※ Logs Explorer の正式クエリは **今回の対象外**（§12）。実装マージ後にサンプルログで確定する。

---

## 9. 期待する運用判定（参考）

| 状態 | 判定 |
|------|------|
| `logOpsInfo`（`eventType: "start"`）なし | 未実行・未配送・未到達**疑い** |
| start あり + `logOpsError` あり | handler **到達後に失敗** |
| start あり + `logOpsSuccess` あり | handler **到達後**、**正常完了**（※完了の定義は既存 success と同じ） |
| start あり + `logOpsSuccess` なし + `logOpsError` なし | **処理中**、ログ欠落、早期 return、または **追加確認対象** |

---

## 10. リスク・注意点

- start を出す位置が**遅すぎる**と、Cloud Tasks / Scheduler の観点では「到達証跡」として弱い。
- start を出す位置が**早すぎる**と、相関 ID が不足する（§6.1）。
- `context` を増やしすぎると **ログサイズ・個人情報リスク**が増える。**最小限**に留める。
- **`controlHookHttp`** は payload 形式ごとに相関 ID が異なる（§6.1）。
- **`processPayrollNotifications`** は現状 **完了証跡が弱い**ため、**start 追加の効果が大きい**一方、**完了は引き続き `logOpsSuccess` の有無や既存 info に依存**する点に注意。
- **start は「正常完了」を意味しない**。完了は **`logOpsSuccess`**、失敗は **`logOpsError`** で判断する。

---

## 11. 検証観点

- **`npm run build`**（`functions`）が通ること。
- **対象テスト**（追加・更新したもの）が通ること。
- **`logOpsInfo` 単体テスト**（payload 形状）。
- 既存 **`logOpsSuccess` / `logOpsError` テスト**への影響がないこと。
- 各対象 handler で **start が意図したタイミング**で呼ばれること（§5.3）。
- payload に **不要な個人情報・大きな配列・リクエスト全文**が入っていないこと。
- **`service`** が既存マッピングから解決できること（解決できない `functionEntry` が無いこと）。
- **`functionEntry`** が既存命名と一致すること。

---

## 12. 今回やらないこと

- Cloud Monitoring **アラート作成**
- Logs Explorer **クエリ確定**
- Firestore **状態監視**
- **自動復旧**
- **replay Callable**
- **retry 設計変更**
- 既存 **成功ログの意味変更**
- 既存 **エラーログの大規模改修**

---

## 13. 完了条件

- 本 ChangeSpec がリポジトリに作成されている。
- `logOpsInfo` の **payload 仕様**と **出力位置方針**が明記されている。
- 対象 **11 件**と **各 `context` 最小項目**が明記されている。
- **start / success / error** の役割分担が明記されている。
- **実装 Step** と **検証観点**が明記されている。

---

## 付録 A: 実装時に確認すべき主なファイル候補

| 種別 | パス |
|------|------|
| 共通ログ | `functions/src/shared/logging/logOpsError.ts` |
| service 解決 | `functions/src/shared/logging/serviceByFunctionEntry.ts` |
| Supervisor | `functions/src/domains/scheduler/supervisor/schedulerSupervisor.ts` |
| Scheduled job 実行口 | `functions/src/domains/scheduler/tasks/scheduledJobTaskExecutors.ts` |
| Payroll tasks | `functions/src/domains/attendance/tasks/processStaffPayroll.ts` |
| | `functions/src/domains/attendance/tasks/finalizePayrollRun.ts` |
| | `functions/src/domains/attendance/tasks/processPayrollNotifications.ts` |
| Payroll scheduler | `functions/src/domains/attendance/scheduler/payrollNotificationScheduler.ts` |
| HTTP assessment | `functions/src/domains/storeMeta/callables/openAssessmentTask.ts` |
| | `functions/src/domains/storeMeta/callables/closeAssessmentTask.ts` |
| Tournament control | `functions/src/shared/http/controlHook.ts` |
| Tournament scheduler タスク本体 | `functions/src/domains/tournament_createTournament/scheduler/EnqueueTournamentTasksByScheduler.ts` |
| | `functions/src/domains/tournament_createTournament/scheduler/GenerateRecurringTournamentsByScheduler.ts` |
