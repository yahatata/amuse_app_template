# 04_cashActions管理

## 1. 役割

本仕様書は、実際の返金 / 徴収履歴を `cashActions/{cashActionId}` としてどう保存し、どの adjustment をどれだけ解消したかをどう表現するかを定める。

`cashActions` は、売上差分そのものではなく、**実入出金の事実**を持つ。

## 2. スコープ

本仕様書で扱う対象:

- `cashActions/{cashActionId}`
- `cashActionType`
- `amountIncl`
- `executedAt`
- `executedBy`
- `cashflowBusinessDate`
- `methodBreakdown[]`
- `allocations[]`
- parent / adjustment への反映

## 3. 非対象

本仕様書では次を扱わない。

- strict な card settlement 管理
- card fee の会計処理
- point treatment の厳密判定
- `reportingEntries` など future read model

## 4. 参照元

- `../03.1_前提再設計/step3.11_未決論点の再決定/13_billsのSoTと保存モデル.md`
- `../03.1_前提再設計/step3.11_未決論点の再決定/12_analyticsMonthlyと入出金データの役割分担.md`
- `../03.1_前提再設計/step3.12_全体整合性確認/blockB_保存モデルとcurrent_state/01_決定事項総覧.md`
- `../03.1_前提再設計/step3.12_全体整合性確認/blockC_集計と日付軸/01_決定事項総覧.md`

## 5. 基本方針

### 5.1 cashAction の意味

cashAction は、**実際にその時点で返金 / 徴収を行った事実**を表す。

### 5.2 保存先

```text
bills/{billId}/settlementCycles/{cycleNo}/cashActions/{cashActionId}
```

### 5.3 adjustment 配下に置かない理由

1 回の cashAction が複数 adjustment をまとめて解消できる必要があるため、cycle 配下に置く。

## 6. 必須 field

- `sequenceNo`
- `cashActionType`
- `amountIncl`
- `executedAt`
- `executedBy`
- `cashflowBusinessDate`
- `methodBreakdown[]`
- `allocations[]`
- `note`

## 7. `cashActionType`

- `refund`
- `collection`

## 8. `methodBreakdown[]`

### 8.1 役割

1 回の cashAction を、実際の方法別に分解して残す。

### 8.2 必須 field

- `method`
- `amountIncl`

### 8.3 current-scope の考え方

- `method` の値は現金 / QR / 振込など現行実装と整合する範囲で使う
- strict な provider / fee / settlement batch 管理は future

## 9. `allocations[]`

### 9.1 役割

その cashAction が、**どの adjustment をどれだけ解消したか**を表す。

### 9.2 必須化

`allocations[]` は current-scope で必須とする。

### 9.3 必須 field

- `adjustmentId`
- `amountIncl`

### 9.4 整合ルール

1. `allocations` は 1 件以上必須
2. `cashAction.amountIncl = sum(allocations[].amountIncl)`
3. allocation 先 adjustment は同一 cycle に属する
4. allocation 先 adjustment は `requiredActionRemainingIncl > 0` を持つ
5. allocation で remaining を 0 未満にしない

## 10. adjustment 残額更新ルール

cashAction 作成時は、`allocations[]` に従って adjustment の `requiredActionRemainingIncl` を減らす。

### 10.1 更新手順

1. allocation 先 adjustment を取得
2. `requiredActionRemainingIncl -= allocation.amountIncl`
3. 0 未満にはしない
4. 0 になった adjustment は `completed_by_cash_action`
5. 残る adjustment は `effective` のまま

### 10.2 具体例

#### 状況

- `adj_1`: refund pending 1000
- `adj_2`: collection pending 1500
- 内部相殺後 `adj_2.remaining = 500`

#### cashAction

- `cashActionType = collection`
- `amountIncl = 500`
- `allocations = [{ adjustmentId: adj_2, amountIncl: 500 }]`

#### 結果

- `adj_2.remaining = 0`
- parent `requiredActionType = none`
- parent `status = settled`

## 11. immediate / later cashAction

### 11.1 immediate patterns

- `減額 + 返金済`
- `増額 + 追加徴収済`

これらは adjustment 作成と同一トランザクションで cashAction を作る。

### 11.2 later patterns

- `減額 + 返金前`
- `増額 + 追加徴収前`

これらは後続操作で cashAction を作る。

## 12. parent 反映ルール

### 12.1 `refund`

- `currentSummary.refundedTotalIncl` を増やす
- `postSettlementState.totalRefundedIncl` を増やす
- `postSettlementState.requiredActionType / requiredActionIncl` を再計算する

### 12.2 `collection`

- `currentSummary.receivedTotalIncl` を増やす
- `postSettlementState.totalCollectedIncl` を増やす
- `postSettlementState.requiredActionType / requiredActionIncl` を再計算する

### 12.3 共通

- `postSettlementState.lastRecordType = cash_action`
- `postSettlementState.lastRecordAt = executedAt`
- `postSettlementState.lastRecordId = cashActionId`
- 未解消が残らなければ `status = settled`

## 13. `analyticsMonthly` との接続

cashAction は current-scope で、次の責務に使う。

- 実入出金の更新
- `paymentTotals` を増やす必要がある collection パターンの反映

補足:

- refund によって `paymentTotals` を直接減らさない
- 詳細な更新責務は `07_analyticsMonthly更新と日付帰属とline配賦.md` に従う

## 14. `sequenceNo`

- cashAction ごとに必須
- current cycle の `nextSequenceNo` から採番
- adjustment と同一カウンタを共有する

## 15. 不可条件

- `allocations[]` なしの cashAction を作らない
- `cashAction.amountIncl` と allocation 合計がズレたまま保存しない
- 異なる cycle の adjustment を 1 つの cashAction に混在させない
- remaining を超える over-allocation を許可しない

## 16. テスト観点

1. immediate cashAction 作成時に adjustment remaining が 0 になる
2. later cashAction 作成時に allocated adjustment の remaining が正しく減る
3. allocation 合計と amount が一致しない場合は弾かれる
4. multi-allocation cashAction が作成できる
5. parent summary が refund / collection で正しく更新される
