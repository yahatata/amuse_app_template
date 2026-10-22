# 01_bills親docとcurrent_state管理

## 1. 役割

本仕様書は、`bills/{billId}` 親 doc を **current state を軽く読むための正規 summary** としてどう設計・更新するかを定める。

この仕様書は、一覧取得、画面表示、要対応判定、後続の `settlementCycles / adjustments / cashActions` の反映先を統一する土台である。

## 2. スコープ

本仕様書で扱う対象:

- 親 doc の責務
- `status`
- `settlementSnapshot`
- `currentSummary`
- `postSettlementState`
- `reopenSummary`
- `closeSummary`
- `party`
- `place`
- `ops`
- `draftAccountingInput`

## 3. 非対象

本仕様書では次を扱わない。

- `settlementCycles` の詳細構造
- `baselineSnapshot` の中身
- `adjustments` と `cashActions` の明細 schema
- `analyticsMonthly` の更新式
- strict な税務 / 会計 read model

## 4. 参照元

- `../03.1_前提再設計/step3.11_未決論点の再決定/13_billsのSoTと保存モデル.md`
- `../03.1_前提再設計/step3.11_未決論点の再決定/14_status_summary_pending管理.md`
- `../03.1_前提再設計/step3.11_未決論点の再決定/14.5_bills全体像とフィールド構成.md`
- `../03.1_前提再設計/step3.12_全体整合性確認/blockB_保存モデルとcurrent_state/01_決定事項総覧.md`
- `../03.1_前提再設計/step3.12_全体整合性確認/blockA_業務と画面/01_決定事項総覧.md`

## 5. 親 doc の基本方針

### 5.1 親 doc の性質

親 doc は SoT 明細の置き場ではなく、**SoT から導出した read-friendly summary** とする。

### 5.2 親 doc に持つもの

- 一覧や UI で即時に読みたい current state
- 未会計 / 要対応判定に必要な field
- `reopen` / 持ち越し未会計の summary
- 会計開始 / 完了などの運用操作情報

### 5.3 親 doc に持たないもの

- baseline の重い確定明細
- adjustment ごとの詳細内訳
- cashAction ごとの詳細内訳
- 完全な監査履歴

## 6. field グループ

### 6.1 top-level

- `billId`
- `businessDate`
- `status`
- `createdAt`
- `updatedAt`
- `receiptNumber`

#### `status` の current-scope 値

- `open`
- `settling`
- `settled`
- `post_settlement_pending`

#### `status` の意味

- `open`
  - 未会計。`reopen` 後や閉店持ち越し未会計を含む
- `settling`
  - 会計処理中
- `settled`
  - current cycle に未対応 action がない
- `post_settlement_pending`
  - current cycle に未対応 action がある

### 6.2 `party`

- `party.userId`
- `party.pokerName`

### 6.3 `place`

- `place.table`
- `place.seat`

### 6.4 `ops`

- `ops.accountingStartedAt`
- `ops.accountingStartedBy`
- `ops.accountingCompletedAt`
- `ops.accountingCompletedBy`
- `ops.accountingCanceledAt`
- `ops.accountingCanceledBy`

### 6.5 `draftAccountingInput`

- `draftAccountingInput.paymentMethodsByCategory`
- `draftAccountingInput.paymentMethodsByAmount`

補足:

- current-scope では、既存実装の `meta.paymentMethodsByAmount` / `meta.paymentMethodsByCategory` を無理に置き換えない
- `draftAccountingInput` は target 概念として持ち、詳細な source 優先順位は `07_analyticsMonthly更新と日付帰属とline配賦.md` に従う

### 6.6 `settlementSnapshot`

- `settlementSnapshot.amounts`
- `settlementSnapshot.categoryBreakdown`
- `settlementSnapshot.paymentTotals`
- `settlementSnapshot.paymentsSummary`
- `settlementSnapshot.closedAt`
- `settlementSnapshot.contentHash`

役割:

- `latestSettledCycle` の baseline 要約キャッシュ
- settle 後の parent 読み取りを軽くする
- current-scope の支払手段 read model の source にもなる

### 6.7 `currentSummary`

- `currentSummary.claimTotalIncl`
- `currentSummary.receivedTotalIncl`
- `currentSummary.refundedTotalIncl`
- `currentSummary.netSalesIncl`

### 6.8 `postSettlementState`

- `postSettlementState.hasPostSettlementActivity`
- `postSettlementState.totalAdjustmentsIncl`
- `postSettlementState.totalCollectedIncl`
- `postSettlementState.totalRefundedIncl`
- `postSettlementState.requiredActionType`
- `postSettlementState.requiredActionIncl`
- `postSettlementState.lastRecordType`
- `postSettlementState.lastRecordAt`
- `postSettlementState.lastRecordId`

#### `requiredActionType` の current-scope 値

- `none`
- `collection`
- `refund`

#### `requiredActionIncl`

- `requiredActionType = collection` の時は追加徴収必要額
- `requiredActionType = refund` の時は要返金額
- `none` の時は `0`

#### `lastRecordType` の current-scope 値

- `none`
- `adjustment`
- `cash_action`
- `reopen`

### 6.9 `reopenSummary`

- `reopenSummary.hasReopenHistory`
- `reopenSummary.reopenCount`
- `reopenSummary.currentSettlementCycle`
- `reopenSummary.latestSettledCycle`
- `reopenSummary.lastReopenedAt`
- `reopenSummary.lastReopenedBy`
- `reopenSummary.lastResettledAt`

### 6.10 `closeSummary`

- `closeSummary.unresolved`
- `closeSummary.markedAt`
- `closeSummary.closedBusinessDate`
- `closeSummary.displayAmountAtMark`
- `closeSummary.lastCloseRunId`

## 7. current state の読み方

### 7.1 基本式

親 doc の current state は、概念上次の合成結果である。

1. `latestSettledCycle` に対応する `baselineSnapshot`
2. `currentSettlementCycle` の `adjustments`
3. `currentSettlementCycle` の `cashActions`

### 7.2 parent は正規 summary である

実装上は毎回再計算読みを強制せず、parent に current summary を保存する。  
ただし意味論上は、常に上の合成結果と一致していなければならない。

### 7.3 `requiredActionType / requiredActionIncl` の導出原則

parent の要対応 summary は、raw な `adjustmentAmountIncl` や `cashAction.amountIncl` をそのまま足し引きして作らない。  
**current cycle 上で最終的に残っている `requiredActionRemainingIncl`** を正として導出する。

導出手順:

1. current cycle の有効 adjustment を `sequenceNo` 順に評価する
2. adjustment 作成時に opposite-direction の内部相殺を適用する
3. 相殺後に残った `requiredActionRemainingIncl` を direction ごとに合計する
4. refund 側合計を `refundRemainingTotal`、collection 側合計を `collectionRemainingTotal` とする
5. `refundRemainingTotal = 0` かつ `collectionRemainingTotal = 0` なら
   - `requiredActionType = none`
   - `requiredActionIncl = 0`
6. `refundRemainingTotal > 0` なら
   - `requiredActionType = refund`
   - `requiredActionIncl = refundRemainingTotal`
7. `collectionRemainingTotal > 0` なら
   - `requiredActionType = collection`
   - `requiredActionIncl = collectionRemainingTotal`

current-scope では内部相殺を前提にするため、refund 側と collection 側が同時に正で残る状態を正規状態として保存しない。

## 8. parent 更新タイミング

### 8.1 bill 作成時

最低限更新するもの:

- `status = open`
- `reopenSummary.currentSettlementCycle = 1`
- `reopenSummary.latestSettledCycle = 0`
- `postSettlementState.requiredActionType = none`
- `postSettlementState.requiredActionIncl = 0`
- `closeSummary.unresolved = false`

### 8.2 会計開始時

- `status = settling`
- `ops.accountingStartedAt`
- `ops.accountingStartedBy`

### 8.3 通常会計確定時 / 再会計確定時

- `status = settled`
- `settlementSnapshot.*` 更新
- `currentSummary.*` を baseline に合わせて更新
- `postSettlementState.hasPostSettlementActivity = false`
- `postSettlementState.totalAdjustmentsIncl = 0`
- `postSettlementState.totalCollectedIncl = 0`
- `postSettlementState.totalRefundedIncl = 0`
- `postSettlementState.requiredActionType = none`
- `postSettlementState.requiredActionIncl = 0`
- `reopenSummary.latestSettledCycle = reopenSummary.currentSettlementCycle`
- `ops.accountingCompletedAt`
- `ops.accountingCompletedBy`

### 8.4 adjustment 作成時

- `currentSummary.claimTotalIncl` 更新
- 必要に応じて `currentSummary.netSalesIncl` 更新
- `postSettlementState.hasPostSettlementActivity = true`
- `postSettlementState.totalAdjustmentsIncl` 更新
- `postSettlementState.requiredActionType / requiredActionIncl` を remaining 再集計結果で更新
- `postSettlementState.lastRecordType = adjustment`
- `postSettlementState.lastRecordAt = adjustment.createdAt`
- `postSettlementState.lastRecordId = adjustmentId`
- `status`
  - 未解消 required action が残れば `post_settlement_pending`
  - 残らなければ `settled`

### 8.5 cashAction 作成時

- `currentSummary.receivedTotalIncl` または `currentSummary.refundedTotalIncl` 更新
- `postSettlementState.totalCollectedIncl` または `postSettlementState.totalRefundedIncl` 更新
- `postSettlementState.requiredActionType / requiredActionIncl` を remaining 再集計結果で再計算
- `postSettlementState.lastRecordType = cash_action`
- `postSettlementState.lastRecordAt = cashAction.executedAt`
- `postSettlementState.lastRecordId = cashActionId`
- `status`
  - 未解消 required action が残れば `post_settlement_pending`
  - なくなれば `settled`

### 8.6 `reopen` 実行時

- `status = open`
- `reopenSummary.hasReopenHistory = true`
- `reopenSummary.reopenCount += 1`
- `reopenSummary.currentSettlementCycle += 1`
- `reopenSummary.lastReopenedAt`
- `reopenSummary.lastReopenedBy`
- `postSettlementState.requiredActionType = none`
- `postSettlementState.requiredActionIncl = 0`
- current summary は new cycle open state に合わせて再初期化

### 8.7 閉店持ち越し未会計マーキング時

- `status` は `open` のまま
- `closeSummary.unresolved = true`
- `closeSummary.markedAt`
- `closeSummary.closedBusinessDate`
- `closeSummary.displayAmountAtMark`
- `closeSummary.lastCloseRunId`

## 9. 一覧 / UI 判定ルール

### 9.1 要対応の会計

- 未会計
  - `status = open`
  - `closeSummary.unresolved = true`
- 追加徴収
  - `status = post_settlement_pending`
  - `postSettlementState.requiredActionType = collection`
  - `postSettlementState.requiredActionIncl > 0`
- 要返金
  - `status = post_settlement_pending`
  - `postSettlementState.requiredActionType = refund`
  - `postSettlementState.requiredActionIncl > 0`

### 9.2 current-scope で採らない status

次は current-scope では parent status として採用しない。

- `partially_paid`
- `partially_refunded`
- `refunded`
- `voided`
- `in_progress`

## 10. 整合条件

1. `status = settled` の時は `postSettlementState.requiredActionType = none` かつ `requiredActionIncl = 0`
2. `postSettlementState.requiredActionType = none` の時は `requiredActionIncl = 0`
3. `requiredActionType = collection | refund` の時は `requiredActionIncl > 0`
4. `reopenSummary.latestSettledCycle <= reopenSummary.currentSettlementCycle`
5. `closeSummary.unresolved = true` の bill は current-scope では `status = open`
6. `settlementSnapshot` は `latestSettledCycle` と整合する

## 11. 不可条件

- parent に adjustment 明細や cashAction 明細を重複保持しない
- 一覧取得都合で新しい共通 status を追加しない
- `analyticsMonthly` を parent の代わりの正本にしない

## 12. テスト観点

1. 初回 settle 後に parent が baseline summary と一致する
2. `減額 + 返金前` 作成後に `post_settlement_pending + refund` になる
3. refund cashAction 完了後に `settled + none` に戻る
4. opposite-direction offset 後に parent が差額だけを持つ
5. `reopen` 後に `currentSettlementCycle` だけ進み `status = open` になる
6. 閉店持ち越し bill が `要対応の会計` で `未会計` に分類される
