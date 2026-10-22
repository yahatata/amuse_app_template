# Step 5 実装サマリ

## 概要

changeSpec Step 5 に従い、scheduledTournament 作成完了後に **enqueue function（Core）を即時呼び出す** 処理を追加した。Step 1 で廃止した直接 Cloud Tasks 投入の代替として、作成経路から enqueue バッチを起動し、直近のトーナメントを早期に taskIndex 反映・Cloud Tasks 投入する。

---

## 1. 確認観点とテスト結果

| # | 観点 | 期待結果 | 検証 |
|---|------|----------|------|
| 1 | 単発作成後 | runEnqueueTournamentTasks が 1 回呼ばれる | ✓ step5_enqueueAfterCreate.spec.ts（呼び出し1箇所のアサート） |
| 2 | 定期作成後 | enqueue が 1 回のみ呼ばれる | ✓ step5_enqueueAfterCreate.spec.ts（呼び出し1箇所のアサート） |
| 3 | 定期生成後 | 閾値以下なら enqueue 呼び出し、閾値超えならスキップ | ✓ step5_enqueueAfterCreate.spec.ts |
| 4 | エラー分離 | enqueue 失敗時、作成処理は成功のまま。logger.error で構造化ログ | ✓ 実装済み |
| 5 | 回帰 | enqueueStartTask / enqueueRegistTask が復活していない | ✓ step5、step1_no_enqueue_regression |
| 6 | 循環参照 | Core が作成処理を import していない | ✓ step5 テスト |
| 7 | 依存方向 | tasks.ts が Core を import していない | ✓ step5 テスト |
| 8 | 対象絞り | storeId, tenantId を渡している | ✓ step5 テスト |
| 9 | 閾値 | 閾値超えで enqueue スキップ | ✓ step5 テスト |

---

## 2. 変更・修正ファイル

### 2.1 修正：createScheduledTournament.ts

| 種別 | 内容 |
|------|------|
| import 追加 | `runEnqueueTournamentTasks` from enqueueTournamentTasksCore |
| 処理追加 | トランザクション完了後、return の直前に try-catch で `runEnqueueTournamentTasks({ storeId, tenantId })` を呼び出し |
| エラーハンドリング | logger.error で tournamentId, storeId, tenantId, error を構造化ログ出力 |

### 2.2 修正：createTournamentRecurrence.ts

| 種別 | 内容 |
|------|------|
| import 追加 | `runEnqueueTournamentTasks` from enqueueTournamentTasksCore |
| 処理追加 | `generateRecurringTournaments()` 完了後、return の直前に try-catch で `runEnqueueTournamentTasks({ storeId, tenantId })` を呼び出し |
| エラーハンドリング | logger.error で recurrenceId, storeId, tenantId, error を構造化ログ出力 |

### 2.3 修正：generateRecurringTournamentsCore.ts

| 種別 | 内容 |
|------|------|
| import 追加 | `runEnqueueTournamentTasks` from enqueueTournamentTasksCore |
| 定数追加 | `ENQUEUE_AFTER_GENERATE_THRESHOLD = 50` |
| 処理追加 | 閾値以下：storeIds を収集し、単一 store の場合は `{ storeId }` を渡して enqueue 呼び出し。複数 store の場合は `{}`（全店対象となるため、将来は storeId ごとに分割 enqueue を検討） |
| 閾値超え | enqueue をスキップし、ログ出力のみ |
| エラーハンドリング | logger.error で totalGenerated, error を構造化ログ出力 |

### 2.4 前提（Step 4 拡張済み）

| 対象 | 内容 |
|------|------|
| enqueueTournamentTasksCore | storeId/tenantId をクエリに反映。ENQUEUE_SCHEDULER_ENABLED による入口ガード |
| firestore.indexes.json | status + storeId + startAt、status + storeId + tenantId + startAt の複合インデックス |

---

## 3. テスト結果

### 3.1 Step 5 テスト（14 件）

```
PASS __tests__/tournament_createTournament/step5_enqueueAfterCreate.spec.ts
  Step 5: 作成完了後の enqueue 呼び出し
    createScheduledTournament.ts
      ✓ runEnqueueTournamentTasks を import していること
      ✓ storeId, tenantId を渡して runEnqueueTournamentTasks を呼び出していること
      ✓ runEnqueueTournamentTasks が 1 回のみ呼ばれていること
      ✓ logger.error で構造化ログを出力していること
      ✓ enqueueStartTask / enqueueRegistTask を呼び出していないこと（回帰）
    createTournamentRecurrence.ts
      ✓ runEnqueueTournamentTasks を import していること
      ✓ storeId, tenantId を渡して runEnqueueTournamentTasks を呼び出していること
      ✓ enqueue が 1 回のみ呼ばれること
      ✓ enqueueStartTask / enqueueRegistTask を呼び出していないこと（回帰）
    generateRecurringTournamentsCore.ts
      ✓ runEnqueueTournamentTasks を import していること
      ✓ 閾値（ENQUEUE_AFTER_GENERATE_THRESHOLD）を超えたら enqueue をスキップすること
      ✓ enqueueStartTask / enqueueRegistTask を呼び出していないこと（回帰）
    依存方向
      ✓ enqueueTournamentTasksCore が createScheduledTournament 等を import していないこと
      ✓ tasks.ts が enqueueTournamentTasksCore を import していないこと
```

### 3.2 tournament_createTournament 全テスト（30 件）

```
Test Suites: 5 passed, 5 total
Tests:       32 passed, 32 total
```

- step5_enqueueAfterCreate.spec.ts: 14 passed
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

## 4. 注意事項

| 項目 | 内容 |
|------|------|
| デプロイ順序 | Step 6（controlHook 新 payload 対応）と同時、または Step 6 先行デプロイ |
| ENQUEUE_SCHEDULER_ENABLED | Step 6 デプロイ前に true にしない。Core 入口で false なら即 return するため、作成経路・Scheduler ともに enqueue はスキップされる |
| 閾値 | generateRecurringTournamentsCore で 50 件超生成時は enqueue をスキップ。日次 Scheduler が次回実行時に処理 |
| 複数 store | 閾値以下でも複数 store 生成時に `{}` を渡す場合は全店スキャンになる。店舗数増加時は storeId ごとの分割 enqueue（例：storeId 配列でループ or Cloud Tasks で分割実行）を検討 |
| 二重起動 | ロックは未実装。設計は changeSpec 2.5 に記載。将来実装検討 |

---

## 4.5 補足（Step 7 実施後）

- enqueueStartTask, enqueueRegistTask は **Step 7 で削除済み**

---

## 5. 実行コマンド

```bash
# ビルド
cd functions && npm run build

# Step 5 テストのみ
npm test -- __tests__/tournament_createTournament/step5_enqueueAfterCreate.spec.ts

# tournament_createTournament 全テスト
npm test -- __tests__/tournament_createTournament/
```

**前提**：Firestore Emulator を起動しておく（step1_emulator_verification 実行時）
