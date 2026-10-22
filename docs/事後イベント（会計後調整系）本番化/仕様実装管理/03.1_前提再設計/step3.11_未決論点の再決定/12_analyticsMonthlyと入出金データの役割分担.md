# 12_analyticsMonthlyと入出金データの役割分担

## この候補の役割

売上ベースで作られてきた `analyticsMonthly`、`bills` 側に残す会計後状態、実入出金の履歴、運用画面で参照する read model の役割分担をどう切るかを検討する。

今回の `step3.11` では、**現行実装から無理なく派生でき、`bills` との整合性を保ったまま導入できる範囲**に絞って決める。  
税務・会計 read model の厳密化は [/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_今後検討_税務会計read_model拡張.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_今後検討_税務会計read_model拡張.md) に逃がす。

## `step3.11` で先に確定させる必要があるか

- 判定: 必要あり
- 判断理由:
  - `analyticsMonthly` の役割が曖昧なままだと、後続の `bills` 保存モデル、`adjustments / cashActions`、日付帰属、ダッシュボード表示、`step3.12` の全体整合性確認が成立しない
  - 特に、`paymentTotals` を何の数字として扱うか、実入出金をどこで見るか、運用画面がどこを正とするかを先に決める必要がある

## 今回確定する仕様

### 1. 今回のスコープ

今回ここで確定するのは次に限る。

1. `analyticsMonthly` を **運用ダッシュボード用途の read model** として維持すること
2. 実入出金は `cashActions` を起点に別責務として扱うこと
3. 支払手段情報は、**現行 `bills` 実装から読める source を優先順位付きで使う**こと
4. 今後の税務・会計 read model も、まずは **`bills` から派生させ、`bills` との整合性を崩さずに実装する**こと

今回ここで確定しないもの（current-scope ではスコープ外とする future 機能）:

- `/payments` の正式 ledger 化
- `reportingMonthly / cashflowMonthly` の厳密 schema
- クレカ後日入金・手数料
- 自社ポイント / 他社ポイントの税務 treatment
- 月締め / 年締め / advisor review

### 2. 用語定義

- `売上系`: 売上がどの営業日に帰属するかを表す集計
- `受領内訳`: その売上に対して、どの方法で受領したものとして扱うかを表す集計
- `実入出金`: 実際にその日に現金・振込・返金等の金銭移動が起きた事実
- `adjustment`: baseline に対する会計内容の差分
- `cashAction`: 実際の返金 / 徴収の履歴
- `SoT`: 運用・修正・返金・徴収処理の正本データ
- `read model`: ダッシュボードや一覧表示のために整形・集計された参照用データ

### 3. `analyticsMonthly` の役割

- `analyticsMonthly` の既存 top-level フィールドは、今の意味のまま維持する
- 既存 top-level は、`売上帰属月ベースの売上分析 read model` として扱う
- ここには少なくとも次の既存項目が含まれる
  - `grossSales`
  - `itemsSales`
  - `sideGameChipSales`
  - `extraCostSales`
  - `tournamentsSales`
  - `dailySales`
  - `orderCount`
  - `paymentTotals`
- 既存 top-level は「実際にその月に現金がいくら動いたか」を直接表す場ではない
- したがって、今回のスコープでは **税務・決算の正本として扱わない**

### 4. `paymentTotals` の意味

- `paymentTotals` は、`売上帰属月ベースで集計する受領内訳` として扱う
- `paymentTotals` は「実際にその月に現金等が動いた額」ではない
- `paymentTotals` は「その売上をどの方法で受領したものとして扱うか」を示す
- そのため、後から数値が動くことを仕様として許容する

#### 4.1 `paymentTotals` が後から動くケース

- 未会計 bill が後日初めて `settled` した場合
  - `bill.businessDate` 側の `paymentTotals` が後から増える
- `増額 + 追加徴収前` の bill を後日回収した場合
  - 元の売上帰属月 / 営業日側の `paymentTotals` が後から増える

#### 4.2 `paymentTotals` を直接減らさないケース

- `減額 + 返金済` や後日の refund cashAction が発生しても、`paymentTotals` は直接減らさない
- 返金は `cashflow` 側で表す

### 5. 現行実装から派生させる支払手段 source

今回のスコープでは、支払手段情報は **新しい専用 ledger を前提にせず、現行 `bills` 実装から派生させる**。

優先順位:

1. `/payments` が存在する場合はそれを使う
2. `/payments` が未整備なら `meta.paymentMethodsByAmount` を使う
3. それも使えない場合は `meta.paymentMethodsByCategory + categoryBreakdown` を fallback として使う
4. settle 後の read model / summary では `settlementSnapshot.paymentTotals` と `settlementSnapshot.paymentsSummary` を使う

補足:

- これは現行実装の `calculatePaymentTotals` / `calculatePaymentsSummary` の考え方を踏襲する
- 現行実装では、1 回の会計で複数の支払手段を金額配分付きで入力できるため、この source 群を使えば current-scope の支払手段配分は表現できる
- 今回の実装は **現行 `bills` と整合する形**で行い、`step3.11` の段階では支払手段 source の大改修を前提にしない

### 6. 実入出金データの扱い

- 実際にその月・その日に起きた現金等の受け渡しは、既存 top-level とは別責務に持つ
- 役割は次のように分ける
  - 既存 top-level: 売上帰属月ベースの売上分析
  - `cashActions`: 実入出金とその解消対象
- bill 親 doc は current state を軽く読むための summary を持つが、cashflow の正本にはしない

### 7. bill 側で current state と required action を読めるようにする

`analyticsMonthly` を SoT にしない代わりに、bill 親 doc で少なくとも次を読めるようにする。

- `currentSummary.claimTotalIncl`
- `currentSummary.receivedTotalIncl`
- `currentSummary.refundedTotalIncl`
- `postSettlementState.requiredActionType`
- `postSettlementState.requiredActionIncl`
- `postSettlementState.totalAdjustmentsIncl`
- `postSettlementState.totalCollectedIncl`
- `postSettlementState.totalRefundedIncl`

これらは current cycle の `baselineSnapshot`、`adjustments`、`cashActions` から導出される read-friendly field として扱う。

### 8. `analyticsMonthly` 更新入力の責務分担

#### 8.1 baseline 入力

通常会計時 / `reopen` 後再会計時は、次を baseline 入力として使う。

- `settlementCycles/{cycleNo}/baselineSnapshot`

#### 8.2 売上差分入力

会計後に請求内容が変わった時は、次を差分入力として使う。

- `settlementCycles/{cycleNo}/adjustments/{adjustmentId}`
- `adjustment.lines[]`

#### 8.3 実入出金入力

実際に返金 / 徴収が行われた時は、次を実入出金入力として使う。

- `settlementCycles/{cycleNo}/cashActions/{cashActionId}`
- `cashAction.allocations[]`
- `cashAction.methodBreakdown[]`

### 9. 4 パターンごとの current-scope 想定

| パターン | adjustment 作成時に売上差分更新 | 同時に cashflow 更新 | 後続 cashAction で cashflow 更新 | `paymentTotals` |
|---|---|---|---|---|
| `減額 + 返金済` | する | する | なし | 直接減らさない |
| `減額 + 返金前` | する | しない | refund cashAction 完了時にする | 直接減らさない |
| `増額 + 追加徴収済` | する | する | なし | この時点で増える |
| `増額 + 追加徴収前` | する | しない | collection cashAction 完了時にする | 回収完了時に増える |

### 10. `currentSettlementCycle` と `latestSettledCycle`

- `currentSettlementCycle`
  - 今の current state を組み立てる基準 cycle
- `latestSettledCycle`
  - 最後に baseline が存在する cycle

方針:

- 通常の adjustment / cashAction 完了では cycle は進めない
- `reopen` の時だけ `currentSettlementCycle` を進める
- `reopen` 後、再会計前は `currentSettlementCycle > latestSettledCycle` になりうる

### 11. 同一 cycle 内 sequence

同一 cycle 内で複数 adjustment / cashAction が発生するため、各 record は `sequenceNo` を持つ。

- 売上系 current state は `baselineSnapshot` に adjustment を `sequenceNo` 順で適用して考える
- cashflow 系 current state は `cashActions` を `sequenceNo` 順で追う
- 親 doc の current state は baseline + adjustments + cashActions の合成結果として更新する

### 12. `requiredActionRemainingIncl` と `allocations`

#### 12.1 `requiredActionRemainingIncl`

- 各 adjustment が、まだ未解消の required action をいくら持っているかを表す
- refund 系 adjustment なら「まだ返していない金額」
- collection 系 adjustment なら「まだ受け取っていない金額」

#### 12.2 `allocations`

- 各 cashAction が、どの adjustment をどれだけ解消したかを表す
- `cashAction.amountIncl` は `allocations[].amountIncl` の合計と一致する
- `allocations` は 1 件以上必須とする

### 13. 運用 read model がどこを読むか

一覧・管理画面・運用 read model は、次を正として読む。

- 親 doc の `currentSummary`
- 親 doc の `postSettlementState`
- 必要に応じて current cycle の `adjustments` と `cashActions`

`analyticsMonthly` は SoT ではなく、分析用 read model として維持する。

### 14. current-scope ではスコープ外とする future 機能

- 税務・会計用 `reportingEntries / reportingMonthly / cashflowMonthly` の厳密 schema
- クレカ後日入金・手数料
- 自社ポイント / 他社ポイントの treatment
- `/payments` の正式 ledger 化
- advisor review / period close

これらは [/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_今後検討_税務会計read_model拡張.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_今後検討_税務会計read_model拡張.md) に逃がす。

## 関連ドキュメント

- [11_事後イベントの機能と業務パターン.md](./11_事後イベントの機能と業務パターン.md)
- [13_billsのSoTと保存モデル.md](./13_billsのSoTと保存モデル.md)
- [14_status_summary_pending管理.md](./14_status_summary_pending管理.md)
- [/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_今後検討_税務会計read_model拡張.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_今後検討_税務会計read_model拡張.md)
