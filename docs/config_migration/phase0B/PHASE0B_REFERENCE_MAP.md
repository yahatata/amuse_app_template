# Phase0B 参照箇所・使用経路マップ（タスク2 成果物）

作成日: 2026-03-04  
参照: [PHASE0B_TARGET_LIST.md](./PHASE0B_TARGET_LIST.md)

---

## 1. D-06: STORE_CLOSE_HOUR

### Functions（実運用ソース）

| ファイル | 行付近 | 利用シーン |
|----------|--------|------------|
| `functions/src/shared/time/configOps.ts` | 36-50 | `getStoreCloseHour()`: process.env / functions.config から取得 |
| `functions/src/domains/bills/callables/getAccountingHistory.ts` | 37-41 | 営業日境界で会計履歴取得 |
| `functions/src/domains/attendance/callables/determineAttendanceMode.ts` | 28-29 | 出勤モード判定 |
| `functions/src/domains/analytics/scheduler/nightlyRecalculateBalanceDue.ts` | - | Phase4 で閉店処理/Cloud Task 起動、STORE_CLOSE_HOUR 廃止 |
| `functions/src/domains/analytics/scheduler/nightlyIntegrityCheck.ts` | - | Phase4 で閉店処理/Cloud Task 起動、STORE_CLOSE_HOUR 廃止 |

※`nightlyReconciliationCheck` は Phase0B で廃止済み（unused_function_lib へ移動）

### Dart（同期メモ化、二重管理）

| ファイル | 利用シーン |
|----------|------------|
| `lib/globalConstant.dart` | 定数定義 |
| `lib/Accounting/accountingPage.dart` | `_getBusinessDate()` で営業日計算（※business_hours_migration で storeMeta 購読に移行済みの可能性あり） |
| `lib/user_actions/order_history_popup.dart` | 同上 |
| `lib/user_actions/tournament_history_popup.dart` | 同上 |
| `docs/business_hours_migration/step2_query_display_files.md` | 参照あり |

---

## 2. D-10: ENABLE_AUTO_OPEN_CLOSE, TASK_*_OFFSET_MINUTES

### Functions

| ファイル | 行付近 | 利用シーン |
|----------|--------|------------|
| `functions/src/domains/storeMeta/scheduler/weeklyPlanner.ts` | 31-45 | process.env から取得、閉店/開店タスク生成 |

### Dart

| ファイル | 行付近 | 利用シーン |
|----------|--------|------------|
| `lib/globalConstant.dart` | 72-78 | 定数定義（ENABLE_AUTO_OPEN_CLOSE, TASK_CLOSE_OFFSET_MINUTES, TASK_OPEN_OFFSET_MINUTES） |

---

## 3. R-09: requiredStaffByTimeSlot

### Functions

| ファイル | 行付近 | 利用シーン |
|----------|--------|------------|
| `functions/src/domains/shift/callables/finalizeDay.ts` | 15, 55 | `getRequiredStaffByTimeSlot()` ローカル定義、デフォルト配列 |
| `functions/src/domains/shift/callables/finalizeMonth.ts` | 16, 168 | 同上 |
| `functions/src/domains/shift/callables/updateDayAssignments.ts` | 30, 98 | 同上 |
| `functions/src/domains/shift/callables/interimConfirmRequests.ts` | 28, 183 | 同上（コメント: GlobalConstants と同期） |
| `functions/src/domains/shift/callables/setSufficientOverride.ts` | 20, 66 | 同上 |
| `functions/src/domains/shift/services/helpers.ts` | 484-487, 265 | デフォルト配列ハードコード、findInsufficientTimeSlots 等 |

### Dart

| ファイル | 行付近 | 利用シーン |
|----------|--------|------------|
| `lib/globalConstant.dart` | 175 | 定数定義 |
| `lib/StaffDate/shiftDateDialog.dart` | 777 | `GlobalConstants.requiredStaffByTimeSlot` |
| `lib/StaffDate/shiftHomePage.dart` | 1994 | 同上 |

---

## 4. R-10: businessHoursStyles, businessHoursStyle*

### Functions

| ファイル | 行付近 | 利用シーン |
|----------|--------|------------|
| `functions/src/shared/businessHours/services/styles.ts` | 4-8 | スタイル定義、コメントで「Flutter と同期必須」 |

### Dart

| ファイル | 行付近 | 利用シーン |
|----------|--------|------------|
| `lib/globalConstant.dart` | 186-206 | businessHoursStyle* 定数、businessHoursStyles マップ |
| `lib/StaffDate/businessDayEditPage.dart` | 207, 491-504, 575-591, 713 | 営業日編集 UI |

---

## 5. R-11, R-12: 会計ポリシー（categoryPaymentMethods, POINT_PRIORITY, SIDE_GAME_CHIP_*）

### Functions

| ファイル | 行付近 | 利用シーン |
|----------|--------|------------|
| `functions/src/domains/bills/services/paymentSplitCalculator.ts` | 14-58 | SIDE_GAME_CHIP_EXCHANGE_RATE, DEFAULT_POINT_PRIORITY, CATEGORY_PAYMENT_METHODS 定義 |
| `functions/src/domains/bills/callables/accounting.ts` | 10, 68, 281 | SIDE_GAME_CHIP_EXCHANGE_RATE ハードコード |
| `functions/src/domains/bills/callables/getBillPreviewTotals.ts` | 15, 118, 122 | 同上 |
| `functions/src/domains/bills/services/snapshots.ts` | 12, 454 | 同上 |
| `functions/src/domains/bills/callables/verifyPaymentSplit.ts` | 4, 38 | DEFAULT_POINT_PRIORITY 参照 |

### Dart

| ファイル | 行付近 | 利用シーン |
|----------|--------|------------|
| `lib/globalConstant.dart` | 126-144 | categoryPaymentMethods, SIDE_GAME_CHIP_EXCHANGE_RATE, POINT_PRIORITY, 丸め単位 |
| `lib/Accounting/accountingPage.dart` | 多数 | 支払い分割・チップ換算 |
| `lib/Accounting/categoryPaymentMethodDialog.dart` | 259, 385, 587-655, 800, 830 | 同上 |
| `lib/Accounting/customerAccountingDetailPage.dart` | 554 | SIDE_GAME_CHIP_EXCHANGE_RATE |
| `lib/Accounting/payment_split_test_page.dart` | 71, 322, 364, 569 | 同上 |
| `lib/Accounting/payment_split_calculator.dart` | 56-90, 129, 157, 169, 206 | 計算ロジック |

---

## 6. D-04: linePlan / LINE_PLAN

### Functions

| ファイル | 行付近 | 利用シーン |
|----------|--------|------------|
| `functions/src/domains/webhook/callables/lineWebhook.ts` | 23, 119 | defineString("LINE_PLAN"), シフト辞退制御 |
| `functions/src/domains/staff/callables/confirmShiftRequest.ts` | 7, 36 | 同上 |

### Dart

| ファイル | 行付近 | 利用シーン |
|----------|--------|------------|
| `lib/globalConstant.dart` | 149-160 | linePlan, isShiftRequestEnabled, linePlanName |

### その他

| ファイル | 利用シーン |
|----------|------------|
| `public/staff/config.js` | 25, 29 | linePlan 定義、判定 |
