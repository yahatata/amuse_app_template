# billing.paymentPolicy（支払いポリシー）

categoryPaymentMethods / pointPriority / roundingUnits

## パス

`storeMeta/config` の `billing.paymentPolicy`

## 設定の説明

会計時の支払い方法・ポイント使用ルールを定義する。

| フィールド | 意味 |
|------------|------|
| categoryPaymentMethods | カテゴリ別に利用可能な支払い方法（extraCost, sideGameChip, items, tournaments ごと） |
| pointPriority | ポイント使用の優先順位（例: pointA → pointB → sideGameChip の順で充当） |
| roundingUnits | ポイント・チップの丸め単位（pointAB: 円、sideGameChip: チップ数） |

## 何を設定するのか

- 各カテゴリ（入店料・チップ・フード・トーナメント）で使える支払い方法
- 複数ポイントがある場合の使用順序
- ポイント・チップ使用時の切り捨て単位

## 現状持ちうる値

- **categoryPaymentMethods**: `Record<string, string[]>`。キーは `extraCost` / `sideGameChip` / `items` / `tournaments`。値は `cash` / `credit_card` / `electronic_money` / `pointA` / `pointB` / `sideGameChip` の配列
- **pointPriority**: `string[]`。例: `['pointA', 'pointB', 'sideGameChip']`
- **roundingUnits**: `{ pointAB: number, sideGameChip: number }`。pointAB は円単位（例: 1000）、sideGameChip はチップ単位（例: 100）
- 未設定時は defaults を使用

## その設定により何が変わるのか

- 会計画面の支払い方法選択肢
- 支払い分割計算の結果（どの順でポイントを使うか、丸め単位）
- verifyPaymentSplit の照合結果
- bills に保存される paymentTotals

## 影響を受けるファイル一覧

| 種別 | ファイル | 役割 |
|------|----------|------|
| ts | functions/src/shared/config/defaults.ts | デフォルト値 |
| ts | functions/src/domains/bills/callables/verifyPaymentSplit.ts | 支払い分割照合 |
| ts | functions/src/domains/bills/services/paymentSplitCalculator.ts | 支払い分割計算（引数で受け取る） |
| dart | lib/services/store_config_defaults.dart | kDefault* |
| dart | lib/services/store_config_service.dart | パース・購読 |
| dart | lib/Accounting/accountingPage.dart | 支払い方法選択・分割計算 |
| dart | lib/Accounting/categoryPaymentMethodDialog.dart | 支払い方法選択 |
| dart | lib/Accounting/payment_split_test_page.dart | 支払い分割テスト |
| dart | lib/Accounting/payment_split_calculator.dart | 支払い分割計算 |
