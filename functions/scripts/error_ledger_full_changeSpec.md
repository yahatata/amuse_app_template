<!-- §13 の「行」は該当 catch ブロックの開始–終了行。E はマップ未登録 functionEntry の logOpsError 呼び出し行（同一キーで複数行あり得る）。生成: node scripts/buildErrorLedgerMarkdown.mjs -->

| # | 区分 | service | functionEntry | ファイル（functions/ からの相対） | 行 | サイト種別 | 内容（省略なし） | 実装状況 | 推奨対応 | 備考 |
|---|------|---------|---------------|-----------------------------------|-----|------------|------------------|----------|----------|------|
| 1 | 共通基盤 | （resolve） | （呼び出し依存） | src/shared/logging/logOpsError.ts | 90-176 | logOpsError実装 | payload に errorSource / service 等 | 実装済み | 対象外確定 |  |
| 2 | 共通基盤 | （resolve） | （同上） | src/shared/logging/functionCustomError.ts | 全文 | 型 | FunctionCustomError | 実装済み | 対象外確定 |  |
| 3 | 共通基盤 | （resolve） | （同上） | src/shared/logging/externalFromCause.ts | 全文 | 抽出 | extractExternalFromCause | 実装済み | 対象外確定 |  |
| 4 | 共通基盤 | （resolve） | （同上） | src/shared/logging/serviceByFunctionEntry.ts | 2-223 | マップ | SERVICE_BY_FUNCTION_ENTRY（主表＋export 外） | 実装済み | マップ追記 | コード上の functionEntry 文字列のうち14件が未登録→unknown_service |
| 5 | §13 | accounting | getBillPreviewTotals | src/domains/bills/callables/getBillPreviewTotals.ts | 174-188 | catch | logOpsError + sourceProductHint firestore | 実装済み | 対象外確定 | §13#1 |
| 6 | §13 | orders | placeOrderByUser | src/domains/itemOrder/callables/placeOrderByUser.ts | 177-187 | catch | 条件付き logOpsError（非 HttpsError のみ） | 実装済み | 対象外確定 | §13#2 |
| 7 | §13 | store | closeStoreTerminal | src/domains/storeMeta/callables/closeStoreTerminal.ts | 81-93 | catch | acquireProcessing の catch 内 logOpsError（FunctionCustomError 時） | 実装済み | 対象外確定 | §13#3 |
| 8 | §13 | store | continueBusinessTerminal | src/domains/storeMeta/callables/continueBusinessTerminal.ts | 150-171 | catch | logOpsError + cloud_tasks | 実装済み | 対象外確定 | §13#4 |
| 9 | §13 | store | createInitialStateDocCallable | src/domains/storeMeta/callables/createInitialStateDocCallable.ts | 48-60 | catch | logOpsError + firestore hint | 実装済み | 対象外確定 | §13#5 |
| 10 | §13 | store | initializeStoreConfigCallable | src/domains/storeMeta/callables/initializeStoreConfigCallable.ts | 144-156 | catch | logOpsError | 実装済み | 対象外確定 | §13#6 |
| 11 | §13 | store | openStoreTerminal | src/domains/storeMeta/callables/openStoreTerminal.ts | 65-77 | catch | acquireProcessing の catch 内 logOpsError（FunctionCustomError 時） | 実装済み | 対象外確定 | §13#7 |
| 12 | §13 | store | updateUnclockedAttendanceWithAuth | src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts | 122-135 | catch | logOpsError | 実装済み | 対象外確定 | §13#8 |
| 13 | §13 | store | applyCloseSnapshot | src/domains/storeMeta/services/applyCloseSnapshot.ts | 186-195 | catch | logOpsError なし（HttpsError 再throw） | 保留 | 保留維持 | §13#9 |
| 14 | §13 | store | getCloseIntegrityData | src/domains/storeMeta/services/getCloseIntegrityData.ts | 49-62 | catch | logOpsError | 実装済み | 対象外確定 | §13#10 |
| 15 | §13 | store | getUnclockedStaffForClose | src/domains/storeMeta/services/getUnclockedStaffForClose.ts | 58-71 | catch | logOpsError | 実装済み | 対象外確定 | §13#11 |
| 16 | §13 | store | getUnclosedTournamentsForClose | src/domains/storeMeta/services/getUnclosedTournamentsForClose.ts | 175-188 | catch | logOpsError | 実装済み | 対象外確定 | §13#12 |
| 17 | §13 | store | getUnsettledBillsForClose | src/domains/storeMeta/services/getUnsettledBillsForClose.ts | 94-107 | catch | logOpsError | 実装済み | 対象外確定 | §13#13 |
| 18 | §13 | platform | updateDeviceOptions | src/shared/devices/callables/updateDeviceOptions.ts | 90-105 | catch | logOpsError | 実装済み | 対象外確定 | §13#14 |
| 19 | §13 | platform | updateDeviceRole | src/shared/devices/callables/updateDeviceRole.ts | 62-77 | catch | logOpsError | 実装済み | 対象外確定 | §13#15 |
| 20 | 固定6 | accounting | startAccounting | src/domains/bills/repos/startAccounting.ts | 238-247 | logOpsError | FunctionCustomError 経路 + operation | 実装済み | 対象外確定 | 固定6 |
| 21 | 固定6 | accounting | startAccounting | src/domains/bills/repos/startAccounting.ts | 252-263 | logOpsError | 非 FCE 経路 | 実装済み | 対象外確定 | 固定6 |
| 22 | 固定6 | user相当 | createBillWithActiveStay | src/domains/bills/repos/createBillWithActiveStay.ts | 249-260 | logOpsError | FCE 経路（対応表 export 外キー） | 実装済み | 対象外確定 | 固定6 |
| 23 | 固定6 | user相当 | createBillWithActiveStay | src/domains/bills/repos/createBillWithActiveStay.ts | 265-275 | logOpsError | 非 FCE | 実装済み | 対象外確定 | 固定6 |
| 24 | 固定6 | tournament | registerForTournament | src/domains/tournament_activeTournament/callables/registerForTournament.ts | 221 | logOpsError | operation 分解 | 実装済み | 対象外確定 | 固定6 |
| 25 | 固定6 | tournament | registerForTournament | src/domains/tournament_activeTournament/callables/registerForTournament.ts | 265 | logOpsError | operation 分解 | 実装済み | 対象外確定 | 固定6 |
| 26 | 固定6 | tournament | registerForTournament | src/domains/tournament_activeTournament/callables/registerForTournament.ts | 286 | logOpsError | operation 分解 | 実装済み | 対象外確定 | 固定6 |
| 27 | 固定6 | platform | controlHookHttp | src/shared/http/controlHook.ts | 98-103 | logOpsError | validateControlHookRequest | 実装済み | 対象外確定 | 固定6 |
| 28 | 固定6 | platform | controlHookHttp | src/shared/http/controlHook.ts | 300-306 | logOpsError | executeNewPayloadTask | 実装済み | 対象外確定 | 固定6 |
| 29 | 固定6 | platform | controlHookHttp | src/shared/http/controlHook.ts | 439-445 | logOpsError | executeLegacyPayloadTask | 実装済み | 対象外確定 | 固定6 |
| 30 | 固定6 | tournament_schedule | runEnqueueTournamentTasks | src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts | 240-247 | logOpsError | enqueueTournamentTask + cloud_tasks | 実装済み | 対象外確定 | 固定6 |
| 31 | 固定6 | store | getCurrentBusinessDateKeyOrThrow | src/domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow.ts | 80-86 | logOpsError | resolveCurrentBusinessDate + errorKey | 実装済み | 対象外確定 | 固定6 |
| 32 | 固定6 | store | getCurrentBusinessDateKeyOrThrow | src/domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow.ts | 95-101 | logOpsError | 同上 | 実装済み | 対象外確定 | 固定6 |
| 33 | 固定6 | store | getCurrentBusinessDateKeyOrThrow | src/domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow.ts | 115-121 | logOpsError | 同上 | 実装済み | 対象外確定 | 固定6 |
| 34 | 固定6 | store | getCurrentBusinessDateKeyOrThrow | src/domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow.ts | 131-137 | logOpsError | loadFirestoreStateDoc | 実装済み | 対象外確定 | 固定6 |
| 35 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/adjustments.ts | 161 | throw | throw new Error(`adjustmentType is not in current-scope set: ${adjustmentType as string}`); | 未対応 | FCE/errorKey | §8§12 |
| 36 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/adjustments.ts | 164 | throw | throw new Error(`adjustmentAmountIncl must be a finite number, got: ${String(adjustmentAmountIncl)}`); | 未対応 | FCE/errorKey | §8§12 |
| 37 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/adjustments.ts | 167 | throw | throw new Error(`adjustmentAmountIncl must be > 0, got: ${adjustmentAmountIncl}`); | 未対応 | FCE/errorKey | §8§12 |
| 38 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/adjustments.ts | 191 | throw | throw new Error('lines must contain at least 1 entry (line-less adjustment is forbidden)'); | 未対応 | FCE/errorKey | §8§12 |
| 39 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/adjustments.ts | 199 | throw | throw new Error(`line.targetCategory is not in current-scope set: ${line.targetCategory as string}`); | 未対応 | FCE/errorKey | §8§12 |
| 40 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/adjustments.ts | 204 | throw | throw new Error( | 未対応 | FCE/errorKey | §8§12 |
| 41 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/adjustments.ts | 211 | throw | throw new Error('tournament line requires targetId (templateId / templateKey)'); | 未対応 | FCE/errorKey | §8§12 |
| 42 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/adjustments.ts | 216 | throw | throw new Error('line.targetName must be a non-empty string'); | 未対応 | FCE/errorKey | §8§12 |
| 43 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/adjustments.ts | 223 | throw | throw new Error('line.amountInclDelta must be a finite number'); | 未対応 | FCE/errorKey | §8§12 |
| 44 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/adjustments.ts | 227 | throw | throw new Error('line.qtyDelta must be a finite number'); | 未対応 | FCE/errorKey | §8§12 |
| 45 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/adjustments.ts | 231 | throw | throw new Error( | 未対応 | FCE/errorKey | §8§12 |
| 46 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/adjustments.ts | 237 | throw | throw new Error( | 未対応 | FCE/errorKey | §8§12 |
| 47 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/adjustments.ts | 247 | throw | throw new Error( | 未対応 | FCE/errorKey | §8§12 |
| 48 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/adjustments.ts | 431 | throw | throw new Error( | 未対応 | FCE/errorKey | §8§12 |
| 49 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 103 | throw | throw new Error('methodBreakdown must contain at least 1 entry'); | 未対応 | FCE/errorKey | §8§12 |
| 50 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 109 | throw | throw new Error('methodBreakdown[].method must be a non-empty string'); | 未対応 | FCE/errorKey | §8§12 |
| 51 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 112 | throw | throw new Error( | 未対応 | FCE/errorKey | §8§12 |
| 52 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 121 | throw | throw new Error( | 未対応 | FCE/errorKey | §8§12 |
| 53 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 129 | throw | throw new Error( | 未対応 | FCE/errorKey | §8§12 |
| 54 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 158 | throw | throw new Error('allocations must contain at least 1 entry (allocation-less cashAction is forbidden)'); | 未対応 | FCE/errorKey | §8§12 |
| 55 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 171 | throw | throw new Error('allocations[].adjustmentId must be a non-empty string'); | 未対応 | FCE/errorKey | §8§12 |
| 56 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 178 | throw | throw new Error( | 未対応 | FCE/errorKey | §8§12 |
| 57 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 183 | throw | throw new Error( | 未対応 | FCE/errorKey | §8§12 |
| 58 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 191 | throw | throw new Error( | 未対応 | FCE/errorKey | §8§12 |
| 59 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 196 | throw | throw new Error( | 未対応 | FCE/errorKey | §8§12 |
| 60 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 201 | throw | throw new Error( | 未対応 | FCE/errorKey | §8§12 |
| 61 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 206 | throw | throw new Error( | 未対応 | FCE/errorKey | §8§12 |
| 62 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 211 | throw | throw new Error( | 未対応 | FCE/errorKey | §8§12 |
| 63 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 216 | throw | throw new Error( | 未対応 | FCE/errorKey | §8§12 |
| 64 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 225 | throw | throw new Error( | 未対応 | FCE/errorKey | §8§12 |
| 65 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 263 | throw | throw new Error(`cashAction.amountIncl must be > 0 finite number, got: ${String(amountIncl)}`); | 未対応 | FCE/errorKey | §8§12 |
| 66 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 266 | throw | throw new Error(`cashActionType must be 'refund' or 'collection', got: ${cashActionType as string}`); | 未対応 | FCE/errorKey | §8§12 |
| 67 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 269 | throw | throw new Error('cashAction.cashflowBusinessDate must be a non-empty string'); | 未対応 | FCE/errorKey | §8§12 |
| 68 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 278 | throw | throw new Error('allocations must contain at least 1 entry'); | 未対応 | FCE/errorKey | §8§12 |
| 69 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 283 | throw | throw new Error('allocations[].adjustmentId must be a non-empty string'); | 未対応 | FCE/errorKey | §8§12 |
| 70 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 290 | throw | throw new Error(`allocations[].amountIncl must be > 0 finite number, got: ${String(allocation.amountIncl)}`); | 未対応 | FCE/errorKey | §8§12 |
| 71 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 295 | throw | throw new Error( | 未対応 | FCE/errorKey | §8§12 |
| 72 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 348 | throw | throw new Error( | 未対応 | FCE/errorKey | §8§12 |
| 73 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 417 | throw | throw new Error( | 未対応 | FCE/errorKey | §8§12 |
| 74 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 453 | throw | throw new Error('cashAction method must be a non-empty string'); | 未対応 | FCE/errorKey | §8§12 |
| 75 | A-throw | （推定） | （該当 callable） | src/domains/bills/services/cashActions.ts | 456 | throw | throw new Error('cashAction allocationAdjustmentId must be a non-empty string'); | 未対応 | FCE/errorKey | §8§12 |
| 76 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/callables/temporaryUnlockAlreadyRunningDifferentDateTerminal.ts | 120 | throw | throw new HttpsError('failed-precondition', 'storeMeta/currentBusinessDay が存在しません。'); | 未対応 | FCE/errorKey | §8§12 |
| 77 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts | 66 | throw | throw new HttpsError('already-exists', 'すでに退勤記録が存在します'); | 未対応 | FCE/errorKey | §8§12 |
| 78 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts | 69 | throw | throw new HttpsError('failed-precondition', '出勤記録がありません'); | 未対応 | FCE/errorKey | §8§12 |
| 79 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts | 75 | throw | throw new HttpsError('failed-precondition', '出勤時刻より過去の退勤時間は登録できません'); | 未対応 | FCE/errorKey | §8§12 |
| 80 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/scheduler/weeklyPlanner.ts | 62 | throw | throw new Error(`Invalid targetWeekStartDate: ${dateKey}`); | 未対応 | FCE/errorKey | §8§12 |
| 81 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/scheduler/weeklyPlanner.ts | 162 | throw | throw new Error(`businessHoursMonthlyMap/${yearMonth} が見つかりません`); | 未対応 | FCE/errorKey | §8§12 |
| 82 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/createOkibakeTemporaryEntry.ts | 312 | throw | throw new HttpsError('failed-precondition', txResult.message); | 未対応 | FCE/errorKey | §8§12 |
| 83 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/resolveOkibakePendingReviewWithRemotePayment.ts | 133 | throw | throw new HttpsError('failed-precondition', 'この operationId は失敗済みです。'); | 未対応 | FCE/errorKey | §8§12 |
| 84 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/resolveOkibakePendingReviewWithRemotePayment.ts | 164 | throw | throw new HttpsError('failed-precondition', 'この operationId は失敗済みです。'); | 未対応 | FCE/errorKey | §8§12 |
| 85 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/resolveOkibakePendingReviewWithRemotePayment.ts | 178 | throw | if (!templateId) throw new HttpsError('failed-precondition', 'templateId がありません'); | 未対応 | FCE/errorKey | §8§12 |
| 86 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/lib/assertOkibakePendingReviewResolvable.ts | 45 | throw | throw new HttpsError('failed-precondition', 'すでに伝票へ紐付け済みです', { | 未対応 | FCE/errorKey | §8§12 |
| 87 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/lib/assertOkibakePendingReviewResolvable.ts | 50 | throw | throw new HttpsError('failed-precondition', 'pending_review のみ処理できます', { | 未対応 | FCE/errorKey | §8§12 |
| 88 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/lib/assertOkibakePendingReviewResolvable.ts | 58 | throw | throw new HttpsError('failed-precondition', 'entryStatus が不正です', { | 未対応 | FCE/errorKey | §8§12 |
| 89 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/lib/assertOkibakePendingReviewResolvable.ts | 73 | throw | throw new HttpsError('failed-precondition', 'linkedUserId が未設定です', { | 未対応 | FCE/errorKey | §8§12 |
| 90 | return | accounting | getOpenBills | src/domains/bills/callables/getOpenBills.ts | 47 | return | return { success: false, error: "入店中ユーザーの取得に失敗しました" }; | 対象外 | 対象外確定 | §3 契約変更対象外 |
| 91 | return | tournament | validateEndTournament | src/domains/tournament_activeTournament/callables/validateEndTournament.ts | 59 | return | return { success: false, ...validationResult }; | 対象外 | 対象外確定 | §3 |
| 92 | return | tournament | validateEndTournament | src/domains/tournament_activeTournament/callables/validateEndTournament.ts | 66 | return | return { success: false, ...validationResult }; | 対象外 | 対象外確定 | §3 |
| 93 | return | tournament | validateEndTournament | src/domains/tournament_activeTournament/callables/validateEndTournament.ts | 91 | return | return { success: false, ...validationResult }; | 対象外 | 対象外確定 | §3 |
| 94 | return | tournament | validateEndTournament | src/domains/tournament_activeTournament/callables/validateEndTournament.ts | 132 | return | return { success: false, ...validationResult }; | 対象外 | 対象外確定 | §3 |
| 95 | return | tournament | validateEndTournament | src/domains/tournament_activeTournament/callables/validateEndTournament.ts | 179 | return | return { success: false, ...validationResult }; | 対象外 | 対象外確定 | §3 |
| 96 | B観測 | accounting | dualWriteTodaysBillsSkeleton | src/domains/bills/repos/dualWrite.ts | 67-75 | catch | catch { logger.warn(...) } | 未対応 | logOpsError 要否判断 |  |
| 97 | B観測 | accounting | startAccounting 内 legacy デュアルライト | src/domains/bills/repos/startAccounting.ts | 206-215 | catch | catch { logger.warn } | 未対応 | 同上 |  |
| 98 | catch | accounting | completeAccounting | src/domains/bills/callables/accounting.ts | 507-513 | catch | logOpsError（failureType 除去・operation 付与） | 実装済み | 対象外確定 |  |
| 99 | catch | accounting | completeAccountingV2 | src/domains/bills/callables/accounting.ts | 645-650 | catch | 同上 | 実装済み | 対象外確定 |  |
| 100 | E | unknown_service になりうる | billsEventsOnCreate | src/unused_function_lib/triggers/billsEventsOnCreate.ts | 31 | logOpsError | functionEntry: 'billsEventsOnCreate', | 未対応 | 対応表 + マップ同期 |  |
| 101 | E | unknown_service になりうる | billsEventsOnCreate | src/unused_function_lib/triggers/billsEventsOnCreate.ts | 209 | logOpsError | functionEntry: 'billsEventsOnCreate', | 未対応 | 対応表 + マップ同期 |  |
| 102 | E | unknown_service になりうる | billsEventsOnCreate | src/unused_function_lib/triggers/billsEventsOnCreate.ts | 223 | logOpsError | functionEntry: 'billsEventsOnCreate', | 未対応 | 対応表 + マップ同期 |  |
| 103 | E | unknown_service になりうる | getRefundHistory | src/unused_function_lib/callables/refundProcessing.ts | 137 | logOpsError | functionEntry: 'getRefundHistory', | 未対応 | 対応表 + マップ同期 |  |
| 104 | E | unknown_service になりうる | getRefundHistory | src/unused_function_lib/callables/refundProcessing.ts | 157 | logOpsError | functionEntry: 'getRefundHistory', | 未対応 | 対応表 + マップ同期 |  |
| 105 | E | unknown_service になりうる | postEventAdjustment | src/unused_function_lib/repos/postEventAdjustment.ts | 241 | logOpsError | functionEntry: 'postEventAdjustment', | 未対応 | 対応表 + マップ同期 |  |
| 106 | E | unknown_service になりうる | postEventAdjustment | src/unused_function_lib/repos/postEventAdjustment.ts | 258 | logOpsError | functionEntry: 'postEventAdjustment', | 未対応 | 対応表 + マップ同期 |  |
| 107 | E | unknown_service になりうる | postEventCancel | src/unused_function_lib/repos/postEventCancel.ts | 180 | logOpsError | functionEntry: 'postEventCancel', | 未対応 | 対応表 + マップ同期 |  |
| 108 | E | unknown_service になりうる | postEventCancel | src/unused_function_lib/repos/postEventCancel.ts | 195 | logOpsError | functionEntry: 'postEventCancel', | 未対応 | 対応表 + マップ同期 |  |
| 109 | E | unknown_service になりうる | postEventRefund | src/unused_function_lib/repos/postEventRefund.ts | 251 | logOpsError | functionEntry: 'postEventRefund', | 未対応 | 対応表 + マップ同期 |  |
| 110 | E | unknown_service になりうる | postEventRefund | src/unused_function_lib/repos/postEventRefund.ts | 267 | logOpsError | functionEntry: 'postEventRefund', | 未対応 | 対応表 + マップ同期 |  |
| 111 | E | unknown_service になりうる | postEventReopen | src/unused_function_lib/repos/postEventReopen.ts | 167 | logOpsError | functionEntry: 'postEventReopen', | 未対応 | 対応表 + マップ同期 |  |
| 112 | E | unknown_service になりうる | postEventReopen | src/unused_function_lib/repos/postEventReopen.ts | 182 | logOpsError | functionEntry: 'postEventReopen', | 未対応 | 対応表 + マップ同期 |  |
| 113 | E | unknown_service になりうる | processRefund | src/unused_function_lib/callables/refundProcessing.ts | 66 | logOpsError | functionEntry: 'processRefund', | 未対応 | 対応表 + マップ同期 |  |
| 114 | E | unknown_service になりうる | processRefund | src/unused_function_lib/callables/refundProcessing.ts | 95 | logOpsError | functionEntry: 'processRefund', | 未対応 | 対応表 + マップ同期 |  |
| 115 | E | unknown_service になりうる | undoOkibakeAssignSeat | src/domains/logs/services/undoOkibakeAssignSeat.ts | 146 | logOpsError | functionEntry: 'undoOkibakeAssignSeat', | 未対応 | 対応表 + マップ同期 |  |
| 116 | E | unknown_service になりうる | undoOkibakeAssignSeat | src/domains/logs/services/undoOkibakeAssignSeat.ts | 155 | logOpsError | functionEntry: 'undoOkibakeAssignSeat', | 未対応 | 対応表 + マップ同期 |  |
| 117 | E | unknown_service になりうる | undoOkibakeBust | src/domains/logs/services/undoOkibakeBust.ts | 210 | logOpsError | functionEntry: 'undoOkibakeBust', | 未対応 | 対応表 + マップ同期 |  |
| 118 | E | unknown_service になりうる | undoOkibakeBust | src/domains/logs/services/undoOkibakeBust.ts | 220 | logOpsError | functionEntry: 'undoOkibakeBust', | 未対応 | 対応表 + マップ同期 |  |
| 119 | E | unknown_service になりうる | undoOkibakeCreateEntry | src/domains/logs/services/undoOkibakeCreateEntry.ts | 118 | logOpsError | functionEntry: 'undoOkibakeCreateEntry', | 未対応 | 対応表 + マップ同期 |  |
| 120 | E | unknown_service になりうる | undoOkibakeCreateEntry | src/domains/logs/services/undoOkibakeCreateEntry.ts | 127 | logOpsError | functionEntry: 'undoOkibakeCreateEntry', | 未対応 | 対応表 + マップ同期 |  |
| 121 | E | unknown_service になりうる | undoOkibakeLinkToBill | src/domains/logs/services/undoOkibakeLinkToBill.ts | 402 | logOpsError | functionEntry: 'undoOkibakeLinkToBill', | 未対応 | 対応表 + マップ同期 |  |
| 122 | E | unknown_service になりうる | undoOkibakeLinkToBill | src/domains/logs/services/undoOkibakeLinkToBill.ts | 412 | logOpsError | functionEntry: 'undoOkibakeLinkToBill', | 未対応 | 対応表 + マップ同期 |  |
| 123 | E | unknown_service になりうる | undoOkibakeUpdateLinkedUser | src/domains/logs/services/undoOkibakeUpdateLinkedUser.ts | 105 | logOpsError | functionEntry: 'undoOkibakeUpdateLinkedUser', | 未対応 | 対応表 + マップ同期 |  |
| 124 | E | unknown_service になりうる | undoOkibakeUpdateLinkedUser | src/domains/logs/services/undoOkibakeUpdateLinkedUser.ts | 114 | logOpsError | functionEntry: 'undoOkibakeUpdateLinkedUser', | 未対応 | 対応表 + マップ同期 |  |
| 125 | E | unknown_service になりうる | unlinkRichMenu | src/domains/webhook/services/lineRichMenu.ts | 121 | logOpsError | functionEntry: "unlinkRichMenu", | 未対応 | 対応表 + マップ同期 |  |
| 126 | E | unknown_service になりうる | unlinkRichMenu | src/domains/webhook/services/lineRichMenu.ts | 134 | logOpsError | functionEntry: "unlinkRichMenu", | 未対応 | 対応表 + マップ同期 |  |
| 127 | E | unknown_service になりうる | unlinkRichMenu | src/domains/webhook/services/lineRichMenu.ts | 142 | logOpsError | functionEntry: "unlinkRichMenu", | 未対応 | 対応表 + マップ同期 |  |
| 128 | E | unknown_service になりうる | updateAccounting | src/unused_function_lib/callables/updateAccounting.ts | 105 | logOpsError | functionEntry: 'updateAccounting', | 未対応 | 対応表 + マップ同期 |  |
| 129 | E | unknown_service になりうる | updateAccounting | src/unused_function_lib/callables/updateAccounting.ts | 133 | logOpsError | functionEntry: 'updateAccounting', | 未対応 | 対応表 + マップ同期 |  |
| 130 | D | platform | getStoreConfig | src/shared/config/configLoader.ts | 105 | logOpsError | sourceProductHint firestore（failureType 除去） | 実装済み | 対象外確定 |  |
| 131 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 25 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 132 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 34 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 133 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 62 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 134 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 82 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 135 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 108 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 136 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 152 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 137 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 161 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 138 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 204 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 139 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 224 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 140 | 境界 | user | manualCheckIn | src/domains/user/callables/manualCheckIn.ts | 161-177 | catch | FunctionCustomError 分岐 + logOpsError | 実装済み | 対象外確定 | createBill 経路 |
| 141 | 境界 | user | processVisitByQR | src/domains/user/callables/processVisitByQR.ts | 210-228 | catch | FunctionCustomError 分岐 + logOpsError | 実装済み | 対象外確定 |  |
