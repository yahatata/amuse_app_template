# 実装ベース精査: `function_custom`（2026-04-10、**2026-04-11 再集計**）

自動抽出（`functions/src`、※ `debug/`・`demo_data/`・`unused_function_lib/` 除外）。本番ログに依存しない棚卸し用。

## 改訂メモ（2026-04-11）

- **静的に `function_custom` と言い切れる `logOpsError` は **52 件****（TypeScript AST 再集計）。**旧版にあった **48 件**の一覧表および **48+7=55 件**の見込みは撤回**する。
- **差分の理由**: 旧スナップショットは、`if (… instanceof FunctionCustomError)` の **外**にある **汎用 `catch` 側の `logOpsError`**（例: `placeOrder` の 2 行目、`createTournamentRecurrence` / `enqueueTournamentTasks` の後段）を **FC 分岐内と誤認**して二重に数えていた。
- **再集計スクリプト**: `functions/scripts/countStaticFunctionCustomLogOps.cjs`  
  - `cd functions && node scripts/countStaticFunctionCustomLogOps.cjs` → 件数 JSON  
  - `LIST=1 node scripts/countStaticFunctionCustomLogOps.cjs` → **ファイル:行** 全一覧  
  - 主対象外 Callable（`generateDummyData` / `debugSideGame`）を除く場合は `EXCLUDE_MAIN_TARGETS=1`（**静的 FC 件数は 52 のまま**）。
- **重要度判定の主対象 269 件**（`エラーログ_重要度判定要件定義.md` §4）との関係: **280 件**（上記フォルダ除外）から主対象外 **2 呼び出し**を除いた旧 **278 件**を出発点とし、さらに `unused_function_lib` へ移管した **9 呼び出し分**を除いた件数。**その 2 件（`generateDummyData` / `debugSideGame`）は本条件の静的 FC に含まれない**ため、**52 は 269 / 旧 278 / 280 のいずれでも同じ**。

---

## 1. 精査の意味・限界

- **静的に `function_custom` と言い切れる `logOpsError`**: 引数オブジェクトに **`errorKey` の文字列リテラル**がある、または **`if (… instanceof FunctionCustomError)` の then 節内だけ**の呼び出し、または（定義上）**`errorSource: 'function_custom'` の文字列リテラル**。
- **呼び出し側の現状**: `logOpsError({ … })` に **`errorSource: 'function_custom'` を渡している行はない**（`lineMessaging` 等は `external_api`）。payload の `errorSource` は **`resolveErrorSource`（`logOpsError.ts`）が決定**する。
- **`throw new FunctionCustomError`**: ドメイン実装で **FC が投げられる箇所**の行数（フォルダ別集計）。同一処理の分岐で複数行に分かれているため **行数＝業務件数ではない**。
- **含まないもの**: 汎用 `catch` で `cause` が実行時まで不明な呼び出し（結果として FC になり得るが静的に確定しない）。

## 2. サマリ

| 指標 | 件数 |
|------|------|
| `logOpsError`（上記フォルダ除外スコープ・実装サマリの「業務本体」と同趣旨） | **280** |
| 上記のうち **静的に `function_custom` 確定** | **52** |
| `throw new FunctionCustomError`（行） | **145**（§4・別スナップショット。FC throw の棚卸しは今回未再計測） |

### 2.1 静的に `function_custom` 確定の `logOpsError` — service 別（52 件）

`functionEntry` → `serviceByFunctionEntry` に基づく（`createBillWithActiveStay` は **accounting**）。

| service | 件数 |
|---------|------|
| accounting | 7 |
| orders | 2 |
| scheduler | 2 |
| store | 16 |
| tournament | 8 |
| tournament_schedule | 10 |
| user | 7 |

### 2.2 `throw new FunctionCustomError` — ドメイン直下フォルダ別（参考）

※ **2026-04-10 時点のスナップショット**。`logOpsError` 静的 FC の再集計とは別。

| domains/ 下フォルダ | throw 行数 |
|---------------------|------------|
| tournament_activeTournament | 60 |
| bills | 44 |
| storeMeta | 23 |
| tournament_createTournament | 18 |

### 2.3 `logOpsError` はあるが、§2.1 の「静的 FC 確定」が **0件** の service（2026-04-11）

**`user` は §2.1 に **7 件**あるため、下表には含めない**。

**注（`side_game`）:** `domains/sideGame` 自体に `throw new FunctionCustomError` は無いが、`depositTip` / `withdrawTip` / `leaveSeat` / `registerForSideGame` 等が **`bills/repos` を import** している。これらのモジュールは FC を投げ得るため、**ログ上は `function_custom` になり得る**。下表は **静的に確定する `logOpsError` 行が 0 件**という集計上の意味のみ。

| service |
|---------|
| analytics |
| attendance |
| audit_log |
| business_hours |
| config |
| device |
| line |
| payroll |
| shift |
| side_game |
| staff |

---

## 3. 静的に `function_custom` 確定の `logOpsError` 一覧（52件）

**正**: `functions` で次を実行した出力（`functions/src` 相対パス）。

```text
src/domains/bills/callables/accounting.ts:515
src/domains/bills/callables/accounting.ts:670
src/domains/bills/callables/cancelAccounting.ts:116
src/domains/bills/callables/updateActiveBill.ts:335
src/domains/bills/callables/verifyPaymentSplit.ts:164
src/domains/bills/repos/createBillWithActiveStay.ts:248
src/domains/bills/repos/startAccounting.ts:238
src/domains/itemOrder/callables/placeOrder.ts:190
src/domains/itemOrder/callables/placeOrderByUser.ts:181
src/domains/scheduler/replan/enqueueTournamentTasksReplanRequest.ts:129
src/domains/scheduler/replan/enqueueTournamentTasksReplanRequest.ts:146
src/domains/scheduler/replan/enqueueTournamentTasksReplanTask.ts:132
src/domains/storeMeta/callables/closeStore.ts:76
src/domains/storeMeta/callables/closeStoreTerminal.ts:149
src/domains/storeMeta/callables/closeStoreTerminal.ts:171
src/domains/storeMeta/callables/closeStoreTerminal.ts:428
src/domains/storeMeta/callables/closeStoreTerminal.ts:502
src/domains/storeMeta/callables/closeStoreTerminal.ts:551
src/domains/storeMeta/callables/continueBusinessTerminal.ts:330
src/domains/storeMeta/callables/openStore.ts:105
src/domains/storeMeta/callables/openStoreTerminal.ts:50
src/domains/storeMeta/callables/openStoreTerminal.ts:82
src/domains/storeMeta/callables/openStoreTerminal.ts:221
src/domains/storeMeta/services/applyCloseSnapshot.ts:136
src/domains/storeMeta/services/applyCloseSnapshot.ts:168
src/domains/storeMeta/services/applyCloseSnapshot.ts:217
src/domains/storeMeta/services/cleanupActiveStaysOnClose.ts:56
src/domains/storeMeta/services/finalizeUnsettledBillAfterAccounting.ts:70
src/domains/tournament_activeTournament/callables/addTableToTournament.ts:135
src/domains/tournament_activeTournament/callables/api.pause.ts:118
src/domains/tournament_activeTournament/callables/api.resume.ts:127
src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts:248
src/domains/tournament_activeTournament/callables/createTemporaryTable.ts:121
src/domains/tournament_activeTournament/callables/getRankingData.ts:78
src/domains/tournament_activeTournament/callables/removeTableFromTournament.ts:110
src/domains/tournament_activeTournament/callables/reseatAllPlayers.ts:284
src/domains/tournament_createTournament/callables/createScheduledTournament.ts:404
src/domains/tournament_createTournament/callables/createTournamentRecurrence.ts:147
src/domains/tournament_createTournament/callables/enqueueTournamentTasks.ts:41
src/domains/tournament_createTournament/callables/updateScheduledTournamentStartAt.ts:145
src/domains/tournament_createTournament/callables/updateScheduledTournamentStatus.ts:142
src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts:383
src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts:98
src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts:136
src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts:151
src/domains/user/callables/generateQRCode.ts:142
src/domains/user/callables/generateQRCode.ts:161
src/domains/user/callables/getFirebaseCustomToken.ts:71
src/domains/user/callables/getUserStatus.ts:58
src/domains/user/callables/manualCheckIn.ts:168
src/domains/user/callables/processVisitByQR.ts:218
src/domains/user/callables/verifyQRCode.ts:75
```

---

## 4. `throw new FunctionCustomError` 一覧（145行）

同一ファイル内の近接行は折り畳みのため **ファイル単位**で列挙する。

- `domains/bills/callables/accounting.ts` — 行: 266, 295, 418, 427, 582, 591（6）
- `domains/bills/callables/cancelAccounting.ts` — 行: 74（1）
- `domains/bills/callables/updateActiveBill.ts` — 行: 101, 109（2）
- `domains/bills/repos/appendExtra.ts` — 行: 83, 123（2）
- `domains/bills/repos/appendItem.ts` — 行: 102, 153（2）
- `domains/bills/repos/appendSideGameChip.ts` — 行: 105, 157（2）
- `domains/bills/repos/createBillWithActiveStay.ts` — 行: 118, 151（2）
- `domains/bills/repos/postEventAdjustment.ts` — 行: 128, 151, 161, 204, 217（5）
- `domains/bills/repos/postEventCancel.ts` — 行: 98, 110, 133, 143（4）
- `domains/bills/repos/postEventRefund.ts` — 行: 126, 142, 153, 176, 186（5）
- `domains/bills/repos/postEventReopen.ts` — 行: 97, 120, 130（3）
- `domains/bills/repos/recordTournamentAction.ts` — 行: 99, 154（2）
- `domains/bills/repos/startAccounting.ts` — 行: 84, 137, 146（3）
- `domains/bills/repos/updatePlace.ts` — 行: 82（1）
- `domains/bills/services/paymentSplitCalculator.ts` — 行: 178（1）
- `domains/bills/triggers/billsEventsOnCreate.ts` — 行: 102, 164, 174（3）
- `domains/storeMeta/callables/closeAssessmentTask.ts` — 行: 80（1）
- `domains/storeMeta/callables/closeStore.ts` — 行: 36, 47, 64（3）
- `domains/storeMeta/callables/closeStoreTerminal.ts` — 行: 120, 132, 139（3）
- `domains/storeMeta/callables/continueBusinessTerminal.ts` — 行: 118, 128, 156（3）
- `domains/storeMeta/callables/openAssessmentTask.ts` — 行: 97（1）
- `domains/storeMeta/callables/openStore.ts` — 行: 62, 74（2）
- `domains/storeMeta/callables/openStoreTerminal.ts` — 行: 31, 42, 142（3）
- `domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow.ts` — 行: 81, 91, 105（3）
- `domains/storeMeta/services/finalizeUnsettledBillAfterAccounting.ts` — 行: 42（1）
- `domains/storeMeta/services/processingLease.ts` — 行: 76, 86, 96（3）
- `domains/tournament_activeTournament/callables/addTableToTournament.ts` — 行: 58, 67（2）
- `domains/tournament_activeTournament/callables/addon.ts` — 行: 79, 100, 108, 120, 131, 153, 171（7）
- `domains/tournament_activeTournament/callables/api.pause.ts` — 行: 64, 72, 81（3）
- `domains/tournament_activeTournament/callables/api.resume.ts` — 行: 64, 72, 81（3）
- `domains/tournament_activeTournament/callables/assignSeatToPlayer.ts` — 行: 64, 73, 84, 105, 116（5）
- `domains/tournament_activeTournament/callables/bulkAddon.ts` — 行: 76, 97, 105, 122, 174, 182（6）
- `domains/tournament_activeTournament/callables/bustAndExit.ts` — 行: 87, 95, 104, 115, 132（5）
- `domains/tournament_activeTournament/callables/bustAndReentry.ts` — 行: 61, 76, 88, 100, 111, 134, 151, 167, 183（9）
- `domains/tournament_activeTournament/callables/createTemporaryTable.ts` — 行: 53（1）
- `domains/tournament_activeTournament/callables/getRankingData.ts` — 行: 32（1）
- `domains/tournament_activeTournament/callables/registerForTournament.ts` — 行: 38, 51, 59, 74, 85, 99, 118（7）
- `domains/tournament_activeTournament/callables/registerParticipants.ts` — 行: 74, 87, 95, 118, 129, 148（6）
- `domains/tournament_activeTournament/callables/removeTableFromTournament.ts` — 行: 62, 78, 86（3）
- `domains/tournament_activeTournament/callables/reseatAllPlayers.ts` — 行: 88, 99（2）
- `domains/tournament_createTournament/callables/createScheduledTournament.ts` — 行: 81, 92, 121, 161（4）
- `domains/tournament_createTournament/callables/updateScheduledTournamentStartAt.ts` — 行: 62, 69, 84, 94（4）
- `domains/tournament_createTournament/callables/updateScheduledTournamentStatus.ts` — 行: 57, 69, 92, 105, 112（5）
- `domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts` — 行: 294, 309, 316（3）
- `domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts` — 行: 40, 51（2）

---
*静的 FC 一覧の生成: `functions/scripts/countStaticFunctionCustomLogOps.cjs`（TypeScript AST）。`throw new FunctionCustomError` 一覧は従来の走査スクリプト由来（§4 見出しは据え置き）。*
