# Step 02: entryBuilder — changeSpec

## 概要

`ReportingEntry` オブジェクトを組み立てる純粋関数群を実装する。Firestore アクセスなし。

## 新規ファイル

| ファイル | 概要 |
|---|---|
| `functions/src/domains/reporting/services/entryBuilder.ts` | `buildSettleEntry`, `buildCashActionEntry`, `buildReopenRollbackEntry`, `buildCategoryPaymentMatrix` |
| `functions/__tests__/reporting/entryBuilder.spec.ts` | 上記関数のユニットテスト（14 テストケース） |

## 主要関数

### `buildSettleEntry(params)`

- settle / resettle イベント用の `ReportingEntry` を生成
- `entryId`: `{billId}_settle_{cycleNo}` または `{billId}_resettle_{cycleNo}`
- `reportingMonth`: `dateRule.settle` / `dateRule.resettle` に基づき `settledAt` または `businessDate` から導出
- `categoryPaymentMatrix`: `paymentMethodsByCategory` から生成（文字列・配列両フォーマット対応）

### `buildCashActionEntry(params)`

- cashAction イベント用の `ReportingEntry` を生成
- `entryId`: `{billId}_cashAction_{cashActionId}`
- `categoryBreakdown`: adjustmentLines の `targetCategory` を reporting カテゴリキーにマッピング
- `categoryPaymentMatrix`: カテゴリ金額比で按分

### `buildReopenRollbackEntry(params)`

- reopen rollback 用の `ReportingEntry` を生成（元 settle の全額を反転）
- `entryId`: `{billId}_reopen_{cycleNo}`

## ヘルパー

- `buildCategoryPaymentMatrix`: paymentMethodsByCategory（文字列 / 配列）→ matrix 変換
- `mapTargetCategory`: adjustment の targetCategory → reporting カテゴリキー変換
  - `item` → `items`, `extra` → `extraCost`, `tournament` → `tournaments`, `sideGameChip` → `sideGameChip`
- `deriveMonthKey(Timestamp)`: `yyyyMM` 文字列導出
- `deriveMonthKeyFromBusinessDate(string)`: businessDate 文字列から `yyyyMM` 導出

## テスト結果

14 テスト全件 PASS
