# step3.15_詳細仕様書の分割方針

## このファイルの役割

本ファイルは、`03.1_前提再設計` で GO まで進めた内容を、`04_仕様書/` でどの粒度に分けて詳細仕様書化するかを定める。

ここでは、**理解用の Block A / B / C** と、**実装用の詳細仕様書** を明確に分ける。

## 入力として使う正本

優先順位:

1. `step3.12_全体整合性確認/`
2. `step3.11_未決論点の再決定/`
3. `step3.14_全体設計完成.md`
4. `03_ToBe意思決定/` の同期済み docs

補足:

- `03.1` の 3.11 / 3.12 が、現時点で最も信頼できる正本である
- `02_AsIs` は historical record なので、新仕様の正本にしない

## なぜ Block A / B / C をそのまま仕様書にしないか

Block A / B / C は、**論点整理と合意形成**の単位として優秀である。  
一方で実装は、**保存モデル / Callable / Trigger / UI / 集計責務** の境界で切った方が changeSpec と 1:1 にしやすい。

例:

- `reopen` は Block A / B / C を横断する
- `analyticsMonthly` は Block C の話だが、実装では adjustments / cashActions と強く依存する

そのため、詳細仕様書は **更新責務単位** に再分割する。

## 採用する分割

`04_仕様書/` では、次の 7 本を正とする。

1. `01_bills親docとcurrent_state管理.md`
2. `02_settlementCyclesとbaselineSnapshot.md`
3. `03_adjustments管理.md`
4. `04_cashActions管理.md`
5. `05_reopenと再会計.md`
6. `06_要対応の会計画面と一覧取得.md`
7. `07_analyticsMonthly更新と日付帰属とline配賦.md`

## 各仕様書の責務境界

### 01. bills親docとcurrent_state管理

扱う責務:

- 親 doc
- `status`
- `currentSummary`
- `postSettlementState`
- `reopenSummary`
- `closeSummary`

### 02. settlementCyclesとbaselineSnapshot

扱う責務:

- cycle 作成 / 切替
- `currentSettlementCycle`
- `latestSettledCycle`
- `baselineSnapshot`
- `baselineSummary`

### 03. adjustments管理

扱う責務:

- 4 パターンの adjustment
- `lines[]`
- `requiredActionRemainingIncl`
- opposite-direction 内部相殺

### 04. cashActions管理

扱う責務:

- `cashActions`
- `allocations[]`
- `methodBreakdown[]`
- refund / collection 実行反映

### 05. reopenと再会計

扱う責務:

- `reopen`
- old cycle close
- new cycle open
- resettle
- rollback / 再反映責務

### 06. 要対応の会計画面と一覧取得

扱う責務:

- `terminalHome` 入口
- `要対応の会計`
- `日付ごと / ユーザー別`
- `すべて / 未会計 / 追加徴収 / 要返金`
- 一覧 view model / query 条件

### 07. analyticsMonthly更新と日付帰属とline配賦

扱う責務:

- `analyticsMonthly`
- 3 つの日付軸
- 支払手段 source 優先順位
- `lines[]` の category / user / tournament 配賦
- future 機能の明示

## changeSpec 対応

各仕様書は、原則として 1 本の changeSpec に対応させる。

推奨 changeSpec 名:

- `CS01_bills親docとcurrent_state管理`
- `CS02_settlementCyclesとbaselineSnapshot`
- `CS03_adjustments管理`
- `CS04_cashActions管理`
- `CS05_reopenと再会計`
- `CS06_要対応の会計画面と一覧取得`
- `CS07_analyticsMonthly更新と日付帰属とline配賦`

## 実装順

依存順の推奨:

1. `01_bills親docとcurrent_state管理`
2. `02_settlementCyclesとbaselineSnapshot`
3. `03_adjustments管理`
4. `04_cashActions管理`
5. `05_reopenと再会計`
6. `06_要対応の会計画面と一覧取得`
7. `07_analyticsMonthly更新と日付帰属とline配賦`

理由:

- 先に保存モデルと current state を固める
- その上に差分と実入出金を積む
- その後 UI を載せる
- 最後に read model 更新と日付帰属を確定する

## 各仕様書に必ず入れる章

1. 役割
2. スコープ
3. 非対象
4. 参照元
5. 更新対象 / 入力
6. 処理フロー
7. 整合条件
8. 画面 / API 影響
9. 不可条件
10. テスト観点

## current-scope を守るためのルール

- strict な税務・会計 read model を詳細仕様書へ混ぜない
- product-level analytics を今ここで増やさない
- existing `bills` 実装と整合しない source 前提を持ち込まない
- future 機能は `05_今後検討_税務会計read_model拡張.md` に逃がす
