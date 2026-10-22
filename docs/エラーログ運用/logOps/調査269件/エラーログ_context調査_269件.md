# エラーログ context 調査（269 件スコープ）

- **対象**: `functions/src` の `logOpsError` 呼び出しのうち、Step2-1 と同一スコープ（269 件）
- **手法**: TypeScript AST による静的解析
  - 各 `logOpsError` 呼び出しについて、 `functionEntry` / `operation` / 明示 `context` のキー / `cause` の有無 / 囲う catch の形を抽出
  - 同一関数内の `throw new FunctionCustomError({ errorKey, context })` を列挙し、到達しうる FC 候補として併記（近似）
  - マージ後の context キー（近似）= **throw 時の context キー ∪ logOpsError 呼び出しの明示 context キー**
- **除外**: `debug` / `demo_data` / `unused_function_lib`、`generateDummyData.ts`、`debugSideGame.ts`
- **生成スクリプト**: `functions/scripts/auditLogOpsErrorContext269.cjs`

## サマリ

- 呼び出し総数: **269**
- うち `catch` 内: **252** / `catch` 外: **17**
- うち `instanceof FunctionCustomError` ブランチ内の呼び出し: **29**
- うち 非 FC / 汎用 catch 側の呼び出し: **223**
- 明示 `context: { ... }` を持つ呼び出し: **241** / 持たない: **28**
- `cause` を渡している呼び出し: **255**

## 読み方

- **分類**
  - `FC`: `if (error instanceof FunctionCustomError)` 直下の `logOpsError`
  - `非FC`: `FC` ブランチ外（汎用 catch、型チェック無しなど）
  - `catch 外`: try/catch に囲まれていない場所（応答 not ok 分岐等）
- **明示 context**: 呼び出し引数に `context: { ... }` を書いている場合のキー（順序は記載順）
- **到達しうる FC**: 同一関数内の `throw new FunctionCustomError` を列挙（近似。別ファイル throw は含めない）
- **マージ後 context キー候補**: その FC に到達した場合にログに載る想定のキー（近似）

## 1. 呼び出しごとの一覧（269 行）

| # | ソース | functionEntry | operation | 分類 | 明示 context キー | cause |
|---|--------|---------------|-----------|------|-------------------|-------|
| 1 | `src/domains/analytics/callables/migrateSettledBillsForBusinessDay.ts:103` | `migrateSettledBillsForBusinessDay` | `runMigratePerBill` | 非FC | billId, businessDate | ✓ |
| 2 | `src/domains/analytics/callables/migrateSettledBillsForBusinessDay.ts:142` | `migrateSettledBillsForBusinessDay` | `callable` | 非FC | businessDate | ✓ |
| 3 | `src/domains/attendance/callables/approveAttendanceCorrectionRequest.ts:125` | `approveAttendanceCorrectionRequest` | `attendanceRecordUpdate` | 非FC | requestId, adminUserId | ✓ |
| 4 | `src/domains/attendance/callables/approveAttendanceCorrectionRequest.ts:142` | `approveAttendanceCorrectionRequest` | `approveRequestOuterCatch` | 非FC | requestId, adminUserId | ✓ |
| 5 | `src/domains/attendance/callables/checkExistingCorrectionRequest.ts:76` | `checkExistingCorrectionRequest` |  | 非FC | staffId, date | ✓ |
| 6 | `src/domains/attendance/callables/clockIn.ts:180` | `clockIn` |  | 非FC | callerUid, staffId, businessDate, deviceId | ✓ |
| 7 | `src/domains/attendance/callables/clockOut.ts:211` | `clockOut` |  | 非FC | callerUid, staffId, docId, businessDate, deviceId | ✓ |
| 8 | `src/domains/attendance/callables/createAttendance.ts:181` | `createAttendance` |  | 非FC | callerUid, staffId, deviceId | ✓ |
| 9 | `src/domains/attendance/callables/createAttendanceCorrectionRequest.ts:100` | `createAttendanceCorrectionRequest` |  | 非FC | staffId, attendanceId | ✓ |
| 10 | `src/domains/attendance/callables/createManualClockInRecord.ts:178` | `createManualClockInRecord` |  | 非FC | callerUid, staffId, businessDate, deviceId | ✓ |
| 11 | `src/domains/attendance/callables/endBreak.ts:172` | `endBreak` |  | 非FC | callerUid, attendanceId, breakId, deviceId | ✓ |
| 12 | `src/domains/attendance/callables/executeMonthlyPayroll.ts:78` | `executeMonthlyPayroll` | `loadPayrollConfig` | 非FC | paymentPeriodKey, attendanceIdsCount, callerUid, deviceId | ✓ |
| 13 | `src/domains/attendance/callables/executeMonthlyPayroll.ts:196` | `executeMonthlyPayroll` | `taskDispatch` | 非FC | runId, paymentPeriodKey, callerUid, deviceId | ✓ |
| 14 | `src/domains/attendance/callables/getAllStaffAttendance.ts:180` | `getAllStaffAttendance` |  | 非FC | month, year, startDay, endDay | ✓ |
| 15 | `src/domains/attendance/callables/getAttendanceCorrectionRequests.ts:83` | `getAttendanceCorrectionRequests` |  | 非FC | status, limit | ✓ |
| 16 | `src/domains/attendance/callables/getPayrollCandidates.ts:207` | `getPayrollCandidates` | `loadPayrollConfig` | 非FC | paymentPeriodKey, callerUid, deviceId | ✓ |
| 17 | `src/domains/attendance/callables/getPayrollData.ts:114` | `getPayrollData` |  | 非FC | callerUid, deviceId | ✓ |
| 18 | `src/domains/attendance/callables/getStaffAttendance.ts:92` | `getStaffAttendance` |  | 非FC | staffId, year, month | ✓ |
| 19 | `src/domains/attendance/callables/getStaffListForAttendance.ts:216` | `getStaffListForAttendance` |  | 非FC | isClockInMode, attendanceDate, shiftDate | ✓ |
| 20 | `src/domains/attendance/callables/rejectAttendanceCorrectionRequest.ts:50` | `rejectAttendanceCorrectionRequest` |  | 非FC | requestId, adminUserId | ✓ |
| 21 | `src/domains/attendance/callables/startBreak.ts:146` | `startBreak` |  | 非FC | callerUid, attendanceId, deviceId | ✓ |
| 22 | `src/domains/attendance/callables/updateAttendance.ts:244` | `updateAttendance` |  | 非FC | callerUid, attendanceId, breakId, correlationBreakId, deviceId | ✓ |
| 23 | `src/domains/attendance/callables/updateManualClockOutRecord.ts:186` | `updateManualClockOutRecord` |  | 非FC | callerUid, docId, deviceId | ✓ |
| 24 | `src/domains/attendance/helpers/payrollNotificationHelper.ts:63` | `createPayrollNotification` |  | catch 外 | triggerType |  |
| 25 | `src/domains/attendance/scheduler/payrollNotificationScheduler.ts:75` | `payrollNotificationScheduler` | `enqueue` | 非FC | targetDate, ...(notificationHour !== undefined && {notificationHour}), ...(scheduleTimeUtc !== undefined && {scheduleTimeUtc}) | ✓ |
| 26 | `src/domains/attendance/tasks/finalizePayrollRun.ts:42` | `finalizePayrollRun` |  | catch 外 | runId, paymentPeriodKey |  |
| 27 | `src/domains/attendance/tasks/processStaffPayroll.ts:43` | `processStaffPayroll` | `runNotFound` | catch 外 | runId, paymentPeriodKey |  |
| 28 | `src/domains/attendance/tasks/processStaffPayroll.ts:60` | `processStaffPayroll` | `staffResultNotFound` | catch 外 | runId, paymentPeriodKey, staffId |  |
| 29 | `src/domains/attendance/tasks/processStaffPayroll.ts:301` | `processStaffPayroll` | `processStaffPayrollCatch` | 非FC | runId, paymentPeriodKey, staffId | ✓ |
| 30 | `src/domains/attendance/tasks/processStaffPayroll.ts:350` | `processStaffPayroll` | `failureStatusUpdate` | 非FC | runId, paymentPeriodKey, staffId | ✓ |
| 31 | `src/domains/bills/callables/accounting.ts:365` | `startAccounting` | `startAccountingCallableCatch` | 非FC | callerUid, deviceId, billId, idempotencyKey, userId | ✓ |
| 32 | `src/domains/bills/callables/accounting.ts:532` | `completeAccounting` | `completeAccountingCatch` | FC | callerUid, deviceId, billId, userId | ✓ |
| 33 | `src/domains/bills/callables/accounting.ts:544` | `completeAccounting` | `completeAccountingGenericCatch` | 非FC | callerUid, deviceId, billId, userId | ✓ |
| 34 | `src/domains/bills/callables/accounting.ts:694` | `completeAccountingV2` | `completeAccountingV2Catch` | FC | callerUid, billId, userId, deviceId | ✓ |
| 35 | `src/domains/bills/callables/accounting.ts:706` | `completeAccountingV2` | `completeAccountingV2GenericCatch` | 非FC | callerUid, billId, userId, deviceId | ✓ |
| 36 | `src/domains/bills/callables/appendExtra.ts:49` | `appendExtraCallable` |  | 非FC | uid, billId, deviceId | ✓ |
| 37 | `src/domains/bills/callables/cancelAccounting.ts:120` | `cancelAccounting` | `cancelAccountingCatch` | FC | callerUid, deviceId, billId | ✓ |
| 38 | `src/domains/bills/callables/cancelAccounting.ts:132` | `cancelAccounting` | `cancelAccountingGenericCatch` | 非FC | op, code, callerUid, deviceId, billId | ✓ |
| 39 | `src/domains/bills/callables/getBillPreviewTotals.ts:183` | `getBillPreviewTotals` | `previewTotalsCatch` | 非FC | billId, businessDate | ✓ |
| 40 | `src/domains/bills/callables/getOpenBills.ts:42` | `getOpenBills` |  | 非FC | businessDate | ✓ |
| 41 | `src/domains/bills/callables/migrateTodaysBills.ts:84` | `migrateTodaysBillsAccountingFields` |  | 非FC | callerUid | ✓ |
| 42 | `src/domains/bills/callables/refundProcessing.ts:94` | `processRefund` |  | 非FC | op, code, callerUid, deviceId, billId, idempotencyKey | ✓ |
| 43 | `src/domains/bills/callables/refundProcessing.ts:153` | `getRefundHistory` |  | 非FC | op, code, callerUid, deviceId | ✓ |
| 44 | `src/domains/bills/callables/updateAccounting.ts:134` | `updateAccounting` |  | 非FC | op, code, callerUid, deviceId, billId, idempotencyKey, eventType | ✓ |
| 45 | `src/domains/bills/callables/updateActiveBill.ts:340` | `updateActiveBill` | `updateActiveBillCatch` | FC | op, billId, result, callerUid, deviceId, currentStatus, reason, templateId, templateIds | ✓ |
| 46 | `src/domains/bills/callables/updateActiveBill.ts:371` | `updateActiveBill` | `updateActiveBillGenericCatch` | 非FC | op, billId, result, code, callerUid, deviceId, templateId, templateIds | ✓ |
| 47 | `src/domains/bills/callables/verifyPaymentSplit.ts:169` | `verifyPaymentSplit` | `verifyPaymentSplitCatch` | FC | billId, userId | ✓ |
| 48 | `src/domains/bills/callables/verifyPaymentSplit.ts:181` | `verifyPaymentSplit` | `verifyPaymentSplitGenericCatch` | 非FC | billId, userId | ✓ |
| 49 | `src/domains/bills/repos/appendExtra.ts:260` | `appendExtra` |  | 非FC | op, billId, idempKey, result, code, requestHash8, finalIdempotencyKey | ✓ |
| 50 | `src/domains/bills/repos/appendItem.ts:345` | `appendItem` | `appendItemCatch` | 非FC | op, billId, idempKey, result, code, requestHash8 | ✓ |
| 51 | `src/domains/bills/repos/appendItem.ts:610` | `appendItem` | `appendItemWithOrderProjection` | 非FC | op, billId, idempKey, result, code, requestHash8, stackPreview, itemId, orderDocId, orderId | ✓ |
| 52 | `src/domains/bills/repos/appendSideGameChip.ts:297` | `appendSideGameChip` |  | 非FC | op, billId, action, idempKey, result, code, requestHash8, idempotencyRef | ✓ |
| 53 | `src/domains/bills/repos/calcBusinessDate.ts:81` | `calcBusinessDate` |  | 非FC | nowUtc | ✓ |
| 54 | `src/domains/bills/repos/createBillWithActiveStay.ts:248` | `createBillWithActiveStay` | `operationForCreateBillKey(error.errorKey)` | FC | billId, userId, idempKey, result, requestHash8, idempotencyKeyFull, idempotencyRef | ✓ |
| 55 | `src/domains/bills/repos/createBillWithActiveStay.ts:264` | `createBillWithActiveStay` | `runCreateBillTransaction` | 非FC | billId, userId, idempKey, result, code, requestHash8, idempotencyKeyFull, idempotencyRef | ✓ |
| 56 | `src/domains/bills/repos/postEventAdjustment.ts:251` | `postEventAdjustment` |  | 非FC | op, billId, eventId, result, code | ✓ |
| 57 | `src/domains/bills/repos/postEventCancel.ts:188` | `postEventCancel` |  | 非FC | op, billId, eventId, result, code | ✓ |
| 58 | `src/domains/bills/repos/postEventRefund.ts:260` | `postEventRefund` |  | 非FC | op, billId, eventId, result, code | ✓ |
| 59 | `src/domains/bills/repos/postEventReopen.ts:175` | `postEventReopen` |  | 非FC | op, billId, eventId, result, code | ✓ |
| 60 | `src/domains/bills/repos/recordTournamentAction.ts:316` | `recordTournamentAction` |  | 非FC | op, billId, templateId, action, idempKey, result, code, idempotencyRef | ✓ |
| 61 | `src/domains/bills/repos/startAccounting.ts:238` | `startAccounting` | `operationForStartAccountingKey(error.errorKey)` | FC | billId, idempKey, result, idempotencyRef | ✓ |
| 62 | `src/domains/bills/repos/startAccounting.ts:252` | `startAccounting` | `startAccountingRepoCatch` | 非FC | billId, idempKey, result, code, idempotencyRef | ✓ |
| 63 | `src/domains/bills/repos/updateBill.ts:179` | `updateBill` |  | 非FC | op, billId, result, code | ✓ |
| 64 | `src/domains/bills/repos/updatePlace.ts:182` | `updatePlace` |  | 非FC | op, billId, table, seat, idempKey, result, code | ✓ |
| 65 | `src/domains/bills/triggers/billsEventsOnCreate.ts:206` | `billsEventsOnCreate` |  | 非FC | billId, eventId, type, code | ✓ |
| 66 | `src/domains/bills/triggers/billsOnSettle.ts:201` | `billsOnSettle` |  | 非FC | billId | ✓ |
| 67 | `src/domains/itemOrder/callables/cancelOrder.ts:139` | `cancelOrder` |  | 非FC | callerUid, deviceId, orderId, orderDocId, billId, businessDate, dateString | ✓ |
| 68 | `src/domains/itemOrder/callables/createMenuItem.ts:63` | `createMenuItem` | `imageUpload` | 非FC | callerUid, deviceId | ✓ |
| 69 | `src/domains/itemOrder/callables/createMenuItem.ts:125` | `createMenuItem` | `menuCreateCatch` | 非FC | callerUid, deviceId | ✓ |
| 70 | `src/domains/itemOrder/callables/getMenuItems.ts:24` | `getMenuItems` | `adminMenuDocMissing` | catch 外 | collection, docId |  |
| 71 | `src/domains/itemOrder/callables/getMenuItems.ts:89` | `getMenuItems` | `menuFetchCatch` | 非FC | callerUid | ✓ |
| 72 | `src/domains/itemOrder/callables/getUserOrderHistory.ts:110` | `getUserOrderHistory` |  | 非FC | businessDate, userId | ✓ |
| 73 | `src/domains/itemOrder/callables/placeOrder.ts:137` | `placeOrder` | `chipPurchaseLog` | 非FC | callerUid, deviceId, billId, businessDate, idempotencyKey, userId | ✓ |
| 74 | `src/domains/itemOrder/callables/placeOrder.ts:205` | `placeOrder` | `placeOrderCatch` | FC | callerUid, deviceId, billId, businessDate, idempotencyKey, userId | ✓ |
| 75 | `src/domains/itemOrder/callables/placeOrder.ts:221` | `placeOrder` | `placeOrderGenericCatch` | 非FC | callerUid, deviceId, billId, businessDate, idempotencyKey, userId | ✓ |
| 76 | `src/domains/itemOrder/callables/placeOrderByUser.ts:188` | `placeOrderByUser` | `placeOrderCatch` | FC | userId, billId, orderDocId, activeBillId, idempotencyKey, lastIdempotencyKey, sessionNonce | ✓ |
| 77 | `src/domains/itemOrder/callables/placeOrderByUser.ts:206` | `placeOrderByUser` | `placeOrderGenericCatch` | 非FC | userId, billId, orderDocId, activeBillId, idempotencyKey, lastIdempotencyKey, sessionNonce | ✓ |
| 78 | `src/domains/itemOrder/callables/toggleSoldOutForMenuItem.ts:74` | `toggleSoldOutForMenuItem` |  | 非FC | callerUid, deviceId, menuItemId | ✓ |
| 79 | `src/domains/itemOrder/callables/updateMenuItem.ts:79` | `updateMenuItem` | `imageUpload` | 非FC | callerUid, deviceId, originalId | ✓ |
| 80 | `src/domains/itemOrder/callables/updateMenuItem.ts:149` | `updateMenuItem` | `menuUpdateCatch` | 非FC | callerUid, deviceId, originalId | ✓ |
| 81 | `src/domains/logs/callables/getActionLogs.ts:215` | `getActionLogs` |  | 非FC | detailMessage, tournamentId, deviceId, tableId, limit, startAfter, firstDocTournamentId | ✓ |
| 82 | `src/domains/logs/callables/rollbackAction.ts:301` | `rollbackAction` |  | 非FC | tournamentId, tId, operationId, action, rollBackBy, rollBackByDeviceId, rollBackByDeviceName, plUid, grantIdempotencyKey | ✓ |
| 83 | `src/domains/logs/services/undoAddon.ts:79` | `undoAddon` |  | 非FC | (なし) | ✓ |
| 84 | `src/domains/logs/services/undoAssignSeatToPlayer.ts:95` | `undoAssignSeatToPlayer` |  | 非FC | (なし) | ✓ |
| 85 | `src/domains/logs/services/undoBulkAddon.ts:112` | `undoBulkAddon` |  | 非FC | (なし) | ✓ |
| 86 | `src/domains/logs/services/undoBustAndExit.ts:90` | `undoBustAndExit` |  | 非FC | (なし) | ✓ |
| 87 | `src/domains/logs/services/undoBustAndReentry.ts:103` | `undoBustAndReentry` |  | 非FC | (なし) | ✓ |
| 88 | `src/domains/logs/services/undoRegisterForTournament.ts:154` | `undoRegisterForTournament` |  | 非FC | (なし) | ✓ |
| 89 | `src/domains/logs/services/undoRegisterParticipants.ts:222` | `undoRegisterParticipants` |  | 非FC | (なし) | ✓ |
| 90 | `src/domains/logs/services/undoReseatAllPlayers.ts:83` | `undoReseatAllPlayers` |  | 非FC | (なし) | ✓ |
| 91 | `src/domains/scheduler/replan/enqueueTournamentTasksReplanRequest.ts:129` | `executeScheduledJobTask` | `markReplanCompletedBestEffort` | 非FC | reason | ✓ |
| 92 | `src/domains/scheduler/replan/enqueueTournamentTasksReplanRequest.ts:146` | `executeScheduledJobTask` | `releaseReplanProcessingBestEffort` | 非FC | reason | ✓ |
| 93 | `src/domains/scheduler/replan/enqueueTournamentTasksReplanTask.ts:132` | `enqueueTournamentTasksByScheduler` | `cloudTasksCreateTask` | 非FC | taskId, queueName, projectId, idempotencyKey | ✓ |
| 94 | `src/domains/scheduler/supervisor/schedulerLogs.ts:47` | `writeSchedulerDispatchLogBestEffort` | `dispatchLogWrite` | 非FC | reason, jobKey, functionName, projectId | ✓ |
| 95 | `src/domains/scheduler/supervisor/schedulerLogs.ts:73` | `writeSchedulerExecutionLogByCloudTaskBestEffort` | `executionLogWrite` | 非FC | reason, jobKey, functionName, projectId | ✓ |
| 96 | `src/domains/scheduler/supervisor/schedulerSupervisor.ts:20` | `schedulerSupervisor` |  | 非FC | (なし) | ✓ |
| 97 | `src/domains/scheduler/tasks/scheduledJobTaskExecutors.ts:307` | `executeScheduledJobTask` | `runScheduledJob` | 非FC | jobKey, idempotencyKey, reason, supervisorRunId, planningDate, plannedRunAt, expectedJobKey | ✓ |
| 98 | `src/domains/shift/callables/finalizeMonth.ts:178` | `finalizeMonth` | `finalizeDayLoop` | 非FC | yearMonth, dateKey, installationId | ✓ |
| 99 | `src/domains/shift/services/helpers.ts:117` | `getRequiredStaffByTimeSlot` | `config_read` | 非FC | code, reason, message | ✓ |
| 100 | `src/domains/sideGame/callables/depositTip.ts:138` | `depositTip` |  | 非FC | callerUid, deviceId, billId, activeBillId, idempotencyKey, userId | ✓ |
| 101 | `src/domains/sideGame/callables/leaveSeat.ts:99` | `leaveSeat` |  | 非FC | callerUid, deviceId, billId, userId, tableId, seatNumber | ✓ |
| 102 | `src/domains/sideGame/callables/registerForSideGame.ts:113` | `registerForSideGame` |  | 非FC | callerUid, deviceId, billId, userId, tableId, seatNumber | ✓ |
| 103 | `src/domains/sideGame/callables/withdrawTip.ts:143` | `withdrawTip` |  | 非FC | callerUid, deviceId, billId, activeBillId, idempotencyKey, userId | ✓ |
| 104 | `src/domains/staff/callables/confirmShiftRequest.ts:100` | `confirmShiftRequest` |  | 非FC | staffId, requestId | ✓ |
| 105 | `src/domains/staff/callables/createMultipleShifts.ts:375` | `createMultipleShifts` |  | 非FC | staffId, lastDateKey, lastDayKey, lastRequestId, dateKey, dayKey, requestId | ✓ |
| 106 | `src/domains/staff/callables/createStaffAccount.ts:121` | `createStaffAccount` |  | 非FC | uid, loginId, resolvedLoginId | ✓ |
| 107 | `src/domains/staff/callables/getShifts.ts:53` | `getShifts` | `initCatch` | 非FC | uid, userId | ✓ |
| 108 | `src/domains/staff/callables/getShifts.ts:271` | `getShifts` | `shiftFetchCatch` | 非FC | uid, userId, lastTouchedDateKey, dateKey | ✓ |
| 109 | `src/domains/staff/callables/getShifts.ts:282` | `getShifts` | `detailErrorLog` | 非FC | uid, userId, lastTouchedDateKey, dateKey | ✓ |
| 110 | `src/domains/staff/callables/getShifts.ts:291` | `getShifts` | `unknownErrorLog` | 非FC | uid, userId, lastTouchedDateKey, dateKey | ✓ |
| 111 | `src/domains/staff/callables/updateShiftRequest.ts:160` | `updateShiftRequest` |  | 非FC | staffId, requestId, dateKey | ✓ |
| 112 | `src/domains/staff/callables/updateStaffBankInfo.ts:89` | `updateStaffBankInfo` |  | 非FC | callerUid, staffId | ✓ |
| 113 | `src/domains/staff/callables/updateStaffHourlyWage.ts:98` | `updateStaffHourlyWage` |  | 非FC | adminId, staffId | ✓ |
| 114 | `src/domains/staff/scheduler/scheduledCleanup.ts:46` | `scheduledCleanup` |  | 非FC | (なし) | ✓ |
| 115 | `src/domains/storeMeta/callables/closeAssessmentTask.ts:267` | `closeAssessmentTask` |  | 非FC | (なし) | ✓ |
| 116 | `src/domains/storeMeta/callables/closeStoreTerminal.ts:149` | `closeStoreTerminal` | `closeTerminalPreflight` | FC | callerUid, currentBusinessDateKey, phase, status | ✓ |
| 117 | `src/domains/storeMeta/callables/closeStoreTerminal.ts:180` | `closeStoreTerminal` | `acquireProcessingLease` | FC | callerUid, requestRunId, runId, currentBusinessDateKey | ✓ |
| 118 | `src/domains/storeMeta/callables/closeStoreTerminal.ts:449` | `closeStoreTerminal` | `finalizeCloseStateDoc.enqueueOpenAssessmentRecheck` | 非FC | runId, closedBusinessDate, intendedBusinessDateKeyForRecheck, recheckEnqueueError, callerUid, attemptId, requestRunId, currentBusinessDateKey, recheckProjectId | ✓ |
| 119 | `src/domains/storeMeta/callables/closeStoreTerminal.ts:528` | `closeStoreTerminal` | ``runCloseStep.${stepName}`` | 非FC | runId, closedBusinessDate, currentBusinessDateKey, stepName, callerUid, attemptId, requestRunId, amountsByBillId, unclockedAttendanceIds, markWrittenBillIds, markUsersIncremented | ✓ |
| 120 | `src/domains/storeMeta/callables/closeStoreTerminal.ts:585` | `closeStoreTerminal` | `rollbackUnsettledMark` | 非FC | runId, closedBusinessDate, writtenBillIds, rollbackErrorSummary, callerUid, attemptId, requestRunId, currentBusinessDateKey, markUsersIncremented | ✓ |
| 121 | `src/domains/storeMeta/callables/continueBusinessTerminal.ts:306` | `continueBusinessTerminal` | `cloudTasksCreateTask` | 非FC | intendedBusinessDateKey, scheduledAt, callerUid, closeTaskId, continueLogId, idempotencyKey, openOverrideIntendedBusinessDateKey, projectId, openTaskId, status | ✓ |
| 122 | `src/domains/storeMeta/callables/continueBusinessTerminal.ts:363` | `continueBusinessTerminal` | `continueBusinessTerminalFunctionCustom` | FC | callerUid, intendedBusinessDateKey, hours, idempotencyKey, continueLogId, closeTaskId, projectId, phase, status | ✓ |
| 123 | `src/domains/storeMeta/callables/createInitialStateDocCallable.ts:50` | `createInitialStateDocCallable` | `createInitialStateDoc` | 非FC | op, path | ✓ |
| 124 | `src/domains/storeMeta/callables/initializeStoreConfigCallable.ts:145` | `initializeStoreConfigCallable` | `initStoreMetaConfig` | 非FC | callerUid, deviceId | ✓ |
| 125 | `src/domains/storeMeta/callables/openAssessmentTask.ts:310` | `openAssessmentTask` |  | 非FC | (なし) | ✓ |
| 126 | `src/domains/storeMeta/callables/openStoreTerminal.ts:50` | `openStoreTerminal` | `openTerminalPreflight` | FC | callerUid | ✓ |
| 127 | `src/domains/storeMeta/callables/openStoreTerminal.ts:82` | `openStoreTerminal` | `acquireProcessingLease` | FC | callerUid, businessDateKey, requestRunId, runId | ✓ |
| 128 | `src/domains/storeMeta/callables/openStoreTerminal.ts:221` | `openStoreTerminal` | ``runOpenStep.${stepName}`` | 非FC | runId, businessDateKey, stepName, callerUid, attemptId, requestRunId | ✓ |
| 129 | `src/domains/storeMeta/callables/temporaryUnlockAlreadyRunningDifferentDateTerminal.ts:229` | `temporaryUnlockAlreadyRunningDifferentDateTerminal` | `cloudTasksCreateTask` | 非FC | intendedBusinessDateKey, scheduledAt, callerUid, openTaskId, projectId, unlockLogId | ✓ |
| 130 | `src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts:128` | `updateUnclockedAttendanceWithAuth` | `passwordClockOutUpdate` | 非FC | docId, callerUid | ✓ |
| 131 | `src/domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow.ts:118` | `getCurrentBusinessDateKeyOrThrow` | `loadFirestoreStateDoc` | 非FC | (なし) | ✓ |
| 132 | `src/domains/storeMeta/scheduler/weeklyPlanner.ts:249` | `weeklyPlanner` |  | 非FC | (なし) | ✓ |
| 133 | `src/domains/storeMeta/scripts/createInitialStateDoc.ts:50` | `createInitialStateDoc` | `createDocMainCatch` | 非FC | (なし) | ✓ |
| 134 | `src/domains/storeMeta/scripts/createInitialStateDoc.ts:67` | `createInitialStateDoc` | `scriptTopLevelCatch` | catch 外 | (なし) | ✓ |
| 135 | `src/domains/storeMeta/services/applyCloseSnapshot.ts:136` | `applyCloseSnapshot` | `applyBillCloseSnapshotTxn` | 非FC | billId, closeRunId, closedBusinessDate, error | ✓ |
| 136 | `src/domains/storeMeta/services/applyCloseSnapshot.ts:168` | `applyCloseSnapshot` | `incrementUserUnsettledBillsCount` | 非FC | userId, incrementCount, closeRunId, closedBusinessDate, countByUserId | ✓ |
| 137 | `src/domains/storeMeta/services/applyCloseSnapshot.ts:217` | `applyCloseSnapshot` | `getClosedBusinessDate` | FC | callerUid, amountsByBillId | ✓ |
| 138 | `src/domains/storeMeta/services/cleanupActiveStaysOnClose.ts:56` | `cleanupActiveStaysOnClose` | `deleteActiveStayDocument` | 非FC | activeStayId, billId | ✓ |
| 139 | `src/domains/storeMeta/services/cleanupActiveStaysOnClose.ts:104` | `cleanupActiveStaysOnClose` | `cleanupOuterCatch` | 非FC | callerUid, deviceId | ✓ |
| 140 | `src/domains/storeMeta/services/finalizeUnsettledBillAfterAccounting.ts:76` | `finalizeUnsettledBillAfterAccounting` |  | FC | callerUid, billId, userId, op | ✓ |
| 141 | `src/domains/storeMeta/services/getCloseIntegrityData.ts:53` | `getCloseIntegrityData` | `closeIntegrityAggregate` | 非FC | callerUid, businessDate | ✓ |
| 142 | `src/domains/storeMeta/services/getUnclockedStaffForClose.ts:60` | `getUnclockedStaffForClose` | `unclockedStaffQuery` | 非FC | callerUid | ✓ |
| 143 | `src/domains/storeMeta/services/getUnclosedTournamentsForClose.ts:179` | `getUnclosedTournamentsForClose` | `unclosedTournamentsQuery` | 非FC | callerUid, businessDate | ✓ |
| 144 | `src/domains/storeMeta/services/getUnsettledBillsForClose.ts:98` | `getUnsettledBillsForClose` | `unsettledBillsQuery` | 非FC | callerUid, businessDate | ✓ |
| 145 | `src/domains/storeMeta/services/resetAllSideGames.ts:58` | `resetAllSideGames` |  | 非FC | callerUid | ✓ |
| 146 | `src/domains/storeMeta/services/resetAllTables.ts:41` | `resetAllTables` |  | 非FC | callerUid | ✓ |
| 147 | `src/domains/tournament_activeTournament/callables/addon.ts:221` | `addon` | `recordTournamentActionBestEffort` | 非FC | callerUid, idempotencyKey, billId, templateId, tournamentId, userId, operationId, deviceId | ✓ |
| 148 | `src/domains/tournament_activeTournament/callables/addon.ts:300` | `addon` | `addonMainCatch` | 非FC | callerUid, ...(device != null && { deviceId: device.id }), ...(typeof reqData?.tournamentId === 'string' && { tournamentId: reqData.tournamentId }), ...(typeof reqData?.userId === 'string' && { userId: reqData.userId }), ...(typeof reqData?.operationId === 'string' && { operationId: reqData.operationId }), ...(typeof reqData?.tableId === 'string' && { tableId: reqData.tableId }) | ✓ |
| 149 | `src/domains/tournament_activeTournament/callables/addon.ts:329` | `addon` | `addonOperationLogWrite` | 非FC | callerUid, opId, deviceId, ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }), ...(typeof rawData?.userId === 'string' && { userId: rawData.userId }), ...(typeof rawData?.operationId === 'string' && { operationId: rawData.operationId }) | ✓ |
| 150 | `src/domains/tournament_activeTournament/callables/addTableToTournament.ts:142` | `addTableToTournament` | `addTableToTournamentCatch` | FC |  | ✓ |
| 151 | `src/domains/tournament_activeTournament/callables/addTableToTournament.ts:151` | `addTableToTournament` | `addTableToTournamentGenericCatch` | 非FC |  | ✓ |
| 152 | `src/domains/tournament_activeTournament/callables/api.pause.ts:126` | `pauseTournament` | `pauseTournamentCatch` | FC |  | ✓ |
| 153 | `src/domains/tournament_activeTournament/callables/api.pause.ts:135` | `pauseTournament` | `pauseTournamentGenericCatch` | 非FC |  | ✓ |
| 154 | `src/domains/tournament_activeTournament/callables/api.resume.ts:135` | `resumeTournament` | `resumeTournamentCatch` | FC |  | ✓ |
| 155 | `src/domains/tournament_activeTournament/callables/api.resume.ts:144` | `resumeTournament` | `resumeTournamentGenericCatch` | 非FC |  | ✓ |
| 156 | `src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts:207` | `assignSeatToPlayer` | `updatePlaceBestEffort` | 非FC | callerUid, deviceId, billId, operationId, seatUserIdKey, tournamentId, userId, tableId, seatNumber | ✓ |
| 157 | `src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts:270` | `assignSeatToPlayer` | `assignSeatToPlayerCatch` | FC |  | ✓ |
| 158 | `src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts:279` | `assignSeatToPlayer` | `assignSeatGenericCatch` | 非FC |  | ✓ |
| 159 | `src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts:300` | `assignSeatToPlayer` | `assignSeatOperationLogWrite` | 非FC | callerUid, opId, deviceId, ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }), ...(typeof rawData?.userId === 'string' && { userId: rawData.userId }), ...(typeof rawData?.operationId === 'string' && { operationId: rawData.operationId }) | ✓ |
| 160 | `src/domains/tournament_activeTournament/callables/bulkAddon.ts:230` | `bulkAddon` | `recordActionPerUserBestEffort` | 非FC | callerUid, idempotencyKey, operationId, templateId, deviceId, billId, clientOperationId, tournamentId, ...(tableId != null && tableId !== '' && { tableId }) | ✓ |
| 161 | `src/domains/tournament_activeTournament/callables/bulkAddon.ts:293` | `bulkAddon` | `bulkAddonMainCatch` | 非FC | callerUid, ...(device != null && { deviceId: device.id }), ...(typeof rawDataEarly?.tournamentId === 'string' && { tournamentId: rawDataEarly.tournamentId }), ...(typeof rawDataEarly?.tableId === 'string' && { tableId: rawDataEarly.tableId }), ...(typeof rawDataEarly?.operationId === 'string' && { clientOperationId: rawDataEarly.operationId }) | ✓ |
| 162 | `src/domains/tournament_activeTournament/callables/bulkAddon.ts:323` | `bulkAddon` | `bulkAddonOperationLogWrite` | 非FC | callerUid, opId, deviceId, ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }), ...(typeof rawData?.tableId === 'string' && { tableId: rawData.tableId }) | ✓ |
| 163 | `src/domains/tournament_activeTournament/callables/bustAndExit.ts:195` | `bustAndExit` | `updatePlaceBestEffort` | 非FC | billId, callerUid, currentUserId, seatPokerNameKey, seatUserIdKey, deviceId, operationId, tournamentId, userId, seatNumber, tableId | ✓ |
| 164 | `src/domains/tournament_activeTournament/callables/bustAndExit.ts:247` | `bustAndExit` | `bustAndExitMainCatch` | 非FC | callerUid, ...(device != null && { deviceId: device.id }), ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }), ...(typeof rawData?.userId === 'string' && { userId: rawData.userId }), ...(typeof rawData?.tableId === 'string' && { tableId: rawData.tableId }), ...(typeof rawData?.operationId === 'string' && { operationId: rawData.operationId }), ...(typeof rawData?.seatNumber === 'number' && { seatNumber: rawData.seatNumber }) | ✓ |
| 165 | `src/domains/tournament_activeTournament/callables/bustAndExit.ts:274` | `bustAndExit` | `bustAndExitOperationLogWrite` | 非FC | callerUid, opId, deviceId, ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }), ...(typeof rawData?.userId === 'string' && { userId: rawData.userId }) | ✓ |
| 166 | `src/domains/tournament_activeTournament/callables/bustAndReentry.ts:366` | `bustAndReentry` | `recordTournamentActionBestEffort` | 非FC | callerUid, idempotencyKey, deviceId, billId, templateId, tournamentId, userId, operationId, tableId, seatNumber, seatUserIdKey, seatPokerNameKey | ✓ |
| 167 | `src/domains/tournament_activeTournament/callables/bustAndReentry.ts:420` | `bustAndReentry` | `bustAndReentryMainCatch` | 非FC | callerUid, ...(device != null && { deviceId: device.id }), ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }), ...(typeof rawData?.userId === 'string' && { userId: rawData.userId }), ...(typeof rawData?.tableId === 'string' && { tableId: rawData.tableId }), ...(typeof rawData?.operationId === 'string' && { operationId: rawData.operationId }), ...(typeof rawData?.seatNumber === 'number' && { seatNumber: rawData.seatNumber }) | ✓ |
| 168 | `src/domains/tournament_activeTournament/callables/bustAndReentry.ts:447` | `bustAndReentry` | `bustAndReentryOperationLogWrite` | 非FC | callerUid, opId, deviceId, ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }), ...(typeof rawData?.userId === 'string' && { userId: rawData.userId }) | ✓ |
| 169 | `src/domains/tournament_activeTournament/callables/createTemporaryTable.ts:128` | `createTemporaryTable` | `createTemporaryTableCatch` | FC |  | ✓ |
| 170 | `src/domains/tournament_activeTournament/callables/createTemporaryTable.ts:137` | `createTemporaryTable` | `createTemporaryTableGenericCatch` | 非FC |  | ✓ |
| 171 | `src/domains/tournament_activeTournament/callables/endTournament.ts:122` | `endTournament` |  | 非FC | callerUid, ...(device != null && { deviceId: device.id }), ...(d?.tournamentId && { tournamentId: d.tournamentId }) | ✓ |
| 172 | `src/domains/tournament_activeTournament/callables/getAvailableTables.ts:49` | `getAvailableTables` |  | 非FC | ...(request.auth?.uid && { callerUid: request.auth.uid }) | ✓ |
| 173 | `src/domains/tournament_activeTournament/callables/getPrizeData.ts:58` | `getPrizeData` |  | 非FC | tournamentId | ✓ |
| 174 | `src/domains/tournament_activeTournament/callables/getRankingData.ts:79` | `getRankingData` | `getRankingDataCatch` | FC | tournamentId | ✓ |
| 175 | `src/domains/tournament_activeTournament/callables/getRankingData.ts:89` | `getRankingData` | `getRankingDataGenericCatch` | 非FC | tournamentId | ✓ |
| 176 | `src/domains/tournament_activeTournament/callables/getTodayTournaments.ts:233` | `getTodayTournaments` |  | 非FC | ...(request.auth?.uid && { callerUid: request.auth.uid }) | ✓ |
| 177 | `src/domains/tournament_activeTournament/callables/getUpcomingTournaments.ts:264` | `getUpcomingTournaments` |  | 非FC | ...(request.auth?.uid && { callerUid: request.auth.uid }) | ✓ |
| 178 | `src/domains/tournament_activeTournament/callables/registerForTournament.ts:241` | `registerForTournament` | `recordTournamentAction` | 非FC | billId, idempotencyKey, templateId, tournamentId, userId, deviceId | ✓ |
| 179 | `src/domains/tournament_activeTournament/callables/registerForTournament.ts:294` | `registerForTournament` | `registerTournamentFlow` | 非FC | ...(uid && { callerUid: uid }), deviceId, ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }) | ✓ |
| 180 | `src/domains/tournament_activeTournament/callables/registerForTournament.ts:318` | `registerForTournament` | `recordFailureOperationLog` | 非FC | opId, deviceId, ...(uid && { callerUid: uid }), ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }) | ✓ |
| 181 | `src/domains/tournament_activeTournament/callables/registerParticipants.ts:317` | `registerParticipants` | `recordActionPerUserBestEffort` | 非FC | callerUid, idempotencyKey, operationId, templateId, deviceId, billId, clientOperationId, tournamentId, userId | ✓ |
| 182 | `src/domains/tournament_activeTournament/callables/registerParticipants.ts:347` | `registerParticipants` | `registerUserFailed` | 非FC | callerUid, operationId, templateId, deviceId, tournamentId, userId, clientOperationId | ✓ |
| 183 | `src/domains/tournament_activeTournament/callables/registerParticipants.ts:406` | `registerParticipants` | `registerParticipantsMainCatch` | 非FC | callerUid, ...(device != null && { deviceId: device.id }), ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }), ...(typeof rawData?.operationId === 'string' && { clientOperationId: rawData.operationId }) | ✓ |
| 184 | `src/domains/tournament_activeTournament/callables/registerParticipants.ts:430` | `registerParticipants` | `registerParticipantsOperationLogWrite` | 非FC | callerUid, opId, deviceId, ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }) | ✓ |
| 185 | `src/domains/tournament_activeTournament/callables/removeTableFromTournament.ts:117` | `removeTableFromTournament` | `removeTableFromTournamentCatch` | FC |  | ✓ |
| 186 | `src/domains/tournament_activeTournament/callables/removeTableFromTournament.ts:130` | `removeTableFromTournament` | `removeTableFromTournamentGenericCatch` | 非FC |  | ✓ |
| 187 | `src/domains/tournament_activeTournament/callables/reseatAllPlayers.ts:242` | `reseatAllPlayers` | `updatePlacePerAssignmentBestEffort` | 非FC | callerUid, deviceId, billId, operationId, tournamentId, userId, tableId, seatNumber | ✓ |
| 188 | `src/domains/tournament_activeTournament/callables/reseatAllPlayers.ts:300` | `reseatAllPlayers` | `reseatAllPlayersCatch` | FC |  | ✓ |
| 189 | `src/domains/tournament_activeTournament/callables/reseatAllPlayers.ts:309` | `reseatAllPlayers` | `reseatAllPlayersGenericCatch` | 非FC |  | ✓ |
| 190 | `src/domains/tournament_activeTournament/callables/reseatAllPlayers.ts:328` | `reseatAllPlayers` | `reseatAllPlayersOperationLogWrite` | 非FC | callerUid, opId, deviceId, ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }) | ✓ |
| 191 | `src/domains/tournament_activeTournament/callables/setPrizeData.ts:73` | `setPrizeData` |  | 非FC | callerUid, ...(device != null && { deviceId: device.id }), ...(d?.tournamentId && { tournamentId: d.tournamentId }) | ✓ |
| 192 | `src/domains/tournament_activeTournament/callables/setRankingData.ts:155` | `setRankingData` | `setRankingDataRankings` | 非FC | callerUid, ...(device != null && { deviceId: device.id }), ...(d?.tournamentId && { tournamentId: d.tournamentId }), ...(d?.grantIdempotencyKey && { grantIdempotencyKey: d.grantIdempotencyKey }) | ✓ |
| 193 | `src/domains/tournament_activeTournament/callables/setRankingData.ts:318` | `setRankingData` | `setRankingDataPrizeGrant` | 非FC | grantIdempotencyKey, tournamentId | ✓ |
| 194 | `src/domains/tournament_activeTournament/callables/validateEndTournament.ts:199` | `validateEndTournament` |  | 非FC | callerUid, ...(device != null && { deviceId: device.id }), ...(d?.tournamentId && { tournamentId: d.tournamentId }) | ✓ |
| 195 | `src/domains/tournament_createTournament/callables/archiveBlindTemplate.ts:29` | `archiveBlindTemplate` |  | 非FC | blindTemplateId | ✓ |
| 196 | `src/domains/tournament_createTournament/callables/archiveTournamentTemplate.ts:32` | `archiveTournamentTemplate` |  | 非FC | tournamentTemplateId | ✓ |
| 197 | `src/domains/tournament_createTournament/callables/createBlindTemplate.ts:85` | `createBlindTemplate` |  | 非FC | ...(request.auth?.uid && { callerUid: request.auth.uid }) | ✓ |
| 198 | `src/domains/tournament_createTournament/callables/createScheduledTournament.ts:374` | `createScheduledTournament` | `enqueueAfterCreate` | 非FC | tournamentId, storeId, tenantId, blindStructureId, callerUid, selectedBusinessDateKey, deviceId | ✓ |
| 199 | `src/domains/tournament_createTournament/callables/createScheduledTournament.ts:422` | `createScheduledTournament` | `createScheduledTournamentCatch` | FC |  | ✓ |
| 200 | `src/domains/tournament_createTournament/callables/createScheduledTournament.ts:431` | `createScheduledTournament` | `createScheduledTournamentGenericCatch` | 非FC |  | ✓ |
| 201 | `src/domains/tournament_createTournament/callables/createTournamentRecurrence.ts:123` | `createTournamentRecurrence` | `enqueueAfterCreate` | 非FC | recurrenceId, storeId, tenantId, callerUid, deviceId, templateId | ✓ |
| 202 | `src/domains/tournament_createTournament/callables/createTournamentRecurrence.ts:158` | `createTournamentRecurrence` | `createTournamentRecurrenceCatch` | FC |  | ✓ |
| 203 | `src/domains/tournament_createTournament/callables/createTournamentRecurrence.ts:166` | `createTournamentRecurrence` | `createTournamentRecurrenceGenericCatch` | 非FC |  | ✓ |
| 204 | `src/domains/tournament_createTournament/callables/createTournamentRecurrence.ts:560` | `createTournamentRecurrence` | `createTournamentRecurrenceInnerHelper` | 非FC | recurrenceId, storeId, templateId, tenantId | ✓ |
| 205 | `src/domains/tournament_createTournament/callables/createTournamentTemplate.ts:73` | `createTournamentTemplate` |  | 非FC | ...(request.auth?.uid && { callerUid: request.auth.uid }) | ✓ |
| 206 | `src/domains/tournament_createTournament/callables/deleteTournamentRecurrence.ts:79` | `deleteTournamentRecurrence` |  | 非FC | callerUid, deviceId, ...(d?.recurrenceId && { recurrenceId: d.recurrenceId }) | ✓ |
| 207 | `src/domains/tournament_createTournament/callables/enqueueTournamentTasks.ts:31` | `enqueueTournamentTasks` | `enqueueBatchPartialErrors` | catch 外 | errors, deviceId, callerUid |  |
| 208 | `src/domains/tournament_createTournament/callables/enqueueTournamentTasks.ts:41` | `enqueueTournamentTasks` | `enqueueTournamentTasksCatch` | FC | deviceId, callerUid | ✓ |
| 209 | `src/domains/tournament_createTournament/callables/enqueueTournamentTasks.ts:50` | `enqueueTournamentTasks` | `enqueueTournamentTasksGenericCatch` | 非FC | deviceId, callerUid | ✓ |
| 210 | `src/domains/tournament_createTournament/callables/getBlindTemplates.ts:41` | `getBlindTemplates` |  | 非FC | ...(request.auth?.uid && { callerUid: request.auth.uid }) | ✓ |
| 211 | `src/domains/tournament_createTournament/callables/getScheduledTournamentsForEdit.ts:76` | `getScheduledTournamentsForEdit` |  | 非FC | callerUid, deviceId, ...(d?.id && { id: d.id }), ...(d?.type && { type: d.type }) | ✓ |
| 212 | `src/domains/tournament_createTournament/callables/getTournamentRecurrences.ts:46` | `getTournamentRecurrences` |  | 非FC | ...(request.auth?.uid && { callerUid: request.auth.uid }) | ✓ |
| 213 | `src/domains/tournament_createTournament/callables/getTournamentTemplates.ts:64` | `getTournamentTemplates` |  | 非FC | ...(request.auth?.uid && { callerUid: request.auth.uid }) | ✓ |
| 214 | `src/domains/tournament_createTournament/callables/updateBlindTemplate.ts:97` | `updateBlindTemplate` |  | 非FC | blindTemplateId, ...(blindTemplateId && { bid: blindTemplateId }) | ✓ |
| 215 | `src/domains/tournament_createTournament/callables/updateScheduledTournamentStartAt.ts:145` | `updateScheduledTournamentStartAt` | `validateStartAtUpdatePreconditions` | FC | deviceId, callerUid | ✓ |
| 216 | `src/domains/tournament_createTournament/callables/updateScheduledTournamentStatus.ts:142` | `updateScheduledTournamentStatus` | `validateStatusTransition` | FC | deviceId, callerUid | ✓ |
| 217 | `src/domains/tournament_createTournament/callables/updateTournamentRecurrence.ts:173` | `updateTournamentRecurrence` |  | 非FC | callerUid, deviceId, ...(d?.recurrenceId && { recurrenceId: d.recurrenceId }), ...(d?.templateId && { templateId: d.templateId }), ...(d?.tournamentId && { tournamentId: d.tournamentId }) | ✓ |
| 218 | `src/domains/tournament_createTournament/callables/updateTournamentTemplate.ts:139` | `updateTournamentTemplate` |  | 非FC | callerUid, deviceId, ...(d?.templateId && { templateId: d.templateId }), ...(d?.tournamentId && { tournamentId: d.tournamentId }) | ✓ |
| 219 | `src/domains/tournament_createTournament/scheduler/EnqueueTournamentTasksByScheduler.ts:21` | `enqueueTournamentTasksByScheduler` | `runEnqueueSchedulerTask` | 非FC | (なし) | ✓ |
| 220 | `src/domains/tournament_createTournament/scheduler/GenerateRecurringTournamentsByScheduler.ts:21` | `generateRecurringTournamentsByScheduler` |  | 非FC | (なし) | ✓ |
| 221 | `src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts:241` | `runEnqueueTournamentTasks` | `enqueueTournamentTask` | 非FC | tournamentId, taskType, blindStructureId, storeId | ✓ |
| 222 | `src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts:383` | `runEnqueueTournamentTasks` | `processTournamentBatchItem` | 非FC | tournamentId, id | ✓ |
| 223 | `src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts:98` | `runGenerateRecurringTournaments` | `validateRecurringStoreTenant` | 非FC | recurrenceId | ✓ |
| 224 | `src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts:136` | `runGenerateRecurringTournaments` | `parseRecurrenceInterval` | catch 外 | recurrenceId, intervalRaw, storeId, tenantId | ✓ |
| 225 | `src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts:151` | `runGenerateRecurringTournaments` | `parseRecurrenceIntervalWrongType` | catch 外 | recurrenceId, intervalRawType, storeId, tenantId | ✓ |
| 226 | `src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts:293` | `runGenerateRecurringTournaments` | `enqueueAfterGenerate` | 非FC | totalGenerated | ✓ |
| 227 | `src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts:313` | `runGenerateRecurringTournaments` | `runGenerateRecurringTournamentsOuterCatch` | 非FC | (なし) | ✓ |
| 228 | `src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts:601` | `createScheduledTournamentFromRecurrence` |  | 非FC | recurrenceId, storeId, templateId, tenantId | ✓ |
| 229 | `src/domains/tournament_createTournament/to_be_deleted/getScheduledTournaments_to_be_deleted.ts:276` | `getScheduledTournaments` |  | 非FC | ...(request.auth?.uid && { callerUid: request.auth.uid }), ...(request.data?.period && { period: request.data.period }) | ✓ |
| 230 | `src/domains/user/callables/createUserAccount.ts:116` | `createUserAccount` |  | 非FC | loginId, uid, resolvedLoginId | ✓ |
| 231 | `src/domains/user/callables/generateQRCode.ts:143` | `generateQRCode` | `transaction` | 非FC | loginId, uid | ✓ |
| 232 | `src/domains/user/callables/generateQRCode.ts:162` | `generateQRCode` | `generateQRCodeOuterCatch` | 非FC | uid, loginId | ✓ |
| 233 | `src/domains/user/callables/getFirebaseCustomToken.ts:71` | `getFirebaseCustomToken` |  | 非FC | (なし) | ✓ |
| 234 | `src/domains/user/callables/getUserStatus.ts:59` | `getUserStatus` |  | 非FC | uid | ✓ |
| 235 | `src/domains/user/callables/manualCheckIn.ts:176` | `manualCheckIn` |  | 非FC | callerUid, deviceId, billId, idempotencyKey, loginId, userId, targetUid | ✓ |
| 236 | `src/domains/user/callables/processVisitByQR.ts:220` | `processVisitByQR` |  | 非FC | callerUid, deviceId, valid, billId, idempotencyKey, userId, loginId | ✓ |
| 237 | `src/domains/user/callables/verifyQRCode.ts:76` | `verifyQRCode` |  | 非FC | isValid, callerUid | ✓ |
| 238 | `src/domains/user/services/lineAuth.ts:31` | `verifyLineIdToken` |  | 非FC | (なし) | ✓ |
| 239 | `src/domains/user/services/qrCodeUtils.ts:132` | `saveQRCodeToStorage` |  | 非FC | uid, type | ✓ |
| 240 | `src/domains/user/services/qrCodeUtils.ts:169` | `deleteOldQRCodeFiles` |  | 非FC | uid | ✓ |
| 241 | `src/domains/webhook/callables/ensureStaffRichMenu.ts:44` | `ensureStaffRichMenu` |  | 非FC | uid | ✓ |
| 242 | `src/domains/webhook/callables/lineWebhook.ts:68` | `lineWebhook` | `token` | catch 外 | (なし) |  |
| 243 | `src/domains/webhook/callables/lineWebhook.ts:130` | `lineWebhook` | `replyPostbackPlanDisabledNotOk` | catch 外 | status, lineApiErrorPreview, lineUserId, requestId |  |
| 244 | `src/domains/webhook/callables/lineWebhook.ts:141` | `lineWebhook` | `replyPostbackPlanDisabledCatch` | 非FC | lineUserId, requestId | ✓ |
| 245 | `src/domains/webhook/callables/lineWebhook.ts:195` | `lineWebhook` | `replyPostbackDeclineConfirmNotOk` | catch 外 | status, lineApiErrorPreview, lineUserId, requestId |  |
| 246 | `src/domains/webhook/callables/lineWebhook.ts:206` | `lineWebhook` | `replyPostbackDeclineConfirmCatch` | 非FC | lineUserId, requestId | ✓ |
| 247 | `src/domains/webhook/callables/lineWebhook.ts:226` | `lineWebhook` | `postback` | 非FC | lineUserId, postbackDataPreview | ✓ |
| 248 | `src/domains/webhook/callables/lineWebhook.ts:264` | `lineWebhook` | `followOrUnblock` | 非FC | lineUserId | ✓ |
| 249 | `src/domains/webhook/callables/lineWebhook.ts:277` | `lineWebhook` | `handler` | 非FC | (なし) | ✓ |
| 250 | `src/domains/webhook/services/lineMessaging.ts:25` | `sendLinePushMessage` | `token` | catch 外 | userId |  |
| 251 | `src/domains/webhook/services/lineMessaging.ts:34` | `sendLinePushMessage` | `validate` | catch 外 | userId, hasMessage |  |
| 252 | `src/domains/webhook/services/lineMessaging.ts:62` | `sendLinePushMessage` | `pushResponseNotOk` | catch 外 | userId, status, lineApiErrorPreview |  |
| 253 | `src/domains/webhook/services/lineMessaging.ts:82` | `sendLinePushMessage` | `pushCatch` | 非FC | userId | ✓ |
| 254 | `src/domains/webhook/services/lineMessaging.ts:108` | `formatDateToJapanese` |  | 非FC | dateString | ✓ |
| 255 | `src/domains/webhook/services/lineRichMenu.ts:41` | `linkStaffRichMenu` | `linkStaffRichMenuHttpFail` | catch 外 | lineUserId, richMenuId, status, lineApiErrorPreview |  |
| 256 | `src/domains/webhook/services/lineRichMenu.ts:61` | `linkStaffRichMenu` | `linkStaffRichMenuCatch` | 非FC | lineUserId | ✓ |
| 257 | `src/domains/webhook/services/lineRichMenu.ts:110` | `linkUserRichMenu` | `linkUserRichMenuHttpFail` | catch 外 | lineUserId, richMenuId, status, lineApiErrorPreview |  |
| 258 | `src/domains/webhook/services/lineRichMenu.ts:130` | `linkUserRichMenu` | `linkUserRichMenuCatch` | 非FC | lineUserId | ✓ |
| 259 | `src/shared/businessHours/scheduler/scheduleGenerateNextYearBusinessHours.ts:89` | `scheduleGenerateNextYearBusinessHours` | `generateMonthFailed` | 非FC | (なし) | ✓ |
| 260 | `src/shared/businessHours/scheduler/scheduleGenerateNextYearBusinessHours.ts:100` | `scheduleGenerateNextYearBusinessHours` | `taskOuterCatch` | 非FC | (なし) | ✓ |
| 261 | `src/shared/config/configLoader.ts:106` | `getStoreConfig` | `config_read` | 非FC | code, reason, message | ✓ |
| 262 | `src/shared/config/payrollConfigLoader.ts:102` | `getPayrollConfig` | `config_read` | 非FC | code, reason, message | ✓ |
| 263 | `src/shared/config/schedulerConfigLoader.ts:219` | `getSchedulerConfig` | `config_read` | 非FC | code, reason, message | ✓ |
| 264 | `src/shared/devices/callables/registerDevice.ts:84` | `registerDevice` |  | 非FC | installationId, uid | ✓ |
| 265 | `src/shared/devices/callables/updateDeviceOptions.ts:100` | `updateDeviceOptions` | `updateDeviceOptionsCatch` | 非FC | callerUid, deviceId | ✓ |
| 266 | `src/shared/devices/callables/updateDeviceRole.ts:72` | `updateDeviceRole` | `updateDeviceRoleCatch` | 非FC | callerUid, deviceId | ✓ |
| 267 | `src/shared/http/controlHook.ts:98` | `controlHookHttp` | `validateControlHookRequest` | 非FC | (なし) | ✓ |
| 268 | `src/shared/http/controlHook.ts:300` | `controlHookHttp` | `executeNewPayloadTask` | 非FC | (なし) | ✓ |
| 269 | `src/shared/http/controlHook.ts:439` | `controlHookHttp` | `executeLegacyPayloadTask` | 非FC | (なし) | ✓ |

## 2. FC ブランチの詳細（到達しうる errorKey とマージ後キー）

各 FC ブランチについて、**同一関数内の `throw new FunctionCustomError`** を列挙する。errorKey ごとにマージ後キー（近似）を示す。

| # | ソース | functionEntry / operation | 明示 context | errorKey (throw 行) | throw 時 context キー | マージ後 context キー候補（近似） |
|---|--------|---------------------------|---------------|---------------------|---------------------|---------------------------------|
| 1 | `src/domains/bills/callables/accounting.ts:532` | `completeAccounting` / `completeAccountingCatch` | callerUid, deviceId, billId, userId | `ACCOUNTING_NOT_STARTED` (L435) | billId, legacy | billId, legacy, callerUid, deviceId, userId |
| 2 | `src/domains/bills/callables/accounting.ts:532` | `completeAccounting` / `completeAccountingCatch` | callerUid, deviceId, billId, userId | `ACCOUNTING_ALREADY_SETTLED` (L444) | billId, legacy, currentStatus | billId, legacy, currentStatus, callerUid, deviceId, userId |
| 3 | `src/domains/bills/callables/accounting.ts:694` | `completeAccountingV2` / `completeAccountingV2Catch` | callerUid, billId, userId, deviceId | `ACCOUNTING_NOT_STARTED` (L606) | billId | billId, callerUid, userId, deviceId |
| 4 | `src/domains/bills/callables/accounting.ts:694` | `completeAccountingV2` / `completeAccountingV2Catch` | callerUid, billId, userId, deviceId | `ACCOUNTING_ALREADY_SETTLED` (L615) | billId, currentStatus | billId, currentStatus, callerUid, userId, deviceId |
| 5 | `src/domains/bills/callables/cancelAccounting.ts:120` | `cancelAccounting` / `cancelAccountingCatch` | callerUid, deviceId, billId | `ACCOUNTING_INVALID_STATE` (L78) | billId, currentStatus, allowedStatuses, op | billId, currentStatus, allowedStatuses, op, callerUid, deviceId |
| 6 | `src/domains/bills/callables/updateActiveBill.ts:340` | `updateActiveBill` / `updateActiveBillCatch` | op, billId, result, callerUid, deviceId, currentStatus, reason, templateId, templateIds | `ACCOUNTING_INVALID_STATE` (L102) | billId, currentStatus, reason | billId, currentStatus, reason, op, result, callerUid, deviceId, templateId, templateIds |
| 7 | `src/domains/bills/callables/updateActiveBill.ts:340` | `updateActiveBill` / `updateActiveBillCatch` | op, billId, result, callerUid, deviceId, currentStatus, reason, templateId, templateIds | `ACCOUNTING_ALREADY_STARTED` (L110) | billId, reason | billId, reason, op, result, callerUid, deviceId, currentStatus, templateId, templateIds |
| 8 | `src/domains/bills/callables/verifyPaymentSplit.ts:169` | `verifyPaymentSplit` / `verifyPaymentSplitCatch` | billId, userId | (同関数内の FC throw 検出なし) | — | billId, userId |
| 9 | `src/domains/bills/repos/createBillWithActiveStay.ts:248` | `createBillWithActiveStay` / `operationForCreateBillKey(error.errorKey)` | billId, userId, idempKey, result, requestHash8, idempotencyKeyFull, idempotencyRef | `ACCOUNTING_IDEMPOTENCY_MISMATCH` (L118) | billId | billId, userId, idempKey, result, requestHash8, idempotencyKeyFull, idempotencyRef |
| 10 | `src/domains/bills/repos/createBillWithActiveStay.ts:248` | `createBillWithActiveStay` / `operationForCreateBillKey(error.errorKey)` | billId, userId, idempKey, result, requestHash8, idempotencyKeyFull, idempotencyRef | `ACCOUNTING_ACTIVE_STAY_CONFLICT` (L151) | userId, billId | userId, billId, idempKey, result, requestHash8, idempotencyKeyFull, idempotencyRef |
| 11 | `src/domains/bills/repos/startAccounting.ts:238` | `startAccounting` / `operationForStartAccountingKey(error.errorKey)` | billId, idempKey, result, idempotencyRef | `ACCOUNTING_IDEMPOTENCY_MISMATCH` (L84) | expectedHash8, gotHash8 | expectedHash8, gotHash8, billId, idempKey, result, idempotencyRef |
| 12 | `src/domains/bills/repos/startAccounting.ts:238` | `startAccounting` / `operationForStartAccountingKey(error.errorKey)` | billId, idempKey, result, idempotencyRef | `ACCOUNTING_INVALID_STATE` (L137) | currentStatus, allowedStatuses | currentStatus, allowedStatuses, billId, idempKey, result, idempotencyRef |
| 13 | `src/domains/bills/repos/startAccounting.ts:238` | `startAccounting` / `operationForStartAccountingKey(error.errorKey)` | billId, idempKey, result, idempotencyRef | `ACCOUNTING_ALREADY_STARTED` (L146) | billId | billId, idempKey, result, idempotencyRef |
| 14 | `src/domains/itemOrder/callables/placeOrder.ts:205` | `placeOrder` / `placeOrderCatch` | callerUid, deviceId, billId, businessDate, idempotencyKey, userId | (同関数内の FC throw 検出なし) | — | callerUid, deviceId, billId, businessDate, idempotencyKey, userId |
| 15 | `src/domains/itemOrder/callables/placeOrderByUser.ts:188` | `placeOrderByUser` / `placeOrderCatch` | userId, billId, orderDocId, activeBillId, idempotencyKey, lastIdempotencyKey, sessionNonce | (同関数内の FC throw 検出なし) | — | userId, billId, orderDocId, activeBillId, idempotencyKey, lastIdempotencyKey, sessionNonce |
| 16 | `src/domains/storeMeta/callables/closeStoreTerminal.ts:149` | `closeStoreTerminal` / `closeTerminalPreflight` | callerUid, currentBusinessDateKey, phase, status | `STORE_STATE_DOC_MISSING` (L120) | phase | phase, callerUid, currentBusinessDateKey, status |
| 17 | `src/domains/storeMeta/callables/closeStoreTerminal.ts:149` | `closeStoreTerminal` / `closeTerminalPreflight` | callerUid, currentBusinessDateKey, phase, status | `STORE_NOT_RUNNING` (L132) | status, phase | status, phase, callerUid, currentBusinessDateKey |
| 18 | `src/domains/storeMeta/callables/closeStoreTerminal.ts:149` | `closeStoreTerminal` / `closeTerminalPreflight` | callerUid, currentBusinessDateKey, phase, status | `STORE_BUSINESS_DATE_UNAVAILABLE` (L139) | status, phase | status, phase, callerUid, currentBusinessDateKey |
| 19 | `src/domains/storeMeta/callables/closeStoreTerminal.ts:180` | `closeStoreTerminal` / `acquireProcessingLease` | callerUid, requestRunId, runId, currentBusinessDateKey | `STORE_STATE_DOC_MISSING` (L120) | phase | phase, callerUid, requestRunId, runId, currentBusinessDateKey |
| 20 | `src/domains/storeMeta/callables/closeStoreTerminal.ts:180` | `closeStoreTerminal` / `acquireProcessingLease` | callerUid, requestRunId, runId, currentBusinessDateKey | `STORE_NOT_RUNNING` (L132) | status, phase | status, phase, callerUid, requestRunId, runId, currentBusinessDateKey |
| 21 | `src/domains/storeMeta/callables/closeStoreTerminal.ts:180` | `closeStoreTerminal` / `acquireProcessingLease` | callerUid, requestRunId, runId, currentBusinessDateKey | `STORE_BUSINESS_DATE_UNAVAILABLE` (L139) | status, phase | status, phase, callerUid, requestRunId, runId, currentBusinessDateKey |
| 22 | `src/domains/storeMeta/callables/continueBusinessTerminal.ts:363` | `continueBusinessTerminal` / `continueBusinessTerminalFunctionCustom` | callerUid, intendedBusinessDateKey, hours, idempotencyKey, continueLogId, closeTaskId, projectId, phase, status | `STORE_STATE_DOC_MISSING` (L118) | phase | phase, callerUid, intendedBusinessDateKey, hours, idempotencyKey, continueLogId, closeTaskId, projectId, status |
| 23 | `src/domains/storeMeta/callables/continueBusinessTerminal.ts:363` | `continueBusinessTerminal` / `continueBusinessTerminalFunctionCustom` | callerUid, intendedBusinessDateKey, hours, idempotencyKey, continueLogId, closeTaskId, projectId, phase, status | `STORE_NOT_RUNNING` (L128) | status, phase | status, phase, callerUid, intendedBusinessDateKey, hours, idempotencyKey, continueLogId, closeTaskId, projectId |
| 24 | `src/domains/storeMeta/callables/continueBusinessTerminal.ts:363` | `continueBusinessTerminal` / `continueBusinessTerminalFunctionCustom` | callerUid, intendedBusinessDateKey, hours, idempotencyKey, continueLogId, closeTaskId, projectId, phase, status | `STORE_STATE_DOC_MISSING` (L156) | phase | phase, callerUid, intendedBusinessDateKey, hours, idempotencyKey, continueLogId, closeTaskId, projectId, status |
| 25 | `src/domains/storeMeta/callables/openStoreTerminal.ts:50` | `openStoreTerminal` / `openTerminalPreflight` | callerUid | `STORE_STATE_DOC_MISSING` (L31) | phase | phase, callerUid |
| 26 | `src/domains/storeMeta/callables/openStoreTerminal.ts:50` | `openStoreTerminal` / `openTerminalPreflight` | callerUid | `STORE_INVALID_STATE` (L42) | status, phase | status, phase, callerUid |
| 27 | `src/domains/storeMeta/callables/openStoreTerminal.ts:50` | `openStoreTerminal` / `openTerminalPreflight` | callerUid | `STORE_INVALID_STATE` (L142) | status, phase | status, phase, callerUid |
| 28 | `src/domains/storeMeta/callables/openStoreTerminal.ts:82` | `openStoreTerminal` / `acquireProcessingLease` | callerUid, businessDateKey, requestRunId, runId | `STORE_STATE_DOC_MISSING` (L31) | phase | phase, callerUid, businessDateKey, requestRunId, runId |
| 29 | `src/domains/storeMeta/callables/openStoreTerminal.ts:82` | `openStoreTerminal` / `acquireProcessingLease` | callerUid, businessDateKey, requestRunId, runId | `STORE_INVALID_STATE` (L42) | status, phase | status, phase, callerUid, businessDateKey, requestRunId, runId |
| 30 | `src/domains/storeMeta/callables/openStoreTerminal.ts:82` | `openStoreTerminal` / `acquireProcessingLease` | callerUid, businessDateKey, requestRunId, runId | `STORE_INVALID_STATE` (L142) | status, phase | status, phase, callerUid, businessDateKey, requestRunId, runId |
| 31 | `src/domains/storeMeta/services/applyCloseSnapshot.ts:217` | `applyCloseSnapshot` / `getClosedBusinessDate` | callerUid, amountsByBillId | (同関数内の FC throw 検出なし) | — | callerUid, amountsByBillId |
| 32 | `src/domains/storeMeta/services/finalizeUnsettledBillAfterAccounting.ts:76` | `finalizeUnsettledBillAfterAccounting` | callerUid, billId, userId, op | `ACCOUNTING_INVALID_STATE` (L48) | billId, op | billId, op, callerUid, userId |
| 33 | `src/domains/tournament_activeTournament/callables/addTableToTournament.ts:142` | `addTableToTournament` / `addTableToTournamentCatch` | (なし) | `TOURNAMENT_INVALID_STATE` (L58) | tournamentId, tableId, reason | tournamentId, tableId, reason |
| 34 | `src/domains/tournament_activeTournament/callables/addTableToTournament.ts:142` | `addTableToTournament` / `addTableToTournamentCatch` | (なし) | `TOURNAMENT_INVALID_STATE` (L67) | tournamentId, tableId, status, reason | tournamentId, tableId, status, reason |
| 35 | `src/domains/tournament_activeTournament/callables/api.pause.ts:126` | `pauseTournament` / `pauseTournamentCatch` | (なし) | `TOURNAMENT_INVALID_STATE` (L66) | tournamentId, phase, field | tournamentId, phase, field |
| 36 | `src/domains/tournament_activeTournament/callables/api.pause.ts:126` | `pauseTournament` / `pauseTournamentCatch` | (なし) | `TOURNAMENT_INVALID_STATE` (L74) | tournamentId, phase, field | tournamentId, phase, field |
| 37 | `src/domains/tournament_activeTournament/callables/api.pause.ts:126` | `pauseTournament` / `pauseTournamentCatch` | (なし) | `TOURNAMENT_ALREADY_PAUSED` (L83) | tournamentId | tournamentId |
| 38 | `src/domains/tournament_activeTournament/callables/api.resume.ts:135` | `resumeTournament` / `resumeTournamentCatch` | (なし) | `TOURNAMENT_INVALID_STATE` (L66) | tournamentId, phase, field | tournamentId, phase, field |
| 39 | `src/domains/tournament_activeTournament/callables/api.resume.ts:135` | `resumeTournament` / `resumeTournamentCatch` | (なし) | `TOURNAMENT_INVALID_STATE` (L74) | tournamentId, phase, field | tournamentId, phase, field |
| 40 | `src/domains/tournament_activeTournament/callables/api.resume.ts:135` | `resumeTournament` / `resumeTournamentCatch` | (なし) | `TOURNAMENT_NOT_PAUSED` (L83) | tournamentId | tournamentId |
| 41 | `src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts:270` | `assignSeatToPlayer` / `assignSeatToPlayerCatch` | (なし) | `TOURNAMENT_INVALID_STATE` (L64) | tournamentId, tableId, reason | tournamentId, tableId, reason |
| 42 | `src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts:270` | `assignSeatToPlayer` / `assignSeatToPlayerCatch` | (なし) | `TOURNAMENT_INVALID_STATE` (L73) | tournamentId, tableId, reason | tournamentId, tableId, reason |
| 43 | `src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts:270` | `assignSeatToPlayer` / `assignSeatToPlayerCatch` | (なし) | `TOURNAMENT_INVALID_STATE` (L84) | tournamentId, tableId, seatNumber, reason | tournamentId, tableId, seatNumber, reason |
| 44 | `src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts:270` | `assignSeatToPlayer` / `assignSeatToPlayerCatch` | (なし) | `TOURNAMENT_INVALID_STATE` (L105) | tournamentId, userId, reason | tournamentId, userId, reason |
| 45 | `src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts:270` | `assignSeatToPlayer` / `assignSeatToPlayerCatch` | (なし) | `TOURNAMENT_INVALID_STATE` (L116) | tournamentId, userId, reason | tournamentId, userId, reason |
| 46 | `src/domains/tournament_activeTournament/callables/createTemporaryTable.ts:128` | `createTemporaryTable` / `createTemporaryTableCatch` | (なし) | `TOURNAMENT_INVALID_STATE` (L53) | tableName, reason | tableName, reason |
| 47 | `src/domains/tournament_activeTournament/callables/getRankingData.ts:79` | `getRankingData` / `getRankingDataCatch` | tournamentId | `TOURNAMENT_PRIZE_NOT_CONFIRMED` (L33) | tournamentId | tournamentId |
| 48 | `src/domains/tournament_activeTournament/callables/removeTableFromTournament.ts:117` | `removeTableFromTournament` / `removeTableFromTournamentCatch` | (なし) | `TOURNAMENT_INVALID_STATE` (L62) | tournamentId, tableId, reason | tournamentId, tableId, reason |
| 49 | `src/domains/tournament_activeTournament/callables/removeTableFromTournament.ts:117` | `removeTableFromTournament` / `removeTableFromTournamentCatch` | (なし) | `TOURNAMENT_INVALID_STATE` (L78) | tournamentId, tableId, reason | tournamentId, tableId, reason |
| 50 | `src/domains/tournament_activeTournament/callables/removeTableFromTournament.ts:117` | `removeTableFromTournament` / `removeTableFromTournamentCatch` | (なし) | `TOURNAMENT_INVALID_STATE` (L86) | tournamentId, tableId, reason | tournamentId, tableId, reason |
| 51 | `src/domains/tournament_activeTournament/callables/reseatAllPlayers.ts:300` | `reseatAllPlayers` / `reseatAllPlayersCatch` | (なし) | `TOURNAMENT_INVALID_STATE` (L88) | tournamentId, userId, reason | tournamentId, userId, reason |
| 52 | `src/domains/tournament_activeTournament/callables/reseatAllPlayers.ts:300` | `reseatAllPlayers` / `reseatAllPlayersCatch` | (なし) | `TOURNAMENT_INVALID_STATE` (L99) | tournamentId, userId, reason | tournamentId, userId, reason |
| 53 | `src/domains/tournament_createTournament/callables/createScheduledTournament.ts:422` | `createScheduledTournament` / `createScheduledTournamentCatch` | (なし) | `TOURNAMENT_SCHEDULE_NO_BUSINESS_DAY` (L83) | startAt, op | startAt, op |
| 54 | `src/domains/tournament_createTournament/callables/createScheduledTournament.ts:422` | `createScheduledTournament` / `createScheduledTournamentCatch` | (なし) | `TOURNAMENT_SCHEDULE_AMBIGUOUS` (L94) | candidates, startAt, op | candidates, startAt, op |
| 55 | `src/domains/tournament_createTournament/callables/createScheduledTournament.ts:422` | `createScheduledTournament` / `createScheduledTournamentCatch` | (なし) | `TOURNAMENT_SCHEDULE_DUPLICATE_TEMPLATE_SAME_DAY` (L123) | templateId, businessDate, op | templateId, businessDate, op |
| 56 | `src/domains/tournament_createTournament/callables/createScheduledTournament.ts:422` | `createScheduledTournament` / `createScheduledTournamentCatch` | (なし) | `TOURNAMENT_TEMPLATE_ARCHIVED` (L163) | templateId, phase | templateId, phase |
| 57 | `src/domains/tournament_createTournament/callables/createTournamentRecurrence.ts:158` | `createTournamentRecurrence` / `createTournamentRecurrenceCatch` | (なし) | (同関数内の FC throw 検出なし) | — | (なし) |
| 58 | `src/domains/tournament_createTournament/callables/enqueueTournamentTasks.ts:41` | `enqueueTournamentTasks` / `enqueueTournamentTasksCatch` | deviceId, callerUid | (同関数内の FC throw 検出なし) | — | deviceId, callerUid |
| 59 | `src/domains/tournament_createTournament/callables/updateScheduledTournamentStartAt.ts:145` | `updateScheduledTournamentStartAt` / `validateStartAtUpdatePreconditions` | deviceId, callerUid | `TOURNAMENT_INVALID_STATE` (L62) | tournamentId, status, op | tournamentId, status, op, deviceId, callerUid |
| 60 | `src/domains/tournament_createTournament/callables/updateScheduledTournamentStartAt.ts:145` | `updateScheduledTournamentStartAt` / `validateStartAtUpdatePreconditions` | deviceId, callerUid | `TOURNAMENT_INVALID_STATE` (L69) | tournamentId, op | tournamentId, op, deviceId, callerUid |
| 61 | `src/domains/tournament_createTournament/callables/updateScheduledTournamentStartAt.ts:145` | `updateScheduledTournamentStartAt` / `validateStartAtUpdatePreconditions` | deviceId, callerUid | `TOURNAMENT_SCHEDULE_NO_BUSINESS_DAY` (L84) | startAt, tournamentId, op | startAt, tournamentId, op, deviceId, callerUid |
| 62 | `src/domains/tournament_createTournament/callables/updateScheduledTournamentStartAt.ts:145` | `updateScheduledTournamentStartAt` / `validateStartAtUpdatePreconditions` | deviceId, callerUid | `TOURNAMENT_SCHEDULE_AMBIGUOUS` (L94) | candidates, startAt, tournamentId, op | candidates, startAt, tournamentId, op, deviceId, callerUid |
| 63 | `src/domains/tournament_createTournament/callables/updateScheduledTournamentStatus.ts:142` | `updateScheduledTournamentStatus` / `validateStatusTransition` | deviceId, callerUid | `TOURNAMENT_INVALID_STATE` (L57) | tournamentId, op | tournamentId, op, deviceId, callerUid |
| 64 | `src/domains/tournament_createTournament/callables/updateScheduledTournamentStatus.ts:142` | `updateScheduledTournamentStatus` / `validateStatusTransition` | deviceId, callerUid | `TOURNAMENT_INVALID_STATE` (L69) | tournamentId, currentStatus, op | tournamentId, currentStatus, op, deviceId, callerUid |
| 65 | `src/domains/tournament_createTournament/callables/updateScheduledTournamentStatus.ts:142` | `updateScheduledTournamentStatus` / `validateStatusTransition` | deviceId, callerUid | `TOURNAMENT_INVALID_STATE` (L92) | tournamentId, currentStatus, op | tournamentId, currentStatus, op, deviceId, callerUid |
| 66 | `src/domains/tournament_createTournament/callables/updateScheduledTournamentStatus.ts:142` | `updateScheduledTournamentStatus` / `validateStatusTransition` | deviceId, callerUid | `TOURNAMENT_INVALID_STATE` (L105) | tournamentId, op | tournamentId, op, deviceId, callerUid |
| 67 | `src/domains/tournament_createTournament/callables/updateScheduledTournamentStatus.ts:142` | `updateScheduledTournamentStatus` / `validateStatusTransition` | deviceId, callerUid | `TOURNAMENT_INVALID_STATE` (L112) | tournamentId, regEndAt, op | tournamentId, regEndAt, op, deviceId, callerUid |

## 3. 非 FC / catch 外 の詳細（呼び出しごとのキー）

非 FC ブランチおよび catch 外の `logOpsError`（`cause` が FC のときのみ FC の `context` が併記される可能性がある）。
`cause` 経由で FC のキーが載るケースは **「同一関数内の FC throw」を参考値**として右側に示す（非 FC 側から到達するとは限らない）。

| # | ソース | functionEntry / operation | 明示 context | cause | 同関数の FC throw（参考） |
|---|--------|---------------------------|---------------|-------|---------------------------|
| 1 | `src/domains/analytics/callables/migrateSettledBillsForBusinessDay.ts:103` | `migrateSettledBillsForBusinessDay` / `runMigratePerBill` | billId, businessDate | ✓ | — |
| 2 | `src/domains/analytics/callables/migrateSettledBillsForBusinessDay.ts:142` | `migrateSettledBillsForBusinessDay` / `callable` | businessDate | ✓ | — |
| 3 | `src/domains/attendance/callables/approveAttendanceCorrectionRequest.ts:125` | `approveAttendanceCorrectionRequest` / `attendanceRecordUpdate` | requestId, adminUserId | ✓ | — |
| 4 | `src/domains/attendance/callables/approveAttendanceCorrectionRequest.ts:142` | `approveAttendanceCorrectionRequest` / `approveRequestOuterCatch` | requestId, adminUserId | ✓ | — |
| 5 | `src/domains/attendance/callables/checkExistingCorrectionRequest.ts:76` | `checkExistingCorrectionRequest` | staffId, date | ✓ | — |
| 6 | `src/domains/attendance/callables/clockIn.ts:180` | `clockIn` | callerUid, staffId, businessDate, deviceId | ✓ | — |
| 7 | `src/domains/attendance/callables/clockOut.ts:211` | `clockOut` | callerUid, staffId, docId, businessDate, deviceId | ✓ | — |
| 8 | `src/domains/attendance/callables/createAttendance.ts:181` | `createAttendance` | callerUid, staffId, deviceId | ✓ | — |
| 9 | `src/domains/attendance/callables/createAttendanceCorrectionRequest.ts:100` | `createAttendanceCorrectionRequest` | staffId, attendanceId | ✓ | — |
| 10 | `src/domains/attendance/callables/createManualClockInRecord.ts:178` | `createManualClockInRecord` | callerUid, staffId, businessDate, deviceId | ✓ | — |
| 11 | `src/domains/attendance/callables/endBreak.ts:172` | `endBreak` | callerUid, attendanceId, breakId, deviceId | ✓ | — |
| 12 | `src/domains/attendance/callables/executeMonthlyPayroll.ts:78` | `executeMonthlyPayroll` / `loadPayrollConfig` | paymentPeriodKey, attendanceIdsCount, callerUid, deviceId | ✓ | — |
| 13 | `src/domains/attendance/callables/executeMonthlyPayroll.ts:196` | `executeMonthlyPayroll` / `taskDispatch` | runId, paymentPeriodKey, callerUid, deviceId | ✓ | — |
| 14 | `src/domains/attendance/callables/getAllStaffAttendance.ts:180` | `getAllStaffAttendance` | month, year, startDay, endDay | ✓ | — |
| 15 | `src/domains/attendance/callables/getAttendanceCorrectionRequests.ts:83` | `getAttendanceCorrectionRequests` | status, limit | ✓ | — |
| 16 | `src/domains/attendance/callables/getPayrollCandidates.ts:207` | `getPayrollCandidates` / `loadPayrollConfig` | paymentPeriodKey, callerUid, deviceId | ✓ | — |
| 17 | `src/domains/attendance/callables/getPayrollData.ts:114` | `getPayrollData` | callerUid, deviceId | ✓ | — |
| 18 | `src/domains/attendance/callables/getStaffAttendance.ts:92` | `getStaffAttendance` | staffId, year, month | ✓ | — |
| 19 | `src/domains/attendance/callables/getStaffListForAttendance.ts:216` | `getStaffListForAttendance` | isClockInMode, attendanceDate, shiftDate | ✓ | — |
| 20 | `src/domains/attendance/callables/rejectAttendanceCorrectionRequest.ts:50` | `rejectAttendanceCorrectionRequest` | requestId, adminUserId | ✓ | — |
| 21 | `src/domains/attendance/callables/startBreak.ts:146` | `startBreak` | callerUid, attendanceId, deviceId | ✓ | — |
| 22 | `src/domains/attendance/callables/updateAttendance.ts:244` | `updateAttendance` | callerUid, attendanceId, breakId, correlationBreakId, deviceId | ✓ | — |
| 23 | `src/domains/attendance/callables/updateManualClockOutRecord.ts:186` | `updateManualClockOutRecord` | callerUid, docId, deviceId | ✓ | — |
| 24 | `src/domains/attendance/helpers/payrollNotificationHelper.ts:63` | `createPayrollNotification` | triggerType |  | — |
| 25 | `src/domains/attendance/scheduler/payrollNotificationScheduler.ts:75` | `payrollNotificationScheduler` / `enqueue` | targetDate, ...(notificationHour !== undefined && {notificationHour}), ...(scheduleTimeUtc !== undefined && {scheduleTimeUtc}) | ✓ | — |
| 26 | `src/domains/attendance/tasks/finalizePayrollRun.ts:42` | `finalizePayrollRun` | runId, paymentPeriodKey |  | — |
| 27 | `src/domains/attendance/tasks/processStaffPayroll.ts:43` | `processStaffPayroll` / `runNotFound` | runId, paymentPeriodKey |  | — |
| 28 | `src/domains/attendance/tasks/processStaffPayroll.ts:60` | `processStaffPayroll` / `staffResultNotFound` | runId, paymentPeriodKey, staffId |  | — |
| 29 | `src/domains/attendance/tasks/processStaffPayroll.ts:301` | `processStaffPayroll` / `processStaffPayrollCatch` | runId, paymentPeriodKey, staffId | ✓ | — |
| 30 | `src/domains/attendance/tasks/processStaffPayroll.ts:350` | `processStaffPayroll` / `failureStatusUpdate` | runId, paymentPeriodKey, staffId | ✓ | — |
| 31 | `src/domains/bills/callables/accounting.ts:365` | `startAccounting` / `startAccountingCallableCatch` | callerUid, deviceId, billId, idempotencyKey, userId | ✓ | ACCOUNTING_PAYMENT_TOTAL_MISMATCH[billId,totalPaid,totalExpected] / ACCOUNTING_INSUFFICIENT_BALANCE[billId,userId,fieldName,currentBalance,required] |
| 32 | `src/domains/bills/callables/accounting.ts:544` | `completeAccounting` / `completeAccountingGenericCatch` | callerUid, deviceId, billId, userId | ✓ | ACCOUNTING_NOT_STARTED[billId,legacy] / ACCOUNTING_ALREADY_SETTLED[billId,legacy,currentStatus] |
| 33 | `src/domains/bills/callables/accounting.ts:706` | `completeAccountingV2` / `completeAccountingV2GenericCatch` | callerUid, billId, userId, deviceId | ✓ | ACCOUNTING_NOT_STARTED[billId] / ACCOUNTING_ALREADY_SETTLED[billId,currentStatus] |
| 34 | `src/domains/bills/callables/appendExtra.ts:49` | `appendExtraCallable` | uid, billId, deviceId | ✓ | — |
| 35 | `src/domains/bills/callables/cancelAccounting.ts:132` | `cancelAccounting` / `cancelAccountingGenericCatch` | op, code, callerUid, deviceId, billId | ✓ | ACCOUNTING_INVALID_STATE[billId,currentStatus,allowedStatuses,op] |
| 36 | `src/domains/bills/callables/getBillPreviewTotals.ts:183` | `getBillPreviewTotals` / `previewTotalsCatch` | billId, businessDate | ✓ | — |
| 37 | `src/domains/bills/callables/getOpenBills.ts:42` | `getOpenBills` | businessDate | ✓ | — |
| 38 | `src/domains/bills/callables/migrateTodaysBills.ts:84` | `migrateTodaysBillsAccountingFields` | callerUid | ✓ | — |
| 39 | `src/domains/bills/callables/refundProcessing.ts:94` | `processRefund` | op, code, callerUid, deviceId, billId, idempotencyKey | ✓ | — |
| 40 | `src/domains/bills/callables/refundProcessing.ts:153` | `getRefundHistory` | op, code, callerUid, deviceId | ✓ | — |
| 41 | `src/domains/bills/callables/updateAccounting.ts:134` | `updateAccounting` | op, code, callerUid, deviceId, billId, idempotencyKey, eventType | ✓ | — |
| 42 | `src/domains/bills/callables/updateActiveBill.ts:371` | `updateActiveBill` / `updateActiveBillGenericCatch` | op, billId, result, code, callerUid, deviceId, templateId, templateIds | ✓ | ACCOUNTING_INVALID_STATE[billId,currentStatus,reason] / ACCOUNTING_ALREADY_STARTED[billId,reason] |
| 43 | `src/domains/bills/callables/verifyPaymentSplit.ts:181` | `verifyPaymentSplit` / `verifyPaymentSplitGenericCatch` | billId, userId | ✓ | — |
| 44 | `src/domains/bills/repos/appendExtra.ts:260` | `appendExtra` | op, billId, idempKey, result, code, requestHash8, finalIdempotencyKey | ✓ | — |
| 45 | `src/domains/bills/repos/appendItem.ts:345` | `appendItem` / `appendItemCatch` | op, billId, idempKey, result, code, requestHash8 | ✓ | — |
| 46 | `src/domains/bills/repos/appendItem.ts:610` | `appendItem` / `appendItemWithOrderProjection` | op, billId, idempKey, result, code, requestHash8, stackPreview, itemId, orderDocId, orderId | ✓ | — |
| 47 | `src/domains/bills/repos/appendSideGameChip.ts:297` | `appendSideGameChip` | op, billId, action, idempKey, result, code, requestHash8, idempotencyRef | ✓ | ACCOUNTING_IDEMPOTENCY_MISMATCH[billId,op] / ACCOUNTING_INVALID_STATE[billId,billStatus,op] |
| 48 | `src/domains/bills/repos/calcBusinessDate.ts:81` | `calcBusinessDate` | nowUtc | ✓ | — |
| 49 | `src/domains/bills/repos/createBillWithActiveStay.ts:264` | `createBillWithActiveStay` / `runCreateBillTransaction` | billId, userId, idempKey, result, code, requestHash8, idempotencyKeyFull, idempotencyRef | ✓ | ACCOUNTING_IDEMPOTENCY_MISMATCH[billId] / ACCOUNTING_ACTIVE_STAY_CONFLICT[userId,billId] |
| 50 | `src/domains/bills/repos/postEventAdjustment.ts:251` | `postEventAdjustment` | op, billId, eventId, result, code | ✓ | ACCOUNTING_INVALID_STATE[billId,currentStatus,op] / ACCOUNTING_BUSINESS_DATE_UNRESOLVED[reason,billId,op] / ACCOUNTING_BUSINESS_DATE_UNRESOLVED[reason,candidates,billId,op] / ACCOUNTING_NEGATIVE_TOTALS[billId,netSalesIncl,op] / ACCOUNTING_NEGATIVE_TOTALS[billId,balanceDueIncl,op] |
| 51 | `src/domains/bills/repos/postEventCancel.ts:188` | `postEventCancel` | op, billId, eventId, result, code | ✓ | ACCOUNTING_INVALID_STATE[billId,currentStatus,op] / ACCOUNTING_INVALID_STATE[billId,paidTotalIncl,totalRefundedIncl,op] / ACCOUNTING_BUSINESS_DATE_UNRESOLVED[reason,billId,op] / ACCOUNTING_BUSINESS_DATE_UNRESOLVED[reason,candidates,billId,op] |
| 52 | `src/domains/bills/repos/postEventRefund.ts:260` | `postEventRefund` | op, billId, eventId, result, code | ✓ | ACCOUNTING_INVALID_STATE[billId,currentStatus,op] / ACCOUNTING_INVALID_STATE[billId,newTotalRefunded,grandTotalRounded,op] / ACCOUNTING_NEGATIVE_TOTALS[billId,newBalanceDueIncl,op] / ACCOUNTING_BUSINESS_DATE_UNRESOLVED[reason,billId,op] / ACCOUNTING_BUSINESS_DATE_UNRESOLVED[reason,candidates,billId,op] |
| 53 | `src/domains/bills/repos/postEventReopen.ts:175` | `postEventReopen` | op, billId, eventId, result, code | ✓ | ACCOUNTING_INVALID_STATE[billId,currentStatus,op] / ACCOUNTING_BUSINESS_DATE_UNRESOLVED[reason,billId,op] / ACCOUNTING_BUSINESS_DATE_UNRESOLVED[reason,candidates,billId,op] |
| 54 | `src/domains/bills/repos/recordTournamentAction.ts:316` | `recordTournamentAction` | op, billId, templateId, action, idempKey, result, code, idempotencyRef | ✓ | ACCOUNTING_IDEMPOTENCY_MISMATCH[billId,templateId,op] / ACCOUNTING_INVALID_STATE[billId,billStatus,op] |
| 55 | `src/domains/bills/repos/startAccounting.ts:252` | `startAccounting` / `startAccountingRepoCatch` | billId, idempKey, result, code, idempotencyRef | ✓ | ACCOUNTING_IDEMPOTENCY_MISMATCH[expectedHash8,gotHash8] / ACCOUNTING_INVALID_STATE[currentStatus,allowedStatuses] / ACCOUNTING_ALREADY_STARTED[billId] |
| 56 | `src/domains/bills/repos/updateBill.ts:179` | `updateBill` | op, billId, result, code | ✓ | — |
| 57 | `src/domains/bills/repos/updatePlace.ts:182` | `updatePlace` | op, billId, table, seat, idempKey, result, code | ✓ | ACCOUNTING_INVALID_STATE[billId,billStatus,op] |
| 58 | `src/domains/bills/triggers/billsEventsOnCreate.ts:206` | `billsEventsOnCreate` | billId, eventId, type, code | ✓ | ACCOUNTING_INVALID_STATE[billId,eventId,eventType,currentStatus,allowedStatuses] / ACCOUNTING_NEGATIVE_TOTALS[billId,eventId,eventType,netSalesIncl] / ACCOUNTING_NEGATIVE_TOTALS[billId,eventId,eventType,finalBalanceDueIncl] |
| 59 | `src/domains/bills/triggers/billsOnSettle.ts:201` | `billsOnSettle` | billId | ✓ | — |
| 60 | `src/domains/itemOrder/callables/cancelOrder.ts:139` | `cancelOrder` | callerUid, deviceId, orderId, orderDocId, billId, businessDate, dateString | ✓ | — |
| 61 | `src/domains/itemOrder/callables/createMenuItem.ts:63` | `createMenuItem` / `imageUpload` | callerUid, deviceId | ✓ | — |
| 62 | `src/domains/itemOrder/callables/createMenuItem.ts:125` | `createMenuItem` / `menuCreateCatch` | callerUid, deviceId | ✓ | — |
| 63 | `src/domains/itemOrder/callables/getMenuItems.ts:24` | `getMenuItems` / `adminMenuDocMissing` | collection, docId |  | — |
| 64 | `src/domains/itemOrder/callables/getMenuItems.ts:89` | `getMenuItems` / `menuFetchCatch` | callerUid | ✓ | — |
| 65 | `src/domains/itemOrder/callables/getUserOrderHistory.ts:110` | `getUserOrderHistory` | businessDate, userId | ✓ | — |
| 66 | `src/domains/itemOrder/callables/placeOrder.ts:137` | `placeOrder` / `chipPurchaseLog` | callerUid, deviceId, billId, businessDate, idempotencyKey, userId | ✓ | — |
| 67 | `src/domains/itemOrder/callables/placeOrder.ts:221` | `placeOrder` / `placeOrderGenericCatch` | callerUid, deviceId, billId, businessDate, idempotencyKey, userId | ✓ | — |
| 68 | `src/domains/itemOrder/callables/placeOrderByUser.ts:206` | `placeOrderByUser` / `placeOrderGenericCatch` | userId, billId, orderDocId, activeBillId, idempotencyKey, lastIdempotencyKey, sessionNonce | ✓ | — |
| 69 | `src/domains/itemOrder/callables/toggleSoldOutForMenuItem.ts:74` | `toggleSoldOutForMenuItem` | callerUid, deviceId, menuItemId | ✓ | — |
| 70 | `src/domains/itemOrder/callables/updateMenuItem.ts:79` | `updateMenuItem` / `imageUpload` | callerUid, deviceId, originalId | ✓ | — |
| 71 | `src/domains/itemOrder/callables/updateMenuItem.ts:149` | `updateMenuItem` / `menuUpdateCatch` | callerUid, deviceId, originalId | ✓ | — |
| 72 | `src/domains/logs/callables/getActionLogs.ts:215` | `getActionLogs` | detailMessage, tournamentId, deviceId, tableId, limit, startAfter, firstDocTournamentId | ✓ | — |
| 73 | `src/domains/logs/callables/rollbackAction.ts:301` | `rollbackAction` | tournamentId, tId, operationId, action, rollBackBy, rollBackByDeviceId, rollBackByDeviceName, plUid, grantIdempotencyKey | ✓ | — |
| 74 | `src/domains/logs/services/undoAddon.ts:79` | `undoAddon` | (なし) | ✓ | — |
| 75 | `src/domains/logs/services/undoAssignSeatToPlayer.ts:95` | `undoAssignSeatToPlayer` | (なし) | ✓ | — |
| 76 | `src/domains/logs/services/undoBulkAddon.ts:112` | `undoBulkAddon` | (なし) | ✓ | — |
| 77 | `src/domains/logs/services/undoBustAndExit.ts:90` | `undoBustAndExit` | (なし) | ✓ | — |
| 78 | `src/domains/logs/services/undoBustAndReentry.ts:103` | `undoBustAndReentry` | (なし) | ✓ | — |
| 79 | `src/domains/logs/services/undoRegisterForTournament.ts:154` | `undoRegisterForTournament` | (なし) | ✓ | — |
| 80 | `src/domains/logs/services/undoRegisterParticipants.ts:222` | `undoRegisterParticipants` | (なし) | ✓ | — |
| 81 | `src/domains/logs/services/undoReseatAllPlayers.ts:83` | `undoReseatAllPlayers` | (なし) | ✓ | — |
| 82 | `src/domains/scheduler/replan/enqueueTournamentTasksReplanRequest.ts:129` | `executeScheduledJobTask` / `markReplanCompletedBestEffort` | reason | ✓ | — |
| 83 | `src/domains/scheduler/replan/enqueueTournamentTasksReplanRequest.ts:146` | `executeScheduledJobTask` / `releaseReplanProcessingBestEffort` | reason | ✓ | — |
| 84 | `src/domains/scheduler/replan/enqueueTournamentTasksReplanTask.ts:132` | `enqueueTournamentTasksByScheduler` / `cloudTasksCreateTask` | taskId, queueName, projectId, idempotencyKey | ✓ | — |
| 85 | `src/domains/scheduler/supervisor/schedulerLogs.ts:47` | `writeSchedulerDispatchLogBestEffort` / `dispatchLogWrite` | reason, jobKey, functionName, projectId | ✓ | — |
| 86 | `src/domains/scheduler/supervisor/schedulerLogs.ts:73` | `writeSchedulerExecutionLogByCloudTaskBestEffort` / `executionLogWrite` | reason, jobKey, functionName, projectId | ✓ | — |
| 87 | `src/domains/scheduler/supervisor/schedulerSupervisor.ts:20` | `schedulerSupervisor` | (なし) | ✓ | — |
| 88 | `src/domains/scheduler/tasks/scheduledJobTaskExecutors.ts:307` | `executeScheduledJobTask` / `runScheduledJob` | jobKey, idempotencyKey, reason, supervisorRunId, planningDate, plannedRunAt, expectedJobKey | ✓ | — |
| 89 | `src/domains/shift/callables/finalizeMonth.ts:178` | `finalizeMonth` / `finalizeDayLoop` | yearMonth, dateKey, installationId | ✓ | — |
| 90 | `src/domains/shift/services/helpers.ts:117` | `getRequiredStaffByTimeSlot` / `config_read` | code, reason, message | ✓ | — |
| 91 | `src/domains/sideGame/callables/depositTip.ts:138` | `depositTip` | callerUid, deviceId, billId, activeBillId, idempotencyKey, userId | ✓ | — |
| 92 | `src/domains/sideGame/callables/leaveSeat.ts:99` | `leaveSeat` | callerUid, deviceId, billId, userId, tableId, seatNumber | ✓ | — |
| 93 | `src/domains/sideGame/callables/registerForSideGame.ts:113` | `registerForSideGame` | callerUid, deviceId, billId, userId, tableId, seatNumber | ✓ | — |
| 94 | `src/domains/sideGame/callables/withdrawTip.ts:143` | `withdrawTip` | callerUid, deviceId, billId, activeBillId, idempotencyKey, userId | ✓ | — |
| 95 | `src/domains/staff/callables/confirmShiftRequest.ts:100` | `confirmShiftRequest` | staffId, requestId | ✓ | — |
| 96 | `src/domains/staff/callables/createMultipleShifts.ts:375` | `createMultipleShifts` | staffId, lastDateKey, lastDayKey, lastRequestId, dateKey, dayKey, requestId | ✓ | — |
| 97 | `src/domains/staff/callables/createStaffAccount.ts:121` | `createStaffAccount` | uid, loginId, resolvedLoginId | ✓ | — |
| 98 | `src/domains/staff/callables/getShifts.ts:53` | `getShifts` / `initCatch` | uid, userId | ✓ | — |
| 99 | `src/domains/staff/callables/getShifts.ts:271` | `getShifts` / `shiftFetchCatch` | uid, userId, lastTouchedDateKey, dateKey | ✓ | — |
| 100 | `src/domains/staff/callables/getShifts.ts:282` | `getShifts` / `detailErrorLog` | uid, userId, lastTouchedDateKey, dateKey | ✓ | — |
| 101 | `src/domains/staff/callables/getShifts.ts:291` | `getShifts` / `unknownErrorLog` | uid, userId, lastTouchedDateKey, dateKey | ✓ | — |
| 102 | `src/domains/staff/callables/updateShiftRequest.ts:160` | `updateShiftRequest` | staffId, requestId, dateKey | ✓ | — |
| 103 | `src/domains/staff/callables/updateStaffBankInfo.ts:89` | `updateStaffBankInfo` | callerUid, staffId | ✓ | — |
| 104 | `src/domains/staff/callables/updateStaffHourlyWage.ts:98` | `updateStaffHourlyWage` | adminId, staffId | ✓ | — |
| 105 | `src/domains/staff/scheduler/scheduledCleanup.ts:46` | `scheduledCleanup` | (なし) | ✓ | — |
| 106 | `src/domains/storeMeta/callables/closeAssessmentTask.ts:267` | `closeAssessmentTask` | (なし) | ✓ | STORE_STATE_DOC_MISSING[reason] |
| 107 | `src/domains/storeMeta/callables/closeStoreTerminal.ts:449` | `closeStoreTerminal` / `finalizeCloseStateDoc.enqueueOpenAssessmentRecheck` | runId, closedBusinessDate, intendedBusinessDateKeyForRecheck, recheckEnqueueError, callerUid, attemptId, requestRunId, currentBusinessDateKey, recheckProjectId | ✓ | STORE_STATE_DOC_MISSING[phase] / STORE_NOT_RUNNING[status,phase] / STORE_BUSINESS_DATE_UNAVAILABLE[status,phase] |
| 108 | `src/domains/storeMeta/callables/closeStoreTerminal.ts:528` | `closeStoreTerminal` / ``runCloseStep.${stepName}`` | runId, closedBusinessDate, currentBusinessDateKey, stepName, callerUid, attemptId, requestRunId, amountsByBillId, unclockedAttendanceIds, markWrittenBillIds, markUsersIncremented | ✓ | STORE_STATE_DOC_MISSING[phase] / STORE_NOT_RUNNING[status,phase] / STORE_BUSINESS_DATE_UNAVAILABLE[status,phase] |
| 109 | `src/domains/storeMeta/callables/closeStoreTerminal.ts:585` | `closeStoreTerminal` / `rollbackUnsettledMark` | runId, closedBusinessDate, writtenBillIds, rollbackErrorSummary, callerUid, attemptId, requestRunId, currentBusinessDateKey, markUsersIncremented | ✓ | STORE_STATE_DOC_MISSING[phase] / STORE_NOT_RUNNING[status,phase] / STORE_BUSINESS_DATE_UNAVAILABLE[status,phase] |
| 110 | `src/domains/storeMeta/callables/continueBusinessTerminal.ts:306` | `continueBusinessTerminal` / `cloudTasksCreateTask` | intendedBusinessDateKey, scheduledAt, callerUid, closeTaskId, continueLogId, idempotencyKey, openOverrideIntendedBusinessDateKey, projectId, openTaskId, status | ✓ | STORE_STATE_DOC_MISSING[phase] / STORE_NOT_RUNNING[status,phase] / STORE_STATE_DOC_MISSING[phase] |
| 111 | `src/domains/storeMeta/callables/createInitialStateDocCallable.ts:50` | `createInitialStateDocCallable` / `createInitialStateDoc` | op, path | ✓ | — |
| 112 | `src/domains/storeMeta/callables/initializeStoreConfigCallable.ts:145` | `initializeStoreConfigCallable` / `initStoreMetaConfig` | callerUid, deviceId | ✓ | — |
| 113 | `src/domains/storeMeta/callables/openAssessmentTask.ts:310` | `openAssessmentTask` | (なし) | ✓ | STORE_STATE_DOC_MISSING[reason] |
| 114 | `src/domains/storeMeta/callables/openStoreTerminal.ts:221` | `openStoreTerminal` / ``runOpenStep.${stepName}`` | runId, businessDateKey, stepName, callerUid, attemptId, requestRunId | ✓ | STORE_STATE_DOC_MISSING[phase] / STORE_INVALID_STATE[status,phase] / STORE_INVALID_STATE[status,phase] |
| 115 | `src/domains/storeMeta/callables/temporaryUnlockAlreadyRunningDifferentDateTerminal.ts:229` | `temporaryUnlockAlreadyRunningDifferentDateTerminal` / `cloudTasksCreateTask` | intendedBusinessDateKey, scheduledAt, callerUid, openTaskId, projectId, unlockLogId | ✓ | — |
| 116 | `src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts:128` | `updateUnclockedAttendanceWithAuth` / `passwordClockOutUpdate` | docId, callerUid | ✓ | — |
| 117 | `src/domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow.ts:118` | `getCurrentBusinessDateKeyOrThrow` / `loadFirestoreStateDoc` | (なし) | ✓ | STORE_STATE_DOC_MISSING[reason] / STORE_INVALID_STATE[reason] / STORE_BUSINESS_DATE_UNAVAILABLE[status,currentBusinessDateKey] |
| 118 | `src/domains/storeMeta/scheduler/weeklyPlanner.ts:249` | `weeklyPlanner` | (なし) | ✓ | — |
| 119 | `src/domains/storeMeta/scripts/createInitialStateDoc.ts:50` | `createInitialStateDoc` / `createDocMainCatch` | (なし) | ✓ | — |
| 120 | `src/domains/storeMeta/scripts/createInitialStateDoc.ts:67` | `createInitialStateDoc` / `scriptTopLevelCatch` | (なし) | ✓ | — |
| 121 | `src/domains/storeMeta/services/applyCloseSnapshot.ts:136` | `applyCloseSnapshot` / `applyBillCloseSnapshotTxn` | billId, closeRunId, closedBusinessDate, error | ✓ | — |
| 122 | `src/domains/storeMeta/services/applyCloseSnapshot.ts:168` | `applyCloseSnapshot` / `incrementUserUnsettledBillsCount` | userId, incrementCount, closeRunId, closedBusinessDate, countByUserId | ✓ | — |
| 123 | `src/domains/storeMeta/services/cleanupActiveStaysOnClose.ts:56` | `cleanupActiveStaysOnClose` / `deleteActiveStayDocument` | activeStayId, billId | ✓ | — |
| 124 | `src/domains/storeMeta/services/cleanupActiveStaysOnClose.ts:104` | `cleanupActiveStaysOnClose` / `cleanupOuterCatch` | callerUid, deviceId | ✓ | — |
| 125 | `src/domains/storeMeta/services/getCloseIntegrityData.ts:53` | `getCloseIntegrityData` / `closeIntegrityAggregate` | callerUid, businessDate | ✓ | — |
| 126 | `src/domains/storeMeta/services/getUnclockedStaffForClose.ts:60` | `getUnclockedStaffForClose` / `unclockedStaffQuery` | callerUid | ✓ | — |
| 127 | `src/domains/storeMeta/services/getUnclosedTournamentsForClose.ts:179` | `getUnclosedTournamentsForClose` / `unclosedTournamentsQuery` | callerUid, businessDate | ✓ | — |
| 128 | `src/domains/storeMeta/services/getUnsettledBillsForClose.ts:98` | `getUnsettledBillsForClose` / `unsettledBillsQuery` | callerUid, businessDate | ✓ | — |
| 129 | `src/domains/storeMeta/services/resetAllSideGames.ts:58` | `resetAllSideGames` | callerUid | ✓ | — |
| 130 | `src/domains/storeMeta/services/resetAllTables.ts:41` | `resetAllTables` | callerUid | ✓ | — |
| 131 | `src/domains/tournament_activeTournament/callables/addon.ts:221` | `addon` / `recordTournamentActionBestEffort` | callerUid, idempotencyKey, billId, templateId, tournamentId, userId, operationId, deviceId | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_ADDON_NOT_ALLOWED[tournamentId] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_ADDON_ALREADY_DONE[billId,templateId,userId] / TOURNAMENT_INVALID_STATE[tournamentId,reason] |
| 132 | `src/domains/tournament_activeTournament/callables/addon.ts:300` | `addon` / `addonMainCatch` | callerUid, ...(device != null && { deviceId: device.id }), ...(typeof reqData?.tournamentId === 'string' && { tournamentId: reqData.tournamentId }), ...(typeof reqData?.userId === 'string' && { userId: reqData.userId }), ...(typeof reqData?.operationId === 'string' && { operationId: reqData.operationId }), ...(typeof reqData?.tableId === 'string' && { tableId: reqData.tableId }) | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_ADDON_NOT_ALLOWED[tournamentId] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_ADDON_ALREADY_DONE[billId,templateId,userId] / TOURNAMENT_INVALID_STATE[tournamentId,reason] |
| 133 | `src/domains/tournament_activeTournament/callables/addon.ts:329` | `addon` / `addonOperationLogWrite` | callerUid, opId, deviceId, ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }), ...(typeof rawData?.userId === 'string' && { userId: rawData.userId }), ...(typeof rawData?.operationId === 'string' && { operationId: rawData.operationId }) | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_ADDON_NOT_ALLOWED[tournamentId] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_ADDON_ALREADY_DONE[billId,templateId,userId] / TOURNAMENT_INVALID_STATE[tournamentId,reason] |
| 134 | `src/domains/tournament_activeTournament/callables/addTableToTournament.ts:151` | `addTableToTournament` / `addTableToTournamentGenericCatch` |  | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,tableId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,tableId,status,reason] |
| 135 | `src/domains/tournament_activeTournament/callables/api.pause.ts:135` | `pauseTournament` / `pauseTournamentGenericCatch` |  | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,phase,field] / TOURNAMENT_INVALID_STATE[tournamentId,phase,field] / TOURNAMENT_ALREADY_PAUSED[tournamentId] |
| 136 | `src/domains/tournament_activeTournament/callables/api.resume.ts:144` | `resumeTournament` / `resumeTournamentGenericCatch` |  | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,phase,field] / TOURNAMENT_INVALID_STATE[tournamentId,phase,field] / TOURNAMENT_NOT_PAUSED[tournamentId] |
| 137 | `src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts:207` | `assignSeatToPlayer` / `updatePlaceBestEffort` | callerUid, deviceId, billId, operationId, seatUserIdKey, tournamentId, userId, tableId, seatNumber | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,tableId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,tableId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,tableId,seatNumber,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] |
| 138 | `src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts:279` | `assignSeatToPlayer` / `assignSeatGenericCatch` |  | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,tableId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,tableId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,tableId,seatNumber,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] |
| 139 | `src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts:300` | `assignSeatToPlayer` / `assignSeatOperationLogWrite` | callerUid, opId, deviceId, ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }), ...(typeof rawData?.userId === 'string' && { userId: rawData.userId }), ...(typeof rawData?.operationId === 'string' && { operationId: rawData.operationId }) | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,tableId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,tableId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,tableId,seatNumber,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] |
| 140 | `src/domains/tournament_activeTournament/callables/bulkAddon.ts:230` | `bulkAddon` / `recordActionPerUserBestEffort` | callerUid, idempotencyKey, operationId, templateId, deviceId, billId, clientOperationId, tournamentId, ...(tableId != null && tableId !== '' && { tableId }) | ✓ | — |
| 141 | `src/domains/tournament_activeTournament/callables/bulkAddon.ts:293` | `bulkAddon` / `bulkAddonMainCatch` | callerUid, ...(device != null && { deviceId: device.id }), ...(typeof rawDataEarly?.tournamentId === 'string' && { tournamentId: rawDataEarly.tournamentId }), ...(typeof rawDataEarly?.tableId === 'string' && { tableId: rawDataEarly.tableId }), ...(typeof rawDataEarly?.operationId === 'string' && { clientOperationId: rawDataEarly.operationId }) | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_ADDON_NOT_ALLOWED[tournamentId] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userNames,reason] / TOURNAMENT_ADDON_ALREADY_DONE[tournamentId] |
| 142 | `src/domains/tournament_activeTournament/callables/bulkAddon.ts:323` | `bulkAddon` / `bulkAddonOperationLogWrite` | callerUid, opId, deviceId, ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }), ...(typeof rawData?.tableId === 'string' && { tableId: rawData.tableId }) | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_ADDON_NOT_ALLOWED[tournamentId] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userNames,reason] / TOURNAMENT_ADDON_ALREADY_DONE[tournamentId] |
| 143 | `src/domains/tournament_activeTournament/callables/bustAndExit.ts:195` | `bustAndExit` / `updatePlaceBestEffort` | billId, callerUid, currentUserId, seatPokerNameKey, seatUserIdKey, deviceId, operationId, tournamentId, userId, seatNumber, tableId | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,tableId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,tableId,seatNumber,userId,reason] |
| 144 | `src/domains/tournament_activeTournament/callables/bustAndExit.ts:247` | `bustAndExit` / `bustAndExitMainCatch` | callerUid, ...(device != null && { deviceId: device.id }), ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }), ...(typeof rawData?.userId === 'string' && { userId: rawData.userId }), ...(typeof rawData?.tableId === 'string' && { tableId: rawData.tableId }), ...(typeof rawData?.operationId === 'string' && { operationId: rawData.operationId }), ...(typeof rawData?.seatNumber === 'number' && { seatNumber: rawData.seatNumber }) | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,tableId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,tableId,seatNumber,userId,reason] |
| 145 | `src/domains/tournament_activeTournament/callables/bustAndExit.ts:274` | `bustAndExit` / `bustAndExitOperationLogWrite` | callerUid, opId, deviceId, ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }), ...(typeof rawData?.userId === 'string' && { userId: rawData.userId }) | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,tableId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,tableId,seatNumber,userId,reason] |
| 146 | `src/domains/tournament_activeTournament/callables/bustAndReentry.ts:366` | `bustAndReentry` / `recordTournamentActionBestEffort` | callerUid, idempotencyKey, deviceId, billId, templateId, tournamentId, userId, operationId, tableId, seatNumber, seatUserIdKey, seatPokerNameKey | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,templateId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_REENTRY_LIMIT_REACHED[tournamentId,userId,currentReentryCount,maxReentriesPerPlayer] / TOURNAMENT_INVALID_STATE[tournamentId,tableId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,tableId,seatNumber,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] |
| 147 | `src/domains/tournament_activeTournament/callables/bustAndReentry.ts:420` | `bustAndReentry` / `bustAndReentryMainCatch` | callerUid, ...(device != null && { deviceId: device.id }), ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }), ...(typeof rawData?.userId === 'string' && { userId: rawData.userId }), ...(typeof rawData?.tableId === 'string' && { tableId: rawData.tableId }), ...(typeof rawData?.operationId === 'string' && { operationId: rawData.operationId }), ...(typeof rawData?.seatNumber === 'number' && { seatNumber: rawData.seatNumber }) | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,templateId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_REENTRY_LIMIT_REACHED[tournamentId,userId,currentReentryCount,maxReentriesPerPlayer] / TOURNAMENT_INVALID_STATE[tournamentId,tableId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,tableId,seatNumber,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] |
| 148 | `src/domains/tournament_activeTournament/callables/bustAndReentry.ts:447` | `bustAndReentry` / `bustAndReentryOperationLogWrite` | callerUid, opId, deviceId, ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }), ...(typeof rawData?.userId === 'string' && { userId: rawData.userId }) | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,templateId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_REENTRY_LIMIT_REACHED[tournamentId,userId,currentReentryCount,maxReentriesPerPlayer] / TOURNAMENT_INVALID_STATE[tournamentId,tableId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,tableId,seatNumber,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] |
| 149 | `src/domains/tournament_activeTournament/callables/createTemporaryTable.ts:137` | `createTemporaryTable` / `createTemporaryTableGenericCatch` |  | ✓ | TOURNAMENT_INVALID_STATE[tableName,reason] |
| 150 | `src/domains/tournament_activeTournament/callables/endTournament.ts:122` | `endTournament` | callerUid, ...(device != null && { deviceId: device.id }), ...(d?.tournamentId && { tournamentId: d.tournamentId }) | ✓ | — |
| 151 | `src/domains/tournament_activeTournament/callables/getAvailableTables.ts:49` | `getAvailableTables` | ...(request.auth?.uid && { callerUid: request.auth.uid }) | ✓ | — |
| 152 | `src/domains/tournament_activeTournament/callables/getPrizeData.ts:58` | `getPrizeData` | tournamentId | ✓ | — |
| 153 | `src/domains/tournament_activeTournament/callables/getRankingData.ts:89` | `getRankingData` / `getRankingDataGenericCatch` | tournamentId | ✓ | TOURNAMENT_PRIZE_NOT_CONFIRMED[tournamentId] |
| 154 | `src/domains/tournament_activeTournament/callables/getTodayTournaments.ts:233` | `getTodayTournaments` | ...(request.auth?.uid && { callerUid: request.auth.uid }) | ✓ | — |
| 155 | `src/domains/tournament_activeTournament/callables/getUpcomingTournaments.ts:264` | `getUpcomingTournaments` | ...(request.auth?.uid && { callerUid: request.auth.uid }) | ✓ | — |
| 156 | `src/domains/tournament_activeTournament/callables/registerForTournament.ts:241` | `registerForTournament` / `recordTournamentAction` | billId, idempotencyKey, templateId, tournamentId, userId, deviceId | ✓ | TOURNAMENT_INVALID_STATE[tournamentId] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_ALREADY_REGISTERED[tournamentId,userId] / TOURNAMENT_INVALID_STATE[tournamentId,reason] |
| 157 | `src/domains/tournament_activeTournament/callables/registerForTournament.ts:294` | `registerForTournament` / `registerTournamentFlow` | ...(uid && { callerUid: uid }), deviceId, ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }) | ✓ | TOURNAMENT_INVALID_STATE[tournamentId] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_ALREADY_REGISTERED[tournamentId,userId] / TOURNAMENT_INVALID_STATE[tournamentId,reason] |
| 158 | `src/domains/tournament_activeTournament/callables/registerForTournament.ts:318` | `registerForTournament` / `recordFailureOperationLog` | opId, deviceId, ...(uid && { callerUid: uid }), ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }) | ✓ | TOURNAMENT_INVALID_STATE[tournamentId] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_ALREADY_REGISTERED[tournamentId,userId] / TOURNAMENT_INVALID_STATE[tournamentId,reason] |
| 159 | `src/domains/tournament_activeTournament/callables/registerParticipants.ts:317` | `registerParticipants` / `recordActionPerUserBestEffort` | callerUid, idempotencyKey, operationId, templateId, deviceId, billId, clientOperationId, tournamentId, userId | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] |
| 160 | `src/domains/tournament_activeTournament/callables/registerParticipants.ts:347` | `registerParticipants` / `registerUserFailed` | callerUid, operationId, templateId, deviceId, tournamentId, userId, clientOperationId | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] |
| 161 | `src/domains/tournament_activeTournament/callables/registerParticipants.ts:406` | `registerParticipants` / `registerParticipantsMainCatch` | callerUid, ...(device != null && { deviceId: device.id }), ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }), ...(typeof rawData?.operationId === 'string' && { clientOperationId: rawData.operationId }) | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] |
| 162 | `src/domains/tournament_activeTournament/callables/registerParticipants.ts:430` | `registerParticipants` / `registerParticipantsOperationLogWrite` | callerUid, opId, deviceId, ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }) | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,reason] |
| 163 | `src/domains/tournament_activeTournament/callables/removeTableFromTournament.ts:130` | `removeTableFromTournament` / `removeTableFromTournamentGenericCatch` |  | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,tableId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,tableId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,tableId,reason] |
| 164 | `src/domains/tournament_activeTournament/callables/reseatAllPlayers.ts:242` | `reseatAllPlayers` / `updatePlacePerAssignmentBestEffort` | callerUid, deviceId, billId, operationId, tournamentId, userId, tableId, seatNumber | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] |
| 165 | `src/domains/tournament_activeTournament/callables/reseatAllPlayers.ts:309` | `reseatAllPlayers` / `reseatAllPlayersGenericCatch` |  | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] |
| 166 | `src/domains/tournament_activeTournament/callables/reseatAllPlayers.ts:328` | `reseatAllPlayers` / `reseatAllPlayersOperationLogWrite` | callerUid, opId, deviceId, ...(typeof rawData?.tournamentId === 'string' && { tournamentId: rawData.tournamentId }) | ✓ | TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] / TOURNAMENT_INVALID_STATE[tournamentId,userId,reason] |
| 167 | `src/domains/tournament_activeTournament/callables/setPrizeData.ts:73` | `setPrizeData` | callerUid, ...(device != null && { deviceId: device.id }), ...(d?.tournamentId && { tournamentId: d.tournamentId }) | ✓ | — |
| 168 | `src/domains/tournament_activeTournament/callables/setRankingData.ts:155` | `setRankingData` / `setRankingDataRankings` | callerUid, ...(device != null && { deviceId: device.id }), ...(d?.tournamentId && { tournamentId: d.tournamentId }), ...(d?.grantIdempotencyKey && { grantIdempotencyKey: d.grantIdempotencyKey }) | ✓ | — |
| 169 | `src/domains/tournament_activeTournament/callables/setRankingData.ts:318` | `setRankingData` / `setRankingDataPrizeGrant` | grantIdempotencyKey, tournamentId | ✓ | — |
| 170 | `src/domains/tournament_activeTournament/callables/validateEndTournament.ts:199` | `validateEndTournament` | callerUid, ...(device != null && { deviceId: device.id }), ...(d?.tournamentId && { tournamentId: d.tournamentId }) | ✓ | — |
| 171 | `src/domains/tournament_createTournament/callables/archiveBlindTemplate.ts:29` | `archiveBlindTemplate` | blindTemplateId | ✓ | — |
| 172 | `src/domains/tournament_createTournament/callables/archiveTournamentTemplate.ts:32` | `archiveTournamentTemplate` | tournamentTemplateId | ✓ | — |
| 173 | `src/domains/tournament_createTournament/callables/createBlindTemplate.ts:85` | `createBlindTemplate` | ...(request.auth?.uid && { callerUid: request.auth.uid }) | ✓ | — |
| 174 | `src/domains/tournament_createTournament/callables/createScheduledTournament.ts:374` | `createScheduledTournament` / `enqueueAfterCreate` | tournamentId, storeId, tenantId, blindStructureId, callerUid, selectedBusinessDateKey, deviceId | ✓ | TOURNAMENT_SCHEDULE_NO_BUSINESS_DAY[startAt,op] / TOURNAMENT_SCHEDULE_AMBIGUOUS[candidates,startAt,op] / TOURNAMENT_SCHEDULE_DUPLICATE_TEMPLATE_SAME_DAY[templateId,businessDate,op] / TOURNAMENT_TEMPLATE_ARCHIVED[templateId,phase] |
| 175 | `src/domains/tournament_createTournament/callables/createScheduledTournament.ts:431` | `createScheduledTournament` / `createScheduledTournamentGenericCatch` |  | ✓ | TOURNAMENT_SCHEDULE_NO_BUSINESS_DAY[startAt,op] / TOURNAMENT_SCHEDULE_AMBIGUOUS[candidates,startAt,op] / TOURNAMENT_SCHEDULE_DUPLICATE_TEMPLATE_SAME_DAY[templateId,businessDate,op] / TOURNAMENT_TEMPLATE_ARCHIVED[templateId,phase] |
| 176 | `src/domains/tournament_createTournament/callables/createTournamentRecurrence.ts:123` | `createTournamentRecurrence` / `enqueueAfterCreate` | recurrenceId, storeId, tenantId, callerUid, deviceId, templateId | ✓ | — |
| 177 | `src/domains/tournament_createTournament/callables/createTournamentRecurrence.ts:166` | `createTournamentRecurrence` / `createTournamentRecurrenceGenericCatch` |  | ✓ | — |
| 178 | `src/domains/tournament_createTournament/callables/createTournamentRecurrence.ts:560` | `createTournamentRecurrence` / `createTournamentRecurrenceInnerHelper` | recurrenceId, storeId, templateId, tenantId | ✓ | — |
| 179 | `src/domains/tournament_createTournament/callables/createTournamentTemplate.ts:73` | `createTournamentTemplate` | ...(request.auth?.uid && { callerUid: request.auth.uid }) | ✓ | — |
| 180 | `src/domains/tournament_createTournament/callables/deleteTournamentRecurrence.ts:79` | `deleteTournamentRecurrence` | callerUid, deviceId, ...(d?.recurrenceId && { recurrenceId: d.recurrenceId }) | ✓ | — |
| 181 | `src/domains/tournament_createTournament/callables/enqueueTournamentTasks.ts:31` | `enqueueTournamentTasks` / `enqueueBatchPartialErrors` | errors, deviceId, callerUid |  | — |
| 182 | `src/domains/tournament_createTournament/callables/enqueueTournamentTasks.ts:50` | `enqueueTournamentTasks` / `enqueueTournamentTasksGenericCatch` | deviceId, callerUid | ✓ | — |
| 183 | `src/domains/tournament_createTournament/callables/getBlindTemplates.ts:41` | `getBlindTemplates` | ...(request.auth?.uid && { callerUid: request.auth.uid }) | ✓ | — |
| 184 | `src/domains/tournament_createTournament/callables/getScheduledTournamentsForEdit.ts:76` | `getScheduledTournamentsForEdit` | callerUid, deviceId, ...(d?.id && { id: d.id }), ...(d?.type && { type: d.type }) | ✓ | — |
| 185 | `src/domains/tournament_createTournament/callables/getTournamentRecurrences.ts:46` | `getTournamentRecurrences` | ...(request.auth?.uid && { callerUid: request.auth.uid }) | ✓ | — |
| 186 | `src/domains/tournament_createTournament/callables/getTournamentTemplates.ts:64` | `getTournamentTemplates` | ...(request.auth?.uid && { callerUid: request.auth.uid }) | ✓ | — |
| 187 | `src/domains/tournament_createTournament/callables/updateBlindTemplate.ts:97` | `updateBlindTemplate` | blindTemplateId, ...(blindTemplateId && { bid: blindTemplateId }) | ✓ | — |
| 188 | `src/domains/tournament_createTournament/callables/updateTournamentRecurrence.ts:173` | `updateTournamentRecurrence` | callerUid, deviceId, ...(d?.recurrenceId && { recurrenceId: d.recurrenceId }), ...(d?.templateId && { templateId: d.templateId }), ...(d?.tournamentId && { tournamentId: d.tournamentId }) | ✓ | — |
| 189 | `src/domains/tournament_createTournament/callables/updateTournamentTemplate.ts:139` | `updateTournamentTemplate` | callerUid, deviceId, ...(d?.templateId && { templateId: d.templateId }), ...(d?.tournamentId && { tournamentId: d.tournamentId }) | ✓ | — |
| 190 | `src/domains/tournament_createTournament/scheduler/EnqueueTournamentTasksByScheduler.ts:21` | `enqueueTournamentTasksByScheduler` / `runEnqueueSchedulerTask` | (なし) | ✓ | — |
| 191 | `src/domains/tournament_createTournament/scheduler/GenerateRecurringTournamentsByScheduler.ts:21` | `generateRecurringTournamentsByScheduler` | (なし) | ✓ | — |
| 192 | `src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts:241` | `runEnqueueTournamentTasks` / `enqueueTournamentTask` | tournamentId, taskType, blindStructureId, storeId | ✓ | — |
| 193 | `src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts:383` | `runEnqueueTournamentTasks` / `processTournamentBatchItem` | tournamentId, id | ✓ | — |
| 194 | `src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts:98` | `runGenerateRecurringTournaments` / `validateRecurringStoreTenant` | recurrenceId | ✓ | — |
| 195 | `src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts:136` | `runGenerateRecurringTournaments` / `parseRecurrenceInterval` | recurrenceId, intervalRaw, storeId, tenantId | ✓ | — |
| 196 | `src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts:151` | `runGenerateRecurringTournaments` / `parseRecurrenceIntervalWrongType` | recurrenceId, intervalRawType, storeId, tenantId | ✓ | — |
| 197 | `src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts:293` | `runGenerateRecurringTournaments` / `enqueueAfterGenerate` | totalGenerated | ✓ | — |
| 198 | `src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts:313` | `runGenerateRecurringTournaments` / `runGenerateRecurringTournamentsOuterCatch` | (なし) | ✓ | — |
| 199 | `src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts:601` | `createScheduledTournamentFromRecurrence` | recurrenceId, storeId, templateId, tenantId | ✓ | — |
| 200 | `src/domains/tournament_createTournament/to_be_deleted/getScheduledTournaments_to_be_deleted.ts:276` | `getScheduledTournaments` | ...(request.auth?.uid && { callerUid: request.auth.uid }), ...(request.data?.period && { period: request.data.period }) | ✓ | — |
| 201 | `src/domains/user/callables/createUserAccount.ts:116` | `createUserAccount` | loginId, uid, resolvedLoginId | ✓ | — |
| 202 | `src/domains/user/callables/generateQRCode.ts:143` | `generateQRCode` / `transaction` | loginId, uid | ✓ | — |
| 203 | `src/domains/user/callables/generateQRCode.ts:162` | `generateQRCode` / `generateQRCodeOuterCatch` | uid, loginId | ✓ | — |
| 204 | `src/domains/user/callables/getFirebaseCustomToken.ts:71` | `getFirebaseCustomToken` | (なし) | ✓ | — |
| 205 | `src/domains/user/callables/getUserStatus.ts:59` | `getUserStatus` | uid | ✓ | — |
| 206 | `src/domains/user/callables/manualCheckIn.ts:176` | `manualCheckIn` | callerUid, deviceId, billId, idempotencyKey, loginId, userId, targetUid | ✓ | — |
| 207 | `src/domains/user/callables/processVisitByQR.ts:220` | `processVisitByQR` | callerUid, deviceId, valid, billId, idempotencyKey, userId, loginId | ✓ | — |
| 208 | `src/domains/user/callables/verifyQRCode.ts:76` | `verifyQRCode` | isValid, callerUid | ✓ | — |
| 209 | `src/domains/user/services/lineAuth.ts:31` | `verifyLineIdToken` | (なし) | ✓ | — |
| 210 | `src/domains/user/services/qrCodeUtils.ts:132` | `saveQRCodeToStorage` | uid, type | ✓ | — |
| 211 | `src/domains/user/services/qrCodeUtils.ts:169` | `deleteOldQRCodeFiles` | uid | ✓ | — |
| 212 | `src/domains/webhook/callables/ensureStaffRichMenu.ts:44` | `ensureStaffRichMenu` | uid | ✓ | — |
| 213 | `src/domains/webhook/callables/lineWebhook.ts:68` | `lineWebhook` / `token` | (なし) |  | — |
| 214 | `src/domains/webhook/callables/lineWebhook.ts:130` | `lineWebhook` / `replyPostbackPlanDisabledNotOk` | status, lineApiErrorPreview, lineUserId, requestId |  | — |
| 215 | `src/domains/webhook/callables/lineWebhook.ts:141` | `lineWebhook` / `replyPostbackPlanDisabledCatch` | lineUserId, requestId | ✓ | — |
| 216 | `src/domains/webhook/callables/lineWebhook.ts:195` | `lineWebhook` / `replyPostbackDeclineConfirmNotOk` | status, lineApiErrorPreview, lineUserId, requestId |  | — |
| 217 | `src/domains/webhook/callables/lineWebhook.ts:206` | `lineWebhook` / `replyPostbackDeclineConfirmCatch` | lineUserId, requestId | ✓ | — |
| 218 | `src/domains/webhook/callables/lineWebhook.ts:226` | `lineWebhook` / `postback` | lineUserId, postbackDataPreview | ✓ | — |
| 219 | `src/domains/webhook/callables/lineWebhook.ts:264` | `lineWebhook` / `followOrUnblock` | lineUserId | ✓ | — |
| 220 | `src/domains/webhook/callables/lineWebhook.ts:277` | `lineWebhook` / `handler` | (なし) | ✓ | — |
| 221 | `src/domains/webhook/services/lineMessaging.ts:25` | `sendLinePushMessage` / `token` | userId |  | — |
| 222 | `src/domains/webhook/services/lineMessaging.ts:34` | `sendLinePushMessage` / `validate` | userId, hasMessage |  | — |
| 223 | `src/domains/webhook/services/lineMessaging.ts:62` | `sendLinePushMessage` / `pushResponseNotOk` | userId, status, lineApiErrorPreview |  | — |
| 224 | `src/domains/webhook/services/lineMessaging.ts:82` | `sendLinePushMessage` / `pushCatch` | userId | ✓ | — |
| 225 | `src/domains/webhook/services/lineMessaging.ts:108` | `formatDateToJapanese` | dateString | ✓ | — |
| 226 | `src/domains/webhook/services/lineRichMenu.ts:41` | `linkStaffRichMenu` / `linkStaffRichMenuHttpFail` | lineUserId, richMenuId, status, lineApiErrorPreview |  | — |
| 227 | `src/domains/webhook/services/lineRichMenu.ts:61` | `linkStaffRichMenu` / `linkStaffRichMenuCatch` | lineUserId | ✓ | — |
| 228 | `src/domains/webhook/services/lineRichMenu.ts:110` | `linkUserRichMenu` / `linkUserRichMenuHttpFail` | lineUserId, richMenuId, status, lineApiErrorPreview |  | — |
| 229 | `src/domains/webhook/services/lineRichMenu.ts:130` | `linkUserRichMenu` / `linkUserRichMenuCatch` | lineUserId | ✓ | — |
| 230 | `src/shared/businessHours/scheduler/scheduleGenerateNextYearBusinessHours.ts:89` | `scheduleGenerateNextYearBusinessHours` / `generateMonthFailed` | (なし) | ✓ | — |
| 231 | `src/shared/businessHours/scheduler/scheduleGenerateNextYearBusinessHours.ts:100` | `scheduleGenerateNextYearBusinessHours` / `taskOuterCatch` | (なし) | ✓ | — |
| 232 | `src/shared/config/configLoader.ts:106` | `getStoreConfig` / `config_read` | code, reason, message | ✓ | — |
| 233 | `src/shared/config/payrollConfigLoader.ts:102` | `getPayrollConfig` / `config_read` | code, reason, message | ✓ | — |
| 234 | `src/shared/config/schedulerConfigLoader.ts:219` | `getSchedulerConfig` / `config_read` | code, reason, message | ✓ | — |
| 235 | `src/shared/devices/callables/registerDevice.ts:84` | `registerDevice` | installationId, uid | ✓ | — |
| 236 | `src/shared/devices/callables/updateDeviceOptions.ts:100` | `updateDeviceOptions` / `updateDeviceOptionsCatch` | callerUid, deviceId | ✓ | — |
| 237 | `src/shared/devices/callables/updateDeviceRole.ts:72` | `updateDeviceRole` / `updateDeviceRoleCatch` | callerUid, deviceId | ✓ | — |
| 238 | `src/shared/http/controlHook.ts:98` | `controlHookHttp` / `validateControlHookRequest` | (なし) | ✓ | — |
| 239 | `src/shared/http/controlHook.ts:300` | `controlHookHttp` / `executeNewPayloadTask` | (なし) | ✓ | — |
| 240 | `src/shared/http/controlHook.ts:439` | `controlHookHttp` / `executeLegacyPayloadTask` | (なし) | ✓ | — |

## 4. 所見（自動集計）

- **明示 context なし ＋ FC 到達候補なし（または非 FC）**: 28 件
  - このカテゴリは `payload.context` が空になり得るため、相関キーの観点で**要確認**。
- **明示 context あり ＋ FC 到達候補なし（または非 FC）**: 218 件
  - 呼び出しに書かれたキーだけが `context` に載る。相関十分性は **呼び出しのキー集合**で判定できる。
- **FC ブランチ ＋ 同関数内 FC throw あり**: 23 件
  - **errorKey ごと**に throw 時の context が異なり得る。上表 §2 を基準に errorKey 単位で判定が必要。

> 本書は機械的な近似情報である。最終的な「相関キー十分性」は、ドメインごとに定めた**最小相関キー**（例: `userId`, `billId`, `deviceId`, `tournamentId`, `templateId` 等）と §1–§3 の実キーを突き合わせて判断する。
