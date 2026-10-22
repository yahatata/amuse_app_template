# Step 1 実装サマリ

## 1. 実装内容の詳細

### 1.1 createScheduledTournament.ts

| 種別 | 内容 |
|------|------|
| **削除** | `import { enqueueStartTask, enqueueRegistTask } from "../services/tasks";`（4 行目） |
| **削除** | Cloud Tasks 投入の try-catch ブロック（約 29 行）。具体的には以下を含む範囲：<br>・`// Cloud Tasks にタスクを投入` のコメント<br>・`console.log('=== Cloud Tasks 投入開始 ===')` 等のログ<br>・`plannedStartAt` が過去の場合は 5 秒後に丸める `startTime` の算出<br>・`enqueueStartTask(tournamentId, startTime, 1)` の呼び出し<br>・`plannedRegistAt` が過去の場合は 10 秒後に丸める `registTime` の算出<br>・`enqueueRegistTask(tournamentId, registTime, 1)` の呼び出し<br>・`} catch (taskError) { ... }` まで |
| **残存** | トランザクション完了後の `return { success: true, tournamentId, ... }` は変更なし |

### 1.2 createTournamentRecurrence.ts

| 種別 | 内容 |
|------|------|
| **削除** | `import { enqueueStartTask, enqueueRegistTask } from "../services/tasks";`（5 行目） |
| **削除** | ローカル関数 `createScheduledTournamentFromRecurrence` 内の Cloud Tasks 投入 try-catch ブロック（約 29 行）。内容は createScheduledTournament と同様（開始 5 秒後・レジスト 10 秒後の丸めあり） |
| **削除** | 未使用変数 `const tournamentId = tournamentRef.id;`（enqueue 呼び出し削除により未使用化） |
| **残存** | `console.log('定期開催トーナメント作成完了:', tournamentRef.id);` と `return tournamentRef.id;` |

### 1.3 generateRecurringTournamentsCore.ts

| 種別 | 内容 |
|------|------|
| **削除** | `import { enqueueStartTask, enqueueRegistTask } from "./tasks";`（16 行目） |
| **削除** | `import { getEnv } from "../../../shared/firebase";`（15 行目）。tasks 投入以外で未使用のため |
| **削除** | Cloud Tasks 投入 try-catch ブロック。以下を含む：<br>・`const recurringTaskOptions = { queue: getEnv(...), invokerSa: getEnv(...), location: ... };`<br>・`await enqueueStartTask(..., recurringTaskOptions)`<br>・`await enqueueRegistTask(..., recurringTaskOptions)` |
| **削除** | 未使用変数 `const tournamentId = tournamentRef.id;` |
| **変更** | ファイル冒頭コメント。「Cloud Tasks に開始・レジスト確定タスクを投入」→「Cloud Tasks 投入は enqueue 専用 function に委譲」に修正 |
| **残存** | トランザクション完了後の `return tournamentRef.id;` |

### 1.4 tasks.ts

| 種別 | 内容 |
|------|------|
| **変更** | なし（changeSpec 通り。enqueueStartTask / enqueueRegistTask は Step 4 で deprecated 解消予定のため残置） |

### 1.5 追加ファイル：回帰テスト

| ファイル | 内容 |
|----------|------|
| `functions/__tests__/tournament_createTournament/step1_no_enqueue_regression.spec.ts` | ソースファイルの内容を fs で読み、禁止文字列の有無をアサートする回帰テスト（後述） |

### 1.6 付随修正（テスト import パス）

本ステップとは別件として、他テストのモジュール解決エラーを修正。フォルダ構成変更（`src/helpers/*` → `src/domains/*/repos/*` 等）に合わせて import パスを更新。

- 修正対象：analytics, config, helpers/billsApi, bills, itemOrder, sideGame, callables, triggers, storeManagement, close_process, accounting 等（約 50 ファイル）

---

## 2. 実施したテストの詳細

### 2.1 Step 1 回帰テスト（step1_no_enqueue_regression.spec.ts）

| # | テストケース | 観点 | アサート内容 | 結果 |
|---|--------------|------|--------------|------|
| 1 | createScheduledTournament.ts | enqueue 呼び出しの不在 | ファイル内容に `enqueueStartTask` および `enqueueRegistTask` が含まれないこと | PASS |
| 2 | createTournamentRecurrence.ts | 同上 | 同上 | PASS |
| 3 | generateRecurringTournamentsCore.ts | 同上 | 同上 | PASS |
| 4 | generateRecurringTournamentsCore.ts | getEnv import の削除 | `import ... getEnv ... from` にマッチする行が存在しないこと | PASS |
| 5 | generateRecurringTournamentsCore.ts | recurringTaskOptions の削除 | ファイル内容に `recurringTaskOptions` が含まれないこと | PASS |

**実行コマンド**:
```bash
cd functions && npm run test -- __tests__/tournament_createTournament/step1_no_enqueue_regression.spec.ts
```

**手法**: Node.js の `fs.readFileSync` でソースを読み、`expect(content).not.toContain(...)` で禁止文字列の有無を検証。Firestore Emulator 不要。

### 2.2 ビルド

| テスト | 観点 | 実行コマンド | 結果 |
|--------|------|--------------|------|
| TypeScript ビルド | 型エラー・構文エラーがないこと | `cd functions && npm run build` | PASS |

### 2.3 コード確認（手動）

| # | 観点 | 実施内容 | 結果 |
|---|------|----------|------|
| 1 | createScheduledTournament から enqueue 削除 | ソースを読み、`enqueueStartTask` / `enqueueRegistTask` が存在しないことを確認 | ✅ |
| 2 | createTournamentRecurrence から enqueue 削除 | 同上 | ✅ |
| 3 | generateRecurringTournamentsCore から enqueue・getEnv 削除 | 同上。加えて `recurringTaskOptions` が存在しないことを確認 | ✅ |
| 4 | tasks.ts は変更なし | 本ステップで tasks.ts への変更が加えられていないことを確認 | ✅ |

### 2.4 Emulator 統合テスト（step1_emulator_verification.spec.ts）

| # | 観点 | 結果 |
|---|------|------|
| 7 | 単発作成が scheduledTournament を正常に作成する | ✅ PASS |
| 8 | 定期作成が scheduledTournament を正常に作成する | ✅ PASS |
| 9 | 定期生成が scheduledTournament を正常に生成する | ✅ PASS |
| 10 | Cloud Tasks が投入されないこと | コード削除により担保。enqueue 呼び出しなし |

**実行コマンド**（Firestore Emulator 起動後）:
```bash
cd functions && npm run test -- __tests__/tournament_createTournament/step1_emulator_verification.spec.ts
```

詳細は `step1/emulator_verification_guide.md` を参照。

---

## 3. 確認観点と結果（verification_points 対応）

| # | 観点 | 担当 | 実施内容 | 結果 |
|---|------|------|----------|------|
| 1 | createScheduledTournament から enqueue 削除 | コード確認 | ソースを grep/目視で確認 | ✅ |
| 2 | createTournamentRecurrence から enqueue 削除 | 同上 | 同上 | ✅ |
| 3 | generateRecurringTournamentsCore から enqueue・getEnv 削除 | 同上 | 同上。recurringTaskOptions も確認 | ✅ |
| 4 | tasks.ts は変更なし | 同上 | 変更差分なし | ✅ |
| 5 | ビルド成功 | 自動 | `npm run build` 実行 | ✅ |
| 6 | 回帰テスト | 自動 | step1_no_enqueue_regression.spec.ts 5 ケース実行 | ✅ 5/5 PASS |
| 7〜10 | Emulator 統合テスト | 自動 | step1_emulator_verification.spec.ts 実行 | ✅ 3/3 PASS |

---

## 4. Step 2 前の確認チェックリスト

- [x] Firestore Emulator 起動
- [x] 単発作成1件 → scheduledTournament が作成される
- [x] 定期作成1回 → scheduledTournament が作成される
- [x] 定期生成1回 → scheduledTournament が増える
- [x] Cloud Tasks 未投入（enqueue コード削除により担保）

---

## 5. 備考

- **Emulator 依存テスト**：Firestore Emulator を使用する統合テストは、Emulator 未起動時に `TypeError: fetch failed` で失敗する。本ステップの回帰テストは Emulator 不要。
- **付随修正の範囲**：テスト import パスの修正は本ステップの changeSpec 外。既存のモジュール解決エラー解消のため実施。
