# B-02 menuCategories changeSpec

CHANGE_POLICY.md に基づく実装仕様書。

---

## 1. defaults.ts

**追加位置**: ファイル末尾の `DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT` の直前、または適切なセクション

```ts
// =============================================================================
// B-02: メニューカテゴリ
// =============================================================================

/** メニューアイテムのカテゴリ選択肢。メニュー作成・編集・注文時の選択肢として使用 */
export const DEFAULT_MENU_CATEGORIES = ['フード', 'ノンアルコール', 'アルコール', 'Chip', 'その他'];
```

**import 追加**: configLoader.ts で使用するため、既存の import 群に `DEFAULT_MENU_CATEGORIES` を追加

---

## 2. types.ts

**追加位置**: `StoreConfig` インターフェース内

```ts
  payroll?: {
    startDay?: number;
    endDay?: number;
  };
  menuCategories?: string[];  // 追加
}
```

---

## 3. configLoader.ts

### 3.1 import 追加

```ts
import {
  // ... 既存
  DEFAULT_MENU_CATEGORIES,
} from './defaults';
```

### 3.2 buildFromDefaults() 内

`return {` のオブジェクトに追加:

```ts
    payroll: {
      startDay: DEFAULT_PAYROLL_START_DAY,
      endDay: DEFAULT_PAYROLL_END_DAY,
    },
    menuCategories: [...DEFAULT_MENU_CATEGORIES],  // 追加
  };
```

### 3.3 mergeWithDefaults(raw) 内

`// payroll` セクションの後、`return result;` の前に追加:

```ts
  // menuCategories
  if (Array.isArray(raw.menuCategories) && raw.menuCategories.length > 0) {
    result.menuCategories = raw.menuCategories.filter((x): x is string => typeof x === 'string');
  } else {
    logFallback('menuCategories', 'field_missing', result.menuCategories);
  }

  return result;
```

### 3.4 mergeConfigForUpsert(existing, defaults) 内

`out.payroll = {...}` の後、`return out;` の前に追加:

```ts
  // menuCategories
  const menuCatEx = ex.menuCategories;
  out.menuCategories = Array.isArray(menuCatEx) && menuCatEx.length > 0
    ? menuCatEx
    : (defaults.menuCategories ?? DEFAULT_MENU_CATEGORIES);

  return out;
```

※ `ex = existing ?? {}` が関数冒頭で定義されている。

---

## 4. store_config_defaults.dart

**追加位置**: `kDefaultPayrollEndDay` の後

```dart
// menuCategories (B-02)
const List<String> kDefaultMenuCategories = [
  'フード',
  'ノンアルコール',
  'アルコール',
  'Chip',
  'その他',
];
```

---

## 5. store_config_service.dart

### 5.1 StoreConfigData クラス

**フィールド追加**:

```dart
  final int payrollEndDay;
  final List<String> menuCategories;  // 追加
```

**コンストラクタ追加**:

```dart
    this.payrollEndDay = kDefaultPayrollEndDay,
    List<String>? menuCategories,  // 追加
  })  : ...
        menuCategories = menuCategories ?? List<String>.from(kDefaultMenuCategories);
```

### 5.2 fromMap 内

`payrollEndDay` のパースの後、`return StoreConfigData(` に追加:

```dart
      payrollEndDay: parseInt(payroll?['endDay']) ?? kDefaultPayrollEndDay,
      menuCategories: (data['menuCategories'] as List<dynamic>?) != null &&
              (data['menuCategories'] as List).isNotEmpty
          ? (data['menuCategories'] as List).map((e) => e.toString()).toList()
          : kDefaultMenuCategories,
    );
```

※ `data` は config のルート。`menuCategories` はトップレベル。空配列の場合はデフォルトを使用。

---

## 6. globalConstant.dart

**削除**: `menuCategories` の定義および関連コメント

```dart
  // 削除対象
  static const List<String> menuCategories = [
    'フード',
    'ノンアルコール',
    'アルコール',
    'Chip',
    'その他',
  ];
```

---

## 7. Dart 参照箇所の差し替え

他設定と同様に `latestData` を直接参照。StreamBuilder は不要。

### 7.1 createMenuPage.dart

- `import '../../globalConstant.dart';` を削除し、`import '../../services/store_config_service.dart';` および `import '../../services/store_config_defaults.dart';` を追加（既存 import と重複しないよう確認）
- `final List<String> _categories = GlobalConstants.menuCategories;` を削除
- `_categories` の参照を `StoreConfigService.instance.latestData?.menuCategories ?? kDefaultMenuCategories` に差し替え。`_categories` を保持するフィールドが初期化で使われている場合は、取得式を都度評価するか、getter に変更

### 7.2 categorySelectPage.dart

- `_categories = GlobalConstants.menuCategories` → `_categories = StoreConfigService.instance.latestData?.menuCategories ?? kDefaultMenuCategories`
- `store_config_service.dart` および `store_config_defaults.dart` の import を追加

### 7.3 menuEditorListPage.dart

- `GlobalConstants.menuCategories.map(...)` → `(StoreConfigService.instance.latestData?.menuCategories ?? kDefaultMenuCategories).map(...)`
- `store_config_service.dart` および `store_config_defaults.dart` の import を追加

### 7.4 order_from_user_action_popup.dart

- `GlobalConstants.menuCategories.map(...)` → `(StoreConfigService.instance.latestData?.menuCategories ?? kDefaultMenuCategories).map(...)`
- `store_config_service.dart` および `store_config_defaults.dart` の import を追加

---

## 8. フラット確認チェックリスト

| # | 項目 | 確認 |
|---|------|------|
| 1 | defaults.ts に DEFAULT_MENU_CATEGORIES 追加 | |
| 2 | types.ts に menuCategories 型追加 | |
| 3 | configLoader buildFromDefaults に menuCategories 追加 | |
| 4 | configLoader mergeWithDefaults に menuCategories 追加 | |
| 5 | configLoader mergeConfigForUpsert に menuCategories 追加 | |
| 6 | store_config_defaults.dart に kDefaultMenuCategories 追加 | |
| 7 | StoreConfigData に menuCategories フィールド追加 | |
| 8 | StoreConfigData.fromMap で menuCategories パース | |
| 9 | globalConstant.dart から menuCategories 削除 | |
| 10 | createMenuPage.dart を config 経由に変更 | |
| 11 | categorySelectPage.dart を config 経由に変更 | |
| 12 | menuEditorListPage.dart を config 経由に変更 | |
| 13 | order_from_user_action_popup.dart を config 経由に変更 | |
| 14 | 他に GlobalConstants.menuCategories 参照がないこと（grep で確認） | |

---

## 9. 参照

- Dart における storeMeta/config の取得方針: `docs/config_migration/phase2.1/STOREMETA_CONFIG_MIGRATION_PROCEDURE.md` の「2.1 Dart における storeMeta/config の取得方針」
