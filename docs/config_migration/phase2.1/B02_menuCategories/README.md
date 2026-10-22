# B-02 menuCategories

## 決定: storeMeta/config に移管

`menuCategories` を `storeMeta/config.menuCategories` に移管する。  
実装手順は `CHANGE_POLICY.md` および `CHANGESPEC.md` を参照。

---

## 1. 項目の概要

`menuCategories` は、メニューアイテムのカテゴリ一覧を表す定数である。
メニュー編集・注文UIでカテゴリ選択肢として利用される。

---

## 2. 設定（定数）一覧

| 定数名 | 型 | 現状の値 | 定義場所 |
|--------|------|----------|----------|
| menuCategories | List\<String\> | ['フード','ノンアルコール','アルコール','Chip','その他'] | lib/globalConstant.dart |

---

## 3. 各設定の説明

| 定数 | 説明 |
|------|------|
| menuCategories | メニューアイテムに割り当てられるカテゴリの選択肢一覧。メニュー作成・編集・注文時のカテゴリ選択で使用。 |

---

## 4. 各設定の取りうる値

| 定数 | 取りうる値 | 備考 |
|------|------------|------|
| menuCategories | 任意の文字列リスト（例: ['フード','アルコール','Chip']） | 空リストは非推奨。既存メニューの category フィールドと整合が取れる値のみ有効。 |

---

## 5. 各値による動作の変化

| 定数 | 値 | 動作への影響 |
|------|-----|--------------|
| menuCategories | リストの要素を変更 | メニュー作成・編集・注文で選択できるカテゴリが変わる。既存メニューの category が一覧に含まれない場合、UI 表示上の不整合が発生しうる。 |
| menuCategories | 要素を追加 | 新規メニューで追加したカテゴリを選択可能になる。 |
| menuCategories | 要素を削除 | 削除したカテゴリは選択不可。既存メニューがそのカテゴリを持っている場合、表示や絞り込みに影響する可能性あり。 |

---

## 6. 参照ファイル一覧

### Dart（lib）

| ファイル | 参照内容 |
|----------|----------|
| lib/globalConstant.dart | 定義: `static const List<String> menuCategories = ['フード','ノンアルコール','アルコール','Chip','その他'];` |
| lib/OrderView/MenuView/menuEditorListPage.dart | `GlobalConstants.menuCategories.map((category) => ...)` でカテゴリ選択肢を生成 |
| lib/OrderView/MenuView/createMenuPage.dart | `final List<String> _categories = GlobalConstants.menuCategories;` で初期化 |
| lib/OrderView/MenuView/categorySelectPage.dart | `_categories = GlobalConstants.menuCategories;` で初期化 |
| lib/user_actions/order_from_user_action_popup.dart | `GlobalConstants.menuCategories.map((c) => Padding(...))` でカテゴリ選択UI |

### TypeScript（functions）

| ファイル | 参照内容 |
|----------|----------|
| なし | 現状、menuCategories を参照している TS コードはなし |
