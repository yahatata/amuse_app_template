# B-04 トーナメント設定

## 決定: storeMeta/config に移管

`defaultPrizeRatio`, `prizeReceiverPercentage`, `prizeRoundingMethod`, `prizeRoundingUnit`, `prizeDistribution` を `storeMeta/config.tournament` に移管する。  
実装手順は `CHANGE_POLICY.md` および `CHANGESPEC.md` を参照。

---

## 1. 項目の概要

トーナメントの賞金・プライズに関する設定群である。
- デフォルトプライズ割合
- プライズ受け取り人数の割合
- プライズ計算の丸め方法
- 賞金額の丸め単位（1円/10円/100円/1000円刻み）
- 人数別のプライズ配分比率

storeMeta/config に移管済み。店舗ごとに変更可能。

---

## 2. 設定（定数）一覧

| 定数名 | 型 | 現状の値 | 定義場所 |
|--------|------|----------|----------|
| defaultPrizeRatio | double | 0.7 | storeMeta/config.tournament（デフォルト: store_config_defaults.dart） |
| prizeReceiverPercentage | int | 10 | 同上 |
| prizeRoundingMethod | String | 'floor' | 同上 |
| prizeRoundingUnit | int | 100 | 同上（賞金額の丸め単位。1 / 10 / 100 / 1000 のいずれか） |
| prizeDistribution | Map\<int, List\<double\>\> | 1〜10人入賞用の配分マップ | 同上 |

---

## 3. 各設定の説明

| 定数 | 説明 |
|------|------|
| defaultPrizeRatio | デフォルトプライズ割合（70%）。新規トーナメントテンプレート作成時の初期値。 |
| prizeReceiverPercentage | プライズを受け取る人数の割合（参加者の何%まで入賞とするか）。例: 10 → 参加者の10%まで。 |
| prizeRoundingMethod | プライズ計算の丸め方法。`floor`（切り捨て）、`ceil`（切り上げ）、`round`（四捨五入）のいずれか。 |
| prizeRoundingUnit | 賞金額の丸め単位（円）。1, 10, 100, 1000 のいずれか。100 の場合は 100円刻み。 |
| prizeDistribution | 入賞人数ごとの賞金配分比率（%）。キーが入賞人数、値が順位別の比率リスト。例: 3人入賞 → [50.0, 30.0, 20.0] |

---

## 4. 各設定の取りうる値

| 定数 | 取りうる値 | 備考 |
|------|------------|------|
| defaultPrizeRatio | 0.0 〜 1.0 の実数 | 例: 0.7 = 70% |
| prizeReceiverPercentage | 1 〜 100 の整数 | 例: 10 = 10% |
| prizeRoundingMethod | 'floor' \| 'ceil' \| 'round' | 他は未対応の可能性あり |
| prizeRoundingUnit | 1 \| 10 \| 100 \| 1000 | 1円刻み、10円刻み、100円刻み、1000円刻み |
| prizeDistribution | Map\<int, List\<double\>\> | キー: 1〜10 など。各 List の合計が 100.0 であることが期待される。 |

---

## 5. 各値による動作の変化

| 定数 | 値 | 動作への影響 |
|------|-----|--------------|
| defaultPrizeRatio | 変更 | 新規トーナメントテンプレート作成時の prizeRatio 初期値が変わる。 |
| prizeReceiverPercentage | 変更 | 参加者数から計算される入賞人数（`(totalParticipants * prizeReceiverPercentage) / 100`）が変わる。 |
| prizeRoundingMethod | floor/ceil/round | 賞金の端数処理が変わる。切り捨て・切り上げ・四捨五入で実際の支払い額が変動。 |
| prizeRoundingUnit | 1/10/100/1000 | 賞金額を何円刻みにするか。100 は 100円刻み（例: 12300, 12400）。 |
| prizeDistribution | 変更 | 入賞人数ごとの賞金配分比率が変わる。順位ごとの賞金額に直接影響。 |

---

## 6. 参照ファイル一覧

### Dart（lib）

| ファイル | 参照内容 |
|----------|----------|
| lib/services/store_config_defaults.dart | デフォルト: kDefaultTournament* 5 定数 |
| lib/services/store_config_service.dart | パース・購読 |
| lib/tournament/template/pages/create_tournament_template_page.dart | `StoreConfigService.instance.latestData?.tournamentDefaultPrizeRatio ?? kDefaultTournamentPrizeRatio` で初期 prizeRatio、テンプレート読み込み時のフォールバック |
| lib/tournament/active/pages/prize_setup_page.dart | `tournamentPrizeReceiverPercentage` で入賞人数算出、`tournamentPrizeDistribution` で配分取得、`tournamentPrizeRoundingMethod` で丸め処理、`tournamentPrizeRoundingUnit` で丸め単位（いずれも config 経由） |

### TypeScript（functions）

| ファイル | 参照内容 |
|----------|----------|
| なし | 現状、上記5定数を参照している TS コードはなし（トーナメント関連 callables では Dart/API 経由で値を利用している可能性あり） |
