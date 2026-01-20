# 全ファイルマッピング表

このドキュメントは、`lib/` と `functions/src/` 内の全ファイルを提案ツリー構造に分類したマッピング表です。

**注意**: このドキュメントは分類案のみを提示するものであり、実際のファイル移動は行いません。

---

## Flutter (lib/) 全ファイルマッピング

### app/ (アプリ基盤)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `main.dart` | `app/main.dart` | エントリーポイント |

### infrastructure/ (基盤層)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `firebase_options.dart` | `infrastructure/firebase/firebase_options.dart` | Firebase設定 |
| `globalConstant.dart` | `infrastructure/config/globalConstant.dart` | グローバル定数（業務設定含む） |
| `app_config/dashboard_config.dart` | `infrastructure/app_config/dashboard_config.dart` | アプリ設定 |

### features/accounting/ (会計機能)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `Accounting/accountingPage.dart` | `features/accounting/pages/accountingPage.dart` | 会計機能の画面 |
| `Accounting/accountingHistoryPage.dart` | `features/accounting/pages/accountingHistoryPage.dart` | 会計機能の画面 |
| `Accounting/customerAccountingDetailPage.dart` | `features/accounting/pages/customerAccountingDetailPage.dart` | 会計機能の画面 |
| `Accounting/postAccountingAdjustmentsPage.dart` | `features/accounting/pages/postAccountingAdjustmentsPage.dart` | 会計機能の画面 |
| `Accounting/payment_split_test_page.dart` | `features/accounting/pages/payment_split_test_page.dart` | 会計機能のテスト画面 |
| `Accounting/accountingEditDialog.dart` | `features/accounting/dialogs/accountingEditDialog.dart` | 会計機能のダイアログ |
| `Accounting/accountingCancelDialog.dart` | `features/accounting/dialogs/accountingCancelDialog.dart` | 会計機能のダイアログ |
| `Accounting/paymentMethodDialog.dart` | `features/accounting/dialogs/paymentMethodDialog.dart` | 会計機能のダイアログ |
| `Accounting/categoryDetailDialog.dart` | `features/accounting/dialogs/categoryDetailDialog.dart` | 会計機能のダイアログ |
| `Accounting/categoryPaymentMethodDialog.dart` | `features/accounting/dialogs/categoryPaymentMethodDialog.dart` | 会計機能のダイアログ |
| `Accounting/postAccountingAdjustmentDialog.dart` | `features/accounting/dialogs/postAccountingAdjustmentDialog.dart` | 会計機能のダイアログ |
| `Accounting/postAccountingCancelDialog.dart` | `features/accounting/dialogs/postAccountingCancelDialog.dart` | 会計機能のダイアログ |
| `Accounting/postAccountingRefundDialog.dart` | `features/accounting/dialogs/postAccountingRefundDialog.dart` | 会計機能のダイアログ |
| `Accounting/postAccountingReopenDialog.dart` | `features/accounting/dialogs/postAccountingReopenDialog.dart` | 会計機能のダイアログ |
| `Accounting/refundProcessingDialog.dart` | `features/accounting/dialogs/refundProcessingDialog.dart` | 会計機能のダイアログ |
| `Accounting/payment_split_calculator.dart` | `features/accounting/services/payment_split_calculator.dart` | 会計機能のサービス（支払い分割計算） |

### features/tournament/ (トーナメント機能)

#### features/tournament/active/

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `tournament/active/pages/blind_timer_page.dart` | `features/tournament/active/pages/blind_timer_page.dart` | トーナメント機能（アクティブ）の画面 |
| `tournament/active/pages/prize_setup_page.dart` | `features/tournament/active/pages/prize_setup_page.dart` | トーナメント機能（アクティブ）の画面 |
| `tournament/active/pages/ranking_setup_page.dart` | `features/tournament/active/pages/ranking_setup_page.dart` | トーナメント機能（アクティブ）の画面 |
| `tournament/active/pages/table_detail_page.dart` | `features/tournament/active/pages/table_detail_page.dart` | トーナメント機能（アクティブ）の画面 |
| `tournament/active/pages/tournament_home_page.dart` | `features/tournament/active/pages/tournament_home_page.dart` | トーナメント機能（アクティブ）の画面 |
| `tournament/active/services/seat_decision_logic.dart` | `features/tournament/active/services/seat_decision_logic.dart` | トーナメント機能（アクティブ）のサービス |
| `tournament/active/services/server_time_helper.dart` | `features/tournament/active/services/server_time_helper.dart` | トーナメント機能（アクティブ）のサービス |
| `tournament/active/services/stage_builder.dart` | `features/tournament/active/services/stage_builder.dart` | トーナメント機能（アクティブ）のサービス |
| `tournament/active/services/tournament_data_service.dart` | `features/tournament/active/services/tournament_data_service.dart` | トーナメント機能（アクティブ）のサービス |
| `tournament/active/tournament_service.dart` | `features/tournament/active/services/tournament_service.dart` | トーナメント機能（アクティブ）のサービス |
| `tournament/active/widgets/dialogs/add_table_dialog.dart` | `features/tournament/active/widgets/dialogs/add_table_dialog.dart` | トーナメント機能（アクティブ）のダイアログ |
| `tournament/active/widgets/dialogs/assign_seat_dialog.dart` | `features/tournament/active/widgets/dialogs/assign_seat_dialog.dart` | トーナメント機能（アクティブ）のダイアログ |
| `tournament/active/widgets/dialogs/register_participants_dialog.dart` | `features/tournament/active/widgets/dialogs/register_participants_dialog.dart` | トーナメント機能（アクティブ）のダイアログ |
| `tournament/active/widgets/dialogs/remove_table_dialog.dart` | `features/tournament/active/widgets/dialogs/remove_table_dialog.dart` | トーナメント機能（アクティブ）のダイアログ |
| `tournament/active/widgets/dialogs/reseat_all_dialog.dart` | `features/tournament/active/widgets/dialogs/reseat_all_dialog.dart` | トーナメント機能（アクティブ）のダイアログ |
| `tournament/active/widgets/display/admin_controls.dart` | `features/tournament/active/widgets/display/admin_controls.dart` | トーナメント機能（アクティブ）のウィジェット |
| `tournament/active/widgets/display/countdown_display.dart` | `features/tournament/active/widgets/display/countdown_display.dart` | トーナメント機能（アクティブ）のウィジェット |
| `tournament/active/widgets/display/main_view_panel.dart` | `features/tournament/active/widgets/display/main_view_panel.dart` | トーナメント機能（アクティブ）のウィジェット |
| `tournament/active/widgets/display/stage_preview_list.dart` | `features/tournament/active/widgets/display/stage_preview_list.dart` | トーナメント機能（アクティブ）のウィジェット |
| `tournament/active/widgets/display/table_grid.dart` | `features/tournament/active/widgets/display/table_grid.dart` | トーナメント機能（アクティブ）のウィジェット |
| `tournament/active/widgets/display/table_seat_cell.dart` | `features/tournament/active/widgets/display/table_seat_cell.dart` | トーナメント機能（アクティブ）のウィジェット |
| `tournament/active/widgets/display/timer_widget.dart` | `features/tournament/active/widgets/display/timer_widget.dart` | トーナメント機能（アクティブ）のウィジェット |
| `tournament/active/widgets/display/waiting_list_view.dart` | `features/tournament/active/widgets/display/waiting_list_view.dart` | トーナメント機能（アクティブ）のウィジェット |
| `tournament/active/models/main_view.dart` | `features/tournament/active/models/main_view.dart` | トーナメント機能（アクティブ）のモデル |
| `tournament/active/models/seat_data.dart` | `features/tournament/active/models/seat_data.dart` | トーナメント機能（アクティブ）のモデル |
| `tournament/active/models/table_and_users.dart` | `features/tournament/active/models/table_and_users.dart` | トーナメント機能（アクティブ）のモデル |
| `tournament/active/models/table_seats.dart` | `features/tournament/active/models/table_seats.dart` | トーナメント機能（アクティブ）のモデル |
| `tournament/active/models/waiting_list.dart` | `features/tournament/active/models/waiting_list.dart` | トーナメント機能（アクティブ）のモデル |
| `tournament/active/models/waiting_user_data.dart` | `features/tournament/active/models/waiting_user_data.dart` | トーナメント機能（アクティブ）のモデル |

#### features/tournament/scheduling/

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `tournament/scheduling/pages/create_single_tournament_page.dart` | `features/tournament/scheduling/pages/create_single_tournament_page.dart` | トーナメント機能（スケジューリング）の画面 |
| `tournament/scheduling/pages/create_tournament_from_calendar_page.dart` | `features/tournament/scheduling/pages/create_tournament_from_calendar_page.dart` | トーナメント機能（スケジューリング）の画面 |
| `tournament/scheduling/pages/scheduled_tournament_in_calendar_page.dart` | `features/tournament/scheduling/pages/scheduled_tournament_in_calendar_page.dart` | トーナメント機能（スケジューリング）の画面 |
| `tournament/scheduling/pages/scheduled_tournament_list_page.dart` | `features/tournament/scheduling/pages/scheduled_tournament_list_page.dart` | トーナメント機能（スケジューリング）の画面 |
| `tournament/scheduling/pages/tournament_creation_menu_page.dart` | `features/tournament/scheduling/pages/tournament_creation_menu_page.dart` | トーナメント機能（スケジューリング）の画面 |
| `tournament/scheduling/recurring/create_recurring_tournament_page.dart` | `features/tournament/scheduling/recurring/create_recurring_tournament_page.dart` | トーナメント機能（スケジューリング・定期）の画面 |
| `tournament/scheduling/recurring/edit_recurring_tournament_page.dart` | `features/tournament/scheduling/recurring/edit_recurring_tournament_page.dart` | トーナメント機能（スケジューリング・定期）の画面 |
| `tournament/scheduling/recurring/recurring_tournament_list_page.dart` | `features/tournament/scheduling/recurring/recurring_tournament_list_page.dart` | トーナメント機能（スケジューリング・定期）の画面 |
| `scheduledTournament/pages/to_be_deleted_tournament_list_page.dart` | `features/tournament/scheduling/pages/to_be_deleted_tournament_list_page.dart` | トーナメント機能（スケジューリング）の画面（削除予定） |

#### features/tournament/template/

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `tournament/template/pages/create_tournament_template_page.dart` | `features/tournament/template/pages/create_tournament_template_page.dart` | トーナメント機能（テンプレート）の画面 |
| `tournament/template/pages/edit_tournament_template_page.dart` | `features/tournament/template/pages/edit_tournament_template_page.dart` | トーナメント機能（テンプレート）の画面 |
| `tournament/template/pages/tournament_template_list_page.dart` | `features/tournament/template/pages/tournament_template_list_page.dart` | トーナメント機能（テンプレート）の画面 |
| `tournament/template/blind/create_tournament_blind_basic.dart` | `features/tournament/template/blind/create_tournament_blind_basic.dart` | トーナメント機能（テンプレート・ブラインド）の画面 |
| `tournament/template/blind/create_tournament_blind_detail.dart` | `features/tournament/template/blind/create_tournament_blind_detail.dart` | トーナメント機能（テンプレート・ブラインド）の画面 |
| `tournament/template/blind/tournament_blind_template_list_page.dart` | `features/tournament/template/blind/tournament_blind_template_list_page.dart` | トーナメント機能（テンプレート・ブラインド）の画面 |

#### features/tournament/dialogs/

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `tournament/dialogs/table_select_dialog.dart` | `features/tournament/dialogs/table_select_dialog.dart` | トーナメント機能のダイアログ |
| `tournament/dialogs/tournament_select_dialog.dart` | `features/tournament/dialogs/tournament_select_dialog.dart` | トーナメント機能のダイアログ |

#### features/tournament/pages/

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `tournament/pages/table_select_page.dart` | `features/tournament/pages/table_select_page.dart` | トーナメント機能の画面 |
| `tournament/pages/tournament_select_page.dart` | `features/tournament/pages/tournament_select_page.dart` | トーナメント機能の画面 |

#### features/tournament/action_history/

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `ActionHistory/tournamentActionsHistoryPage.dart` | `features/tournament/action_history/pages/tournamentActionsHistoryPage.dart` | トーナメント機能のアクション履歴画面 |

### features/order/ (注文機能)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `OrderView/MenuView/menuListPage.dart` | `features/order/pages/menuListPage.dart` | 注文機能の画面 |
| `OrderView/MenuView/menuEditorListPage.dart` | `features/order/pages/menuEditorListPage.dart` | 注文機能の画面 |
| `OrderView/MenuView/createMenuPage.dart` | `features/order/pages/createMenuPage.dart` | 注文機能の画面 |
| `OrderView/MenuView/categorySelectPage.dart` | `features/order/pages/categorySelectPage.dart` | 注文機能の画面 |
| `OrderView/OrderManagement/order_management_page.dart` | `features/order/pages/order_management_page.dart` | 注文機能の画面 |
| `OrderView/OrderManagement/order_edit_dialog.dart` | `features/order/dialogs/order_edit_dialog.dart` | 注文機能のダイアログ |
| `OrderView/OrderManagement/order_card.dart` | `features/order/widgets/order_card.dart` | 注文機能のウィジェット |

### features/attendance/ (勤怠機能)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `AttendanceManagement/staffAttendancePage.dart` | `features/attendance/pages/staffAttendancePage.dart` | 勤怠機能の画面 |
| `AttendanceManagement/allStaffAttendancePage.dart` | `features/attendance/pages/allStaffAttendancePage.dart` | 勤怠機能の画面 |
| `AttendanceManagement/attendanceDetailPage.dart` | `features/attendance/pages/attendanceDetailPage.dart` | 勤怠機能の画面 |
| `AttendanceManagement/staffAttendanceDetailPage.dart` | `features/attendance/pages/staffAttendanceDetailPage.dart` | 勤怠機能の画面 |
| `AttendanceManagement/attendanceCorrectionRequestsPage.dart` | `features/attendance/pages/attendanceCorrectionRequestsPage.dart` | 勤怠機能の画面 |
| `AttendanceManagement/manualAttendancePage.dart` | `features/attendance/pages/manualAttendancePage.dart` | 勤怠機能の画面 |
| `AttendanceManagement/qrScanPage.dart` | `features/attendance/pages/qrScanPage.dart` | 勤怠機能の画面 |
| `AttendanceManagement/shiftDetailPage.dart` | `features/attendance/pages/shiftDetailPage.dart` | 勤怠機能の画面 |
| `AttendanceManagement/attendanceService.dart` | `features/attendance/services/attendanceService.dart` | 勤怠機能のサービス |

### features/shift/ (シフト機能)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `StaffDate/shiftRequestCalendarPage.dart` | `features/shift/pages/shiftRequestCalendarPage.dart` | シフト機能の画面 |
| `StaffDate/shiftRequestListPage.dart` | `features/shift/pages/shiftRequestListPage.dart` | シフト機能の画面 |
| `StaffDate/shiftApprovalPage.dart` | `features/shift/pages/shiftApprovalPage.dart` | シフト機能の画面 |
| `StaffDate/confirmedShiftsCalendarPage.dart` | `features/shift/pages/confirmedShiftsCalendarPage.dart` | シフト機能の画面 |
| `StaffDate/shiftMenu.dart` | `features/shift/pages/shiftMenu.dart` | シフト機能の画面 |

### features/staff/ (スタッフ管理機能)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `Home/staffListPage.dart` | `features/staff/pages/staffListPage.dart` | スタッフ管理機能の画面 |
| `Home/staffDetailPage.dart` | `features/staff/pages/staffDetailPage.dart` | スタッフ管理機能の画面 |
| `StaffDate/createStaffAccountPage.dart` | `features/staff/pages/createStaffAccountPage.dart` | スタッフ管理機能の画面 |

### features/user/ (ユーザー機能)

#### features/user/login/

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `UserLogin/userCheckInPage.dart` | `features/user/login/pages/userCheckInPage.dart` | ユーザー機能（ログイン）の画面 |
| `UserLogin/UserManualCheckInPage.dart` | `features/user/login/pages/UserManualCheckInPage.dart` | ユーザー機能（ログイン）の画面 |

#### features/user/register/

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `UserRegisterView/createUserAccountPage.dart` | `features/user/register/pages/createUserAccountPage.dart` | ユーザー機能（登録）の画面 |
| `UserRegisterView/userQRCheckInPage.dart` | `features/user/register/pages/userQRCheckInPage.dart` | ユーザー機能（登録）の画面 |

#### features/user/actions/

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `user_actions/user_action_home.dart` | `features/user/actions/pages/user_action_home.dart` | ユーザー機能（アクション）の画面 |
| `user_actions/chip_point_logs_page.dart` | `features/user/actions/pages/chip_point_logs_page.dart` | ユーザー機能（アクション）の画面 |
| `user_actions/add_extra_popup.dart` | `features/user/actions/dialogs/add_extra_popup.dart` | ユーザー機能（アクション）のダイアログ |
| `user_actions/addon_popup.dart` | `features/user/actions/dialogs/addon_popup.dart` | ユーザー機能（アクション）のダイアログ |
| `user_actions/bulk_addon_popup.dart` | `features/user/actions/dialogs/bulk_addon_popup.dart` | ユーザー機能（アクション）のダイアログ |
| `user_actions/bust_and_exit_popup.dart` | `features/user/actions/dialogs/bust_and_exit_popup.dart` | ユーザー機能（アクション）のダイアログ |
| `user_actions/bust_and_reentry_popup.dart` | `features/user/actions/dialogs/bust_and_reentry_popup.dart` | ユーザー機能（アクション）のダイアログ |
| `user_actions/chip_point_view_popup.dart` | `features/user/actions/dialogs/chip_point_view_popup.dart` | ユーザー機能（アクション）のダイアログ |
| `user_actions/current_accounting_popup.dart` | `features/user/actions/dialogs/current_accounting_popup.dart` | ユーザー機能（アクション）のダイアログ |
| `user_actions/current_seat_popup.dart` | `features/user/actions/dialogs/current_seat_popup.dart` | ユーザー機能（アクション）のダイアログ |
| `user_actions/order_from_user_action_popup.dart` | `features/user/actions/dialogs/order_from_user_action_popup.dart` | ユーザー機能（アクション）のダイアログ |
| `user_actions/order_history_popup.dart` | `features/user/actions/dialogs/order_history_popup.dart` | ユーザー機能（アクション）のダイアログ |
| `user_actions/profile_popup.dart` | `features/user/actions/dialogs/profile_popup.dart` | ユーザー機能（アクション）のダイアログ |
| `user_actions/side_game_chip_purchase_popup.dart` | `features/user/actions/dialogs/side_game_chip_purchase_popup.dart` | ユーザー機能（アクション）のダイアログ |
| `user_actions/side_game_tip_deposit_popup.dart` | `features/user/actions/dialogs/side_game_tip_deposit_popup.dart` | ユーザー機能（アクション）のダイアログ |
| `user_actions/side_game_tip_view_popup.dart` | `features/user/actions/dialogs/side_game_tip_view_popup.dart` | ユーザー機能（アクション）のダイアログ |
| `user_actions/side_game_tip_withdraw_popup.dart` | `features/user/actions/dialogs/side_game_tip_withdraw_popup.dart` | ユーザー機能（アクション）のダイアログ |
| `user_actions/tournament_history_popup.dart` | `features/user/actions/dialogs/tournament_history_popup.dart` | ユーザー機能（アクション）のダイアログ |

### features/side_game/ (サイドゲーム機能)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `sideGame/pages/side_game_table_list.dart` | `features/side_game/pages/side_game_table_list.dart` | サイドゲーム機能の画面 |
| `sideGame/pages/side_game_table_home.dart` | `features/side_game/pages/side_game_table_home.dart` | サイドゲーム機能の画面 |

### features/dashboard/ (ダッシュボード機能)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `dashboard/home/dashboard_home_page.dart` | `features/dashboard/pages/dashboard_home_page.dart` | ダッシュボード機能の画面 |
| `dashboard/daily/daily_trend_page.dart` | `features/dashboard/pages/daily_trend_page.dart` | ダッシュボード機能の画面 |
| `dashboard/category/category_overview_page.dart` | `features/dashboard/pages/category_overview_page.dart` | ダッシュボード機能の画面 |
| `dashboard/category/category_item_breakdown_page.dart` | `features/dashboard/pages/category_item_breakdown_page.dart` | ダッシュボード機能の画面 |
| `dashboard/payments/payment_breakdown_page.dart` | `features/dashboard/pages/payment_breakdown_page.dart` | ダッシュボード機能の画面 |
| `dashboard/yearly/yearly_overview_page.dart` | `features/dashboard/pages/yearly_overview_page.dart` | ダッシュボード機能の画面 |
| `dashboard/widgets/metric_card.dart` | `features/dashboard/widgets/metric_card.dart` | ダッシュボード機能のウィジェット |
| `dashboard/widgets/donut_chart.dart` | `features/dashboard/widgets/donut_chart.dart` | ダッシュボード機能のウィジェット |
| `dashboard/widgets/horizontal_bar_chart.dart` | `features/dashboard/widgets/horizontal_bar_chart.dart` | ダッシュボード機能のウィジェット |
| `dashboard/widgets/line_chart.dart` | `features/dashboard/widgets/line_chart.dart` | ダッシュボード機能のウィジェット |
| `dashboard/widgets/stacked_bar_chart.dart` | `features/dashboard/widgets/stacked_bar_chart.dart` | ダッシュボード機能のウィジェット |
| `data/models/analytics_models.dart` | `features/dashboard/models/analytics_models.dart` | ダッシュボード機能のモデル |
| `data/repo/analytics_repository.dart` | `features/dashboard/repositories/analytics_repository.dart` | ダッシュボード機能のリポジトリ |

### features/device/ (デバイス管理機能)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `pages/device_management_page.dart` | `features/device/pages/device_management_page.dart` | デバイス管理機能の画面 |
| `pages/device_registration_page.dart` | `features/device/pages/device_registration_page.dart` | デバイス管理機能の画面 |
| `models/device.dart` | `features/device/models/device.dart` | デバイス管理機能のモデル |

### features/home/ (ホーム機能)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `Home/adminHomePage.dart` | `features/home/pages/adminHomePage.dart` | ホーム機能の画面 |
| `Home/terminalHomePage.dart` | `features/home/pages/terminalHomePage.dart` | ホーム機能の画面 |
| `Home/stayingUsersListPage.dart` | `features/home/pages/stayingUsersListPage.dart` | ホーム機能の画面 |
| `Home/userDirectoryPage.dart` | `features/home/pages/userDirectoryPage.dart` | ホーム機能の画面 |
| `Home/createTemporaryTablePage.dart` | `features/home/pages/createTemporaryTablePage.dart` | ホーム機能の画面 |
| `Home/systemSettingsPage.dart` | `features/home/pages/systemSettingsPage.dart` | ホーム機能の画面（システム設定） |

### shared/ (共通層)

#### shared/services/

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `services/active_stays_service.dart` | `shared/services/active_stays_service.dart` | 複数機能で共通のサービス |
| `services/device_service.dart` | `shared/services/device_service.dart` | 複数機能で共通のサービス |
| `services/device_options.dart` | `shared/services/device_options.dart` | 複数機能で共通のサービス |

#### shared/utils/

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `utils/menuItemsManager.dart` | `shared/utils/menuItemsManager.dart` | 複数機能で共通のユーティリティ |
| `utils/date_time_utils.dart` | `shared/utils/date_time_utils.dart` | 複数機能で共通のユーティリティ |
| `utils/sectioned_user_list_dialog.dart` | `shared/utils/sectioned_user_list_dialog.dart` | 複数機能で共通のユーティリティ |
| `utils/sectioned_user_list_page.dart` | `shared/utils/sectioned_user_list_page.dart` | 複数機能で共通のユーティリティ |
| `utils/firestore_size_page.dart` | `shared/utils/firestore_size_page.dart` | 複数機能で共通のユーティリティ（デバッグ用） |
| `core/utils/formatters.dart` | `shared/utils/formatters.dart` | 複数機能で共通のフォーマッター |

#### shared/widgets/

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `core/widgets/skeleton.dart` | `shared/widgets/core/skeleton.dart` | 複数機能で共通のウィジェット |

### to_be_deleted/ (削除予定)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `to_be_deleted/*.dart` | （削除予定のため移設不要） | 削除予定 |

### その他（要確認）

| 現状パス | 提案先パス | 分類理由 | 要確認 |
|---------|-----------|---------|--------|
| `HomeBackAction.dart` | `features/home/widgets/HomeBackAction.dart` または `shared/widgets/HomeBackAction.dart` | 要確認：ホーム機能専用か共通か | **要確認** |

---

## Functions (functions/src/) 全ファイルマッピング

### callables/ (入口：Callable Functions)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `callables/index.ts` | `callables/index.ts` | 入口（Callable Functions） |
| `callables/accounting.ts` | `callables/accounting.ts` | 入口（Callable Functions） |
| `callables/cancelAccounting.ts` | `callables/cancelAccounting.ts` | 入口（Callable Functions） |
| `callables/updateAccounting.ts` | `callables/updateAccounting.ts` | 入口（Callable Functions） |
| `callables/getAccountingHistory.ts` | `callables/getAccountingHistory.ts` | 入口（Callable Functions） |
| `callables/verifyPaymentSplit.ts` | `callables/verifyPaymentSplit.ts` | 入口（Callable Functions） |
| `callables/appendExtra.ts` | `callables/appendExtra.ts` | 入口（Callable Functions） |
| `callables/updateActiveBill.ts` | `callables/updateActiveBill.ts` | 入口（Callable Functions） |
| `callables/refundProcessing.ts` | `callables/refundProcessing.ts` | 入口（Callable Functions） |
| `callables/migrateTodaysBills.ts` | `callables/migrateTodaysBills.ts` | 入口（Callable Functions） |
| `callables/createScheduledTournament.ts` | `callables/createScheduledTournament.ts` | 入口（Callable Functions） |
| `callables/getTodayTournaments.ts` | `callables/getTodayTournaments.ts` | 入口（Callable Functions） |
| `callables/getUpcomingTournaments.ts` | `callables/getUpcomingTournaments.ts` | 入口（Callable Functions） |
| `callables/getScheduledTournamentsForEdit.ts` | `callables/getScheduledTournamentsForEdit.ts` | 入口（Callable Functions） |
| `callables/registerForTournament.ts` | `callables/registerForTournament.ts` | 入口（Callable Functions） |
| `callables/registerParticipants.ts` | `callables/registerParticipants.ts` | 入口（Callable Functions） |
| `callables/assignSeatToPlayer.ts` | `callables/assignSeatToPlayer.ts` | 入口（Callable Functions） |
| `callables/reseatAllPlayers.ts` | `callables/reseatAllPlayers.ts` | 入口（Callable Functions） |
| `callables/addon.ts` | `callables/addon.ts` | 入口（Callable Functions） |
| `callables/bulkAddon.ts` | `callables/bulkAddon.ts` | 入口（Callable Functions） |
| `callables/bustAndExit.ts` | `callables/bustAndExit.ts` | 入口（Callable Functions） |
| `callables/bustAndReentry.ts` | `callables/bustAndReentry.ts` | 入口（Callable Functions） |
| `callables/endTournament.ts` | `callables/endTournament.ts` | 入口（Callable Functions） |
| `callables/validateEndTournament.ts` | `callables/validateEndTournament.ts` | 入口（Callable Functions） |
| `callables/addTableToTournament.ts` | `callables/addTableToTournament.ts` | 入口（Callable Functions） |
| `callables/removeTableFromTournament.ts` | `callables/removeTableFromTournament.ts` | 入口（Callable Functions） |
| `callables/getPrizeData.ts` | `callables/getPrizeData.ts` | 入口（Callable Functions） |
| `callables/setPrizeData.ts` | `callables/setPrizeData.ts` | 入口（Callable Functions） |
| `callables/getRankingData.ts` | `callables/getRankingData.ts` | 入口（Callable Functions） |
| `callables/setRankingData.ts` | `callables/setRankingData.ts` | 入口（Callable Functions） |
| `callables/getActionLogs.ts` | `callables/getActionLogs.ts` | 入口（Callable Functions） |
| `callables/rollbackAction.ts` | `callables/rollbackAction.ts` | 入口（Callable Functions） |
| `callables/updateTournamentTemplate.ts` | `callables/updateTournamentTemplate.ts` | 入口（Callable Functions） |
| `callables/createTournamentRecurrence.ts` | `callables/createTournamentRecurrence.ts` | 入口（Callable Functions） |
| `callables/updateTournamentRecurrence.ts` | `callables/updateTournamentRecurrence.ts` | 入口（Callable Functions） |
| `callables/deleteTournamentRecurrence.ts` | `callables/deleteTournamentRecurrence.ts` | 入口（Callable Functions） |
| `callables/getTournamentRecurrences.ts` | `callables/getTournamentRecurrences.ts` | 入口（Callable Functions） |
| `callables/generateRecurringTournaments.ts` | `callables/generateRecurringTournaments.ts` | 入口（Callable Functions） |
| `callables/createTemporaryTable.ts` | `callables/createTemporaryTable.ts` | 入口（Callable Functions） |
| `callables/getAvailableTables.ts` | `callables/getAvailableTables.ts` | 入口（Callable Functions） |
| `callables/debugSideGame.ts` | `callables/debugSideGame.ts` | 入口（Callable Functions） |
| `callables/placeOrder.ts` | `callables/placeOrder.ts` | 入口（Callable Functions） |
| `callables/placeOrderByUser.ts` | `callables/placeOrderByUser.ts` | 入口（Callable Functions） |
| `callables/getMenuItems.ts` | `callables/getMenuItems.ts` | 入口（Callable Functions） |
| `callables/createMenuItem.ts` | `callables/createMenuItem.ts` | 入口（Callable Functions） |
| `callables/updateMenuItem.ts` | `callables/updateMenuItem.ts` | 入口（Callable Functions） |
| `callables/toggleSoldOutForMenuItem.ts` | `callables/toggleSoldOutForMenuItem.ts` | 入口（Callable Functions） |
| `callables/getUserOrderHistory.ts` | `callables/getUserOrderHistory.ts` | 入口（Callable Functions） |
| `callables/createClockInRecord.ts` | `callables/createClockInRecord.ts` | 入口（Callable Functions） |
| `callables/createManualClockInRecord.ts` | `callables/createManualClockInRecord.ts` | 入口（Callable Functions） |
| `callables/updateClockOutRecord.ts` | `callables/updateClockOutRecord.ts` | 入口（Callable Functions） |
| `callables/updateManualClockOutRecord.ts` | `callables/updateManualClockOutRecord.ts` | 入口（Callable Functions） |
| `callables/getStaffAttendance.ts` | `callables/getStaffAttendance.ts` | 入口（Callable Functions） |
| `callables/getAllStaffAttendance.ts` | `callables/getAllStaffAttendance.ts` | 入口（Callable Functions） |
| `callables/getPayrollData.ts` | `callables/getPayrollData.ts` | 入口（Callable Functions） |
| `callables/createShiftRequest.ts` | `callables/createShiftRequest.ts` | 入口（Callable Functions） |
| `callables/getShiftRequests.ts` | `callables/getShiftRequests.ts` | 入口（Callable Functions） |
| `callables/approveShift.ts` | `callables/approveShift.ts` | 入口（Callable Functions） |
| `callables/rejectShift.ts` | `callables/rejectShift.ts` | 入口（Callable Functions） |
| `callables/registerDevice.ts` | `callables/registerDevice.ts` | 入口（Callable Functions） |
| `callables/updateDeviceOptions.ts` | `callables/updateDeviceOptions.ts` | 入口（Callable Functions） |
| `callables/updateStaffBankInfo.ts` | `callables/updateStaffBankInfo.ts` | 入口（Callable Functions） |
| `callables/updateStaffHourlyWage.ts` | `callables/updateStaffHourlyWage.ts` | 入口（Callable Functions） |
| `callables/calculateFirestoreSize.ts` | `callables/calculateFirestoreSize.ts` | 入口（Callable Functions） |
| `callables/api.pause.ts` | `callables/api.pause.ts` | 入口（Callable Functions） |
| `callables/api.resume.ts` | `callables/api.resume.ts` | 入口（Callable Functions） |

### triggers/ (入口：Firestore Triggers)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `triggers/bills.events.onCreate.ts` | `triggers/bills.events.onCreate.ts` | 入口（Firestore Triggers） |
| `triggers/bills.onSettle.ts` | `triggers/bills.onSettle.ts` | 入口（Firestore Triggers） |
| `triggers/onSettleCleanupIdempotency.ts` | `triggers/onSettleCleanupIdempotency.ts` | 入口（Firestore Triggers） |

### jobs/ (入口：Scheduled Functions)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `scripts/nightlyRecalculateBalanceDue.ts` | `jobs/nightlyRecalculateBalanceDue.ts` | 入口（Scheduled Functions） |
| `scripts/nightlyReconciliationCheck.ts` | `jobs/nightlyReconciliationCheck.ts` | 入口（Scheduled Functions） |
| `scripts/nightlyIntegrityCheck.ts` | `jobs/nightlyIntegrityCheck.ts` | 入口（Scheduled Functions） |

### domains/accounting/ (会計ドメイン)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `accounting/getBillPreviewTotals.ts` | `domains/accounting/services/getBillPreviewTotals.ts` | 会計ドメインのサービス |
| `helpers/billsApi/startAccounting.ts` | `domains/accounting/services/startAccounting.ts` | 会計ドメインのサービス |
| `helpers/billsApi/updateBill.ts` | `domains/accounting/services/updateBill.ts` | 会計ドメインのサービス |
| `helpers/billsApi/createBillWithActiveStay.ts` | `domains/accounting/helpers/createBillWithActiveStay.ts` | 会計ドメインのヘルパー |
| `helpers/billsApi/appendItem.ts` | `domains/accounting/helpers/appendItem.ts` | 会計ドメインのヘルパー |
| `helpers/billsApi/appendSideGameChip.ts` | `domains/accounting/helpers/appendSideGameChip.ts` | 会計ドメインのヘルパー |
| `helpers/billsApi/appendExtra.ts` | `domains/accounting/helpers/appendExtra.ts` | 会計ドメインのヘルパー |
| `helpers/billsApi/updatePlace.ts` | `domains/accounting/helpers/updatePlace.ts` | 会計ドメインのヘルパー |
| `helpers/billsApi/getActiveBillByUser.ts` | `domains/accounting/helpers/getActiveBillByUser.ts` | 会計ドメインのヘルパー |
| `helpers/billsApi/postEventRefund.ts` | `domains/accounting/helpers/postEventRefund.ts` | 会計ドメインのヘルパー |
| `helpers/billsApi/postEventAdjustment.ts` | `domains/accounting/helpers/postEventAdjustment.ts` | 会計ドメインのヘルパー |
| `helpers/billsApi/postEventCancel.ts` | `domains/accounting/helpers/postEventCancel.ts` | 会計ドメインのヘルパー |
| `helpers/billsApi/postEventReopen.ts` | `domains/accounting/helpers/postEventReopen.ts` | 会計ドメインのヘルパー |
| `helpers/billsApi/recordTournamentAction.ts` | `domains/accounting/helpers/recordTournamentAction.ts` | 会計ドメインのヘルパー |
| `helpers/billsApi/resolveMenuItem.ts` | `domains/accounting/helpers/resolveMenuItem.ts` | 会計ドメインのヘルパー |
| `helpers/billsApi/snapshots.ts` | `domains/accounting/helpers/snapshots.ts` | 会計ドメインのヘルパー |
| `helpers/billsApi/types.ts` | `domains/accounting/helpers/types.ts` | 会計ドメインのヘルパー（型定義） |
| `helpers/billsApi/index.ts` | `domains/accounting/helpers/index.ts` | 会計ドメインのヘルパー（エクスポート） |
| `close_process/cleanupActiveStaysOnClose.ts` | `domains/accounting/services/close_process/cleanupActiveStaysOnClose.ts` | 会計ドメインのサービス（クロージング処理） |
| `close_process/resetAllTables.ts` | `domains/accounting/services/close_process/resetAllTables.ts` | 会計ドメインのサービス（クロージング処理） |
| `close_process/resetAllSideGames.ts` | `domains/accounting/services/close_process/resetAllSideGames.ts` | 会計ドメインのサービス（クロージング処理） |
| `close_process/index.ts` | `domains/accounting/services/close_process/index.ts` | 会計ドメインのサービス（クロージング処理） |
| `utils/getOpenBills.ts` | `domains/accounting/services/getOpenBills.ts` | 会計ドメインのサービス |

### domains/tournament/ (トーナメントドメイン)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `tournamentBlind/createBlindTemplate.ts` | `domains/tournament/blind/services/createBlindTemplate.ts` | トーナメントドメイン（ブラインド）のサービス |
| `tournamentBlind/updateBlindTemplate.ts` | `domains/tournament/blind/services/updateBlindTemplate.ts` | トーナメントドメイン（ブラインド）のサービス |
| `tournamentBlind/getBlindTemplates.ts` | `domains/tournament/blind/services/getBlindTemplates.ts` | トーナメントドメイン（ブラインド）のサービス |
| `tournamentBlind/archiveBlindTemplate.ts` | `domains/tournament/blind/services/archiveBlindTemplate.ts` | トーナメントドメイン（ブラインド）のサービス |
| `tournamentBlind/index.ts` | `domains/tournament/blind/services/index.ts` | トーナメントドメイン（ブラインド）のサービス |
| `tournamentTemplate/createTournamentTemplate.ts` | `domains/tournament/template/services/createTournamentTemplate.ts` | トーナメントドメイン（テンプレート）のサービス |
| `tournamentTemplate/updateTournamentTemplate.ts` | `domains/tournament/template/services/updateTournamentTemplate.ts` | トーナメントドメイン（テンプレート）のサービス |
| `tournamentTemplate/getTournamentTemplates.ts` | `domains/tournament/template/services/getTournamentTemplates.ts` | トーナメントドメイン（テンプレート）のサービス |
| `tournamentTemplate/archiveTournamentTemplate.ts` | `domains/tournament/template/services/archiveTournamentTemplate.ts` | トーナメントドメイン（テンプレート）のサービス |
| `tournamentTemplate/index.ts` | `domains/tournament/template/services/index.ts` | トーナメントドメイン（テンプレート）のサービス |
| `rollbackFunction/undoAddon.ts` | `domains/tournament/services/rollback/undoAddon.ts` | トーナメントドメインのロールバック |
| `rollbackFunction/undoBulkAddon.ts` | `domains/tournament/services/rollback/undoBulkAddon.ts` | トーナメントドメインのロールバック |
| `rollbackFunction/undoBustAndExit.ts` | `domains/tournament/services/rollback/undoBustAndExit.ts` | トーナメントドメインのロールバック |
| `rollbackFunction/undoBustAndReentry.ts` | `domains/tournament/services/rollback/undoBustAndReentry.ts` | トーナメントドメインのロールバック |
| `rollbackFunction/undoRegisterParticipants.ts` | `domains/tournament/services/rollback/undoRegisterParticipants.ts` | トーナメントドメインのロールバック |
| `rollbackFunction/undoAssignSeatToPlayer.ts` | `domains/tournament/services/rollback/undoAssignSeatToPlayer.ts` | トーナメントドメインのロールバック |
| `rollbackFunction/undoReseatAllPlayers.ts` | `domains/tournament/services/rollback/undoReseatAllPlayers.ts` | トーナメントドメインのロールバック |
| `rollbackFunction/index.ts` | `domains/tournament/services/rollback/index.ts` | トーナメントドメインのロールバック |
| `lib/actionLogger.ts` | `domains/tournament/services/actionLogger.ts` | トーナメントドメインのサービス（アクションログ） |

### domains/order/ (注文ドメイン)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `itemOrder/createMenuItem.ts` | `domains/order/services/createMenuItem.ts` | 注文ドメインのサービス |
| `itemOrder/updateMenuItem.ts` | `domains/order/services/updateMenuItem.ts` | 注文ドメインのサービス |
| `itemOrder/getMenuItems.ts` | `domains/order/services/getMenuItems.ts` | 注文ドメインのサービス |
| `itemOrder/toggleSoldOutForMenuItem.ts` | `domains/order/services/toggleSoldOutForMenuItem.ts` | 注文ドメインのサービス |
| `itemOrder/placeOrder.ts` | `domains/order/services/placeOrder.ts` | 注文ドメインのサービス |
| `itemOrder/placeOrderByUser.ts` | `domains/order/services/placeOrderByUser.ts` | 注文ドメインのサービス |
| `itemOrder/getUserOrderHistory.ts` | `domains/order/services/getUserOrderHistory.ts` | 注文ドメインのサービス |
| `itemOrder/index.ts` | `domains/order/services/index.ts` | 注文ドメインのサービス |

### domains/attendance/ (勤怠ドメイン)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `attendance/createClockInRecord.ts` | `domains/attendance/services/createClockInRecord.ts` | 勤怠ドメインのサービス |
| `attendance/createManualClockInRecord.ts` | `domains/attendance/services/createManualClockInRecord.ts` | 勤怠ドメインのサービス |
| `attendance/updateClockOutRecord.ts` | `domains/attendance/services/updateClockOutRecord.ts` | 勤怠ドメインのサービス |
| `attendance/updateManualClockOutRecord.ts` | `domains/attendance/services/updateManualClockOutRecord.ts` | 勤怠ドメインのサービス |
| `attendance/getStaffAttendance.ts` | `domains/attendance/services/getStaffAttendance.ts` | 勤怠ドメインのサービス |
| `attendance/getAllStaffAttendance.ts` | `domains/attendance/services/getAllStaffAttendance.ts` | 勤怠ドメインのサービス |
| `attendance/getStaffListForAttendance.ts` | `domains/attendance/services/getStaffListForAttendance.ts` | 勤怠ドメインのサービス |
| `attendance/determineAttendanceMode.ts` | `domains/attendance/services/determineAttendanceMode.ts` | 勤怠ドメインのサービス |
| `attendance/createAttendanceCorrectionRequest.ts` | `domains/attendance/services/createAttendanceCorrectionRequest.ts` | 勤怠ドメインのサービス |
| `attendance/getAttendanceCorrectionRequests.ts` | `domains/attendance/services/getAttendanceCorrectionRequests.ts` | 勤怠ドメインのサービス |
| `attendance/checkExistingCorrectionRequest.ts` | `domains/attendance/services/checkExistingCorrectionRequest.ts` | 勤怠ドメインのサービス |
| `attendance/approveAttendanceCorrectionRequest.ts` | `domains/attendance/services/approveAttendanceCorrectionRequest.ts` | 勤怠ドメインのサービス |
| `attendance/rejectAttendanceCorrectionRequest.ts` | `domains/attendance/services/rejectAttendanceCorrectionRequest.ts` | 勤怠ドメインのサービス |
| `attendance/monthlyPayrollTrigger.ts` | `domains/attendance/services/monthlyPayrollTrigger.ts` | 勤怠ドメインのサービス（トリガー） |
| `attendance/index.ts` | `domains/attendance/services/index.ts` | 勤怠ドメインのサービス |

### domains/staff/ (スタッフドメイン)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `staff/createStaffAccount.ts` | `domains/staff/services/createStaffAccount.ts` | スタッフドメインのサービス |
| `staff/createShift.ts` | `domains/staff/services/createShift.ts` | スタッフドメインのサービス |
| `staff/createMultipleShifts.ts` | `domains/staff/services/createMultipleShifts.ts` | スタッフドメインのサービス |
| `staff/createShiftRequest.ts` | `domains/staff/services/createShiftRequest.ts` | スタッフドメインのサービス |
| `staff/getShiftRequests.ts` | `domains/staff/services/getShiftRequests.ts` | スタッフドメインのサービス |
| `staff/getShifts.ts` | `domains/staff/services/getShifts.ts` | スタッフドメインのサービス |
| `staff/getAllShifts.ts` | `domains/staff/services/getAllShifts.ts` | スタッフドメインのサービス |
| `staff/approveShift.ts` | `domains/staff/services/approveShift.ts` | スタッフドメインのサービス |
| `staff/rejectShift.ts` | `domains/staff/services/rejectShift.ts` | スタッフドメインのサービス |
| `staff/confirmShiftRequest.ts` | `domains/staff/services/confirmShiftRequest.ts` | スタッフドメインのサービス |
| `staff/declineShiftRequest.ts` | `domains/staff/services/declineShiftRequest.ts` | スタッフドメインのサービス |
| `staff/processShiftsByStaff.ts` | `domains/staff/services/processShiftsByStaff.ts` | スタッフドメインのサービス |
| `staff/autoCleanupRejectedShifts.ts` | `domains/staff/services/autoCleanupRejectedShifts.ts` | スタッフドメインのサービス |
| `staff/scheduledCleanup.ts` | `domains/staff/services/scheduledCleanup.ts` | スタッフドメインのサービス |
| `staff/index.ts` | `domains/staff/services/index.ts` | スタッフドメインのサービス |

### domains/user/ (ユーザードメイン)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `user/createUserAccount.ts` | `domains/user/services/createUserAccount.ts` | ユーザードメインのサービス |
| `user/createUserByApp.ts` | `domains/user/services/createUserByApp.ts` | ユーザードメインのサービス |
| `user/generateQRCode.ts` | `domains/user/services/generateQRCode.ts` | ユーザードメインのサービス |
| `user/verifyQRCode.ts` | `domains/user/services/verifyQRCode.ts` | ユーザードメインのサービス |
| `user/index.ts` | `domains/user/services/index.ts` | ユーザードメインのサービス |
| `userLogin/manualCheckIn.ts` | `domains/user/login/services/manualCheckIn.ts` | ユーザードメイン（ログイン）のサービス |
| `userLogin/processVisitByQR.ts` | `domains/user/login/services/processVisitByQR.ts` | ユーザードメイン（ログイン）のサービス |
| `userLogin/getUserStatus.ts` | `domains/user/login/services/getUserStatus.ts` | ユーザードメイン（ログイン）のサービス |
| `userLogin/index.ts` | `domains/user/login/services/index.ts` | ユーザードメイン（ログイン）のサービス |

### domains/side_game/ (サイドゲームドメイン)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `sideGame/registerForSideGame.ts` | `domains/side_game/services/registerForSideGame.ts` | サイドゲームドメインのサービス |
| `sideGame/leaveSeat.ts` | `domains/side_game/services/leaveSeat.ts` | サイドゲームドメインのサービス |
| `sideGame/depositTip.ts` | `domains/side_game/services/depositTip.ts` | サイドゲームドメインのサービス |
| `sideGame/withdrawTip.ts` | `domains/side_game/services/withdrawTip.ts` | サイドゲームドメインのサービス |

### domains/analytics/ (分析ドメイン)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `analytics/addToDailySummary.ts` | `domains/analytics/services/addToDailySummary.ts` | 分析ドメインのサービス |
| `analytics/addToMonthlyIndex.ts` | `domains/analytics/services/addToMonthlyIndex.ts` | 分析ドメインのサービス |
| `analytics/addToByUser.ts` | `domains/analytics/services/addToByUser.ts` | 分析ドメインのサービス |
| `analytics/addToByCategory.ts` | `domains/analytics/services/addToByCategory.ts` | 分析ドメインのサービス |
| `analytics/addToByTemplateTournaments.ts` | `domains/analytics/services/addToByTemplateTournaments.ts` | 分析ドメインのサービス |
| `analytics/generateDummyData.ts` | `domains/analytics/services/generateDummyData.ts` | 分析ドメインのサービス（デバッグ用） |
| `analytics/migrateSettledBillsForBusinessDay.ts` | `domains/analytics/services/migrateSettledBillsForBusinessDay.ts` | 分析ドメインのサービス（移行用） |
| `analytics/helpers.ts` | `domains/analytics/services/helpers.ts` | 分析ドメインのサービス（ヘルパー） |
| `analytics/index.ts` | `domains/analytics/services/index.ts` | 分析ドメインのサービス |
| `analytics/aggregator/delta.ts` | `domains/analytics/aggregator/delta.ts` | 分析ドメインの集計ロジック |
| `analytics/aggregator/writer.ts` | `domains/analytics/aggregator/writer.ts` | 分析ドメインの集計ロジック |
| `analytics/aggregator/markers.ts` | `domains/analytics/aggregator/markers.ts` | 分析ドメインの集計ロジック |
| `analytics/aggregator/types.ts` | `domains/analytics/aggregator/types.ts` | 分析ドメインの集計ロジック（型定義） |
| `analytics/aggregator/index.ts` | `domains/analytics/aggregator/index.ts` | 分析ドメインの集計ロジック |

### platform/ (基盤共通：業務ルール禁止)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `lib/env.ts` | `platform/env/env.ts` | 環境変数取得（業務概念を含まない純粋基盤） |
| `lib/devicePermissions.ts` | `platform/device/devicePermissions.ts` | デバイス権限（薄いヘルパ、業務概念を含まない） |
| `lib/runtimePath.ts` | `platform/utils/runtimePath.ts` | ランタイムパス（業務概念を含まない純粋基盤） |
| `lib/serverStage.ts` | `platform/utils/serverStage.ts` | サーバーステージ（業務概念を含まない純粋基盤） |
| `lib/tasks.ts` | `platform/utils/tasks.ts` | タスク（業務概念を含まない純粋基盤） |
| `utils/logUtils.ts` | `platform/logging/logUtils.ts` | ログ基盤（業務概念を含まない純粋基盤） |
| `utils/qrCodeUtils.ts` | `platform/utils/qrCodeUtils.ts` | QRコードユーティリティ（業務概念を含まない純粋基盤） |
| `utils/lineMessaging.ts` | `platform/utils/lineMessaging.ts` | LINEメッセージング（業務概念を含まない純粋基盤） |
| `utils/lineAuth.ts` | `platform/auth/lineAuth.ts` | LINE認証（業務概念を含まない純粋基盤） |
| `utils/index.ts` | `platform/utils/index.ts` | ユーティリティ（エクスポート） |
| `auth/getFirebaseCustomToken.ts` | `platform/auth/getFirebaseCustomToken.ts` | 認証基盤 |
| `auth/index.ts` | `platform/auth/index.ts` | 認証基盤（エクスポート） |

### domain-kernel/ (複数ドメインで共有される業務概念)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `helpers/billsApi/calcBusinessDate.ts` | `domain-kernel/business_date/calcBusinessDate.ts` | 複数ドメインで使われる業務概念（営業日計算） |
| `analytics/helpers.ts` の `resolveBusinessDate` | `domain-kernel/business_date/resolveBusinessDate.ts` | 複数ドメインで使われる業務概念（営業日計算） |
| `utils/paymentSplitCalculator.ts` | `domain-kernel/money/paymentSplitCalculator.ts` | 複数ドメインで使われる業務概念（支払い分割計算） |
| `config/ops.ts` | `domain-kernel/config/ops.ts` | 複数ドメインで使われる業務概念（店舗設定） |
| `helpers/billsApi/dualWrite.ts` | `domain-kernel/dual_write/dualWrite.ts` | 複数ドメインで使われる業務概念（移行期の特殊処理） |

### http/ (HTTP関数)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `http/controlHook.ts` | `http/controlHook.ts` | HTTP関数（入口） |

### webhook/ (Webhook)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `webhook/lineWebhook.ts` | `webhook/lineWebhook.ts` | Webhook（入口） |
| `webhook/index.ts` | `webhook/index.ts` | Webhook（エクスポート） |

### types/ (型定義)

| 現状パス | 提案先パス | 分類理由 |
|---------|-----------|---------|
| `types/actionLog.ts` | `types/actionLog.ts` | 型定義 |
| `types/index.ts` | `types/index.ts` | 型定義（エクスポート） |

### その他（要確認）

| 現状パス | 提案先パス | 分類理由 | 要確認 |
|---------|-----------|---------|--------|
| `index.ts` | `index.ts` | エントリーポイント | - |
| `TBD/getScheduledTournaments.ts` | （要確認） | 要確認：どのドメインに属するか、削除予定か | **要確認** |

---

## 統計情報

### Flutter (lib/)
- **総ファイル数**: 161ファイル
- **features/**: 約140ファイル
- **shared/**: 約10ファイル
- **infrastructure/**: 3ファイル
- **app/**: 1ファイル
- **to_be_deleted/**: 11ファイル（削除予定）
- **要確認**: 1ファイル

### Functions (functions/src/)
- **総ファイル数**: 184ファイル
- **callables/**: 約60ファイル
- **triggers/**: 3ファイル
- **jobs/**: 3ファイル
- **domains/**: 約100ファイル
- **platform/**: 約12ファイル
- **domain-kernel/**: 約5ファイル
- **http/**: 1ファイル
- **webhook/**: 2ファイル
- **types/**: 2ファイル
- **要確認**: 1ファイル

---

**最終更新**: 2025-01-XX
**作成者**: AI Assistant
**目的**: 全ファイルのマッピング表作成（実装は行わない）

