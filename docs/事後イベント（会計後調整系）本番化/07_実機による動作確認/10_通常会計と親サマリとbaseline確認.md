# 10_通常会計と親サマリとbaseline確認

## 1. 対応範囲

- Step01 `bills親docとcurrent_state管理`
- Step02 `settlementCyclesとbaselineSnapshot`

## 2. このファイルの役割

このファイルでは、**通常会計の基本導線**を通した時に、親 `bills/{billId}` と `settlementCycles` / `baselineSnapshot` が仕様どおり保存されるかを確認する。

ここで OK になれば、以降の事後イベント確認に使う bill の土台が正しいと言える。

## 3. 参照元

- [04_仕様書/01_bills親docとcurrent_state管理.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/04_仕様書/01_bills親docとcurrent_state管理.md)
- [04_仕様書/02_settlementCyclesとbaselineSnapshot.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/04_仕様書/02_settlementCyclesとbaselineSnapshot.md)
- [Step01 実機確認手順](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_changeSpecと実装/01_bills親docとcurrent_state管理/08_実機確認手順.md)
- [Step02 実機確認手順](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_changeSpecと実装/02_settlementCyclesとbaselineSnapshot/08_実機確認手順.md)

## 4. 事前準備

- Flutter app を起動できること
- Firestore Console または Emulator UI を開けること
- 確認用の顧客を 1 名用意できること
- 可能なら billId を記録するメモを手元に用意すること

## 5. 使う検証データ

- billId: `B-01` 系を使う
- 顧客名: 何でもよいが、後で見分けやすい名前にする
- できれば item / extra / tournament / chip の 4 種のうち 2〜3 種を入れて会計する

## 6. 確認シナリオ

### シナリオ A: bill 作成直後の親 doc 初期値

#### どこから入るか
- terminal の通常導線から bill を新規作成する

#### 何をするか
1. 顧客を入店状態にする
2. terminal から新規 bill を作成する
3. 作成直後に billId を控える
4. Firestore で `bills/{billId}` を開く
5. `bills/{billId}/settlementCycles/1` があるか確認する

#### Firestore で確認する場所
- `bills/{billId}`
- `bills/{billId}/settlementCycles/1`

#### 期待されるアプリ上の状態
- bill が通常どおり開いている
- まだ会計開始していない
- エラー表示が出ていない

#### 期待される Firestore 状態
`bills/{billId}` で少なくとも次を確認する。

- `status = open`
- `businessDate` が入っている
- `ops.accountingStartedAt = null`
- `ops.accountingCompletedAt = null`
- `ops.accountingCanceledAt = null`
- `draftAccountingInput.paymentMethodsByCategory = null`
- `draftAccountingInput.paymentMethodsByAmount = null`
- `settlementSnapshot.amounts = null`
- `settlementSnapshot.categoryBreakdown = null`
- `settlementSnapshot.paymentTotals = null`
- `currentSummary.claimTotalIncl = 0`
- `currentSummary.receivedTotalIncl = 0`
- `currentSummary.refundedTotalIncl = 0`
- `currentSummary.netSalesIncl = 0`
- `postSettlementState.requiredActionType = none`
- `postSettlementState.requiredActionIncl = 0`
- `closeSummary.unresolved = false`
- `reopenSummary.currentSettlementCycle = 1`
- `reopenSummary.latestSettledCycle = 0`
- `reopenSummary.hasReopenHistory = false`

`bills/{billId}/settlementCycles/1` で少なくとも次を確認する。

- `cycleNo = 1`
- `cycleState = open`
- `openedReason = initial`
- `openedFromCycleNo = null`
- `nextSequenceNo = 1`
- `baselineSummary = null`
- `settledAt = null`
- `closedAt = null`

#### このシナリオの完了判定
- 親 doc 初期値が入っている
- `settlementCycles/1` が作られている
- この時点では `baselineSnapshot` はまだ存在しない

---

### シナリオ B: 会計開始で `ops` と `draftAccountingInput` が更新される

#### どこから入るか
- 作成済み bill の通常会計画面

#### 何をするか
1. bill に item などを追加して会計可能な状態にする
2. 通常会計画面で会計開始を行う
3. 支払方法を入力する
4. 確定直前、または会計開始直後の `bills/{billId}` を確認する

#### Firestore で確認する場所
- `bills/{billId}`

#### 期待されるアプリ上の状態
- 会計開始後の UI に遷移する
- 支払方法の入力内容が画面に反映される
- エラーが出ていない

#### 期待される Firestore 状態
- `status = settling`
- `ops.accountingStartedAt` が入る
- `ops.accountingStartedBy` が入る
- `draftAccountingInput.paymentMethodsByCategory` または `draftAccountingInput.paymentMethodsByAmount` に入力内容が保存される
- `draftAccountingInput` は、会計画面で指定した split 内容と整合している

#### このシナリオの完了判定
- 会計開始で `settling` へ遷移する
- 支払方法入力が parent に記録される

---

### シナリオ C: 会計取消で `status` と `ops` が戻る

#### どこから入るか
- `status = settling` の bill

#### 何をするか
1. 会計開始済み bill で会計取消を実行する
2. Firestore で `bills/{billId}` を確認する

#### Firestore で確認する場所
- `bills/{billId}`

#### 期待されるアプリ上の状態
- 会計画面から戻る、または会計前状態に戻る
- エラーが出ていない

#### 期待される Firestore 状態
- `status = open`
- `ops.accountingCanceledAt` が入る
- `ops.accountingCanceledBy` が入る
- `ops.accountingCompletedAt = null`
- `settlementSnapshot.*` はまだ null のまま
- `currentSummary` はゼロのまま
- `reopenSummary.currentSettlementCycle = 1` のまま
- `settlementCycles/1` はまだ `cycleState = open`

#### このシナリオの完了判定
- 会計取消後に `open` に戻る
- cycle は増えない

---

### シナリオ D: 通常 settle で parent summary と baseline が保存される

#### どこから入るか
- `status = open` または `settling` の bill

#### 何をするか
1. bill に item / extra / tournament / chip を適宜追加する
2. 通常会計を完了する
3. Firestore で次の 3 か所を開く
   - `bills/{billId}`
   - `bills/{billId}/settlementCycles/1`
   - `bills/{billId}/settlementCycles/1/baselineSnapshot/snapshot`

#### Firestore で確認する場所
- `bills/{billId}`
- `bills/{billId}/settlementCycles/1`
- `bills/{billId}/settlementCycles/1/baselineSnapshot/snapshot`

#### 期待されるアプリ上の状態
- 通常会計が完了する
- 画面上で完了扱いになる
- 残高や支払結果が正しく見える

#### 期待される Firestore 状態
`bills/{billId}`:
- `status = settled`
- `settlementSnapshot.amounts` が入る
- `settlementSnapshot.categoryBreakdown` が入る
- `settlementSnapshot.paymentTotals` が入る
- `settlementSnapshot.paymentsSummary` が入る
- `settlementSnapshot.closedAt` が入る
- `settlementSnapshot.contentHash` が入る
- `currentSummary.claimTotalIncl` が会計結果に一致する
- `currentSummary.receivedTotalIncl` が支払済み合計に一致する
- `currentSummary.refundedTotalIncl = 0`
- `currentSummary.netSalesIncl` が実会計結果に一致する
- `postSettlementState.requiredActionType = none`
- `postSettlementState.requiredActionIncl = 0`
- `reopenSummary.currentSettlementCycle = 1`
- `reopenSummary.latestSettledCycle = 1`
- `meta.contentHash` が入る

`bills/{billId}/settlementCycles/1`:
- `cycleState = settled`
- `settledAt` が入る
- `closedReason = settle`
- `baselineSummary` が入る
- `nextSequenceNo = 1` のまま

`bills/{billId}/settlementCycles/1/baselineSnapshot/snapshot`:
- `items[]` が保存される
- `extras[]` が保存される
- `tournaments[]` が保存される
- `sideGameChips[]` が保存される
- `amounts` が保存される
- `categoryBreakdown` が保存される
- `paymentTotals` が保存される
- `paymentsSummary` が保存される
- `contentHash` が保存される

#### このシナリオの完了判定
- 親 summary と cycle / baseline の 3 層が揃う
- settle 後の bill の土台として使える状態になる

---

### シナリオ E: 通常 settle では cycle が増えない

#### どこから入るか
- 1 回通常会計を完了した bill

#### 何をするか
1. Firestore で `bills/{billId}/settlementCycles` 配下を確認する
2. cycle doc の数を確認する

#### Firestore で確認する場所
- `bills/{billId}/settlementCycles`

#### 期待される Firestore 状態
- `settlementCycles/1` だけが存在する
- `settlementCycles/2` はまだ存在しない

#### このシナリオの完了判定
- 通常 settle では cycle が増えないことを確認できる

## 7. このファイル全体の完了判定

このファイルは、次がすべて満たされたら完了とする。

1. bill 作成で親 doc 初期値と `settlementCycles/1` を確認できた
2. 会計開始 / 会計取消の parent 更新を確認できた
3. 通常 settle で `settlementSnapshot` / `currentSummary` / `baselineSnapshot` を確認できた
4. cycle が増えないことを確認できた

## 8. 実施結果記録欄

- 実施日:
- 実施者:
- 対象環境:
- billId:
- 結果:
- 補足:
