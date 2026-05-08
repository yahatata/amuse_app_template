# 13_billsのSoTと保存モデル

## この候補の役割

`bills` を、どこに何を持つ構造にするかを整理する。

本項目は、11 の業務パターン、12 の `analyticsMonthly` 非 SoT 方針、14 の `status / summary / current-state` 管理、15 の日付帰属ルールを支える保存モデルの土台になる。

今回の `step3.11` では、**現行実装から派生でき、`bills` との整合性を保ったまま実装できる範囲**を優先して確定する。  
税務・会計 read model の厳密化は future doc に逃がす。

## `step3.11` で先に確定させる必要があるか

- 判定: 必要あり
- 理由:
  - どの doc が SoT で、どの doc が summary かを先に決めないと、14 の current-state 設計や 12 の `analyticsMonthly` 更新責務を確定できない
  - 特に `settlementCycles` / `baselineSnapshot` / `adjustments` / `cashActions` の責務分担は、この段階で固定しておく必要がある

## 今回確定する仕様

### 1. 全体構造

`bills` は次の 3 層で扱う。

1. **現在値**
   - bill 親 doc
2. **会計確定の土台**
   - `settlementCycles/{cycleNo}`
   - `baselineSnapshot`
3. **会計後差分と実入出金**
   - `adjustments/{adjustmentId}`
   - `cashActions/{cashActionId}`

### 2. bill 親 doc の役割

親 doc は、**current state を軽く読むための正規サマリ**である。

親 doc に持つもの:

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

親 doc に持たないもの:

- baseline の重い明細
- adjustment ごとの内訳
- cashAction ごとの実行詳細
- 完全な監査時系列

### 3. bill 直下の会計前サブコレクション

bill 直下の次の subcollection は、**会計前のライブ編集領域**として使う。

- `items`
- `extras`
- `tournaments`
- `sideGameChips`
- `payments`

意味:

- まだ会計確定前の作業領域
- `reopen` 後の再会計でも再利用される
- 会計時に current live state を snapshot 化して cycle 側へ写す

### 4. `settlementCycles/{cycleNo}` の役割

`settlementCycles/{cycleNo}` は、その cycle の baseline 版を表す。

基本ルール:

- bill 作成時に cycle 1 を `open` で作る
- 初回 settle 時に cycle 1 baseline を確定する
- 通常の adjustment / cashAction では cycle を進めない
- `reopen` 時に次 cycle を `open` で作る
- `reopen` 後再会計でその cycle baseline を確定する

### 5. `currentSettlementCycle` と `latestSettledCycle`

親 doc の `reopenSummary` には次を持つ。

- `currentSettlementCycle`
  - 今の current state を組み立てる基準 cycle
- `latestSettledCycle`
  - 最後に baseline が存在する cycle

これにより、

- 通常会計後
- `reopen` 直後
- `reopen` 後の再会計前

を区別できる。

### 6. cycle 親 doc に持つべきもの

最低限次を持つ前提とする。

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

意味:

- `nextSequenceNo` は、同一 cycle 内の adjustment / cashAction に順番を振るためのカウンタ
- `baselineSummary` は、その cycle baseline の軽い要約

### 7. baseline は `baselineSnapshot` にまとめて持つ

baseline 明細は、`settlementCycles/{cycleNo}` 配下の **1 つの snapshot doc** にまとめて持つ方針とする。

推奨パス:

- `settlementCycles/{cycleNo}/baselineSnapshot`

この doc に少なくとも次を持つ。

- `items[]`
- `extras[]`
- `tournaments[]`
- `sideGameChips[]`
- `amounts`
- `categoryBreakdown`
- `paymentTotals`
- `paymentsSummary`
- `contentHash`

方針:

- baseline は full snapshot として保存する
- 差分だけを持つ場所ではない
- 通常の事後イベントでは更新しない
- 会計時 / 再会計時だけ作成・更新する

### 8. `adjustments/{adjustmentId}` の役割

`adjustments` は、baseline に対する **会計後差分** を持つ。

最低限次を持つ前提とする。

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

#### `lines[]`

`lines[]` は、何をどれだけ変えたかの内訳であり、次を持つ。

- `targetCategory`
- `targetId`
- `targetName`
- `operationType`
- `qtyDelta`
- `amountInclDelta`
- `note`

### 9. `cashActions/{cashActionId}` の役割

`cashActions` は、**実際の返金 / 徴収履歴** を持つ。

最低限次を持つ前提とする。

- `sequenceNo`
- `cashActionType`
- `amountIncl`
- `executedAt`
- `executedBy`
- `cashflowBusinessDate`
- `methodBreakdown[]`
- `allocations[]`
- `note`

#### なぜ adjustment 配下ではなく cycle 配下か

- 1 つの cashAction が複数 adjustment をまとめて解消できるようにするため
- 特に、方向が逆の adjustment が同一 cycle に混在した場合、差額だけを 1 回の cashAction で処理する必要があるため

### 10. `allocations[]` のルール

`allocations[]` は必須とし、各 cashAction がどの adjustment をどれだけ解消したかを持つ。

最低限のルール:

1. `allocations` は 1 件以上必須
2. 各 allocation は `adjustmentId` と `amountIncl` を持つ
3. `cashAction.amountIncl` は `allocations[].amountIncl` の合計と一致する
4. allocation 先 adjustment は同一 cycle に属する必要がある
5. allocation は `requiredActionRemainingIncl > 0` の adjustment にしか張れない

### 11. `requiredActionRemainingIncl` の更新ルール

`requiredActionRemainingIncl` は、その adjustment に対して **まだ必要な cash action の残額** を表す。

#### 11.1 adjustment 作成時

- `減額 + 返金前`
  - provisional remaining = `adjustmentAmountIncl`
- `増額 + 追加徴収前`
  - provisional remaining = `adjustmentAmountIncl`
- `減額 + 返金済`
  - adjustment 作成時点では provisional remaining を `adjustmentAmountIncl` とみなしてよいが、同一トランザクション内で対応 cashAction を作り、最終的な remaining は 0 にする
- `増額 + 追加徴収済`
  - 上と同様に、同一トランザクション内で cashAction を作り、最終的な remaining は 0 にする

#### 11.2 opposite-direction adjustment が後から来た時

同一 cycle 内で、未解消の opposite-direction adjustment がある状態で新しい adjustment を作る時は、**内部相殺** を行う。

ルール:

1. `sequenceNo` が小さい古い未解消 adjustment から順に見る
2. opposite-direction の remaining 同士を相殺する
3. 相殺で remaining が 0 になった adjustment は `completed_by_offset` 相当にする
4. 新しい adjustment 側も remaining が 0 になる可能性がある
5. 相殺後に残った片側の差額だけが、親 doc の `requiredActionType / requiredActionIncl` に現れる

#### 11.3 cashAction 作成時

cashAction 作成時は、`allocations[]` にしたがって各 adjustment の remaining を減らす。

ルール:

1. allocation された `amountIncl` ぶんだけ `requiredActionRemainingIncl` を減らす
2. 0 未満にはしない
3. 0 になった adjustment は `completed_by_cash_action` 相当にする
4. まだ残る adjustment は `effective` のまま残す

### 12. 同一 cycle 内の順番管理

- `adjustment` と `cashAction` はどちらも `sequenceNo` を持つ
- `sequenceNo` は `settlementCycles/{cycleNo}.nextSequenceNo` から採番する
- current state は、baseline に対して adjustment / cashAction を `sequenceNo` 順で適用して再計算できる形を保つ

### 13. 現行実装から派生させる支払手段 source

今回のスコープでは、税務・会計寄りの派生 read model を今すぐ作るとしても、**新しい payment ledger を前提にせず、現行 `bills` 実装から派生させる**。

優先順位:

1. `/payments` が存在する場合はそれを使う
2. `/payments` が未整備なら `meta.paymentMethodsByAmount` を使う
3. それも使えない場合は `meta.paymentMethodsByCategory + categoryBreakdown` を fallback として使う
4. settle 後の派生では `settlementSnapshot.paymentTotals` と `settlementSnapshot.paymentsSummary` を使う

この方針により、今回の `step3.11` では **現行 `bills` との整合性を保ったまま実装できる** 範囲に仕様を閉じる。

### 14. parent 再計算の入力

親 doc の current state は、次から再計算可能な派生値とする。

- 親 doc の `settlementSnapshot` 要約
- `settlementCycles/{latestSettledCycle}/baselineSnapshot`
- current cycle の `adjustments`
- current cycle の `cashActions`

### 15. `reopen` 時の扱い

`reopen` は adjustment ではなく cycle の状態遷移として扱う。

- old cycle の `cycleState = reopened`
- old cycle の未完了 adjustment は `cancelled_by_reopen`
- 親 doc の `currentSettlementCycle` を次 cycle へ進める
- new cycle を `open` で作る
- `latestSettledCycle` は再会計完了まで old cycle のまま

### 16. 今回ここで確定しないもの

- `/payments` の正式 ledger 化
- tax/accounting 用 `reportingEntries / reportingMonthly / cashflowMonthly` の厳密 schema
- クレカ後日入金・手数料
- 自社ポイント / 他社ポイントの treatment
- advisor review / period close

これらは [/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_今後検討_税務会計read_model拡張.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_今後検討_税務会計read_model拡張.md) で継続管理する。

### 17. 現時点の保存モデルまとめ

| パス | 役割 | 主な内容 | 正本か | 目的 |
|---|---|---|---|---|
| `bills/{billId}` | current-state summary | status、currentSummary、postSettlementState、reopenSummary など | 親 summary | 一覧、運用、current state |
| `bills/{billId}/items` など | 会計前ライブデータ | 編集中の item / extra / tournament / chip | 正本 | 会計前編集 |
| `bills/{billId}/settlementCycles/{cycleNo}` | cycle 管理 | state、opened / settled、nextSequenceNo、baselineSummary | 正本 | baseline 版管理 |
| `.../baselineSnapshot` | baseline full snapshot | items[]、extras[]、tournaments[]、sideGameChips[]、summary | 正本 | analytics baseline、監査 |
| `.../adjustments/{adjustmentId}` | 会計後差分 | change 本体、lines[]、remaining | 正本 | 差分履歴、current 再計算 |
| `.../cashActions/{cashActionId}` | 実入出金履歴 | refund / collection 本体、allocations[] | 正本 | cashflow、adjustment 解消 |

## 関連ドキュメント

- [11_事後イベントの機能と業務パターン.md](./11_事後イベントの機能と業務パターン.md)
- [12_analyticsMonthlyと入出金データの役割分担.md](./12_analyticsMonthlyと入出金データの役割分担.md)
- [14_status_summary_pending管理.md](./14_status_summary_pending管理.md)
- [/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_今後検討_税務会計read_model拡張.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_今後検討_税務会計read_model拡張.md)
