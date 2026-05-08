# 02_settlementCyclesとbaselineSnapshot

## 1. 役割

本仕様書は、`settlementCycles/{cycleNo}` と `baselineSnapshot` を使って、bill の**会計確定版の土台**をどう管理するかを定める。

ここでいう土台とは、通常会計または `reopen` 後再会計で確定した、後続 adjustment の基準になる full snapshot を指す。

## 2. スコープ

本仕様書で扱う対象:

- `settlementCycles/{cycleNo}` の作成 / 更新
- `currentSettlementCycle`
- `latestSettledCycle`
- `cycleState`
- `nextSequenceNo`
- `baselineSnapshot`
- `baselineSummary`

## 3. 非対象

本仕様書では次を扱わない。

- adjustment 4 パターンの個別仕様
- cashAction と allocation の詳細
- `analyticsMonthly` の差分更新式
- `reopen` の詳細フロー全体
  - ただし cycle 切替に必要な部分までは扱う

## 4. 参照元

- `../03.1_前提再設計/step3.11_未決論点の再決定/13_billsのSoTと保存モデル.md`
- `../03.1_前提再設計/step3.11_未決論点の再決定/14.5_bills全体像とフィールド構成.md`
- `../03.1_前提再設計/step3.11_未決論点の再決定/17_既存データ互換移行方針.md`
- `../03.1_前提再設計/step3.12_全体整合性確認/blockB_保存モデルとcurrent_state/01_決定事項総覧.md`

## 5. 基本方針

### 5.1 `settlementCycles` の意味

`settlementCycles` は、bill の baseline 版を管理する collection である。

### 5.2 cycle が進むタイミング

cycle を進めるのは **`reopen` の時だけ** とする。

進めないもの:

- 通常 adjustment 作成
- refund / collection cashAction 完了
- immediate refund / immediate collection を伴う adjustment 完了

### 5.3 baseline の意味

`baselineSnapshot` は、その cycle における **通常会計 / 再会計確定時点の full snapshot** である。

- 差分だけを持つ場所ではない
- 通常の事後イベントでは更新しない

## 6. collection 構造

```text
bills/{billId}
└─ settlementCycles/{cycleNo}
   ├─ cycle親doc
   └─ baselineSnapshot
```

## 7. cycle 親 doc

### 7.1 必須 field

- `cycleNo`
- `cycleState`
- `openedAt`
- `openedBy`
- `openedReason`
- `openedFromCycleNo`
- `settledAt`
- `settledBy`
- `closedAt`
- `closedReason`
- `nextSequenceNo`
- `baselineSummary`

### 7.2 `cycleState` の current-scope 値

- `open`
- `settled`
- `reopened`
- `cancelled`

### 7.3 `openedReason`

- `initial`
- `reopen`

### 7.4 `closedReason`

- `settle`
- `reopen`
- `cancelled`

### 7.5 `nextSequenceNo`

- adjustment と cashAction の両方に採番する
- 同一 cycle 内で単調増加する
- 初期値は `1`

## 8. parent との接続

### 8.1 `currentSettlementCycle`

- 今の current state を組み立てる基準 cycle

### 8.2 `latestSettledCycle`

- 最後に baseline が存在する cycle

### 8.3 意味の違い

#### 初回 settle 後

- `currentSettlementCycle = 1`
- `latestSettledCycle = 1`

#### `reopen` 直後、再会計前

- `currentSettlementCycle = 2`
- `latestSettledCycle = 1`

この差を持つことで、`reopen` 後の未確定状態を自然に表現できる。

## 9. `baselineSnapshot` 構造

### 9.1 保持方針

`baselineSnapshot` は **1 doc** で持つ。

理由:

- baseline は 1 つの確定版として扱う方が自然
- 読み取りコストが軽い
- current-scope では item 数の肥大化前提を置かない

### 9.2 必須構成

- `items[]`
- `extras[]`
- `tournaments[]`
- `sideGameChips[]`
- `amounts`
- `categoryBreakdown`
- `paymentTotals`
- `paymentsSummary`
- `contentHash`

### 9.3 line ごとの役割

- `items[]`
  - 通常会計確定時点の item 明細
- `extras[]`
  - extra 明細
- `tournaments[]`
  - tournament 明細
- `sideGameChips[]`
  - chip 明細

### 9.4 `items[]` の最小 field

- `menuItemId`
- `name`
- `category`
- `qty`
- `unitPriceIncl`
- `salesIncl`

### 9.5 `extras[]` の最小 field

- `extraType`
- `name`
- `qty`
- `unitPriceIncl`
- `salesIncl`

### 9.6 `tournaments[]` の最小 field

- `templateId`
- `templateName`
- `entryCount`
- `entrySalesIncl`
- `reentryCount`
- `reentrySalesIncl`
- `addonCount`
- `addonSalesIncl`
- `totalTournamentSalesIncl`
- `pointsAwardedTotal`
- `prizeAmountTotalIncl`

### 9.7 `sideGameChips[]` の最小 field

- `chipActionType`
- `qty`
- `amountIncl`

### 9.8 `amounts`

最低限次を持つ。

- `subTotalIncl`
- `discountTotalIncl`
- `serviceChargeIncl`
- `grandTotalIncl`
- `roundingDelta`
- `grandTotalRounded`

### 9.9 `categoryBreakdown`

最低限次を持つ。

- `items`
- `extraCost`
- `sideGameChips`
- `tournaments`

### 9.10 `paymentTotals` / `paymentsSummary`

- settle 時点での受領方法 summary
- current-scope では既存 `bills` 実装から自然に派生できる source とみなす
- strict payment ledger ではない

## 10. cycle と baseline の作成タイミング

### 10.1 bill 作成時

作るもの:

- `settlementCycles/1`
  - `cycleState = open`
  - `openedReason = initial`
  - `nextSequenceNo = 1`

まだ baseline は作らない。

### 10.2 初回 settle 時

更新 / 作成するもの:

- `settlementCycles/1.cycleState = settled`
- `settlementCycles/1.settledAt`
- `settlementCycles/1.settledBy`
- `settlementCycles/1.closedReason = settle`
- `settlementCycles/1.baselineSummary`
- `settlementCycles/1/baselineSnapshot`
- parent `latestSettledCycle = 1`

### 10.3 通常 adjustment / cashAction 時

- 新しい cycle は作らない
- baseline も更新しない
- current cycle に adjustment / cashAction を積む

### 10.4 `reopen` 時

作る / 更新するもの:

- old current cycle
  - `cycleState = reopened`
  - `closedAt`
  - `closedReason = reopen`
- new current cycle
  - `cycleNo = old + 1`
  - `cycleState = open`
  - `openedReason = reopen`
  - `openedFromCycleNo = old`
  - `nextSequenceNo = 1`
- parent `currentSettlementCycle += 1`
- parent `latestSettledCycle` は据え置く

### 10.5 `reopen` 後再会計時

- current cycle の `baselineSnapshot` を作る
- current cycle を `settled` にする
- parent `latestSettledCycle = currentSettlementCycle`

## 11. live data と baseline の違い

### 11.1 bill 直下 live data

- 会計前編集領域
- `reopen` 後にも再利用する
- 更新されうる
- exact field schema は current-scope では既存 `bills` 実装を再利用し、本仕様書では変更しない

### 11.2 `baselineSnapshot`

- 会計確定時点の immutable snapshot
- その cycle の監査・再構築基準
- 通常 adjustment では不変

## 12. `baselineSummary`

`baselineSummary` は cycle 親 doc に置く軽量 summary である。

目的:

- cycle doc を開いただけで baseline の大枠を把握できるようにする
- parent `settlementSnapshot` と同種の軽量要約を cycle 単位でも持つ

最低限持つもの:

- `amounts`
- `categoryBreakdown`
- `paymentTotals`
- `paymentsSummary`
- `contentHash`

## 13. 整合条件

1. `latestSettledCycle <= currentSettlementCycle`
2. `cycleState = settled` の cycle は `baselineSnapshot` を持つ
3. `cycleState = open` の cycle は current-scope では `baselineSnapshot` を持たなくてよい
4. current cycle の `nextSequenceNo` は、その cycle 配下の最大 `sequenceNo + 1` 以上である
5. `baselineSnapshot` は settle / resettle 以外で更新しない
6. `baselineSnapshot` は 1 doc で持つ

## 14. 不可条件

- 通常 adjustment のたびに cycle を進めない
- `baselineSnapshot` を差分置き場として使わない
- baseline 明細を current-scope で subcollection に再分割しない

## 15. テスト観点

1. bill 作成時に cycle 1 open が作成される
2. 初回 settle 時に baselineSnapshot が 1 doc 作成される
3. 通常 adjustment / cashAction では cycle が進まない
4. `reopen` 時に only current cycle が進む
5. `reopen` 直後は `currentSettlementCycle > latestSettledCycle` になる
6. 再会計後に `latestSettledCycle = currentSettlementCycle` になる
