# B-04 トーナメント設定 changeSpec

CHANGE_POLICY.md に基づく実装仕様書。

---

## 1. defaults.ts

**追加**:

```ts
// =============================================================================
// B-04: トーナメント設定
// =============================================================================

/** デフォルトプライズ割合（70%）。新規テンプレート作成時の初期値 */
export const DEFAULT_TOURNAMENT_PRIZE_RATIO = 0.7;

/** プライズを受け取る人数の割合（参加者の何%まで入賞とするか） */
export const DEFAULT_TOURNAMENT_PRIZE_RECEIVER_PERCENTAGE = 10;

/** プライズ計算の丸め方法 */
export const DEFAULT_TOURNAMENT_PRIZE_ROUNDING_METHOD = 'floor' as const;

/** 賞金額の丸め単位（円）。1, 10, 100, 1000 のいずれか */
export const DEFAULT_TOURNAMENT_PRIZE_ROUNDING_UNIT = 100;

/** 入賞人数ごとの賞金配分比率（%）。キー=入賞人数、値=順位別比率リスト */
export const DEFAULT_TOURNAMENT_PRIZE_DISTRIBUTION: Record<number, number[]> = {
  1: [100.0],
  2: [65.0, 35.0],
  3: [50.0, 30.0, 20.0],
  4: [45.0, 25.0, 18.0, 12.0],
  5: [40.0, 25.0, 15.0, 12.0, 8.0],
  6: [38.0, 23.0, 15.0, 10.0, 8.0, 6.0],
  7: [36.0, 22.0, 14.0, 9.0, 7.0, 6.0, 6.0],
  8: [35.0, 21.0, 13.0, 9.0, 7.0, 6.0, 5.0, 4.0],
  9: [34.0, 20.0, 12.0, 8.0, 7.0, 6.0, 5.0, 4.0, 4.0],
  10: [32.0, 19.0, 12.0, 8.0, 7.0, 6.0, 5.0, 4.0, 4.0, 3.0],
};
```

※ Firestore 保存時はキーを文字列に変換。buildFromDefaults の出力では Record<string, number[]> とする。

---

## 2. types.ts

**追加**:

```ts
export interface TournamentConfig {
  defaultPrizeRatio?: number;
  prizeReceiverPercentage?: number;
  prizeRoundingMethod?: string;
  prizeRoundingUnit?: number;       // 1 | 10 | 100 | 1000（賞金額の丸め単位・円）
  prizeDistribution?: Record<string, number[]>;  // キー "1"〜"10"
}

// StoreConfig 内に追加
  sideGameTypes?: string[];
  tournament?: TournamentConfig;
}
```

---

## 3. configLoader.ts

buildFromDefaults / mergeWithDefaults / mergeConfigForUpsert に tournament ブロックを追加。  
prizeDistribution はキーを文字列化して保存（"1", "2", ...）。

---

## 4. store_config_defaults.dart

kDefaultTournamentDefaultPrizeRatio, kDefaultTournamentPrizeReceiverPercentage, kDefaultTournamentPrizeRoundingMethod, kDefaultTournamentPrizeRoundingUnit, kDefaultTournamentPrizeDistribution を追加。

---

## 5. store_config_service.dart

StoreConfigData に tournament フィールド追加。fromMap で data['tournament'] からパース。  
prizeDistribution は Map<String, dynamic> から Map<int, List<double>> に変換（キーを int.parse）。

---

## 6. globalConstant.dart

defaultPrizeRatio, prizeReceiverPercentage, prizeRoundingMethod, prizeRoundingUnit, prizeDistribution の 5 定数を削除。

---

## 7. Dart 参照箇所

- create_tournament_template_page.dart: `StoreConfigService.instance.latestData?.tournament?.defaultPrizeRatio ?? kDefaultTournamentDefaultPrizeRatio`
- prize_setup_page.dart: 同上パターンで prizeReceiverPercentage, prizeDistribution, prizeRoundingMethod, prizeRoundingUnit を取得。
