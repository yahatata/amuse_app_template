# Step 01: 基盤・設定整備 — VERIFICATION_LOG

**実施日**: 2026-03-22

---

## 1. テスト結果サマリ

| テストスイート | テスト数 | 結果 |
|---|---|---|
| `payrollConfigLoader.spec.ts` | 12 | **PASS** |
| `payrollPeriodUtils.spec.ts` | 14 | **PASS** |
| `payrollErrors.spec.ts` | 6 | **PASS** |
| **合計** | **32** | **ALL PASSED** |

- TypeScript ビルド (`tsc --noEmit`): エラーなし
- Flutter lint: エラーなし

> **Note**: `payrollConfigLoader` の Firestore 結合テスト（`getPayrollConfig` の実 read/write）は `firebase emulators:exec` 経由で実行する。`setupFirebase.ts` が `FIRESTORE_EMULATOR_HOST` を常にセットするが、エミュレータプロセスが未起動だとタイムアウトするため、単体テスト実行時は条件分岐でスキップする。

---

## 2. 作成・変更ファイル一覧

### 新規作成（Functions / TypeScript）

| ファイル | 役割 |
|---|---|
| `functions/src/shared/config/payrollConfigTypes.ts` | `PayrollConfig`, `ExpectedRange`, `RoundingMethod` 型定義 |
| `functions/src/shared/config/payrollConfigDefaults.ts` | 全16フィールドのデフォルト値定数 |
| `functions/src/shared/config/payrollConfigLoader.ts` | Firestore 読み取り + デフォルトマージ |
| `functions/src/domains/attendance/types/payrollCalcTypes.ts` | 計算用定数・型（`DAILY_LEGAL_LIMIT_MINUTES`, `PayrollStatus` 等） |
| `functions/src/domains/attendance/types/payrollRunTypes.ts` | `PayrollRunSnapshot`, `StaffResultSnapshot` |
| `functions/src/domains/attendance/helpers/payrollErrors.ts` | `PAYROLL_ERRORS`（12エラーコード） |
| `functions/src/domains/attendance/helpers/payrollPeriodUtils.ts` | 期間計算ユーティリティ4関数 |

### 新規作成（Flutter / Dart）

| ファイル | 役割 |
|---|---|
| `lib/services/payroll_config_defaults.dart` | Flutter 側デフォルト値 |
| `lib/services/payroll_config_service.dart` | `PayrollConfigData` + `PayrollConfigService` シングルトン |

### 変更（既存）

| ファイル | 変更内容 |
|---|---|
| `functions/src/domains/storeMeta/callables/initializeStoreConfigCallable.ts` | `storeMeta/payrollConfig` の初期化・不足フィールド補完を追加 |
| `lib/main.dart` | `PayrollConfigService.instance` の早期初期化を追加 |

### テストファイル

| ファイル | テスト数 |
|---|---|
| `functions/__tests__/config/payrollConfigLoader.spec.ts` | 12 |
| `functions/__tests__/attendance/payrollPeriodUtils.spec.ts` | 14 |
| `functions/__tests__/attendance/payrollErrors.spec.ts` | 6 |

---

## 3. 仕様カバレッジ確認

| 仕様書 | セクション | カバー状況 |
|---|---|---|
| 02_CONFIG_SPEC | 1. 設定の配置方針 | ✅ payrollConfigTypes.ts / payrollConfigLoader.ts |
| 02_CONFIG_SPEC | 2. storeMeta/config — 既存設定 | ✅ 既存 configLoader.ts は変更なし（確認済み） |
| 02_CONFIG_SPEC | 3. storeMeta/payrollConfig — 既存フィールド | ✅ payrollConfigTypes.ts（4フィールド） |
| 02_CONFIG_SPEC | 4. storeMeta/payrollConfig — 新規追加フィールド | ✅ payrollConfigTypes.ts（12フィールド） |
| 02_CONFIG_SPEC | 5. paymentPeriodKey のフォーマットと決定ロジック | ✅ payrollPeriodUtils.ts `getPaymentPeriodKey` |
| 02_CONFIG_SPEC | 6. weekStartDate の決定ロジック | ✅ payrollPeriodUtils.ts `getWeekStartDate` |
| 02_CONFIG_SPEC | 7. 計算可能期間の導出 | ✅ payrollPeriodUtils.ts `getCalculablePeriod` |
| 02_CONFIG_SPEC | 8. payroll run 開始時の snapshot（型定義のみ） | ✅ payrollRunTypes.ts |
| 02_CONFIG_SPEC | 9. payrollConfig の管理方針 | ✅ initializeStoreConfigCallable.ts への統合 |
| 01_CALC_SPEC | 1. 用語定義（定数・型のみ） | ✅ payrollCalcTypes.ts |
| 04_CALLABLE_API_SPEC | 10. エラーコード定義（共通） | ✅ payrollErrors.ts |

---

## 4. 完了条件の確認

| 条件 | 結果 |
|---|---|
| paymentPeriodKey が全パターン（endDay≠0 / endDay=0 / 日跨ぎ）で正しく算出される | ✅ payrollPeriodUtils.spec.ts 10ケースで検証 |
| weekStartDate が weekStartDay の全曜日設定で正しく算出される | ✅ payrollPeriodUtils.spec.ts 6ケースで検証 |
| payrollConfig 未設定時にデフォルト値で動作する | ✅ payrollConfigLoader.spec.ts で検証 |
| エラーコード12種が export されている | ✅ payrollErrors.spec.ts で検証 |

---

## 5. 実機確認が必要な項目

| 項目 | 確認手順 | 期待値 |
|---|---|---|
| `initializeStoreConfigCallable` | エミュレータで Callable 呼び出し | `storeMeta/payrollConfig` が全16フィールド + `updatedAt` で作成される |
| Flutter `PayrollConfigService` | アプリ起動 → Firestore Console で値変更 | `stream` にリアルタイム反映される |

---

## 6. 特記事項

- `payrollConfigLoader` の Firestore 結合テストはエミュレータ必須。`firebase emulators:exec` で別途実行を推奨。
- Flutter 側 `PayrollConfigService` のテストは Widget テスト / Integration テスト対象。Step 08 (UI) 実装時に合わせてテスト追加予定。
