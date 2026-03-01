# Step 7 実装サマリ

## 概要

changeSpec Step 7 に従い、`tasks.ts` から deprecated 関数・死コードを削除した。enqueueStartTask / enqueueRegistTask および関連する EnqueueTaskOptions、scheduleTask、listTasks、deleteTask、TaskKind、ScheduleTaskParams を削除。enqueueTournamentTask のみが残り、Cloud Tasks 投入は新 payload フローに一本化された。

---

## 1. 確認観点とテスト結果

| # | 観点 | 期待結果 | 検証 |
|---|------|----------|------|
| 1 | ビルド | `npm run build` が成功する | ✓ 成功 |
| 2 | import 残骸 | 削除シンボルを import している箇所が無い（functions/src、__tests__ 除く） | ✓ step7_deprecatedRemoval.spec.ts |
| 3 | 回帰テスト | step1_no_enqueue_regression、step5 がパス | ✓ 全パス |
| 4 | enqueueTournamentTask | 従来どおり動作（Step 4/6 のテストがパス） | ✓ step4, step6 パス |
| 5 | 旧 payload | controlHook が action/rev を引き続き受付 | ✓ step6 旧 payload テストパス |

---

## 2. 変更・修正ファイル

### 2.1 修正：tasks.ts

**パス**: `functions/src/domains/tournament_createTournament/services/tasks.ts`

| 種別 | 内容 |
|------|------|
| 削除 | enqueueStartTask、enqueueRegistTask |
| 削除 | EnqueueTaskOptions |
| 削除 | scheduleTask、listTasks、deleteTask |
| 削除 | TaskKind、ScheduleTaskParams |
| 削除 | 未使用定数（CONTROL_HOOK_URL、TASK_SA、QUEUE_NAME、REGION。enqueueTournamentTask は getEnv を直接使用） |
| 維持 | enqueueTournamentTask、PROJECT_ID、client、getEnv |

**残存 export**: `enqueueTournamentTask` のみ

### 2.2 修正：cloud_scheduler_and_tasks_summary.md

**パス**: `docs/cloud_scheduler_and_tasks_summary.md`

| 種別 | 内容 |
|------|------|
| 修正 | セクション 2「Cloud Tasks」を enqueueTournamentTask ベースの新フローに更新 |
| 修正 | セクション 4「まとめ」の Cloud Tasks を新フロー（enqueue バッチ、作成完了後即時 enqueue）に更新 |

### 2.3 追記：Step 4〜6 implementation_summary

| ファイル | 追記内容 |
|----------|----------|
| step4/implementation_summary.md | 既存関数欄：「Step 7 で削除済み」に更新 |
| step5/implementation_summary.md | 補足セクション追加：「enqueueStartTask, enqueueRegistTask は Step 7 で削除済み」 |
| step6/implementation_summary.md | 注意点に「Step 7 実施後、旧 payload 受付は残存タスク処理のためのみ」を追記 |

---

## 3. テスト結果

### 3.1 Step 7 テスト（step7_deprecatedRemoval.spec.ts）

```
Step 7: deprecated 関数・死コード削除の確認
  tasks.ts
    ✓ 削除対象の関数・型が含まれていないこと
    ✓ enqueueTournamentTask が残っていること
    ✓ getEnv で環境変数を直接参照していること（定数経由でなく）
      - CONTROL_HOOK_URL, TASKS_QUEUE, TASKS_LOCATION, TASKS_INVOKER_SA の各キーを getEnv で直接参照
    ✓ 旧モジュール級定数（CONTROL_HOOK_URL, TASK_SA, QUEUE_NAME, REGION）が復活していないこと
  import 残骸チェック（changeSpec 6.1, 7.2）
    ✓ functions/src 以下（__tests__ 除く）に削除シンボルが含まれていないこと
```

### 3.2 関連テスト一括実行結果

```bash
cd functions && npm test -- __tests__/tournament_createTournament/
```

| テスト | 結果 |
|--------|------|
| step1_emulator_verification | PASS |
| step1_no_enqueue_regression | PASS |
| step3_taskSyncNeeded | PASS |
| step4_enqueueCore | PASS |
| step5_enqueueAfterCreate | PASS |
| step6_controlHook | PASS |
| step7_deprecatedRemoval | PASS |

---

## 4. 実行コマンド

```bash
# ビルド
cd functions && npm run build

# Step 7 テストのみ
npm test -- __tests__/tournament_createTournament/step7_deprecatedRemoval.spec.ts

# tournament_createTournament 全テスト
npm test -- __tests__/tournament_createTournament/
```

**前提**: step1_emulator_verification 実行時は Firestore Emulator 起動（`firebase emulators:start --only firestore`）

---

## 5. デプロイと運用

### 5.1 デプロイ順序

- 本ステップはコード整理であり、**既存の controlHook 動作に影響なし**
- 旧 payload 受付は残存タスク処理のため維持
- デプロイ後、旧 payload の**投入経路**（enqueueStartTask 等）は削除済みのため、新規投入は enqueueTournamentTask 経由のみ

### 5.2 注意点

- controlHook の旧 payload 受付削除は、キュー枯渇確認後に別ステップで実施
- 枯渇確認の目安：Step 1 デプロイから 30 日以上経過 + キュー実態確認（Console/CLI）

---

## 6. チェックリスト（changeSpec 8）

- [x] tasks.ts から enqueueStartTask を削除
- [x] tasks.ts から enqueueRegistTask を削除
- [x] tasks.ts から EnqueueTaskOptions を削除
- [x] tasks.ts から scheduleTask, listTasks, deleteTask を削除
- [x] tasks.ts から TaskKind, ScheduleTaskParams を削除
- [x] tasks.ts の未使用定数を削除
- [x] cloud_scheduler_and_tasks_summary.md を新仕様に合わせて更新
- [x] grep で import 残骸が無いことを確認（テストで自動検証）
- [x] `npm run build` が成功する
- [x] 関連テストがパスする
