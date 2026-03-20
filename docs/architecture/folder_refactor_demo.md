# フォルダ構造リファクタリング案

## 1. 現状ツリー概要（抜粋）

### Flutter (lib/)
```
lib/
├── Accounting/          # 会計関連画面・ダイアログ
├── ActionHistory/      # アクション履歴
├── AttendanceManagement/ # 勤怠管理
├── Home/               # ホーム画面（admin/terminal）
├── OrderView/          # 注文関連（MenuView, OrderManagement）
├── StaffDate/          # シフト管理
├── UserLogin/          # ユーザーログイン
├── UserRegisterView/   # ユーザー登録
├── app_config/         # アプリ設定
├── core/               # コアユーティリティ（utils, widgets）
├── dashboard/          # ダッシュボード（category, daily, home, payments, yearly, widgets）
├── data/               # データ層（models, repo）
├── models/             # モデル定義
├── pages/              # ページ（device関連）
├── scheduledTournament/ # スケジュール済みトーナメント
├── services/           # サービス（active_stays, device, device_options）
├── sideGame/           # サイドゲーム
├── to_be_deleted/      # 削除予定
├── tournament/         # トーナメント（active, dialogs, pages, scheduling, template）
├── user_actions/        # ユーザーアクション（各種ポップアップ）
├── utils/              # ユーティリティ
├── firebase_options.dart # Firebase設定
├── globalConstant.dart  # グローバル定数
└── main.dart            # エントリーポイント
```

### Functions (functions/src/)
```
functions/src/
├── accounting/          # 会計関連
├── analytics/           # 分析（aggregator含む）
├── attendance/          # 勤怠管理
├── auth/                # 認証
├── callables/           # Callable Functions（入口）
├── close_process/       # クロージング処理
├── config/              # 設定（ops.ts）
├── helpers/             # ヘルパー（billsApi/）
├── http/                # HTTP関数
├── itemOrder/           # 注文管理
├── lib/                 # ライブラリ（env, devicePermissions, actionLogger等）
├── rollbackFunction/    # ロールバック機能
├── scripts/             # スクリプト（nightly系）
├── sideGame/            # サイドゲーム
├── staff/               # スタッフ管理
├── TBD/                 # 要確認
├── tournamentBlind/     # トーナメントブラインド
├── tournamentTemplate/   # トーナメントテンプレート
├── triggers/            # Firestore Triggers（入口）
├── types/               # 型定義
├── user/                # ユーザー管理
├── userLogin/           # ユーザーログイン
├── utils/               # ユーティリティ（logUtils, paymentSplitCalculator等）
├── webhook/             # Webhook
└── index.ts             # エントリーポイント
```

## 2. 提案ツリー（Flutter: lib/）

```
lib/
├── app/                          # アプリ基盤
│   ├── main.dart                 # エントリーポイント
│   ├── routing.dart              # ルーティング（要確認：現状はmain.dart内）
│   └── theme.dart                # テーマ設定（要確認：現状はmain.dart内）
│
├── infrastructure/               # 基盤層
│   ├── firebase/
│   │   └── firebase_options.dart
│   ├── config/
│   │   └── globalConstant.dart   # グローバル定数（業務設定含む）
│   └── app_config/
│       └── dashboard_config.dart
│
├── features/                     # 機能単位
│   ├── accounting/               # 会計機能
│   │   ├── pages/
│   │   │   ├── accountingPage.dart
│   │   │   ├── accountingHistoryPage.dart
│   │   │   └── customerAccountingDetailPage.dart
│   │   ├── dialogs/
│   │   │   ├── accountingEditDialog.dart
│   │   │   ├── accountingCancelDialog.dart
│   │   │   ├── paymentMethodDialog.dart
│   │   │   └── ...
│   │   └── services/
│   │       └── payment_split_calculator.dart
│   │
│   ├── tournament/               # トーナメント機能
│   │   ├── active/
│   │   │   ├── pages/
│   │   │   ├── services/
│   │   │   └── widgets/
│   │   ├── scheduling/
│   │   │   └── pages/
│   │   ├── template/
│   │   │   ├── pages/
│   │   │   └── blind/
│   │   └── dialogs/
│   │
│   ├── order/                    # 注文機能
│   │   ├── pages/
│   │   │   ├── menuListPage.dart
│   │   │   ├── menuEditorListPage.dart
│   │   │   └── order_management_page.dart
│   │   └── dialogs/
│   │       └── order_edit_dialog.dart
│   │
│   ├── attendance/               # 勤怠機能
│   │   ├── pages/
│   │   │   ├── staff_attendance_page_from_terminalHome.dart
│   │   │   ├── all_staff_attendance_page_from_adminHome.dart
│   │   │   ├── daily_attendance_detail_page_from_staffAttendanceDetail.dart
│   │   │   └── ...
│   │   └── services/
│   │       └── attendanceService.dart
│   │
│   ├── shift/                    # シフト機能
│   │   └── pages/
│   │       ├── shiftRequestCalendarPage.dart
│   │       ├── shiftApprovalPage.dart
│   │       └── ...
│   │
│   ├── staff/                    # スタッフ管理機能
│   │   └── pages/
│   │       ├── staffListPage.dart
│   │       └── staffDetailPage.dart
│   │
│   ├── user/                     # ユーザー機能
│   │   ├── login/
│   │   │   └── pages/
│   │   │       ├── userCheckInPage.dart
│   │   │       └── UserManualCheckInPage.dart
│   │   ├── register/
│   │   │   └── pages/
│   │   │       ├── createUserAccountPage.dart
│   │   │       └── userQRCheckInPage.dart
│   │   └── actions/              # ユーザーアクション（各種ポップアップ）
│   │       ├── user_action_home.dart
│   │       ├── addon_popup.dart
│   │       └── ...
│   │
│   ├── side_game/                # サイドゲーム機能
│   │   └── pages/
│   │       ├── side_game_table_list.dart
│   │       └── side_game_table_home.dart
│   │
│   ├── dashboard/                # ダッシュボード機能
│   │   ├── pages/
│   │   │   ├── dashboard_home_page.dart
│   │   │   ├── daily_trend_page.dart
│   │   │   ├── category_overview_page.dart
│   │   │   └── ...
│   │   ├── widgets/
│   │   └── models/
│   │       └── analytics_models.dart
│   │
│   ├── device/                    # デバイス管理機能
│   │   ├── pages/
│   │   │   ├── device_management_page.dart
│   │   │   ├── device_registration_page.dart
│   │   │   └── systemSettingsPage.dart
│   │   └── models/
│   │       └── device.dart
│   │
│   └── home/                     # ホーム機能
│       └── pages/
│           ├── adminHomePage.dart
│           ├── terminalHomePage.dart
│           └── ...
│
└── shared/                       # 共通層
    ├── services/                 # 共通サービス
    │   ├── active_stays_service.dart
    │   ├── device_service.dart
    │   └── device_options.dart
    │
    ├── repositories/              # 共通リポジトリ
    │   └── analytics_repository.dart
    │
    ├── utils/                     # 共通ユーティリティ
    │   ├── menuItemsManager.dart
    │   ├── date_time_utils.dart
    │   ├── sectioned_user_list_dialog.dart
    │   └── ...
    │
    ├── widgets/                   # 共通ウィジェット
    │   ├── core/
    │   │   └── skeleton.dart
    │   └── dashboard/
    │       ├── metric_card.dart
    │       └── ...
    │
    └── models/                    # 共通モデル
        └── (共通で使われるモデル定義)
```

## 3. 提案ツリー（Functions: functions/src/）

```
functions/src/
├── callables/                    # 入口：Callable Functions
│   ├── accounting.ts
│   ├── tournament.ts             # トーナメント関連（要統合確認）
│   ├── order.ts                  # 注文関連（要統合確認）
│   ├── attendance.ts             # 勤怠関連（要統合確認）
│   ├── staff.ts                  # スタッフ関連（要統合確認）
│   ├── user.ts                   # ユーザー関連（要統合確認）
│   └── device.ts                 # デバイス関連（要統合確認）
│
├── triggers/                     # 入口：Firestore Triggers
│   ├── bills.events.onCreate.ts
│   ├── bills.onSettle.ts
│   └── onSettleCleanupIdempotency.ts
│
├── jobs/                         # 入口：Scheduled Functions
│   ├── nightlyRecalculateBalanceDue.ts
│   ├── nightlyReconciliationCheck.ts
│   └── nightlyIntegrityCheck.ts
│
├── domains/                      # 業務ドメイン
│   ├── accounting/               # 会計ドメイン
│   │   ├── services/
│   │   │   ├── startAccounting.ts
│   │   │   ├── updateAccounting.ts
│   │   │   └── cancelAccounting.ts
│   │   └── helpers/              # billsApi/ を移行
│   │       ├── createBillWithActiveStay.ts
│   │       ├── appendItem.ts
│   │       ├── updateBill.ts
│   │       └── ...
│   │
│   ├── tournament/               # トーナメントドメイン
│   │   ├── services/
│   │   │   ├── createScheduledTournament.ts
│   │   │   ├── registerForTournament.ts
│   │   │   └── ...
│   │   ├── blind/                 # tournamentBlind/ を移行
│   │   └── template/              # tournamentTemplate/ を移行
│   │
│   ├── order/                    # 注文ドメイン
│   │   └── services/
│   │       ├── createMenuItem.ts
│   │       ├── placeOrder.ts
│   │       └── ...
│   │
│   ├── attendance/                # 勤怠ドメイン
│   │   └── services/
│   │       ├── createClockInRecord.ts
│   │       ├── updateClockOutRecord.ts
│   │       └── monthlyPayrollTrigger.ts
│   │
│   ├── staff/                     # スタッフドメイン
│   │   └── services/
│   │       ├── createShiftRequest.ts
│   │       ├── approveShift.ts
│   │       └── ...
│   │
│   ├── user/                      # ユーザードメイン
│   │   ├── services/
│   │   │   └── (user/ を移行)
│   │   └── login/                 # userLogin/ を移行
│   │       └── services/
│   │           ├── manualCheckIn.ts
│   │           └── processVisitByQR.ts
│   │
│   ├── side_game/                 # サイドゲームドメイン
│   │   └── services/
│   │       ├── registerForSideGame.ts
│   │       └── ...
│   │
│   └── analytics/                 # 分析ドメイン
│       ├── services/
│       │   ├── addToDailySummary.ts
│       │   ├── addToMonthlyIndex.ts
│       │   └── ...
│       └── aggregator/            # analytics/aggregator/ を移行
│           ├── delta.ts
│           ├── writer.ts
│           └── ...
│
├── platform/                     # 基盤共通（業務ルール禁止）
│   ├── firestore/                # Firestore薄いヘルパ
│   │   └── (必要に応じて)
│   ├── auth/                      # 認証基盤
│   │   └── getFirebaseCustomToken.ts
│   ├── logging/                   # ログ基盤
│   │   ├── logUtils.ts
│   │   └── actionLogger.ts        # 要確認：トーナメント専用か汎用か
│   ├── validation/                # バリデーション基盤
│   │   └── (必要に応じて)
│   ├── errors/                     # エラーハンドリング基盤
│   │   └── (必要に応じて)
│   ├── time/                       # 時刻変換（純粋関数）
│   │   └── (必要に応じて)
│   ├── idempotency/               # 冪等性の枠
│   │   └── (必要に応じて)
│   ├── env/                        # 環境変数
│   │   └── env.ts
│   ├── device/                     # デバイス権限（薄いヘルパ）
│   │   └── devicePermissions.ts
│   └── utils/                      # 純粋ユーティリティ
│       ├── qrCodeUtils.ts
│       └── lineMessaging.ts
│
├── domain-kernel/                 # 複数ドメインで共有される業務概念
│   ├── business_date/              # 営業日計算
│   │   ├── calcBusinessDate.ts     # helpers/billsApi/calcBusinessDate.ts から移行
│   │   └── resolveBusinessDate.ts  # analytics/helpers.ts から移行
│   │
│   ├── money/                      # 支払い分割計算
│   │   └── paymentSplitCalculator.ts # utils/paymentSplitCalculator.ts から移行
│   │
│   ├── config/                     # 店舗設定
│   │   └── ops.ts                  # config/ops.ts から移行
│   │
│   └── dual_write/                 # デュアルライト（移行期の特殊処理）
│       └── dualWrite.ts            # helpers/billsApi/dualWrite.ts から移行
│                                   # 要確認：accountingドメインに属するか
│
├── types/                         # 型定義
│   └── (共通型定義)
│
├── http/                          # HTTP関数
│   └── controlHook.ts
│
├── webhook/                       # Webhook
│   └── lineWebhook.ts
│
├── close_process/                 # クロージング処理（要確認：ドメインかplatformか）
│   ├── cleanupActiveStaysOnClose.ts
│   ├── resetAllTables.ts
│   └── resetAllSideGames.ts
│
└── index.ts                       # エントリーポイント
```

## 4. 分類判定フロー（短いルール）

### Flutter (lib/) の分類ルール

```
1. 特定機能の画面/状態/データ取得？
   → YES: features/<feature>/
   → NO: 次へ

2. 複数機能で共通？
   → YES: shared/
   → NO: 次へ

3. アプリ基盤（Firebase初期化、ルーティング、テーマ）？
   → YES: app/
   → NO: 次へ

4. 基盤設定（Firebase設定、グローバル定数）？
   → YES: infrastructure/
```

### Functions (functions/src/) の分類ルール

```
1. 入口（Callable/Trigger/Scheduled）？
   → YES: callables/ / triggers/ / jobs/
   → NO: 次へ

2. 特定ドメインの不変条件（集計/状態遷移/締め判断）に関わる？
   → YES: domains/<domain>/
   → NO: 次へ

3. 業務概念として複数ドメインが使う？
   → YES: domain-kernel/
   → NO: 次へ

4. 業務概念を含まない純粋基盤？
   → YES: platform/
   → NO: 要確認
```

### domain-kernel と platform の境界

- **domain-kernel**: 業務概念を含む（BusinessDate, Money, 店舗設定、デュアルライト等）
- **platform**: 業務概念を含まない純粋基盤（logger, errors, validation, firestore薄いヘルパ, time純粋変換, idempotencyの枠）

## 5. Mapping（現状→提案先）

### Flutter (lib/) Mapping

| 現状パス | 提案先パス | 分類理由 | 要確認 |
|---------|-----------|---------|--------|
| `main.dart` | `app/main.dart` | エントリーポイント | ルーティング分離の要否 |
| `firebase_options.dart` | `infrastructure/firebase/firebase_options.dart` | Firebase設定 | - |
| `globalConstant.dart` | `infrastructure/config/globalConstant.dart` | グローバル定数（業務設定含む） | 業務概念としてdomain-kernel相当か要確認 |
| `Accounting/*.dart` | `features/accounting/pages/`, `features/accounting/dialogs/` | 会計機能の画面・ダイアログ | - |
| `Accounting/payment_split_calculator.dart` | `features/accounting/services/payment_split_calculator.dart` | 会計機能のサービス | - |
| `tournament/active/*.dart` | `features/tournament/active/` | トーナメント機能（アクティブ） | - |
| `tournament/scheduling/*.dart` | `features/tournament/scheduling/` | トーナメント機能（スケジューリング） | - |
| `tournament/template/*.dart` | `features/tournament/template/` | トーナメント機能（テンプレート） | - |
| `OrderView/MenuView/*.dart` | `features/order/pages/` | 注文機能の画面 | - |
| `OrderView/OrderManagement/*.dart` | `features/order/pages/` | 注文機能の画面 | - |
| `AttendanceManagement/*.dart` | `features/attendance/` | 勤怠機能 | - |
| `StaffDate/*.dart` | `features/shift/` | シフト機能 | - |
| `UserLogin/*.dart` | `features/user/login/` | ユーザー機能（ログイン） | - |
| `UserRegisterView/*.dart` | `features/user/register/` | ユーザー機能（登録） | - |
| `user_actions/*.dart` | `features/user/actions/` | ユーザー機能（アクション） | - |
| `sideGame/*.dart` | `features/side_game/` | サイドゲーム機能 | - |
| `dashboard/*.dart` | `features/dashboard/` | ダッシュボード機能 | - |
| `Home/*.dart` | `features/home/pages/` | ホーム機能 | - |
| `pages/device_*.dart` | `features/device/pages/` | デバイス管理機能 | - |
| `services/active_stays_service.dart` | `shared/services/active_stays_service.dart` | 複数機能で共通のサービス | - |
| `services/device_service.dart` | `shared/services/device_service.dart` | 複数機能で共通のサービス | - |
| `services/device_options.dart` | `shared/services/device_options.dart` | 複数機能で共通のサービス | - |
| `data/repo/analytics_repository.dart` | `shared/repositories/analytics_repository.dart` | 複数機能で共通のリポジトリ | - |
| `utils/menuItemsManager.dart` | `shared/utils/menuItemsManager.dart` | 複数機能で共通のユーティリティ | - |
| `utils/date_time_utils.dart` | `shared/utils/date_time_utils.dart` | 複数機能で共通のユーティリティ | - |
| `core/utils/formatters.dart` | `shared/utils/formatters.dart` | 複数機能で共通のフォーマッター | - |
| `core/widgets/skeleton.dart` | `shared/widgets/core/skeleton.dart` | 複数機能で共通のウィジェット | - |
| `dashboard/widgets/*.dart` | `shared/widgets/dashboard/` | 複数機能で共通のウィジェット | - |
| `models/device.dart` | `features/device/models/device.dart` | デバイス機能のモデル | - |
| `data/models/analytics_models.dart` | `features/dashboard/models/analytics_models.dart` | ダッシュボード機能のモデル | - |
| `app_config/dashboard_config.dart` | `infrastructure/config/dashboard_config.dart` | アプリ設定 | - |
| `ActionHistory/tournamentActionsHistoryPage.dart` | `features/tournament/active/pages/tournamentActionsHistoryPage.dart` | トーナメント機能の履歴画面 | - |
| `scheduledTournament/pages/*.dart` | `features/tournament/scheduling/pages/` | トーナメント機能（スケジューリング） | - |
| `to_be_deleted/*.dart` | （削除予定のため移設不要） | 削除予定 | - |

### Functions (functions/src/) Mapping

| 現状パス | 提案先パス | 分類理由 | 要確認 |
|---------|-----------|---------|--------|
| `callables/*.ts` | `callables/*.ts` | 入口（Callable Functions） | 機能別に統合するか要確認 |
| `triggers/*.ts` | `triggers/*.ts` | 入口（Firestore Triggers） | - |
| `scripts/nightly*.ts` | `jobs/nightly*.ts` | 入口（Scheduled Functions） | - |
| `accounting/getBillPreviewTotals.ts` | `domains/accounting/services/getBillPreviewTotals.ts` | 会計ドメインのサービス | - |
| `callables/accounting.ts` | `callables/accounting.ts` | 入口（Callable Functions） | - |
| `helpers/billsApi/*.ts` | `domains/accounting/helpers/*.ts` | 会計ドメインのヘルパー（bills API） | - |
| `helpers/billsApi/calcBusinessDate.ts` | `domain-kernel/business_date/calcBusinessDate.ts` | 複数ドメインで使われる業務概念 | - |
| `analytics/helpers.ts` | `domain-kernel/business_date/resolveBusinessDate.ts` | 複数ドメインで使われる業務概念 | - |
| `analytics/*.ts` | `domains/analytics/services/*.ts` | 分析ドメインのサービス | - |
| `analytics/aggregator/*.ts` | `domains/analytics/aggregator/*.ts` | 分析ドメインの集計ロジック | - |
| `attendance/*.ts` | `domains/attendance/services/*.ts` | 勤怠ドメインのサービス | - |
| `staff/*.ts` | `domains/staff/services/*.ts` | スタッフドメインのサービス | - |
| `user/*.ts` | `domains/user/services/*.ts` | ユーザードメインのサービス | - |
| `userLogin/*.ts` | `domains/user/login/services/*.ts` | ユーザードメイン（ログイン）のサービス | - |
| `itemOrder/*.ts` | `domains/order/services/*.ts` | 注文ドメインのサービス | - |
| `sideGame/*.ts` | `domains/side_game/services/*.ts` | サイドゲームドメインのサービス | - |
| `tournamentBlind/*.ts` | `domains/tournament/blind/*.ts` | トーナメントドメイン（ブラインド） | - |
| `tournamentTemplate/*.ts` | `domains/tournament/template/*.ts` | トーナメントドメイン（テンプレート） | - |
| `callables/*tournament*.ts` | `domains/tournament/services/*.ts` | トーナメントドメインのサービス | 要確認：callablesから移行 |
| `utils/paymentSplitCalculator.ts` | `domain-kernel/money/paymentSplitCalculator.ts` | 複数ドメインで使われる業務概念 | - |
| `utils/getOpenBills.ts` | `domains/accounting/services/getOpenBills.ts` | 会計ドメインのサービス | 要確認：utilsかaccountingか |
| `utils/logUtils.ts` | `platform/logging/logUtils.ts` | 業務概念を含まない純粋基盤 | - |
| `utils/qrCodeUtils.ts` | `platform/utils/qrCodeUtils.ts` | 業務概念を含まない純粋基盤 | - |
| `utils/lineMessaging.ts` | `platform/utils/lineMessaging.ts` | 業務概念を含まない純粋基盤 | - |
| `lib/env.ts` | `platform/env/env.ts` | 業務概念を含まない純粋基盤 | - |
| `lib/devicePermissions.ts` | `platform/device/devicePermissions.ts` | 業務概念を含まない純粋基盤（薄いヘルパ） | - |
| `lib/actionLogger.ts` | `domains/tournament/services/actionLogger.ts` または `platform/logging/actionLogger.ts` | 要確認：トーナメント専用か汎用か | **要確認** |
| `config/ops.ts` | `domain-kernel/config/ops.ts` | 複数ドメインで使われる業務概念（店舗設定） | - |
| `helpers/billsApi/dualWrite.ts` | `domain-kernel/dual_write/dualWrite.ts` | 複数ドメインで使われる業務概念（移行期の特殊処理） | 要確認：accountingドメインに属するか |
| `auth/getFirebaseCustomToken.ts` | `platform/auth/getFirebaseCustomToken.ts` | 認証基盤 | - |
| `close_process/*.ts` | `domains/accounting/services/close_process/*.ts` または `platform/close_process/*.ts` | 要確認：accountingドメインかplatformか | **要確認** |
| `rollbackFunction/*.ts` | `domains/tournament/services/rollback/*.ts` | トーナメントドメインのロールバック | 要確認：汎用ロールバックかトーナメント専用か |
| `http/controlHook.ts` | `http/controlHook.ts` | HTTP関数（入口） | - |
| `webhook/*.ts` | `webhook/*.ts` | Webhook（入口） | - |
| `types/*.ts` | `types/*.ts` | 型定義 | - |
| `TBD/*.ts` | （要確認） | 要確認 | **要確認** |

## 6. 要確認事項

### 分類判断が困難な項目

1. **`lib/globalConstant.dart`**
   - 現状: `infrastructure/config/` に分類
   - 要確認: 業務概念として `domain-kernel` 相当か、それともアプリ設定として `infrastructure` か
   - 判断材料: 複数ドメインで使われる業務ルール（プライズ配分、支払い方法制限等）を含む

2. **`functions/src/lib/actionLogger.ts`**
   - 現状: `lib/` に配置
   - 要確認: トーナメント専用か汎用ログ基盤か
   - 判断材料: `scheduledTournaments/{tournamentId}/actionLog` に書き込むため、トーナメント専用の可能性が高い
   - 提案: `domains/tournament/services/actionLogger.ts` に移行

3. **`functions/src/close_process/*.ts`**
   - 現状: `close_process/` に配置
   - 要確認: accountingドメインに属するか、platform（基盤処理）か
   - 判断材料: `cleanupActiveStaysOnClose` は会計関連、`resetAllTables`/`resetAllSideGames` はシステムリセット
   - 提案: `domains/accounting/services/close_process/` に移行（会計関連のクロージング処理）

4. **`functions/src/helpers/billsApi/dualWrite.ts`**
   - 現状: `helpers/billsApi/` に配置
   - 要確認: accountingドメインに属するか、domain-kernel（移行期の特殊処理）か
   - 判断材料: 移行期の特殊処理で、複数ドメインで使われる可能性がある
   - 提案: `domain-kernel/dual_write/dualWrite.ts` に移行（移行期の特殊処理として）

5. **`functions/src/utils/getOpenBills.ts`**
   - 現状: `utils/` に配置
   - 要確認: accountingドメインのサービスか、platform（汎用ユーティリティ）か
   - 判断材料: `bills` コレクションを参照し、会計関連の機能
   - 提案: `domains/accounting/services/getOpenBills.ts` に移行

6. **`functions/src/rollbackFunction/*.ts`**
   - 現状: `rollbackFunction/` に配置
   - 要確認: トーナメント専用か汎用ロールバックか
   - 判断材料: `undoAddon`, `undoBustAndExit` など、トーナメント関連のロールバック
   - 提案: `domains/tournament/services/rollback/*.ts` に移行

7. **`functions/src/TBD/*.ts`**
   - 現状: `TBD/` に配置
   - 要確認: どのドメインに属するか、削除予定か
   - 判断材料: ファイル内容を確認する必要がある

8. **`lib/main.dart` のルーティング分離**
   - 現状: `main.dart` 内にルーティングロジックが含まれる
   - 要確認: `app/routing.dart` に分離するか
   - 判断材料: ルーティングロジックの複雑さを確認する必要がある

9. **`functions/src/callables/` の機能別統合**
   - 現状: `callables/` に全Callable Functionsが配置
   - 要確認: 機能別に `callables/accounting.ts`, `callables/tournament.ts` などに統合するか、現状維持か
   - 判断材料: ファイル数の多さと管理のしやすさを考慮

10. **`lib/to_be_deleted/` の扱い**
    - 現状: `to_be_deleted/` に配置
    - 要確認: 削除予定のため移設不要だが、削除時期を確認する必要がある

### ドメイン間の依存関係

- **domains/accounting** と **domains/analytics**: 会計データが分析に使われる
- **domains/tournament** と **domains/accounting**: トーナメント参加費が会計に反映される
- **domains/user** と **domains/accounting**: ユーザーの入店・退店が会計に反映される
- **domains/order** と **domains/accounting**: 注文が会計に反映される

これらの依存関係は、`domain-kernel` を経由するか、直接参照するか、要確認。

### 未実装・未確認の機能

- `functions/src/http/controlHook.ts` の詳細な役割
- `functions/src/webhook/lineWebhook.ts` の詳細な役割
- `lib/HomeBackAction.dart` の役割と配置先

---

**最終更新**: 2025-01-XX
**作成者**: AI Assistant
**目的**: フォルダ構造リファクタリングの分類案提示（実装は行わない）

