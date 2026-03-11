# Step 10 changeSpec：ドキュメント・参照の更新

## 1. 概要

### 1.1 目的

modification_list 10.1 に基づき、新 enqueue フロー完了後に**関連ドキュメント**を新仕様に合わせて更新する。

### 1.2 スコープ

| 対象ファイル | 修正種別 |
|-------------|----------|
| `docs/cloud_scheduler_and_tasks_summary.md` | 追記・修正 |
| `docs/アプリフロー一覧_Step2_詳細フロー列挙.md` | 追記・修正 |

---

## 2. 変更内容

### 2.1 cloud_scheduler_and_tasks_summary.md

#### 2.1.1 enqueue Scheduler の追記

**現状**: Cloud Scheduler セクションに enqueue バッチ Scheduler が含まれていない。「5つのスケジュール関数」と記載されているが、enqueue を含めると 6 つになる。

**追記**:

- **1.6** として `enqueueTournamentTasksByScheduler` を追加
- ファイル: `functions/src/domains/tournament_createTournament/scheduler/EnqueueTournamentTasksByScheduler.ts`
- スケジュール: 毎日 5:00 JST。TS 側は環境変数 `ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON` を参照（未設定時は `'0 5 * * *'`）。Dart の同定数はドキュメント用。
- 処理内容: `runEnqueueTournamentTasks` を実行し、対象期間内の scheduledTournament について taskIndex 突合・Cloud Tasks 投入
- 有効化: `ENQUEUE_SCHEDULER_ENABLED === 'true'` であること。Step 6 デプロイ完了まで無効化推奨

#### 2.1.2 enqueue Callable の追記

- **enqueueTournamentTasks** Callable を手動実行用として記載
- ファイル: `functions/src/domains/tournament_createTournament/callables/enqueueTournamentTasks.ts`
- 処理: `runEnqueueTournamentTasks()` を呼び出し

#### 2.1.3 taskIndex の説明の追記

**新規セクション**（例: 2.1.4 または 2.2）に以下を記載:

| 項目 | 内容 |
|------|------|
| パス | `scheduledTournaments/{tournamentId}/taskIndex/{taskType}` |
| 役割 | 内部台帳。enqueue バッチと controlHook が planHash・enqueueState を管理 |
| taskType | startTournament, closeRegistration |
| フィールド例 | planHash, enqueueState, enqueuedAt, cloudTaskName, lastRunAt, lastRunResult |
| クライアント | 非公開（firestore.rules で read/write: false） |

#### 2.1.4 controlHook payload の明記

- **新 payload**: `{ tournamentId, taskType, planVersion, planHash, scheduledAt, storeId }`
- **旧 payload（後方互換）**: `{ action: 'start' \| 'regist', tournamentId, rev }` は残存タスク処理のため受付継続
- no-op 判定: planVersion 不一致または planHash 不一致時は no-op で成功終了

#### 2.1.5 まとめセクションの更新

- Cloud Scheduler: 「合計 **6** つのスケジュール関数」に修正。enqueue バッチを追加
- Cloud Tasks: 既に Step 4〜7 反映済みの場合は微修正のみ

---

### 2.2 アプリフロー一覧_Step2_詳細フロー列挙.md

#### 2.2.1 トーナメント作成〜タスク投入フローの追記

以下のフローに「作成完了後の enqueue 呼び出し」を追記する。

| フロー | 追記内容 |
|--------|----------|
| **3.4 単発トーナメント作成フロー（直接入力）** | 8. `scheduledTournaments` に保存 の次に「9. `runEnqueueTournamentTasks` を呼び出し（Cloud Tasks 投入の準備）」を追加 |
| **3.5 単発トーナメント作成フロー（カレンダー）** | 同上 |
| **3.3 定期開催トーナメント設定フロー** | 11. `tournamentRecurrences` に保存 の次に「12. 生成されたトーナメント分の enqueue を 1 回実行」を追加 |
| **12.4 定期トーナメント自動生成フロー** | 4. の「該当日が来ている場合、トーナメントを作成」の次に「5. 全 recurrence 処理完了後、`runEnqueueTournamentTasks` を 1 回呼び出し」を追加 |

#### 2.2.2 自動処理フロー（12章）への enqueue バッチの追記

**12.7** として「Cloud Tasks 投入フロー（enqueue バッチ）」を新規追加:

1. 日次 Scheduler（`enqueueTournamentTasksByScheduler`）が毎日 5:00 JST に実行
2. `runEnqueueTournamentTasks` が呼ばれる
3. 対象期間（lookback〜horizon）内の status='scheduled' の scheduledTournament を取得
4. 各 tournament の taskIndex と planHash を突合
5. `enqueueState === 'pending'` かつ 30 日以内のものを Cloud Tasks に投入
6. controlHook がタスク実行時に status 遷移（scheduled→running, running→registered）

---

## 3. 確認観点

| # | 観点 | 期待結果 |
|---|------|----------|
| 1 | cloud_scheduler_and_tasks_summary | enqueue Scheduler、Callable、taskIndex、controlHook payload が記載されている |
| 2 | cloud_scheduler_and_tasks_summary | Cloud Scheduler が 6 つと記載されている |
| 3 | アプリフロー一覧 | 3.3, 3.4, 3.5, 12.4 に enqueue 呼び出しが追記されている |
| 4 | アプリフロー一覧 | 12.7 に enqueue バッチフローが追加されている |

---

## 4. チェックリスト

- [ ] cloud_scheduler_and_tasks_summary.md に enqueue Scheduler を追記
- [ ] cloud_scheduler_and_tasks_summary.md に enqueue Callable を追記
- [ ] cloud_scheduler_and_tasks_summary.md に taskIndex の説明を追記
- [ ] cloud_scheduler_and_tasks_summary.md に controlHook payload を明記
- [ ] cloud_scheduler_and_tasks_summary.md のまとめを 6 スケジュールに更新
- [ ] アプリフロー一覧 3.3, 3.4, 3.5 に enqueue 呼び出しを追記
- [ ] アプリフロー一覧 12.4 に enqueue 呼び出しを追記
- [ ] アプリフロー一覧 12.7 に enqueue バッチフローを追加
