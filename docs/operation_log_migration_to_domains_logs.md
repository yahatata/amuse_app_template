# 操作履歴関連を domains/logs へ移行する際の分け方

## 前提

- `functions/src/domains/` 配下に **`logs`** ディレクトリを新設する。
- 操作履歴の「取得」「取り消し」に特化した callables と、その取り消し処理を行う services を `domains/logs` に集約する。
- **操作ログを書き込むだけの callables**（addon, bustAndExit など）は **移さない**。これらはトーナメント実行ドメインのまま `tournament_activeTournament` に残し、`operationLog` ライブラリを参照する形にする。

---

## 1. 新規ディレクトリ構成

```
functions/src/domains/logs/
├── callables/          # 操作履歴の取得・取り消しを扱う Callable 関数
├── services/           # 取り消し処理の実装（undo*）
├── lib/                # 操作ログ用共通ライブラリ（callable/service ではない）
│   └── operationLog.ts
└── index.ts            # getActionLogs, rollbackAction を export
```

---

## 2. callables に置くファイル（移動元 → 移動先）

| 移動元 | 移動先 |
|--------|--------|
| `domains/tournament_activeTournament/callables/getActionLogs.ts` | `domains/logs/callables/getActionLogs.ts` |
| `domains/tournament_activeTournament/callables/rollbackAction.ts` | `domains/logs/callables/rollbackAction.ts` |

**役割**

- **getActionLogs**: 操作履歴一覧の取得（operationLogs の読み取り）。
- **rollbackAction**: 指定操作の取り消し実行（operationId を受け取り、該当 undo サービスを呼ぶ）。

---

## 3. services に置くファイル（移動元 → 移動先）

| 移動元 | 移動先 |
|--------|--------|
| `domains/tournament_activeTournament/services/undoAddon.ts` | `domains/logs/services/undoAddon.ts` |
| `domains/tournament_activeTournament/services/undoBulkAddon.ts` | `domains/logs/services/undoBulkAddon.ts` |
| `domains/tournament_activeTournament/services/undoBustAndExit.ts` | `domains/logs/services/undoBustAndExit.ts` |
| `domains/tournament_activeTournament/services/undoBustAndReentry.ts` | `domains/logs/services/undoBustAndReentry.ts` |
| `domains/tournament_activeTournament/services/undoAssignSeatToPlayer.ts` | `domains/logs/services/undoAssignSeatToPlayer.ts` |
| `domains/tournament_activeTournament/services/undoReseatAllPlayers.ts` | `domains/logs/services/undoReseatAllPlayers.ts` |
| `domains/tournament_activeTournament/services/undoRegisterForTournament.ts` | `domains/logs/services/undoRegisterForTournament.ts` |
| `domains/tournament_activeTournament/services/undoRegisterParticipants.ts` | `domains/logs/services/undoRegisterParticipants.ts` |

**役割**

- いずれも「取り消し」処理の実装。`rollbackAction` から operation 種別に応じて呼ばれる。
- トーナメント状態（views/main, tablesSeat, usersList, bills 等）を更新するため、Firestore パスは `scheduledTournaments/{id}/...` を参照したまま（ログ専用ドメインに移すが、処理対象はトーナメントデータ）。

---

## 4. lib に置くファイル（移動元 → 移動先）

| 移動元 | 移動先 |
|--------|--------|
| `unused_function_lib/operationLog.ts` | `domains/logs/lib/operationLog.ts` |

- `writeSingleOperationLog`, `markOperationLogRolledBack`, `toErrorSummary` 等を提供する共通ライブラリ（callable でも service でもない）。

---

## 5. 移さないファイル（現状のまま）

### 5.1 操作ログを「書くだけ」の callables（tournament_activeTournament に残す）

- `addon.ts`
- `bustAndExit.ts`
- `bustAndReentry.ts`
- `assignSeatToPlayer.ts`
- `reseatAllPlayers.ts`
- `registerForTournament.ts`
- `registerParticipants.ts`
- （一括アドオンがあれば）`bulkAddon.ts`

これらは「トーナメントの業務処理」が主で、その副次的に `writeSingleOperationLog` を呼んでいる。ドメイン的にはトーナメント実行のままとする。

---

## 6. スケジューラー等

- **操作履歴用の onSchedule / Pub/Sub 等は現状なし。**
- 他ドメインのスケジューラー例（参考）:
  - `domains/staff/scheduler/scheduledCleanup.ts`
  - `domains/storeMeta/scheduler/weeklyPlanner.ts`
  - `domains/attendance/scheduler/monthlyPayrollTrigger.ts`
  - `domains/analytics/scheduler/`（nightly*）
  - `shared/businessHours/scheduler/scheduleGenerateNextYearBusinessHours.ts`

将来、操作ログの「古いログ削除」や「集計」でスケジューラーを入れる場合は、`domains/logs/scheduler/` を新設し、そこに配置する想定でよい。

---

## 7. 移行時に必要な修正の種類

1. **import パスの変更**
   - `rollbackAction.ts`: 各 undo の import を `../services/` → 同じ logs 内の `../services/` に（相対パスは `domains/logs/callables/` 起点で合わせる）。
   - 各 `undo*.ts`: 参照している Firestore パスや `scheduledTournaments` 等はそのまま。必要に応じて `getFirestore` 等の import は現状どおり。

2. **tournament_activeTournament 側**
   - `domains/tournament_activeTournament/index.ts` から `getActionLogs`, `rollbackAction` の export を削除。
   - `domains/tournament_activeTournament/services/index.ts` から上記 8 つの undo の export を削除。

3. **ルート index での export**
   - `functions/src/index.ts`（またはメインの export 集約ファイル）で、`domains/logs` から `getActionLogs` と `rollbackAction` を export するように追加（例: `export * from "./domains/logs";` または個別 export）。

4. **operationLog（lib）の参照**
   - `domains/logs/lib/operationLog.ts` に移すため、参照する側の import を次のように変更する。
   - **logs 内から**: `../lib/operationLog`（callables から）、`../lib/operationLog`（services から）。
   - **他ドメインから**（tournament_activeTournament の addon, bustAndReentry, registerForTournament 等）: `../../logs/lib/operationLog` またはルートからの相対パスで `../../../domains/logs/lib/operationLog`。

---

## 8. まとめ（分け方の一覧）

| 種類 | 配置先 | ファイル |
|------|--------|----------|
| 操作履歴の取得・取り消し API | `domains/logs/callables/` | getActionLogs.ts, rollbackAction.ts |
| 取り消し処理の実装 | `domains/logs/services/` | undoAddon, undoBulkAddon, undoBustAndExit, undoBustAndReentry, undoAssignSeatToPlayer, undoReseatAllPlayers, undoRegisterForTournament, undoRegisterParticipants |
| ログ用共通ライブラリ | `domains/logs/lib/` | operationLog.ts（移動元: unused_function_lib/operationLog.ts） |
| 操作ログ書き込み API | 移さない（tournament_activeTournament） | addon, bustAndExit, bustAndReentry, assignSeatToPlayer, reseatAllPlayers, registerForTournament, registerParticipants（+ bulkAddon 等） |
| スケジューラー | 現状なし（将来は `domains/logs/scheduler/`） | なし |

実施する際は、上記の「移さない」を守ったうえで、**callables 2 本**・**services 8 本**・**lib の operationLog.ts 1 本**を `domains/logs` に移し、export と import を上記のとおり整理する。
