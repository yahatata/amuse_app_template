# 営業時間移行で追加・修正したファイル一覧

`docs/business_hours_migration` 内の各 Phase/Step の implementation_summary・changeSpec・implementation_changes に記載された「追加・修正ファイル」を集約した一覧です。  
**出典**: 各ドキュメントの「作成・修正ファイル一覧」「実装一覧」「変更ファイル一覧」等。

---

## 凡例

- **追加（新規）**: 当該 Phase/Step で新規作成されたファイル
- **修正（更新）**: 当該 Phase/Step で変更された既存ファイル

同一ファイルが複数 Phase で修正されている場合は、該当する Phase をすべて記載しています。

---

## 1. Phase1: state doc 導入

| 種別 | ファイル |
|------|----------|
| 追加 | `functions/src/helpers/stateDoc/types.ts` |
| 追加 | `functions/src/helpers/stateDoc/getCurrentBusinessDateKeyOrThrow.ts` |
| 追加 | `functions/src/helpers/stateDoc/generateJstDateKey.ts` |
| 追加 | `functions/src/helpers/stateDoc/index.ts` |
| 追加 | `functions/src/scripts/createInitialStateDoc.ts` |
| 追加 | `functions/src/storeManagement/openStore.ts` |
| 追加 | `functions/src/storeManagement/closeStore.ts` |
| 追加 | `functions/src/storeManagement/createInitialStateDocCallable.ts` |
| 追加 | `functions/src/storeManagement/index.ts` |
| 修正 | `functions/src/index.ts` |
| 修正 | `functions/src/helpers/billsApi/createBillWithActiveStay.ts` |
| 修正 | `firestore.rules` |
| 修正 | `lib/Home/terminalHomePage.dart` |

---

## 2. Phase2: businessHoursMonthlyMap 導入

| 種別 | ファイル |
|------|----------|
| 追加 | `functions/src/helpers/billsApi/calcBusinessDateHelpers.ts` |
| 追加 | `lib/utils/business_date_ambiguous_dialog.dart` |
| 修正 | `functions/src/helpers/billsApi/types.ts` |
| 修正 | `functions/src/helpers/billsApi/calcBusinessDate.ts` |
| 修正 | `functions/src/helpers/billsApi/postEventAdjustment.ts` |
| 修正 | `functions/src/helpers/billsApi/postEventReopen.ts` |
| 修正 | `functions/src/helpers/billsApi/postEventRefund.ts` |
| 修正 | `functions/src/helpers/billsApi/postEventCancel.ts` |
| 修正 | `functions/src/callables/createScheduledTournament.ts` |
| 修正 | `functions/src/itemOrder/placeOrderByUser.ts` |
| 修正 | `functions/src/utils/getOpenBills.ts` |
| 修正 | `functions/src/itemOrder/getUserOrderHistory.ts` |
| 修正 | `lib/globalConstant.dart` |
| 修正 | `lib/Accounting/postAccountingAdjustmentDialog.dart` |
| 修正 | `lib/Accounting/postAccountingReopenDialog.dart` |
| 修正 | `lib/Accounting/postAccountingCancelDialog.dart` |
| 修正 | `lib/Accounting/postAccountingRefundDialog.dart` |
| 修正 | `lib/tournament/active/tournament_service.dart` |
| 修正 | `lib/tournament/scheduling/pages/create_single_tournament_page.dart` |
| 修正 | `lib/tournament/scheduling/pages/create_tournament_from_calendar_page.dart` |

---

## 3. Phase3: UI 改修（当日画面）

| 種別 | ファイル |
|------|----------|
| 修正 | `lib/Accounting/accountingPage.dart` |
| 修正 | `lib/user_actions/order_history_popup.dart` |
| 修正 | `lib/user_actions/tournament_history_popup.dart` |
| 修正 | `lib/OrderView/OrderManagement/order_management_page.dart` |

---

## 4. Phase4: UI 改修（予定・任意日時）

| 種別 | ファイル |
|------|----------|
| 修正 | `lib/Accounting/accountingHistoryPage.dart` |
| 修正 | `lib/Accounting/postAccountingAdjustmentsPage.dart` |
| 修正 | `lib/Accounting/accountingEditDialog.dart` |
| 修正 | `lib/tournament/scheduling/pages/scheduled_tournament_list_page.dart` |
| 修正 | `lib/tournament/scheduling/pages/scheduled_tournament_in_calendar_page.dart` |
| 修正 | `lib/tournament/pages/tournament_select_page.dart` |
| 修正 | `lib/tournament/scheduling/pages/create_tournament_from_calendar_page.dart` |
| 修正 | `firestore.indexes.json` |

---

## 5. Phase5: 自動開閉店（補助機能）

| 種別 | ファイル |
|------|----------|
| 追加 | `functions/src/scheduler/weeklyPlanner.ts` |
| 追加 | `functions/src/tasks/closeAssessmentTask.ts` |
| 追加 | `functions/src/tasks/openAssessmentTask.ts` |
| 修正 | `lib/globalConstant.dart` |
| 修正 | `functions/src/storeManagement/createInitialStateDocCallable.ts` |
| 修正 | `functions/src/index.ts` |

---

## 6. Phase6 Step1: storeMeta 購読・AppBar 表示

| 種別 | ファイル |
|------|----------|
| 追加 | `lib/services/store_meta_service.dart` |
| 修正 | `lib/Home/terminalHomePage.dart` |
| 修正 | `lib/tournament/active/pages/tournament_home_page.dart` |
| 修正 | `lib/tournament/active/pages/table_detail_page.dart` |
| 修正 | `lib/OrderView/OrderManagement/order_management_page.dart` |
| 修正 | `lib/sideGame/pages/side_game_table_home.dart` |

---

## 7. Phase6 Step2: 閉店処理の具体処理（未会計移管・未会計の会計）

| 種別 | ファイル |
|------|----------|
| 追加 | `functions/src/close_process/getUnsettledBillsForClose.ts` |
| 追加 | `functions/src/close_process/applyCloseSnapshot.ts` |
| 追加 | `functions/src/close_process/finalizeUnsettledBillAfterAccounting.ts` |
| 追加 | `lib/Accounting/unsettledAccountingPage.dart` |
| 修正 | `functions/src/close_process/index.ts` |
| 修正 | `lib/Home/systemSettingsPage.dart` |
| 修正 | `lib/Accounting/accountingPage.dart` |
| 修正 | `lib/Home/terminalHomePage.dart` |

**Step2 の追加修正（レビュー対応・堅牢化）**  
- 追加: `functions/src/close_process/requireAdmin.ts`  
- 修正: `functions/src/close_process/applyCloseSnapshot.ts`  
- 修正: `functions/src/close_process/getUnsettledBillsForClose.ts`  
- 修正: `lib/Home/systemSettingsPage.dart`  

---

## 8. Phase6 Step3: 閉店・開店ターミナル

| 種別 | ファイル |
|------|----------|
| 追加 | `functions/src/helpers/stateDoc/processingLease.ts` |
| 追加 | `functions/src/close_process/computeDisplayAmount.ts` |
| 追加 | `functions/src/storeManagement/closeStoreTerminal.ts` |
| 追加 | `functions/src/storeManagement/openStoreTerminal.ts` |
| 修正 | `functions/src/helpers/stateDoc/types.ts` |
| 修正 | `functions/src/close_process/getUnsettledBillsForClose.ts` |
| 修正 | `functions/src/close_process/applyCloseSnapshot.ts` |
| 修正 | `functions/src/close_process/resetAllSideGames.ts` |
| 修正 | `functions/src/close_process/resetAllTables.ts` |
| 修正 | `functions/src/close_process/cleanupActiveStaysOnClose.ts` |
| 修正 | `functions/src/analytics/migrateSettledBillsForBusinessDay.ts` |
| 修正 | `functions/src/storeManagement/index.ts` |
| 修正 | `lib/Home/terminalHomePage.dart` |

---

## 9. Phase6 Step4: storeMeta 監視・assessment に基づく UI

| 種別 | ファイル |
|------|----------|
| 修正 | `lib/services/store_meta_service.dart` |
| 修正 | `lib/Home/terminalHomePage.dart` |
| 修正 | `lib/tournament/active/pages/tournament_home_page.dart` |
| 修正 | `lib/tournament/active/pages/table_detail_page.dart` |
| 修正 | `lib/OrderView/OrderManagement/order_management_page.dart` |
| 修正 | `lib/sideGame/pages/side_game_table_list.dart` |

**補足**: 強警告・Banner・優先順位判定・diffDays 等の共通ウィジェット・ヘルパーは、仕様上 `lib/utils` 等への配置が想定されています。実装で次が追加されています。  
- 追加（Step4 実装時に配置）: `lib/utils/store_strong_warning_ui.dart`  
- 追加（Step4 実装時に配置）: `lib/utils/store_assessment_utils.dart`  
- 追加（Step4 実装時に配置）: `lib/utils/store_warning_first_dialog_prefs.dart`（初回ダイアログ永続化用）

---

## 10. Phase6 Step6.1: 仕様照合・未実装項目の解消

| 種別 | ファイル |
|------|----------|
| 修正 | `lib/utils/store_assessment_utils.dart` |
| 修正 | `lib/Home/terminalHomePage.dart` |
| 修正 | `lib/utils/store_strong_warning_ui.dart` |
| 修正 | `lib/tournament/active/pages/tournament_home_page.dart` |
| 修正 | `lib/tournament/active/pages/table_detail_page.dart` |
| 修正 | `lib/OrderView/OrderManagement/order_management_page.dart` |
| 修正 | `lib/sideGame/pages/side_game_table_list.dart` |
| 修正 | `lib/sideGame/pages/side_game_table_home.dart` |

---

## 11. 営業継続（Step8 相当・Callable ＋ UI）

| 種別 | ファイル |
|------|----------|
| 追加 | `functions/src/storeManagement/continueBusinessTerminal.ts` |
| 修正 | `functions/src/storeManagement/index.ts`（export 追加） |
| 修正 | `lib/Home/terminalHomePage.dart`（営業継続ダイアログ 1〜8 時間・Callable 呼び出し） |

---

## 12. Phase6.5: store_management 権限拡張

| 種別 | ファイル |
|------|----------|
| 修正 | `functions/src/lib/devicePermissions.ts` |
| 修正 | `functions/src/close_process/requireAdmin.ts` |
| 修正 | `functions/src/storeManagement/openStore.ts` |
| 修正 | `functions/src/storeManagement/closeStore.ts` |
| 修正 | `functions/src/close_process/cleanupActiveStaysOnClose.ts` |

**補足**: Flutter 側は既存の `store_management` オプションで判定済みのため、変更なし。

---

## 13. ファイル別・Phase 対応まとめ（重複を除いた一覧）

以下は、上記のいずれかの Phase で**追加**または**修正**の対象になったファイルを、種別ごとに一覧にしたものです。

### 追加されたファイル（新規作成）

- `functions/src/helpers/stateDoc/types.ts`
- `functions/src/helpers/stateDoc/getCurrentBusinessDateKeyOrThrow.ts`
- `functions/src/helpers/stateDoc/generateJstDateKey.ts`
- `functions/src/helpers/stateDoc/index.ts`
- `functions/src/scripts/createInitialStateDoc.ts`
- `functions/src/storeManagement/openStore.ts`
- `functions/src/storeManagement/closeStore.ts`
- `functions/src/storeManagement/createInitialStateDocCallable.ts`
- `functions/src/storeManagement/index.ts`
- `functions/src/helpers/billsApi/calcBusinessDateHelpers.ts`
- `lib/utils/business_date_ambiguous_dialog.dart`
- `functions/src/scheduler/weeklyPlanner.ts`
- `functions/src/tasks/closeAssessmentTask.ts`
- `functions/src/tasks/openAssessmentTask.ts`
- `lib/services/store_meta_service.dart`
- `functions/src/close_process/getUnsettledBillsForClose.ts`
- `functions/src/close_process/applyCloseSnapshot.ts`
- `functions/src/close_process/finalizeUnsettledBillAfterAccounting.ts`
- `functions/src/close_process/requireAdmin.ts`
- `lib/Accounting/unsettledAccountingPage.dart`
- `functions/src/helpers/stateDoc/processingLease.ts`
- `functions/src/close_process/computeDisplayAmount.ts`
- `functions/src/storeManagement/closeStoreTerminal.ts`
- `functions/src/storeManagement/openStoreTerminal.ts`
- `lib/utils/store_strong_warning_ui.dart`
- `lib/utils/store_assessment_utils.dart`
- `lib/utils/store_warning_first_dialog_prefs.dart`
- `functions/src/storeManagement/continueBusinessTerminal.ts`

### 修正されたファイル（既存）

- `functions/src/index.ts`
- `functions/src/helpers/billsApi/createBillWithActiveStay.ts`
- `firestore.rules`
- `lib/Home/terminalHomePage.dart`
- `functions/src/helpers/billsApi/types.ts`
- `functions/src/helpers/billsApi/calcBusinessDate.ts`
- `functions/src/helpers/billsApi/postEventAdjustment.ts`
- `functions/src/helpers/billsApi/postEventReopen.ts`
- `functions/src/helpers/billsApi/postEventRefund.ts`
- `functions/src/helpers/billsApi/postEventCancel.ts`
- `functions/src/callables/createScheduledTournament.ts`
- `functions/src/itemOrder/placeOrderByUser.ts`
- `functions/src/utils/getOpenBills.ts`
- `functions/src/itemOrder/getUserOrderHistory.ts`
- `lib/globalConstant.dart`
- `lib/Accounting/postAccountingAdjustmentDialog.dart`
- `lib/Accounting/postAccountingReopenDialog.dart`
- `lib/Accounting/postAccountingCancelDialog.dart`
- `lib/Accounting/postAccountingRefundDialog.dart`
- `lib/tournament/active/tournament_service.dart`
- `lib/tournament/scheduling/pages/create_single_tournament_page.dart`
- `lib/tournament/scheduling/pages/create_tournament_from_calendar_page.dart`
- `lib/Accounting/accountingPage.dart`
- `lib/user_actions/order_history_popup.dart`
- `lib/user_actions/tournament_history_popup.dart`
- `lib/OrderView/OrderManagement/order_management_page.dart`
- `lib/Accounting/accountingHistoryPage.dart`
- `lib/Accounting/postAccountingAdjustmentsPage.dart`
- `lib/Accounting/accountingEditDialog.dart`
- `lib/tournament/scheduling/pages/scheduled_tournament_list_page.dart`
- `lib/tournament/scheduling/pages/scheduled_tournament_in_calendar_page.dart`
- `lib/tournament/pages/tournament_select_page.dart`
- `firestore.indexes.json`
- `functions/src/storeManagement/createInitialStateDocCallable.ts`
- `lib/tournament/active/pages/tournament_home_page.dart`
- `lib/tournament/active/pages/table_detail_page.dart`
- `lib/sideGame/pages/side_game_table_home.dart`
- `functions/src/close_process/index.ts`
- `lib/Home/systemSettingsPage.dart`
- `lib/Accounting/accountingPage.dart`（Step2 で再度修正）
- `functions/src/helpers/stateDoc/types.ts`（Step3 で再度修正）
- `functions/src/close_process/resetAllSideGames.ts`
- `functions/src/close_process/resetAllTables.ts`
- `functions/src/close_process/cleanupActiveStaysOnClose.ts`
- `functions/src/analytics/migrateSettledBillsForBusinessDay.ts`
- `lib/sideGame/pages/side_game_table_list.dart`
- `functions/src/lib/devicePermissions.ts`
- `functions/src/storeManagement/openStore.ts`
- `functions/src/storeManagement/closeStore.ts`

---

## 参照元ドキュメント

- Phase1: `phase1/implementation_summary.md`
- Phase2: `phase2/implementation_summary.md`
- Phase3: `phase3/implementation_summary.md`
- Phase4: `phase4/implementation_summary.md`
- Phase5: `phase5/implementation_summary.md`
- Phase6 Step1: `phase6/step1/implementation_summary.md`
- Phase6 Step2: `phase6/step2/implementation_summary.md`
- Phase6 Step3: `phase6/step3/implementation_changes.md`
- Phase6 Step4: `phase6/step4/changeSpec_implementation.md`
- Phase6 Step6.1: `phase6/step6.1/changeSpec.md`
- Phase6.5: `phase6.5/spec.md` §8・§9
- 営業継続: 実装および `phase6/step4/spec.md` §8
