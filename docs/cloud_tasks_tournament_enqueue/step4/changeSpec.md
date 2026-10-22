# Step 4 changeSpec：enqueue 専用 function の新規作成

## 1. 概要

### 1.1 目的

`spec.md` 4 に基づき、**日次 enqueue バッチ** を実装する。Cloud Tasks の 30 日制限に対応するため、scheduledTournament 作成・編集時には直接 Cloud Tasks を投入せず、本 enqueue function が対象期間内のトーナメントを取得し、taskIndex との突合・Cloud Tasks 投入を行う。

- Step 1〜3 で enqueue 呼び出しを削除し、taskSyncNeeded を立てる設計とした前提で、本ステップで「いつ・どの範囲を・どのように投入するか」を実装する
- 単一キュー（TASKS_QUEUE）に投入し、作成経路による分岐を廃止する
- Step 6 で controlHook の payload 受付を変更するが、本ステップでは **Cloud Tasks に投入する payload の形式** を新仕様で定義する

### 1.2 スコープ

| 種別 | 対象 |
|------|------|
| 新規 | `enqueueTournamentTasksCore.ts`（コアロジック） |
| 新規 | `enqueueTournamentTasks.ts`（Callable） |
| 新規 | `EnqueueTournamentTasksByScheduler.ts`（日次 Scheduler） |
| 修正 | `tasks.ts`（新 enqueue 関数追加。既存 enqueueStartTask / enqueueRegistTask は deprecated コメント付与のみ。削除は Step 7/8 で実施） |
| 修正 | `index.ts`（export 追加） |
| 修正 | `lib/globalConstant.dart`（enqueue Scheduler 用 cron 定数追加） |
| 確認 | `firestore.indexes.json`（必要に応じてインデックス追加） |

**非対象**：controlHook の payload 受付変更（Step 6）、作成処理からの enqueue 呼び出し（Step 5）

**デプロイ順序**：本ステップで投入する payload は新仕様のため、controlHook が新 payload を受け付ける **Step 6 と同時デプロイ**、または Step 6 先行デプロイが必要。そうでない場合、Scheduler 実行で作成されたタスクが controlHook で処理できずエラーになる。

**Scheduler の運用**：Step 6 デプロイ完了まで **Scheduler を無効化** する。例：実装時に feature flag で即 return する、または Scheduler のデプロイを Step 6 と同時に行う。Callable は手動実行用だが、Step 6 前に実行すると投入したタスクが controlHook で処理できず失敗する点を明記する。

---

## 2. 前提・依存

### 2.1 Step 2 で追加済みの scheduledTournament フィールド

| フィールド | 型 | 備考 |
|------------|-----|------|
| schedulePlanVersion | number | 未設定時は 0 とみなす（Step 8 は本プロジェクトではスキップ。防御的フォールバックとして維持） |
| schedulePlanUpdatedAt | Timestamp | 任意 |
| taskSyncNeeded | boolean | enqueue 対象判定の **主ゲート**。taskSyncReason で分岐しない |
| taskSyncReason | string[] | 参照しない（Step 3 で cancelled 時に残存するため） |

### 2.2 Step 3 の taskSyncNeeded ルール

- 作成時：true
- blindStructure 変更・startAt 変更・template 変更時：true
- cancelled のみ：false（reason/version は消さない）
- enqueue 完了時：false に更新（本ステップの責務）

### 2.3 対象外トーナメント

| 条件 | 扱い |
|------|------|
| status !== 'scheduled' | クエリで除外（cancelled, running, registered, ended 等） |
| isArchived === true | クエリで除外（deleteTournamentRecurrence でアーカイブされたもの） |

---

## 3. regEndAt 再計算仕様

### 3.1 計算式（Step 3 changeSpec 2.1 準拠）

| 項目 | 内容 |
|------|------|
| 算出元 | `plannedRegistAt` と同一。`startAt` + blindTemplate 由来の duration 合計 |
| 計算式 | `regEndAt = startAt + totalDurationSec` |
| totalDurationSec | `blindTemplates/{blindStructureId}` の `levels` に対し、**lateRegUntilLev+1 のレベルが始まる直前まで**の level の `duration`（分）の合計を秒に変換。`hasBreakAfter` の break を含む |
| 必要データ | `startAt`（scheduledTournament）、`snapshot.blindStructure` or `snapshot.blindStructureId`、`blindTemplates/{id}` の `levels`, `lateRegUntilLev`, `breakDuration` |

### 3.2 既存実装との整合

`createScheduledTournament.ts`（285〜303 行目）、`generateRecurringTournamentsCore.ts`（294〜308 行目）と同様のロジックを用いる。stages を生成し、lateRegUntilLev+1 の level 直前までの totalDurationSec を合計する。

### 3.3 計算不能時のフォールバック

| 状況 | フォールバック |
|------|----------------|
| blindTemplate が存在しない | **closeRegistration タスクを作らない**（スキップ）。即時締切は運用事故となるため |
| levels が空 | 同上 |
| lateRegUntilLev が 0 | 同上 |

計算不能時は taskIndex を failed とするか、pending のまま `lastEvaluatedAt` と `error` を記録し、次回バッチで再試行できるようにする。

---

## 4. taskType と targetAt

### 4.1 採用する taskType（最小セット）

| taskType | 意味 | targetAt | 現行 controlHook の action |
|----------|------|----------|---------------------------|
| startTournament | トーナメント開始（scheduled → running） | startAt | `start` |
| closeRegistration | レジスト締切（running → registered） | regEndAt（再計算値） | `regist` |

**openRegistration**：現行フローに明示的対応がないため、本ステップでは省略する。

### 4.2 targetAt の決定

| taskType | targetAt |
|----------|----------|
| startTournament | scheduledTournament.startAt |
| closeRegistration | 再計算した regEndAt（3 章） |

該当時刻が無い（null/undefined）場合はその taskType をスキップする。

---

## 5. planHash の算出

### 5.1 算出式

同一計画かどうかの判定に用いる。以下の文字列を連結し、SHA-256 等でハッシュ化する（実装では crypto.createHash('sha256').update(...).digest('hex') の 16 文字程度で可）。

**安定性のため**：`targetAt.toISOString()` はタイムゾーン・ミリ秒丸めでズレる可能性があるため、`targetAt.toMillis()`（整数ミリ秒）を使用する。

```
targetAtMillis = targetAt instanceof Timestamp ? targetAt.toMillis() : new Date(targetAt).getTime()
planHashInput = `${taskType}:${tournamentId}:${targetAtMillis}:${planVersion}`
```

| 項目 | 備考 |
|------|------|
| taskType | startTournament / closeRegistration |
| tournamentId | scheduledTournament の docID |
| targetAtMillis | Timestamp.toMillis() または Date.getTime() の整数 |
| planVersion | scheduledTournament.schedulePlanVersion（未設定時 0） |

---

## 6. enqueue 対象クエリ

### 6.1 期間パラメータ（spec.md 4.2）

| パラメータ | 推奨値 | 説明 |
|------------|--------|------|
| horizonDays | 14 | 当日〜14 日後 |
| lookbackHours | 6 | 直前編集・遅延吸収のため過去も含める |
| 対象期間 | now - lookback ～ now + horizon | startAt がこの範囲内のものを取得 |

### 6.2 クエリ条件

**トップコレクション**：`db.collection('scheduledTournaments')` を使用。collectionGroup は使用しない。

```
db.collection('scheduledTournaments')
  .where('status', '==', 'scheduled')
  .where('startAt', '>=', rangeStart)
  .where('startAt', '<', rangeEnd)
  .orderBy('startAt')
```

- **rangeStart**：now - lookbackHours（実行時刻 now は UTC Timestamp。Scheduler は JST 5:00 固定で実行するが、範囲計算は「実行時点からの相対」で UTC で算出）
- **rangeEnd**：now + horizonDays
- **isArchived**：クエリには含めない。取得後に `doc.isArchived === true` の場合はスキップする。Step 2 以前の既存ドキュメントは isArchived 未設定があり、`where('isArchived','==',false)` だとヒットしないため、アプリ側フィルタが安全。
- **拡張ポイント**：`status=='scheduled'` + startAt range で十分絞れる想定。店舗数・tenant 数増加で件数が膨らむ場合に備え、Callable は `tenantId` / `storeId` を引数で渡して分割実行できる設計を将来対応可能にする。Scheduler は当面「全店まとめて」でよいが、将来的に Cloud Tasks で分割実行する余地を残す。

### 6.3 taskSyncNeeded の扱い

**採用方針**：taskSyncNeeded を主ゲートとする。Step 3 で付与した価値を活かす。

- **処理対象**：`taskSyncNeeded === true` または `taskSyncNeeded` が未設定（true 扱い。Step 8 はスキップのため、未設定 doc は本番では存在しない想定）
- **スキップ**：`taskSyncNeeded === false` の tournament は **taskIndex 突合すら行わない**。regEndAt 再計算・blindTemplate read もスキップし、コストを抑制
- **未設定の解除**：未設定を true 扱いで処理する場合、**必ず false に落とす道筋を用意する**。taskIndex が両方作成され、かつ 30 日以内分が enqueued または planHash 一致で確認できたら、`taskSyncNeeded: false` を書き込む。これがないと未設定が大量に残っているとき永久ループになる

---

## 7. taskIndex の突合・更新

### 7.1 taskIndex ドキュメント構造

**パス**：`scheduledTournaments/{tournamentId}/taskIndex/{taskType}`

**taskType**：`startTournament`、`closeRegistration`（docID と一致）

| フィールド | 型 | 必須 | 説明 |
|------------|-----|------|------|
| taskType | string | ✓ | docID と一致 |
| targetAt | Timestamp | ✓ | そのアクションの予定時刻 |
| enqueueDueAt | Timestamp | ✓ | Cloud Tasks の scheduleTime（基本＝targetAt） |
| planVersion | number | ✓ | scheduledTournament.schedulePlanVersion の写し |
| planHash | string | ✓ | 同一計画判定用 |
| enqueueState | string | ✓ | 'pending' \| 'enqueued' \| 'executed' \| 'failed' |
| taskName | string \| null | 任意 | Cloud Tasks のタスク名 |
| lastEvaluatedAt | Timestamp | 推奨 | 最終評価日時 |
| lastEnqueuedAt | Timestamp \| null | 任意 | 最終投入日時 |
| lastRunAt | Timestamp \| null | 任意 | 最終実行日時（Step 6 controlHook が記録） |
| lastRunResult | string \| null | 任意 | 'success' \| 'noop' \| 'error'（Step 6 が記録） |

### 7.2 突合ロジック（spec.md 3.2）

| 条件 | 動作 |
|------|------|
| taskIndex が無い | pending で新規作成。planHash, targetAt, enqueueDueAt, planVersion を設定 |
| taskIndex.planHash が一致 | その taskType は最新計画。enqueueState が enqueued ならスキップ。pending なら 7.3 へ |
| taskIndex.planHash が不一致 | 予定更新。taskIndex を pending に戻し、planHash, targetAt, enqueueDueAt, planVersion を更新 |

### 7.3 Cloud Tasks 投入条件

```
enqueueState === 'pending' AND enqueueDueAt <= now + 30日
```

- 30 日を超えるものは投入しない（Cloud Tasks 制限）
- 投入成功時：taskIndex を enqueued に更新（taskName, lastEnqueuedAt）
- 投入失敗時：enqueueState を failed、error を記録

### 7.4 taskSyncNeeded の解除

当該 tournament の全 taskType（startTournament, closeRegistration）について、**すべて**以下のいずれかになった時点で、scheduledTournament の `taskSyncNeeded: false` を設定する。**taskSyncNeeded が未設定で処理対象になった場合も、この条件を満たしたら必ず false を書き込む**（6.3 の永久ループ防止）。

| taskType の状態 | 判定 |
|-----------------|------|
| enqueued | 投入済み。完了 |
| executed | 実行済み。完了 |
| planHash 一致で投入不要 | 完了 |
| pending かつ 30 日以内 | 投入する。成功したら enqueued で完了 |
| pending かつ 30 日超 | 投入しない。**未完了**。taskSyncNeeded は true のまま維持 |

**重要**：「startTournament は 30 日超だが closeRegistration は 30 日以内」のようなケースがあり得る。taskType 単位で pending を残すのは許容し、**全 taskType が完了したときのみ** taskSyncNeeded=false とする。

---

## 8. Cloud Tasks payload（新仕様）

### 8.1 必須項目（spec.md 5.1）

| フィールド | 型 | 説明 |
|------------|-----|------|
| tournamentId | string | トーナメント ID |
| taskType | string | startTournament / closeRegistration |
| planVersion | number | schedulePlanVersion の写し |
| planHash | string | 同一計画判定用 |
| scheduledAt | string | enqueueDueAt の ISO 文字列（controlHook の no-op 判定用） |
| storeId | string | 店舗 ID（任意だが推奨） |

### 8.2 後方互換

現行 controlHook は `action`, `tournamentId`, `rev` を受け付ける。Step 6 で新 payload に対応する。本ステップでは **投入する payload を新仕様で作成** する。controlHook の変更は Step 6 で行うため、本ステップ単体では controlHook は新 payload を処理できない点に注意（Step 6 実装後に連携）。

---

## 9. 環境変数・キュー

### 9.1 使用する環境変数

| 変数 | 用途 |
|------|------|
| CONTROL_HOOK_URL | Cloud Tasks の HTTP ターゲット URL |
| TASKS_QUEUE | キュー名 |
| TASKS_LOCATION | リージョン |
| TASKS_INVOKER_SA | タスク実行時のサービスアカウント |

### 9.2 キューの統一

**採用**：単一キュー（TASKS_QUEUE）を使用。RECURRING_TOURNAMENT_TASKS_* は **使用しない**。

- Step 1 で作成経路からの直接投入を廃止したため、enqueue は本バッチ経由のみ
- 作成経路によるキュー分岐は不要

---

## 10. schedulePlanVersion 未設定の扱い

**※Step 8 は本プロジェクトではスキップ。既存データは運用側で削除するため、未設定 doc は本番では存在しない想定。**

| 状況 | 動作 |
|------|------|
| schedulePlanVersion が未設定 | 0 とみなす。planHash 算出・taskIndex の planVersion に使用（防御的フォールバック） |
| Step 4 による schedulePlanVersion 更新 | **行わない**。version は編集時（Step 3）のみインクリメントする責務を守る。Step 3 の FieldValue.increment(1) との競合・誤上書きを避ける |
| planVersion 0 の payload で controlHook が呼ばれた場合 | Step 6 で no-op 判定を行う。version 0 は「未同期」扱いとするかは Step 6 で定義 |

---

## 11. 変更内容（ファイル単位）

### 11.1 新規：enqueueTournamentTasksCore.ts

**パス**：`functions/src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts`

| 処理 | 内容 |
|------|------|
| 期間算出 | horizonDays=14, lookbackHours=6 から rangeStart, rangeEnd を算出（実行時点 now を基準に UTC Timestamp で算出） |
| クエリ実行 | db.collection('scheduledTournaments')、status='scheduled', startAt 範囲、orderBy startAt。isArchived は取得後にスキップ |
| ループ | 各 tournament について taskSyncNeeded をチェック。false ならスキップ。true/未設定なら startTournament, closeRegistration を処理 |
| regEndAt 再計算 | 3 章の仕様で算出。blindTemplate 取得 |
| planHash 算出 | 5 章の仕様 |
| taskIndex 突合 | 7.2 のロジック |
| Cloud Tasks 投入 | 7.3 の条件で enqueueTournamentTask（新関数）を呼び出し |
| taskSyncNeeded 解除 | 7.4 のタイミングで batch.update |
| 戻り値 | { success, processedCount, enqueuedCount, errors? } |

### 11.2 新規：enqueueTournamentTasks.ts（Callable）

**パス**：`functions/src/domains/tournament_createTournament/callables/enqueueTournamentTasks.ts`

| 処理 | 内容 |
|------|------|
| 認証 | 既存 Callable と同様（device 権限チェック） |
| 呼び出し | runEnqueueTournamentTasks() を実行 |
| 戻り値 | Core の戻り値をそのまま返す |

### 11.3 新規：EnqueueTournamentTasksByScheduler.ts

**パス**：`functions/src/domains/tournament_createTournament/scheduler/EnqueueTournamentTasksByScheduler.ts`

| 処理 | 内容 |
|------|------|
| onSchedule | 日次 1 回（JST 固定） |
| cron | `0 5 * * *`（毎日 5:00 JST）※ 他 Scheduler との重複を避ける。変更可 |
| 呼び出し | runEnqueueTournamentTasks() |
| エラーハンドリング | 失敗時は throw して Scheduler にリトライさせる |
| 無効化 | Step 6 デプロイまで feature flag で即 return する等、実運用で実行させない |

### 11.4 修正：tasks.ts

| 変更種別 | 内容 |
|----------|------|
| 追加 | `enqueueTournamentTask(tournamentId, taskType, planVersion, planHash, scheduledAt, storeId, enqueueDueAt): Promise<string>` — 新 payload で Cloud Tasks を作成 |
| 維持 | `enqueueStartTask`, `enqueueRegistTask` は **残す**。`@deprecated` コメントを付与。既存投入済みタスク（action/rev）がキューに残っている期間の後方互換、緊急ロールバック時の参照として有用。削除は Step 7/8 で完全移行・枯渇確認後に実施 |
| 維持 | `EnqueueTaskOptions` は enqueueStartTask / enqueueRegistTask の引数で使用しているため残す |
| 参照 | `scheduleTask` は未使用のまま残す（他で import されていなければ。modification_list 1.4 に従う） |

### 11.5 修正：index.ts

```typescript
export { enqueueTournamentTasks } from "./callables/enqueueTournamentTasks";
export { enqueueTournamentTasksByScheduler } from "./scheduler/EnqueueTournamentTasksByScheduler";
```

### 11.6 修正：lib/globalConstant.dart

| 追加 | 内容 |
|------|------|
| 定数 | `ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON = '0 5 * * *'`（毎日 5:00 JST） |
| 説明 | `ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_RUN_AT_DESCRIPTION` |

---

## 12. Firestore インデックス

### 12.1 必要なクエリ（トップコレクション）

```
db.collection('scheduledTournaments')
  .where('status', '==', 'scheduled')
  .where('startAt', '>=', rangeStart)
  .where('startAt', '<', rangeEnd)
  .orderBy('startAt')
```

isArchived はクエリに含めずアプリ側でフィルタするため、インデックスには status + startAt が必要。

### 12.2 インデックス

`db.collection('scheduledTournaments')` でクエリを実行する。不足インデックスは Firestore のエラーで判明するので、その時点で `firestore.indexes.json` に追加する。事前に `status` + `startAt` の複合インデックスが必要か確認し、無ければ追加する運用で可。

---

## 13. 追加実装仕様（大量投入時の安全策）

Step 4 は Cloud Tasks を大量に作成する可能性があるため、以下を実装に含める。

| 項目 | 内容 |
|------|------|
| バッチ上限 | 1 回の実行で処理する tournament 件数に limit を設ける（例：500 件）。超過分は次回バッチへ。ページネーション対応 |
| 並列度 | Promise.all の乱用を避け、並列数に上限を設ける（例：同時 5 件まで）。キュー詰まり・レート制限回避 |
| taskIndex 更新の原子性 | Cloud Tasks 作成成功 → taskIndex を enqueued に更新を、可能なら同一バッチで行う。トランザクションは Cloud Tasks API がトランザクション外のため、作成成功後に即更新する形で整合を保つ |
| 重複投入防止 | 同時実行・リトライで二重作成しないよう、taskName を deterministic にする（例：`${tournamentId}-${taskType}-${planHash.substring(0,16)}`） |
| taskName | Cloud Tasks のタスク名を上記の deterministic 形式とし、同一 tournament+taskType+planHash での重複投入を防ぐ |

---

## 14. 検証方法・テスト観点

### 14.1 ビルド

```bash
cd functions && npm run build
```

### 14.2 テスト観点（最小限）

| 観点 | 内容 |
|------|------|
| regEndAt 再計算 | blindTemplate あり → totalDurationSec から正しく算出 |
| regEndAt フォールバック | blindTemplate なし → closeRegistration タスクを作らない（スキップ） |
| planHash | 同一入力で同一ハッシュ、異なる入力で異なるハッシュ |
| taskIndex なし | pending で新規作成、Cloud Tasks 投入（30 日以内の場合） |
| taskIndex planHash 一致 | 投入スキップ（enqueued のまま） |
| taskIndex planHash 不一致 | pending に戻し、再投入 |
| 30 日超 | Cloud Tasks 投入しない |
| taskSyncNeeded 解除 | 投入完了後に false に更新 |
| クエリ | status=scheduled, startAt 範囲で取得。isArchived=true はアプリ側でスキップ |
| taskSyncNeeded | false はスキップ。true/未設定のみ処理 |

---

## 15. チェックリスト

- [ ] enqueueTournamentTasksCore.ts を新規作成
- [ ] enqueueTournamentTasks.ts（Callable）を新規作成
- [ ] EnqueueTournamentTasksByScheduler.ts を新規作成
- [ ] tasks.ts に enqueueTournamentTask を追加
- [ ] tasks.ts の enqueueStartTask, enqueueRegistTask に @deprecated コメント付与（削除は Step 7/8）
- [ ] index.ts に export を追加
- [ ] globalConstant.dart に cron 定数を追加
- [ ] firestore.indexes.json を確認・必要に応じて追加
- [ ] regEndAt 再計算ロジックを createScheduledTournament と整合させる
- [ ] taskSyncNeeded 解除を適切なタイミングで実施
- [ ] `npm run build` が成功する
