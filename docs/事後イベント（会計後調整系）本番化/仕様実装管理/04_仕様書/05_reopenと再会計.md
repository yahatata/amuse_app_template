# 05_reopenと再会計

## 1. 役割

本仕様書は、`reopen` を実行した時に old cycle / new cycle / parent summary / baseline / analytics をどう切り替えるかを定める。

`reopen` は current-scope で唯一、`currentSettlementCycle` を進める操作である。

## 2. スコープ

本仕様書で扱う対象:

- `reopen` の意味
- old cycle の閉じ方
- new cycle の開き方
- `currentSettlementCycle` / `latestSettledCycle` の更新
- `cancelled_by_reopen`
- 再会計後の baseline 再作成
- analytics rollback / resettle の責務境界

## 3. 非対象

本仕様書では次を扱わない。

- tax / accounting closed period
- advisor review
- reopen 権限設計の最終化
- future read model の rollback 実装

## 4. 参照元

- `../03.1_前提再設計/step3.11_未決論点の再決定/11_事後イベントの機能と業務パターン.md`
- `../03.1_前提再設計/step3.11_未決論点の再決定/13_billsのSoTと保存モデル.md`
- `../03.1_前提再設計/step3.11_未決論点の再決定/15_売上日入出金日営業日の帰属ルール.md`
- `../03.1_前提再設計/step3.12_全体整合性確認/blockA_業務と画面/01_決定事項総覧.md`
- `../03.1_前提再設計/step3.12_全体整合性確認/blockB_保存モデルとcurrent_state/01_決定事項総覧.md`

## 5. `reopen` の意味

### 5.1 基本定義

`reopen` は、会計後差分を積み続ける操作ではなく、**現在の会計を未会計へ戻して再会計し直す入口**である。

### 5.2 `adjustment` ではない

`reopen` は current-scope で adjustment として保存しない。

### 5.3 baseline 切替操作

`reopen` は、baseline の土台を次 cycle へ切り替える操作である。

## 6. 実行前提

current-scope では、少なくとも次を満たす bill に対して `reopen` を行う。

- `latestSettledCycle >= 1`
- current bill が一度は settle 済みである

補足:

- 直前状態は `settled` でも `post_settlement_pending` でもよい
- ただし未会計 `open` bill に対して `reopen` を行う想定は current-scope 外

## 7. `reopen` 実行時の更新

### 7.1 old cycle

更新するもの:

- `cycleState = reopened`
- `closedAt`
- `closedReason = reopen`

### 7.2 old cycle 配下 adjustment

未完了 adjustment は `cancelled_by_reopen` にする。

対象:

- `requiredActionRemainingIncl > 0`
- `adjustmentState = effective`

理由:

- old cycle の pending を new cycle current state に持ち込まないため

### 7.3 parent

更新するもの:

- `status = open`
- `reopenSummary.hasReopenHistory = true`
- `reopenSummary.reopenCount += 1`
- `reopenSummary.currentSettlementCycle += 1`
- `reopenSummary.lastReopenedAt`
- `reopenSummary.lastReopenedBy`
- `postSettlementState.requiredActionType = none`
- `postSettlementState.requiredActionIncl = 0`
- current summary を open 状態に合わせて再初期化

### 7.4 `latestSettledCycle`

`reopen` 時点では進めない。

例:

- reopen 前
  - `currentSettlementCycle = 1`
  - `latestSettledCycle = 1`
- reopen 後
  - `currentSettlementCycle = 2`
  - `latestSettledCycle = 1`

### 7.5 new cycle

作るもの:

- `settlementCycles/{next}`
  - `cycleState = open`
  - `openedReason = reopen`
  - `openedFromCycleNo = oldCycleNo`
  - `nextSequenceNo = 1`

この時点では `baselineSnapshot` はまだ作らない。

## 8. `reopen` 後の live data 扱い

- bill 直下 live subcollection を再編集対象として使う
- old cycle の baselineSnapshot は immutable history として残す
- new cycle の会計は live data をもとに行う

## 9. 再会計

### 9.1 再会計時に行うこと

- new current cycle で通常会計処理を行う
- new current cycle に `baselineSnapshot` を作る
- `cycleState = settled`
- parent `latestSettledCycle = currentSettlementCycle`
- parent `status = settled`

### 9.2 何を新しい baseline にするか

- 再会計時点の live data 全体
- 差分ではなく full snapshot

## 10. `analyticsMonthly` との関係

### 10.1 current-scope の責務分離

`reopen` 時は、概念上次の 2 段階に分ける。

1. old cycle の影響を rollback する
2. resettle 後に new baseline を反映する

### 10.2 詳細な更新式

詳細な式は `07_analyticsMonthly更新と日付帰属とline配賦.md` に委ねる。  
本仕様書では、**`reopen` は analytics 的にも baseline 切替として扱う**ことだけを固定する。

## 11. UI / 導線影響

- `reopen` 後の bill は `open` となる
- `要対応の会計` の会計後要対応カードとして残し続けない
- 通常未会計導線へ戻す

## 12. 整合条件

1. `reopen` は `currentSettlementCycle` を 1 だけ進める
2. `reopen` 時点では `latestSettledCycle` は据え置く
3. old cycle baseline は変更しない
4. old cycle 未完了 adjustment は `cancelled_by_reopen`
5. new cycle は `open` で開始し、再会計前に baseline を持たない
6. resettle 後に `latestSettledCycle = currentSettlementCycle`

## 13. 不可条件

- `reopen` を adjustment として保存しない
- 通常 adjustment 完了のたびに cycle を進めない
- old cycle pending を new cycle required action に引き継がない

## 14. テスト観点

1. settled bill に `reopen` を行うと current cycle だけ進む
2. reopen 直後に parent が `open` になる
3. old cycle 未完了 adjustment が `cancelled_by_reopen` になる
4. new cycle が `open` で作成される
5. resettle 後に new baseline が作られ `latestSettledCycle` が追いつく
