# As-is: エラー出力箇所の洗い出しと分類

本書は、[保守運用時のエラーログ.md](./保守運用時のエラーログ.md) の **§3-3「実装の進め方」** に沿い、Cloud Functions（`functions/src`）について **現状（As-is）** のエラー出力の出方を機械検索で把握した記録である。

- **目的**: 形式統一・`console.error` 置換・changeSpec の母集団を決めるための **材料** を揃えること。
- **やらないこと**: 全関数について「新規に error を置くべきか」の To-Be 判定、ポリシーに基づく追加ログの是非の議論（後続フェーズ）。

---

## 1. 調査の前提

| 項目 | 内容 |
|------|------|
| 対象パス | `functions/src/**/*.ts` |
| 調査日 | 2026-03-26 |
| リポジトリスナップショット（参考） | `git rev-parse --short HEAD` → `af0f923` |
| 方法 | 文字列パターンの `grep`（出現**行数**・**ファイル一覧**）。意味解析・分岐単位の網羅は含まない。 |

---

## 2. 集計サマリ（出現回数・ファイル数）

| パターン | 出現回数 | ユニークファイル数 |
|----------|----------|---------------------|
| `logger.error(` | 76 | 48 |
| `console.error(` | 170 | 113 |
| `success: false`（文字列リテラル） | 119 | 44 |

※ `success: false` は `as const` 等の別表記は **含めていない**。

---

## 3. 交差関係（ファイル単位）

| 関係 | 件数 |
|------|------|
| `logger.error` のみ（同一ファイルに `console.error` なし） | 45 |
| `console.error` のみ（同一ファイルに `logger.error` なし） | 110 |
| 両方あり | 3 |
| `success: false` 含有ファイルのうち、同一ファイルに `console.error` も `logger.error` も **ない** | 0（※） |

※ ファイル単位では、今回の検索範囲では「`success: false` だけのファイル」は **0 件**。ただし **分岐単位**で「`success: false` だけ返し、その分岐に明示ログがない」ケースは **この表では判別できない**。

---

## 4. 分類（A〜D）への当てはめ（指針）

[保守運用時のエラーログ.md](./保守運用時のエラーログ.md) で想定した分類に、本 As-is 結果を **ざっくり**対応させると次のとおり。

| 区分 | 意味 | 本データとの対応（目安） |
|------|------|---------------------------|
| **A** | 既存 `logger.error` の形式統一 | **呼び出し行**が母集団（`functions/src` 内の **全 `logger.error` 行**。§6 のファイル分類に限定しない）。詳細は **§8**。 |
| **B** | 置き換え対象 | `console.error` 中心（**§6.2**）。§6.3 の 3 ファイル内の `console.error` 行も **B**（A では触れない）。 |
| **C** | 取りこぼし候補 | `success: false` のみの経路、`HttpsError` のみ、未処理例外任せ、文脈不足。**grep では分岐単位は特定できない**。 |
| **D** | 今回触らない候補 | 想定内拒否・バリデーション早期 return など。ファイルを見て個別判断。 |

**未処理例外**・**`HttpsError` のみ**は単純 grep では列挙できない。例: 外側 `try/catch` がなく Admin SDK が投げた例外はランタイムが ERROR を残す（`domains/user/callables/createUserByApp.ts` 等）。

---

## 5. 次のステップ

1. §6 のファイル一覧を起点に、**B** の優先順位を changeSpec で確定する。  
2. **A** については共通スキーマを **既存 `logger.error` 呼び出し**に付与する方針を changeSpec で書く。  
3. **C** は必要なものだけ **別タスク**で分岐単位の確認またはログ追加を検討する。

---

## 6. 詳細一覧（ファイル単位）

本書 §6 の一覧は **As-is の分類（ファイル単位の交差）** 用である。**第1段階 A（既存 `logger.error` の形式統一）の作業対象はファイルではなく、`functions/src` 内の `logger.error` 呼び出し行すべて**である（後述 §8）。

### 6.1 `logger.error` のみ（`console.error` なし）（45 ファイル）

以下のファイルは、同一ファイル内に `console.error` が **ない**（`logger.error` のみ）。**As-is のファイル交差の分類**用。**第1段階 A の対象は §6.1 のファイルに限定されず、`logger.error` 呼び出し行すべて**（§8）。

- `functions/src/domains/analytics/callables/generateDummyData.ts`
- `functions/src/domains/analytics/callables/migrateSettledBillsForBusinessDay.ts`
- `functions/src/domains/attendance/callables/executeMonthlyPayroll.ts`
- `functions/src/domains/attendance/helpers/payrollNotificationHelper.ts`
- `functions/src/domains/attendance/tasks/finalizePayrollRun.ts`
- `functions/src/domains/attendance/tasks/processStaffPayroll.ts`
- `functions/src/domains/bills/callables/appendExtra.ts`
- `functions/src/domains/bills/callables/cancelAccounting.ts`
- `functions/src/domains/bills/callables/refundProcessing.ts`
- `functions/src/domains/bills/callables/updateAccounting.ts`
- `functions/src/domains/bills/callables/updateActiveBill.ts`
- `functions/src/domains/bills/repos/appendExtra.ts`
- `functions/src/domains/bills/repos/appendItem.ts`
- `functions/src/domains/bills/repos/appendSideGameChip.ts`
- `functions/src/domains/bills/repos/calcBusinessDate.ts`
- `functions/src/domains/bills/repos/createBillWithActiveStay.ts`
- `functions/src/domains/bills/repos/postEventAdjustment.ts`
- `functions/src/domains/bills/repos/postEventCancel.ts`
- `functions/src/domains/bills/repos/postEventRefund.ts`
- `functions/src/domains/bills/repos/postEventReopen.ts`
- `functions/src/domains/bills/repos/recordTournamentAction.ts`
- `functions/src/domains/bills/repos/startAccounting.ts`
- `functions/src/domains/bills/repos/updateBill.ts`
- `functions/src/domains/bills/repos/updatePlace.ts`
- `functions/src/domains/bills/triggers/billsEventsOnCreate.ts`
- `functions/src/domains/bills/triggers/billsOnSettle.ts`
- `functions/src/domains/shift/services/helpers.ts`
- `functions/src/domains/storeMeta/callables/closeStore.ts`
- `functions/src/domains/storeMeta/callables/openStore.ts`
- `functions/src/domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow.ts`
- `functions/src/domains/storeMeta/scheduler/weeklyPlanner.ts`
- `functions/src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts`
- `functions/src/domains/user/callables/getFirebaseCustomToken.ts`
- `functions/src/domains/user/services/lineAuth.ts`
- `functions/src/domains/webhook/callables/lineWebhook.ts`
- `functions/src/domains/webhook/services/lineMessaging.ts`
- `functions/src/domains/webhook/services/lineRichMenu.ts`
- `functions/src/shared/config/configLoader.ts`
- `functions/src/shared/config/payrollConfigLoader.ts`
- `functions/src/shared/firebase/callables/calculateFirestoreSize.ts`
- `functions/src/shared/http/controlHook.ts`
- `functions/src/unused_function_lib/nightlyIntegrityCheck.ts`
- `functions/src/unused_function_lib/nightlyRecalculateBalanceDue.ts`
- `functions/src/unused_function_lib/nightlyReconciliationCheck.ts`
- `functions/src/unused_function_lib/serverStage.ts`

---

### 6.2 `console.error` のみ（`logger.error` なし）— B 寄り（110 件）

以下のファイルは、同一ファイル内に `logger.error` が **ない**（`console.error` のみ）。

- `functions/src/domains/attendance/callables/approveAttendanceCorrectionRequest.ts`
- `functions/src/domains/attendance/callables/checkExistingCorrectionRequest.ts`
- `functions/src/domains/attendance/callables/clockIn.ts`
- `functions/src/domains/attendance/callables/clockOut.ts`
- `functions/src/domains/attendance/callables/createAttendance.ts`
- `functions/src/domains/attendance/callables/createAttendanceCorrectionRequest.ts`
- `functions/src/domains/attendance/callables/createManualClockInRecord.ts`
- `functions/src/domains/attendance/callables/endBreak.ts`
- `functions/src/domains/attendance/callables/getAllStaffAttendance.ts`
- `functions/src/domains/attendance/callables/getAttendanceCorrectionRequests.ts`
- `functions/src/domains/attendance/callables/getPayrollData.ts`
- `functions/src/domains/attendance/callables/getStaffAttendance.ts`
- `functions/src/domains/attendance/callables/getStaffListForAttendance.ts`
- `functions/src/domains/attendance/callables/rejectAttendanceCorrectionRequest.ts`
- `functions/src/domains/attendance/callables/startBreak.ts`
- `functions/src/domains/attendance/callables/updateAttendance.ts`
- `functions/src/domains/attendance/callables/updateManualClockOutRecord.ts`
- `functions/src/domains/attendance/scheduler/monthlyPayrollTrigger.ts`
- `functions/src/domains/bills/callables/accounting.ts`
- `functions/src/domains/bills/callables/getOpenBills.ts`
- `functions/src/domains/bills/callables/migrateTodaysBills.ts`
- `functions/src/domains/bills/callables/verifyPaymentSplit.ts`
- `functions/src/domains/itemOrder/callables/cancelOrder.ts`
- `functions/src/domains/itemOrder/callables/createMenuItem.ts`
- `functions/src/domains/itemOrder/callables/getMenuItems.ts`
- `functions/src/domains/itemOrder/callables/getUserOrderHistory.ts`
- `functions/src/domains/itemOrder/callables/placeOrder.ts`
- `functions/src/domains/itemOrder/callables/toggleSoldOutForMenuItem.ts`
- `functions/src/domains/itemOrder/callables/updateMenuItem.ts`
- `functions/src/domains/logs/callables/getActionLogs.ts`
- `functions/src/domains/logs/callables/rollbackAction.ts`
- `functions/src/domains/logs/services/undoAddon.ts`
- `functions/src/domains/logs/services/undoAssignSeatToPlayer.ts`
- `functions/src/domains/logs/services/undoBulkAddon.ts`
- `functions/src/domains/logs/services/undoBustAndExit.ts`
- `functions/src/domains/logs/services/undoBustAndReentry.ts`
- `functions/src/domains/logs/services/undoRegisterForTournament.ts`
- `functions/src/domains/logs/services/undoRegisterParticipants.ts`
- `functions/src/domains/logs/services/undoReseatAllPlayers.ts`
- `functions/src/domains/sideGame/callables/debugSideGame.ts`
- `functions/src/domains/sideGame/callables/depositTip.ts`
- `functions/src/domains/sideGame/callables/leaveSeat.ts`
- `functions/src/domains/sideGame/callables/registerForSideGame.ts`
- `functions/src/domains/sideGame/callables/withdrawTip.ts`
- `functions/src/domains/staff/callables/confirmShiftRequest.ts`
- `functions/src/domains/staff/callables/createMultipleShifts.ts`
- `functions/src/domains/staff/callables/createStaffAccount.ts`
- `functions/src/domains/staff/callables/getShifts.ts`
- `functions/src/domains/staff/callables/updateShiftRequest.ts`
- `functions/src/domains/staff/callables/updateStaffBankInfo.ts`
- `functions/src/domains/staff/callables/updateStaffHourlyWage.ts`
- `functions/src/domains/staff/scheduler/scheduledCleanup.ts`
- `functions/src/domains/storeMeta/callables/closeAssessmentTask.ts`
- `functions/src/domains/storeMeta/callables/openAssessmentTask.ts`
- `functions/src/domains/storeMeta/scripts/createInitialStateDoc.ts`
- `functions/src/domains/storeMeta/services/cleanupActiveStaysOnClose.ts`
- `functions/src/domains/storeMeta/services/resetAllSideGames.ts`
- `functions/src/domains/storeMeta/services/resetAllTables.ts`
- `functions/src/domains/tournament_activeTournament/callables/addTableToTournament.ts`
- `functions/src/domains/tournament_activeTournament/callables/addon.ts`
- `functions/src/domains/tournament_activeTournament/callables/api.pause.ts`
- `functions/src/domains/tournament_activeTournament/callables/api.resume.ts`
- `functions/src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts`
- `functions/src/domains/tournament_activeTournament/callables/bulkAddon.ts`
- `functions/src/domains/tournament_activeTournament/callables/bustAndExit.ts`
- `functions/src/domains/tournament_activeTournament/callables/bustAndReentry.ts`
- `functions/src/domains/tournament_activeTournament/callables/createTemporaryTable.ts`
- `functions/src/domains/tournament_activeTournament/callables/endTournament.ts`
- `functions/src/domains/tournament_activeTournament/callables/getAvailableTables.ts`
- `functions/src/domains/tournament_activeTournament/callables/getPrizeData.ts`
- `functions/src/domains/tournament_activeTournament/callables/getRankingData.ts`
- `functions/src/domains/tournament_activeTournament/callables/getTodayTournaments.ts`
- `functions/src/domains/tournament_activeTournament/callables/getUpcomingTournaments.ts`
- `functions/src/domains/tournament_activeTournament/callables/registerForTournament.ts`
- `functions/src/domains/tournament_activeTournament/callables/registerParticipants.ts`
- `functions/src/domains/tournament_activeTournament/callables/removeTableFromTournament.ts`
- `functions/src/domains/tournament_activeTournament/callables/reseatAllPlayers.ts`
- `functions/src/domains/tournament_activeTournament/callables/setPrizeData.ts`
- `functions/src/domains/tournament_activeTournament/callables/setRankingData.ts`
- `functions/src/domains/tournament_activeTournament/callables/validateEndTournament.ts`
- `functions/src/domains/tournament_createTournament/callables/archiveBlindTemplate.ts`
- `functions/src/domains/tournament_createTournament/callables/archiveTournamentTemplate.ts`
- `functions/src/domains/tournament_createTournament/callables/createBlindTemplate.ts`
- `functions/src/domains/tournament_createTournament/callables/createTournamentTemplate.ts`
- `functions/src/domains/tournament_createTournament/callables/deleteTournamentRecurrence.ts`
- `functions/src/domains/tournament_createTournament/callables/enqueueTournamentTasks.ts`
- `functions/src/domains/tournament_createTournament/callables/getBlindTemplates.ts`
- `functions/src/domains/tournament_createTournament/callables/getScheduledTournamentsForEdit.ts`
- `functions/src/domains/tournament_createTournament/callables/getTournamentRecurrences.ts`
- `functions/src/domains/tournament_createTournament/callables/getTournamentTemplates.ts`
- `functions/src/domains/tournament_createTournament/callables/updateBlindTemplate.ts`
- `functions/src/domains/tournament_createTournament/callables/updateTournamentRecurrence.ts`
- `functions/src/domains/tournament_createTournament/callables/updateTournamentTemplate.ts`
- `functions/src/domains/tournament_createTournament/scheduler/EnqueueTournamentTasksByScheduler.ts`
- `functions/src/domains/tournament_createTournament/scheduler/GenerateRecurringTournamentsByScheduler.ts`
- `functions/src/domains/tournament_createTournament/to_be_deleted/getScheduledTournaments_to_be_deleted.ts`
- `functions/src/domains/user/callables/createUserAccount.ts`
- `functions/src/domains/user/callables/generateQRCode.ts`
- `functions/src/domains/user/callables/getUserStatus.ts`
- `functions/src/domains/user/callables/manualCheckIn.ts`
- `functions/src/domains/user/callables/processVisitByQR.ts`
- `functions/src/domains/user/callables/verifyQRCode.ts`
- `functions/src/domains/user/services/qrCodeUtils.ts`
- `functions/src/domains/webhook/callables/ensureStaffRichMenu.ts`
- `functions/src/shared/businessHours/scheduler/scheduleGenerateNextYearBusinessHours.ts`
- `functions/src/shared/devices/callables/registerDevice.ts`
- `functions/src/unused_function_lib/createClockInRecord.ts`
- `functions/src/unused_function_lib/determineAttendanceMode.ts`
- `functions/src/unused_function_lib/getAccountingHistory.ts`
- `functions/src/unused_function_lib/updateClockOutRecord.ts`

---

### 6.3 両方あり（`logger.error` と `console.error`）（3 ファイル）

- `functions/src/domains/tournament_createTournament/callables/createScheduledTournament.ts`
- `functions/src/domains/tournament_createTournament/callables/createTournamentRecurrence.ts`
- `functions/src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts`

**第1段階 A** では上記ファイルの **`logger.error` 呼び出し行のみ**を形式統一の対象とし、**同じファイル内の `console.error` は第2段階 B まで保留**（§8-1）。

---

### 6.4 `success: false` を含むファイル（44 件）

※ バリデーション早期 return と業務失敗が混在する。分岐の可否は **別途**。

- `functions/src/domains/analytics/callables/generateDummyData.ts`
- `functions/src/domains/analytics/callables/migrateSettledBillsForBusinessDay.ts`
- `functions/src/domains/attendance/callables/approveAttendanceCorrectionRequest.ts`
- `functions/src/domains/attendance/callables/checkExistingCorrectionRequest.ts`
- `functions/src/domains/attendance/callables/clockIn.ts`
- `functions/src/domains/attendance/callables/clockOut.ts`
- `functions/src/domains/attendance/callables/createAttendanceCorrectionRequest.ts`
- `functions/src/domains/attendance/callables/createManualClockInRecord.ts`
- `functions/src/domains/attendance/callables/getAttendanceCorrectionRequests.ts`
- `functions/src/domains/attendance/callables/rejectAttendanceCorrectionRequest.ts`
- `functions/src/domains/attendance/callables/updateManualClockOutRecord.ts`
- `functions/src/domains/bills/callables/getOpenBills.ts`
- `functions/src/domains/itemOrder/callables/getMenuItems.ts`
- `functions/src/domains/itemOrder/callables/getUserOrderHistory.ts`
- `functions/src/domains/staff/callables/updateStaffHourlyWage.ts`
- `functions/src/domains/tournament_activeTournament/callables/addon.ts`
- `functions/src/domains/tournament_activeTournament/callables/bulkAddon.ts`
- `functions/src/domains/tournament_activeTournament/callables/bustAndExit.ts`
- `functions/src/domains/tournament_activeTournament/callables/bustAndReentry.ts`
- `functions/src/domains/tournament_activeTournament/callables/getAvailableTables.ts`
- `functions/src/domains/tournament_activeTournament/callables/getTodayTournaments.ts`
- `functions/src/domains/tournament_activeTournament/callables/getUpcomingTournaments.ts`
- `functions/src/domains/tournament_activeTournament/callables/registerForTournament.ts`
- `functions/src/domains/tournament_activeTournament/callables/registerParticipants.ts`
- `functions/src/domains/tournament_activeTournament/callables/validateEndTournament.ts`
- `functions/src/domains/tournament_createTournament/callables/archiveBlindTemplate.ts`
- `functions/src/domains/tournament_createTournament/callables/archiveTournamentTemplate.ts`
- `functions/src/domains/tournament_createTournament/callables/createBlindTemplate.ts`
- `functions/src/domains/tournament_createTournament/callables/createTournamentTemplate.ts`
- `functions/src/domains/tournament_createTournament/callables/getBlindTemplates.ts`
- `functions/src/domains/tournament_createTournament/callables/getScheduledTournamentsForEdit.ts`
- `functions/src/domains/tournament_createTournament/callables/getTournamentRecurrences.ts`
- `functions/src/domains/tournament_createTournament/callables/getTournamentTemplates.ts`
- `functions/src/domains/tournament_createTournament/callables/updateBlindTemplate.ts`
- `functions/src/domains/tournament_createTournament/callables/updateTournamentRecurrence.ts`
- `functions/src/domains/tournament_createTournament/callables/updateTournamentTemplate.ts`
- `functions/src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts`
- `functions/src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts`
- `functions/src/domains/tournament_createTournament/to_be_deleted/getScheduledTournaments_to_be_deleted.ts`
- `functions/src/domains/user/callables/getUserStatus.ts`
- `functions/src/domains/user/callables/manualCheckIn.ts`
- `functions/src/domains/user/callables/processVisitByQR.ts`
- `functions/src/domains/webhook/callables/ensureStaffRichMenu.ts`
- `functions/src/shared/firebase/callables/calculateFirestoreSize.ts`

---

## 7. 付録: 再現コマンド

リポジトリルートで実行すると、本書と同一のファイル一覧を再現できる。

```bash
grep -rl 'logger\.error(' functions/src --include='*.ts' | sort
grep -rl 'console\.error(' functions/src --include='*.ts' | sort
grep -rl 'success: false' functions/src --include='*.ts' | sort
```

---

## 8. 実装前確認（第1段階 A）

前提文書:

- [保守運用時のエラーログ.md](./保守運用時のエラーログ.md)（仕様）
- 本書（As-is）

### 8-1. 対象単位（重要）

作業の単位は **ファイルではなく、呼び出し行**である（`logger.error` 行と `console.error` 行は **別フェーズ**）。

| 項目 | 内容 |
|------|------|
| **対象（A）** | `functions/src/**/*.ts` における **既存 `logger.error` の全呼び出し行**（§2 の集計では **76 行**） |
| **対象にしない（A）** | **`console.error` の全行**（第2段階 B まで保留。§6.3 の 3 ファイル内の `console.error` も含む） |
| **§6 との関係** | §6 は **As-is のファイル交差**の一覧。**A の母集団は §6.1 のファイル群ではなく `logger.error` 行の総体**である |

**§6.3 の 3 ファイル**（同一ファイルに `logger.error` と `console.error` の両方がある）について:

- **今回（A）で触る**: 当該ファイル内の **`logger.error` 呼び出し行のみ**（共通形式への寄せ）
- **今回は触らない**: 同じファイル内の **`console.error` 呼び出し行**（B まで保留）

### 8-2. 作業の意味

- **新規に「ここにも error を置くべきか」は判断しない**（既存 `logger.error` の置換・整形のみ）
- **1 失敗につき 1 件の主ログ**の原則を崩さない（呼び出し行数を増やさないのが原則）
- 仕様の **ログ情報の設計原則**（失敗類型・関数エントリ名・operation 名・project 識別子・運用者向け要約、機微情報の禁止）に沿う

### 8-3. 共通形式の候補（フィールド）

実装時に確定するが、検討のたたき台は次のとおり。

| 区分 | 候補キー | 備考 |
|------|----------|------|
| 運用者向け要約 | `logger.error` の**第1引数**（文字列） | 既存メッセージを基本維持しつつ整形 |
| 失敗類型 | `failureType` | **第1段階では粗い列挙**に限定（下表）。細かい分類は `functionEntry` / `operation` に寄せる |
| 関数エントリ名 | `functionEntry` | Cloud Functions のエクスポート名を原則とする（下記命名原則） |
| 処理名 | `operation` | 任意。同一エントリ内の複数箇所の区別（例: 給与・分析・enqueue はここで識別） |
| project 識別子 | `projectId` | `GCLOUD_PROJECT` / `GCP_PROJECT` 等 |
| 原因の安全な要約 | `errorMessage` / `errorName` 等 | `Error` は message 等に限定。body 全文・トークン・個人情報は載せない |

#### 8-3-1. `failureType`（第1段階・粗い列挙）

最初は **種類を細かく分けすぎない**（各ファイルで「何を入れるか」の判断がぶれやすくなるため）。  
次の程度で足りる。給与・分析・enqueue など **ドメイン細分**は `failureType` に持たせず、**`functionEntry` / `operation` で識別**する。

| 値 | 例となる意味 |
|----|----------------|
| `config` | 設定・環境変数・Secret まわりの不備・読み取り失敗 |
| `datastore` | Firestore / トランザクション等の永続化層の失敗 |
| `external_api` | LINE API、その他外部 HTTP 等 |
| `business` | 上記以外の **業務ロジック**（会計・トーナメント・給与処理の本処理など、repo/callable 内の典型失敗） |
| `scheduled` | スケジューラ・夜間ジョブの定期実行の失敗 |
| `webhook` | Webhook エントリ（`lineWebhook` 等）の処理ルートとしての失敗 |
| `internal` | 上記に当てはまりにくい、または横断的な汎用処理 |

※ `payroll` / `analytics` / `task_enqueue` 等を **別の `failureType` 列挙子にする必要はない**（必要なら `operation` に `enqueueTask` 等を載せる）。

#### 8-3-2. `functionEntry` の命名（第1段階で固定する原則）

文字列の揺れ（`closeStore` / `close_store` / `storeMeta.closeStore` 等）があると **ログ検索が壊れる**ため、実装前に **最低限の原則だけ**決める。

| 原則 | 内容 |
|------|------|
| **Cloud Functions のエントリ** | **原則として、その関数のエクスポート名**をそのまま使う（例: `closeStore`, `migrateSettledBillsForBusinessDay`, `lineWebhook`）。 |
| **repo / helper / service 内** | グローバルに一意な名前が無い場合は、**呼び出し元のエントリに紐づく既存の処理名**で揃える（例: トリガなら `billsOnSettle`、repo なら呼び出し元 Callable 名と一致させる等）。**新しい命名記法を増やさない**（ドット記法・スネークケース・パス区切りを混在させない）。 |
| **一貫性** | 同一ファイル・同一エントリ経路では **同じ表記**を再使用する。 |

### 8-4. 実装アプローチ（案）

- **共通ヘルパー**（例: `shared/logging/logOpsError.ts`）を1つ用意し、既存 `logger.error(...)` を **`logOpsError({ ... })` に置換**（ログ行数は増やさない）
- 既存の `try/catch` 構造は壊さない
- **大規模な例外処理リファクタはしない**

### 8-5. 懸念・注意

- **`logger.error(msg, error)`** のように第2引数が `Error` 単体の箇所は、ヘルパーで構造化に統一する
- **同じ catch で `logger.error` のあと `throw`** し、外側で再度ログするパターンがある場合は、**二重ログ**にならないよう既存回数を維持する（新規ログ追加ではなく整理）
- **`lineWebhook` 等の `postbackData`** は全文を載せない（キー・truncate 等）

### 8-6. 今回非対象（明示）

| 区分 | 内容 |
|------|------|
| B | `console.error` → `logger.error` の置換・および置換後の形式統一 |
| C | `success: false` 分岐の取りこぼし・新規 `logger.error` の要否判断 |
| その他 | 未処理例外の握り直しのみ、PII の追加 |

### 8-7. A の規模の目安（行数・ファイル数）

- **呼び出し行**: `logger.error(` の出現は **76 行**（§2）。**A の作業単位はこの行すべて**。
- **ユニークファイル数**: **48**（§2）。うち §6.1 が **45 ファイル**、§6.3 が **3 ファイル**。
- **§6.3 の 3 ファイル**では、`logger.error` 行は A、`console.error` 行は B まで未着手（同一ファイルでも **行種別でフェーズが分かれる**）。

