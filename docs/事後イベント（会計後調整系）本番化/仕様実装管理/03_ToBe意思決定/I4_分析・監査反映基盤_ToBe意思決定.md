# I4_分析・監査反映基盤_ToBe意思決定

参照元:

- [../01_改修項目再編.md](../01_改修項目再編.md)
- [../02_AsIs/I4_分析・監査反映基盤_AsIs.md](../02_AsIs/I4_分析・監査反映基盤_AsIs.md)

## 1. このファイルの役割

本ファイルは、事後イベントを analytics と監査にどう反映するか、返金履歴をどの形で参照できるようにするか、trigger 失敗時の扱いをどうするかを決めるための作業ファイルである。

ここが曖昧なままだと、画面では変更後の数字が見えているのに、ダッシュボードや履歴が追いつかない状態が残る。

## 2. この項目の進め方

1. Codex が、集計・履歴・監査の論点を `どの処理`, `どのデータ`, `どの失敗系` に分けて整理する
2. 各論点について、技術的に固められるものと、運用判断が必要なものを分ける
3. 返金履歴、監査ログ、差分集計、再処理運用の方針を会話で確定する
4. 決定事項を本ファイルへ追記し、Step4 で API 仕様・監査仕様に落とせる状態にする

## 3. 今回フォーカスする論点

| 論点ID | フォーカスする問題 | 主な問題箇所 | 暫定判断区分 | 初期状態 |
|--------|--------------------|--------------|--------------|----------|
| I4-01 | 事後イベント後の analytics 差分反映が未実装 | `functions/src/domains/bills/triggers/billsEventsOnCreate.ts`, `docs/bills_migration/analytics_plan.md` | Codex 提案採用済み | 決定済み |
| I4-02 | `getRefundHistory` が空で、監査用途に使えない | `functions/src/domains/bills/callables/refundProcessing.ts`, `cashActions`, `adjustments` | Codex 提案採用済み | 決定済み |
| I4-03 | event trigger 失敗時に再処理導線がない | `billsEventsOnCreate.ts`, ログ運用, 監視運用 | ユーザー判断済み | 決定済み |
| I4-04 | refund method が自由文字列で、集計キーが揃わない | refund event schema, analytics 集計キー設計 | ユーザー判断済み | 決定済み |
| I4-05 | `adjustments / cashActions / reopen` を監査上どう見せるかが未確定 | 履歴 UI, 監査ログ, 履歴 API | ユーザー判断済み | 決定済み |
| I4-06 | `reopen` 時に analytics を差分減額で戻すか、確定計上のロールバックとして扱うかが未確定 | `billsEventsOnCreate.ts`, `billsOnSettle.ts`, `analytics_plan.md`, 月次/日次集計運用 | ユーザー判断済み | 決定済み |

## 4. chat で必ず整理する内容

各論点について、chat では次の内容を整理する。

1. 現状:
   - どの trigger / API / 資料に問題があるか
   - 今何が取れて、何が取れないか
2. 問題:
   - 集計がずれるのか
   - 監査で追えないのか
   - 失敗時に復旧できないのか
3. 判断主体:
   - Codex が設計できる実装方針か
   - ユーザーが決めるべき監査・運用ルールか
4. 改善案:
   - 差分集計方式
   - 履歴 API の構成
   - 再処理運用
5. 決定後の出口:
   - Step4 で analytics 仕様、履歴 API 仕様、失敗時運用を文章化できる状態にする

## 5. 決定記録

### 5.1 決定済み

- `I4-01`: `analyticsMonthly` は current-scope では運用ダッシュボード用 read model として扱い、SoT にはしない
- `I4-01`: baseline 反映は `baselineSnapshot`、売上差分反映は `adjustments / lines[]`、実入出金反映は `cashActions / allocations[] / methodBreakdown[]` を起点に行う
- `I4-01`: `analyticsMonthly` の売上系は `bill.businessDate` を基準に扱い、strict な税務・会計 read model は current-scope ではスコープ外とする
- `I4-01`: Step4 の仕様書と運用資料には、analytics がどのコレクションのどのフィールドをどの起点で更新するか、逆に何を current-scope 外とするかを明示する
- `I4-01`: card 後日入金、手数料、point treatment の厳密化、`reportingEntries / reportingMonthly / cashflowMonthly` は future 機能として別管理する
- `I4-02`: `getRefundHistory` はまず bill 単位の監査 API とし、データ源は current cycle の `cashActions` のうち `cashActionType = refund` を正とする
- `I4-02`: `getRefundHistory` は必要に応じて `allocations[]` をたどり、関連 adjustment の `reason` や line 情報を補助的に参照できる前提とする
- `I4-02`: `getRefundHistory` が返す最小項目は `cashActionId`, `executedAt`, `executedBy`, `cashflowBusinessDate`, `amountIncl`, `refundExecutionMethod`, `allocations` とする
- `I4-02`: `refund` 以外を含む汎用の監査時系列は `getRefundHistory` に混ぜず、bill 詳細用の post-settlement timeline として別仕様で扱う
- `I4-03`: analytics 反映失敗は bill 本体の post-settlement 処理をロールバックせず、`bills` 内の処理は完了させたうえで analytics 側だけを部分失敗として扱う
- `I4-03`: analytics 反映失敗時は既存の `logOpsError` 共通ルールに従う構造化ログで必ず検知可能にし、`functionEntry`, `operation`, `errorSource`, `service`, `context` を用いた監視対象とする
- `I4-03`: analytics 側には record 単位の再処理 callable を用意し、少なくとも `billId + adjustmentId` または `billId + cashActionId` 指定で未反映 record を再実行できるようにする
- `I4-03`: adjustment / cashAction には `analyticsSync` 相当の状態を持たせ、少なくとも `pending / processed / failed`, `lastAttemptAt`, `retryCount`, `lastErrorSummary` を追えるようにする
- `I4-03`: 再実行後も analytics へ反映できなかった場合は、`analyticsSync = failed` と構造化ログの両方で検知可能な状態を維持する
- `I4-03`: Step4 の仕様書と Step6 の実装検証では、検知方法、再処理手順、運用時の確認箇所を必ず運用資料へ反映する
- `I4-04`: refund の method 集計は 1 軸に潰さず、`refundExecutionMethod` と `sourceAllocations` の 2 軸で扱う
- `I4-04`: analytics / 監査では `refundsByExecutionMethod` と `refundAllocationsBySourceMethod` を別物として扱い、旧 `refundsByMethod` のような曖昧な意味の名前を正本仕様に残さない
- `I4-04`: `refundExecutionMethod` は I1 で決めた返金専用 enum（`cash`, `bank_transfer`, `card_reversal`, `other`）に限定する
- `I4-04`: `sourceAllocations` は元の支払内訳に拘束される返金元情報として扱い、ポイント/残高返還はこの金銭返金集計には混ぜない
- `I4-05`: bill 単位の監査表示は親 `status` の擬似表示ではなく、current cycle の `adjustments`、`cashActions`、`reopen` 履歴を正とした時系列タイムラインで表現する
- `I4-05`: タイムラインには `adjustment`, `cashAction`, `reopen` を含め、`createdAt / executedAt`, `createdBy / executedBy`, `reason`, `originBusinessDate`, `cashflowBusinessDate` を表示対象とする
- `I4-05`: current-scope では `voided` を独立監査状態として採用せず、必要な履歴は adjustment state や `reopen` 履歴で追えるようにする
- `I4-06`: `reopen` は analytics 上で「前回 settlement 分を rollback するイベント」として扱い、reopen 中は売上確定から一旦外す
- `I4-06`: `reopen` 後に再度 `settled` になったときは、その時点の最新 snapshot を新しい settlement cycle として再加算する
- `I4-06`: そのため analytics marker は bare な `billId` 固定ではなく、settlement cycle を識別できる単位へ見直し、`reopen -> resettle` で再集計できるようにする
- `I4-06`: Step4 の仕様書と運用資料には、`reopen` が「差分ゼロ」ではなく「rollback + 次回 resettle で再加算」であることを明記する

### 5.2 ユーザー判断待ち

- なし

### 5.3 Codex 側で整理して提案するもの

- なし

### 5.4 保留

- なし

## 6. Step4 に進める条件

- 事後イベント差分を analytics にどう反映するか決まっている
- 返金履歴 API または監査参照経路が決まっている
- trigger 失敗時の復旧または再処理方針が決まっている
- analytics 失敗を bill 処理と分離して検知・再処理する方針が決まっている
- refund method の監査・集計上のキー体系が決まっている
- `adjustments / cashActions / reopen` の履歴表示ルールが決まっている
- `reopen` 時に analytics を差分減額するか、ロールバック扱いにするかが決まっている
- analytics が反映する範囲と、現時点で考慮対象外とする範囲が明文化できる状態になっている
- 関連する運用資料へ何を追記するかが決まっている
