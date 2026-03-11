# B-04 トーナメント設定 移管 サマリ

## 実施内容

### 1. ドキュメント

- CHANGE_POLICY.md, CHANGESPEC.md 作成

### 2. 実装

| 種別 | ファイル | 変更 |
|------|----------|------|
| TS | defaults.ts | DEFAULT_TOURNAMENT_* 5 定数追加 |
| TS | types.ts | TournamentConfig 型・StoreConfig.tournament 追加 |
| TS | configLoader.ts | buildFromDefaults / mergeWithDefaults / mergeConfigForUpsert に tournament 追加 |
| Dart | store_config_defaults.dart | kDefaultTournament* 5 定数追加 |
| Dart | store_config_service.dart | StoreConfigData に tournament 5 フィールド追加、fromMap パース |
| Dart | globalConstant.dart | defaultPrizeRatio, prizeReceiverPercentage, prizeRoundingMethod, prizeDistribution 削除（prizeRoundingUnit は従来ハードコード値のため今回 config 化で追加） |
| Dart | create_tournament_template_page.dart | defaultPrizeRatio を config 経由に |
| Dart | prize_setup_page.dart | prizeReceiverPercentage, prizeDistribution, prizeRoundingMethod, prizeRoundingUnit を config 経由に |

### 3. テスト

- configLoader.spec.ts, phase2_migration.spec.ts, systemHealth.spec.ts に tournament 検証追加

**実行結果**: 70 テストすべて通過

### 4. 運用時資料

- tournament.md 新規作成
- 取得失敗時の挙動設計.md に tournament 追加
- 設定の不具合時の対応.md に tournament 追加
- README.md ファイル一覧に tournament.md 追加

### 5. 残タスク対応

- [x] B04_tournament/README.md を移管後の状態に更新（セクション2・6、検討対象の記述） … 完了

### 6. 全体検証（最終確認）

- [x] ドキュメント・仕様の整合性確認 … 完了
- [x] 実装（TS/Dart）の網羅確認 … 完了
- [x] テスト実行（configLoader, phase2_migration, systemHealth）70 テスト通過 … 完了
- [x] 運用時資料・TARGET_LIST・store_config_classification の更新確認 … 完了
- [x] VERIFICATION.md 作成（検証チェックリスト）

詳細は `VERIFICATION.md` を参照。

## クローズ

**B-04 トーナメント設定移管は完了。検証に問題なし。クローズとする。**
