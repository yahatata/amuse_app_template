# Step 7 changeSpec：deprecated 関数の削除と taskType 定義の確定

## 1. 概要

### 1.1 目的

Step 4/6 の廃止計画に従い、**enqueueStartTask / enqueueRegistTask** および関連する死コードを削除する。あわせて taskType と旧 action の対応関係を確定・明文化する。

- Step 1 で作成経路からの呼び出しを全削除済み
- Step 4 で enqueueTournamentTask に置き換え済み（deprecated として残置）
- Step 6 で controlHook が新 payload 対応済み。旧 payload は後方互換のため引き続き受付
- 本ステップで、呼び出し元のない deprecated 関数をコードベースから削除する

### 1.2 スコープ

| 種別 | 対象 |
|------|------|
| 修正 | `functions/src/domains/tournament_createTournament/services/tasks.ts` |
| 修正 | `docs/cloud_scheduler_and_tasks_summary.md`（scheduleTask 等の記載を新仕様に合わせる） |
| 追記 | Step 4〜6 の implementation_summary 等に「旧 enqueueStart/Regist は Step 7 で削除済み」の注記を追記（実装完了時） |

**一次情報**：本 changeSpec が Step 7 の正式仕様。modification_list との齟齬がある場合は本 changeSpec を優先する。

**非対象**：
- controlHook の旧 payload 受付削除（キュー枯渇確認後に別ステップで実施）
- Step 8 のオンライン移行（本プロジェクトではスキップ。既存データは運用側で削除する前提）

**デプロイ順序**：本ステップはコード整理であり、デプロイ後も controlHook は旧 payload を受け付けるため、段階的移行に支障なし。なお、旧 payload の投入経路（enqueueStartTask 等）は本ステップで削除するため、旧 payload 受付は**残存タスクの処理のためだけ**に残る。

---

## 2. 前提・依存

### 2.1 taskType と action の対応関係（確定）

modification_list 7.1、Step 6 changeSpec 2.3 に基づき、以下を**正式な対応**として確定する。

| taskType（新） | action（旧） | 処理内容 |
|----------------|--------------|----------|
| startTournament | start | scheduled → running、startedAt 設定 |
| closeRegistration | regist | running → registered、registAt 設定 |

**openRegistration**：現行フローに明示的対応がなく、Step 4 でも省略。将来必要になった場合に taskType として追加する。

### 2.2 現状の tasks.ts

| 関数・型 | 状態 | 呼び出し元 |
|----------|------|------------|
| enqueueTournamentTask | 使用中 | enqueueTournamentTasksCore |
| enqueueStartTask | @deprecated、未使用 | なし（Step 1 で全削除） |
| enqueueRegistTask | @deprecated、未使用 | なし（Step 1 で全削除） |
| EnqueueTaskOptions | enqueueStartTask/Regist の型のみ | 上記 2 関数 |
| scheduleTask | 未使用（死コード） | なし |
| listTasks | 未使用（死コード） | なし |
| deleteTask | 未使用（死コード） | なし |
| TaskKind | scheduleTask の型 | scheduleTask |
| ScheduleTaskParams | scheduleTask の型 | scheduleTask |

---

## 3. 削除対象と根拠

### 3.1 enqueueStartTask / enqueueRegistTask

| 項目 | 内容 |
|------|------|
| 根拠 | Step 4 changeSpec 11.4、Step 6 changeSpec 6.4 廃止計画「Step 7/8 で削除」 |
| 安全性 | Step 1 で呼び出しを全削除。新規投入は enqueueTournamentTask 経由のみ |
| 残存タスク | Step 1 デプロイ前に投入された旧 payload タスクがキューに残っている可能性あり。controlHook は旧 payload を引き続き受付するため、それらの実行には影響なし |

### 3.2 EnqueueTaskOptions

| 項目 | 内容 |
|------|------|
| 根拠 | enqueueStartTask / enqueueRegistTask の第 4 引数の型定義のみで使用 |
| 削除条件 | 上記 2 関数削除と同時に削除 |

### 3.3 scheduleTask / listTasks / deleteTask / TaskKind / ScheduleTaskParams

| 項目 | 内容 |
|------|------|
| 根拠 | modification_list 1.4「他から import されていない（死コードの可能性）」、Step 1 changeSpec「scheduleTask は未使用」 |
| 注意 | scheduleTask は payload に `kind` を使用。controlHook は `action` を受付。形式が異なり、現行で使われた形跡なし |
| 削除方針 | 未使用のため削除。必要なら Cloud Tasks API / gcloud CLI / Console で一覧・削除できる |

---

## 4. controlHook の旧 payload について

### 4.1 本ステップでは削除しない

Step 6 changeSpec 6.4 廃止計画：

> キューに旧 payload タスクが残らなくなった時期を見計らって、旧 payload の受付を削除する

- 本ステップで enqueueStartTask/enqueueRegistTask を削除しても、**既にキューにある**旧 payload タスクは存在し得る
- それらの実行には controlHook の旧 payload 受付が必要
- **旧 payload 受付の削除は、キューの枯渇確認後に別ステップで実施する**

### 4.2 枯渇確認（旧 payload 受付削除の前提条件）

**一次情報**：Cloud Tasks のキュー上で旧 payload タスクが **ゼロ** であることを、Console/CLI で確認する。

**目安**：Step 1 デプロイ後、新規に旧 payload タスクは投入されない。最大 30 日先までスケジュールされ得るため、Step 1 デプロイから **30 日以上経過** は目安となる。ただし、実行失敗→リトライ・キュー遅延・バックオフ・停止運用などで 30 日を越えて残る可能性もあるため、**30 日経過のみでは不十分**。必ずキューの実態を確認してから旧 payload 受付を削除すること。

---

## 5. 変更内容（ファイル単位）

### 5.1 修正：tasks.ts

**パス**：`functions/src/domains/tournament_createTournament/services/tasks.ts`

| 種別 | 内容 |
|------|------|
| 削除 | `enqueueStartTask` 関数（約 56 行） |
| 削除 | `enqueueRegistTask` 関数（約 54 行） |
| 削除 | `EnqueueTaskOptions` インターフェース |
| 削除 | `scheduleTask` 関数 |
| 削除 | `listTasks` 関数 |
| 削除 | `deleteTask` 関数 |
| 削除 | `TaskKind` 型 |
| 削除 | `ScheduleTaskParams` インターフェース |
| 維持 | `enqueueTournamentTask`、`CloudTasksClient`、環境変数参照、`getEnv` |

**削除後の残存**：
- `enqueueTournamentTask` のみが export される
- `PROJECT_ID`、`client`、`getEnv` は enqueueTournamentTask で使用するため維持

**定数・変数の整理**（削除対象、**enqueueTournamentTask が参照していないことを確認できた場合のみ**）：
- `CONTROL_HOOK_URL`, `TASK_SA`：scheduleTask、enqueueStartTask/Regist で使用。enqueueTournamentTask は `getEnv('CONTROL_HOOK_URL')` 等を直接使用するため、モジュール級定数は未使用
- `QUEUE_NAME`, `REGION`：scheduleTask/listTasks で使用。enqueueTournamentTask は `getEnv('TASKS_QUEUE')`, `getEnv('TASKS_LOCATION')` を直接使用

※ 不確実な場合は定数削除を省略し、関数削除のみ実施する（安全側）

### 5.2 修正：cloud_scheduler_and_tasks_summary.md

**パス**：`docs/cloud_scheduler_and_tasks_summary.md`

| 種別 | 内容 |
|------|------|
| 修正 | enqueueStartTask / enqueueRegistTask の記載を「廃止（Step 7 で削除。enqueueTournamentTask に統合）」に更新 |
| 修正 | scheduleTask の記載を削除または「未使用・削除済み」に更新 |
| 追記 | 新 enqueue フロー（enqueueTournamentTask、taskIndex、controlHook 新 payload）の概要 |
| 追記 | listTasks/deleteTask 削除後は Cloud Tasks API / gcloud CLI / Console で一覧・削除可能である旨 |

---

## 6. 影響範囲の確認

### 6.1 import の影響

削除対象の export を import しているファイルが無いことを確認する。

| 削除対象 | 想定 import 元 |
|----------|----------------|
| enqueueStartTask | なし（Step 1 で削除済み） |
| enqueueRegistTask | なし（Step 1 で削除済み） |
| EnqueueTaskOptions | 上記 2 関数の型としてのみ使用。他ファイルからは未使用 |
| scheduleTask | なし |
| listTasks | なし |
| deleteTask | なし |
| TaskKind | scheduleTask の型。他からの import なし |
| ScheduleTaskParams | 同上 |

### 6.2 テストへの影響

| テスト | 影響 |
|--------|------|
| step1_no_enqueue_regression | enqueueStartTask/enqueueRegistTask の**文字列がソースに含まれない**ことを検証。削除後も成立 |
| step5_enqueueAfterCreate | 同上。回帰テストとして有効 |
| その他 | tasks.ts を直接 import しているテストがなければ影響なし |

---

## 7. 確認観点

| # | 観点 | 期待結果 |
|---|------|----------|
| 1 | ビルド | `npm run build` が成功する（TypeScript コンパイル通過） |
| 2 | import 残骸 | 削除した関数・型を import している箇所が無い。**functions/src 以下（__tests__ 除く）で grep し、以下がヒットしないこと**：`enqueueStartTask`、`enqueueRegistTask`、`EnqueueTaskOptions`、`scheduleTask`、`listTasks`、`deleteTask`、`TaskKind`、`ScheduleTaskParams` |
| 3 | 回帰テスト | step1_no_enqueue_regression、step5 がパスする |
| 4 | enqueueTournamentTask | 従来どおり動作する（Step 4/6 のテストがパス） |
| 5 | 旧 payload | controlHook が action/rev を引き続き受付する（Step 6 の旧 payload テストがパス） |

---

## 8. チェックリスト

- [ ] tasks.ts から enqueueStartTask を削除
- [ ] tasks.ts から enqueueRegistTask を削除
- [ ] tasks.ts から EnqueueTaskOptions を削除
- [ ] tasks.ts から scheduleTask, listTasks, deleteTask を削除
- [ ] tasks.ts から TaskKind, ScheduleTaskParams を削除
- [ ] tasks.ts の未使用定数を削除（enqueueTournamentTask が参照していないことを確認した上で）
- [ ] cloud_scheduler_and_tasks_summary.md を新仕様に合わせて更新
- [ ] grep で import 残骸が無いことを確認
- [ ] `npm run build` が成功する
- [ ] 関連テストがパスする
