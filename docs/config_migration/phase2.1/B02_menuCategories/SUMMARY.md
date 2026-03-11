# B-02 menuCategories 移管 サマリ

## 実施内容

### 1. ドキュメント

- STOREMETA_CONFIG_MIGRATION_PROCEDURE.md に Dart における config 取得方針を追加
- CHANGE_POLICY.md, CHANGESPEC.md を更新（StreamBuilder 不要、latestData 直接参照）

### 2. 実装

| 種別 | ファイル | 変更 |
|------|----------|------|
| TS | defaults.ts | DEFAULT_MENU_CATEGORIES 追加 |
| TS | types.ts | menuCategories 型追加 |
| TS | configLoader.ts | buildFromDefaults / mergeWithDefaults / mergeConfigForUpsert に menuCategories 追加 |
| Dart | store_config_defaults.dart | kDefaultMenuCategories 追加 |
| Dart | store_config_service.dart | StoreConfigData.menuCategories 追加 |
| Dart | globalConstant.dart | menuCategories 削除 |
| Dart | createMenuPage.dart | config 経由に変更 |
| Dart | categorySelectPage.dart | config 経由に変更 |
| Dart | menuEditorListPage.dart | config 経由に変更 |
| Dart | order_from_user_action_popup.dart | config 経由に変更 |

### 3. テスト

- phase2_migration.spec.ts: menuCategories の buildFromDefaults / Firestore マージテスト追加
- configLoader.spec.ts: menuCategories の buildFromDefaults 検証追加
- systemHealth.spec.ts: menuCategories の網羅性検証追加

**実行結果**: 66 テストすべて通過

## 残タスク

- [x] 運用時資料の更新（menuCategories.md 新規、取得失敗時・不具合時への追加、README 更新） … 完了
- [x] order_from_user_action_popup.dart コメント修正（GlobalConstants → StoreConfigService） … 完了

## クローズ

**B-02 menuCategories 移管は完了。クローズとする。**
