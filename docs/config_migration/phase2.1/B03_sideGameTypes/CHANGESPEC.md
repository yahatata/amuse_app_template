# B-03 sideGameTypes changeSpec

CHANGE_POLICY.md に基づく実装仕様書。

---

## 1. defaults.ts

**追加位置**: `DEFAULT_MENU_CATEGORIES` の後、`DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT` の前

```ts
// =============================================================================
// B-03: サイドゲーム種別
// =============================================================================

/** サイドゲームとして扱うテーブルステータス（ゲーム種別）の一覧。テーブル一覧での判定やサイドゲーム用UIの選択肢に使用 */
export const DEFAULT_SIDE_GAME_TYPES = ['ブラックジャック', 'ルーレット', 'バカラ', 'アルティメットポーカー'];
```

**import 追加**: configLoader.ts で `DEFAULT_SIDE_GAME_TYPES` を追加

---

## 2. types.ts

**追加位置**: `StoreConfig` インターフェース内

```ts
  menuCategories?: string[];
  sideGameTypes?: string[];  // 追加
}
```

---

## 3. configLoader.ts

### 3.1 import 追加

`DEFAULT_MENU_CATEGORIES` の後に `DEFAULT_SIDE_GAME_TYPES` を追加

### 3.2 buildFromDefaults() 内

`menuCategories` の後に追加:

```ts
    menuCategories: [...DEFAULT_MENU_CATEGORIES],
    sideGameTypes: [...DEFAULT_SIDE_GAME_TYPES],
  };
```

### 3.3 mergeWithDefaults(raw) 内

`// menuCategories` セクションの後、`return result;` の前に追加:

```ts
  // sideGameTypes
  if (Array.isArray(raw.sideGameTypes) && raw.sideGameTypes.length > 0) {
    result.sideGameTypes = raw.sideGameTypes.filter((x): x is string => typeof x === 'string');
  } else {
    logFallback('sideGameTypes', 'field_missing', result.sideGameTypes);
  }

  return result;
```

### 3.4 mergeConfigForUpsert(existing, defaults) 内

`out.menuCategories = ...` の後、`return out;` の前に追加:

```ts
  // sideGameTypes
  const sideGameEx = ex.sideGameTypes;
  out.sideGameTypes = Array.isArray(sideGameEx) && sideGameEx.length > 0
    ? sideGameEx
    : (defaults.sideGameTypes ?? DEFAULT_SIDE_GAME_TYPES);

  return out;
```

---

## 4. store_config_defaults.dart

**追加位置**: `kDefaultMenuCategories` の後

```dart
// sideGameTypes (B-03)
const List<String> kDefaultSideGameTypes = [
  'ブラックジャック',
  'ルーレット',
  'バカラ',
  'アルティメットポーカー',
];
```

---

## 5. store_config_service.dart

### 5.1 StoreConfigData クラス

**フィールド追加**:

```dart
  final List<String> menuCategories;
  final List<String> sideGameTypes;  // 追加
```

**コンストラクタ追加**:

```dart
    List<String>? menuCategories,
    List<String>? sideGameTypes,  // 追加
  })  : ...
        menuCategories = menuCategories ?? List<String>.from(kDefaultMenuCategories),
        sideGameTypes = sideGameTypes ?? List<String>.from(kDefaultSideGameTypes);
```

### 5.2 fromMap 内

`menuCategories` のパースの後、`return StoreConfigData(` に追加:

```dart
      menuCategories: (data['menuCategories'] as List<dynamic>?) != null && ...
      sideGameTypes: (data['sideGameTypes'] as List<dynamic>?) != null &&
              (data['sideGameTypes'] as List).isNotEmpty
          ? (data['sideGameTypes'] as List).map((e) => e.toString()).toList()
          : kDefaultSideGameTypes,
    );
```

---

## 6. globalConstant.dart

**削除**: `sideGameTypes` の定義および関連コメント

```dart
  // 削除対象
  // サイドゲーム選択肢
  static const List<String> sideGameTypes = [
    'ブラックジャック',
    'ルーレット',
    'バカラ',
    'アルティメットポーカー',
  ];
```

---

## 7. Dart 参照箇所の差し替え

### 7.1 side_game_table_list.dart

- `import 'package:amuse_app_template/globalConstant.dart';` を削除し、`store_config_service.dart` および `store_config_defaults.dart` を追加
- `GlobalConstants.sideGameTypes` を `StoreConfigService.instance.latestData?.sideGameTypes ?? kDefaultSideGameTypes` に差し替え
- 複数箇所使用のため getter を追加: `List<String> get _sideGameTypes => StoreConfigService.instance.latestData?.sideGameTypes ?? kDefaultSideGameTypes;`

### 7.2 side_game_table_home.dart

- `import 'package:amuse_app_template/globalConstant.dart';` の必要性を確認。他に GlobalConstants 参照がなければ削除し、`store_config_service.dart` および `store_config_defaults.dart` を追加
- `GlobalConstants.sideGameTypes.map(...)` → `(StoreConfigService.instance.latestData?.sideGameTypes ?? kDefaultSideGameTypes).map(...)`

---

## 8. フラット確認チェックリスト

| # | 項目 | 確認 |
|---|------|------|
| 1 | defaults.ts に DEFAULT_SIDE_GAME_TYPES 追加 | ✅ |
| 2 | types.ts に sideGameTypes 型追加 | ✅ |
| 3 | configLoader buildFromDefaults に sideGameTypes 追加 | ✅ |
| 4 | configLoader mergeWithDefaults に sideGameTypes 追加 | ✅ |
| 5 | configLoader mergeConfigForUpsert に sideGameTypes 追加 | ✅ |
| 6 | store_config_defaults.dart に kDefaultSideGameTypes 追加 | ✅ |
| 7 | StoreConfigData に sideGameTypes フィールド追加 | ✅ |
| 8 | StoreConfigData.fromMap で sideGameTypes パース | ✅ |
| 9 | globalConstant.dart から sideGameTypes 削除 | ✅ |
| 10 | side_game_table_list.dart を config 経由に変更 | ✅ |
| 11 | side_game_table_home.dart を config 経由に変更 | ✅ |
| 12 | 他に GlobalConstants.sideGameTypes 参照がないこと（grep で確認） | ✅ |
