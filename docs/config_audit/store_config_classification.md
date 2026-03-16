# 店舗別設定の抽出・分類（Build / Deploy / Run）

## 1. 概要（目的/対象/分類定義の再掲）

- 目的: このリポジトリ内の「店舗ごとに値が変わりうる設定」を抽出し、`Build time` / `Deploy time` / `Run time` のどこに寄せるべきかを判断する。
- 対象: Flutter (`lib/**`, `android/**`)、Cloud Functions (`functions/src/**`)、Firebase設定 (`firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`)、および設計ドキュメントで言及される `--dart-define`。
- 分類定義:
  - Build time: APK生成時に固定され、配布後に変更できない/すべきでない値。
  - Deploy time: Cloud Functionsデプロイ時に固定される値（Secret/環境変数/実行設定/IAM依存含む）。
  - Run time: 運用中に店舗ごとに変更したい値（機能ON/OFF、営業時間、閾値、UI出し分け等）。
- 作業開始時状態: `dirty`（`docs/table_device/tobe_spec.md` が既存変更）。
- 作業終了時確認:
  - `git diff --name-only` は `docs/table_device/tobe_spec.md` のみ（本作業前からの既存変更）。
  - 本作業での新規作成は `docs/config_audit/store_config_classification.md` の1本のみ。
  - `git status --short` は `M docs/table_device/tobe_spec.md`（既存）と `?? docs/config_audit/`（本作業）を確認。

## 2. 抽出サマリ（件数：候補総数、Build/Deploy/Runの内訳）

- 候補総数: 37
- Build time 推奨: 10
- Deploy time 推奨: 15
- Run time 推奨: 12
- 主要な偏り:
  - `lib/globalConstant.dart` に Run-time性の高い値が多数固定化されている。
  - Functions側は `process.env` / `defineString` で Deploy-time値を持つが、一部は運用トグル用途（Run-time寄せ候補）。
  - 同義設定の二重管理（Dart定数とTS定数/環境変数）あり。

## 3. 設定項目一覧（メイン表）

| ID | 設定名（キー/変数/フィールド） | 現在の場所（file path + 種別） | 参照箇所（file path + 説明） | 店舗差分の理由 | 推奨分類 | 推奨の集約先 | 移行難易度 | リスク/備考 |
|---|---|---|---|---|---|---|---|---|
| B-01 | Firebase project/app識別子 (`projectId`, `appId`, `apiKey`) | `lib/firebase_options.dart` (Dart const) | `lib/main.dart` (`DefaultFirebaseOptions.currentPlatform`) | 店舗ごとに接続先が異なる場合あり | Build | FlutterFlavor + 環境別 `firebase_options.dart` | Med | 誤接続時に本番/検証混線 |
| B-02 | Android Firebase client (`project_info`, `package_name`) | `android/app/google-services.json` (JSON) | `android/app/build.gradle.kts` (`com.google.gms.google-services`) | 店舗別アプリ配布なら差分候補 | Build | Flavor別 `google-services.json` | Med | 誤配布で別Firebaseへ接続 |
| B-02b | iOS Firebase client (`API_KEY`, `BUNDLE_ID`, `PROJECT_ID`, `GOOGLE_APP_ID`) | `ios/Runner/GoogleService-Info.plist` (plist) | Xcode build + `firebase_options.dart` | B-02のiOS相当。店舗別配布なら差分候補 | Build | Flavor/Scheme別 `GoogleService-Info.plist` | Med | 誤配布で別Firebaseへ接続 |
| B-02c | macOS Firebase client | `macos/Runner/GoogleService-Info.plist` (plist) | 同上（macOS向け） | B-02bと同様 | Build | Flavor別 `GoogleService-Info.plist` | Med | macOS配布時に影響 |
| B-03 | `applicationId` | `android/app/build.gradle.kts` (Gradle) | 同ファイル `defaultConfig.applicationId` | 店舗別アプリ識別子 | Build | Flavorごとの `applicationIdSuffix`/ID | Low | 衝突・上書きインストール |
| B-04 | アプリ表示名 (`android:label`) | `android/app/src/main/AndroidManifest.xml` | Launcher表示 | 店舗別ブランド名 | Build | `resValue` / Flavor resources | Low | 店舗誤表示 |
| B-05 | アプリアイコン (`@mipmap/ic_launcher`) | `android/app/src/main/AndroidManifest.xml` | 同 | 店舗別ブランド差分 | Build | Flavorごとの icon set | Low | 見た目誤配布 |
| B-04b | iOS アプリ表示名 (`CFBundleDisplayName`) | `ios/Runner/Info.plist` (plist) | iOS Launcher表示 | B-04のiOS相当。店舗別ブランド名 | Build | Scheme別 `Info.plist` / `xcconfig` | Low | iOS側で店舗誤表示 |
| B-06 | `TABLE_DEVICE_REGISTRATION_ENABLED` | `docs/table_device/tobe_spec.md`（設計上は dart-define） | 同ドキュメント内 `bool.fromEnvironment(...)` 記述 | 卓端末機能の有効化方針が店舗差分になりうる | Build（現行）/ Run（推奨） | `storeMeta/config.features.tableDeviceRegistrationEnabled` | Med | 現行は再ビルド必須 |
| B-07 | `FORCE_CLEAR_PASSCODE` | `docs/table_device/tobe_spec.md`（設計上は dart-define） | 同ドキュメント内 `String.fromEnvironment(...)` 記述 | 店舗別運用ポリシー差 | Build（現行）/ Deploy+Secret（推奨） | Secret Manager + Callable経由検証 | Med | Build埋め込みで漏えいリスク |
| D-01 | `LINE_CHANNEL_ACCESS_TOKEN` | `functions/src/domains/webhook/callables/lineWebhook.ts`, `functions/src/domains/webhook/services/lineMessaging.ts` (`defineString` × 2箇所) | `lineWebhook`, `lineMessaging` で `value()` 利用 | 店舗/公式LINEチャネル差分 | Deploy | Secret Manager (`defineSecret`) | Med | **2ファイルに同一トークンのdefault値**がコード内にあり漏えい高リスク |
| D-02 | `STAFF_RICHMENU_ID` | 同上 (`defineString`) | 同 | 店舗別メニューID | Deploy | `defineString`（default削除） | Low | 誤IDでUI崩れ |
| D-03 | `USER_RICHMENU_ID` | 同上 (`defineString`) | 同 | 店舗別メニューID | Deploy | `defineString`（default削除） | Low | 誤IDでUI崩れ |
| D-04 | `LINE_PLAN` (Functions) | `lineWebhook.ts`, `confirmShiftRequest.ts` (`defineString`) | `linePlan.value()` で機能制御 | 契約プラン差分 | Deploy | `defineString` + Config管理 | Low | Dart側 `linePlan` との二重管理 |
| D-05 | `ENABLE_SETTLEMENT_AGGREGATOR` | `functions/src/domains/bills/triggers/billsOnSettle.ts` (`defineString`) | settle時 enqueue 判定 | 運用トグルだが関数側制御 | Deploy（短期）/ Run（将来） | `storeMeta/config.features.enableSettlementAggregator` | Med | 緊急停止に再デプロイ必要 |
| D-06 | `STORE_CLOSE_HOUR` (Functions) | `functions/src/shared/time/configOps.ts` (`process.env`/`functions.config`) | `getAccountingHistory.ts` ほか | 店舗営業時間差分 | Deploy（現行）/ Run（推奨） | `storeMeta/config.businessDay.closeHour` | High | Dart側定数と不整合で営業日ズレ |
| D-07 | `WRITE_TODAYS_BILLS_IN_PARALLEL` | `functions/src/domains/bills/repos/dualWrite.ts`, `nightlyReconciliationCheck.ts` | dual-write/差分チェック制御 | 店舗移行段階差分 | Deploy（現行）/ Run（推奨） | `storeMeta/config.features.dualWrite` | Med | 即時切替不可 |
| D-08 | `ENQUEUE_SCHEDULER_ENABLED` | `EnqueueTournamentTasksByScheduler.ts`, `enqueueTournamentTasksCore.ts` | enqueue実行可否 | 店舗導入段階差分 | Deploy（現行）/ Run（推奨） | `storeMeta/config.features.enqueueSchedulerEnabled` | Med | 段階展開で再デプロイ負担 |
| D-09 | `TEMPLATE_BUSINESSDATE_CHECK` | `createScheduledTournament.ts` / `createTournamentRecurrence.ts` / `generateRecurringTournamentsCore.ts` | 重複チェック有無 | 店舗ルール差分ありうる | Deploy（現行）/ Run（推奨） | `storeMeta/config.features.templateBusinessDateCheck` | Med | 運用中切替不可 |
| D-10 | `ENABLE_AUTO_OPEN_CLOSE`, `TASK_CLOSE_OFFSET_MINUTES`, `TASK_OPEN_OFFSET_MINUTES` | `functions/src/domains/storeMeta/scheduler/weeklyPlanner.ts` (`process.env`) + `lib/globalConstant.dart` (Dart const) | 自動開閉店とオフセット制御 | 店舗運用差分が強い | Deploy（現行）/ Run（推奨） | `storeMeta/config.autoOpenClose.*` | High | 誤設定で誤開店/誤閉店。**Dart側にも同名定数が存在し二重管理** |
| D-11 | Cloud Tasks関連 env (`CONTROL_HOOK_URL`, `TASKS_QUEUE`, `TASKS_LOCATION`, `TASKS_INVOKER_SA`, `CLOSE_ASSESSMENT_URL`, `OPEN_ASSESSMENT_URL`, `WEEKLYPLANNER_*`) | `functions/src/shared/firebase/env.ts` + 各呼出元 | `tasks.ts`, `weeklyPlanner.ts`, `continueBusinessTerminal.ts` | インフラ差分（プロジェクト/環境） | Deploy | Functions env + IAM | Low | 誤URL/SAでタスク失敗 |
| D-12 | `QR_SECRET_KEY` | `functions/src/domains/user/services/qrCodeUtils.ts` (`process.env` fallback) | QR token生成 | 店舗/環境ごとの秘密値 | Deploy | Secret Manager (`defineSecret`) | Med | fallback `"default-secret-key"` は重大リスク |
| D-13 | `storeId` / `tenantId` ハードコードデフォルト (`'default-store'`, `'default-tenant'`) | `functions/src/domains/tournament_createTournament/callables/createScheduledTournament.ts`, `createTournamentRecurrence.ts`, `enqueueTournamentTasksCore.ts`, `generateRecurringTournamentsCore.ts` + `lib/tournament/active/tournament_service.dart`, `create_tournament_from_calendar_page.dart` | トーナメント作成・スケジュール処理全般 | マルチテナント/多店舗展開で店舗識別が必要 | Deploy（短期）/ Run（将来） | Functions env or `storeMeta/storeId` | High | `'default-store'` が本番に残ると店舗横断で誤動作 |
| D-14 | Cloud Functions `region` (`'us-central1'`) | 16以上の Callable/Trigger 定義（`continueBusinessTerminal.ts`, `getAttendanceCorrectionRequests.ts` 等） | 全 Cloud Functions のデプロイ先リージョン | 日本向け店舗なら `asia-northeast1` 等への変更が想定 | Deploy | 共通定数 or Functions env `FUNCTIONS_REGION` | Med | 全関数に散在しているため変更漏れリスク |
| D-15 | スケジューラ CRON式（Functions側ハードコード） | `monthlyPayrollTrigger.ts` (`'59 23 25 * *'`), `scheduledCleanup.ts` (`"0 17 * * *"`), `weeklyPlanner.ts` (`'0 11 * * 0'`), `EnqueueTournamentTasksByScheduler.ts` (`'0 5 * * *'`), `GenerateRecurringTournamentsByScheduler.ts` (`"0 23 * * 0"`), `scheduleGenerateNextYearBusinessHours.ts` (`'25 23 28 1 *'`) | 各スケジューラ関数の実行タイミング | 店舗営業時間帯・タイムゾーン差分。特に `monthlyPayrollTrigger` の25日は `PAYROLL_END_DAY` と連動 | Deploy | 環境変数 or `defineString` で外部化 | Med | Dart側 `PAYROLL_END_DAY` 等との暗黙的な依存関係 |
| R-01 | `storeMeta/currentBusinessDay.status`, `currentBusinessDateKey`, `lastClosedBusinessDateKey` | Firestore (ドキュメント) | `functions/src/domains/storeMeta/*`, `functions/src/domains/analytics/callables/migrateSettledBillsForBusinessDay.ts` | 店舗営業状態は運用中に変動 | Run | `storeMeta/currentBusinessDay` 維持 | Low | 中枢状態なので監視必須 |
| R-02 | `storeMeta/currentBusinessDay.manualOverride.*` | Firestore | `continueBusinessTerminal.ts` | 緊急時の継続運用 | Run | `storeMeta/currentBusinessDay.manualOverride` | Low | 誤継続による締め遅延 |
| R-03 | `devices.options.store_management` | Firestore (`devices`) | `lib/Home/terminalHomePage.dart`, `lib/services/device_service.dart` | 店舗内デバイス権限差分 | Run | `devices.options.*` 維持 | Low | 権限誤設定 |
| R-04 | `devices.optionParams.*.tableId` | Firestore (`devices.optionParams`) | `lib/pages/device_management_page.dart`, `table_select*` | 卓ごと運用差分 | Run | `devices.optionParams` 維持 | Low | 誤卓紐づけ |
| R-05 | `device.role` (`admin`/`terminal`) | Firestore (`devices.role`) + `SharedPreferences` にローカルキャッシュ (`device_role`) | `lib/main.dart`, `device_registration_page.dart`, `device_management_page.dart`, `device_service.dart` | 店舗運用体制差分 | Run | `devices.role` 維持 | Low | 権限誤付与。`SharedPreferences` へのキャッシュ (`device_id`, `device_name`, `device_role`) があるためFirestore更新後のキャッシュ不整合に注意 |
| R-06 | 入店料設定 (`entranceFee`, `entranceFeeDescription`, `chargeEntranceFeeOnReentry`) | `lib/globalConstant.dart` (Dart const) | `lib/UserRegisterView/userQRCheckInPage.dart`, `lib/UserLogin/UserManualCheckInPage.dart` | 店舗料金ルール差分 | Run | `storeMeta/config.billing.entryFee.*` | Med | 価格変更に再ビルド必要 |
| R-07 | 給与締め日 (`PAYROLL_START_DAY`, `PAYROLL_END_DAY`, `PAYROLL_PERIOD_DESCRIPTION`) | `lib/globalConstant.dart` | `lib/AttendanceManagement/allStaffAttendancePage.dart` | 店舗契約・締め日差分 | Run | `storeMeta/config.payroll.*` | Med | 締め日誤りで勤怠集計ミス |
| R-08 | シフトフロー日 (`SHIFT_SUBMISSION_*`, `SHIFT_SCHEDULING_START_DAY`) | `lib/globalConstant.dart` | `lib/StaffDate/shiftHomePage.dart` | 店舗運用スケジュール差分 | Run | `storeMeta/config.shiftFlow.*` | Med | 締切誤案内 |
| R-09 | 必要人数 (`requiredStaffByTimeSlot`) | RequiredStaffByTimeSlotService / helpers.getRequiredStaffByTimeSlot | `lib/StaffDate/*`, `functions/src/domains/shift/callables/*` | 店舗人員計画差分 | Run | `storeMeta/requiredStaffByTimeSlot` | High | - |
| R-10 | 営業時間スタイル (`businessHoursStyle*`, `businessHoursStyles`) | `lib/globalConstant.dart`, `functions/src/shared/businessHours/services/styles.ts` | `lib/StaffDate/businessDayEditPage.dart`, Functions style helper | 店舗営業時間差分 | Run | `businessHoursMonthlyMap` + style master doc | High | 二重定義で開閉店判定ズレ |
| R-11 | 支払ポリシー (`categoryPaymentMethods`, `POINT_PRIORITY`, 丸め単位) | `lib/globalConstant.dart` + `functions/src/domains/bills/services/paymentSplitCalculator.ts` | `lib/Accounting/*`, `verifyPaymentSplit.ts` | 店舗会計ルール差分 | Run | `storeMeta/config.billing.paymentPolicy` | High | 会計計算不一致 |
| R-12 | チップ換算 (`SIDE_GAME_CHIP_EXCHANGE_RATE`) | `lib/globalConstant.dart` + TS計算ロジック内定数 | `lib/Accounting/*`, `paymentSplitCalculator.ts` | 店舗レート差分 | Run | `storeMeta/config.billing.sideGameChipRate` | High | 金額誤計算 |

## 4. `globalConstant.dart` 詳細レビュー

対象ファイル: 実体は `lib/globalConstant.dart`（単数形）。

### 4-1. “店舗差分候補”列挙（参照あり）

- 料金/会計系: `entranceFee`, `chargeEntranceFeeOnReentry`, `categoryPaymentMethods`, `SIDE_GAME_CHIP_EXCHANGE_RATE`, `POINT_PRIORITY`, `POINT_A_B_ROUNDING_UNIT`, `SIDE_GAME_CHIP_ROUNDING_UNIT`
- 営業/勤怠系: `PAYROLL_START_DAY`, `PAYROLL_END_DAY`, `STORE_CLOSE_HOUR`, `CALC_BUSINESS_DATE_BUFFER_MINUTES`, `requiredStaffByTimeSlot`, `businessHoursStyles`
- 自動開閉店系: `ENABLE_AUTO_OPEN_CLOSE`, `TASK_CLOSE_OFFSET_MINUTES`, `TASK_OPEN_OFFSET_MINUTES`
- シフト運用系: `SHIFT_SUBMISSION_START_DAY`, `SHIFT_SUBMISSION_END_DAY`, `SHIFT_SCHEDULING_START_DAY`, `ADMIN_CREATED_SHIFT_ID`, `isShiftRequestEnabled`（`linePlan`依存getter）
- トーナメント系: `defaultPrizeRatio`, `prizeReceiverPercentage`, `prizeRoundingMethod`, `prizeRoundingUnit`, `prizeDistribution`, `pointTypes`
- スケジューラCRON系: `RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON`, `ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON`
- UI/選択肢系: `menuCategories`, `sideGameTypes`

### 4-2. TS側がソースでDart側がコピー/メモの疑い（またはその逆）

- `STORE_CLOSE_HOUR`
  - Dart: `lib/globalConstant.dart`
  - TS実利用: `functions/src/shared/time/configOps.ts`（`process.env`/`functions.config`）
  - 判定: 実運用ソースはFunctions env寄り。Dart側定数は同期メモ化しており二重管理。
- `CALC_BUSINESS_DATE_BUFFER_MINUTES`
  - Dart: `lib/globalConstant.dart`
  - TS: `functions/src/domains/bills/repos/calcBusinessDateHelpers.ts` (`return 70`)
  - 判定: 明確な重複管理。
- `businessHoursStyles`
  - Dart: `lib/globalConstant.dart`
  - TS: `functions/src/shared/businessHours/services/styles.ts`
  - 判定: コメントでも同期必須。重複管理。
- `requiredStaffByTimeSlot`
  - Dart: `lib/globalConstant.dart`
  - TS: `functions/src/domains/shift/callables/*` 内 `getRequiredStaffByTimeSlot()` デフォルト配列
  - 判定: 重複管理。
- `categoryPaymentMethods` / `POINT_PRIORITY` / `SIDE_GAME_CHIP_EXCHANGE_RATE` など
  - Dart: `lib/globalConstant.dart`
  - TS: `functions/src/domains/bills/services/paymentSplitCalculator.ts`
  - 判定: 計算ロジックを跨ぐ重複管理。
- `linePlan`
  - Dart: `lib/globalConstant.dart`
  - TS: `defineString("LINE_PLAN")`（`lineWebhook.ts`, `confirmShiftRequest.ts`）
  - 判定: 二重管理。
- `ENABLE_AUTO_OPEN_CLOSE` / `TASK_CLOSE_OFFSET_MINUTES` / `TASK_OPEN_OFFSET_MINUTES`
  - Dart: `lib/globalConstant.dart`（`static const`）
  - TS: `functions/src/domains/storeMeta/scheduler/weeklyPlanner.ts`（`process.env`）
  - 判定: Dart側定数とFunctions側環境変数の二重管理。実運用ソースはFunctions env寄り。
- `RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON` / `ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON` / `WEEKLY_PLANNER_CRON`
  - Dart: 削除済み（旧 `lib/globalConstant.dart`）
  - TS: Functions側で `process.env.XXX` を参照。未設定時は各ファイル内デフォルト値を使用。
  - 判定: 環境変数化済み。Cloud Logging で source 判別可能。

### 4-3. 未使用/重複の指摘

- 未使用候補（少なくとも `lib/` 内参照なし）:
  - `schemaVersion`
  - `STORE_CLOSE_DESCRIPTION`
  - `CALC_BUSINESS_DATE_BUFFER_DESCRIPTION`
  - `SIDE_GAME_CHIP_DESCRIPTION`
  - `linePlanName`
- 削除済み（D-15 CRON 系: `WEEKLY_PLANNER_CRON`, `RECURRING_TOURNAMENT_*_CRON`, `*_RUN_AT_DESCRIPTION` は globalConstant から削除済み）
- 重複（実装同期コメントあり）:
  - 営業時間スタイル、シフト必要人数、支払計算ポリシー、営業日境界値。

## 5. 環境変数（Deploy/Build）詳細レビュー

### 5-1. 実際に確認できたFunctions側設定

- `process.env` 直接参照:
  - `STORE_CLOSE_HOUR`, `WRITE_TODAYS_BILLS_IN_PARALLEL`
  - `ENQUEUE_SCHEDULER_ENABLED`, `TEMPLATE_BUSINESSDATE_CHECK`
  - `ENABLE_AUTO_OPEN_CLOSE`, `TASK_CLOSE_OFFSET_MINUTES`, `TASK_OPEN_OFFSET_MINUTES`
  - `QR_SECRET_KEY`, `PROJECT_ID`/`GCLOUD_PROJECT`/`GCP_PROJECT`
  - `NODE_ENV`（dotenv読込判定）
- `firebase-functions/params` (`defineString`):
  - `LINE_CHANNEL_ACCESS_TOKEN`（`lineWebhook.ts` + `lineMessaging.ts` の2箇所）, `STAFF_RICHMENU_ID`, `USER_RICHMENU_ID`
  - `LINE_PLAN`, `ENABLE_SETTLEMENT_AGGREGATOR`
- 旧方式 fallback:
  - `functions.config()` を `STORE_CLOSE_HOUR` と `WRITE_TODAYS_BILLS_IN_PARALLEL` で使用。
- 必須env取得ユーティリティ:
  - `getEnv(name)` により `CONTROL_HOOK_URL`, `TASKS_*`, `CLOSE_ASSESSMENT_URL`, `OPEN_ASSESSMENT_URL`, `WEEKLYPLANNER_*` を取得。

### 5-2. Build/Deploy/Runの寄せ先判断

- Deployに残すべき:
  - 秘密値（LINE token, QR secret）
  - インフラ識別子（Queue/Location/Invoker SA/Hook URL）
  - プロジェクト識別 (`PROJECT_ID` 系)
- Runへ寄せるべき（現状Deployにある）:
  - 営業/運用トグル: `STORE_CLOSE_HOUR`, `ENABLE_AUTO_OPEN_CLOSE`, `TASK_*_OFFSET_MINUTES`
  - 段階導入フラグ: `ENQUEUE_SCHEDULER_ENABLED`, `WRITE_TODAYS_BILLS_IN_PARALLEL`, `TEMPLATE_BUSINESSDATE_CHECK`, `ENABLE_SETTLEMENT_AGGREGATOR`

## 6. 実行時（storeMeta等）への寄せ先案

提案スキーマ（案）:

- `storeMeta/config` ドキュメント
  - `features`
    - `dualWriteEnabled: bool`
    - `enqueueSchedulerEnabled: bool`
    - `templateBusinessDateCheck: bool`
    - `settlementAggregatorEnabled: bool`
    - `tableDeviceRegistrationEnabled: bool`
  - `businessDay`
    - `closeHour: number` (0-48)
    - `calcBufferMinutes: number`
  - `autoOpenClose`
    - `enabled: bool`
    - `taskCloseOffsetMinutes: number`
    - `taskOpenOffsetMinutes: number`
  - `billing`
    - `entranceFee: number`
    - `entranceFeeDescription: string`
    - `chargeEntranceFeeOnReentry: bool`
    - `sideGameChipRate: number`
    - `paymentPolicy: { categoryPaymentMethods, pointPriority, roundingUnits }`
  - `shift`
    - `requiredStaffByTimeSlot: []`
    - `submissionStartDay`, `submissionEndDay`, `schedulingStartDay`
  - `payroll`
    - `startDay`, `endDay`

  - `identity`
    - `storeId: string`
    - `tenantId: string`

補足:
- 秘密値は `storeMeta` へ置かず Secret Manager 維持。
- クライアント参照が必要な値のみ読み取り専用で公開し、更新は管理者Callable経由に限定。

## 7. リスクと優先順位（Top10 + 事故りやすいポイント）

### 7-1. 実行時へ寄せるべき最優先 Top10

1. `STORE_CLOSE_HOUR`（営業日境界）
2. `ENABLE_AUTO_OPEN_CLOSE`
3. `TASK_CLOSE_OFFSET_MINUTES`
4. `TASK_OPEN_OFFSET_MINUTES`
5. `requiredStaffByTimeSlot`
6. `businessHoursStyles`（またはスタイルマスタ）
7. `SIDE_GAME_CHIP_EXCHANGE_RATE`
8. `categoryPaymentMethods`
9. `POINT_PRIORITY` / 丸め単位
10. 入店料3点（`entranceFee*`）

### 7-2. デプロイ時に残すべきもの

- `LINE_CHANNEL_ACCESS_TOKEN`（Secret化）
- `QR_SECRET_KEY`（Secret化）
- Cloud Tasks/IAM/URL関連 env（`TASKS_*`, `*_URL`, `*_SA`）
- `PROJECT_ID` 系

### 7-3. ビルド時に固定すべきもの

- `firebase_options.dart` / `google-services.json` / `GoogleService-Info.plist`（iOS/macOS）のFirebase接続先
- `applicationId`
- アプリ名/アイコン（Android `AndroidManifest.xml` + iOS `Info.plist` の `CFBundleDisplayName`）
- （現行仕様のままなら）`--dart-define` で埋め込む値

### 7-4. 現状の最大リスク（3〜5件）

- 秘密情報の平文default:
  - `lineWebhook.ts` **および** `lineMessaging.ts` の `LINE_CHANNEL_ACCESS_TOKEN` default（2箇所に同一トークン）
  - `qrCodeUtils.ts` の `"default-secret-key"`
- 二重管理による不整合:
  - `STORE_CLOSE_HOUR`, `businessHoursStyles`, `requiredStaffByTimeSlot`, 会計計算ポリシー
  - `ENABLE_AUTO_OPEN_CLOSE`, `TASK_CLOSE_OFFSET_MINUTES`, `TASK_OPEN_OFFSET_MINUTES`（Dart const + Functions env）
- 運用トグルがDeploy-time固定:
  - 緊急停止/段階展開で再デプロイが必要
- `globalConstant.dart` に未使用/説明用定数が混在:
  - 誤って「運用設定」と誤認しやすい

## 8. 未確認/継続調査が必要な範囲

- `docs/table_device/tobe_spec.md` に記載された `--dart-define` 値は、現時点で `lib/` 実コード側の参照実装が未確認（ドキュメント起点の設計値）。
- `functions/.env*` はリポジトリ内に存在しなかったため、実際のデプロイ環境値はFirebaseプロジェクト側設定の追加確認が必要。
- `storage.rules` は対象スコープに含まれるが未分析。QRコード・メニュー画像のパスルールが含まれており、ストレージバケットが店舗ごとに異なる場合は影響しうる。
- iOS/macOS の `GoogleService-Info.plist` および `Info.plist` を本改訂で Build-time 項目として追加した（B-02b, B-02c, B-04b）。iOS Scheme/Flavor 構成の実態は追加確認が必要。
- `SharedPreferences` によるデバイス情報のローカルキャッシュ（`device_id`, `device_name`, `device_role`）が `device_service.dart` に存在。Firestore 側の `devices` ドキュメント更新後のキャッシュ整合性は運用上の確認事項。
- `storeId` / `tenantId` のハードコードデフォルト（`'default-store'`/`'default-tenant'`）がトーナメント関連の7ファイル以上に散在（D-13）。マルチテナント戦略の確定が必要。

## 9. 付録：探索クエリ（grep/検索ワード一覧）

- `process.env`
- `dotenv`
- `defineSecret`
- `defineString`
- `functions.config(`
- `String.fromEnvironment|bool.fromEnvironment|flutter_dotenv|dart-define`
- `GlobalConstants`
- `STORE_CLOSE_HOUR|getStoreCloseHour|normalizeStoreCloseHour`
- `WRITE_TODAYS_BILLS_IN_PARALLEL`
- `ENQUEUE_SCHEDULER_ENABLED`
- `TEMPLATE_BUSINESSDATE_CHECK`
- `ENABLE_AUTO_OPEN_CLOSE|TASK_CLOSE_OFFSET_MINUTES|TASK_OPEN_OFFSET_MINUTES`
- `storeMeta|currentBusinessDay`
- `store_management|optionParams|role`
- `google-services.json`
- `firebase_options.dart`
- `applicationId`
- `AndroidManifest.xml`
- `firestore.rules`
- `firestore.indexes.json`
- `storage.rules`
- `GoogleService-Info.plist`
- `CFBundleDisplayName|CFBundleName`
- `default-store|default-tenant|storeId|tenantId`
- `region.*us-central1`
- `SharedPreferences|shared_preferences`
- `schedule|cron|onSchedule`
- `maxInstances`
