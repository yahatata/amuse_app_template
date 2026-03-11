# tournament（トーナメント設定）

## パス

`storeMeta/config` の `tournament`

## 設定の説明

トーナメントの賞金・プライズに関する設定群。デフォルトプライズ割合、入賞人数の割合、丸め方法、人数別の賞金配分比率を店舗ごとに設定できる。

## 何を設定するのか

- **defaultPrizeRatio**: デフォルトプライズ割合（0.0〜1.0）。新規テンプレート作成時の初期値。例: 0.7 = 70%
- **prizeReceiverPercentage**: プライズを受け取る人数の割合（1〜100）。参加者の何%まで入賞とするか。例: 10 = 10%
- **prizeRoundingMethod**: プライズ計算の丸め方法。`floor`（切り捨て）、`ceil`（切り上げ）、`round`（四捨五入）のいずれか
- **prizeRoundingUnit**: 賞金額の丸め単位（円）。1, 10, 100, 1000 のいずれか。100 の場合は 100円刻み
- **prizeDistribution**: 入賞人数ごとの賞金配分比率（%）。キー "1"〜"10"、値は順位別の比率リスト。各リストの合計が 100 であることが期待される

## 取得失敗時

- **読めるがフィールドが存在しない**: 必ずデフォルトを適用
- **読めない（Firestore 障害等）**: デフォルトを正としてデフォルト処理を行う

詳細は `docs/運用時資料/設定/取得失敗時の挙動設計.md` を参照。

## 不具合時の対応

1. リトライを必ず行う
2. デフォルトで実行＋エラーコード
3. 本設定は数値・文字列・オブジェクトのため不正時はデフォルトで実行可能。スキップは発生しない想定

## 現状持ちうる値

| フィールド | 型 | デフォルト |
|------------|-----|------------|
| defaultPrizeRatio | number | 0.7 |
| prizeReceiverPercentage | number | 10 |
| prizeRoundingMethod | string | 'floor' |
| prizeRoundingUnit | number | 100 |
| prizeDistribution | Record<string, number[]> | 1〜10 人入賞用の配分マップ |

## その設定により何が変わるのか

- 新規トーナメントテンプレート作成時の prizeRatio 初期値
- 参加者数から計算される入賞人数
- 賞金の端数処理（切り捨て・切り上げ・四捨五入）
- 賞金額の丸め単位（1円/10円/100円/1000円刻み）
- 入賞人数ごとの賞金配分比率、順位ごとの賞金額

## 影響を受けるファイル一覧

| 種別 | ファイル | 役割 |
|------|----------|------|
| ts | functions/src/shared/config/defaults.ts | デフォルト値 |
| ts | functions/src/shared/config/configLoader.ts | マージ・フォールバック |
| dart | lib/services/store_config_defaults.dart | kDefaultTournament* |
| dart | lib/services/store_config_service.dart | パース・購読 |
| dart | lib/tournament/template/pages/create_tournament_template_page.dart | テンプレート作成時の prizeRatio 初期値 |
| dart | lib/tournament/active/pages/prize_setup_page.dart | 入賞人数・配分・丸め処理・丸め単位 |
