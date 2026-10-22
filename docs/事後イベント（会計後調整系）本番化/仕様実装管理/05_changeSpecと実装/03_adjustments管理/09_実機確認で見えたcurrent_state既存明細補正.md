# 09_実機確認で見えたcurrent_state既存明細補正

## 1. このファイルの役割

このファイルは、実機確認 `11-F` で見えた `会計後操作` UI の既存明細表示ずれを補正するための修正メモである。

対象は Flutter 側の `会計後操作` 画面であり、Step03 の adjustment 仕様そのものを作り替えるものではない。Step03 で保存している `adjustments` を、UI が **baseline ではなく current state** として読み直せるようにすることが目的である。

## 2. 実機確認で見えた問題

### 2.1 一度減額済み・返金済みの明細が再び既存明細に見えてしまう

例:
- `decrease_refunded` で `メロンソーダ` を 1 件返金済みにした
- その後もう一度 `会計後操作` を開くと、`メロンソーダ` が既存明細として再び選べてしまう

この状態では、すでに current state から消えている明細を再度減額できてしまう。

### 2.2 増額で追加した明細が、その後の既存明細に載らない

例:
- `increase_collection_pending` / `increase_collected` で `タコス` や `ポップコーン` を追加した
- その後もう一度 `会計後操作` を開いても、その追加済み明細が既存明細として見えない

この状態では、current state 上では bill に存在する明細を、後続の会計後操作で扱えない。

### 2.3 根本原因

現行 UI は減額候補と tournament の既存回数を `baselineSnapshot/snapshot` だけから組み立てている。

そのため:
- baseline 以後の `adjustments` が UI に反映されない
- current state と UI の既存明細一覧がずれる

## 3. 修正方針

## 3.1 既存明細一覧は baseline ではなく current state から作る

`会計後操作` の既存明細一覧は、次を合成した **current state** から作る。

1. `baselineSnapshot/snapshot`
2. 同一 `settlementCycle` 配下の `adjustments`

### 3.2 current state に反映する adjustmentState

current state を作る際に反映対象とする state:
- `effective`
- `completed_by_cash_action`
- `completed_by_offset`

反映対象外とする state:
- `cancelled_by_reopen`

理由:
- `effective`: まだ未精算でも current claim には反映済み
- `completed_by_cash_action`: 即時返金 / 即時徴収として current state に確定済み
- `completed_by_offset`: opposite-direction 相殺後も line 差分自体は current state に残る
- `cancelled_by_reopen`: reopen 後の旧 cycle 履歴なので current state から除外する

## 3.3 UI 上の期待動作

### 減額側
- current state で数量 0 になった明細は既存明細に出さない
- current state に残っている明細だけを減額対象にする
- 同一明細は 1 回しか選べない制御を維持する

### 増額側
- 増額で追加済みの明細は、その後の既存明細一覧にも反映される
- tournament の `entry / reentry / addon` の既存回数も current state 基準にする

## 4. データ再構成の単位

current state の既存明細は、少なくとも次の単位で集約する。

- `item`: `targetId + operationType('sale')`
- `extra`: `targetName + operationType('extra')`
- `tournament`: `targetId + operationType('entry'/'reentry'/'addon')`
- `sideGameChip`: `targetId or targetName + operationType('chip')`

各単位について:
- `qty`
- `amountIncl`
を持ち、baseline を初期値にして adjustment line の `qtyDelta` / `amountInclDelta` を順に加減算する。

## 5. 今回の修正スコープ

- Flutter `会計後操作` 詳細ページで、既存明細の元データを current state に切り替える
- tournament 既存回数表示を current state ベースに切り替える
- 実機確認メモに current state 基準の表示方針を追記する

## 6. 今回の非対象

- Firestore の保存形式変更
- `adjustments` / `cashActions` backend ロジック変更
- analyticsMonthly 集計ロジック修正
- 旧 `会計後調整` 画面の改修

## 7. 確認観点

修正後は少なくとも次を確認する。

1. `decrease_refunded` 済みの `メロンソーダ` が、次回の既存明細一覧に出ない
2. `increase_collection_pending` / `increase_collected` で追加した `タコス` / `ポップコーン` が、次回の既存明細一覧に出る
3. tournament の既存回数が、baseline ではなく current state の回数として見える
4. offset 済みの adjustment を含む bill でも、既存明細一覧が current state と一致する
