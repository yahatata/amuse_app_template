# 04_仕様書 README

## このフォルダの役割

このディレクトリは、`Step4` で実装に着手するための**詳細仕様書の正本**を置く場所である。

ここに置く仕様書は、単なる論点メモではなく、**changeSpec を 1 本ずつ作成し、コード更新へ落とし込める粒度**で分割する。

## 正本と参照優先順位

本フォルダの仕様書は、次の優先順位で参照する。

1. `../03.1_前提再設計/step3.12_全体整合性確認/`
   - Block A / B / C の GO 判定結果
2. `../03.1_前提再設計/step3.11_未決論点の再決定/`
   - 個別論点ごとの確定仕様
3. `../03.1_前提再設計/step3.15_詳細仕様書の分割方針.md`
   - 本フォルダの分割理由と責務境界
4. `../03.1_前提再設計/step3.16_詳細仕様書作成.md`
   - 詳細仕様書作成時の記載方針
5. `../03_ToBe意思決定/`
   - 3.11 / 3.12 と同期済みの補助資料

補足:

- `03.1_前提再設計` の 3.11 / 3.12 が、現時点では最も新しく、最も信頼できる判断記録である
- `02_AsIs` は historical record として残し、ここから新仕様を逆流させて上書きしない
- `03_ToBe意思決定` は同期対象だが、矛盾時は 3.11 / 3.12 を優先する

## このフォルダの読み方

実装は、次の順に進めることを推奨する。

1. `01_bills親docとcurrent_state管理.md`
2. `02_settlementCyclesとbaselineSnapshot.md`
3. `03_adjustments管理.md`
4. `04_cashActions管理.md`
5. `05_reopenと再会計.md`
6. `06_要対応の会計画面と一覧取得.md`
7. `07_analyticsMonthly更新と日付帰属とline配賦.md`

この順は、**保存モデルの土台 → 差分と実入出金 → 画面 → 集計**の依存順になっている。

## current-scope と future の境界

このフォルダでは、current-scope に含めるものだけを仕様化する。

current-scope に含めないもの:

- strict な税務・会計 read model の本実装
- `reportingEntries / reportingMonthly / cashflowMonthly`
- card 後日入金 / fee の厳密管理
- point treatment の厳密化
- product-level analytics
- advisor review / period close

これらは `../05_今後検討_税務会計read_model拡張.md` で継続管理する。

## 仕様書一覧

### 01. bills親docとcurrent_state管理

対象:

- 親 doc の責務
- `status`
- `currentSummary`
- `postSettlementState`
- `reopenSummary`
- `closeSummary`

対応する changeSpec 推奨名:

- `CS01_bills親docとcurrent_state管理`

### 02. settlementCyclesとbaselineSnapshot

対象:

- `settlementCycles/{cycleNo}`
- `currentSettlementCycle`
- `latestSettledCycle`
- `baselineSnapshot`
- baseline 確定と cycle 切替

対応する changeSpec 推奨名:

- `CS02_settlementCyclesとbaselineSnapshot`

### 03. adjustments管理

対象:

- 4 パターンの adjustment
- `adjustmentState`
- `requiredActionRemainingIncl`
- `lines[]`
- opposite-direction の内部相殺

対応する changeSpec 推奨名:

- `CS03_adjustments管理`

### 04. cashActions管理

対象:

- `cashActions/{cashActionId}`
- `allocations[]`
- `methodBreakdown[]`
- refund / collection 実行反映

対応する changeSpec 推奨名:

- `CS04_cashActions管理`

### 05. reopenと再会計

対象:

- `reopen`
- old cycle の閉じ方
- new cycle の開き方
- resettle
- rollback / 再反映責務

対応する changeSpec 推奨名:

- `CS05_reopenと再会計`

### 06. 要対応の会計画面と一覧取得

対象:

- `terminalHome` 入口
- `要対応の会計`
- `日付ごと / ユーザー別`
- `すべて / 未会計 / 追加徴収 / 要返金`
- view model / query 条件

対応する changeSpec 推奨名:

- `CS06_要対応の会計画面と一覧取得`

### 07. analyticsMonthly更新と日付帰属とline配賦

対象:

- `analyticsMonthly`
- 3 つの日付軸
- 支払手段 source の読み順
- `adjustments.lines[]` からの配賦

対応する changeSpec 推奨名:

- `CS07_analyticsMonthly更新と日付帰属とline配賦`

## 各仕様書の最低記載項目

各仕様書では、少なくとも次をそろえる。

1. 役割
2. スコープ
3. 非対象
4. 入力 / 参照元
5. 更新対象
6. 処理フロー
7. 整合条件
8. 画面 / API 影響
9. エラー / 不可条件
10. テスト観点

## 実装時の注意

- 仕様書ごとに changeSpec を 1 本作成する
- 仕様書を跨ぐ大きな実装を先に始めず、依存順に進める
- 実装時に旧 `03_ToBe意思決定` と矛盾を見つけた場合は、まず `03.1_前提再設計` と本フォルダを確認する
- field 名の微調整が発生しても、責務境界を崩さない
