# per_id 実装確認 進捗

per_id 内の各ファイルを用いた実装確認の進捗を記録する。  
更新タイミング: 各 ID の Task 4 完了時、または skip 判断時。

---

## 凡例

| ステータス | 意味 |
|------------|------|
| 未着手 | まだ確認を開始していない |
| 確認中 | ①〜③ の確認作業を行っている |
| 要修正 | ① で問題あり。② の実装固めが必要 |
| 完了 | ⑦-a 運用時資料作成・⑦-b その他ドキュメント更新まで完了 |
| skip | 該当なし・スキップと判断した場合 |

---

## 進捗一覧

| # | per_id ファイル | ステータス | メモ |
|---|-----------------|------------|------|
| 1 | D05_settlementAggregator.md | **完了** | ①〜⑦-b 完了。実機テストスキップ。テスト 4 套（bills.onSettle, configLoader, phase2_migration, systemHealth）パス |
| 2 | D07_dualWrite.md | **完了** | ①〜⑦-b 完了。実機テストスキップ。テスト 4 套（dualwrite-failure, configLoader, phase2_migration, systemHealth）パス |
| 3 | D08_enqueueScheduler.md | **完了** | ①〜⑦-b 完了。デフォルト値を true に変更。実機テストスキップ。テスト 4 套パス |
| 4 | D09_templateBusinessDateCheck.md | **完了** | ①〜⑦-b 完了。デフォルト値を true に変更。templateBusinessDateCheck を features.md に追記、運用時資料 2 ファイルに記載。実機テストスキップ |
| 5 | B06_tableDeviceRegistration.md | **完了** | ①〜⑦-b 完了。スキーマ定義のみ、実コード参照なし。features.md に tableDeviceRegistrationEnabled 追記。2 ファイルへの追記は不要。実機テストスキップ |
| 6 | CALC_BUFFER.md | **完了** | ①〜⑦-b 完了。businessDay_calcBufferMinutes.md 作成、取得失敗時・設定の不具合時に calcBufferMinutes 追記。calcBufferMinutesBoundary.spec.ts で境界バッファ動作検証。実機テストスキップ |
| 7 | D10_autoOpenClose.md | **完了** | ①〜⑦-b 完了。autoOpenClose.md 詳細記載、取得失敗時・設定の不具合時に autoOpenClose 追記。テスト 5 套パス。実機テストスキップ |
| 8 | R10_businessHoursStyles.md | **完了** | ①〜⑦-b 完了。businessHoursStyles.md 詳細記載、取得失敗時・設定の不具合時に businessHoursStyles 追記。テスト 3 套パス。実機テストスキップ |
| 9 | D04_linePlan.md | **完了** | ①〜⑦-b 完了。linePlan.md 詳細記載、取得失敗時・設定の不具合時に linePlan 追記。テスト 5 套パス。実機テストスキップ |
| 10 | R09_requiredStaffByTimeSlot.md | **完了** | ①〜⑦-b 完了。② で getRequiredStaffByTimeSlot を helpers に共通化、5 callables から import。shift.md に requiredStaffByTimeSlot 詳細記載、取得失敗時・設定の不具合時に追記。テスト 3 套パス。実機テストスキップ。 |
| 11 | R11_R12_billing.md | **完了** | ①〜⑦-b 完了。verifyPaymentSplit の pointPriority フォールバック修正。billing 系ドキュメント詳細記載。取得失敗時・設定の不具合時に追記済み。実機テストスキップ。GAP-3-4（aggregator）は別対応 |
| 12 | R06_entranceFee.md | **完了** | ①〜⑦-b 完了。billing_entranceFee.md 詳細記載、取得失敗時・設定の不具合時の billing 行に entranceFee 追記。実機テストスキップ |
| 13 | R07_payroll.md | **完了** | ①〜⑦-b 完了。実機テストスキップ。テスト 5 套（configLoader, phase2_migration, systemHealth, store_config_phase2_test, store_config_service_test）パス |
| 14 | R08_shiftFlow.md | **完了** | ①〜⑦-b 完了。shift.md 詳細記載、取得失敗時・設定の不具合時に shift 追記。実機テストスキップ。テスト 4 套パス |
| 15 | A3_configJs.md | **完了** | ①〜⑦-b 完了。§1 実装済み、GAP-3-5 解消。linePlan.md は D04 で作成済み、取得失敗時・設定の不具合時も D04 で追記済み。テスト 5 套パス。実機テストスキップ |
| 16 | A3_globalConstantCleanup.md | **完了** | ①〜⑦-b 完了。§1 移行済み定数削除確認済み、§2 残すべき定数のみ残存確認。Phase2.1 で残存定数の再検討を予定。実機テスト・運用時資料追記は不要 |
| 17 | CD_stateRecording.md | **完了** | ① 完了。ALL_ID_STATUS の記載と要件の照合。問題なし。ドキュメント確認のみ |
| 18 | Z_crossCutting.md | **完了** | ① 完了。Z-1〜Z-7、GAP-2-3 確認。検出問題は table_device §16・Phase4 D06_CONFIGOPS_CLEANUP に振り分け済み |

---

## 初回実装確認サマリ

① の確認作業完了後、本セクションに以下を記載する。

- **問題なし**: 簡潔に「問題なし」と記載
- **問題あり**: どの項目（§1 / §2 / §3）でどのような問題があったか、何をしなければならないかを記載

- **D-05**: 問題なし。§1〜§3 確認済み。GAP-2-1, 2-2 は運用時資料に記載済み。テスト 4 套パス。実機テストはスキップ。
- **D-07**: 問題なし。§1〜§3 確認済み。GAP-2-1, 2-2 のみが漏れのため②を飛ばして③に進んだ。⑦-a で dualWriteEnabled を features.md に追記、運用時資料 2 ファイルに記載済み。テスト 4 套パス。実機テストはスキップ。
- **R-07**: 問題なし。§1〜§3 確認済み。GAP-2-1, 2-2 のみが漏れのため②を飛ばして③に進んだ。①〜⑦-b 完了。payroll.md 詳細記載、取得失敗時・設定の不具合時に payroll 追記。getPayrollData・monthlyPayrollTrigger を config 連動に修正（endDay=0 対応含む）。実機テストスキップ。
- **D-08**: 問題なし。§1 で実コードを read して確認。①〜⑦-b 完了。デフォルト値を true に変更。enqueueSchedulerEnabled を features.md に追記、運用時資料 2 ファイルに記載。実機テストスキップ。
- **D-09**: 問題なし。§1 実装済み。デフォルト値を `true` に変更（defaults.ts, store_config_defaults.dart, 3 呼び出し元の `?? true`）。⑦-b 完了。templateBusinessDateCheck を features.md に追記、運用時資料 2 ファイルに記載。実機テストスキップ。
- **B-06**: 問題なし。§1 全要件実装済み（defaults.ts, types.ts, 実コード参照なし）。§2 該当なし、§3 該当なし。⑦-a で features.md に tableDeviceRegistrationEnabled 追記。スキーマ定義のみのため 2 ファイルへの追記は不要。実機テストスキップ。
- **CALC_BUFFER**: §1 全要件実装済み。calcBusinessDateHelpers は getCalcBusinessDateBufferMinutes→getStoreConfig、calcBusinessDate は async、全本番呼び出し元で await 済み。§2 GAP-2-1/2-2 のみ。⑦-a businessDay_calcBufferMinutes.md 作成、⑦-b で取得失敗時・設定の不具合時に calcBufferMinutes 追記。calcBufferMinutesBoundary.spec.ts で境界バッファ動作検証。実機テストスキップ。
- **D-10**: 問題なし。§1 全要件実装済み。weeklyPlanner.ts は getStoreConfig().autoOpenClose.* を使用、process.env 削除済み。defaults.ts に 3 フィールド定義。Dart globalConstant に該当定数なし、store_config_defaults 経由。§2 GAP-2-1/2-2 のみ。§3 該当なし。⑦-a autoOpenClose.md 詳細記載、⑦-b で取得失敗時・設定の不具合時に autoOpenClose 追記。テスト 5 套（phase2_migration, configLoader, systemHealth, store_config_phase2_test, store_config_service_test）パス。実機テストスキップ。
- **R-10**: 問題なし。§1 全要件実装済み。styles.ts は getStoreConfig().businessHoursStyles、getBusinessHoursByStyleId は async、呼び出し元 4 箇所で await。defaults.ts に 5 スタイル定義。Dart globalConstant に該当定数なし、businessDayEditPage は StoreConfigService 経由。§2 GAP-2-1/2-2 のみ。§3 該当なし。⑦-a businessHoursStyles.md 詳細記載、⑦-b で取得失敗時・設定の不具合時に businessHoursStyles 追記。テスト 3 套（phase2_migration, systemHealth, store_config_phase2_test）パス。実機テストスキップ。
- **D-04**: 問題なし。§1 全要件実装済み。lineWebhook/confirmShiftRequest は getStoreConfig().linePlan、defineString(LINE_PLAN) 削除済み。defaults.ts に linePlan 定義。Flutter globalConstant に linePlan 等なし。Web: config.js に loadLinePlanFromFirestore、staff/index.html で Firebase 初期化後に呼び出し。§2 GAP-2-1/2-2 のみ、GAP-3-5 解消。§3 該当なし。⑦-a linePlan.md 詳細記載、⑦-b で取得失敗時・設定の不具合時に linePlan 追記。テスト 5 套パス。実機テストスキップ。
- **R-09**: §1 で getRequiredStaffByTimeSlot の共通化未実施を検知。② で helpers に getRequiredStaffByTimeSlot を export、5 callables から import に変更。helpers の findInsufficientTimeSlots コメントを「GlobalConstants」から「getStoreConfig().shift.requiredStaffByTimeSlot を呼び出し元から渡す」に修正。§2 は GAP-2-1/2-2 のみ。§3 該当なし。⑦-a shift.md に requiredStaffByTimeSlot 詳細記載、⑦-b で取得失敗時・設定の不具合時に requiredStaffByTimeSlot 追記。テスト 3 套（phase2_migration, configLoader, systemHealth）パス。実機テストスキップ。
- **R-11/R-12**: ①〜⑦-b 完了。§1 全要件実装済み。verifyPaymentSplit の pointPriority フォールバック修正。⑦-a billing_sideGameChipRate.md / billing_paymentPolicy.md 詳細記載、取得失敗時・設定の不具合時に billing 追記。verifyPaymentSplit 8 テストパス。 aggregator は GAP-3-4 により別対応。実機テストスキップ。
- **R-06**: ①〜⑦-b 完了。§1 全要件実装済み。⑦-a billing_entranceFee.md 詳細記載、取得失敗時・設定の不具合時の billing 行に entranceFee を明示追記。テスト 3 套パス。実機テストスキップ。
- **R-08**: 問題なし。§1 全要件実装済み。defaults.ts, types.ts に shift 3 フィールド。Flutter globalConstant に SHIFT_* なし。shiftHomePage は StoreConfigService 参照。§2 GAP-2-1/2-2 のみ。§3 該当なし。⑦-a shift.md 詳細記載（submissionStartDay/submissionEndDay/schedulingStartDay）、⑦-b で取得失敗時・設定の不具合時に shift 追記。テスト 4 套（configLoader, phase2_migration, systemHealth, store_config_phase2_test）パス。実機テストスキップ。
- **A-3 (A3_configJs)**: 問題なし。§1 全要件実装済み。config.js に loadLinePlanFromFirestore、index.html L150-154 で Firebase 初期化後に呼び出し。GAP-3-5 解消。§2 GAP-2-1/2-2 のみ。§3 該当なし。⑦-a linePlan.md は D04 で作成済み（config.js / index.html の影響ファイル記載あり）。⑦-b 取得失敗時・設定の不具合時は D04 で linePlan 追記済み。テスト 5 套（configLoader, phase2_migration, systemHealth, store_config_phase2_test, store_config_service_test）パス。実機テストスキップ。
- **A-5 (A3_globalConstantCleanup)**: 問題なし。§1 移行済み定数は globalConstant.dart から削除済み（REQUIREMENTS_GAP_CHECK 確認）。§2 残存定数は STORE_CLOSE_HOUR, schemaVersion, menuCategories, sideGameTypes, トーナメント設定, CRON 設定, pointTypes, ADMIN_CREATED_SHIFT_ID 等、いずれも残すべき一覧に含まれる。§3 該当なし。確認タスクのため運用時資料・実機テスト不要。Phase2.1 で残存定数の再検討を予定。
- **C/D (CD_stateRecording)**: 問題なし。ALL_ID_STATUS の全項目（Deploy/Build/Run/Phase0A/Phase4）が要件通りに記録されていることを確認。ドキュメント確認のみ。
- **Z (Z_crossCutting)**: ① 完了。Z-1〜Z-7 確認。GAP-2-3 解消済み。検出問題（B-06 運用時資料、configOps return 27）は table_device §16・Phase4 D06_CONFIGOPS_CLEANUP に振り分け済み。
