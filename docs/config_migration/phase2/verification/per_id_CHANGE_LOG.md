# per_id 実装確認 修正ログ

per_id 内の各ファイルを用いた実装確認を行い、**修正を行った際**に本ファイルにログを残す。  
詳細な修正内容（どのファイルの何を、なぜ、どのように変更したか）を記載する。

---

## ログ形式

| 日付 | 対象 ID（per_id ファイル） | 修正内容の概要 |
|------|---------------------------|----------------|
| YYYY-MM-DD | xxx | 1行要約 |

各エントリの直下に、**詳細な修正内容**を記載する。

---

## ログエントリ

| 日付 | 対象 ID（per_id ファイル） | 修正内容の概要 |
|------|---------------------------|----------------|
| 2025-03-04 | D04_linePlan（Task 4 完了） | D-04 検証を DONE に。linePlan.md 詳細記載、取得失敗時・設定の不具合時に linePlan 追記。テスト 5 套パス。実機テストスキップ |
| 2025-03-04 | R10_businessHoursStyles（Task 4 完了） | R-10 検証を DONE に。businessHoursStyles.md 詳細記載、取得失敗時・設定の不具合時に businessHoursStyles 追記。テスト 3 套パス。実機テストスキップ |
| 2025-03-04 | D10_autoOpenClose（Task 4 完了） | D-10 検証を DONE に。autoOpenClose.md 詳細記載、取得失敗時・設定の不具合時に autoOpenClose 追記。テスト 5 套パス。実機テストスキップ |
| 2025-03-04 | CALC_BUFFER（Task 4 完了） | ⑦-b 完了。取得失敗時・設定の不具合時に calcBufferMinutes 追記。calcBufferMinutesBoundary.spec.ts で configLoader の jest.unmock を追加し境界バッファ動作検証 |
| 2026-03-05 | D08（取り消し） | D-08 検証時に誤って行った更新を取り消し。D-07 完了時の状態に戻す。features.md から enqueueSchedulerEnabled 削除、運用時資料 2 ファイルから削除、D08_enqueueScheduler.md をテンプレートに戻す、per_id_PROGRESS を未着手に |
| 2026-03-05 | D08_enqueueScheduler（Task 4 完了） | D-08 検証を DONE に。デフォルト値を true に変更。enqueueSchedulerEnabled を features.md に追記、運用時資料 2 ファイルに記載。実機テストスキップ |
| 2026-03-05 | R07_payroll（⑦-b 完了） | R-07 検証を DONE に。getPayrollData に endDay=0 対応追加。実機テストスキップ |
| 2026-03-05 | R07_payroll（⑦-a 完了） | R-07 ⑦-a 完了。payroll.md 詳細記載、取得失敗時・設定の不具合時に payroll 追記。getPayrollData を startDay/endDay 使用に修正 |
| 2026-03-07 | D07_dualWrite（Task 4 完了） | D-07 検証を DONE に。dualWriteEnabled を features.md に追記、運用時資料 2 ファイルに記載。実機テストスキップ |
| 2026-03-07 | D05_settlementAggregator（Task 4 完了） | D-05 検証を DONE に。実機テストスキップ。§1 確認結果欄完了、per_id_PROGRESS 更新 |
| 2026-03-07 | D05_settlementAggregator（2-2 対応） | configLoader にエラーコード（CONFIG_FALLBACK, CONFIG_READ_ERROR）追加、運用時資料・PROCEDURE 更新 |
| 2026-03-05 | D05_settlementAggregator（configLoader） | 取得失敗時に throw せず defaults を返すよう変更 |
| 2026-03-07 | D09_templateBusinessDateCheck（Task 4 完了） | デフォルト値を true に変更。features.md 追記、運用時資料 2 ファイルに templateBusinessDateCheck 追記 |
| 2026-03-10 | R06_entranceFee（Task 4 ⑦-b 完了） | ①〜⑦-b 完了。billing_entranceFee.md 詳細記載、取得失敗時・設定の不具合時の billing 行に entranceFee 追記 |
| 2026-03-10 | R11_R12_billing（Task 4 ⑦-b 完了） | ⑦-b 完了。per_id 全項目完了に更新、per_id_PROGRESS を完了に |
| 2026-03-04 | R09_requiredStaffByTimeSlot（Task 4 完了） | getRequiredStaffByTimeSlot を helpers に共通化、5 callables から import。shift.md に requiredStaffByTimeSlot 詳細記載、取得失敗時・設定の不具合時に追記。実機テストスキップ |
| 2026-03-11 | R08_shiftFlow（Functions config 連動） | helpers.ts の isInShiftSchedulingPeriod を config 連動に修正。createMultipleShifts・updateShiftRequest で getStoreConfig から schedulingStartDay を取得して渡す。shiftHomePage の募集作成メッセージを config 連動に。 |

**2026-03-11（R-08 Functions config 連動）の詳細**: helpers.ts から SHIFT_SUBMISSION_* / SHIFT_SCHEDULING_* 定数を削除。isInShiftSchedulingPeriod(dateKey, schedulingStartDay) の第2引数を追加し、呼び出し元で config から取得した値を渡すように変更。createMultipleShifts.ts・updateShiftRequest.ts で getStoreConfig() により schedulingStartDay を取得し、isInShiftSchedulingPeriod に渡す。shiftHomePage.dart の「募集作成は②期間（前月16日〜22日）のみ可能です。」を config の shiftSchedulingStartDay を使用するよう修正。shift.md を更新（Functions の config 連動を記載）。

**2026-03-10（R11/R12 ⑦-a まで）の詳細**: ① §1 実装確認で verifyPaymentSplit の pointPriority フォールバックに問題を検知。config 未設定かつ client 未送信時に `?? []` で空配列を渡すと、支払い分割計算でポイントが使われない。正しくは DEFAULT_POINT_PRIORITY を使用する必要がある。`verifyPaymentSplit.ts` を修正: `?? []` を `?? DEFAULT_POINT_PRIORITY` に変更、defaults から import 追加。⑦-a: billing_sideGameChipRate.md / billing_paymentPolicy.md を詳細記載。取得失敗時の挙動設計・設定の不具合時の対応に billing を追記。verifyPaymentSplit 8 テストパス。GAP-3-4（aggregator grossIncl）は R11/R12 スコープ外として別対応。

**2026-03-04（R-09 Task 4 完了）の詳細**: ① で §1 の「getRequiredStaffByTimeSlot 共通化」未実施を検知。② で `functions/src/domains/shift/services/helpers.ts` に `getRequiredStaffByTimeSlot()` を export 追加（getStoreConfig から shift.requiredStaffByTimeSlot を返す）。finalizeDay / finalizeMonth / updateDayAssignments / interimConfirmRequests / setSufficientOverride の 5 callables からローカル定義を削除し、helpers の getRequiredStaffByTimeSlot を import するよう変更。helpers の findInsufficientTimeSlots 上のコメントを「GlobalConstants.requiredStaffByTimeSlot を使用」から「getStoreConfig().shift.requiredStaffByTimeSlot を呼び出し元から渡す」に修正。⑦-a で shift.md に requiredStaffByTimeSlot の設定説明・取得失敗時・不具合時・現状持ちうる値・影響ファイル一覧を記載。⑦-b で取得失敗時の挙動設計・設定の不具合時の対応に shift.requiredStaffByTimeSlot を追記。テスト 3 套（phase2_migration, configLoader, systemHealth）パス。実機テストスキップ。

**2026-03-07（D-09 Task 4 完了）の詳細**: ユーザー指示により templateBusinessDateCheck のデフォルト値を `false` から `true` に変更。変更箇所: `functions/src/shared/config/defaults.ts`、`lib/services/store_config_defaults.dart`、`createScheduledTournament.ts` / `createTournamentRecurrence.ts` / `generateRecurringTournamentsCore.ts` の `?? false` を `?? true` に変更。features.md に templateBusinessDateCheck の詳細を追記。取得失敗時の挙動設計・設定の不具合時の対応に templateBusinessDateCheck を追加（原則に従った内容）。実機テストスキップ。

**2026-03-05（D-08 Task 4 完了）の詳細**: D-08 検証を DONE に。§1〜§3 確認済み。ユーザー指示により enqueueSchedulerEnabled のデフォルト値を `false` から `true` に変更（defaults.ts, store_config_defaults.dart）。features.md に enqueueSchedulerEnabled の詳細を追記。取得失敗時の挙動設計・設定の不具合時の対応に enqueueSchedulerEnabled を追加。テスト 4 套パス。実機テストスキップ。

**2026-03-05（R-07 ⑦-b 完了）の詳細**: 実装確認・テスト全パス。getPayrollData に endDay=0（月を跨がない期間）の対応を追加。R07_payroll.md、per_id_PROGRESS を Done に更新。実機テストはスキップ。

**2026-03-05（R-07 ⑦-a 完了）の詳細**: payroll.md をスケルトンから詳細版に更新（設定説明、取得失敗時、不具合時、現状持ちうる値、影響ファイル一覧）。取得失敗時の挙動設計・設定の不具合時の対応に payrollStartDay / payrollEndDay を追記。R07_payroll.md の取得失敗時・切り戻しセクションを記入。getPayrollData.ts を修正し、Flutter から渡される startDay/endDay を使用するよう変更（従来は 26/25 をハードコードしていた）。monthlyPayrollTrigger.ts を config 連動に修正（getStoreConfig で payroll を取得し、期間計算に startDay/endDay を使用。endDay=0 の場合は当月末日を使用）。

**2026-03-07（D-07 Task 4 完了）の詳細**: D-07 検証を DONE に。§1 全項目・§2 GAP 対応を確認。features.md に dualWriteEnabled の詳細を追記。取得失敗時の挙動設計・設定の不具合時の対応に dualWriteEnabled を追加。テスト 4 套パス。実機テストスキップ。

**2026-03-07（D-05 Task 4 完了）の詳細**: D-05 検証を DONE に。実機テストはスキップ。§1 Task 4 確認結果を全項目 ✅ に更新。実装確認結果の §1, §2 を完了状態に更新。per_id_PROGRESS を「完了」に変更。Functions テスト 4 套（bills.onSettle, configLoader, phase2_migration, systemHealth）パス確認済み。

**2026-03-07（2-2 対応）の詳細**: GAP-2-2 設定の不具合時の対応として、`configLoader.ts` に `CONFIG_ERROR_CODES`（CONFIG_FALLBACK, CONFIG_READ_ERROR, CONFIG_SKIP）を定義し、config_fallback / config_read_error ログに `code` フィールドを追加。プロジェクト横断でクエリ可能に。D-05 の 2-1/2-2 仕様を確定し、`取得失敗時の挙動設計.md`、`設定の不具合時の対応.md`、`per_id_TASK4_PROCEDURE.md`、D05_settlementAggregator.md、features.md を更新。エラーコード形式を PROCEDURE に記載。

**2026-03-05 の詳細**: GAP-2-1 方針（取得失敗時はデフォルトを返す）に合わせ、`functions/src/shared/config/configLoader.ts` を修正。従来は Firestore 読み取り失敗（リトライ後も）の場合に `throw` していたが、`config_read_error` をログ出力した上で `buildFromDefaults()` を返すように変更。DECISION_LOG D-0020 参照。

**2025-03-04（CALC_BUFFER Task 4 完了）の詳細**: ⑦-a ユーザー承認後、⑦-b を実施。`取得失敗時の挙動設計.md` に calcBufferMinutes（デフォルト 70、読めない時は A. デフォルトを正とする）を追記。`設定の不具合時の対応.md` に calcBufferMinutes（A〜D 原則どおり、数値のため常にデフォルトで実行可能）を追記。CALC_BUFFER.md の要件7・8を完了に更新。per_id_PROGRESS を完了に変更。calcBufferMinutesBoundary.spec.ts に jest.unmock('configLoader') を追加し、Firestore から config を読み込んで境界バッファの動作を検証（5 tests passed）。実機テストスキップ。
