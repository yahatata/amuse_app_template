# 仕様書：Scheduled Tournament の Cloud Tasks 投入（30日制限対応）

## 0. 目的と非目的

### 目的

- Cloud Tasks の **最大30日（720h）制限**を回避しつつ、トーナメントの
  - **開始時ステータス変更**
  - **レジスト開始/終了等のステータス変更**
  を **取りこぼしなく**実行できるようにする。

- 「単発作成」「定期作成」「定期生成（後からscheduledTournament生成）」など **作成経路によらず同一経路**でタスク投入を管理する。

### 非目的（今回スコープ外）

- Cloud Tasks 側のタスク一覧取得による突合（Cloud Tasks API を使った存在確認）
- 遠未来（30日以上先）に対する Tasks を直接スケジュールすること

---

## 1. データモデル

### 1.1 scheduledTournaments（既存に追加する管理フィールド）

**対象**：`scheduledTournaments/{tournamentId}`

| フィールド | 型 | 必須 | 説明 |
|------------|-----|------|------|
| schedulePlanVersion | number | 必須 | 予定（開始時刻/レジスト時刻/重要パラメータ）が変わったら +1 |
| schedulePlanUpdatedAt | Timestamp | 推奨 | 予定更新日時 |
| taskSyncNeeded | boolean | 必須 | 予定変更や新規作成時に true。enqueue処理が最新化完了したら false（※厳密でなくてよい。trueのままでも動くがコスト増） |
| taskSyncReason | string[] | 任意 | 例：['created', 'startAtChanged', 'registrationWindowChanged'] |

※既存の startAt, registerOpenAt, registerCloseAt, status 等は前提。

### 1.2 taskIndex（突合用台帳）

**対象**：`scheduledTournaments/{tournamentId}/taskIndex/{taskType}`

**taskType** は最低限以下：
- `startTournament`
- `openRegistration`
- `closeRegistration`

**フィールド仕様（今回必要な最小セット）**：

| フィールド | 型 | 必須 | 説明 |
|------------|-----|------|------|
| taskType | string | 必須 | docIDと一致でも可 |
| targetAt | Timestamp | 必須 | そのアクションが意味する予定時刻（開始/レジスト開始/レジスト終了） |
| enqueueDueAt | Timestamp | 必須 | Cloud Tasks の scheduleTime に設定する時刻（基本＝targetAt、必要なら数秒前倒しなど） |
| planVersion | number | 必須 | scheduledTournament の schedulePlanVersion を写す |
| planHash | string | 必須 | 同一計画判定用のハッシュ。例：hash(taskType + targetAt + tournamentId + storeId?) |
| enqueueState | string | 必須 | 'pending' \| 'enqueued' \| 'executed' \| 'failed' |
| taskName | string \| null | 推奨 | Cloud Tasks のタスク名 |
| lastEvaluatedAt | Timestamp | 推奨 | 最終評価日時 |
| lastEnqueuedAt | Timestamp \| null | 推奨 | 最終投入日時 |
| lastRunAt | Timestamp \| null | 任意 | 最終実行日時 |
| lastRunResult | string \| null | 任意 | 'success' \| 'noop' \| 'error' |
| error | object \| null | 任意 | {code?, message?, at?} |

---

## 2. 予定（scheduledTournament）作成・編集時の仕様

### 2.1 単発作成（scheduledTournament作成）

scheduledTournament 作成時に以下をセット：
- `schedulePlanVersion = 1`
- `taskSyncNeeded = true`
- `taskSyncReason = ['created']`

**この時点で Cloud Tasks を投入しない**（原則）

※「即時反映」が必要なら、後述の 5.3 の"前倒しenqueue"で対応

### 2.2 定期トーナメント作成（直近分を含む/含まない）

定期作成が scheduledTournament を複数作成する場合も、各 scheduledTournament について 2.1 と同じ処理をするだけ。

「作成経路」で Cloud Tasks 投入を分岐しない
→ 直近であろうが遠未来であろうが `taskSyncNeeded=true` を立てるのみ

### 2.3 定期生成（既存の定期設定を参照して後から scheduledTournament を生成）

生成された scheduledTournament は 2.1 と同じ扱い。

直近が作られないケースでも、enqueueバッチが対象期間内だけ投入するため問題なし。

### 2.4 編集（開始時刻・レジスト時刻・重要パラメータ変更）

scheduledTournament 編集時は以下を実施：
- `schedulePlanVersion += 1`
- `taskSyncNeeded = true`
- `taskSyncReason` に該当理由を反映（任意）
- taskIndex を編集処理の中で直接更新しない（責務をenqueue側に寄せる）

---

## 3. 突合（Firestore上での差分検知）仕様

### 3.1 突合の定義（本仕様の"突合"）

- Cloud Tasks の中身や存在を照合しない
- scheduledTournament の最新予定と **taskIndex（台帳）**を照合して、
  - 必要なタスクが enqueued になるように Firestore を整備し、
  - Cloud Tasks を必要分だけ作成する

### 3.2 "再投入が必要"の判定

taskTypeごとに planHash を計算し、taskIndex と比較する。

| 条件 | 動作 |
|------|------|
| taskIndex が無い | pending 作成（未投入） |
| taskIndex.planHash が一致 | そのtaskTypeは最新計画として扱い（基本何もしない） |
| taskIndex.planHash が不一致 | 予定が更新された → taskIndex を pending に戻し、新 planHash/targetAt/enqueueDueAt/planVersion に更新 |

---

## 4. enqueue バッチ（Cloud Scheduler → enqueue function）

### 4.1 実行頻度

- **推奨**：日次 1回（JST固定）
- 編集頻度が高い場合：12時間毎も可

### 4.2 期間パラメータ（推奨値）

- `horizonDays = 14`（当日〜14日後）
- `lookbackHours = 6`（直前編集・遅延吸収のため過去も少し見る）
- **対象期間**：now - lookback ～ now + horizon

### 4.3 対象データ取得

- `status == 'scheduled'`（最低条件）
- かつ、期間条件（startAt基準でまずはOK）
  - `startAt >= now - lookback`
  - `startAt < now + horizon`
- `orderBy startAt`

※レジスト系をstartAtで拾い漏れる場合は、将来最適化として nextTaskAt を導入（今回任意）。

### 4.4 enqueue処理（1 scheduledTournament あたり）

taskType一覧（start/open/close）について、以下を実施：
1. targetAt を決定（該当時刻が無い場合はスキップ）
2. planHash を計算
3. taskIndex を読み、3.2 の判定で pending/enqueued を更新
4. `enqueueState == pending` かつ `enqueueDueAt <= now + 30days` なら Cloud Tasks を作成
5. 作成成功で taskIndex を enqueued に更新（taskName, lastEnqueuedAt）
6. 失敗時は failed と error を保存（再試行対象）

### 4.5 taskSyncNeeded の取り扱い

- enqueue処理が「必要なtaskIndexの更新/投入」を完了したら `taskSyncNeeded=false` にしてよい
- ただし安全性優先なら false 更新を省略しても動く（コスト増には注意）

---

## 5. Cloud Tasks 実行関数（実行時の正しさ保証）

### 5.1 payload 仕様（必須）

Cloud Tasks の payload には最低限含める：
- `tournamentId`
- `taskType`
- `planVersion`
- `planHash`
- `scheduledAt`（enqueueDueAt）
- （必要なら）`storeId`

### 5.2 実行時 no-op 判定（最重要）

実行関数は必ず Firestore を参照して "最新計画か" を判定する。

1. scheduledTournament の `schedulePlanVersion` と `payload.planVersion` を比較
2. さらに taskIndex（該当taskType）の `planHash` と `payload.planHash` を比較
3. **一致** → 本処理を実行（status遷移など）
4. **不一致** → no-op（成功扱いで終了）

これにより、古いタスクが残っていても誤更新を防げる（Cloud Tasks を見に行かない設計が成立）。

### 5.3 （任意）直近即時反映のための前倒しenqueue

例：開始まで1時間未満のトーナメントが作成/編集された場合など

- 「Cloud Tasks を直で作る」のではなく
- **enqueue function を即時呼び出す**（同じ経路で処理）

これにより「作成経路による分岐」を最小にできる。

---

## 6. 状態遷移と二重実行耐性

### 6.1 status遷移の基本

- 実行関数は **現在statusを読んで**、遷移可能な場合のみ更新する
- 例：`scheduled` → `running` のみ許可
- それ以外は noop（成功終了）

### 6.2 taskIndex の実行結果記録（推奨）

実行成功/noop/error を taskIndex に反映し、運用可視化する。

| 結果 | taskIndex の更新 |
|------|------------------|
| success | executed, lastRunResult=success |
| noop | executed（または別state）、lastRunResult=noop |
| error | failed, error保存 |

---

## 7. 運用・監視・デバッグ

### 7.1 監視観点（Firestoreで完結）

- taskIndex の failed を一覧できる（管理画面/簡易クエリ）
- enqueued なのに lastRunAt が無い等の遅延検知（必要なら）

### 7.2 リトライ方針

- Cloud Tasks のリトライは標準設定に従う（回数/バックオフ）
- それでもダメなら taskIndex が failed に残るため、日次バッチが再評価対象にできる

---

## 8. コスト最適化（今回の実装で意識する点）

- enqueueバッチ対象を **期間で絞る**（14日推奨）
- `taskSyncNeeded` を活用して余計な処理を減らす（任意だが効果大）
- Cloud Tasks の「存在確認」を**やめる**（最大のコスト/複雑性削減）

---

## 実装対象の機能一覧（チェックリスト）

### データモデル追加
- [ ] scheduledTournament：schedulePlanVersion, taskSyncNeeded 等
- [ ] taskIndex サブコレ：スキーマ実装

### 作成/編集処理の共通化
- [ ] 新規：version=1, taskSyncNeeded=true
- [ ] 編集：version++, taskSyncNeeded=true

### enqueue function
- [ ] Scheduler から定期実行
- [ ] 期間クエリ → taskIndex更新 → Cloud Tasks作成 → taskIndex反映

### 実行 function（task runner）
- [ ] payload検証
- [ ] version/hash一致判定 → 実行 or no-op
- [ ] status遷移の安全制御
- [ ] taskIndexへ結果反映

### （任意）直近前倒しenqueue
- [ ] 例：開始まで1時間未満等でenqueue function即時呼び出し
