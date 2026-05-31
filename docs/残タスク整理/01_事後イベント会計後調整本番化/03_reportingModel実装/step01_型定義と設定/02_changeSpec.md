# Step 01: 型定義と設定 — changeSpec

## 概要

reporting ドメインの型定義、デフォルト値、設定ローダー、フィーチャーフラグを新設する。

## 新規ファイル

| ファイル | 概要 |
|---|---|
| `functions/src/domains/reporting/types.ts` | `ReportingEntry`, `ReportingMonthly`, `TaxReportingBehavior`, `ReportingGroupConfig` 等の型定義 |
| `functions/src/domains/reporting/config/defaults.ts` | `DEFAULT_TAX_REPORTING_BEHAVIOR` 定数 |
| `functions/src/domains/reporting/config/taxReportingBehaviorLoader.ts` | `storeMeta/taxReportingBehavior` 読み取り層（未存在時はデフォルトにフォールバック） |

## 変更ファイル

| ファイル | 変更内容 |
|---|---|
| `functions/src/shared/config/types.ts` | `StoreConfig.features` に `reportingAggregatorEnabled?: boolean` を追加 |
| `functions/src/shared/config/defaults.ts` | `DEFAULT_REPORTING_AGGREGATOR_ENABLED = false` を追加 |
| `functions/src/shared/config/configLoader.ts` | `buildFromDefaults()`, `mergeWithDefaults()`, `mergeConfigForUpsert()` に `reportingAggregatorEnabled` のハンドリングを追加 |

## 設計判断

- `taxReportingBehaviorLoader` は既存の `configLoader.ts` と同パターン（Firestore 未存在時・読み取り失敗時はデフォルトフォールバック）。ただし、config 本体ほどフィールドが多くないため、より軽量な実装にした。
- `reportingAggregatorEnabled` のデフォルトは `false`（明示的に有効化するまで reporting 処理は走らない）。
- `TaxReportingBehavior` の固定フィールド（`pendingAdjustmentTiming`, `reportingTreatment`, `reportingEntry`）はリテラル型で定義し、`mergeWithDefaults` でも常に固定値を返す。
