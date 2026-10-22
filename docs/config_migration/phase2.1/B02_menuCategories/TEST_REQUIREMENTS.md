# B-02 menuCategories テスト要件

## 実施したテスト

### 1. configLoader 単体テスト

| ファイル | 内容 |
|----------|------|
| `functions/__tests__/config/configLoader.spec.ts` | buildFromDefaults で menuCategories が DEFAULT_MENU_CATEGORIES と一致することを検証 |

### 2. Phase2 移行テスト

| ファイル | 内容 |
|----------|------|
| `functions/__tests__/config_migration/phase2_migration.spec.ts` | ① buildFromDefaults で menuCategories が defaults と一致 ② Firestore から menuCategories を上書きできる ③ 空配列の場合はデフォルトにフォールバック ④ 全フィールド同時上書きに menuCategories を含む |

### 3. システムヘルスチェック

| ファイル | 内容 |
|----------|------|
| `functions/__tests__/health/systemHealth.spec.ts` | buildFromDefaults の網羅性に menuCategories を追加 |

## 実行コマンド

```bash
cd functions
npm test -- __tests__/config/configLoader.spec.ts __tests__/config_migration/phase2_migration.spec.ts __tests__/health/systemHealth.spec.ts
```

## Emulator について

- `itWithEmulator` のテストは `FIRESTORE_EMULATOR_HOST` が設定されている場合に実行される
- Emulator 非起動時も buildFromDefaults 等の純粋な単体テストは通過する
- Emulator 起動時は `firebase emulators:exec --only firestore "cd functions && npm test -- ..."` で実行可能

## Dart テスト

- Flutter の StoreConfigService / menuCategories 参照に関する単体テストは未追加
- 手動確認: メニュー作成・編集・注文画面でカテゴリが正しく表示・選択できること
