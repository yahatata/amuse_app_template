# menuCategories（メニューカテゴリ）

## パス

`storeMeta/config` の `menuCategories`

## 設定の説明

メニューアイテムに割り当てるカテゴリの選択肢一覧。メニュー作成・編集・注文時のカテゴリ選択で使用される。

## 何を設定するのか

- **menuCategories**: 文字列の配列。メニュー作成時に選択できるカテゴリ名の一覧。
- 空配列の場合はデフォルト値（フード、ノンアルコール、アルコール、Chip、その他）にフォールバックする。

## 取得失敗時

- **読めるがフィールドが存在しない**: 必ずデフォルト（`['フード','ノンアルコール','アルコール','Chip','その他']`）を適用。
- **読めない（Firestore 障害等）**: デフォルトを正としてデフォルト処理を行う。

詳細は `docs/運用時資料/設定/取得失敗時の挙動設計.md` を参照。

## 不具合時の対応

1. リトライを必ず行う。
2. A,B（設定値の誤り・運用ミス）: デフォルトで実行＋エラーコード。
3. C,D（コードのバグ・不整合）: デフォルトで実行可能な場合は実行＋エラーコード。それ以外は処理スキップ＋エラーコード＋画面警告。
4. 本設定は文字列配列のため常にデフォルトで実行可能。スキップは発生しない想定。
5. エラーコード: `CONFIG_FALLBACK` / `CONFIG_READ_ERROR` をログに出力。詳細は `docs/運用時資料/設定/設定の不具合時の対応.md` を参照。

## 現状持ちうる値

| フィールド | 型 | デフォルト | 備考 |
|------------|-----|------------|------|
| menuCategories | string[] | ['フード','ノンアルコール','アルコール','Chip','その他'] | 空でない文字列の配列。既存メニューの category と整合が取れる値を使用推奨 |

## その設定により何が変わるのか

- メニュー作成・編集・注文で選択できるカテゴリの一覧
- 選択されたカテゴリは menuItems に保存され、bills/items、orders/_TodaysOrders、analyticsMonthly/byCategory/summary の itemSales に引き継がれる

## 影響を受けるファイル一覧

| 種別 | ファイル | 役割 |
|------|----------|------|
| ts | functions/src/shared/config/defaults.ts | デフォルト値 |
| ts | functions/src/shared/config/configLoader.ts | マージ・フォールバック |
| dart | lib/services/store_config_defaults.dart | kDefaultMenuCategories |
| dart | lib/services/store_config_service.dart | パース・購読 |
| dart | lib/OrderView/MenuView/createMenuPage.dart | メニュー作成時のカテゴリ選択 |
| dart | lib/OrderView/MenuView/menuEditorListPage.dart | メニュー一覧のカテゴリフィルター |
| dart | lib/OrderView/MenuView/categorySelectPage.dart | カテゴリ選択画面 |
| dart | lib/user_actions/order_from_user_action_popup.dart | 注文時のカテゴリ選択 |
