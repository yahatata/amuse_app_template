# step3.16_詳細仕様書作成

## このファイルの役割

本ファイルは、`step3.15` で定めた分割方針に従って、`04_仕様書/` の詳細仕様書群を**実装に使える状態**まで作成するための作業基準をまとめる。

## 現在の状態

2026-05-09 時点で、次は GO 済みである。

- Block A: 業務と画面
- Block B: 保存モデルと current state
- Block C: 集計と日付軸

したがって、`04_仕様書/` の詳細仕様書作成に進んでよい。

## 詳細仕様書作成時の正本

優先順位:

1. `step3.12_全体整合性確認/`
2. `step3.11_未決論点の再決定/`
3. `04_仕様書/README.md`
4. `step3.15_詳細仕様書の分割方針.md`
5. 同期済み `03_ToBe意思決定/`

補足:

- `03.1` の 3.11 / 3.12 が最上位
- 旧 `03_ToBe意思決定` に矛盾が残る場合は、`04_仕様書/` と `03.1` を優先する

## 作成対象

`04_仕様書/` に置く正本は次の 7 本。

1. `01_bills親docとcurrent_state管理.md`
2. `02_settlementCyclesとbaselineSnapshot.md`
3. `03_adjustments管理.md`
4. `04_cashActions管理.md`
5. `05_reopenと再会計.md`
6. `06_要対応の会計画面と一覧取得.md`
7. `07_analyticsMonthly更新と日付帰属とline配賦.md`

## 詳細仕様書の完成条件

各仕様書について、少なくとも次が満たされていれば「実装入力として完成」とみなす。

1. 役割が明確である
2. current-scope と非対象が分かれている
3. 入力 / 更新対象が明記されている
4. parent / cycle / adjustment / cashAction / analytics の責務境界と矛盾しない
5. 画面影響が必要なら明記されている
6. 整合条件が明記されている
7. テスト観点が最低限そろっている

## changeSpec との関係

- 原則として、仕様書 1 本に対して changeSpec 1 本を作成する
- changeSpec では、実装ファイル、変更 API、トリガ、トランザクション境界、idempotency、エラー応答を具体化する
- 仕様書で未確定の概念を changeSpec 側で勝手に拡張しない

## 作成時の注意

### 1. `bills` との整合性を守る

今回の仕様書は、すべて **現行 `bills` 実装から派生できる範囲**を前提にする。  
既存実装と整合しない新 source や新 ledger を先に前提化しない。

### 2. current-scope を守る

本段階では、次を詳細仕様へ混ぜない。

- strict な税務 / 会計 read model
- card 後日入金 / fee
- point treatment の厳密判定
- product-level analytics
- advisor review / period close

### 3. `03.1` を起点にし、古い資料を追い越さない

- 直近の 3.11 / 3.12 により適切な記載がある場合は、それを正とする
- 旧 ToBe docs の表現に引きずられない

## 今後の進め方

1. `04_仕様書/` を入力に changeSpec を作る
2. 依存順に changeSpec と実装を進める
3. 実装中に仕様差分が出た場合は、まず `04_仕様書/` を更新する
4. future 機能が必要になったら `05_今後検討_税務会計read_model拡張.md` へ切り分ける
