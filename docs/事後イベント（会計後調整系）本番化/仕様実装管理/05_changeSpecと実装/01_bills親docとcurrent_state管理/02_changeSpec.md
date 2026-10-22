# 02_changeSpec

## 1. 目的

`bills/{billId}` 親 doc を、旧 root summary / `postEvents` / `closeSnapshot` 中心の構造から、仕様書で定めた **current state summary 契約**へ寄せる。

このステップでは、後続 step の土台として次を先に固定する。

- 親 doc の field グループ
- 親 doc の status contract
- 親 doc の summary 導出責務
- 会計開始 / 会計確定 / 会計取消 / 閉店持ち越し / 会計後イベント / reopen が、親 doc のどの field を更新するか

## 2. スコープ

### 対象

- 親 doc の field contract 導入
- `status` の current-scope contract 整理
- `settlementSnapshot`
- `currentSummary`
- `postSettlementState`
- `reopenSummary`
- `closeSummary`
- `ops`
- `draftAccountingInput`
- parent の required action 導出ルール導入

### 非対象

- `settlementCycles` 配下の exact schema
- `baselineSnapshot` の full body
- `adjustments` / `cashActions` の明細 schema
- `analyticsMonthly` の exact update formula
- strict tax / accounting read model

## 3. 変更対象

### 3.1 データ構造

追加 / 再編対象:
- `settlementSnapshot.*`
- `currentSummary.*`
- `postSettlementState.*`
- `reopenSummary.*`
- `closeSummary.*`
- `draftAccountingInput.*`

縮退または置換対象:
- `postEvents.*`
- `closeSnapshot.*`
- root 直置き `amounts / categoryBreakdown / paymentTotals / paymentsSummary / itemsSnapshot / tournamentsSnapshot / sideGameChipsSummary`

### 3.2 処理

更新責務の見直し対象:
- bill 作成
- 会計開始
- 会計取消
- 通常会計確定
- 閉店持ち越し付与
- 未会計解消後処理
- 会計後 adjustment / refund / reopen 反映

### 3.3 UI / API

影響対象:
- `accountingPage`
- `unsettledAccountingPage`
- post-accounting 系画面
- terminalHome 側の要対応導線

### 3.4 テスト

更新対象:
- bills 作成 / 会計開始 / 会計確定 / close process / post-event 関連の unit / trigger tests

## 4. AsIs -> ToBe

| 項目 | AsIs | ToBe |
|---|---|---|
| 未会計持ち越し | `closeSnapshot.*` | `closeSummary.*` |
| 会計後 summary | `postEvents.*` + `paymentsSummary.*` | `postSettlementState.*` + `currentSummary.*` |
| settle snapshot cache | root `amounts/categoryBreakdown/paymentTotals/paymentsSummary` | `settlementSnapshot.*` |
| 支払入力保持 | `meta.paymentMethodsBy*` | `draftAccountingInput.*` を target としつつ current-scope では source 再利用 |
| reopen / cycle summary | なし | `reopenSummary.*` |
| 要対応判定 | 旧画面ロジック / `closeSnapshot` / `paymentsSummary.balanceDueIncl` | `status` + `closeSummary` + `postSettlementState.requiredActionType` |

## 5. 実装方針

### 5.1 基本方針

- Step01 では、親 doc の target contract を先に導入する
- 旧 field を一気に削除せず、後続 step と同期しながら移行する
- current-scope では unreleased 前提のため、既存データ migration は行わない

### 5.2 推奨実装順

1. parent target field 群の型 / 更新責務を整理する
2. bill 作成 / 会計開始 / 会計取消の更新箇所を target contract に寄せる
3. settle 後 summary 生成ロジックを `settlementSnapshot/currentSummary/postSettlementState` ベースへ寄せる
4. close process を `closeSummary` ベースへ寄せる
5. 旧 UI / 旧 event 参照箇所を、後続 step で段階的に切り替える

### 5.3 既存 source の扱い

- `meta.paymentMethodsByAmount / meta.paymentMethodsByCategory` は current-scope では source として残す
- ただし parent doc の target 契約上は `draftAccountingInput` を導入する
- exact source priority は Step07 と整合させる

## 6. リスクと注意点

- `postEvents` と `closeSnapshot` を広く参照しているため、影響範囲が広い
- settle trigger の root field 更新をどう暫定共存させるかを丁寧に決める必要がある
- `status` の旧値 (`in_progress`, `partially_refunded`, `refunded`) の扱いを、後続 step の changeSpec と揃える必要がある
- parent contract 導入後、Step06 の一覧 query と Step07 の analytics source を同時に壊さないよう注意する

## 7. 実施チェック

- [x] 仕様書の field 群を changeSpec に落とせている
- [x] 旧 `postEvents / closeSnapshot / root summary` との差分を整理できている
- [x] 後続 step への依存を明記できている
- [x] unreleased 前提で migration 不要と整理できている

## 8. 完了判定メモ

- Step01 の current-scope として扱う `create / start / cancel / settle / close` の parent 更新は実装済み
- `adjustment / cashAction / reopen` 起点の exact parent 更新は、仕様書上は同一 contract に属するが、実装責務は Step03-05 に委譲している
- したがって Step01 の完了判定は、Step01 の主責務が閉じていること、および後続依存が `03_仕様書トレース確認.md` と `07_後続ステップへの伝達事項.md` に明記されていることをもって行う
