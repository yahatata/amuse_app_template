# CHANGE LOG（Config Migration）

本ファイルは設定移行に関する変更履歴テンプレートです。  
実変更時に新しいエントリを先頭へ追加してください。

---

## Phase3/4/5 実施順序の変更

- Date (JST): 2026-03-05
- Change ID: `CM-PhaseOrder-001`
- Category: `docs`
- Classification IDs: N/A
- SSoT Before/After:
  - Before: Phase2.1 → Phase3 → Phase4。Phase5 は Phase2.1 の次。
  - After: Phase2.1 → Phase4 / Phase5（並行可）→ Phase3（最後）
- Summary:
  - Phase3（ハードニング・運用整理）を Phase4・5 の後に実施するよう変更
  - Phase4・5 は Phase2.1 完了後に実施可能。Phase3 の完了は不要
  - migration_roadmap.md、phase3/4/5 README、phase0B/PHASE0B_DEPRECATION_PLAN.md を更新
- Scope: `Docs`
- Compatibility: Non-breaking

---

## Entry Template

- Date (JST):
- Change ID: `CM-0001`
- Category: `Secrets` / `storeMeta-config` / `Top10` / `cleanup` / `env-infra` / `docs`
- Classification IDs: `D-06, R-11` など
- SSoT Before/After:
  - Before:
  - After:
- Duplicate Removed: `Yes` / `No`
- Migration Gate Check: `Pass` / `Fail`
- Summary:
  - 
  - 
- Scope: `Flutter` / `Functions` / `Firebase` / `Ops`
- Compatibility: `Breaking` / `Non-breaking`
- Migration Window:
- Rollback:
  - 
  - 
- Verification:
  - 
  - 
- Related PR/Commit:

---

## 取得失敗時フォールバック方針変更（GAP-2-1）

- Date (JST): 2026-03-05
- Change ID: `CM-Phase2-002`
- Category: `storeMeta-config` / `docs`
- Classification IDs: D-05（GAP-2-1）、D-0020
- SSoT Before/After:
  - Before: 読み取り失敗時は throw、デフォルトには行かない
  - After: 読み取り失敗時も defaults を返す（config_read_error + config_fallback をログ出力）
- Duplicate Removed: No
- Migration Gate Check: Pass
- Summary:
  - configLoader.ts: リトライ後も失敗した場合、throw せず buildFromDefaults() を返す
  - PHASE1_FALLBACK_BEHAVIOR、tobe_config_architecture、運用時資料に方針を反映
- Scope: `Functions` / `Docs`
- Compatibility: Non-breaking
- Migration Window: N/A
- Rollback: 該当コードを throw に戻す（通常は不要）
- Verification: configLoader.spec.ts コメント反映済み
- Related PR/Commit: (to be filled)

---

## Phase2 全量移行完了（参照差し替え・旧参照削除・状態記録）

- Date (JST): 2026-03-05
- Change ID: `CM-Phase2-001`
- Category: `storeMeta-config` / `cleanup`
- Classification IDs: D-04, D-05, D-07, D-08, D-09, D-10, R-06, R-07, R-08, R-09, R-10, R-11, R-12, B-06, CALC_BUSINESS_DATE_BUFFER_MINUTES
- SSoT Before/After:
  - Before: process.env / defineString / GlobalConstants のハードコード
  - After: getStoreConfig() / StoreConfigService.instance.latestData（storeMeta/config → defaults.ts/store_config_defaults.dart フォールバック）
- Duplicate Removed: Yes（GlobalConstants から移行済み定数を削除、Functions 内ハードコード定数を削除）
- Migration Gate Check: Pass（TypeScript tsc --noEmit パス、Flutter analyze エラー 0）
- Summary:
  - **Batch B（機能フラグ）**: D-05 settlementAggregator, D-07 dualWrite, D-08 enqueueScheduler, D-09 templateBusinessDateCheck を defineString/process.env → getStoreConfig() に差し替え。shouldDualWrite を async 化し全呼び出し元を await 対応。B-06 はスキーマ定義済み・実コード参照なしで完了
  - **Batch A1（Functions コア）**: CALC_BUFFER_MINUTES → getStoreConfig().businessDay.calcBufferMinutes。D-10 autoOpenClose 3 env → config。R-10 BUSINESS_HOURS_STYLES 定数廃止 → getStoreConfig().businessHoursStyles。D-04 linePlan defineString 2 箇所 → config.linePlan。R-09 requiredStaffByTimeSlot ハードコード配列 6 箇所 → config.shift.requiredStaffByTimeSlot。R-11/R-12 SIDE_GAME_CHIP_EXCHANGE_RATE/CATEGORY_PAYMENT_METHODS/DEFAULT_POINT_PRIORITY 5 ファイル → defaults.ts import + config 引数渡し（pure function 維持）
  - **Batch A2（Flutter）**: GlobalConstants → StoreConfigService 差し替え。accountingPage/categoryPaymentMethodDialog/customerAccountingDetailPage/payment_split_calculator/payment_split_test_page/businessDayEditPage/shiftHomePage/shiftDateDialog/UserManualCheckInPage/userQRCheckInPage/all_staff_attendance_page_from_adminHome
  - **Batch A3（Web + cleanup）**: public/staff/config.js に Firestore 読み取り追加。globalConstant.dart から移行済み定数を一括削除（残存: STORE_CLOSE_HOUR, menuCategories, sideGameTypes, tournament 設定, CRON 設定, ADMIN_CREATED_SHIFT_ID 等）
  - **Batch C/D**: Deploy 項目（D-02/D-03/D-11/D-14/D-15）・Build 項目（B-01〜B-05/B-07）・既存 Run 項目（R-01〜R-05）の状態を「完了」として記録
- Scope: `Functions` / `Flutter` / `Web` / `Docs`
- Compatibility: Non-breaking（未リリースアプリ）
- Migration Window: N/A
- Rollback: コードデプロイで差し替え前状態へ戻す。旧 fallback は維持しない（D-0015）
- Verification:
  - `npx tsc --noEmit` パス
  - `flutter analyze` エラー 0
- Related PR/Commit: (to be filled)

---

## Phase1 タスク5〜8 完了（更新経路・Flutter 参照責務・ロールバック・ログ更新）

- Date (JST): 2026-03-05
- Change ID: `CM-Phase1-002`
- Category: `storeMeta-config` / `docs`
- Classification IDs: N/A（Phase1 設計・文書化の完了）
- SSoT Before/After: N/A
- Duplicate Removed: N/A
- Migration Gate Check: Pass
- Summary:
  - タスク5: 更新経路設計。PHASE1_UPDATE_PATH_DESIGN.md 作成。initializeStoreConfigCallable、詳細設定ページ（AdminHomePage→詳細設定）実装。defaults.ts を唯一のソースとする方針を明文化
  - タスク6: Flutter 参照責務整理。確定ロジックを持たないこと、StoreMetaService と StoreConfigService の分離維持、SSoT 適用範囲を PHASE1_UPDATE_PATH_DESIGN §9 に追記
  - タスク7: ロールバック観点。PHASE1_ROLLBACK.md 作成。旧パターンは移行完了と同時に削除（fallback 維持しない）。取得失敗時・切り戻しは設定（ID）ごとに Phase2 で検討
  - タスク8: CHANGE_LOG / DECISION_LOG 及び config_migration 内関連ドキュメントの更新
- Scope: `Functions` / `Flutter` / `Docs`
- Compatibility: Non-breaking
- Migration Window: N/A
- Rollback: 設計・実装を差し戻す。PHASE1_ROLLBACK に基づく
- Verification: Phase2 着手時に PHASE1 成果物を参照可能であること
- Related PR/Commit: (to be filled)

---

## Phase1 タスク4 完了（Functions・Flutter 取得層の実装）

- Date (JST): 2026-03-05
- Change ID: `CM-Phase1-001`
- Category: `storeMeta-config`
- Classification IDs: D-04, D-10, R-10, R-11, R-12 ほか（PHASE1_CONFIG_SCHEMA 参照）
- SSoT Before/After:
  - Before: 各値が Dart/TS 内で直書きまたは env 参照
  - After: ① storeMeta/config → ② defaults.ts / store_config_defaults.dart → ③ 直書き の読み取り優先度でフォールバック
- Duplicate Removed: 方針に基づく取得層を追加（既存参照の差し替えは Phase2）
- Migration Gate Check: Pass
- Summary:
  - Functions: `configLoader.ts`, `types.ts` を新規作成。`getStoreConfig()`, `buildFromDefaults()`, マージ・getter 群。未存在時 defaults フォールバック、失敗時リトライ後に throw。ログ `config_fallback` / `config_read_error`
  - Flutter: `store_config_service.dart`, `store_config_defaults.dart` を新規作成。snapshot 購読、未存在時デフォルト、失敗時は最後の成功値を維持
  - テスト: configLoader.spec.ts（buildFromDefaults + getStoreConfig 2 件）、store_config_service_test.dart（4 件）。全パス
  - tsconfig から unused_function_lib を exclude、ESLint ignorePatterns に追加（ビルド・lint 通過のため）
- Scope: `Functions` / `Flutter`
- Compatibility: Non-breaking
- Migration Window: N/A（取得層のみ追加、既存コードは未変更）
- Rollback:
  - 追加した config 取得層を削除すれば元に戻る。Phase2 で参照差し替えを行うまで既存挙動は変わらない。
- Verification:
  - `npm test -- configLoader` 全パス（Firestore Emulator 使用時）
  - `flutter test test/services/store_config_service_test.dart` 全パス
- Related PR/Commit: (to be filled)

---

## Phase0B タスク5,6 を Phase2 へ移管・決定事項の文書化

- Date (JST): 2026-03-04
- Change ID: `CM-Phase0B-002`
- Category: `docs`
- Classification IDs: N/A（タスク定義の整理）
- SSoT Before/After: N/A
- Duplicate Removed: N/A
- Migration Gate Check: N/A
- Summary:
  - Phase0B のタスク 5（実装）、タスク 6（テスト・検証）を Phase2 スコープに移管
  - Phase0B は設計・方針の決定に限定。storeMeta/config 取得層は Phase1 で整備するため、参照差し替えは Phase2 で実施
  - PHASE0B_COMPLETED_AND_DECISIONS.md を新規作成（完了サマリ・決定事項）
  - PHASE0B_DECISIONS_FOR_LATER_PHASES.md を config_migration 直下に新規作成（Phase1/2 で必須確認）
  - phase1/phase2 README に着手前の必須確認を追記
  - migration_roadmap の Phase0B にスコープと後続フェーズでの必須確認を追記
- Scope: `Docs`
- Compatibility: Non-breaking
- Migration Window: N/A
- Rollback: ドキュメントを差し戻す
- Verification: Phase1/2 README から PHASE0B_DECISIONS_FOR_LATER_PHASES への参照が正しいこと
- Related PR/Commit: (to be filled)

---

## Phase0B storeMeta/config 仕様・defaults 整備

- Date (JST): 2026-03-04
- Change ID: `CM-Phase0B-001`
- Category: `storeMeta-config` / `docs`
- Classification IDs: D-04, D-10, R-09, R-10, R-11, R-12, CALC_BUSINESS_DATE_BUFFER_MINUTES
- SSoT Before/After:
  - Before: 各 ID で Dart/TS/env に重複定義
  - After: To-Be は storeMeta/config に統一。読み取り優先度 ① config ② defaults.ts ③ 直書き
- Duplicate Removed: 方針確定（実装は Phase2）
- Migration Gate Check: N/A
- Summary:
  - STOREMETA_CONFIG_SPEC.md 新規作成（単一 doc、読み取り優先度、デフォルト値方針）
  - PHASE0B_BEFORE_AFTER_DECISION に全 ID の To-Be 決定を記載
  - PHASE0B_DEPRECATION_PLAN に各 ID の廃止計画を記載
  - tobe_config_architecture に読み取り優先度・欠損時挙動を追記
  - functions/src/shared/config/defaults.ts を新規作成（デフォルト値とコメント）
  - D-06 は storeMeta/config に入れない（Phase4 で廃止）。R-09 は実装時に別 doc 検討
- Scope: `Docs` / `Functions`（defaults.ts のみ）
- Compatibility: Non-breaking
- Migration Window: N/A
- Rollback:
  - defaults.ts を削除すれば元に戻る。ドキュメントは Phase0B 方針を差し戻す。
- Verification:
  - defaults.ts がビルド可能であること
  - STOREMETA_CONFIG_SPEC が他ドキュメントから参照可能であること
- Related PR/Commit: (to be filled)

---

## Phase4 ドキュメント整備・nightly スタブ化

- Date (JST): 2026-03-04
- Change ID: `CM-Phase4-001`
- Category: `docs` / `cleanup`
- Classification IDs: `D-06`
- SSoT Before/After:
  - Before: phase4 実装を functions 内に配置、STORE_CLOSE_HOUR 利用
  - After: phase4 は Phase3 完了後に実装。STORE_CLOSE_HOUR 廃止方針確定
- Duplicate Removed: N/A
- Migration Gate Check: N/A
- Summary:
  - `functions/src/domains/analytics/scheduler/phase4/` を削除（integrityCheck.ts, recalculateBalanceDue.ts）
  - `nightlyRecalculateBalanceDue.ts`, `nightlyIntegrityCheck.ts` を phase4 非依存のスタブに変更（TODO: Phase4 で実装）
  - `docs/config_migration/phase4/` を新規作成: README, NIGHTLY_RECALCULATE_BALANCE_DUE, NIGHTLY_INTEGRITY_CHECK, DETERMINE_ATTENDANCE_MODE
  - Phase0B 各ドキュメント、migration_roadmap, DECISION_LOG に Phase4 方針を反映
- Scope: `Docs` / `Functions`（スタブ化のみ）
- Compatibility: Non-breaking
- Migration Window: N/A
- Rollback:
  - phase4 フォルダを再作成し、スタブを phase4 実装に差し替える。
- Verification:
  - nightly ハンドラが phase4 を import していないこと
  - phase4 フォルダが存在しないこと
- Related PR/Commit: (to be filled)

---

## Phase0A 完了（Task6/7、Task9）

- Date (JST): 2026-03-04
- Change ID: `CM-Phase0A-001`
- Category: `Secrets` / `storeMeta-config`
- Classification IDs: `D-01`, `D-12`, `D-13`
- SSoT Before/After:
  - Before: `LINE_CHANNEL_ACCESS_TOKEN` 平文 default、`QR_SECRET_KEY` fallback、`default-store/default-tenant` 許容
  - After: default/fallback 削除、本番で未設定時 throw、default-store/default-tenant 禁止
- Duplicate Removed: `Yes`
- Migration Gate Check: `Pass`
- Summary:
  - D-01: lineWebhook/lineMessaging から defineString 平文 default 削除、process.env 参照
  - D-12: qrCodeUtils から `default-secret-key` fallback 削除
  - D-13: createScheduledTournament/createTournamentRecurrence/enqueueTournamentTasksCore/generateRecurringTournamentsCore に validateStoreTenantForProduction 適用
  - 共通 helper: `functions/src/shared/runtime.ts` に `isProductionRuntime`, `validateStoreTenantForProduction` を追加
  - Dart: tournament_service/storeId/tenantId を required 化、5 ページで kDevPlaceholderStoreId/TenantId を渡す（create_recurring_tournament_page はデプロイ後に漏れを追加修正）
  - 検証: 手動確認（LINE/QR/トーナメント）完了。既存データは test-store/test-tenant 残存あり、一旦スルー可
  - Task8（Runbook・具体手順書・運用方針の詳細化）は Phase3 で実施する方針を確定
- Scope: `Flutter` / `Functions`
- Compatibility: `Breaking`（本番では LINE_CHANNEL_ACCESS_TOKEN、QR_SECRET_KEY 必須。default-store/tenant 禁止）
- Migration Window: デプロイ後に環境変数設定必須
- Rollback:
  - 環境変数を設定すれば即時復旧可能。コードロールバックは別途。
  - 詳細 Runbook は Phase3 で作成する。
- Verification:
  - Task7 手動確認完了（LINE/QR/トーナメント/既存データ）
  - ユニットテスト・エミュレータテスト通過
  - phase0A_config_migration.spec.ts, check-default-store-tenant.ts で検証
- Related PR/Commit: (to be filled)

---

## Initial Records

- Date (JST): 2026-03-04
- Change ID: `CM-INIT-0001`
- Category: `docs`
- Classification IDs: `N/A (docs整備)`
- SSoT Before/After:
  - Before: N/A
  - After: N/A
- Duplicate Removed: `No`
- Migration Gate Check: `N/A`
- Summary:
  - Config migration 用の運用ドキュメント群（To-Be/Roadmap/Overview/Rules/Logs）を新規作成。
  - 実コード変更は行わず、監査・移行計画の土台を整備。
- Scope: `Docs`
- Compatibility: `Non-breaking`
- Migration Window: N/A
- Rollback:
  - 追加ドキュメントを削除すれば元に戻る。
- Verification:
  - `git diff --name-only` でドキュメント追加のみを確認。
  - `git status --short` で既存変更（`docs/table_device/tobe_spec.md`）以外にコード変更なしを確認。
- Related PR/Commit: (to be filled)

## 作業時差分確認メモ

- 本ドキュメントは新規作成のみ。
- 作業完了時確認:
  - `git diff --name-only`: `docs/table_device/tobe_spec.md`（既存変更）
  - `git status --short`: `M docs/table_device/tobe_spec.md`、`?? docs/config_audit/`、`?? docs/config_migration/`
  - 本タスクでコード変更はなし。
