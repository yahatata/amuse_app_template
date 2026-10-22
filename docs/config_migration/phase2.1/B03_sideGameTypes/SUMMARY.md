# B-03 sideGameTypes 移管 サマリ

## 実施内容

### 1. ドキュメント

- CHANGE_POLICY.md, CHANGESPEC.md 作成

### 2. 実装

| 種別 | ファイル | 変更 |
|------|----------|------|
| TS | defaults.ts | DEFAULT_SIDE_GAME_TYPES 追加 |
| TS | types.ts | sideGameTypes 型追加 |
| TS | configLoader.ts | buildFromDefaults / mergeWithDefaults / mergeConfigForUpsert に sideGameTypes 追加 |
| Dart | store_config_defaults.dart | kDefaultSideGameTypes 追加 |
| Dart | store_config_service.dart | StoreConfigData.sideGameTypes 追加 |
| Dart | globalConstant.dart | sideGameTypes 削除 |
| Dart | side_game_table_list.dart | config 経由に変更 |
| Dart | side_game_table_home.dart | config 経由に変更 |

### 3. テスト

- phase2_migration.spec.ts: sideGameTypes の buildFromDefaults / Firestore マージテスト追加
- configLoader.spec.ts: sideGameTypes の buildFromDefaults 検証追加
- systemHealth.spec.ts: sideGameTypes の網羅性検証追加

**実行結果**: 69 テストすべて通過

### 4. 運用時資料

- sideGameTypes.md 新規作成
- 取得失敗時の挙動設計.md に sideGameTypes 追加
- 設定の不具合時の対応.md に sideGameTypes 追加
- README.md ファイル一覧に sideGameTypes.md 追加

### 5. 残タスク対応

- [x] B03_sideGameTypes/README.md を移管後の状態に更新（セクション2・6、検討対象の記述） … 完了

## クローズ

**B-03 sideGameTypes 移管は完了。クローズとする。**
