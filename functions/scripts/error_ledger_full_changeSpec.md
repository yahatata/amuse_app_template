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
| 35 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/callables/temporaryUnlockAlreadyRunningDifferentDateTerminal.ts | 120 | throw | throw new HttpsError('failed-precondition', 'storeMeta/currentBusinessDay が存在しません。'); | 未対応 | FCE/errorKey | §8§12 |
| 36 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts | 63 | throw | throw new HttpsError('already-exists', 'すでに退勤記録が存在します'); | 未対応 | FCE/errorKey | §8§12 |
| 37 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts | 66 | throw | throw new HttpsError('failed-precondition', '出勤記録がありません'); | 未対応 | FCE/errorKey | §8§12 |
| 38 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts | 72 | throw | throw new HttpsError('failed-precondition', '出勤時刻より過去の退勤時間は登録できません'); | 未対応 | FCE/errorKey | §8§12 |
| 39 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/scheduler/weeklyPlanner.ts | 54 | throw | throw new Error(`Invalid targetWeekStartDate: ${dateKey}`); | 未対応 | FCE/errorKey | §8§12 |
| 40 | A-throw | （推定） | （該当 callable） | src/domains/storeMeta/scheduler/weeklyPlanner.ts | 129 | throw | throw new Error(`businessHoursMonthlyMap/${yearMonth} が見つかりません`); | 未対応 | FCE/errorKey | §8§12 |
| 41 | A-throw | （推定） | verifyPaymentSplit 内部 | src/domains/bills/services/paymentSplitCalculator.ts | 54-56 | throw | throw new Error('selectedBaseMethod must be one of: cash, credit_card, electronic_money'); | 未対応 | 追加実装 | 複数行を1行に結合 |
| 42 | A-throw | （推定） | verifyPaymentSplit 内部 | src/domains/bills/services/paymentSplitCalculator.ts | 177-179 | throw | throw new Error(`計算結果の整合性エラー: 計算合計(${totalCalculated}) != 元の合計(${totalBill})`); | 未対応 | 追加実装 | 複数行を1行に結合 |
| 43 | return | accounting | getOpenBills | src/domains/bills/callables/getOpenBills.ts | 47 | return | return { success: false, error: "入店中ユーザーの取得に失敗しました" }; | 対象外 | 対象外確定 | §3 契約変更対象外 |
| 44 | return | tournament | validateEndTournament | src/domains/tournament_activeTournament/callables/validateEndTournament.ts | 59 | return | return { success: false, ...validationResult }; | 対象外 | 対象外確定 | §3 |
| 45 | return | tournament | validateEndTournament | src/domains/tournament_activeTournament/callables/validateEndTournament.ts | 66 | return | return { success: false, ...validationResult }; | 対象外 | 対象外確定 | §3 |
| 46 | return | tournament | validateEndTournament | src/domains/tournament_activeTournament/callables/validateEndTournament.ts | 91 | return | return { success: false, ...validationResult }; | 対象外 | 対象外確定 | §3 |
| 47 | return | tournament | validateEndTournament | src/domains/tournament_activeTournament/callables/validateEndTournament.ts | 132 | return | return { success: false, ...validationResult }; | 対象外 | 対象外確定 | §3 |
| 48 | return | tournament | validateEndTournament | src/domains/tournament_activeTournament/callables/validateEndTournament.ts | 179 | return | return { success: false, ...validationResult }; | 対象外 | 対象外確定 | §3 |
| 49 | B観測 | accounting | dualWriteTodaysBillsSkeleton | src/domains/bills/repos/dualWrite.ts | 67-75 | catch | catch { logger.warn(...) } | 未対応 | logOpsError 要否判断 |  |
| 50 | B観測 | accounting | startAccounting 内 legacy デュアルライト | src/domains/bills/repos/startAccounting.ts | 206-215 | catch | catch { logger.warn } | 未対応 | 同上 |  |
| 51 | catch | accounting | completeAccounting | src/domains/bills/callables/accounting.ts | 507-513 | catch | logOpsError（failureType 除去・operation 付与） | 実装済み | 対象外確定 |  |
| 52 | catch | accounting | completeAccountingV2 | src/domains/bills/callables/accounting.ts | 645-650 | catch | 同上 | 実装済み | 対象外確定 |  |
| 53 | D | platform | getStoreConfig | src/shared/config/configLoader.ts | 105 | logOpsError | sourceProductHint firestore（failureType 除去） | 実装済み | 対象外確定 |  |
| 54 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 25 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 55 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 34 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 56 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 62 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 57 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 82 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 58 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 108 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 59 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 152 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 60 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 161 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 61 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 204 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 62 | D | line | sendLinePushMessage 等 | src/domains/webhook/services/lineMessaging.ts | 224 | logOpsError | LINE（failureType 除去・external_api 補助） | 実装済み | 対象外確定 |  |
| 63 | 境界 | user | manualCheckIn | src/domains/user/callables/manualCheckIn.ts | 161-177 | catch | FunctionCustomError 分岐 + logOpsError | 実装済み | 対象外確定 | createBill 経路 |
| 64 | 境界 | user | processVisitByQR | src/domains/user/callables/processVisitByQR.ts | 210-228 | catch | FunctionCustomError 分岐 + logOpsError | 実装済み | 対象外確定 |  |
