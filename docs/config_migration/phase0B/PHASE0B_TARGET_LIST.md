# Phase0B 対象一覧（タスク1 成果物）

作成日: 2026-03-04  
参照: `docs/config_audit/store_config_classification.md` セクション 4-2

---

## 1. 対象 ID サマリ

Phase0B で二重管理を解消する対象。Dart 側と Functions 側の両方に同義設定が存在するもの。

| ID | 設定名 | Dart の場所 | Functions の場所 | リスク | 優先度 |
|----|--------|-------------|------------------|--------|--------|
| D-04 | `linePlan` / `LINE_PLAN` | `lib/globalConstant.dart` | `defineString("LINE_PLAN")` (lineWebhook, confirmShiftRequest) | Low | 中 |
| D-06 | `STORE_CLOSE_HOUR` | `lib/globalConstant.dart` | `configOps.ts` (process.env / functions.config) | High | 高 |
| D-10 | `ENABLE_AUTO_OPEN_CLOSE`, `TASK_*_OFFSET_MINUTES` | `lib/globalConstant.dart` | `weeklyPlanner.ts` (process.env) | High | 高 |
| R-09 | `requiredStaffByTimeSlot` | `lib/globalConstant.dart` | shift callables 内 `getRequiredStaffByTimeSlot()` デフォルト配列 | High | 高 |
| R-10 | `businessHoursStyles`, `businessHoursStyle*` | `lib/globalConstant.dart` | `styles.ts` | High | 高 |
| R-11 | `categoryPaymentMethods`, `POINT_PRIORITY`, 丸め単位 | `lib/globalConstant.dart` | `paymentSplitCalculator.ts` | High | 高 |
| R-12 | `SIDE_GAME_CHIP_EXCHANGE_RATE` | `lib/globalConstant.dart` | `paymentSplitCalculator.ts`, `accounting.ts`, `getBillPreviewTotals.ts`, `snapshots.ts` | High | 高 |
| （補足） | `CALC_BUSINESS_DATE_BUFFER_MINUTES` | `lib/globalConstant.dart` | `calcBusinessDateHelpers.ts` (return 70) | Med | 中 |

---

## 2. 重点対象の詳細（README 記載）

### 2.1 STORE_CLOSE_HOUR（D-06）

- 現状: Dart 定数 + Functions env/config
- 用途: 営業日境界の計算、determineAttendanceMode の出勤/退勤判定、夜間ジョブのスケジュール
- リスク: 不一致で営業日ズレ、会計・勤怠に波及
- **Phase4 方針**: STORE_CLOSE_HOUR を廃止。determineAttendanceMode は出勤/退勤分離、夜間ジョブは閉店処理/Cloud Task 起動。詳細は `docs/config_migration/phase4/` 参照

### 2.2 会計ポリシー（R-11, R-12）

- 現状: Dart `globalConstant` + TS 各所にハードコード
- 用途: 支払い分割計算、チップ換算
- リスク: 計算不一致、verifyPaymentSplit 不整合

### 2.3 businessHoursStyles / requiredStaffByTimeSlot（R-10, R-09）

- 現状: Dart + TS に同義定義、コメントで「同期必須」
- 用途: 営業時間・シフト必要人数
- リスク: 開閉店判定ズレ、人員計画ミス

### 2.4 linePlan（D-04）

- 現状: Dart const + Functions `defineString` + `public/staff/config.js`
- 用途: シフト辞退等の機能制御
- リスク: 三箇所管理で乖離

---

## 3. To-Be 保管先（決定済み）

- **共通 config**: `storeMeta/config`（単一ドキュメント）
- **読み取り優先度**: ① storeMeta/config ② `functions/src/shared/config/defaults.ts` ③ 各 TS 内直書き
- **未設定時**: エラーにせず、下位の値でフォールバック（新規店舗・新規設定の先行投入に対応）
- **詳細**: [STOREMETA_CONFIG_SPEC.md](./STOREMETA_CONFIG_SPEC.md)

## 4. 非対象（Phase0B では扱わない）

- Phase0A 済み: D-01, D-12, D-13
- Run-time 化が前提のもの: To-Be は確定済み、実装は Phase2 以降
- docs-only 値: 実装未確認のため対象外
