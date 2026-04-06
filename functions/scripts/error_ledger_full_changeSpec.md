<!-- §13 の「行」は該当 catch ブロックの開始–終了行。E はマップ未登録 functionEntry の logOpsError 呼び出し行（同一キーで複数行あり得る）。生成: node scripts/buildErrorLedgerMarkdown.mjs -->

| # | 区分 | service | functionEntry | ファイル（functions/ からの相対） | 行 | サイト種別 | 内容（省略なし） | 実装状況 | 推奨対応 | 備考 |
|---|------|---------|---------------|-----------------------------------|-----|------------|------------------|----------|----------|------|
| 1 | 共通基盤 | （resolve） | （呼び出し依存） | src/shared/logging/logOpsError.ts | 90-176 | logOpsError実装 | payload に errorSource / service 等 | 実装済み | 対象外確定 |  |
| 2 | 共通基盤 | （resolve） | （同上） | src/shared/logging/functionCustomError.ts | 全文 | 型 | FunctionCustomError | 実装済み | 対象外確定 |  |
| 3 | 共通基盤 | （resolve） | （同上） | src/shared/logging/externalFromCause.ts | 全文 | 抽出 | extractExternalFromCause | 実装済み | 対象外確定 |  |
| 4 | 共通基盤 | （resolve） | （同上） | src/shared/logging/serviceByFunctionEntry.ts | 2-223 | マップ | SERVICE_BY_FUNCTION_ENTRY（主表＋export 外） | 実装済み | マップ追記 | コード上の functionEntry 文字列のうち0件が未登録→unknown_service |
| 5 | §13 | accounting | getBillPreviewTotals | src/domains/bills/callables/getBillPreviewTotals.ts | 174-188 | catch | logOpsError + sourceProductHint firestore | 実装済み | 対象外確定 | §13#1 |
| 6 | §13 | orders | placeOrderByUser | src/domains/itemOrder/callables/placeOrderByUser.ts | 177-187 | catch | 条件付き logOpsError（非 HttpsError のみ） | 実装済み | 対象外確定 | §13#2 |
| 7 | §13 | store | closeStoreTerminal | src/domains/storeMeta/callables/closeStoreTerminal.ts | 81-93 | catch | acquireProcessing の catch 内 logOpsError（FunctionCustomError 時） | 実装済み | 対象外確定 | §13#3 |
| 8 | §13 | store | continueBusinessTerminal | src/domains/storeMeta/callables/continueBusinessTerminal.ts | 150-171 | catch | logOpsError + cloud_tasks | 実装済み | 対象外確定 | §13#4 |
| 9 | §13 | store | createInitialStateDocCallable | src/domains/storeMeta/callables/createInitialStateDocCallable.ts | 48-60 | catch | logOpsError + firestore hint | 実装済み | 対象外確定 | §13#5 |
| 10 | §13 | store | initializeStoreConfigCallable | src/domains/storeMeta/callables/initializeStoreConfigCallable.ts | 144-156 | catch | logOpsError | 実装済み | 対象外確定 | §13#6 |
| 11 | §13 | store | openStoreTerminal | src/domains/storeMeta/callables/openStoreTerminal.ts | 65-77 | catch | acquireProcessing の catch 内 logOpsError（FunctionCustomError 時） | 実装済み | 対象外確定 | §13#7 |
| 12 | §13 | close_process | updateUnclockedAttendanceWithAuth | src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts | 122-135 | catch | logOpsError | 実装済み | 対象外確定 | §13#8 |
| 13 | §13 | close_process | applyCloseSnapshot | src/domains/storeMeta/services/applyCloseSnapshot.ts | 186-195 | catch | logOpsError なし（HttpsError 再throw） | 保留 | 保留維持 | §13#9 |
| 14 | §13 | close_process | getCloseIntegrityData | src/domains/storeMeta/services/getCloseIntegrityData.ts | 49-62 | catch | logOpsError | 実装済み | 対象外確定 | §13#10 |
| 15 | §13 | close_process | getUnclockedStaffForClose | src/domains/storeMeta/services/getUnclockedStaffForClose.ts | 58-71 | catch | logOpsError | 実装済み | 対象外確定 | §13#11 |
| 16 | §13 | close_process | getUnclosedTournamentsForClose | src/domains/storeMeta/services/getUnclosedTournamentsForClose.ts | 175-188 | catch | logOpsError | 実装済み | 対象外確定 | §13#12 |
| 17 | §13 | close_process | getUnsettledBillsForClose | src/domains/storeMeta/services/getUnsettledBillsForClose.ts | 94-107 | catch | logOpsError | 実装済み | 対象外確定 | §13#13 |
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
| 35 | A-throw | （推定） | （該当 callable） | src/domains/bills/callables/accounting.ts | 416 | throw | throw new HttpsError('failed-precondition', 'この請求書はまだ会計開始されていません'); | 未対応 | FCE/errorKey | §8§12 |
| 36 | A-throw | （推定） | （該当 callable） | src/domains/bills/callables/accounting.ts | 421 | throw | throw new HttpsError('failed-precondition', 'この請求書は既に会計済みです'); | 未対応 | FCE/errorKey | §8§12 |
| 37 | A-throw | （推定） | （該当 callable） | src/domains/bills/callables/accounting.ts | 563 | throw | throw new HttpsError('failed-precondition', 'この請求書はまだ会計開始されていません'); | 未対応 | FCE/errorKey | §8§12 |
| 38 | A-throw | （推定） | （該当 callable） | src/domains/bills/callables/accounting.ts | 568 | throw | throw new HttpsError('failed-precondition', 'この請求書は既に会計済みです'); | 未対応 | FCE/errorKey | §8§12 |
| 39 | A-throw | （推定） | （該当 callable） | src/domains/bills/callables/updateActiveBill.ts | 107 | throw | throw new HttpsError('failed-precondition', '会計開始前の請求書のみ修正可能です'); | 未対応 | FCE/errorKey | §8§12 |
| 40 | A-throw | （推定） | （該当 callable） | src/domains/bills/repos/appendExtra.ts | 122 | throw | throw new HttpsError('failed-precondition', `Cannot append extra to bill with status: ${status}`); | 未対応 | FCE/errorKey | §8§12 |
| 41 | A-throw | （推定） | （該当 callable） | src/domains/bills/repos/appendItem.ts | 152 | throw | throw new HttpsError('failed-precondition', `Cannot append item to bill with status: ${status}`); | 未対応 | FCE/errorKey | §8§12 |
| 42 | A-throw | （推定） | （該当 callable） | src/domains/bills/repos/appendSideGameChip.ts | 156 | throw | throw new HttpsError('failed-precondition', `Cannot append sideGameChip to bill with status: ${status}`); | 未対応 | FCE/errorKey | §8§12 |
| 43 | A-throw | （推定） | （該当 callable） | src/domains/bills/repos/recordTournamentAction.ts | 153 | throw | throw new HttpsError('failed-precondition', `Cannot record tournament action for bill with status: ${status}`); | 未対応 | FCE/errorKey | §8§12 |
| 44 | A-throw | （推定） | （該当 callable） | src/domains/bills/repos/updatePlace.ts | 81 | throw | throw new HttpsError('failed-precondition', 'Cannot update place for settled bill'); | 未対応 | FCE/errorKey | §8§12 |
| 45 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/callables/closeAssessmentTask.ts | 53 | throw | throw new Error('storeMeta/currentBusinessDay が見つかりません'); | 未対応 | FCE/errorKey | §8§12 |
| 46 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/callables/closeStore.ts | 44 | throw | throw new HttpsError('failed-precondition', 'Store is already closed'); | 未対応 | FCE/errorKey | §8§12 |
| 47 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/callables/continueBusinessTerminal.ts | 53 | throw | throw new HttpsError('failed-precondition', 'storeMeta/currentBusinessDay が存在しません。'); | 未対応 | FCE/errorKey | §8§12 |
| 48 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/callables/continueBusinessTerminal.ts | 82 | throw | throw new HttpsError('failed-precondition', 'storeMeta/currentBusinessDay が存在しません。'); | 未対応 | FCE/errorKey | §8§12 |
| 49 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/callables/openAssessmentTask.ts | 53 | throw | throw new Error('storeMeta/currentBusinessDay が見つかりません'); | 未対応 | FCE/errorKey | §8§12 |
| 50 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/callables/openStore.ts | 71 | throw | throw new HttpsError('failed-precondition', 'Store is already running'); | 未対応 | FCE/errorKey | §8§12 |
| 51 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts | 63 | throw | throw new HttpsError('already-exists', 'すでに退勤記録が存在します'); | 未対応 | FCE/errorKey | §8§12 |
| 52 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts | 66 | throw | throw new HttpsError('failed-precondition', '出勤記録がありません'); | 未対応 | FCE/errorKey | §8§12 |
| 53 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts | 72 | throw | throw new HttpsError('failed-precondition', '出勤時刻より過去の退勤時間は登録できません'); | 未対応 | FCE/errorKey | §8§12 |
| 54 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/scheduler/weeklyPlanner.ts | 54 | throw | throw new Error(`Invalid targetWeekStartDate: ${dateKey}`); | 未対応 | FCE/errorKey | §8§12 |
| 55 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/scheduler/weeklyPlanner.ts | 129 | throw | throw new Error(`businessHoursMonthlyMap/${yearMonth} が見つかりません`); | 未対応 | FCE/errorKey | §8§12 |
| 56 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/addTableToTournament.ts | 57 | throw | throw new Error('テーブルが存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 57 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/addTableToTournament.ts | 62 | throw | throw new Error('テーブルは使用中です'); | 未対応 | FCE/errorKey | §8§12 |
| 58 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/addon.ts | 56 | throw | throw new Error('無効なデータが送信されました'); | 未対応 | FCE/errorKey | §8§12 |
| 59 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/addon.ts | 78 | throw | throw new Error('トーナメントが存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 60 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/addon.ts | 95 | throw | throw new Error('このトーナメントではAddonができません'); | 未対応 | FCE/errorKey | §8§12 |
| 61 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/addon.ts | 99 | throw | throw new Error('トーナメントのtemplateIdが存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 62 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/addon.ts | 107 | throw | throw new Error(`ユーザー ${userId} のactiveStaysドキュメントが存在しません`); | 未対応 | FCE/errorKey | §8§12 |
| 63 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/addon.ts | 114 | throw | throw new Error(`ユーザー ${userId} のactiveStaysにbillIdが設定されていません`); | 未対応 | FCE/errorKey | §8§12 |
| 64 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/addon.ts | 132 | throw | throw new Error('既にAddon処理済みです'); | 未対応 | FCE/errorKey | §8§12 |
| 65 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/addon.ts | 146 | throw | throw new Error('トーナメントのviews/mainドキュメントが存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 66 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/api.pause.ts | 63 | throw | throw new HttpsError('failed-precondition', `Tournament is not running. Current status: ${tournamentData.status}`); | 未対応 | FCE/errorKey | §8§12 |
| 67 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/api.pause.ts | 67 | throw | throw new HttpsError('failed-precondition', `Runtime is not running. Current status: ${runtimeData.status}`); | 未対応 | FCE/errorKey | §8§12 |
| 68 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/api.pause.ts | 72 | throw | throw new HttpsError('failed-precondition', 'Tournament is already paused'); | 未対応 | FCE/errorKey | §8§12 |
| 69 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/api.resume.ts | 63 | throw | throw new HttpsError('failed-precondition', `Tournament is not paused. Current status: ${tournamentData.status}`); | 未対応 | FCE/errorKey | §8§12 |
| 70 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/api.resume.ts | 67 | throw | throw new HttpsError('failed-precondition', `Runtime is not paused. Current status: ${runtimeData.status}`); | 未対応 | FCE/errorKey | §8§12 |
| 71 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/api.resume.ts | 72 | throw | throw new HttpsError('failed-precondition', 'Tournament is not currently paused'); | 未対応 | FCE/errorKey | §8§12 |
| 72 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts | 63 | throw | throw new Error('テーブルが存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 73 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts | 68 | throw | throw new Error('テーブルが無効です'); | 未対応 | FCE/errorKey | §8§12 |
| 74 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts | 75 | throw | throw new Error('指定されたシートは既に使用中です'); | 未対応 | FCE/errorKey | §8§12 |
| 75 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts | 92 | throw | throw new Error(`ユーザー ${userId} のactiveStaysドキュメントが存在しません`); | 未対応 | FCE/errorKey | §8§12 |
| 76 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts | 99 | throw | throw new Error(`ユーザー ${userId} のactiveStaysにbillIdが設定されていません`); | 未対応 | FCE/errorKey | §8§12 |
| 77 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bulkAddon.ts | 54 | throw | throw new Error('無効なデータが送信されました'); | 未対応 | FCE/errorKey | §8§12 |
| 78 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bulkAddon.ts | 75 | throw | throw new Error('トーナメントが存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 79 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bulkAddon.ts | 92 | throw | throw new Error('このトーナメントではAddonができません'); | 未対応 | FCE/errorKey | §8§12 |
| 80 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bulkAddon.ts | 96 | throw | throw new Error('トーナメントのtemplateIdが存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 81 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bulkAddon.ts | 109 | throw | throw new Error('トーナメントのviews/mainドキュメントが存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 82 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bulkAddon.ts | 157 | throw | throw new Error(`以下のユーザーのactiveStaysドキュメントが見つからないか、billIdが設定されていません: ${missingUsers.join(', ')}`); | 未対応 | FCE/errorKey | §8§12 |
| 83 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bulkAddon.ts | 161 | throw | throw new Error('処理可能なユーザーがいません（全員既にAddon済みです）'); | 未対応 | FCE/errorKey | §8§12 |
| 84 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bustAndExit.ts | 86 | throw | throw new Error(`テーブル ${tableId} が存在しません`); | 未対応 | FCE/errorKey | §8§12 |
| 85 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bustAndExit.ts | 90 | throw | throw new Error('トーナメントのviews/mainドキュメントが存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 86 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bustAndExit.ts | 95 | throw | throw new Error(`ユーザー ${userId} のactiveStaysドキュメントが存在しません`); | 未対応 | FCE/errorKey | §8§12 |
| 87 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bustAndExit.ts | 102 | throw | throw new Error(`ユーザー ${userId} のactiveStaysにbillIdが設定されていません`); | 未対応 | FCE/errorKey | §8§12 |
| 88 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bustAndExit.ts | 115 | throw | throw new Error(`シート ${seatNumber} には別のユーザーが座っています`); | 未対応 | FCE/errorKey | §8§12 |
| 89 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bustAndReentry.ts | 60 | throw | throw new Error('トーナメントが存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 90 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bustAndReentry.ts | 71 | throw | throw new Error('トーナメントのtemplateIdが存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 91 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bustAndReentry.ts | 79 | throw | throw new Error('トーナメントテンプレートが存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 92 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bustAndReentry.ts | 87 | throw | throw new Error(`ユーザー ${userId} のactiveStaysドキュメントが存在しません`); | 未対応 | FCE/errorKey | §8§12 |
| 93 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bustAndReentry.ts | 94 | throw | throw new Error(`ユーザー ${userId} のactiveStaysにbillIdが設定されていません`); | 未対応 | FCE/errorKey | §8§12 |
| 94 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bustAndReentry.ts | 113 | throw | throw new Error('リエントリー制限に達しています'); | 未対応 | FCE/errorKey | §8§12 |
| 95 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bustAndReentry.ts | 126 | throw | throw new Error('テーブルシート情報が存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 96 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bustAndReentry.ts | 138 | throw | throw new Error('指定されたシートにユーザーが座っていません'); | 未対応 | FCE/errorKey | §8§12 |
| 97 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/bustAndReentry.ts | 150 | throw | throw new Error('トーナメントのviews/mainドキュメントが存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 98 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/createTemporaryTable.ts | 52 | throw | throw new Error(`テーブル名 "${tableName}" は既に使用されています`); | 未対応 | FCE/errorKey | §8§12 |
| 99 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/getRankingData.ts | 31 | throw | throw new HttpsError('failed-precondition', 'プライズの確定が行われていないため、先にプライズ確定を行ってください'); | 未対応 | FCE/errorKey | §8§12 |
| 100 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/registerForTournament.ts | 22 | throw | throw new Error('認証が必要です'); | 未対応 | FCE/errorKey | §8§12 |
| 101 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/registerForTournament.ts | 51 | throw | throw new Error('トーナメントのスナップショット情報が存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 102 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/registerForTournament.ts | 55 | throw | throw new Error('トーナメントのtemplateIdが存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 103 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/registerForTournament.ts | 66 | throw | throw new Error(`ユーザー ${userId} のactiveStaysドキュメントが存在しません`); | 未対応 | FCE/errorKey | §8§12 |
| 104 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/registerForTournament.ts | 73 | throw | throw new Error(`ユーザー ${userId} のactiveStaysにbillIdが設定されていません`); | 未対応 | FCE/errorKey | §8§12 |
| 105 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/registerForTournament.ts | 102 | throw | throw new Error('トーナメントのviews/mainドキュメントが存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 106 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/registerParticipants.ts | 73 | throw | throw new Error('トーナメントが存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 107 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/registerParticipants.ts | 82 | throw | throw new Error('トーナメントのスナップショット情報が存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 108 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/registerParticipants.ts | 86 | throw | throw new Error('トーナメントのtemplateIdが存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 109 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/registerParticipants.ts | 105 | throw | throw new Error(`ユーザー ${userId} のactiveStaysドキュメントが存在しません`); | 未対応 | FCE/errorKey | §8§12 |
| 110 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/registerParticipants.ts | 112 | throw | throw new Error(`ユーザー ${userId} のactiveStaysにbillIdが設定されていません`); | 未対応 | FCE/errorKey | §8§12 |
| 111 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/registerParticipants.ts | 127 | throw | throw new Error('トーナメントのviews/mainドキュメントが存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 112 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/removeTableFromTournament.ts | 61 | throw | throw new Error('トーナメントに該当する卓が見つかりません'); | 未対応 | FCE/errorKey | §8§12 |
| 113 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/removeTableFromTournament.ts | 73 | throw | throw new Error('着席しているユーザーがいるため、卓を削除できません'); | 未対応 | FCE/errorKey | §8§12 |
| 114 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/removeTableFromTournament.ts | 77 | throw | throw new Error('テーブルが存在しません'); | 未対応 | FCE/errorKey | §8§12 |
| 115 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/reseatAllPlayers.ts | 87 | throw | throw new Error(`ユーザー ${userId} のactiveStaysドキュメントが存在しません`); | 未対応 | FCE/errorKey | §8§12 |
| 116 | A-throw | （推定） | （該当 callable） | src/domains/tournament_activeTournament/callables/reseatAllPlayers.ts | 94 | throw | throw new Error(`ユーザー ${userId} のactiveStaysにbillIdが設定されていません`); | 未対応 | FCE/errorKey | §8§12 |
| 117 | A-throw | （推定） | （該当 callable） | src/domains/tournament_createTournament/callables/createScheduledTournament.ts | 158 | throw | throw new HttpsError('failed-precondition', 'アーカイブされたテンプレートは使用できません'); | 未対応 | FCE/errorKey | §8§12 |
| 118 | A-throw | （推定） | （該当 callable） | src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts | 293 | throw | throw new Error("Both rangeStartAt and rangeEndAt are required when explicit range is used"); | 未対応 | FCE/errorKey | §8§12 |
| 119 | A-throw | （推定） | （該当 callable） | src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts | 304 | throw | throw new Error("Invalid enqueue rangeStartAt/rangeEndAt"); | 未対応 | FCE/errorKey | §8§12 |
| 120 | A-throw | （推定） | （該当 callable） | src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts | 307 | throw | throw new Error("enqueue rangeStartAt must be before rangeEndAt"); | 未対応 | FCE/errorKey | §8§12 |
| 121 | A-throw | （推定） | （該当 callable） | src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts | 39 | throw | throw new Error(`Invalid ${fieldName}: ${dateKey}`); | 未対応 | FCE/errorKey | §8§12 |
| 122 | A-throw | （推定） | （該当 callable） | src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts | 46 | throw | throw new Error(`Invalid ${fieldName}: ${dateKey}`); | 未対応 | FCE/errorKey | §8§12 |
| 123 | A-throw | （推定） | verifyPaymentSplit 内部 | src/domains/bills/services/paymentSplitCalculator.ts | 54-56 | throw | throw new Error('selectedBaseMethod must be one of: cash, credit_card, electronic_money'); | 未対応 | 追加実装 | 複数行を1行に結合 |
| 124 | A-throw | （推定） | verifyPaymentSplit 内部 | src/domains/bills/services/paymentSplitCalculator.ts | 177-179 | throw | throw new Error(`計算結果の整合性エラー: 計算合計(${totalCalculated}) != 元の合計(${totalBill})`); | 未対応 | 追加実装 | 複数行を1行に結合 |
| 125 | return | accounting | getOpenBills | src/domains/bills/callables/getOpenBills.ts | 47 | return | return { success: false, error: "入店中ユーザーの取得に失敗しました" }; | 対象外 | 対象外確定 | §3 契約変更対象外 |
| 126 | return | tournament | validateEndTournament | src/domains/tournament_activeTournament/callables/validateEndTournament.ts | 59 | return | return { success: false, ...validationResult }; | 対象外 | 対象外確定 | §3 |
| 127 | return | tournament | validateEndTournament | src/domains/tournament_activeTournament/callables/validateEndTournament.ts | 66 | return | return { success: false, ...validationResult }; | 対象外 | 対象外確定 | §3 |
| 128 | return | tournament | validateEndTournament | src/domains/tournament_activeTournament/callables/validateEndTournament.ts | 91 | return | return { success: false, ...validationResult }; | 対象外 | 対象外確定 | §3 |
| 129 | return | tournament | validateEndTournament | src/domains/tournament_activeTournament/callables/validateEndTournament.ts | 132 | return | return { success: false, ...validationResult }; | 対象外 | 対象外確定 | §3 |
| 130 | return | tournament | validateEndTournament | src/domains/tournament_activeTournament/callables/validateEndTournament.ts | 179 | return | return { success: false, ...validationResult }; | 対象外 | 対象外確定 | §3 |
| 131 | B観測 | accounting | dualWriteTodaysBillsSkeleton | src/domains/bills/repos/dualWrite.ts | 67-75 | catch | catch { logger.warn(...) } | 未対応 | logOpsError 要否判断 |  |
| 132 | B観測 | accounting | startAccounting 内 legacy デュアルライト | src/domains/bills/repos/startAccounting.ts | 206-215 | catch | catch { logger.warn } | 未対応 | 同上 |  |
| 133 | catch | accounting | completeAccounting | src/domains/bills/callables/accounting.ts | 507-513 | catch | logOpsError（failureType 除去・operation 付与） | 実装済み | 対象外確定 |  |
| 134 | catch | accounting | completeAccountingV2 | src/domains/bills/callables/accounting.ts | 645-650 | catch | 同上 | 実装済み | 対象外確定 |  |
| 135 | D | platform | getStoreConfig | src/shared/config/configLoader.ts | 105 | logOpsError | sourceProductHint firestore（failureType 除去） | 実装済み | 対象外確定 |  |
| 136 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 25 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 137 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 34 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 138 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 62 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 139 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 82 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 140 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 108 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 141 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 152 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 142 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 161 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 143 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 204 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 144 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 224 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 145 | 境界 | user | manualCheckIn | src/domains/user/callables/manualCheckIn.ts | 161-177 | catch | FunctionCustomError 分岐 + logOpsError | 実装済み | 対象外確定 | createBill 経路 |
| 146 | 境界 | user | processVisitByQR | src/domains/user/callables/processVisitByQR.ts | 210-228 | catch | FunctionCustomError 分岐 + logOpsError | 実装済み | 対象外確定 |  |
