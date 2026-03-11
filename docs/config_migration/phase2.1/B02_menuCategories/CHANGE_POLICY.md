# B-02 menuCategories 変更方針

## 決定

**storeMeta/config に移管する。**

---

## 変更方針（実コード確認に基づく）

### 1. 概要

`menuCategories` を `lib/globalConstant.dart` から削除し、`storeMeta/config.menuCategories` に移管する。  
TS 側は menuCategories を参照していないため、**Dart のみ**変更対象。

### 2. データの流れ（移管後も不変）

1. メニュー作成: config の menuCategories から選択 → createMenuItem → menuItems に保存
2. 注文時: resolveMenuItem が menuItems から category を取得 → bills/items, orders/_TodaysOrders に保存
3. 会計確定時: bills/items → itemsSnapshot → analyticsMonthly/byCategory/summary の itemSales に蓄積

→ config に移管しても、Dart が config から正しく取得すれば既存フローは維持される。

### 3. 変更対象ファイル一覧

| 種別 | ファイル | 変更内容 |
|------|----------|----------|
| ts | `functions/src/shared/config/defaults.ts` | `DEFAULT_MENU_CATEGORIES` 定数追加 |
| ts | `functions/src/shared/config/types.ts` | `StoreConfig.menuCategories?: string[]` 追加 |
| ts | `functions/src/shared/config/configLoader.ts` | buildFromDefaults / mergeWithDefaults / mergeConfigForUpsert に menuCategories 追加 |
| dart | `lib/services/store_config_defaults.dart` | `kDefaultMenuCategories` 追加 |
| dart | `lib/services/store_config_service.dart` | `StoreConfigData.menuCategories` 追加、fromMap パース追加 |
| dart | `lib/globalConstant.dart` | `menuCategories` 定数削除 |
| dart | `lib/OrderView/MenuView/menuEditorListPage.dart` | `GlobalConstants.menuCategories` → config 経由 |
| dart | `lib/OrderView/MenuView/createMenuPage.dart` | `GlobalConstants.menuCategories` → config 経由 |
| dart | `lib/OrderView/MenuView/categorySelectPage.dart` | `GlobalConstants.menuCategories` → config 経由 |
| dart | `lib/user_actions/order_from_user_action_popup.dart` | `GlobalConstants.menuCategories` → config 経由 |

### 4. デフォルト値

```ts
// defaults.ts
export const DEFAULT_MENU_CATEGORIES = ['フード', 'ノンアルコール', 'アルコール', 'Chip', 'その他'];
```

```dart
// store_config_defaults.dart
const List<String> kDefaultMenuCategories = ['フード', 'ノンアルコール', 'アルコール', 'Chip', 'その他'];
```

### 5. config パス

`storeMeta/config` の `menuCategories`（文字列配列）。トップレベルに配置。

### 6. Dart 側の取得方法

既存の他設定（entranceFee, sideGameChipRate, categoryPaymentMethods 等）と同様に、以下で取得する。

- **取得式**: `StoreConfigService.instance.latestData?.menuCategories ?? kDefaultMenuCategories`
- **StreamBuilder 不要**: `main.dart` で起動時に `StoreConfigService.instance` を参照しており、メニュー画面到達時点では初回 snapshot が到着している想定。他設定と同様に `latestData` を直接参照する。

### 7. 運用時資料の追加

- `docs/運用時資料/設定/storeMeta/configによる設定の詳細/menuCategories.md` を新規作成
- `取得失敗時の挙動設計.md` に menuCategories の行を追加
- `設定の不具合時の対応.md` に menuCategories の行を追加

---

## 確認依頼

上記変更方針で問題ないかご確認ください。OK をいただけましたら、changeSpec の作成に進みます。
