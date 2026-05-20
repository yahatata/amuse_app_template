# 14_analyticsMonthly反映確認

## 1. 対応範囲

- Step07 `analyticsMonthly更新と日付帰属とline配賦`

## 2. このファイルの役割

このファイルでは、今回の新 world で

- 通常 settle
- adjustment
- immediate / later cashAction
- reopen rollback
- reopen 後 resettle

が `analyticsMonthly` へどう反映されるかを確認する。

ここは UI だけでは閉じないので、**アプリ操作 + Firestore 目視 + 必要に応じて callable 実行**で確認する。

## 3. 参照元

- [04_仕様書/07_analyticsMonthly更新と日付帰属とline配賦.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/04_仕様書/07_analyticsMonthly更新と日付帰属とline配賦.md)
- [Step07 実機確認手順](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_changeSpecと実装/07_analyticsMonthly更新と日付帰属とline配賦/08_実機確認手順.md)
- 実装:
  - [applyAdjustmentToAnalytics.ts](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/functions/src/domains/analytics/services/applyAdjustmentToAnalytics.ts)
  - [applyCashActionToAnalytics.ts](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/functions/src/domains/analytics/services/applyCashActionToAnalytics.ts)
  - [applyReopenRollbackToAnalytics.ts](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/functions/src/domains/analytics/services/applyReopenRollbackToAnalytics.ts)

## 4. 事前準備

- `analyticsMonthly/{monthKey}` を確認できること
- `storeMeta/config.features.settlementAggregatorEnabled = true` を確認する
- できれば確認前の値をメモする
  - `grossSales`
  - `itemsSales`
  - `extraCostSales`
  - `paymentTotals.*`
  - `days/{businessDate}`
- `B-05A`〜`B-05E` のように analytics 専用 bill を分ける

## 5. 確認シナリオ

### シナリオ A: 通常 settle の baseline 反映

#### どこから入るか
- 通常会計導線

#### 何をするか
1. 新規 bill `B-05A` を作る
2. item / extra / tournament / chip を追加する
3. 通常会計を完了する
4. 対応する `monthKey` と `businessDate` を控える

#### Firestore で確認する場所
- `analyticsMonthly/{monthKey}`
- `analyticsMonthly/{monthKey}/days/{businessDate}`
- `analyticsMonthly/{monthKey}/byCategory/summary`
- `analyticsMonthly/{monthKey}/byUser/{userId}`
- `analyticsMonthly/{monthKey}/aggregationMarkers/{billId}_cycle1_settle`

#### 期待される Firestore 状態
- `grossSales` が増える
- category ごとの売上が増える
- `orderCount` が 1 増える
- `paymentTotals` が会計の支払方法配分分だけ増える
- `days/{businessDate}` に同様の増分が入る
- settle marker が作成される

#### このシナリオの完了判定
- baseline が analytics に一式反映される

---

### シナリオ B: adjustment line のみの反映

#### どこから入るか
- `createPostSettlementAdjustment` callable

#### 何をするか
1. settled bill `B-05B` を用意する
2. line 1 本だけの adjustment を作る
3. `monthKey` と `businessDate` を確認する

#### Firestore で確認する場所
- `analyticsMonthly/{monthKey}`
- `days/{businessDate}`
- `aggregationMarkers/adj_{adjustmentId}`

#### 期待される Firestore 状態
- `grossSales` が `lines[].amountInclDelta` 分だけ増減する
- 対応 category だけが増減する
- paymentTotals はこの時点では変わらない
- adjustment marker が作成される

#### このシナリオの完了判定
- line 差分が analytics にそのまま反映される

---

### シナリオ C: immediate collection / immediate refund の扱い

#### どこから入るか
- `createPostSettlementAdjustment` callable

#### 何をするか
1. `increase_collected` を実行する bill `B-05C1` を用意する
2. `decrease_refunded` を実行する bill `B-05C2` を用意する
3. それぞれ実行する

#### Firestore で確認する場所
- `analyticsMonthly/{monthKey}`
- `aggregationMarkers/adj_*`
- `aggregationMarkers/cash_*`

#### 期待される Firestore 状態
`increase_collected`:
- adjustment 差分が `grossSales` などに反映される
- collection cashAction により `paymentTotals.{method}` が増える
- `cash_{cashActionId}` marker が作成される

`decrease_refunded`:
- adjustment 差分は `grossSales` などに反映される
- refund cashAction では `paymentTotals` は減らない
- refund cashAction 用 marker は作成されない

#### このシナリオの完了判定
- collection と refund の analytics ルール差が守られている

---

### シナリオ D: later collection / later refund の反映

#### どこから入るか
- `要対応の会計` 画面 または callable 直接実行

#### 何をするか
1. collection pending bill `B-05D1` を用意する
2. refund pending bill `B-05D2` を用意する
3. 後続 collection を実行する
4. 後続 refund を実行する

#### Firestore で確認する場所
- `analyticsMonthly/{monthKey}`
- `aggregationMarkers/cash_*`

#### 期待される Firestore 状態
collection:
- `paymentTotals.{method}` が増える
- `grossSales` は増えない
- `cash_{cashActionId}` marker が作成される

refund:
- `paymentTotals` は不変
- refund 用 marker は作成されない

#### このシナリオの完了判定
- later cashAction でも collection / refund の扱いがぶれない

---

### シナリオ E: reopen rollback

#### どこから入るか
- reopen 実行前に settle + adjustment + collection まで済んでいる bill

#### 何をするか
1. bill `B-05E` を用意する
2. settle
3. adjustment
4. collection
5. reopen を実行する

#### Firestore で確認する場所
- `analyticsMonthly/{monthKey}`
- `aggregationMarkers/reopen_{billId}_cycle1`
- 既存 marker 群

#### 期待される Firestore 状態
- settle / adjustment / collection で積み上がっていた分が rollback される
- reopen rollback marker が作成される
- 過去の settle / adjustment / cash markers は audit 用に残る

#### このシナリオの完了判定
- reopen が analytics を元に戻せている

---

### シナリオ F: reopen 後 resettle

#### どこから入るか
- シナリオ E の bill

#### 何をするか
1. reopen 済み bill を再会計する
2. cycle2 settle を完了する

#### Firestore で確認する場所
- `analyticsMonthly/{monthKey}`
- `aggregationMarkers/{billId}_cycle2_settle`

#### 期待される Firestore 状態
- cycle2 settle 分が新たに反映される
- cycle1 marker と衝突しない
- `cycle2_settle` marker が作成される

#### このシナリオの完了判定
- cycle をまたいでも marker が衝突せず再集計できる

---

### シナリオ G: feature flag / idempotency / 失敗時挙動

#### どこから入るか
- config 変更 + callable 実行

#### 何をするか
1. 同一 request を 2 回送って idempotency を確認する
2. `settlementAggregatorEnabled = false` にして adjustment を実行する
3. 可能なら analytics 書き込み失敗を意図的に起こす

#### 期待される Firestore / ログ状態
- idempotency では analytics が 2 回反映されない
- feature flag OFF では main tx は成功し analytics は不変
- analytics 失敗時も callable 自体は成功し、エラーはログにだけ残る

#### このシナリオの完了判定
- Step07 の安全設計が守られている

## 6. このファイル全体の完了判定

このファイルは、次がすべて満たされたら完了とする。

1. settle baseline の反映を確認した
2. adjustment の line 差分反映を確認した
3. collection / refund の paymentTotals ルール差を確認した
4. reopen rollback を確認した
5. reopen 後 resettle を確認した
6. feature flag / idempotency / 失敗時挙動を確認した

## 7. 実施結果記録欄

- 実施日:
- 実施者:
- 対象環境:
- billId:
- 結果:
- 補足:
