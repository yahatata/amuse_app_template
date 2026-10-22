# 14_status_summary_pending管理

## この候補の役割

親 `bill` doc の `status` と current-state 系 summary を、どの粒度で持つべきかを整理する。

ここでは、次の点を扱う。

- 親 `bill` doc だけを見た時に、今どのような状態かをどこまで判断できるようにするか
- `status` に何を持たせ、何を summary 側へ逃がすか
- current cycle と old cycle を current state にどう反映するか
- `reopen` 後に old cycle の未完了 adjustment が current state に残らないようにする原則をどう置くか

重要:

- 本ファイルは **status / summary / current state 表現** の方針を決めるためのもの
- `baselineSnapshot` / `adjustments` / `cashActions` の保存場所そのものは 13 の保存モデルが主語であり、本ファイルはその上に乗る current-state 設計を扱う

## `step3.11` で先に確定させる必要があるか

- 判定: 必要あり
- 理由:
  - 親 `bill` doc の `status` / summary の持ち方が曖昧だと、一覧画面、要対応導線、`analyticsMonthly` 非 SoT 方針、`reopen` 後の current state 判定がそろわない
  - 特に、current cycle と old cycle の記録をどう切り分けるかは、この段階で原則を決めておく必要がある

## 確定した方針

### 1. 親 `bill` doc は current state の読み取りを担う

親 `bill` doc は、次を軽く読めるようにする前提で設計する。

- 今 `open` / `settling` / `settled` / `post_settlement_pending` のどれか
- 今の請求額、受領済み額、返金済み額、純売上
- 今どの向きの対応が必要か
- `reopen` 履歴があるか
- current cycle と latest settled cycle がどれか
- 閉店持ち越し未会計かどうか

### 2. `status` は workflow の大段階だけを表す

`status` には、細かい adjustment 種別や cashAction 種別を持たせない。

採用する値は次の 4 つとする。

- `open`
- `settling`
- `settled`
- `post_settlement_pending`

#### 切替条件

- `postSettlementState.requiredActionIncl > 0` なら `post_settlement_pending`
- `postSettlementState.requiredActionIncl = 0` なら `settled`
- `open` / `settling` は従来どおり workflow の進行状態で決まる

### 3. 持ち越し未会計は `status = open` のままで扱う

翌営業日以降へ持ち越された未会計 bill は、workflow 的には未会計のため `status = open` のままでよい。

これを区別するために、親 doc に `closeSummary` を持つ。

最低限必要な情報:

- `closeSummary.unresolved`
- `closeSummary.markedAt`
- `closeSummary.closedBusinessDate`
- `closeSummary.displayAmountAtMark`
- `closeSummary.lastCloseRunId`

### 4. current state は `currentSummary` で持つ

親 doc の `currentSummary` は、current cycle を基準にした今の金額状態を持つ。

持つ field は次とする。

- `currentSummary.claimTotalIncl`
- `currentSummary.receivedTotalIncl`
- `currentSummary.refundedTotalIncl`
- `currentSummary.netSalesIncl`

### 5. 会計後状態は `postSettlementState` にまとめる

親 doc では、会計後状態を **`postSettlementState` の 1 グループ**に統合して持つ。

持つ field:

- `postSettlementState.hasPostSettlementActivity`
- `postSettlementState.totalAdjustmentsIncl`
- `postSettlementState.totalCollectedIncl`
- `postSettlementState.totalRefundedIncl`
- `postSettlementState.requiredActionType`
- `postSettlementState.requiredActionIncl`
- `postSettlementState.lastRecordType`
- `postSettlementState.lastRecordAt`
- `postSettlementState.lastRecordId`

#### `requiredActionType`

- `none`
- `collection`
- `refund`

#### 方針

- 親 doc では「今どちら向きに何円必要か」が分かればよい
- pending の細かな件数や、collection / refund を同時に別々で parent に持つことはしない
- そのため `mixed` は持たない
- 個別 adjustment ごとの残額や cashAction の詳細は cycle 側に持つ

### 6. `requiredActionType / requiredActionIncl` の導出原則

親 doc の要対応 summary は、current cycle の `adjustments` と `cashActions` から導出する。

導出原則:

1. current cycle 内の有効 adjustment を `sequenceNo` 順に評価する
2. adjustment 作成時に opposite-direction の未解消 adjustment と内部相殺する
3. 相殺後に残った `requiredActionRemainingIncl` を direction ごとに合計する
4. 最終的に非ゼロで残った片側だけを、親 doc の `requiredActionType / requiredActionIncl` とする

この前提により、通常は current cycle 上で refund 側と collection 側が同時に正で残らない設計に寄せる。

### 7. `lastRecord*` は補助情報として残す

- `postSettlementState.lastRecordType`
- `postSettlementState.lastRecordAt`
- `postSettlementState.lastRecordId`

は親 doc に残す。

ただし、これは current state の根拠そのものではない。

- current state の根拠は current cycle の `baselineSnapshot` + `adjustments` + `cashActions`
- `lastRecord*` は「直近で何が起きたか」を親 doc 上で軽く示す補助情報

### 8. cycle は親 doc の 2 か所で要約する

親 doc には、次の 2 つを持つ。

- `reopenSummary.currentSettlementCycle`
- `reopenSummary.latestSettledCycle`

意味:

- `currentSettlementCycle`
  - 今の current state を組み立てる基準 cycle
- `latestSettledCycle`
  - 最後に baseline が確定している cycle

これにより、`reopen` 後の再会計前状態でも「今見ている cycle」と「最後に baseline がある cycle」を分けて読める。

### 9. `reopenSummary` は current cycle と履歴要約を持つ

持つ field は次とする。

- `reopenSummary.hasReopenHistory`
- `reopenSummary.reopenCount`
- `reopenSummary.currentSettlementCycle`
- `reopenSummary.latestSettledCycle`
- `reopenSummary.lastReopenedAt`
- `reopenSummary.lastReopenedBy`
- `reopenSummary.lastResettledAt`

### 10. current state は current cycle の records だけで組み立てる

親 doc の current state は、**current cycle に属する data だけ** から組み立てる。

使うもの:

- current cycle の `baselineSnapshot`
- current cycle の `adjustments`
- current cycle の `cashActions`

使わないもの:

- old cycle の baseline
- old cycle の未完了 / 完了 adjustment
- old cycle の cashAction

### 11. `currentSettlementCycle` を書く / 進めるタイミング

- bill 作成時
  - `currentSettlementCycle = 1`
  - `latestSettledCycle = 0`
- 初回 settle 時
  - `currentSettlementCycle = 1`
  - `latestSettledCycle = 1`
- 通常の adjustment / cashAction 時
  - `currentSettlementCycle` は進めない
  - `latestSettledCycle` も進めない
- `reopen` 時
  - `currentSettlementCycle` を次 cycle に進める
  - `latestSettledCycle` は old cycle のまま
- `reopen` 後再会計時
  - `latestSettledCycle = currentSettlementCycle`

### 12. old cycle の records は `cancelled_by_reopen` 相当で current から外す

`reopen` で current cycle が進んだ時、old cycle に未完了の adjustment が残っていても、それを current state に残してはいけない。

そのため、old cycle の未完了 adjustment は `cancelled_by_reopen` 相当にし、current 集計対象から外す。

### 13. `requiredActionRemainingIncl` と `allocations` の current-state 上の意味

- `requiredActionRemainingIncl`
  - adjustment 単位の未解消残額
- `cashActions.allocations`
  - どの adjustment をどれだけ解消したか

親 doc 再計算時は、

- `requiredActionRemainingIncl`
- `adjustmentState`
- `cashActions.allocations`

を正として current state を作る。

### 14. 現時点での着地点

- `status` は workflow の大段階だけを表す
- 親 doc は金額状態と required action を軽く読むための summary に徹する
- adjustment / cashAction の詳細は parent に持たない
- current / old cycle の切り分けは `currentSettlementCycle` と `latestSettledCycle`、および cycle 配下 record の状態で判定する

## 関連ドキュメント

- [13_billsのSoTと保存モデル.md](./13_billsのSoTと保存モデル.md)
- [14.5_bills全体像とフィールド構成.md](./14.5_bills全体像とフィールド構成.md)
