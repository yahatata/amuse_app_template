# billing.sideGameChipRate（チップ換算レート）

サイドゲームチップ 1 枚あたりの円換算レート。

## パス

`storeMeta/config` の `billing.sideGameChipRate`

## 設定の説明

- 会計時のチップ枚数 ↔ 円換算に使用
- 支払い分割計算（ポイント使用優先順位で sideGameChip を使用する際）の円換算
- プレビュー表示時のチップ枚数表示

## 何を設定するのか

1 チップ = 何円相当とするかの数値（例: 10 → 1 チップ = 10 円）

## 現状持ちうる値

| 値 | 意味 |
|----|------|
| 正の数（通常 1〜100） | 1 チップあたりの円換算レート。デフォルト 10 |
| 未設定 | defaults（10.0）を使用 |

## その設定により何が変わるのか

- 会計画面でのチップ円換算表示
- 支払い分割計算（sideGameChip 使用時）の円換算
- bills の paymentTotals 計算（meta.paymentMethodsByCategory で sideGameChip のチップ枚数→円換算）
- getBillPreviewTotals の displayChips 計算

## 影響を受けるファイル一覧

| 種別 | ファイル | 役割 |
|------|----------|------|
| ts | functions/src/shared/config/defaults.ts | DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE |
| ts | functions/src/domains/bills/callables/accounting.ts | startAccounting: 支払い方法正規化・残高差し引き |
| ts | functions/src/domains/bills/callables/getBillPreviewTotals.ts | プレビュー表示用チップ枚数 |
| ts | functions/src/domains/bills/callables/verifyPaymentSplit.ts | 支払い分割照合 |
| ts | functions/src/domains/bills/services/paymentSplitCalculator.ts | 支払い分割計算（引数で受け取る） |
| ts | functions/src/domains/bills/services/snapshots.ts | calculatePaymentTotals: meta からの円換算 |
| ts | functions/src/domains/bills/triggers/billsOnSettle.ts | Settlement 時の paymentTotals 計算 |
| dart | lib/services/store_config_defaults.dart | kDefaultSideGameChipRate |
| dart | lib/Accounting/accountingPage.dart | チップ円換算・支払い方法計算 |
| dart | lib/Accounting/categoryPaymentMethodDialog.dart | チップ円換算表示 |
| dart | lib/Accounting/customerAccountingDetailPage.dart | チップ円換算表示 |
| dart | lib/Accounting/payment_split_test_page.dart | 支払い分割テスト |
| dart | lib/Accounting/payment_split_calculator.dart | 支払い分割計算 |
