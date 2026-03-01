# Step 1 changeSpec：既存の Cloud Tasks 投入処理の廃止

## 1. 概要

### 1.1 目的

`spec.md` に基づき、scheduledTournament 作成時の **直接 Cloud Tasks 投入を廃止** する。

- Cloud Tasks の 30 日（720h）制限を回避するため、作成時点での直接投入をやめる
- 後続ステップ（Step 4〜5）で enqueue 専用 function を導入し、日次バッチによる投入に一本化する準備

### 1.2 スコープ

- **対象**：`createScheduledTournament`、`createTournamentRecurrence`、`generateRecurringTournamentsCore` における `enqueueStartTask` / `enqueueRegistTask` の呼び出し削除
- **非対象**：controlHook の修正、enqueue 専用 function の新規作成（別ステップ）

---

## 2. 現状（As-Is）

### 2.1 Cloud Tasks 投入の呼び出し関係

```
createScheduledTournament.ts
  └─ enqueueStartTask(tournamentId, startTime, 1)
  └─ enqueueRegistTask(tournamentId, registTime, 1)

createTournamentRecurrence.ts
  └─ createScheduledTournamentFromRecurrence()
       └─ enqueueStartTask(tournamentId, startTime, 1)        ※ options なし
       └─ enqueueRegistTask(tournamentId, registTime, 1)      ※ options なし

generateRecurringTournamentsCore.ts
  └─ createScheduledTournamentFromRecurrence()  （同ファイル内のローカル関数）
       └─ enqueueStartTask(..., recurringTaskOptions)         ※ RECURRING_* 使用
       └─ enqueueRegistTask(..., recurringTaskOptions)        ※ RECURRING_* 使用
```

### 2.2 対象ファイルの現状

#### 2.2.1 createScheduledTournament.ts

| 項目 | 内容 |
|------|------|
| ファイル | `functions/src/domains/tournament_createTournament/callables/createScheduledTournament.ts` |
| import | 4 行目: `import { enqueueStartTask, enqueueRegistTask } from "../services/tasks";` |
| 投入タイミング | トランザクション完了後（343 行目〜）、return の直前 |
| 投入処理 | 349〜377 行目 |
| 開始タスク | `plannedStartAt` が過去の場合は 5 秒後に丸める。`enqueueStartTask(tournamentId, startTime, 1)` |
| レジストタスク | `plannedRegistAt` が過去の場合は 10 秒後に丸める。`enqueueRegistTask(tournamentId, registTime, 1)` |
| エラー扱い | try-catch で囲み、失敗時もトーナメント作成は成功とする（ログのみ） |

**該当コード抜粋（349〜377 行目）**:

```typescript
    // Cloud Tasks にタスクを投入
    try {
      console.log('=== Cloud Tasks 投入開始 ===');
      // ...
      const startTaskName = await enqueueStartTask(tournamentId, startTime, 1);
      const registTaskName = await enqueueRegistTask(tournamentId, registTime, 1);
      console.log('=== Cloud Tasks 投入完了 ===');
    } catch (taskError) {
      console.error('Cloud Tasks 投入エラー:', taskError);
    }
```

#### 2.2.2 createTournamentRecurrence.ts

| 項目 | 内容 |
|------|------|
| ファイル | `functions/src/domains/tournament_createTournament/callables/createTournamentRecurrence.ts` |
| import | 5 行目: `import { enqueueStartTask, enqueueRegistTask } from "../services/tasks";` |
| 投入箇所 | ローカル関数 `createScheduledTournamentFromRecurrence` 内（484〜512 行目） |
| options | **なし**（TASKS_QUEUE / TASKS_INVOKER_SA をデフォルト使用） |
| 投入処理 | createScheduledTournament.ts と同様（開始 5 秒後、レジスト 10 秒後の丸めあり） |

**該当コード抜粋**:

```typescript
    // Cloud Tasks にタスクを投入
    try {
      console.log('=== Cloud Tasks 投入開始（定期開催） ===');
      const startTaskName = await enqueueStartTask(tournamentId, startTime, 1);
      const registTaskName = await enqueueRegistTask(tournamentId, registTime, 1);
      console.log('=== Cloud Tasks 投入完了 ===');
    } catch (taskError) {
      console.error('Cloud Tasks 投入エラー:', taskError);
    }
```

#### 2.2.3 generateRecurringTournamentsCore.ts

| 項目 | 内容 |
|------|------|
| ファイル | `functions/src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts` |
| import | 16 行目: `import { enqueueStartTask, enqueueRegistTask } from "./tasks";` |
| 投入箇所 | 同ファイル内の `createScheduledTournamentFromRecurrence` 相当のローカル実装（442〜467 行目） |
| options | **recurringTaskOptions** を使用 |
| 環境変数 | `RECURRING_TOURNAMENT_TASKS_QUEUE`, `RECURRING_TOURNAMENT_TASKS_INVOKER_SA`, `RECURRING_TOURNAMENT_TASKS_LOCATION`（未設定時は TASKS_LOCATION） |

**該当コード抜粋**:

```typescript
    try {
      console.log("=== Cloud Tasks 投入開始（定期開催） ===");
      const recurringTaskOptions = {
        queue: getEnv("RECURRING_TOURNAMENT_TASKS_QUEUE"),
        invokerSa: getEnv("RECURRING_TOURNAMENT_TASKS_INVOKER_SA"),
        location: process.env.RECURRING_TOURNAMENT_TASKS_LOCATION || getEnv("TASKS_LOCATION"),
      };
      // ...
      await enqueueStartTask(tournamentId, startTime, 1, recurringTaskOptions);
      await enqueueRegistTask(tournamentId, registTime, 1, recurringTaskOptions);
      console.log("=== Cloud Tasks 投入完了 ===");
    } catch (taskError) {
      console.error("Cloud Tasks 投入エラー:", taskError);
    }
```

#### 2.2.4 tasks.ts の関連定義

| 定義 | 行 | 呼び出し元 | 備考 |
|------|-----|------------|------|
| `enqueueStartTask` | 156〜217 | createScheduledTournament, createTournamentRecurrence, generateRecurringTournamentsCore | 本ステップで呼び出し削除後に未使用になる |
| `enqueueRegistTask` | 223〜285 | 同上 | 同上 |
| `EnqueueTaskOptions` | 146〜150 | enqueueStartTask, enqueueRegistTask の第4引数 | generateRecurringTournamentsCore のみ使用。削除後に未使用 |
| `scheduleTask` | 33〜98 | **なし** | 他ファイルから import されていない（死コード） |
| `listTasks` | 103〜122 | **なし** | 同上 |
| `deleteTask` | 127〜140 | **なし** | 同上 |
| `TaskKind` | 18 | scheduleTask の payload で使用 | scheduleTask が未使用のため死コード |
| `ScheduleTaskParams` | 23〜28 | scheduleTask の引数型 | 同上 |

### 2.3 環境変数

| 変数名 | 用途 | 使用箇所 |
|--------|------|----------|
| TASKS_QUEUE | キュー名（デフォルト） | enqueueStartTask / enqueueRegistTask（options 省略時） |
| TASKS_LOCATION | リージョン | 同上 |
| TASKS_INVOKER_SA | 実行用 SA | 同上 |
| RECURRING_TOURNAMENT_TASKS_QUEUE | 定期生成用キュー | generateRecurringTournamentsCore の recurringTaskOptions |
| RECURRING_TOURNAMENT_TASKS_INVOKER_SA | 定期生成用 SA | 同上 |
| RECURRING_TOURNAMENT_TASKS_LOCATION | 定期生成用リージョン（任意） | 同上（未設定時は TASKS_LOCATION） |

---

## 3. 目標（To-Be）

### 3.1 本ステップ完了後の状態

- `createScheduledTournament`：トーナメント作成のみ。Cloud Tasks 投入は行わない
- `createTournamentRecurrence`：同上。各 scheduledTournament 作成後、Cloud Tasks 投入は行わない
- `generateRecurringTournamentsCore`：同上。各 scheduledTournament 作成後、Cloud Tasks 投入は行わない
- 注意：**既存の Cloud Tasks（既に投入済みのタスク）はそのまま動作する**。controlHook は現状どおり `action` / `rev` を受け付ける

### 3.2 動作への影響

- **新規作成された scheduledTournament**：本ステップ後は Cloud Tasks が投入されないため、**自動開始・レジスト締切が実行されない**
- Step 4〜5 で enqueue 専用 function と作成後の呼び出しを実装するまで、トーナメントは手動で開始する必要がある
- 本ステップは「廃止」のみを行い、代替の enqueue 呼び出しは Step 5 で追加する

---

## 4. 変更内容（ファイル単位）

### 4.1 createScheduledTournament.ts

| 変更種別 | 内容 |
|----------|------|
| import 削除 | `import { enqueueStartTask, enqueueRegistTask } from "../services/tasks";` を削除 |
| ブロック削除 | 349〜377 行目の Cloud Tasks 投入の try-catch ブロック全体を削除 |

**削除対象の境界**:

- 開始：`// Cloud Tasks にタスクを投入` のコメント
- 終了：`} catch (taskError) { ... }` の閉じ括弧まで

**残すもの**:

- トランザクション完了後の `return { success: true, ... }` はそのまま

### 4.2 createTournamentRecurrence.ts

| 変更種別 | 内容 |
|----------|------|
| import 削除 | `import { enqueueStartTask, enqueueRegistTask } from "../services/tasks";` を削除 |
| ブロック削除 | `createScheduledTournamentFromRecurrence` 内の 484〜512 行目の Cloud Tasks 投入 try-catch ブロックを削除 |

**削除対象**:

- `// Cloud Tasks にタスクを投入` から `} catch (taskError) { ... }` まで
- `console.log('定期開催トーナメント作成完了:', tournamentRef.id);` と `return tournamentRef.id;` は残す

### 4.3 generateRecurringTournamentsCore.ts

| 変更種別 | 内容 |
|----------|------|
| import 削除 | `import { enqueueStartTask, enqueueRegistTask } from "./tasks";` を削除 |
| getEnv の import | **削除条件**：tasks 投入以外で `getEnv` を使っていないことを確認し、未使用なら `import { getEnv } from "../../../shared/firebase";` を削除する。判断の揺れを防ぐため、条件を満たす場合は必ず削除する。 |
| ブロック削除 | 442〜467 行目の Cloud Tasks 投入 try-catch ブロックを削除。**recurringTaskOptions の定義も含めて削除** |

**削除対象**:

- `try { console.log("=== Cloud Tasks 投入開始（定期開催） ===");`
- `const recurringTaskOptions = { queue: ..., invokerSa: ..., location: ... };`
- `const nowForTask = ...` 〜 `await enqueueRegistTask(...)`
- `console.log("=== Cloud Tasks 投入完了 ===");`
- `} catch (taskError) { ... }` まで

**getEnv 削除の判断**:
- 本ファイルでは `getEnv` は recurringTaskOptions 内でのみ使用。Cloud Tasks 投入ブロック削除後は未使用となる。
- → **削除条件を満たすため、`import { getEnv } from "../../../shared/firebase";` を削除する。**

### 4.4 tasks.ts（死コード・整理対象）

本ステップでは **削除しない**。以下を changeSpec の「残す／消す」方針として記載する。

| 対象 | 方針 | 理由 |
|------|------|------|
| `enqueueStartTask` | **残す（deprecated 扱い）** | **Step 4 で置き換える前提で当面残す**。新 payload の投入関数を追加後、Step 4 で削除する。残すことで「どっちを使うか」のブレを防ぐため、deprecated であることを明記する。 |
| `enqueueRegistTask` | **残す（deprecated 扱い）** | 同上 |
| `EnqueueTaskOptions` | **残す** | enqueueStartTask / enqueueRegistTask の型定義のため。上記関数が残る限り必要 |
| `scheduleTask` | **残す** | 他ドキュメント（cloud_scheduler_and_tasks_summary.md）から参照されている可能性。削除は別途検討 |
| `listTasks` | **残す** | 現状他から import されていない。**注意**：使っていないデバッグ関数を残すと、将来「安全に公開して良いのか」や「権限/監査」の論点が発生しうる。必要なければ別途削除を検討 |
| `deleteTask` | **残す** | 同上 |
| `TaskKind` | **残す** | scheduleTask の型定義に必要 |
| `ScheduleTaskParams` | **残す** | 同上 |

**結論**：tasks.ts には **本ステップでは一切変更を加えない**。呼び出し削除のみで、未使用になっても削除しない。

**Step 4 との関係**：`enqueueStartTask` / `enqueueRegistTask` は Step 4 で新 enqueue 関数を追加する際に **置き換え対象** とする。Step 4 の changeSpec で deprecation 解消と削除を明記すること。

---

## 5. 変更後のコード構造

### 5.1 createScheduledTournament.ts（変更後イメージ）

- トランザクション完了
- （Cloud Tasks 投入ブロック削除）
- `return { success: true, tournamentId, ... }`

### 5.2 createTournamentRecurrence.ts（変更後イメージ）

- `createScheduledTournamentFromRecurrence` 内：
  - トランザクション完了
  - （Cloud Tasks 投入ブロック削除）
  - `console.log('定期開催トーナメント作成完了:', ...)`
  - `return tournamentRef.id`

### 5.3 generateRecurringTournamentsCore.ts（変更後イメージ）

- トランザクション完了
- （Cloud Tasks 投入ブロック削除）
- `return tournamentRef.id`
- `getEnv` の import を削除

---

## 6. 検証方法

### 6.1 ビルド・型チェック

```bash
cd functions && npm run build
```

- エラーなく完了すること

### 6.2 単体テスト（存在する場合）

- tournament 関連のテストが存在する場合は実行し、失敗しないことを確認

### 6.3 手動確認

- 単発作成：`createScheduledTournament` を呼び出し、scheduledTournament が作成されること。Cloud Tasks が投入されないこと（コンソールやログで確認）
- 定期作成：`createTournamentRecurrence` を呼び出し、scheduledTournament が複数作成されること。Cloud Tasks が投入されないこと
- 定期生成：`generateRecurringTournaments` または Scheduler を実行し、scheduledTournament が生成されること。Cloud Tasks が投入されないこと

---

## 7. 注意事項・リスク

### 7.1 既存タスクへの影響

- 本ステップ適用時点で **既に投入済み** の Cloud Tasks は影響を受けない
- controlHook は従来どおり動作する

### 7.2 新規作成トーナメントの扱い

- 本ステップ適用後、**新規作成**された scheduledTournament には Cloud Tasks が投入されない
- 自動開始・レジスト締切が行われない期間が発生する
- Step 5 で enqueue 呼び出しを追加するまで、運用上は手動対応または Step 4〜5 を速やかに実装すること

### 7.3 ロールバック

- 変更を revert すれば元の挙動に戻る
- データベースへの影響なし

---

## 8. チェックリスト

- [ ] createScheduledTournament.ts から enqueue 呼び出しと import を削除
- [ ] createTournamentRecurrence.ts から enqueue 呼び出しと import を削除
- [ ] generateRecurringTournamentsCore.ts から enqueue 呼び出し、recurringTaskOptions、関連 import を削除
- [ ] tasks.ts は変更しない
- [ ] `npm run build` が成功する
- [ ] 必要に応じて手動で作成フローを確認
