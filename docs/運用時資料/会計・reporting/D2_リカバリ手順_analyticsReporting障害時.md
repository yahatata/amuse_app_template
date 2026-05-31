# analytics / reporting 障害時リカバリ手順

## 1. この資料の対象範囲

この資料は、会計完了、会計後調整、後続徴収・返金、reopen のあとに、次のどれかが疑われるときの復旧手順です。

- `analyticsMonthly` に日次・月次の数字が反映されていない
- `reportingEntries` / `reportingMonthly` の反映が不完全に見える
- 整合性チェックが `warning` または `ng` を返した
- 月次 reporting を作り直したい

## 2. 先に押さえるべき前提

1. analytics と reporting は別系統です。
2. analytics は `analyticsMonthly/{YYYY-MM}` を更新します。
3. reporting は `reportingEntries/{entryId}` と `reportingMonthly/{YYYYMM}` を更新します。
4. analytics は `storeMeta/config.features.settlementAggregatorEnabled`、reporting は `storeMeta/config.features.reportingAggregatorEnabled` が `true` のときだけ書き込みます。
5. `billsOnSettle`、`createPostSettlementAdjustment`、`recordPostSettlementCashAction`、`reopenAccountedBill` は、本体の会計処理と集計処理を分けて実行します。したがって、会計自体は成功していても集計だけ失敗することがあります。

## 3. Cloud Logging での確認方法

### 3-1. まず見るべき関数

- settle / resettle: `billsOnSettle`
- 会計後 adjustment: `createPostSettlementAdjustment`
- 後続徴収 / 後続返金: `recordPostSettlementCollection`、`recordPostSettlementRefund`
- reopen: `reopenAccountedBill`
- reporting 月次再構築: `rebuildReportingMonthlyCallable`
- 整合性チェック: `analyticsDailyCheck`、`analyticsMonthlyCheck`、`reportingDailyCheck`、`reportingMonthlyCheck`

### 3-2. 代表的な検索クエリ例

Cloud Logging では、まず `jsonPayload.functionEntry` を軸に絞り込みます。たとえば次のように検索します。

- settle 反映を見る: `jsonPayload.functionEntry="billsOnSettle"`
- reopen の rollback を見る: `jsonPayload.functionEntry="reopenAccountedBill"`
- adjustment を見る: `jsonPayload.functionEntry="createPostSettlementAdjustment"`
- 後続徴収をみる: `jsonPayload.functionEntry="recordPostSettlementCollection"`
- 後続返金をみる: `jsonPayload.functionEntry="recordPostSettlementRefund"`
- reporting 月次再構築を見る: `jsonPayload.functionEntry="rebuildReportingMonthlyCallable"`
- 整合性チェック全体を見る: `jsonPayload.functionEntry=("analyticsDailyCheck" OR "analyticsMonthlyCheck" OR "reportingDailyCheck" OR "reportingMonthlyCheck")`

### 3-3. 追加で見るべきログ項目

`logOpsError` / `logOpsSuccess` では、主に次のフィールドを使います。

- `jsonPayload.functionEntry`: どの関数か
- `jsonPayload.operation`: callable / consistencyCheck などの種別
- `jsonPayload.message`: 成功・失敗メッセージ
- `jsonPayload.context`: billId、monthKey、adjustmentId などの補助情報
- `jsonPayload.errorMessage`: エラー本文
- `jsonPayload.errorName`: エラー種別
- `jsonPayload.errorKey`: カスタムエラー種別がある場合の識別子
- `jsonPayload.code`: config 読み取り失敗時の `CONFIG_FALLBACK` / `CONFIG_READ_ERROR`

### 3-4. 典型的な見方

1. 会計自体が成功したかを見る
   - `message` に `成功` が出ているかを確認します。
2. 集計処理まで進んだかを見る
   - `analyticsApplied`、`analyticsRollbackApplied`、`reportingWritten` などの文脈値を確認します。
3. どの単位で失敗したかを見る
   - `billId`、`adjustmentId`、`cashActionId`、`monthKey` を確認します。
4. config で意図的に止まっていないかを見る
   - `reportingAggregatorEnabled` / `settlementAggregatorEnabled` が `false` でないかを確認します。

## 4. `aggregationMarkers` を使った反映済み確認

### 4-1. analytics の marker

analytics 側は `analyticsMonthly/{YYYY-MM}/aggregationMarkers` に marker を残します。

主な marker 例:

- settle / resettle: `{billId}_cycle{cycleNo}_settle`
- adjustment: `adj_{adjustmentId}`
- cashAction: `cash_{cashActionId}`
- reopen rollback: `reopen_{billId}_cycle{oldCycleNo}`

### 4-2. analytics marker の見方

1. Firestore Console で `analyticsMonthly/{YYYY-MM}` を開きます。
2. サブコレクション `aggregationMarkers` を開きます。
3. 目的の billId / adjustmentId / cashActionId に対応する marker があるか確認します。
4. `processedAt` があれば、そのイベントは反映済みです。
5. marker があるのに集計値が不自然な場合は、二重反映ではなく計算元データの確認へ進みます。

### 4-3. reporting の marker

reporting 側は `reportingMonthly/{YYYYMM}/aggregationMarkers` に marker を残します。

- docId は `entries_{entryId}` です。
- `entryId` は `reportingEntries/{entryId}` と対応します。

### 4-4. reporting marker の見方

1. Firestore Console で `reportingMonthly/{YYYYMM}` を開きます。
2. サブコレクション `aggregationMarkers` を開きます。
3. `entries_{entryId}` があるか確認します。
4. `reportingEntries/{entryId}` が存在して marker がない場合は、月次集約だけ未反映の可能性があります。
5. その場合は `rebuildReportingMonthly` の対象です。

## 5. `rebuildReportingMonthly` の実行手順

### 5-1. 現行実装での注意

実コード確認時点では、Flutter の `admin_detail_settings_page` に `rebuildReportingMonthly` 専用ボタンはありません。Flutter 管理画面から実行できるのは、`reportingAggregatorEnabled` の切替、`initReportingConfig`、整合性チェック4種です。

そのため、`rebuildReportingMonthly` は現時点では管理者用の別クライアント、または callable 実行環境から呼ぶ前提で運用してください。

### 5-2. 実行時に必要な入力

- callable 名: `rebuildReportingMonthlyCallable`
- 引数: `monthKey`
- `monthKey` 形式: `YYYYMM`

例:

- 2026年5月を再構築する場合は `202605`

### 5-3. 実行後に確認すること

1. 戻り値の `success` が `true` になっていること
2. `totalEntriesProcessed` が 0 ではないこと（会計がある月の場合）
3. `reportingMonthly/{YYYYMM}` が更新されていること
4. `reportingMonthly/{YYYYMM}/aggregationMarkers` が作り直されていること
5. Cloud Logging に `rebuildReportingMonthly 成功` が出ていること

### 5-4. 使う場面

- `reportingEntries` は正しいが `reportingMonthly` がずれている
- `reportingMonthlyCheck` が marker 件数や totalAmount の不一致で `ng` を返した
- `taxReportingBehavior` を変更した
- `reportingAggregatorEnabled` を OFF で運用した期間のあとに、月次を改めて作り直したい

## 6. 整合性チェック callable 4種の実行手順と結果の読み方

整合性チェックの Flutter 管理画面は `詳細設定` です。画面には `整合性チェック` セクションがあり、各結果は SnackBar で表示されます。

### 6-1. `analyticsDailyCheck`

1. `詳細設定` を開きます。
2. `整合性チェック` セクションで `対象日（日次用）` を選びます。
3. `Analytics 日次チェック` を押します。
4. 実行中は `Analytics 日次 実行中...` と表示されます。
5. 完了後は `Analytics 日次: ok`、`Analytics 日次: warning（...）`、`Analytics 日次: ng（...）` の形で表示されます。

### 6-2. `analyticsMonthlyCheck`

1. `対象月（月次用）` を選びます。
2. `Analytics 月次チェック` を押します。
3. 実行中は `Analytics 月次 実行中...` と表示されます。
4. 完了後は `Analytics 月次: ok`、`warning`、`ng` の形で表示されます。

### 6-3. `reportingDailyCheck`

1. `対象日（日次用）` を選びます。
2. `Reporting 日次チェック` を押します。
3. 実行中は `Reporting 日次 実行中...` と表示されます。
4. 完了後は `Reporting 日次: ok`、`warning`、`ng` の形で表示されます。

### 6-4. `reportingMonthlyCheck`

1. `対象月（月次用）` を選びます。
2. `Reporting 月次チェック` を押します。
3. 実行中は `Reporting 月次 実行中...` と表示されます。
4. 完了後は `Reporting 月次: ok`、`warning`、`ng` の形で表示されます。

### 6-5. `ok` / `warning` / `ng` の読み方

| 結果 | 意味 | 基本対応 |
|---|---|---|
| `ok` | 想定どおり。差分なし | そのまま終了 |
| `warning` | 軽微な不一致、初回実行、遡及変更の可能性 | 詳細を確認して継続監視 |
| `ng` | 集計不整合の可能性が高い | 直ちに原因調査と復旧方針判断 |

## 7. `warning` / `ng` 時の対処フロー

### 7-1. `analyticsDailyCheck` が `warning` / `ng`

1. 対象日の `analyticsMonthly/{YYYY-MM}/days/{YYYY-MM-DD}` を確認します。
2. 同日の `bills` 件数と `orderCount` の差を見ます。
3. `billsOnSettle` のログで、その日の settle が skip されていないか確認します。
4. `aggregationMarkers` が不足している場合は、該当 bill の settle / reopen / cashAction ログを追います。
5. analytics には現時点で `rebuildReportingMonthly` 相当の月次再構築 callable はないため、原因が marker 欠落や trigger 不発ならエンジニア対応に切り替えます。

### 7-2. `analyticsMonthlyCheck` が `warning`

1. `checkE_retroactiveChange` だけなら、過去データの遡及更新があった可能性があります。
2. まず対象月の reopen、後続徴収、後続返金の履歴を確認します。
3. 意図した更新なら監視継続でよいです。
4. 意図しない更新ならエンジニアへ引き継ぎます。

### 7-3. `analyticsMonthlyCheck` が `ng`

1. `dailySales` 合計と `grossSales` の差を確認します。
2. `byCategory/summary`、`byUser`、`aggregationMarkers` の不足を見ます。
3. 直近の `createPostSettlementAdjustment`、`recordPostSettlementCashAction`、`reopenAccountedBill` のログを見ます。
4. 修復用の管理画面導線はないため、原則エンジニア対応です。

### 7-4. `reportingDailyCheck` が `warning`

1. `checkA_settleCount` の差が 1 件だけなら warning になる場合があります。
2. 直前デプロイや同日中の運用変更がないか確認します。
3. 翌営業日にも再実行して戻るかを確認します。
4. 続く場合は `billsOnSettle` と `reportingEntries` を照合します。

### 7-5. `reportingDailyCheck` が `ng`

1. `reportingEntries` の当日件数と、`bills` の `closedAt` 件数を確認します。
2. `reportingAggregatorEnabled` が OFF でなかったか確認します。
3. `reportingEntries` は正しいが `reportingMonthly` がずれているだけなら、月単位で `rebuildReportingMonthly` を実行します。
4. `reportingEntries` 自体が足りない場合は、月次再構築では直らないためエンジニア対応です。

### 7-6. `reportingMonthlyCheck` が `warning`

1. `checkE_retroactiveChange` だけなら、過去の reopen や cashAction が後から入った可能性があります。
2. 意図した履歴更新なら、その月を `rebuildReportingMonthly` で再構築します。
3. 再構築後に warning が消えるか確認します。

### 7-7. `reportingMonthlyCheck` が `ng`

1. `markerCount` と `entriesCount` が一致しているか見ます。
2. `totalAmountIncl`、`categoryBreakdown`、`paymentMethodBreakdown` のどこがずれているか確認します。
3. `reportingEntries` が正しい場合は `rebuildReportingMonthly` を実行します。
4. 再構築後も `ng` のままなら、entry 生成ロジックまたは過去データ不整合の可能性が高く、エンジニア対応です。

## 8. 「手動リカバリで対処可能」vs「コード修正が必要」の切り分け表

| 事象 | 手動リカバリで対処可能か | 基本方針 |
|---|---|---|
| `reportingEntries` は正しいが `reportingMonthly` がずれている | 可能 | `rebuildReportingMonthlyCallable` を実行 |
| `reportingMonthly` marker 件数だけずれている | 可能なことが多い | まず `rebuildReportingMonthlyCallable` |
| `analyticsMonthly` の marker が不足している | 原則不可 | bill / adjustment / cashAction / reopen の再処理設計確認が必要 |
| `billsOnSettle` が `contentHash matches, skipping update` で skip しているが内容が実際に変わっている | 原則不可 | 実装バグ・状態移行不備の可能性が高い |
| `reportingAggregatorEnabled` が OFF だっただけ | 可能 | 必要期間の `reportingMonthly` を再構築 |
| `settlementAggregatorEnabled` が OFF だっただけ | 限定的 | analytics 側は専用 rebuild 導線がないため、原則エンジニア判断 |
| `reportingEntries` 自体が存在しない / 欠けている | 原則不可 | entry 生成経路の調査が必要 |
| callable が毎回 `invalid-argument` / `failed-precondition` で落ちる | 不可 | 入力ミスでない限りコードまたはデータ前提の調査 |

## 9. 関連パス一覧

- analytics 月次: `analyticsMonthly/{YYYY-MM}`
- analytics 日次: `analyticsMonthly/{YYYY-MM}/days/{YYYY-MM-DD}`
- analytics marker: `analyticsMonthly/{YYYY-MM}/aggregationMarkers/{markerId}`
- reporting entry: `reportingEntries/{entryId}`
- reporting 月次: `reportingMonthly/{YYYYMM}`
- reporting marker: `reportingMonthly/{YYYYMM}/aggregationMarkers/entries_{entryId}`
- バッチログ親: `batchJobLogs/{jobKey}`
- バッチログ明細: `batchJobLogs/{jobKey}/executions/{executionId}`

## 10. 最後に見るべき順番

1. bill / adjustment / cashAction の実データ
2. 対応する Cloud Logging
3. `aggregationMarkers`
4. 整合性チェック結果
5. `reportingMonthly` の再構築可否
6. 手動復旧で足りないならエンジニア対応

この順番で見ると、原因が「本体処理」「集計処理」「月次集約」「設定ミス」のどこにあるかを切り分けやすくなります。
