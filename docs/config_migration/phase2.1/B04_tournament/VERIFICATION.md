# B-04 トーナメント設定 検証チェックリスト

## 検証日

最終検証: 本ドキュメント作成時

---

## 1. ドキュメント整合性

| 項目 | 確認 |
|------|------|
| README.md: 5 定数の記載が一貫している | ✅ |
| README.md: 参照ファイル一覧が実装と一致 | ✅ |
| CHANGE_POLICY.md: config 構造・デフォルト値が正しい | ✅ |
| CHANGESPEC.md: defaults/types/configLoader/Dart の記載が実装と一致 | ✅ |
| SUMMARY.md: 実施内容が正確 | ✅ |

---

## 2. 実装（TypeScript）

| ファイル | 確認項目 | 状態 |
|----------|----------|------|
| types.ts | TournamentConfig に 5 フィールド（含 prizeRoundingUnit） | ✅ |
| defaults.ts | DEFAULT_TOURNAMENT_* 5 定数 | ✅ |
| configLoader.ts | buildFromDefaults に prizeRoundingUnit | ✅ |
| configLoader.ts | mergeWithDefaults で prizeRoundingUnit パース（1,10,100,1000 バリデーション） | ✅ |
| configLoader.ts | mergeConfigForUpsert で prizeRoundingUnit マージ | ✅ |

---

## 3. 実装（Dart）

| ファイル | 確認項目 | 状態 |
|----------|----------|------|
| store_config_defaults.dart | kDefaultTournament* 5 定数 | ✅ |
| store_config_service.dart | StoreConfigData に tournamentPrizeRoundingUnit | ✅ |
| store_config_service.dart | fromMap で prizeRoundingUnit パース・バリデーション | ✅ |
| create_tournament_template_page.dart | defaultPrizeRatio を config 経由 | ✅ |
| prize_setup_page.dart | prizeReceiverPercentage, prizeDistribution, prizeRoundingMethod, prizeRoundingUnit を config 経由 | ✅ |
| prize_setup_page.dart | prizeRoundingUnit の不正値フォールバック（1,10,100,1000 以外 → 100） | ✅ |

---

## 4. テスト

| テスト | 確認項目 | 状態 |
|--------|----------|------|
| configLoader.spec.ts | buildFromDefaults で prizeRoundingUnit 検証 | ✅ |
| phase2_migration.spec.ts | tournament が defaults と一致（含 prizeRoundingUnit） | ✅ |
| systemHealth.spec.ts | config 基盤の網羅性（含 prizeRoundingUnit） | ✅ |

**実行結果**: 70 テストすべて通過

---

## 5. 運用時資料

| ドキュメント | 確認 |
|--------------|------|
| docs/運用時資料/設定/storeMeta/configによる設定の詳細/tournament.md | prizeRoundingUnit 記載 | ✅ |
| docs/運用時資料/設定/取得失敗時の挙動設計.md | tournament に prizeRoundingUnit 含む | ✅ |
| docs/運用時資料/設定/設定の不具合時の対応.md | tournament 対応記載 | ✅ |
| docs/config_audit/store_config_classification.md | prizeRoundingUnit 含む | ✅ |
| docs/config_migration/phase2.1/TARGET_LIST.md | B-04 に prizeRoundingUnit 含む | ✅ |
| docs/config_migration/phase2.1/README.md | B-04 一覧に prizeRoundingUnit 含む | ✅ |

---

## 6. globalConstant.dart

| 確認 | 状態 |
|------|------|
| defaultPrizeRatio, prizeReceiverPercentage, prizeRoundingMethod, prizeDistribution は既に削除済み | ✅ |
| prizeRoundingUnit は元々存在せず（ハードコード 100 だったため）、今回 config 化で新規追加 | ✅ |

---

## クローズ判定

上記すべて ✅。問題なし。**B-04 トーナメント設定移管をクローズする。**
