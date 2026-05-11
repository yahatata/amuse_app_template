# 03_adjustments管理

## 1. 役割

本仕様書は、baseline に対する会計後差分を `adjustments/{adjustmentId}` としてどう保存・更新するかを定める。

`adjustments` は current-scope における会計後変更の中心であり、親 doc の `requiredActionType / requiredActionIncl` と `analyticsMonthly` の売上差分更新の双方に影響する。

## 2. スコープ

本仕様書で扱う対象:

- 4 パターンの adjustment
- `adjustmentType`
- `adjustmentDirection`
- `adjustmentAmountIncl`
- `cashActionTypeAtCreation`
- `cashActionHandledAtCreation`
- `adjustmentState`
- `requiredActionRemainingIncl`
- `lines[]`
- opposite-direction の内部相殺

## 3. 非対象

本仕様書では次を扱わない。

- cashAction 明細
- `reopen` 実行フロー全体
- `analyticsMonthly` の詳細更新式
  - ただし line 粒度の前提には触れる
- strict な tax / accounting adjustment classification

## 4. 参照元

- `../03.1_前提再設計/step3.11_未決論点の再決定/11_事後イベントの機能と業務パターン.md`
- `../03.1_前提再設計/step3.11_未決論点の再決定/13_billsのSoTと保存モデル.md`
- `../03.1_前提再設計/step3.11_未決論点の再決定/18_売上差分明細の粒度と配賦ルール.md`
- `../03.1_前提再設計/step3.12_全体整合性確認/blockB_保存モデルとcurrent_state/01_決定事項総覧.md`
- `../03.1_前提再設計/step3.12_全体整合性確認/blockC_集計と日付軸/01_決定事項総覧.md`

## 5. 基本方針

### 5.1 adjustment の意味

adjustment は、**baseline に対して何をどれだけ増減したか**を表す。

### 5.2 current-scope で扱う業務パターン

- `減額 + 返金済`
- `減額 + 返金前`
- `増額 + 追加徴収済`
- `増額 + 追加徴収前`

### 5.3 `reopen` は adjustment ではない

`reopen` は baseline 切替操作であり、adjustment として保存しない。

## 6. 保存先

```text
bills/{billId}/settlementCycles/{cycleNo}/adjustments/{adjustmentId}
```

## 7. 必須 field

- `sequenceNo`
- `adjustmentType`
- `adjustmentDirection`
- `adjustmentAmountIncl`
- `cashActionTypeAtCreation`
- `cashActionHandledAtCreation`
- `adjustmentState`
- `requiredActionRemainingIncl`
- `createdAt`
- `createdBy`
- `note`
- `lines[]`
- `supersededByAdjustmentId`

## 8. `adjustmentType` の current-scope 値

- `decrease_refund_pending`
- `decrease_refunded`
- `increase_collection_pending`
- `increase_collected`

## 9. `adjustmentDirection`

- `decrease`
- `increase`

## 10. `cashActionTypeAtCreation`

- `none`
- `refund`
- `collection`

## 11. `adjustmentState`

current-scope では、最低限次の意味を持つ状態を管理する。

- `effective`
  - current state に効いている
- `completed_by_cash_action`
  - cashAction で remaining が 0 になった
- `completed_by_offset`
  - opposite-direction 相殺で remaining が 0 になった
- `cancelled_by_reopen`
  - `reopen` により current 集計対象から外れた

補足:

- 実装上の field 値はこのまま採用してよい
- 追加の別 state を current-scope で増やさない

## 12. `requiredActionRemainingIncl`

### 12.1 意味

その adjustment に対して、**まだ必要な cash action の残額**を表す。

- refund 系なら、まだ返していない額
- collection 系なら、まだ受け取っていない額

### 12.2 初期値

- pending 系 adjustment
  - `adjustmentAmountIncl` を初期値にする
- immediate cash handling 系 adjustment
  - 同一トランザクションで cashAction を作り、最終的に `0` にする

## 13. `lines[]`

### 13.1 必須

`lines[]` は必須とする。line-less adjustment は current-scope では許可しない。

### 13.2 必須 field

- `lineNo`
- `targetCategory`
- `targetId`
- `targetName`
- `operationType`
- `qtyDelta`
- `amountInclDelta`
- `note`

### 13.3 `targetCategory`

- `item`
- `extra`
- `tournament`
- `sideGameChip`

### 13.4 tournament line の追加要件

`tournament` は current-scope で最も細かく持つ。

- `targetId`
  - templateKey / templateId 相当
- `targetName`
  - templateName
- `operationType`
  - `entry`
  - `reentry`
  - `addon`

### 13.5 整合条件

- `sum(lines[].amountInclDelta) = adjustment.adjustmentAmountIncl`
- `amountInclDelta` の符号は `adjustmentDirection` と一致する
- `qtyDelta` を持つ line も方向を揃える

## 14. 4 パターンの保存ルール

### 14.1 `減額 + 返金前`

- `adjustmentType = decrease_refund_pending`
- `adjustmentDirection = decrease`
- `cashActionTypeAtCreation = refund`
- `cashActionHandledAtCreation = false`
- provisional `requiredActionRemainingIncl = adjustmentAmountIncl`
- `adjustmentState = effective`

### 14.2 `減額 + 返金済`

- `adjustmentType = decrease_refunded`
- `adjustmentDirection = decrease`
- `cashActionTypeAtCreation = refund`
- `cashActionHandledAtCreation = true`
- 同一トランザクションで refund cashAction を作る
- 最終 `requiredActionRemainingIncl = 0`
- 最終 `adjustmentState = completed_by_cash_action`

### 14.3 `増額 + 追加徴収前`

- `adjustmentType = increase_collection_pending`
- `adjustmentDirection = increase`
- `cashActionTypeAtCreation = collection`
- `cashActionHandledAtCreation = false`
- provisional `requiredActionRemainingIncl = adjustmentAmountIncl`
- `adjustmentState = effective`

### 14.4 `増額 + 追加徴収済`

- `adjustmentType = increase_collected`
- `adjustmentDirection = increase`
- `cashActionTypeAtCreation = collection`
- `cashActionHandledAtCreation = true`
- 同一トランザクションで collection cashAction を作る
- 最終 `requiredActionRemainingIncl = 0`
- 最終 `adjustmentState = completed_by_cash_action`

## 15. opposite-direction の内部相殺

### 15.1 目的

同一 cycle 内で、未解消の refund 系 adjustment と collection 系 adjustment が併存した場合、**差額だけを残す**ために内部相殺を行う。

### 15.2 適用タイミング

新しい adjustment 作成時に、未解消の opposite-direction adjustment が存在する場合に適用する。

### 15.3 ルール

1. `sequenceNo` が小さい古い未解消 adjustment から順に見る
2. opposite-direction の `requiredActionRemainingIncl` 同士を相殺する
3. 0 になった古い adjustment は `completed_by_offset`
4. 新しい adjustment 側も 0 になりうる
5. 相殺後に残った片側の差額だけを parent `requiredActionType / requiredActionIncl` に反映する

### 15.4 具体例

#### 例

1. `減額 + 返金前 1000`
2. その後 `増額 + 追加徴収前 1500`

#### 相殺後

- 古い refund 側 remaining: `0`
- 新しい collection 側 remaining: `500`
- parent:
  - `requiredActionType = collection`
  - `requiredActionIncl = 500`

## 16. parent 反映ルール

### 16.1 adjustment 作成時

- `currentSummary.claimTotalIncl` 更新
- `currentSummary.netSalesIncl` 更新
- `postSettlementState.totalAdjustmentsIncl` 更新
- `postSettlementState.requiredActionType / requiredActionIncl` を相殺後 remaining 合計から再計算
- `postSettlementState.lastRecordType = adjustment`
- `status`
  - remaining が残れば `post_settlement_pending`
  - 残らなければ `settled`

### 16.2 parent 要対応再計算の原則

parent の `requiredActionType / requiredActionIncl` は、次の raw 値から直接決めない。

- `adjustmentAmountIncl`
- `cashAction.amountIncl`

必ず次の手順で決める。

1. current cycle の有効 adjustment を対象にする
2. 各 adjustment の `requiredActionRemainingIncl` を見る
3. `refund` 側 remaining 合計と `collection` 側 remaining 合計を別々に集計する
4. internal offset 済み前提のため、最終的に非ゼロで残る片側だけを parent に反映する

### 16.3 同時両残りを許可しない

current-scope では、保存後の整合状態として

- refund 側 remaining 合計 > 0
- collection 側 remaining 合計 > 0

が同時に成立する状態を許可しない。

この状態が発生した場合は、offset 適用漏れ・remaining 更新漏れ・allocation 反映漏れのいずれかとみなし、正常系保存結果として扱わない。

### 16.4 parent には差額だけを持たせる

parent は refund と collection を両方同時に持たず、**相殺後に残る片側だけ**を持つ。

## 17. `sequenceNo`

- adjustment ごとに必須
- `settlementCycles/{cycleNo}.nextSequenceNo` から採番
- 同一 cycle 内の順番管理は、この値で行う

## 18. 不可条件

- line-less adjustment を作らない
- `adjustmentAmountIncl` と line 合計がズレたまま保存しない
- tournament line で template / operationType が不足した状態を current-scope で許可しない
- opposite-direction の両残額を parent に同時表示しない

## 19. テスト観点

1. 4 パターンごとに正しい `adjustmentType` と初期 remaining が入る
2. immediate cash handling パターンで remaining が 0 になる
3. line 合計と `adjustmentAmountIncl` の一致検証
4. opposite-direction 相殺で差額だけが残る
5. parent `requiredActionType / requiredActionIncl` が差額に一致する
6. tournament line が `byTemplateTournaments` 更新に必要な情報を持つ
