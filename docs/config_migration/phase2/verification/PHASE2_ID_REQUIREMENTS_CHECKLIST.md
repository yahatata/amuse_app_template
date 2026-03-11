# Phase2 ID 別必須作業チェックリスト（Task 2① 成果物）

作成日: 2026-03-06  
参照元: PHASE2_REQUIREMENTS_LIST.md（Task 1 成果物）

---

## 本ドキュメントの目的

PHASE2_REQUIREMENTS_LIST.md の内容を **ID ごと** に「何を行わなければならなかったか」として MECE に再整理する。各 ID に対して **実装面** と **手続き面** の両方を記載する。

---

## 凡例

- **実装**: コード変更を伴う作業
- **手続き**: ドキュメント更新・設計記録等
- **横断**: 全 ID に共通で適用される要件（セクション Z に集約）

---

## 移行対象 ID（storeMeta/config 差し替え）

### D-05: ENABLE_SETTLEMENT_AGGREGATOR

| # | 区分 | 必須作業 |
|---|------|----------|
| 1 | 実装 | Functions: defineString / process.env 参照を `getStoreConfig().features.settlementAggregatorEnabled` に差し替え |
| 2 | 実装 | Functions: 旧 defineString / process.env 参照を削除 |
| 3 | 実装 | defaults.ts に `settlementAggregatorEnabled` のデフォルト値を定義（`true`） |
| 4 | 実装 | types.ts の StoreConfig 型に `features.settlementAggregatorEnabled` を含める |
| 5 | 手続き | 取得失敗時の挙動を設計・記録（defaults fallback / 処理失敗） |
| 6 | 手続き | 切り戻し手順を記録 |
| 7 | 手続き | ALL_ID_STATUS を「完了」に更新 |

---

### D-07: WRITE_TODAYS_BILLS_IN_PARALLEL（dualWrite）

| # | 区分 | 必須作業 |
|---|------|----------|
| 1 | 実装 | Functions: `shouldDualWrite()` を async 化し、`getStoreConfig().features.dualWriteEnabled` を参照 |
| 2 | 実装 | Functions: `shouldDualWrite()` の全呼び出し元を `await` 対応に修正 |
| 3 | 実装 | Functions: 旧 process.env 参照を削除 |
| 4 | 実装 | defaults.ts に `dualWriteEnabled` のデフォルト値を定義（`false`） |
| 5 | 手続き | 取得失敗時の挙動を設計・記録 |
| 6 | 手続き | 切り戻し手順を記録 |
| 7 | 手続き | ALL_ID_STATUS を「完了」に更新 |

---

### D-08: ENQUEUE_SCHEDULER_ENABLED

| # | 区分 | 必須作業 |
|---|------|----------|
| 1 | 実装 | Functions: process.env 参照を `getStoreConfig().features.enqueueSchedulerEnabled` に差し替え |
| 2 | 実装 | Functions: 旧 process.env 参照を削除 |
| 3 | 実装 | defaults.ts に `enqueueSchedulerEnabled` のデフォルト値を定義（`false`） |
| 4 | 手続き | 取得失敗時の挙動を設計・記録 |
| 5 | 手続き | 切り戻し手順を記録 |
| 6 | 手続き | ALL_ID_STATUS を「完了」に更新 |

---

### D-09: TEMPLATE_BUSINESSDATE_CHECK

| # | 区分 | 必須作業 |
|---|------|----------|
| 1 | 実装 | Functions: process.env 参照を `getStoreConfig().features.templateBusinessDateCheck` に差し替え |
| 2 | 実装 | Functions: 旧 process.env 参照を削除 |
| 3 | 実装 | defaults.ts に `templateBusinessDateCheck` のデフォルト値を定義（`false`） |
| 4 | 手続き | 取得失敗時の挙動を設計・記録 |
| 5 | 手続き | 切り戻し手順を記録 |
| 6 | 手続き | ALL_ID_STATUS を「完了」に更新 |

---

### B-06: TABLE_DEVICE_REGISTRATION_ENABLED

| # | 区分 | 必須作業 |
|---|------|----------|
| 1 | 実装 | defaults.ts に `tableDeviceRegistrationEnabled` のデフォルト値を定義（`true`） |
| 2 | 実装 | types.ts の StoreConfig 型に含める |
| 3 | 実装 | 実コード参照なし（スキーマ定義のみ。dart-define docs 記載のみだったため） |
| 4 | 手続き | ALL_ID_STATUS を「完了」に更新 |

---

### CALC_BUFFER: 営業日境界バッファ

| # | 区分 | 必須作業 |
|---|------|----------|
| 1 | 実装 | Functions: `calcBusinessDateHelpers.ts` 内の `return 70` ハードコードを `getStoreConfig().businessDay.calcBufferMinutes` に差し替え |
| 2 | 実装 | Functions: `calcBusinessDate()` を async 化。戻り値を `string` → `Promise<BusinessDateResult>` に変更 |
| 3 | 実装 | Functions: `calcBusinessDate()` の全呼び出し元を `await` 対応に修正 |
| 4 | 実装 | Functions: 旧ハードコード（`return 70`）を削除 |
| 5 | 実装 | defaults.ts に `calcBufferMinutes` のデフォルト値を定義（`70`） |
| 6 | 実装 | Dart: globalConstant から対応定数を削除（A-5 に含む） |
| 7 | 手続き | 取得失敗時の挙動を設計・記録 |
| 8 | 手続き | 切り戻し手順を記録 |
| 9 | 手続き | ALL_ID_STATUS を「完了」に更新 |

---

### D-10: 自動開閉店（ENABLE_AUTO_OPEN_CLOSE / TASK_CLOSE_OFFSET / TASK_OPEN_OFFSET）

| # | 区分 | 必須作業 |
|---|------|----------|
| 1 | 実装 | Functions: `weeklyPlanner.ts` の process.env 3 箇所を `getStoreConfig().autoOpenClose.*` に差し替え |
| 2 | 実装 | Functions: 旧 process.env 参照を削除 |
| 3 | 実装 | defaults.ts に `autoOpenClose` 3 フィールドのデフォルト値を定義 |
| 4 | 実装 | Dart: globalConstant の ENABLE_AUTO_OPEN_CLOSE / TASK_CLOSE_OFFSET_MINUTES / TASK_OPEN_OFFSET_MINUTES を削除（A-5） |
| 5 | 手続き | 取得失敗時の挙動を設計・記録 |
| 6 | 手続き | 切り戻し手順を記録 |
| 7 | 手続き | ALL_ID_STATUS を「完了」に更新 |

---

### R-10: businessHoursStyles

| # | 区分 | 必須作業 |
|---|------|----------|
| 1 | 実装 | Functions: `styles.ts` 内のスタイル定数を削除し、`getStoreConfig().businessHoursStyles` に差し替え |
| 2 | 実装 | Functions: `getBusinessHoursByStyleId()` 等を async 化し、呼び出し元を `await` 対応 |
| 3 | 実装 | Functions: 「Flutter と同期必須」コメントを撤去 |
| 4 | 実装 | defaults.ts に businessHoursStyles の全スタイル（weekday/weekendHoliday/event/allDay/closed）のデフォルト値を定義 |
| 5 | 実装 | Flutter: globalConstant の businessHoursStyle* / businessHoursStyles を削除 |
| 6 | 実装 | Flutter: businessDayEditPage.dart の参照を StoreConfigService に差し替え |
| 7 | 手続き | 取得失敗時の挙動を設計・記録 |
| 8 | 手続き | 切り戻し手順を記録 |
| 9 | 手続き | ALL_ID_STATUS を「完了」に更新 |

---

### D-04: linePlan

| # | 区分 | 必須作業 |
|---|------|----------|
| 1 | 実装 | Functions: `lineWebhook.ts` の defineString("LINE_PLAN") を `getStoreConfig().linePlan` に差し替え |
| 2 | 実装 | Functions: `confirmShiftRequest.ts` の defineString 参照を差し替え |
| 3 | 実装 | Functions: 旧 defineString 2 箇所を削除 |
| 4 | 実装 | defaults.ts に `linePlan` のデフォルト値を定義（`"communication"`） |
| 5 | 実装 | Flutter: globalConstant の linePlan / isShiftRequestEnabled / linePlanName を削除 |
| 6 | 実装 | Flutter: 該当する画面参照を StoreConfigService に差し替え |
| 7 | 実装 | Web: `public/staff/config.js` のハードコードを Firestore JS SDK 読み取りに差し替え |
| 8 | 手続き | 取得失敗時の挙動を設計・記録 |
| 9 | 手続き | 切り戻し手順を記録 |
| 10 | 手続き | ALL_ID_STATUS を「完了」に更新 |

---

### R-09: requiredStaffByTimeSlot

| # | 区分 | 必須作業 |
|---|------|----------|
| 1 | 実装 | Functions: shift callables で `getRequiredStaffByTimeSlot()`（helpers）を使用。storeMeta/requiredStaffByTimeSlot から読み取り |
| 2 | 実装 | Functions: `getRequiredStaffByTimeSlot()` ローカル定義を削除し、共通化 |
| 3 | 実装 | Functions: 旧ハードコード配列を削除 |
| 4 | 実装 | defaults.ts に `requiredStaffByTimeSlot` のデフォルト値を定義 |
| 5 | 実装 | Flutter: RequiredStaffByTimeSlotService で storeMeta/requiredStaffByTimeSlot を購読 |
| 6 | 実装 | Flutter: shiftDateDialog.dart / shiftHomePage.dart の参照を StoreConfigService に差し替え |
| 7 | 手続き | 取得失敗時の挙動を設計・記録 |
| 8 | 手続き | 切り戻し手順を記録 |
| 9 | 手続き | ALL_ID_STATUS を「完了」に更新 |

---

### R-11 / R-12: 会計ポリシー

| # | 区分 | 必須作業 |
|---|------|----------|
| 1 | 実装 | Functions: `paymentSplitCalculator.ts` の SIDE_GAME_CHIP_EXCHANGE_RATE / DEFAULT_POINT_PRIORITY / CATEGORY_PAYMENT_METHODS 定数を defaults.ts import または config 引数渡しに差し替え |
| 2 | 実装 | Functions: `accounting.ts` の SIDE_GAME_CHIP_EXCHANGE_RATE ハードコードを差し替え |
| 3 | 実装 | Functions: `getBillPreviewTotals.ts` のハードコードを差し替え |
| 4 | 実装 | Functions: `snapshots.ts` のハードコードを差し替え |
| 5 | 実装 | Functions: `verifyPaymentSplit.ts` の DEFAULT_POINT_PRIORITY 参照を差し替え |
| 6 | 実装 | Functions: 旧ハードコード（各ファイルの定数定義）を削除 |
| 7 | 実装 | Functions: pure function を維持（config を引数で渡す or defaults.ts を import） |
| 8 | 実装 | defaults.ts に sideGameChipRate / categoryPaymentMethods / pointPriority / roundingUnits のデフォルト値を定義 |
| 9 | 実装 | Flutter: globalConstant の SIDE_GAME_CHIP_EXCHANGE_RATE / categoryPaymentMethods / POINT_PRIORITY / 丸め単位を削除 |
| 10 | 実装 | Flutter: accountingPage / categoryPaymentMethodDialog / customerAccountingDetailPage / payment_split_test_page / payment_split_calculator の参照を StoreConfigService に差し替え |
| 11 | 手続き | 取得失敗時の挙動を設計・記録 |
| 12 | 手続き | 切り戻し手順を記録 |
| 13 | 手続き | ALL_ID_STATUS を「完了」に更新 |

---

### R-06: 入店料（entranceFee / entranceFeeDescription / chargeEntranceFeeOnReentry）

| # | 区分 | 必須作業 |
|---|------|----------|
| 1 | 実装 | defaults.ts に entranceFee / entranceFeeDescription / chargeEntranceFeeOnReentry のデフォルト値を定義 |
| 2 | 実装 | types.ts の StoreConfig 型に billing.entranceFee 等を含める |
| 3 | 実装 | Flutter: globalConstant の入店料定数を削除 |
| 4 | 実装 | Flutter: 該当する画面参照を StoreConfigService に差し替え |
| 5 | 手続き | 取得失敗時の挙動を設計・記録 |
| 6 | 手続き | 切り戻し手順を記録 |
| 7 | 手続き | ALL_ID_STATUS を「完了」に更新 |

---

### R-07: 給与締め（payroll.startDay / payroll.endDay）

| # | 区分 | 必須作業 |
|---|------|----------|
| 1 | 実装 | defaults.ts に payroll.startDay / payroll.endDay のデフォルト値を定義 |
| 2 | 実装 | types.ts の StoreConfig 型に payroll を含める |
| 3 | 実装 | Flutter: globalConstant の PAYROLL_START_DAY / PAYROLL_END_DAY を削除 |
| 4 | 実装 | Flutter: 該当する画面参照を StoreConfigService に差し替え |
| 5 | 手続き | 取得失敗時の挙動を設計・記録 |
| 6 | 手続き | 切り戻し手順を記録 |
| 7 | 手続き | ALL_ID_STATUS を「完了」に更新 |

---

### R-08: シフト提出・組む期間（shift.submissionStartDay / submissionEndDay / schedulingStartDay）

| # | 区分 | 必須作業 |
|---|------|----------|
| 1 | 実装 | defaults.ts に shift フロー 3 フィールドのデフォルト値を定義 |
| 2 | 実装 | types.ts の StoreConfig 型に shift を含める |
| 3 | 実装 | Flutter: globalConstant の SHIFT_SUBMISSION_START_DAY 等を削除 |
| 4 | 実装 | Flutter: shiftHomePage 等の参照を StoreConfigService に差し替え |
| 5 | 手続き | 取得失敗時の挙動を設計・記録 |
| 6 | 手続き | 切り戻し手順を記録 |
| 7 | 手続き | ALL_ID_STATUS を「完了」に更新 |

---

## Web / クリーンアップ

### A-4: public/staff/config.js

| # | 区分 | 必須作業 |
|---|------|----------|
| 1 | 実装 | config.js の linePlan / isShiftRequestEnabled のハードコードを Firestore `storeMeta/config` JS SDK 読み取りに差し替え |
| 2 | 実装 | 旧ハードコードを削除 |

---

### A-5: globalConstant.dart クリーンアップ

| # | 区分 | 必須作業 |
|---|------|----------|
| 1 | 実装 | StoreConfigService に移行した全定数を globalConstant.dart から削除 |
| 2 | 確認 | 残すべき定数のみが残っていることを確認（STORE_CLOSE_HOUR, schemaVersion, menuCategories, sideGameTypes, トーナメント設定, CRON 設定, ADMIN_CREATED_SHIFT_ID 等） |

---

## スコープ外 ID の状態記録

### B-1〜B-5: Deploy / Build / Run 既存 / Phase0A / Phase4

| # | 区分 | 必須作業 |
|---|------|----------|
| 1 | 手続き | D-02, D-03, D-11, D-14, D-15 を「完了（Deploy 維持）」として ALL_ID_STATUS に記録 |
| 2 | 手続き | B-01〜B-05, B-07 を「完了（Build 維持）」として記録 |
| 3 | 手続き | R-01〜R-05 を「完了（既に正しい SSoT）」として記録 |
| 4 | 手続き | D-01, D-12, D-13 を「完了（Phase0A 済）」として記録 |
| 5 | 手続き | D-06 を「Phase4」として記録 |

---

## Z. 全 ID 横断の必須要件

以下は個別 ID ではなく Phase2 全体に対する要件。**各 ID の実装完了時に確認・充足すべき**。

### Z-1. 取得失敗時の挙動設計（ID ごと）

| # | 必須作業 |
|---|----------|
| 1 | 各 ID について、storeMeta/config の取得に失敗した場合の挙動を設計する |
| 2 | Functions: defaults.ts へのフォールバック or 処理失敗のいずれかを選択・実装 |
| 3 | Flutter: 最後の成功値を維持する仕組みが StoreConfigService に実装済みであることを確認 |
| 4 | 設計結果を記録する |

### Z-2. 切り戻し手順（ID ごと）

| # | 必須作業 |
|---|----------|
| 1 | 各 ID について、問題発生時の切り戻し手順を記録する |
| 2 | コードデプロイによる差し替え前状態への復帰手順を含める |

### Z-3. 旧参照の即削除

| # | 必須作業 |
|---|----------|
| 1 | 差し替え完了した旧 env / 定数 / ハードコードを即削除する |
| 2 | 旧参照への fallback は実装しない |

### Z-4. defaults.ts 唯一ソースの遵守

| # | 必須作業 |
|---|----------|
| 1 | TS ファイル内の直書き（フォールバック優先度③）を Phase2 で削除する |
| 2 | デフォルト値は defaults.ts にのみ定義し、他のファイルで重複定義しない |

### Z-5. ログ仕様

| # | 必須作業 |
|---|----------|
| 1 | configLoader でフォールバック時に `config_fallback` warn ログを出力 |
| 2 | configLoader で読み取り失敗時に `config_read_error` error ログを出力 |
| 3 | 構造化ログ形式を使用 |

### Z-6. ドキュメント更新

| # | 必須作業 |
|---|----------|
| 1 | CHANGE_LOG にエントリを追加 |
| 2 | 計画外の追加仕様がある場合、DECISION_LOG に記録 |
| 3 | ALL_ID_STATUS で全 ID の状態を確定 |
| 4 | tobe_config_architecture の読み取り優先度を ①→② のみに更新（③削除の反映） |

### Z-7. ゲート通過

| # | 必須作業 |
|---|----------|
| 1 | `npx tsc --noEmit` パス |
| 2 | `flutter analyze` エラー 0 |
