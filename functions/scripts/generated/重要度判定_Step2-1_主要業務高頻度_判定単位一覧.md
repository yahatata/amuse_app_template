# 重要度判定 Step 2-1: 主要業務 / 高頻度業務 判定単位一覧（実質 269 件スコープ）

- **根拠要件**: `エラーログ_重要度判定要件定義.md` §6.6（主要業務・高頻度業務の定義）
- **対象**: `logOpsError` 呼び出し **269 件**（`functions/src` から `debug` / `demo_data` / `unused_function_lib` を除き、`generateDummyData` / `debugSideGame` を除く）
- **判定単位**: `operation` なし → `functionEntry` のみ。 `operation` あり → `functionEntry` + `operation`（式は短縮表示）
- **service**: `serviceByFunctionEntry.ts` / `functionEntry_service_対応表.md` 由来（補助）
- **静的 function_custom 確定（52 件）**: サンプル行が `countStaticFunctionCustomLogOps.cjs` と同一条件の一覧に含まれる単位。判断メモに記載。

## 一覧

| service | functionEntry | operation | errorSource 備考 | 主要業務か | 高頻度業務か | 判断メモ |
|---------|---------------|-----------|-------------------|------------|--------------|----------|
| tournament | `addon` | `addonMainCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `addon` | `addonOperationLogWrite` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `addon` | `recordTournamentActionBestEffort` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `addTableToTournament` | `addTableToTournamentCatch` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| tournament | `addTableToTournament` | `addTableToTournamentGenericCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| accounting | `appendExtra` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| accounting | `appendExtraCallable` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| orders | `appendItem` | `appendItemCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 注文・メニュー。要件の高頻度「注文処理」に該当しうる。 |
| orders | `appendItem` | `appendItemWithOrderProjection` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 注文・メニュー。要件の高頻度「注文処理」に該当しうる。 |
| accounting | `appendSideGameChip` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| store | `applyCloseSnapshot` | `applyBillCloseSnapshotTxn` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| store | `applyCloseSnapshot` | `getClosedBusinessDate` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| store | `applyCloseSnapshot` | `incrementUserUnsettledBillsCount` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| attendance | `approveAttendanceCorrectionRequest` | `approveRequestOuterCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。 |
| attendance | `approveAttendanceCorrectionRequest` | `attendanceRecordUpdate` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。 |
| tournament_schedule | `archiveBlindTemplate` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| tournament_schedule | `archiveTournamentTemplate` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| tournament | `assignSeatToPlayer` | `assignSeatGenericCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `assignSeatToPlayer` | `assignSeatOperationLogWrite` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `assignSeatToPlayer` | `assignSeatToPlayerCatch` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| tournament | `assignSeatToPlayer` | `updatePlaceBestEffort` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| accounting | `billsEventsOnCreate` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| accounting | `billsOnSettle` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| tournament | `bulkAddon` | `bulkAddonMainCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `bulkAddon` | `bulkAddonOperationLogWrite` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `bulkAddon` | `recordActionPerUserBestEffort` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `bustAndExit` | `bustAndExitMainCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `bustAndExit` | `bustAndExitOperationLogWrite` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `bustAndExit` | `updatePlaceBestEffort` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `bustAndReentry` | `bustAndReentryMainCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `bustAndReentry` | `bustAndReentryOperationLogWrite` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `bustAndReentry` | `recordTournamentActionBestEffort` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| accounting | `calcBusinessDate` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| accounting | `cancelAccounting` | `cancelAccountingCatch` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| accounting | `cancelAccounting` | `cancelAccountingGenericCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| orders | `cancelOrder` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 注文・メニュー。要件の高頻度「注文処理」に該当しうる。 |
| attendance | `checkExistingCorrectionRequest` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。 |
| store | `cleanupActiveStaysOnClose` | `cleanupOuterCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 開閉店・店舗状態。要件の主要「開店・閉店」に該当しうる。 |
| store | `cleanupActiveStaysOnClose` | `deleteActiveStayDocument` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| attendance | `clockIn` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。 |
| attendance | `clockOut` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。 |
| store | `closeAssessmentTask` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 開閉店・店舗状態。要件の主要「開店・閉店」に該当しうる。 |
| store | `closeStoreTerminal` | ``runCloseStep.${stepName}`` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| store | `closeStoreTerminal` | `acquireProcessingLease` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| store | `closeStoreTerminal` | `closeTerminalPreflight` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| store | `closeStoreTerminal` | `finalizeCloseStateDoc.enqueueOpenAssessmentRecheck` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| store | `closeStoreTerminal` | `rollbackUnsettledMark` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| accounting | `completeAccounting` | `completeAccountingCatch` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| accounting | `completeAccounting` | `completeAccountingGenericCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| accounting | `completeAccountingV2` | `completeAccountingV2Catch` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| accounting | `completeAccountingV2` | `completeAccountingV2GenericCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| staff | `confirmShiftRequest` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。 |
| store | `continueBusinessTerminal` | `cloudTasksCreateTask` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 開閉店・店舗状態。要件の主要「開店・閉店」に該当しうる。 |
| store | `continueBusinessTerminal` | `continueBusinessTerminalFunctionCustom` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| tournament_schedule | `controlHookHttp` | `executeLegacyPayloadTask` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| tournament_schedule | `controlHookHttp` | `executeNewPayloadTask` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| tournament_schedule | `controlHookHttp` | `validateControlHookRequest` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| attendance | `createAttendance` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。 |
| attendance | `createAttendanceCorrectionRequest` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。 |
| user | `createBillWithActiveStay` | `operationForCreateBillKey(error.errorKey)` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| user | `createBillWithActiveStay` | `runCreateBillTransaction` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 来店・ユーザー。要件の主要・高頻度の「来店処理」に該当しうる。 |
| tournament_schedule | `createBlindTemplate` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| store | `createInitialStateDoc` | `createDocMainCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 開閉店・店舗状態。要件の主要「開店・閉店」に該当しうる。 |
| store | `createInitialStateDoc` | `scriptTopLevelCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 開閉店・店舗状態。要件の主要「開店・閉店」に該当しうる。 |
| store | `createInitialStateDocCallable` | `createInitialStateDoc` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 開閉店・店舗状態。要件の主要「開店・閉店」に該当しうる。 |
| attendance | `createManualClockInRecord` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。 |
| orders | `createMenuItem` | `imageUpload` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 注文・メニュー。要件の高頻度「注文処理」に該当しうる。 |
| orders | `createMenuItem` | `menuCreateCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 注文・メニュー。要件の高頻度「注文処理」に該当しうる。 |
| staff | `createMultipleShifts` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。 |
| payroll | `createPayrollNotification` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。 |
| tournament_schedule | `createScheduledTournament` | `createScheduledTournamentCatch` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| tournament_schedule | `createScheduledTournament` | `createScheduledTournamentGenericCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| tournament_schedule | `createScheduledTournament` | `enqueueAfterCreate` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| tournament_schedule | `createScheduledTournamentFromRecurrence` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| staff | `createStaffAccount` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。 |
| tournament | `createTemporaryTable` | `createTemporaryTableCatch` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| tournament | `createTemporaryTable` | `createTemporaryTableGenericCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament_schedule | `createTournamentRecurrence` | `createTournamentRecurrenceCatch` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| tournament_schedule | `createTournamentRecurrence` | `createTournamentRecurrenceGenericCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| tournament_schedule | `createTournamentRecurrence` | `createTournamentRecurrenceInnerHelper` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| tournament_schedule | `createTournamentRecurrence` | `enqueueAfterCreate` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| tournament_schedule | `createTournamentTemplate` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| user | `createUserAccount` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 来店・ユーザー。要件の主要・高頻度の「来店処理」に該当しうる。 |
| user | `deleteOldQRCodeFiles` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | QR ストレージ。来店系の補助処理。 |
| tournament_schedule | `deleteTournamentRecurrence` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| side_game | `depositTip` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | サイドゲーム。主要中核ではない想定。卓上で頻度は保留。 |
| attendance | `endBreak` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。 |
| tournament | `endTournament` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament_schedule | `enqueueTournamentTasks` | `enqueueBatchPartialErrors` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| tournament_schedule | `enqueueTournamentTasks` | `enqueueTournamentTasksCatch` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| tournament_schedule | `enqueueTournamentTasks` | `enqueueTournamentTasksGenericCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| tournament_schedule | `enqueueTournamentTasksByScheduler` | `cloudTasksCreateTask` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| tournament_schedule | `enqueueTournamentTasksByScheduler` | `runEnqueueSchedulerTask` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| line | `ensureStaffRichMenu` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。 |
| payroll | `executeMonthlyPayroll` | `loadPayrollConfig` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。 |
| payroll | `executeMonthlyPayroll` | `taskDispatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。 |
| scheduler | `executeScheduledJobTask` | `markReplanCompletedBestEffort` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| scheduler | `executeScheduledJobTask` | `releaseReplanProcessingBestEffort` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| scheduler | `executeScheduledJobTask` | `runScheduledJob` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | ジョブ基盤・内部。主要・来店レベルではない。頻度はバッチ依存で保留。 |
| shift | `finalizeMonth` | `finalizeDayLoop` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | シフト計画・締め。主要リスト外だが業務影響あり。保留。 |
| payroll | `finalizePayrollRun` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。 |
| store | `finalizeUnsettledBillAfterAccounting` |  | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| line | `formatDateToJapanese` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。 |
| user | `generateQRCode` | `generateQRCodeOuterCatch` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| user | `generateQRCode` | `transaction` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| tournament_schedule | `generateRecurringTournamentsByScheduler` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| audit_log | `getActionLogs` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | 操作ログ取得・巻き戻し。監査・補助。主要は保留。 |
| attendance | `getAllStaffAttendance` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。 |
| attendance | `getAttendanceCorrectionRequests` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。 |
| tournament | `getAvailableTables` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| accounting | `getBillPreviewTotals` | `previewTotalsCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| tournament_schedule | `getBlindTemplates` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| store | `getCloseIntegrityData` | `closeIntegrityAggregate` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 開閉店・店舗状態。要件の主要「開店・閉店」に該当しうる。 |
| store | `getCurrentBusinessDateKeyOrThrow` | `loadFirestoreStateDoc` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 開閉店・店舗状態。要件の主要「開店・閉店」に該当しうる。 |
| user | `getFirebaseCustomToken` |  | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| orders | `getMenuItems` | `adminMenuDocMissing` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 注文・メニュー。要件の高頻度「注文処理」に該当しうる。 |
| orders | `getMenuItems` | `menuFetchCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 注文・メニュー。要件の高頻度「注文処理」に該当しうる。 |
| accounting | `getOpenBills` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| payroll | `getPayrollCandidates` | `loadPayrollConfig` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。 |
| payroll | `getPayrollConfig` | `config_read` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | × | 設定読み込み。主要・高頻度の主軸ではない（失敗時ログ）。 |
| payroll | `getPayrollData` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。 |
| tournament | `getPrizeData` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `getRankingData` | `getRankingDataCatch` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| tournament | `getRankingData` | `getRankingDataGenericCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| accounting | `getRefundHistory` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| shift | `getRequiredStaffByTimeSlot` | `config_read` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | シフト計画・締め。主要リスト外だが業務影響あり。保留。 |
| tournament_schedule | `getScheduledTournaments` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| tournament_schedule | `getScheduledTournamentsForEdit` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| scheduler | `getSchedulerConfig` | `config_read` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | × | 設定読み込み。主要・高頻度の主軸ではない（失敗時ログ）。 |
| staff | `getShifts` | `detailErrorLog` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。 |
| staff | `getShifts` | `initCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。 |
| staff | `getShifts` | `shiftFetchCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。 |
| staff | `getShifts` | `unknownErrorLog` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。 |
| attendance | `getStaffAttendance` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。 |
| attendance | `getStaffListForAttendance` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。 |
| config | `getStoreConfig` | `config_read` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | × | 設定読み込み。主要・高頻度の主軸ではない（失敗時ログ）。 |
| tournament | `getTodayTournaments` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament_schedule | `getTournamentRecurrences` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| tournament_schedule | `getTournamentTemplates` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| store | `getUnclockedStaffForClose` | `unclockedStaffQuery` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 開閉店・店舗状態。要件の主要「開店・閉店」に該当しうる。 |
| store | `getUnclosedTournamentsForClose` | `unclosedTournamentsQuery` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 開閉店・店舗状態。要件の主要「開店・閉店」に該当しうる。 |
| store | `getUnsettledBillsForClose` | `unsettledBillsQuery` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 開閉店・店舗状態。要件の主要「開店・閉店」に該当しうる。 |
| tournament | `getUpcomingTournaments` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| orders | `getUserOrderHistory` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 注文・メニュー。要件の高頻度「注文処理」に該当しうる。 |
| user | `getUserStatus` |  | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| store | `initializeStoreConfigCallable` | `initStoreMetaConfig` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 開閉店・店舗状態。要件の主要「開店・閉店」に該当しうる。 |
| side_game | `leaveSeat` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | サイドゲーム。主要中核ではない想定。卓上で頻度は保留。 |
| line | `lineWebhook` | `followOrUnblock` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。 |
| line | `lineWebhook` | `handler` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。 |
| line | `lineWebhook` | `postback` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。 |
| line | `lineWebhook` | `replyPostbackDeclineConfirmCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。 |
| line | `lineWebhook` | `replyPostbackDeclineConfirmNotOk` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。 |
| line | `lineWebhook` | `replyPostbackPlanDisabledCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。 |
| line | `lineWebhook` | `replyPostbackPlanDisabledNotOk` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。 |
| line | `lineWebhook` | `token` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。 |
| line | `linkStaffRichMenu` | `linkStaffRichMenuCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。 |
| line | `linkStaffRichMenu` | `linkStaffRichMenuHttpFail` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。 |
| line | `linkUserRichMenu` | `linkUserRichMenuCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。 |
| line | `linkUserRichMenu` | `linkUserRichMenuHttpFail` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。 |
| user | `manualCheckIn` |  | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| analytics | `migrateSettledBillsForBusinessDay` | `callable` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | × | 集計・移管。主業務フローから外れがち。migrate は運用ツール。 |
| analytics | `migrateSettledBillsForBusinessDay` | `runMigratePerBill` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | × | 集計・移管。主業務フローから外れがち。migrate は運用ツール。 |
| accounting | `migrateTodaysBillsAccountingFields` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | × | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| store | `openAssessmentTask` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 開閉店・店舗状態。要件の主要「開店・閉店」に該当しうる。 |
| store | `openStoreTerminal` | ``runOpenStep.${stepName}`` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| store | `openStoreTerminal` | `acquireProcessingLease` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| store | `openStoreTerminal` | `openTerminalPreflight` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| tournament | `pauseTournament` | `pauseTournamentCatch` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| tournament | `pauseTournament` | `pauseTournamentGenericCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| payroll | `payrollNotificationScheduler` | `enqueue` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。 |
| orders | `placeOrder` | `chipPurchaseLog` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 注文・メニュー。要件の高頻度「注文処理」に該当しうる。 |
| orders | `placeOrder` | `placeOrderCatch` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| orders | `placeOrder` | `placeOrderGenericCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 注文・メニュー。要件の高頻度「注文処理」に該当しうる。 |
| orders | `placeOrderByUser` | `placeOrderCatch` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| orders | `placeOrderByUser` | `placeOrderGenericCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 注文・メニュー。要件の高頻度「注文処理」に該当しうる。 |
| accounting | `postEventAdjustment` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| accounting | `postEventCancel` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| accounting | `postEventRefund` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| accounting | `postEventReopen` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| accounting | `processRefund` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| payroll | `processStaffPayroll` | `failureStatusUpdate` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。 |
| payroll | `processStaffPayroll` | `processStaffPayrollCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。 |
| payroll | `processStaffPayroll` | `runNotFound` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。 |
| payroll | `processStaffPayroll` | `staffResultNotFound` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。 |
| user | `processVisitByQR` |  | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| accounting | `recordTournamentAction` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| device | `registerDevice` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | 端末登録・設定。主要リスト外。端末本数で頻度は保留。 |
| side_game | `registerForSideGame` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | サイドゲーム。主要中核ではない想定。卓上で頻度は保留。 |
| tournament | `registerForTournament` | `recordFailureOperationLog` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `registerForTournament` | `recordTournamentAction` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `registerForTournament` | `registerTournamentFlow` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `registerParticipants` | `recordActionPerUserBestEffort` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `registerParticipants` | `registerParticipantsMainCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `registerParticipants` | `registerParticipantsOperationLogWrite` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `registerParticipants` | `registerUserFailed` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| attendance | `rejectAttendanceCorrectionRequest` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。 |
| tournament | `removeTableFromTournament` | `removeTableFromTournamentCatch` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| tournament | `removeTableFromTournament` | `removeTableFromTournamentGenericCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `reseatAllPlayers` | `reseatAllPlayersCatch` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| tournament | `reseatAllPlayers` | `reseatAllPlayersGenericCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `reseatAllPlayers` | `reseatAllPlayersOperationLogWrite` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `reseatAllPlayers` | `updatePlacePerAssignmentBestEffort` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| store | `resetAllSideGames` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 開閉店・店舗状態。要件の主要「開店・閉店」に該当しうる。 |
| store | `resetAllTables` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 開閉店・店舗状態。要件の主要「開店・閉店」に該当しうる。 |
| tournament | `resumeTournament` | `resumeTournamentCatch` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| tournament | `resumeTournament` | `resumeTournamentGenericCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| audit_log | `rollbackAction` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | 操作ログ取得・巻き戻し。監査・補助。主要は保留。 |
| tournament_schedule | `runEnqueueTournamentTasks` | `enqueueTournamentTask` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| tournament_schedule | `runEnqueueTournamentTasks` | `processTournamentBatchItem` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| tournament_schedule | `runGenerateRecurringTournaments` | `enqueueAfterGenerate` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| tournament_schedule | `runGenerateRecurringTournaments` | `parseRecurrenceInterval` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| tournament_schedule | `runGenerateRecurringTournaments` | `parseRecurrenceIntervalWrongType` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| tournament_schedule | `runGenerateRecurringTournaments` | `runGenerateRecurringTournamentsOuterCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| tournament_schedule | `runGenerateRecurringTournaments` | `validateRecurringStoreTenant` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| user | `saveQRCodeToStorage` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | QR ストレージ。来店系の補助処理。 |
| staff | `scheduledCleanup` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。 |
| business_hours | `scheduleGenerateNextYearBusinessHours` | `generateMonthFailed` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | × | 営業時間生成。バッチ寄り。高頻度の主軸ではない。 |
| business_hours | `scheduleGenerateNextYearBusinessHours` | `taskOuterCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | × | 営業時間生成。バッチ寄り。高頻度の主軸ではない。 |
| scheduler | `schedulerSupervisor` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | ジョブ基盤・内部。主要・来店レベルではない。頻度はバッチ依存で保留。 |
| line | `sendLinePushMessage` | `pushCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。 |
| line | `sendLinePushMessage` | `pushResponseNotOk` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。 |
| line | `sendLinePushMessage` | `token` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。 |
| line | `sendLinePushMessage` | `validate` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。 |
| tournament | `setPrizeData` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `setRankingData` | `setRankingDataPrizeGrant` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `setRankingData` | `setRankingDataRankings` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| accounting | `startAccounting` | `operationForStartAccountingKey(error.errorKey)` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| accounting | `startAccounting` | `startAccountingCallableCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| accounting | `startAccounting` | `startAccountingRepoCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| attendance | `startBreak` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。 |
| store | `temporaryUnlockAlreadyRunningDifferentDateTerminal` | `cloudTasksCreateTask` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 開閉店・店舗状態。要件の主要「開店・閉店」に該当しうる。 |
| orders | `toggleSoldOutForMenuItem` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 注文・メニュー。要件の高頻度「注文処理」に該当しうる。 |
| tournament | `undoAddon` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `undoAssignSeatToPlayer` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `undoBulkAddon` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `undoBustAndExit` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `undoBustAndReentry` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `undoRegisterForTournament` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `undoRegisterParticipants` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| tournament | `undoReseatAllPlayers` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| accounting | `updateAccounting` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| accounting | `updateActiveBill` | `updateActiveBillCatch` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| accounting | `updateActiveBill` | `updateActiveBillGenericCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| attendance | `updateAttendance` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。 |
| accounting | `updateBill` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| tournament_schedule | `updateBlindTemplate` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| device | `updateDeviceOptions` | `updateDeviceOptionsCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | 端末登録・設定。主要リスト外。端末本数で頻度は保留。 |
| device | `updateDeviceRole` | `updateDeviceRoleCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | 端末登録・設定。主要リスト外。端末本数で頻度は保留。 |
| attendance | `updateManualClockOutRecord` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。 |
| orders | `updateMenuItem` | `imageUpload` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 注文・メニュー。要件の高頻度「注文処理」に該当しうる。 |
| orders | `updateMenuItem` | `menuUpdateCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 注文・メニュー。要件の高頻度「注文処理」に該当しうる。 |
| accounting | `updatePlace` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| tournament_schedule | `updateScheduledTournamentStartAt` | `validateStartAtUpdatePreconditions` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| tournament_schedule | `updateScheduledTournamentStatus` | `validateStatusTransition` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| staff | `updateShiftRequest` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。 |
| staff | `updateStaffBankInfo` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。 |
| staff | `updateStaffHourlyWage` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。 |
| tournament_schedule | `updateTournamentRecurrence` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| tournament_schedule | `updateTournamentTemplate` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。 |
| store | `updateUnclockedAttendanceWithAuth` | `passwordClockOutUpdate` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 開閉店・店舗状態。要件の主要「開店・閉店」に該当しうる。 |
| tournament | `validateEndTournament` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。 |
| user | `verifyLineIdToken` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | ○ | LIFF/トークン検証。来店系の補助。高頻度は○寄り。 |
| accounting | `verifyPaymentSplit` | `verifyPaymentSplitCatch` | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| accounting | `verifyPaymentSplit` | `verifyPaymentSplitGenericCatch` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。 |
| user | `verifyQRCode` |  | 静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。 | ○ | ○ | function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。 前提により主要・高頻度とも○（要件 Step2-1 前提）。 |
| store | `weeklyPlanner` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | ○ | ○ | 開閉店・店舗状態。要件の主要「開店・閉店」に該当しうる。 |
| side_game | `withdrawTip` |  | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | 保留 | 保留 | サイドゲーム。主要中核ではない想定。卓上で頻度は保留。 |
| scheduler | `writeSchedulerDispatchLogBestEffort` | `dispatchLogWrite` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | スケジューラ補助ログ。主要ではない。 |
| scheduler | `writeSchedulerExecutionLogByCloudTaskBestEffort` | `executionLogWrite` | 実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。 | × | 保留 | スケジューラ補助ログ。主要ではない。 |

## 集計サマリ

| 項目 | 値 |
|------|-----|
| **判定単位総数**（269 呼び出しと一致する場合、単位も 269） | **269** |
| **主要業務 ○** | 186 |
| **高頻度業務 ○** | 217 |
| **主要業務「保留」**（行単位） | 58 |
| **高頻度業務「保留」**（行単位） | 44 |
| **主要または高頻度のいずれかが「保留」を含む行**（参考） | 80 |

※ 「主要または高頻度のいずれかが保留」は、同一行で主要・高頻度の両方が「保留」の場合、**1 行として 1 回**カウント。

## 判断が割れやすい類型

1. **給与・シフト・シフト計画（payroll / staff / shift）**: 要件の「主要」の例示は来店・会計・開閉店・トーナメント中心のため、**店舗運営の中核か**の解釈で保留になりやすい。
2. **スケジューラ・ジョブ基盤（scheduler）・補助ログ**: **客前オペレーション**ではないため主要は × 寄り。頻度はバッチ設計次第で保留。
3. **設定・Secret・config**: 失敗時の影響は大きいが、**高頻度業務の例示**（注文・会計・勤怠等）の主軸ではないため × 寄り。
4. **analytics（移管・集計）**: 定常のレジ操作からは外れがち。**migrate** は運用ツール扱いで保留/×。
5. **LINE / リッチメニュー**: 主要中核の例示に含まれにくく、**× / 保留**になりやすい。
6. **side_game**: 卓上ゲームの補助。**主要・高頻度の境界**で保留。
7. **静的 function_custom 確定 52 件**: 手順上 **主要・高頻度とも ○** とした（Step2-1 前提）。実務レビューで調整可。

## 保留理由一覧（主要・高頻度のいずれかが「保留」の行）

- **`approveAttendanceCorrectionRequest`** / `approveRequestOuterCatch`（attendance）: 主要=保留 / 高頻度=○ — 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。
- **`approveAttendanceCorrectionRequest`** / `attendanceRecordUpdate`（attendance）: 主要=保留 / 高頻度=○ — 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。
- **`checkExistingCorrectionRequest`**（attendance）: 主要=保留 / 高頻度=○ — 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。
- **`clockIn`**（attendance）: 主要=保留 / 高頻度=○ — 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。
- **`clockOut`**（attendance）: 主要=保留 / 高頻度=○ — 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。
- **`confirmShiftRequest`**（staff）: 主要=保留 / 高頻度=○ — シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。
- **`createAttendance`**（attendance）: 主要=保留 / 高頻度=○ — 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。
- **`createAttendanceCorrectionRequest`**（attendance）: 主要=保留 / 高頻度=○ — 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。
- **`createManualClockInRecord`**（attendance）: 主要=保留 / 高頻度=○ — 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。
- **`createMultipleShifts`**（staff）: 主要=保留 / 高頻度=○ — シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。
- **`createPayrollNotification`**（payroll）: 主要=保留 / 高頻度=保留 — 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。
- **`createStaffAccount`**（staff）: 主要=保留 / 高頻度=○ — シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。
- **`deleteOldQRCodeFiles`**（user）: 主要=保留 / 高頻度=○ — QR ストレージ。来店系の補助処理。
- **`depositTip`**（side_game）: 主要=保留 / 高頻度=保留 — サイドゲーム。主要中核ではない想定。卓上で頻度は保留。
- **`endBreak`**（attendance）: 主要=保留 / 高頻度=○ — 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。
- **`ensureStaffRichMenu`**（line）: 主要=× / 高頻度=保留 — LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。
- **`executeMonthlyPayroll`** / `loadPayrollConfig`（payroll）: 主要=保留 / 高頻度=保留 — 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。
- **`executeMonthlyPayroll`** / `taskDispatch`（payroll）: 主要=保留 / 高頻度=保留 — 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。
- **`executeScheduledJobTask`** / `runScheduledJob`（scheduler）: 主要=× / 高頻度=保留 — ジョブ基盤・内部。主要・来店レベルではない。頻度はバッチ依存で保留。
- **`finalizeMonth`** / `finalizeDayLoop`（shift）: 主要=保留 / 高頻度=保留 — シフト計画・締め。主要リスト外だが業務影響あり。保留。
- **`finalizePayrollRun`**（payroll）: 主要=保留 / 高頻度=保留 — 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。
- **`formatDateToJapanese`**（line）: 主要=× / 高頻度=保留 — LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。
- **`getActionLogs`**（audit_log）: 主要=保留 / 高頻度=保留 — 操作ログ取得・巻き戻し。監査・補助。主要は保留。
- **`getAllStaffAttendance`**（attendance）: 主要=保留 / 高頻度=○ — 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。
- **`getAttendanceCorrectionRequests`**（attendance）: 主要=保留 / 高頻度=○ — 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。
- **`getPayrollCandidates`** / `loadPayrollConfig`（payroll）: 主要=保留 / 高頻度=保留 — 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。
- **`getPayrollData`**（payroll）: 主要=保留 / 高頻度=保留 — 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。
- **`getRequiredStaffByTimeSlot`** / `config_read`（shift）: 主要=保留 / 高頻度=保留 — シフト計画・締め。主要リスト外だが業務影響あり。保留。
- **`getShifts`** / `detailErrorLog`（staff）: 主要=保留 / 高頻度=○ — シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。
- **`getShifts`** / `initCatch`（staff）: 主要=保留 / 高頻度=○ — シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。
- **`getShifts`** / `shiftFetchCatch`（staff）: 主要=保留 / 高頻度=○ — シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。
- **`getShifts`** / `unknownErrorLog`（staff）: 主要=保留 / 高頻度=○ — シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。
- **`getStaffAttendance`**（attendance）: 主要=保留 / 高頻度=○ — 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。
- **`getStaffListForAttendance`**（attendance）: 主要=保留 / 高頻度=○ — 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。
- **`leaveSeat`**（side_game）: 主要=保留 / 高頻度=保留 — サイドゲーム。主要中核ではない想定。卓上で頻度は保留。
- **`lineWebhook`** / `followOrUnblock`（line）: 主要=× / 高頻度=保留 — LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。
- **`lineWebhook`** / `handler`（line）: 主要=× / 高頻度=保留 — LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。
- **`lineWebhook`** / `postback`（line）: 主要=× / 高頻度=保留 — LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。
- **`lineWebhook`** / `replyPostbackDeclineConfirmCatch`（line）: 主要=× / 高頻度=保留 — LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。
- **`lineWebhook`** / `replyPostbackDeclineConfirmNotOk`（line）: 主要=× / 高頻度=保留 — LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。
- **`lineWebhook`** / `replyPostbackPlanDisabledCatch`（line）: 主要=× / 高頻度=保留 — LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。
- **`lineWebhook`** / `replyPostbackPlanDisabledNotOk`（line）: 主要=× / 高頻度=保留 — LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。
- **`lineWebhook`** / `token`（line）: 主要=× / 高頻度=保留 — LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。
- **`linkStaffRichMenu`** / `linkStaffRichMenuCatch`（line）: 主要=× / 高頻度=保留 — LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。
- **`linkStaffRichMenu`** / `linkStaffRichMenuHttpFail`（line）: 主要=× / 高頻度=保留 — LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。
- **`linkUserRichMenu`** / `linkUserRichMenuCatch`（line）: 主要=× / 高頻度=保留 — LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。
- **`linkUserRichMenu`** / `linkUserRichMenuHttpFail`（line）: 主要=× / 高頻度=保留 — LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。
- **`migrateSettledBillsForBusinessDay`** / `callable`（analytics）: 主要=保留 / 高頻度=× — 集計・移管。主業務フローから外れがち。migrate は運用ツール。
- **`migrateSettledBillsForBusinessDay`** / `runMigratePerBill`（analytics）: 主要=保留 / 高頻度=× — 集計・移管。主業務フローから外れがち。migrate は運用ツール。
- **`migrateTodaysBillsAccountingFields`**（accounting）: 主要=保留 / 高頻度=× — 会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。
- **`payrollNotificationScheduler`** / `enqueue`（payroll）: 主要=保留 / 高頻度=保留 — 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。
- **`processStaffPayroll`** / `failureStatusUpdate`（payroll）: 主要=保留 / 高頻度=保留 — 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。
- **`processStaffPayroll`** / `processStaffPayrollCatch`（payroll）: 主要=保留 / 高頻度=保留 — 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。
- **`processStaffPayroll`** / `runNotFound`（payroll）: 主要=保留 / 高頻度=保留 — 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。
- **`processStaffPayroll`** / `staffResultNotFound`（payroll）: 主要=保留 / 高頻度=保留 — 給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。
- **`registerDevice`**（device）: 主要=保留 / 高頻度=保留 — 端末登録・設定。主要リスト外。端末本数で頻度は保留。
- **`registerForSideGame`**（side_game）: 主要=保留 / 高頻度=保留 — サイドゲーム。主要中核ではない想定。卓上で頻度は保留。
- **`rejectAttendanceCorrectionRequest`**（attendance）: 主要=保留 / 高頻度=○ — 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。
- **`rollbackAction`**（audit_log）: 主要=保留 / 高頻度=保留 — 操作ログ取得・巻き戻し。監査・補助。主要は保留。
- **`saveQRCodeToStorage`**（user）: 主要=保留 / 高頻度=○ — QR ストレージ。来店系の補助処理。
- **`scheduledCleanup`**（staff）: 主要=保留 / 高頻度=○ — シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。
- **`scheduleGenerateNextYearBusinessHours`** / `generateMonthFailed`（business_hours）: 主要=保留 / 高頻度=× — 営業時間生成。バッチ寄り。高頻度の主軸ではない。
- **`scheduleGenerateNextYearBusinessHours`** / `taskOuterCatch`（business_hours）: 主要=保留 / 高頻度=× — 営業時間生成。バッチ寄り。高頻度の主軸ではない。
- **`schedulerSupervisor`**（scheduler）: 主要=× / 高頻度=保留 — ジョブ基盤・内部。主要・来店レベルではない。頻度はバッチ依存で保留。
- **`sendLinePushMessage`** / `pushCatch`（line）: 主要=× / 高頻度=保留 — LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。
- **`sendLinePushMessage`** / `pushResponseNotOk`（line）: 主要=× / 高頻度=保留 — LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。
- **`sendLinePushMessage`** / `token`（line）: 主要=× / 高頻度=保留 — LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。
- **`sendLinePushMessage`** / `validate`（line）: 主要=× / 高頻度=保留 — LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。
- **`startBreak`**（attendance）: 主要=保留 / 高頻度=○ — 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。
- **`updateAttendance`**（attendance）: 主要=保留 / 高頻度=○ — 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。
- **`updateDeviceOptions`** / `updateDeviceOptionsCatch`（device）: 主要=保留 / 高頻度=保留 — 端末登録・設定。主要リスト外。端末本数で頻度は保留。
- **`updateDeviceRole`** / `updateDeviceRoleCatch`（device）: 主要=保留 / 高頻度=保留 — 端末登録・設定。主要リスト外。端末本数で頻度は保留。
- **`updateManualClockOutRecord`**（attendance）: 主要=保留 / 高頻度=○ — 勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。
- **`updateShiftRequest`**（staff）: 主要=保留 / 高頻度=○ — シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。
- **`updateStaffBankInfo`**（staff）: 主要=保留 / 高頻度=○ — シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。
- **`updateStaffHourlyWage`**（staff）: 主要=保留 / 高頻度=○ — シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。
- **`verifyLineIdToken`**（user）: 主要=保留 / 高頻度=○ — LIFF/トークン検証。来店系の補助。高頻度は○寄り。
- **`withdrawTip`**（side_game）: 主要=保留 / 高頻度=保留 — サイドゲーム。主要中核ではない想定。卓上で頻度は保留。
- **`writeSchedulerDispatchLogBestEffort`** / `dispatchLogWrite`（scheduler）: 主要=× / 高頻度=保留 — スケジューラ補助ログ。主要ではない。
- **`writeSchedulerExecutionLogByCloudTaskBestEffort`** / `executionLogWrite`（scheduler）: 主要=× / 高頻度=保留 — スケジューラ補助ログ。主要ではない。
