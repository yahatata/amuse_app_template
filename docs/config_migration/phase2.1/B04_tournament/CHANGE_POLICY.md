# B-04 トーナメント設定 変更方針

## 決定

**storeMeta/config に移管する。**

---

## 変更方針（実コード確認に基づく）

### 1. 概要

トーナメント関連の 5 定数（defaultPrizeRatio, prizeReceiverPercentage, prizeRoundingMethod, prizeRoundingUnit, prizeDistribution）を `lib/globalConstant.dart` から削除し、`storeMeta/config.tournament` に移管する。  
TS 側は現状これらの定数を直接参照していないため、**Dart のみ**変更対象。

### 2. データの流れ（移管後も不変）

1. テンプレート作成: config の defaultPrizeRatio で初期 prizeRatio を設定
2. プライズセットアップ: config の prizeReceiverPercentage / prizeDistribution / prizeRoundingMethod / prizeRoundingUnit で入賞人数・配分比率・丸め処理・丸め単位を算出

→ config に移管しても、Dart が config から正しく取得すれば既存フローは維持される。

### 3. config 構造

`storeMeta/config` に `tournament` オブジェクトを追加（ネスト構造）:

```ts
tournament?: {
  defaultPrizeRatio?: number;      // 0.0〜1.0
  prizeReceiverPercentage?: number; // 1〜100
  prizeRoundingMethod?: string;     // 'floor' | 'ceil' | 'round'
  prizeRoundingUnit?: number;       // 1 | 10 | 100 | 1000（賞金額の丸め単位・円）
  prizeDistribution?: Record<string, number[]>;  // キー "1"〜"10"、値は合計100の配列
}
```

※ Firestore/JSON ではオブジェクトのキーが文字列のため、prizeDistribution のキーは "1", "2", ... として保存。読み込み時に int に変換する。

### 4. 変更対象ファイル一覧

| 種別 | ファイル | 変更内容 |
|------|----------|----------|
| ts | defaults.ts | DEFAULT_TOURNAMENT_* 定数追加 |
| ts | types.ts | StoreConfig.tournament 型追加 |
| ts | configLoader.ts | buildFromDefaults / mergeWithDefaults / mergeConfigForUpsert に tournament 追加 |
| dart | store_config_defaults.dart | kDefaultTournament* 追加 |
| dart | store_config_service.dart | StoreConfigData.tournament 追加、fromMap パース |
| dart | globalConstant.dart | 4 定数削除 |
| dart | create_tournament_template_page.dart | defaultPrizeRatio を config 経由に |
| dart | prize_setup_page.dart | prizeReceiverPercentage, prizeDistribution, prizeRoundingMethod, prizeRoundingUnit を config 経由に |

### 5. デフォルト値

| フィールド | 型 | デフォルト |
|------------|-----|------------|
| defaultPrizeRatio | double | 0.7 |
| prizeReceiverPercentage | int | 10 |
| prizeRoundingMethod | string | 'floor' |
| prizeRoundingUnit | int | 100 |
| prizeDistribution | Map<int, List<double>> | 1〜10 人入賞用の配分マップ（globalConstant の既存値） |

### 6. Dart 側の取得方法

- **取得式**: `StoreConfigService.instance.latestData?.tournament?.xxx ?? kDefaultTournamentXxx`
- **StreamBuilder 不要**: 他設定と同様に `latestData` を直接参照。
