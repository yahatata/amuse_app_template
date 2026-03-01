# Step 4 実装サマリ

## 概要

changeSpec Step 4 に従い、enqueue 専用 function（Core / Callable / Scheduler）を新規作成し、Cloud Tasks の 30 日制限に対応する日次 enqueue バッチを実装した。

---

## 1. 確認観点とテスト結果

| # | 観点 | 期待結果 | 検証 |
|---|------|----------|------|
| 1 | regEndAt 再計算 | blindTemplate あり → totalDurationSec から正しく算出 | ✓ step4_enqueueCore.spec.ts |
| 2 | regEndAt フォールバック | blindTemplate なし → closeRegistration スキップ（null） | ✓ step4_enqueueCore.spec.ts |
| 3 | planHash | 同一入力で同一ハッシュ、異なる入力で異なるハッシュ | ✓ step4_enqueueCore.spec.ts |
| 4〜10 | その他 | taskIndex、taskSyncNeeded、クエリ等 | 実装済み（統合テストは Step 6 連携後に実施） |

---

## 2. 変更・新規ファイル

### 2.1 新規：enqueueTournamentTasksCore.ts

**パス**：`functions/src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts`

| 処理 | 内容 |
|------|------|
| 期間算出 | horizonDays=14, lookbackHours=6。UTC Timestamp で rangeStart, rangeEnd 算出 |
| クエリ | db.collection('scheduledTournaments'), status='scheduled', startAt 範囲。isArchived はアプリ側でスキップ |
| taskSyncNeeded | false はスキップ。true/未設定のみ処理 |
| regEndAt 再計算 | blindTemplate から totalDurationSec 算出。取得不能時は null（closeRegistration スキップ） |
| planHash | `taskType:${tournamentId}:${targetAtMillis}:${planVersion}` の SHA-256 |
| taskIndex 突合 | 7.2 ロジック（pending 作成、planHash 一致でスキップ、不一致で再投入） |
| 30 日制限 | enqueueDueAt <= now+30日 のみ Cloud Tasks 投入 |
| taskSyncNeeded 解除 | 全 taskType 完了時に false を書き込み。**closeRegistration が blindTemplate 欠落でスキップ(null) の場合は taskSyncNeeded を false に落とさない**（再試行対象として残す） |

### 2.2 新規：enqueueTournamentTasks.ts（Callable）

**パス**：`functions/src/domains/tournament_createTournament/callables/enqueueTournamentTasks.ts`

- device 権限チェック（admin または options.tournament）
- runEnqueueTournamentTasks() を呼び出し

### 2.3 新規：EnqueueTournamentTasksByScheduler.ts

**パス**：`functions/src/domains/tournament_createTournament/scheduler/EnqueueTournamentTasksByScheduler.ts`

- cron: `0 5 * * *`（毎日 5:00 JST）
- ENQUEUE_SCHEDULER_ENABLED != 'true' のとき即 return（Step 6 デプロイ待ち）

### 2.4 修正：tasks.ts

- **追加**：`enqueueTournamentTask()` — 新 payload（tournamentId, taskType, planVersion, planHash, scheduledAt, storeId）で Cloud Tasks 作成
- **維持**：enqueueStartTask, enqueueRegistTask に @deprecated 付与

### 2.5 修正：index.ts

- enqueueTournamentTasks, enqueueTournamentTasksByScheduler を export

### 2.6 修正：lib/globalConstant.dart

- ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON = '0 5 * * *'
- ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_RUN_AT_DESCRIPTION

### 2.7 修正：firestore.indexes.json

- status + startAt の複合インデックスを追加（トップコレクションクエリ用）
- **方針**：changeSpec 12.2 に従い、クエリ条件（status + startAt 範囲 + orderBy）に必須のため事前に追加。既存インデックスとの重複は確認済み

---

## 3. テスト結果

### 3.1 Step 4 テスト（5 件）

```
PASS __tests__/tournament_createTournament/step4_enqueueCore.spec.ts
  Step 4: enqueue コアロジック
    computePlanHash
      ✓ 同一入力で同一ハッシュを返す
      ✓ 異なる入力で異なるハッシュを返す
      ✓ targetAt のミリ秒でハッシュが変わる
    computeRegEndAt
      ✓ blindTemplate あり → totalDurationSec から正しく算出
      ✓ blindTemplate なし → null を返す（closeRegistration スキップ）
```

### 3.2 tournament_createTournament 全テスト（18 件）

```
Test Suites: 4 passed, 4 total
Tests:       18 passed, 18 total
```

- step4_enqueueCore.spec.ts: 5 passed
- step3_taskSyncNeeded.spec.ts: 5 passed
- step1_emulator_verification.spec.ts: 3 passed
- step1_no_enqueue_regression.spec.ts: 5 passed

### 3.3 ビルド

```
cd functions && npm run build
Exit code: 0
```

---

## 4. taskSyncNeeded 解除の設計（重要）

| ケース | 挙動 |
|--------|------|
| startTournament・closeRegistration の両方が「完了」 | taskSyncNeeded = false を書き込み |
| **closeRegistration が blindTemplate 欠落でスキップ(null)** | **taskSyncNeeded は false に落とさない**。再試行対象として残し、次回バッチで再評価する |

スキップを「完了」扱いにするとレジ締切が永遠に入らず、「未完」扱いにすると blindTemplate 追加後に再試行される。

---

## 5. 注意事項

| 項目 | 内容 |
|------|------|
| デプロイ順序 | Step 6（controlHook 新 payload 対応）と同時、または Step 6 先行デプロイ |
| Scheduler 無効化 | ENQUEUE_SCHEDULER_ENABLED が true になるまで Scheduler は即 return |
| Callable 手動実行 | Step 6 前に実行すると投入したタスクが controlHook で処理できず失敗する |
| 既存関数 | enqueueStartTask, enqueueRegistTask は **Step 7 で削除済み** |
| Step 8 | 本プロジェクトではスキップ。schedulePlanVersion ?? 0 は防御的フォールバックとして維持 |

---

## 6. 実行コマンド

```bash
# ビルド
cd functions && npm run build

# Step 4 テストのみ
npm test -- __tests__/tournament_createTournament/step4_enqueueCore.spec.ts

# tournament_createTournament 全テスト
npm test -- __tests__/tournament_createTournament/
```

**前提**：Firestore Emulator を起動しておく（`firebase emulators:start --only firestore`）
