# functionEntry → service 対応表（現状）

## 文書情報

- 根拠仕様: `保守運用時のエラーログ/保守運用時のエラーログ.md` および `保守運用時のエラーログ/エラーログ拡張仕様書_差分実装版.md`（`service` の観点）
- 根拠コード: `functions/src/index.ts` および各 `domains/*/index.ts`・`shared/*/index.ts` の **export 名**（= 原則 `functionEntry`）
- 補足: 本表は **デプロイ対象の Cloud Functions エントリ**（`onCall` / `onRequest` / トリガ等に紐づく export）を対象とする。`shared/firebase` の `getEnv` はユーティリティの re-export であり CF 名ではないため **本表に含めない**。**ログ上の `functionEntry` だけが export 名と異なるもの**は §「export 外の functionEntry 対応表」を参照。
- 件数: 主表の **170** は 2026-04 時点の記録。2026-09-04 Final Cleanup でデモ / probe / 閉店 public wrapper を主表から除外し、残る internal logOps キーは export 外へ移した。件数は再集計していない。
- **`platform` は廃止**（横断インフラの粒度が業務 `service` と揃わないため）。**`device`**（店舗端末）、**`scheduler`**（スケジューラ／ジョブ基盤）、**`config`**（店舗設定ロード）に分割する。
- **重要度判定の十分性（主対象）**: 当時 `generateDummyData` / `debugSideGame` を `エラーログ_重要度判定要件定義.md` **§4** の主対象外としていた（historical。両 source は Final Cleanup で削除済み）。**主対象は 269 件**（旧 **278 件**（280 − 2）から `unused_function_lib` へ移管した **9 呼び出し分**を除く）。**`service` マッピングや `logOpsError` の有無とは独立**。

---

## 対応表（functionEntry 昇順）

| functionEntry | service | 備考 |
|---------------|---------|------|
| `addTableToTournament` | `tournament` | |
| `addon` | `tournament` | |
| `appendExtra` | `accounting` | `appendExtraCallable` の export 名 |
| `applyCloseSnapshot` | `store` | |
| `applyOkibakeAddon` | `tournament` | |
| `approveAttendanceCorrectionRequest` | `attendance` | |
| `archiveBlindTemplate` | `tournament_schedule` | |
| `archiveTournamentTemplate` | `tournament_schedule` | |
| `assignOkibakeTemporaryEntryToSeat` | `tournament` | |
| `assignSeatToPlayer` | `tournament` | |
| `attendanceOnWrite` | `attendance` | |
| `bulkAddon` | `tournament` | |
| `billsEventsOnCreate` | `accounting` | |
| `billsOnSettle` | `accounting` | |
| `bustAndExit` | `tournament` | |
| `bustAndReentry` | `tournament` | |
| `bustOkibakeTemporaryEntry` | `tournament` | |
| `calculateInsufficientDays` | `shift` | |
| `cancelAccounting` | `accounting` | |
| `cancelOrder` | `orders` | |
| `cancelPayrollRun` | `payroll` | |
| `checkExistingCorrectionRequest` | `attendance` | |
| `clockIn` | `attendance` | |
| `clockOut` | `attendance` | |
| `closeAssessmentTask` | `store` | |
| `closeStoreTerminal` | `store` | |
| `completeAccounting` | `accounting` | |
| `completeAccountingV2` | `accounting` | |
| `confirmPayrollRun` | `payroll` | |
| `continueBusinessTerminal` | `store` | |
| `createAttendance` | `attendance` | |
| `createAttendanceCorrectionRequest` | `attendance` | |
| `createBlindTemplate` | `tournament_schedule` | |
| `createInitialStateDocCallable` | `store` | |
| `createManualClockInRecord` | `attendance` | |
| `createMenuItem` | `orders` | |
| `createOkibakeTemporaryEntry` | `tournament` | |
| `createRecruitments` | `shift` | |
| `createScheduledTournament` | `tournament_schedule` | |
| `createStaffAccount` | `staff` | |
| `createTemporaryTable` | `tournament` | |
| `createTournamentRecurrence` | `tournament_schedule` | |
| `createTournamentTemplate` | `tournament_schedule` | |
| `createUserAccount` | `user` | |
| `createUserByApp` | `user` | |
| `setInitialUserBalances` | `user` | A-6 初期残高設定 |
| `migrateStoreManagedUserToLine` | `user` | A-6 後日 LINE 化 |
| `controlHookHttp` | `tournament_schedule` | `index.ts` → `shared/http/controlHook.ts`（トーナメント Cloud Tasks HTTP） |
| `deleteTournamentRecurrence` | `tournament_schedule` | |
| `depositChip` | `side_game` | |
| `endBreak` | `attendance` | |
| `endTournament` | `tournament` | |
| `enqueueTournamentTasks` | `tournament_schedule` | |
| `enqueueTournamentTasksByScheduler` | `tournament_schedule` | |
| `ensureStaffRichMenu` | `line` | |
| `executeMonthlyPayroll` | `payroll` | |
| `finalizeDay` | `shift` | |
| `finalizeMonth` | `shift` | |
| `finalizePayrollRun` | `payroll` | |
| `finalizeUnsettledBillAfterAccounting` | `store` | 会計後の閉店整合（`storeMeta`） |
| `generateBusinessHoursForMonthFromStyles` | `business_hours` | 営業時間系 |
| `generateBusinessHoursForYearFromStyles` | `business_hours` | 営業時間系 |
| `generateQRCode` | `user` | |
| `generateRecurringTournaments` | `tournament_schedule` | |
| `generateRecurringTournamentsByScheduler` | `tournament_schedule` | |
| `getActionLogs` | `audit_log` | |
| `getAllStaffAttendance` | `attendance` | |
| `getAttendanceCorrectionRequests` | `attendance` | |
| `getAvailableTables` | `tournament` | |
| `getBillPreviewTotals` | `accounting` | |
| `getBlindTemplates` | `tournament_schedule` | |
| `getCloseIntegrityData` | `store` | |
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
| `getUnclockedStaffForClose` | `store` | |
| `getUnclosedTournamentsForClose` | `store` | |
| `getUnsettledBillsForClose` | `store` | |
| `getUpcomingTournaments` | `tournament` | |
| `getUserOrderHistory` | `orders` | |
| `getUserStatus` | `user` | |
| `initBusinessHoursForMonth` | `business_hours` | 営業時間系 |
| `initShiftDaysForMonth` | `shift` | |
| `interimConfirmRequests` | `shift` | |
| `initializeStoreConfigCallable` | `store` | |
| `leaveSeat` | `side_game` | |
| `linkOkibakeTemporaryEntryToBill` | `tournament` | |
| `lineWebhook` | `line` | |
| `manualCheckIn` | `user` | |
| `migrateTodaysBillsAccountingFields` | `accounting` | |
| `monthlyPayrollTrigger` | `payroll` | |
| `openAssessmentTask` | `store` | |
| `openStoreTerminal` | `store` | |
| `pauseTournament` | `tournament` | |
| `payrollNotificationScheduler` | `payroll` | |
| `placeOrder` | `orders` | |
| `placeOrderByUser` | `orders` | |
| `processPayrollNotifications` | `payroll` | |
| `processRefund` | `accounting` | |
| `processStaffPayroll` | `payroll` | |
| `processVisitByQR` | `user` | |
| `reactivateStaffAccount` | `staff` | A-3 スタッフ退職処理 |
| `registerDevice` | `device` | `shared/devices` |
| `registerForSideGame` | `side_game` | |
| `registerForTournament` | `tournament` | |
| `registerParticipants` | `tournament` | |
| `registerPaymentStatus` | `payroll` | |
| `rejectAttendanceCorrectionRequest` | `attendance` | |
| `removeTableFromTournament` | `tournament` | |
| `resumeTournament` | `tournament` | |
| `retireStaff` | `staff` | A-3 スタッフ退職処理 |
| `retryFailedStaffTasks` | `payroll` | |
| `rollbackAction` | `audit_log` | |
| `reseatAllPlayers` | `tournament` | |
| `scheduleGenerateNextYearBusinessHours` | `business_hours` | 営業時間系 |
| `schedulerSupervisor` | `scheduler` | `domains/scheduler/supervisor/schedulerSupervisor.ts` |
| `scheduledCleanup` | `staff` | |
| `sendRecruitmentNotification` | `shift` | |
| `setBusinessHoursManualForDay` | `business_hours` | 営業時間系 |
| `setPrizeData` | `tournament` | |
| `setRankingData` | `tournament` | |
| `setSufficientOverride` | `shift` | |
| `startAccounting` | `accounting` | |
| `startBreak` | `attendance` | |
| `temporaryUnlockAlreadyRunningDifferentDateTerminal` | `store` | `storeMeta/callables/temporaryUnlockAlreadyRunningDifferentDateTerminal.ts` |
| `toggleSoldOutForMenuItem` | `orders` | |
| `updateAccounting` | `accounting` | |
| `updateActiveBill` | `accounting` | |
| `updateAttendance` | `attendance` | |
| `updateBlindTemplate` | `tournament_schedule` | |
| `updateDayAssignments` | `shift` | |
| `updateDeviceOptions` | `device` | `shared/devices` |
| `updateDeviceRole` | `device` | `shared/devices` |
| `updateManualClockOutRecord` | `attendance` | |
| `updateMenuItem` | `orders` | |
| `updateOkibakeTemporaryEntryLinkedUser` | `tournament` | |
| `updateScheduledTournamentStartAt` | `tournament_schedule` | |
| `updateScheduledTournamentStatus` | `tournament_schedule` | |
| `updateShiftRequest` | `staff` | |
| `updateStaffBankInfo` | `staff` | |
| `updateStaffHourlyWage` | `staff` | |
| `updateTournamentRecurrence` | `tournament_schedule` | |
| `updateTournamentTemplate` | `tournament_schedule` | |
| `updateUnclockedAttendanceWithAuth` | `store` | |
| `validateEndTournament` | `tournament` | |
| `verifyPaymentSplit` | `accounting` | |
| `verifyQRCode` | `user` | |
| `verifyUnclockedAttendanceEditPassword` | `store` | |
| `weeklyPlanner` | `store` | |
| `withdrawChip` | `side_game` | |

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
| `getStoreConfig` | `config` | `functions/src/shared/config/configLoader.ts`。主候補 errorKey は `CONFIG_ERROR`。 |
| `getCurrentBusinessDateKeyOrThrow` | `store` | `functions/src/domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow.ts`。初期化不足は `CONFIG_ERROR`、状態未達は `FAILED_PRECONDITION`。 |
| `runEnqueueTournamentTasks` | `tournament_schedule` | `functions/src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts`。個別指定第1弾候補。 |
| `runGenerateRecurringTournaments` | `tournament_schedule` | 定期生成全体失敗を表す functionEntry。旧 `unknown` から整理済み。個別指定第1弾候補。 |
| `createScheduledTournamentFromRecurrence` | `tournament_schedule` | 定期生成内の部分失敗を表す helper / core 側 functionEntry。後回し候補。 |
| `createPayrollNotification` | `payroll` | helper。参考 functionEntry。 |
| `sendLinePushMessage` | `line` | helper。参考 functionEntry。 |
| `executeScheduledJobTask` | `scheduler` | `scheduler/tasks/scheduledJobTaskExecutors.ts`（Cloud Tasks 実行ハンドラ） |
| `getSchedulerConfig` | `scheduler` | `schedulerConfigLoader.ts` |
| `writeSchedulerDispatchLogBestEffort` | `scheduler` | `scheduler/supervisor/schedulerLogs.ts` |
| `writeSchedulerExecutionLogByCloudTaskBestEffort` | `scheduler` | `scheduler/supervisor/schedulerLogs.ts` |
| `cleanupActiveStaysOnClose` | `store` | public wrapper 削除・production undeploy 完了。internal `runCleanupActiveStays` の logOps 論理 FE。 |
| `migrateSettledBillsForBusinessDay` | `analytics` | public wrapper 削除・production undeploy 完了。internal `runMigrateSettledBillsForBusinessDay` の logOps 論理 FE。export 名へは未変更（logging semantics 維持）。 |

### 削除済み public FE（現行マップ対象外・2026-09-04）

source / export 削除済み。production undeploy **完了**（2026-09-04）。historical 対応表としてはここに残す。

| functionEntry | 当時 service | 状態 |
|---------------|--------------|------|
| `generateDummyData` | `analytics` | deleted |
| `seedAttendancesDemo` | `payroll` | deleted |
| `seedPayrollDemoData` | `payroll` | deleted |
| `deletePayrollDemoData` | `payroll` | deleted |
| `resetAllSideGames` | `store` | internalized（`runResetAllSideGames` / `closeStoreTerminal`。当該 FE の logOps なし） |
| `resetAllTables` | `store` | internalized（`runResetAllTables` / `closeStoreTerminal`。当該 FE の logOps なし） |
| `emitLogOpsErrorSamples` | （probe） | deleted |
| `emitLogOpsErrorRealSdkSamples` | （probe） | deleted |
| `emitThrowOnlyTc01NotFound` | （probe） | deleted |
| `enqueueThrowOnlyTc06WeeklyPlannerTask` | （probe） | deleted |

### 位置付け

- 主表（Cloud Functions export 名ベース）と本節を合わせて、`SERVICE_BY_FUNCTION_ENTRY` の管理対象とする。
- 未登録の `functionEntry` は、既定 service にフォールバックせず、`unknown_service` として扱う。
- `unknown_service` が出た場合は、service マッピング漏れとして検知し、対応表へ追加する。

### changeSpec 向け補足

- `appendItem`、`getStoreConfig`、`getCurrentBusinessDateKeyOrThrow`、`runEnqueueTournamentTasks`、`runGenerateRecurringTournaments` は、export 外であっても個別指定・補正の主要対象になりうるため、主表だけではなく本節の管理が必要である。
- functionEntry の基準は、Firebase の export 名ではなく、**ログに実際に出力される `functionEntry` 文字列**に統一する。

---

## `logOpsError` の `functionEntry` とマップ登録の関係（補足）

`SERVICE_BY_FUNCTION_ENTRY` は **`logOpsError` 呼び出し時の `service` 解決**のための対応表である（`functions/src/shared/logging/serviceByFunctionEntry.ts` と同期）。そのため、**マップにキーがあっても、その `functionEntry` 文字列がまだ `logOpsError` に一度も渡っていない**ことはありうる。

理由の例は次のとおりであり、**いずれも「未実装の backlog を表す」ものではない**。

- **別の `functionEntry` で既にログしている**（例: export 外に記載の `appendItemWithOrderProjection` と、実装側の `appendItem`）
- **過去の改修スコープ・議論の結果、`logOpsError` を付けない／付けないままとした**経路（詳細は `docs/エラーログ運用/logOps/実装サマリ/実装サマリ_エラーログ拡張_20260406.md` の `§15` 全件一覧および当該 changeSpec の整理に従う）
- **デモ・シード・補助**など、本番運用の重要度判定の主対象に含めないもの

**本ドキュメントでは**、マップのキーと `logOpsError` 呼び出しの機械的差分を **一覧表としては載せない**（当該差分には、議論で対象外としたものまで含まれるため、**残タスク一覧と誤解されやすい**ため）。

---

## service 別インデックス（参照用）

同一 `service` に属する `functionEntry` を列挙する（**主表の export 名のみ**。export 外は §「export 外の functionEntry 対応表」を併せて参照。本節に export 外の `functionEntry` を括弧付きで重複列挙しない）。

- **accounting**: `appendExtra`, `billsEventsOnCreate`, `billsOnSettle`, `cancelAccounting`, `completeAccounting`, `completeAccountingV2`, `getBillPreviewTotals`, `getOpenBills`, `getRefundHistory`, `migrateTodaysBillsAccountingFields`, `processRefund`, `startAccounting`, `updateAccounting`, `updateActiveBill`, `verifyPaymentSplit`
- **analytics**: 主表に該当する export 名なし（`migrateSettledBillsForBusinessDay` は §「export 外の functionEntry 対応表」）
- **attendance**: `approveAttendanceCorrectionRequest`, `attendanceOnWrite`, `checkExistingCorrectionRequest`, `clockIn`, `clockOut`, `createAttendance`, `createAttendanceCorrectionRequest`, `createManualClockInRecord`, `endBreak`, `getAllStaffAttendance`, `getAttendanceCorrectionRequests`, `getStaffAttendance`, `getStaffListForAttendance`, `rejectAttendanceCorrectionRequest`, `startBreak`, `updateAttendance`, `updateManualClockOutRecord`
- **audit_log**: `getActionLogs`, `rollbackAction`
- **business_hours**: `generateBusinessHoursForMonthFromStyles`, `generateBusinessHoursForYearFromStyles`, `initBusinessHoursForMonth`, `scheduleGenerateNextYearBusinessHours`, `setBusinessHoursManualForDay`
- **config**: 主表に該当する export 名なし（該当分は §「export 外の functionEntry 対応表」）
- **device**: `registerDevice`, `updateDeviceOptions`, `updateDeviceRole`
- **line**: `ensureStaffRichMenu`, `lineWebhook`
- **orders**: `cancelOrder`, `createMenuItem`, `getMenuItems`, `getUserOrderHistory`, `placeOrder`, `placeOrderByUser`, `toggleSoldOutForMenuItem`, `updateMenuItem`
- **payroll**: `cancelPayrollRun`, `confirmPayrollRun`, `executeMonthlyPayroll`, `finalizePayrollRun`, `getPayrollCandidates`, `getPayrollData`, `monthlyPayrollTrigger`, `payrollNotificationScheduler`, `processPayrollNotifications`, `processStaffPayroll`, `registerPaymentStatus`, `retryFailedStaffTasks`
- **scheduler**: `schedulerSupervisor`（同一 service の export 外分は §「export 外の functionEntry 対応表」）
- **shift**: `calculateInsufficientDays`, `createRecruitments`, `finalizeDay`, `finalizeMonth`, `initShiftDaysForMonth`, `interimConfirmRequests`, `sendRecruitmentNotification`, `setSufficientOverride`, `updateDayAssignments`
- **side_game**: `depositChip`, `leaveSeat`, `registerForSideGame`, `withdrawChip`
- **staff**: `createStaffAccount`, `getShifts`, `reactivateStaffAccount`, `retireStaff`, `scheduledCleanup`, `submitShiftRequests`, `updateShiftRequest`, `updateStaffBankInfo`, `updateStaffHourlyWage`
- **store**: `applyCloseSnapshot`, `closeAssessmentTask`, `closeStoreTerminal`, `continueBusinessTerminal`, `createInitialStateDocCallable`, `finalizeUnsettledBillAfterAccounting`, `getCloseIntegrityData`, `getUnclockedStaffForClose`, `getUnclosedTournamentsForClose`, `getUnsettledBillsForClose`, `initializeStoreConfigCallable`, `openAssessmentTask`, `openStoreTerminal`, `temporaryUnlockAlreadyRunningDifferentDateTerminal`, `updateUnclockedAttendanceWithAuth`, `verifyUnclockedAttendanceEditPassword`, `weeklyPlanner`
- **tournament**: `addTableToTournament`, `addon`, `applyOkibakeAddon`, `assignOkibakeTemporaryEntryToSeat`, `assignSeatToPlayer`, `bulkAddon`, `bustAndExit`, `bustAndReentry`, `bustOkibakeTemporaryEntry`, `createOkibakeTemporaryEntry`, `createTemporaryTable`, `endTournament`, `getAvailableTables`, `getPrizeData`, `getRankingData`, `getTodayTournaments`, `getUpcomingTournaments`, `linkOkibakeTemporaryEntryToBill`, `pauseTournament`, `registerForTournament`, `registerParticipants`, `removeTableFromTournament`, `resumeTournament`, `reseatAllPlayers`, `setPrizeData`, `setRankingData`, `updateOkibakeTemporaryEntryLinkedUser`, `validateEndTournament`
- **tournament_schedule**: `archiveBlindTemplate`, `archiveTournamentTemplate`, `controlHookHttp`, `createBlindTemplate`, `createScheduledTournament`, `createTournamentRecurrence`, `createTournamentTemplate`, `deleteTournamentRecurrence`, `enqueueTournamentTasks`, `enqueueTournamentTasksByScheduler`, `generateRecurringTournaments`, `generateRecurringTournamentsByScheduler`, `getBlindTemplates`, `getScheduledTournamentsForEdit`, `getTournamentRecurrences`, `getTournamentTemplates`, `updateBlindTemplate`, `updateScheduledTournamentStartAt`, `updateScheduledTournamentStatus`, `updateTournamentRecurrence`, `updateTournamentTemplate`
- **user**: `createUserAccount`, `createUserByApp`, `generateQRCode`, `getFirebaseCustomToken`, `getUserStatus`, `manualCheckIn`, `migrateStoreManagedUserToLine`, `processVisitByQR`, `setInitialUserBalances`, `verifyQRCode`

### logOpsError 呼び出し数（service 別・参考）

`functions/src/**/*.ts` 内の `logOpsError(` 呼び出しを数え、`functionEntry` を `SERVICE_BY_FUNCTION_ENTRY`（本書と同期する `serviceByFunctionEntry.ts`）で解決したときの **service 別件数**。同一 `functionEntry` に複数行ある場合はその分だけ増える。`shared/logging/logOpsError.ts` の `export function logOpsError` 宣言行は除く。**合計 304**（現行コードベース、2026-04-08 時点）。

| service | `logOpsError` 呼び出し数 |
|---------|-------------------------:|
| `tournament` | 58 |
| `tournament_schedule` | 41 |
| `store` | 40 |
| `accounting` | 36 |
| `line` | 26 |
| `attendance` | 20 |
| `user` | 19 |
| `orders` | 16 |
| `payroll` | 12 |
| `staff` | 11 |
| `scheduler` | 7 |
| `side_game` | 5 |
| `analytics` | 3 |
| `device` | 3 |
| `audit_log` | 2 |
| `business_hours` | 2 |
| `shift` | 2 |
| `config` | 1 |
| **合計** | **304** |

<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
StrReplace
