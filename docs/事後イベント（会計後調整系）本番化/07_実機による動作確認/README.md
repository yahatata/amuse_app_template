# 07_実機による動作確認

## 1. 目的

このフォルダは、事後イベント（会計後調整）本番化の大規模改修について、**実機または Emulator を使った手動確認を一元管理するための入口**である。

ここでは、`05_changeSpecと実装` 配下に分散している各 Step の `08_実機確認手順.md` を参照元にしつつ、実際の確認作業がしやすい単位に再構成する。

## 2. このフォルダで管理すること

- 実機確認全体の目的と分割方針
- 実機確認の進め方
- 各確認ファイルの対応範囲
- 実施結果の集約
- 後続フェーズに渡すメモ

## 3. 参照順

1. [00_全体サマリ.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/07_実機による動作確認/00_全体サマリ.md)
2. [01_実機確認の進め方.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/07_実機による動作確認/01_実機確認の進め方.md)
3. [04_事前準備と検証データ方針.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/07_実機による動作確認/04_事前準備と検証データ方針.md)
4. [09_会計後操作UIメモ.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/07_実機による動作確認/09_会計後操作UIメモ.md)
5. 10 番台以降の各確認ファイル
6. [02_確認結果集約.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/07_実機による動作確認/02_確認結果集約.md)
7. [03_後続用メモ.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/07_実機による動作確認/03_後続用メモ.md)

## 4. 実機確認の分割方針

今回の確認は Step01〜07 をそのままなぞるのではなく、**実際のオペレーション順**と**確認しやすい DB 状態のまとまり**で次の 5 単位に分ける。

1. `10_通常会計と親サマリとbaseline確認.md`
   - Step01 + Step02
   - 通常 bill 作成、会計開始、会計取消、通常 settle、`settlementCycles/1`、`baselineSnapshot`
2. `11_会計後調整と即時精算確認.md`
   - Step03 + Step04 の immediate 経路
   - `terminalHome` の `会計後操作` から行う会計後調整作成、即時返金、即時徴収、adjustments / immediate cashActions
3. `12_要対応一覧と後続徴収返金確認.md`
   - Step04 later 経路 + Step06
   - `要対応の会計` 画面、フィルタ、一覧、後続の追加徴収 / 要返金処理
4. `13_reopenと再会計確認.md`
   - Step05
   - `terminalHome` の `会計後操作` から行う reopen、旧 cycle の履歴保持、新 cycle 作成、再会計
5. `14_analyticsMonthly反映確認.md`
   - Step07
   - settle / adjustment / cashAction / reopen rollback の analytics 反映

## 5. 参照元

このフォルダの確認観点は、主に次をソースにしている。

- `docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_changeSpecと実装/*/08_実機確認手順.md`
- `docs/事後イベント（会計後調整系）本番化/仕様実装管理/04_仕様書/*.md`
- 実際の Flutter / Functions 実装

## 6. 注意

- 各確認ファイルの中で、操作手順・期待 UI・期待 Firestore 状態・完了判定を具体化する
- 実施結果は各ファイルだけで閉じず、必ず [02_確認結果集約.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/07_実機による動作確認/02_確認結果集約.md) にも要約する
- 実機確認中に仕様と実装のズレを見つけた場合は、先にここへ記録し、その後で `05_changeSpecと実装` 側へ戻る
