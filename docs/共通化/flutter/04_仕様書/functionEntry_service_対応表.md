# functionEntry → service 対応表（現状）

## 文書情報

- 根拠仕様: `エラーログ重要度判定.md` §14（`service` 正式一覧および §14.3 補足）
- 根拠コード: `functions/src/index.ts` および各 `domains/*/index.ts`・`shared/*/index.ts`・`demo_data/index.ts` の **export 名**（= 原則 `functionEntry`）
- 補足: 本表は **デプロイ対象の Cloud Functions エントリ**（`onCall` / `onRequest` / トリガ等に紐づく export）を対象とする。`shared/firebase` の `getEnv` はユーティリティの re-export であり CF 名ではないため **本表に含めない**。**ログ上の `functionEntry` だけが export 名と異なるもの**は §「export 外の functionEntry 対応表」を参照。
- 件数: **167**（上記コードベースと一致）

---

## 対応表（functionEntry 昇順）

| functionEntry | service | 備考 |
|---------------|---------|------|
| `addTableToTournament` | `tournament` | |
| `addon` | `tournament` | |
| `appendExtra` | `accounting` | `appendExtraCallable` の export 名 |
| `applyCloseSnapshot` | `close_process` | |
| `approveAttendanceCorrectionRequest` | `attendance` | |
| `archiveBlindTemplate` | `tournament_schedule` | |
| `archiveTournamentTemplate` | `tournament_schedule` | |
| `assignSeatToPlayer` | `tournament` | |
| `attendanceOnWrite` | `attendance` | |
| `bulkAddon` | `tournament` | |
| `billsEventsOnCreate` | `accounting` | |
| `billsOnSettle` | `accounting` | |
| `bustAndExit` | `tournament` | |
| `bustAndReentry` | `tournament` | |
| `calculateFirestoreSize` | `platform` | `shared/firebase` |
| `calculateInsufficientDays` | `shift` | |
| `cancelAccounting` | `accounting` | |
| `cancelOrder` | `orders` | |
| `cancelPayrollRun` | `payroll` | |
| `checkExistingCorrectionRequest` | `attendance` | |
| `clockIn` | `attendance` | |
| `clockOut` | `attendance` | |
| `closeAssessmentTask` | `store` | |
| `closeStore` | `store` | |
| `closeStoreTerminal` | `store` | |
| `cleanupActiveStaysOnClose` | `close_process` | |
| `completeAccounting` | `accounting` | |
| `completeAccountingV2` | `accounting` | |
| `confirmPayrollRun` | `payroll` | |
| `confirmShiftRequest` | `staff` | |
| `continueBusinessTerminal` | `store` | |
| `createAttendance` | `attendance` | |
| `createAttendanceCorrectionRequest` | `attendance` | |
| `createBlindTemplate` | `tournament_schedule` | |
| `createInitialStateDocCallable` | `store` | |
| `createManualClockInRecord` | `attendance` | |
| `createMenuItem` | `orders` | |
| `createMultipleShifts` | `staff` | |
| `createRecruitments` | `shift` | |
| `createScheduledTournament` | `tournament_schedule` | |
| `createStaffAccount` | `staff` | |
| `createStaffByApp` | `staff` | |
| `createTemporaryTable` | `tournament` | |
| `createTournamentRecurrence` | `tournament_schedule` | |
| `createTournamentTemplate` | `tournament_schedule` | |
| `createUserAccount` | `user` | |
| `createUserByApp` | `user` | |
| `controlHookHttp` | `platform` | `index.ts` |
| `debugSideGame` | `side_game` | |
| `deletePayrollDemoData` | `payroll` | `demo_data`（給与デモ削除） |
| `deleteTournamentRecurrence` | `tournament_schedule` | |
| `depositTip` | `side_game` | |
| `endBreak` | `attendance` | |
| `endTournament` | `tournament` | |
| `enqueueTournamentTasks` | `tournament_schedule` | |
| `enqueueTournamentTasksByScheduler` | `tournament_schedule` | |
| `ensureStaffRichMenu` | `line` | |
| `executeMonthlyPayroll` | `payroll` | |
| `finalizeDay` | `shift` | |
| `finalizeMonth` | `shift` | |
| `finalizePayrollRun` | `payroll` | |
| `finalizeUnsettledBillAfterAccounting` | `close_process` | 会計後の閉店整合（`storeMeta` 実装・仕様上 `close_process`） |
| `generateBusinessHoursForMonthFromStyles` | `business_hours` | §14.3 |
| `generateBusinessHoursForYearFromStyles` | `business_hours` | §14.3 |
| `generateDummyData` | `analytics` | |
| `generateQRCode` | `user` | |
| `generateRecurringTournaments` | `tournament_schedule` | |
| `generateRecurringTournamentsByScheduler` | `tournament_schedule` | |
| `getActionLogs` | `audit_log` | |
| `getAllStaffAttendance` | `attendance` | |
| `getAttendanceCorrectionRequests` | `attendance` | |
| `getAvailableTables` | `tournament` | |
| `getBillPreviewTotals` | `accounting` | |
| `getBlindTemplates` | `tournament_schedule` | |
| `getCloseIntegrityData` | `close_process` | |
| `getFirebaseCustomToken` | `user` | |
| `getMenuItems` | `orders` | |
| `getOpenBills` | `accounting` | |
| `getPayrollCandidates` | `payroll` | |
| `getPayrollData` | `payroll` | |
| `getPrizeData` | `tournament` | |
| `getRankingData` | `tournament` | |
| `getRefundHistory` | `accounting` | |
| `getScheduledTournamentsForEdit` | `tournament_schedule` | |
| `getShifts` | `staff` | `domains/staff` |
| `getStaffAttendance` | `attendance` | |
| `getStaffListForAttendance` | `attendance` | |
| `getTournamentRecurrences` | `tournament_schedule` | |
| `getTournamentTemplates` | `tournament_schedule` | |
| `getTodayTournaments` | `tournament` | |
| `getUnclockedStaffForClose` | `close_process` | |
| `getUnclosedTournamentsForClose` | `close_process` | |
| `getUnsettledBillsForClose` | `close_process` | |
| `getUpcomingTournaments` | `tournament` | |
| `getUserOrderHistory` | `orders` | |
| `getUserStatus` | `user` | |
| `initBusinessHoursForMonth` | `business_hours` | §14.3 |
| `initShiftDaysForMonth` | `shift` | |
| `interimConfirmRequests` | `shift` | |
| `initializeStoreConfigCallable` | `store` | |
| `leaveSeat` | `side_game` | |
| `lineWebhook` | `line` | |
| `manualCheckIn` | `user` | |
| `migrateSettledBillsForBusinessDay` | `analytics` | 精算済み→月次分析への移管 |
| `migrateTodaysBillsAccountingFields` | `accounting` | |
| `monthlyPayrollTrigger` | `payroll` | |
| `openAssessmentTask` | `store` | |
| `openStore` | `store` | |
| `openStoreTerminal` | `store` | |
| `pauseTournament` | `tournament` | |
| `payrollNotificationScheduler` | `payroll` | |
| `placeOrder` | `orders` | |
| `placeOrderByUser` | `orders` | |
| `processPayrollNotifications` | `payroll` | |
| `processRefund` | `accounting` | |
| `processShiftsByStaff` | `platform` | リモート維持スタブ |
| `processStaffPayroll` | `payroll` | |
| `processVisitByQR` | `user` | |
| `registerDevice` | `platform` | `shared/devices` |
| `registerForSideGame` | `side_game` | |
| `registerForTournament` | `tournament` | |
| `registerParticipants` | `tournament` | |
| `registerPaymentStatus` | `payroll` | |
| `rejectAttendanceCorrectionRequest` | `attendance` | |
| `removeTableFromTournament` | `tournament` | |
| `resetAllSideGames` | `close_process` | |
| `resetAllTables` | `close_process` | |
| `resumeTournament` | `tournament` | |
| `retryFailedStaffTasks` | `payroll` | |
| `rollbackAction` | `audit_log` | |
| `reseatAllPlayers` | `tournament` | |
| `scheduleGenerateNextYearBusinessHours` | `business_hours` | §14.3 |
| `scheduledCleanup` | `staff` | |
| `seedAttendancesDemo` | `payroll` | |
| `seedPayrollDemoData` | `payroll` | `demo_data` |
| `sendRecruitmentNotification` | `shift` | |
| `setBusinessHoursManualForDay` | `business_hours` | §14.3 |
| `setPrizeData` | `tournament` | |
| `setRankingData` | `tournament` | |
| `setSufficientOverride` | `shift` | |
| `startAccounting` | `accounting` | |
| `startBreak` | `attendance` | |
| `toggleSoldOutForMenuItem` | `orders` | |
| `updateAccounting` | `accounting` | |
| `updateActiveBill` | `accounting` | |
| `updateAdministrativeMenuWithDescription` | `platform` | リモート維持スタブ |
| `updateAttendance` | `attendance` | |
| `updateBlindTemplate` | `tournament_schedule` | |
| `updateDayAssignments` | `shift` | |
| `updateDeviceOptions` | `platform` | `shared/devices` |
| `updateDeviceRole` | `platform` | `shared/devices` |
| `updateManualClockOutRecord` | `attendance` | |
| `updateMenuItem` | `orders` | |
| `updateScheduledTournamentStartAt` | `tournament_schedule` | |
| `updateScheduledTournamentStatus` | `tournament_schedule` | |
| `updateShiftRequest` | `staff` | |
| `updateStaffBankInfo` | `staff` | |
| `updateStaffHourlyWage` | `staff` | |
| `updateTournamentRecurrence` | `tournament_schedule` | |
| `updateTournamentTemplate` | `tournament_schedule` | |
| `updateUnclockedAttendanceWithAuth` | `close_process` | |
| `validateEndTournament` | `tournament` | |
| `verifyPaymentSplit` | `accounting` | |
| `verifyQRCode` | `user` | |
| `verifyUnclockedAttendanceEditPassword` | `close_process` | |
| `weeklyPlanner` | `store` | |
| `withdrawTip` | `side_game` | |

---

## export 外の functionEntry 対応表（ログ上の functionEntry 用）

補足:

- 本節は、**デプロイ対象の Cloud Functions export 名ではないが、`logOpsError` の `functionEntry` として実際に使用されるもの**を対象とする。
- changeSpec における `SERVICE_BY_FUNCTION_ENTRY` では、主表（CF export 名）に加えて本節の functionEntry もマッピング対象とする。
- 個別指定や service 補正は、**ログ上で実際に出る `functionEntry` 文字列**を基準に扱う。

| functionEntry | service | 備考 |
|---------------|---------|------|
| `appendItem` | `orders` | `functions/src/domains/bills/repos/appendItem.ts`。個別指定第1弾候補。requestHash mismatch は `IDEMPOTENCY_CONFLICT` 寄りで扱う前提。 |
| `appendItemWithOrderProjection` | `orders` | `appendItem.ts` 内の関連 functionEntry。items / orders 不整合は `DATA_INCONSISTENCY` 候補。 |
| `getStoreConfig` | `platform` | `functions/src/shared/config/configLoader.ts`。config 失敗は `platform` 固定。主候補 errorKey は `CONFIG_ERROR`。 |
| `getCurrentBusinessDateKeyOrThrow` | `store` | `functions/src/domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow.ts`。初期化不足は `CONFIG_ERROR`、状態未達は `FAILED_PRECONDITION`。 |
| `runEnqueueTournamentTasks` | `tournament_schedule` | `functions/src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts`。個別指定第1弾候補。 |
| `runGenerateRecurringTournaments` | `tournament_schedule` | 定期生成全体失敗を表す functionEntry。旧 `unknown` から整理済み。個別指定第1弾候補。 |
| `createScheduledTournamentFromRecurrence` | `tournament_schedule` | 定期生成内の部分失敗を表す helper / core 側 functionEntry。後回し候補。 |
| `createPayrollNotification` | `payroll` | helper。参考 functionEntry。 |
| `sendLinePushMessage` | `line` | helper。参考 functionEntry。 |

### 位置付け

- 主表（Cloud Functions export 名ベース）と本節を合わせて、`SERVICE_BY_FUNCTION_ENTRY` の管理対象とする。
- 未登録の `functionEntry` は、既定 service にフォールバックせず、`unknown_service` として扱う。
- `unknown_service` が出た場合は、service マッピング漏れとして検知し、対応表へ追加する。

### changeSpec 向け補足

- `appendItem`、`getStoreConfig`、`getCurrentBusinessDateKeyOrThrow`、`runEnqueueTournamentTasks`、`runGenerateRecurringTournaments` は、export 外であっても個別指定・補正の主要対象になりうるため、主表だけではなく本節の管理が必要である。
- functionEntry の基準は、Firebase の export 名ではなく、**ログに実際に出力される `functionEntry` 文字列**に統一する。

---

## service 別インデックス（参照用）

同一 `service` に属する `functionEntry` を列挙する（**主表の export 名のみ**。export 外は §「export 外の functionEntry 対応表」を併せて参照）。

- **accounting**: `appendExtra`, `billsEventsOnCreate`, `billsOnSettle`, `cancelAccounting`, `completeAccounting`, `completeAccountingV2`, `getBillPreviewTotals`, `getOpenBills`, `getRefundHistory`, `migrateTodaysBillsAccountingFields`, `processRefund`, `startAccounting`, `updateAccounting`, `updateActiveBill`, `verifyPaymentSplit`
- **analytics**: `generateDummyData`, `migrateSettledBillsForBusinessDay`
- **attendance**: `approveAttendanceCorrectionRequest`, `attendanceOnWrite`, `checkExistingCorrectionRequest`, `clockIn`, `clockOut`, `createAttendance`, `createAttendanceCorrectionRequest`, `createManualClockInRecord`, `endBreak`, `getAllStaffAttendance`, `getAttendanceCorrectionRequests`, `getStaffAttendance`, `getStaffListForAttendance`, `rejectAttendanceCorrectionRequest`, `startBreak`, `updateAttendance`, `updateManualClockOutRecord`
- **audit_log**: `getActionLogs`, `rollbackAction`
- **business_hours**: `generateBusinessHoursForMonthFromStyles`, `generateBusinessHoursForYearFromStyles`, `initBusinessHoursForMonth`, `scheduleGenerateNextYearBusinessHours`, `setBusinessHoursManualForDay`
- **close_process**: `applyCloseSnapshot`, `cleanupActiveStaysOnClose`, `finalizeUnsettledBillAfterAccounting`, `getCloseIntegrityData`, `getUnclockedStaffForClose`, `getUnclosedTournamentsForClose`, `getUnsettledBillsForClose`, `resetAllSideGames`, `resetAllTables`, `updateUnclockedAttendanceWithAuth`, `verifyUnclockedAttendanceEditPassword`
- **line**: `ensureStaffRichMenu`, `lineWebhook`
- **orders**: `cancelOrder`, `createMenuItem`, `getMenuItems`, `getUserOrderHistory`, `placeOrder`, `placeOrderByUser`, `toggleSoldOutForMenuItem`, `updateMenuItem`
- **payroll**: `cancelPayrollRun`, `confirmPayrollRun`, `deletePayrollDemoData`, `executeMonthlyPayroll`, `finalizePayrollRun`, `getPayrollCandidates`, `getPayrollData`, `monthlyPayrollTrigger`, `payrollNotificationScheduler`, `processPayrollNotifications`, `processStaffPayroll`, `registerPaymentStatus`, `retryFailedStaffTasks`, `seedAttendancesDemo`, `seedPayrollDemoData`
- **platform**: `calculateFirestoreSize`, `controlHookHttp`, `processShiftsByStaff`, `registerDevice`, `updateAdministrativeMenuWithDescription`, `updateDeviceOptions`, `updateDeviceRole`
- **shift**: `calculateInsufficientDays`, `createRecruitments`, `finalizeDay`, `finalizeMonth`, `initShiftDaysForMonth`, `interimConfirmRequests`, `sendRecruitmentNotification`, `setSufficientOverride`, `updateDayAssignments`
- **side_game**: `debugSideGame`, `depositTip`, `leaveSeat`, `registerForSideGame`, `withdrawTip`
- **staff**: `confirmShiftRequest`, `createMultipleShifts`, `createStaffAccount`, `createStaffByApp`, `getShifts`, `scheduledCleanup`, `updateShiftRequest`, `updateStaffBankInfo`, `updateStaffHourlyWage`
- **store**: `closeAssessmentTask`, `closeStore`, `closeStoreTerminal`, `continueBusinessTerminal`, `createInitialStateDocCallable`, `initializeStoreConfigCallable`, `openAssessmentTask`, `openStore`, `openStoreTerminal`, `weeklyPlanner`
- **tournament**: `addTableToTournament`, `addon`, `assignSeatToPlayer`, `bulkAddon`, `bustAndExit`, `bustAndReentry`, `createTemporaryTable`, `endTournament`, `getAvailableTables`, `getPrizeData`, `getRankingData`, `getTodayTournaments`, `getUpcomingTournaments`, `pauseTournament`, `registerForTournament`, `registerParticipants`, `removeTableFromTournament`, `resumeTournament`, `reseatAllPlayers`, `setPrizeData`, `setRankingData`, `validateEndTournament`
- **tournament_schedule**: `archiveBlindTemplate`, `archiveTournamentTemplate`, `createBlindTemplate`, `createScheduledTournament`, `createTournamentRecurrence`, `createTournamentTemplate`, `deleteTournamentRecurrence`, `enqueueTournamentTasks`, `enqueueTournamentTasksByScheduler`, `generateRecurringTournaments`, `generateRecurringTournamentsByScheduler`, `getBlindTemplates`, `getScheduledTournamentsForEdit`, `getTournamentRecurrences`, `getTournamentTemplates`, `updateBlindTemplate`, `updateScheduledTournamentStartAt`, `updateScheduledTournamentStatus`, `updateTournamentRecurrence`, `updateTournamentTemplate`
- **user**: `createUserAccount`, `createUserByApp`, `generateQRCode`, `getFirebaseCustomToken`, `getUserStatus`, `manualCheckIn`, `processVisitByQR`, `verifyQRCode`

<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
StrReplace