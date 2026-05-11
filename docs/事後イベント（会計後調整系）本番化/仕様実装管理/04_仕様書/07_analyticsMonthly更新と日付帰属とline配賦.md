# 07_analyticsMonthly更新と日付帰属とline配賦

## 1. 役割

本仕様書は、current-scope における `analyticsMonthly` の役割、売上 / adjustment / cashflow の 3 日付軸、支払手段 source の読み順、`adjustments.lines[]` からの配賦ルールを定める。

## 2. スコープ

本仕様書で扱う対象:

- `analyticsMonthly` の役割
- `bill.businessDate`
- `adjustment.createdAt`
- `cashAction.executedAt`
- 支払手段 source の優先順位
- `paymentTotals` の意味
- `adjustments.lines[]` の category / user / tournament 反映ルール
- future 機能の明示

## 3. 非対象

本仕様書では次を扱わない。

- strict な税務 / 会計 read model の本実装
- `reportingEntries / reportingMonthly / cashflowMonthly`
- card 後日入金 / fee 管理
- point treatment の厳密判定
- product-level analytics
- advisor review / period close

## 4. 参照元

- `../03.1_前提再設計/step3.11_未決論点の再決定/12_analyticsMonthlyと入出金データの役割分担.md`
- `../03.1_前提再設計/step3.11_未決論点の再決定/15_売上日入出金日営業日の帰属ルール.md`
- `../03.1_前提再設計/step3.11_未決論点の再決定/18_売上差分明細の粒度と配賦ルール.md`
- `../03.1_前提再設計/step3.12_全体整合性確認/blockC_集計と日付軸/01_決定事項総覧.md`
- `../05_今後検討_税務会計read_model拡張.md`

## 5. `analyticsMonthly` の current-scope 位置づけ

### 5.1 役割

`analyticsMonthly` は **運用ダッシュボード用 read model** とする。

### 5.2 SoT ではない

SoT は `bills / settlementCycles / baselineSnapshot / adjustments / cashActions` とし、`analyticsMonthly` を正本にしない。

### 5.3 主用途

- 売上傾向確認
- 日別推移確認
- category 別分析
- user 別傾向
- tournament template 別傾向

## 6. 3 つの日付軸

### 6.1 売上帰属日

- `bill.businessDate`
- 元売上がどの営業日に属するかを表す

### 6.2 adjustment 確定日

- `adjustment.createdAt`
- 売上差分がいつ確定したかを表す

### 6.3 cashflow 実行日

- `cashAction.executedAt`
- 実際に返金 / 徴収した日時を表す
- 営業日が必要なら `cashAction.cashflowBusinessDate` を併用する

## 7. `analyticsMonthly` が使う日付

### 7.1 売上系

current-scope では、売上系集計は `bill.businessDate` ベースで扱う。

対象:

- `grossSales`
- `itemsSales`
- `extraCostSales`
- `sideGameChipSales`
- `tournamentsSales`
- `dailySales`
- `orderCount`
- `paymentTotals`

補足:

- `adjustment.createdAt` は adjustment 確定日の audit 軸として持つ
- `cashAction.executedAt` は cashflow 実行日の audit 軸として持つ
- ただし current-scope の `analyticsMonthly.days` を更新する日付キーとしては使わない

### 7.2 cashflow 系

実入出金は既存 top-level に直接混ぜず、`cashActions` 起点の別責務として扱う。

## 8. `paymentTotals` の意味

### 8.1 current-scope の意味

`paymentTotals` は、**売上帰属月ベースの受領方法配分**である。

### 8.2 意味しないもの

- 実際にその月に現金が何円動いたか
- card の後日入金額
- 手数料控除後の net 入金額

### 8.3 仕様として許容すること

後日回収により、元売上帰属月側の `paymentTotals` が後から増えることを許容する。

### 8.4 直接減らさないこと

refund により `paymentTotals` を直接減らさない。返金は cashflow 側で表す。

## 9. 支払手段 source の優先順位

current-scope では、支払手段情報は現行 `bills` 実装から派生できる source を使う。

### 9.1 更新時 source

会計入力や settle / adjustment / cashAction の更新処理で、その時点の受領方法配分を読む時は次を優先する。

1. `/payments`
2. `meta.paymentMethodsByAmount`
3. `meta.paymentMethodsByCategory + categoryBreakdown`

### 9.2 settle 後 / 参照時 source

settle 後の baseline summary や、既に確定済み cycle を軽く読む用途では次を優先する。

1. `settlementSnapshot.paymentTotals / paymentsSummary`
2. 必要に応じて `baselineSnapshot.paymentTotals / paymentsSummary`
3. 上が存在しない場合のみ current live source を fallback 参照する

補足:

- 現行実装では 1 回の会計で複数手段を金額配分付きで持てる
- current-scope では、この source 群を使えば必要な受領方法配分を表現できる
- 支払手段周りの大改修は前提にしない

## 10. 更新責務

### 10.1 settle / resettle

入力:

- `baselineSnapshot`
- 必要に応じて `settlementSnapshot.paymentTotals / paymentsSummary`

更新責務:

- baseline 売上を `analyticsMonthly` に反映

### 10.2 adjustment 作成時

入力:

- `adjustments/{adjustmentId}`
- `adjustment.lines[]`

更新責務:

- 売上差分を `analyticsMonthly` に反映

### 10.3 cashAction 実行時

入力:

- `cashActions/{cashActionId}`
- `cashAction.allocations[]`
- `cashAction.methodBreakdown[]`

更新責務:

- 実入出金を反映
- collection 系では必要に応じて `paymentTotals` を増やす

## 11. 4 パターン別の更新 matrix

| パターン | adjustment 作成時に売上差分更新 | 同時 cashflow 更新 | 後続 cashAction で cashflow 更新 | `paymentTotals` |
|---|---|---|---|---|
| `減額 + 返金済` | する | する | なし | 直接減らさない |
| `減額 + 返金前` | する | しない | refund 完了時にする | 直接減らさない |
| `増額 + 追加徴収済` | する | する | なし | この時点で増える |
| `増額 + 追加徴収前` | する | しない | collection 完了時にする | 回収完了時に増える |

## 12. `adjustments.lines[]` の current-scope 粒度

### 12.1 必須

`lines[]` は必須。line-less adjustment は current-scope では不可。

### 12.2 `targetCategory`

- `item`
- `extra`
- `tournament`
- `sideGameChip`

### 12.3 tournament の追加粒度

`tournament` は次まで持つ。

- template 単位
- `entry / reentry / addon` 単位

## 13. `byCategory` への配賦

- `item` → `items`
- `extra` → `extraCost`
- `sideGameChip` → `sideGameChip`
- `tournament` → `tournaments`

## 14. top-level / days への配賦

### 14.1 top-level

- `grossSales` = 全 line 合計
- `itemsSales` = item line 合計
- `extraCostSales` = extra line 合計
- `sideGameChipSales` = sideGameChip line 合計
- `tournamentsSales` = tournament line 合計

### 14.2 `days`

- current-scope では、adjustment による売上差分も **`bill.businessDate` の day bucket** に加算する
- `adjustment.createdAt` ベースの別 day bucket は作らない
- したがって `days` は、運用上「元売上がどの日の売上として見えるか」を維持するための配列とみなす

## 15. `byUser` への配賦

- `bill.party.userId` がある場合のみ更新する
- line ごとに user を変えない
- その bill の所有 user に category 差分を配賦する
- `userId` がない bill は `byUser` 更新しない

## 16. `byTemplateTournaments` への配賦

- `targetCategory = tournament` の line のみ対象
- `targetId` を template key / id として使う
- `operationType` ごとに
  - `entryCount / entrySales`
  - `reentryCount / reentrySales`
  - `addonCount / addonSales`
  を更新する
- `totalTournamentSales` は tournament line 合計で更新する

## 17. current-scope でスコープ外とする future 機能

本仕様書では、次を **current-scope ではスコープ外とする future 機能**として明示する。

- `reportingEntries / reportingMonthly / cashflowMonthly` の本実装
- strict な税務 / 会計 read model
- card 後日入金 / fee の厳密管理
- point treatment の厳密判定
- product-level analytics 新設
- advisor review / period close

これらは `../05_今後検討_税務会計read_model拡張.md` で管理する。

## 18. 整合条件

1. `analyticsMonthly` は SoT ではない
2. 売上系日付軸は `bill.businessDate` を正とする
3. `sum(lines[].amountInclDelta) = adjustment.adjustmentAmountIncl`
4. tournament line は current-scope で template / operationType を持つ
5. 支払手段 source は現行 `bills` 実装から派生できるものに限定する

## 19. 不可条件

- `analyticsMonthly` を current state 正本にしない
- card 後日入金や fee を current-scope に混ぜない
- product-level analytics を今回追加しない
- generic line だけで category を特定できない adjustment を許可しない

## 20. テスト観点

1. settle 時に baseline 売上が `analyticsMonthly` に反映される
2. adjustment line に応じて category / days / user / tournament が更新される
3. refund で `paymentTotals` を直接減らさない
4. collection 完了で `paymentTotals` が増えるパターンが正しく動く
5. 複数支払手段入力から受領方法配分を復元できる
