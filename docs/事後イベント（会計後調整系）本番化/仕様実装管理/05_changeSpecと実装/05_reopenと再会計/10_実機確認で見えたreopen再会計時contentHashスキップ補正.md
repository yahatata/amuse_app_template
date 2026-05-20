# reopen 後の再会計で contentHash 一致スキップが起きる件の補正

## 背景
Step13 の実機確認で、`reopenAccountedBill` 実行後に同一内容で再会計した bill に対して、`completeAccountingV2` は成功しているにもかかわらず `settlementCycles/2` が `settled` 化されず、`baselineSnapshot/snapshot` も生成されない事象が確認された。

Cloud Logging では `billsOnSettle` が発火しており、次のログが残っていた。

- `billsOnSettle triggered`
- `billsOnSettle: contentHash matches, skipping update`
- `billsOnSettle 成功（contentHash 一致スキップ）`

## 原因整理
再会計時の内容が reopen 前の settle 内容と同一だと、新たに計算した `contentHash` が reopen 前の `meta.contentHash` と一致する。

現行の `billsOnSettle` は `afterData.meta.contentHash === recalculatedContentHash` のとき、cycle 更新を含む全更新をスキップする。

しかし reopen 後は「前回 settle 履歴」と「現在 open な current cycle」を分けて扱う必要があるため、`meta.contentHash` を reopen 前の値のまま保持すると、再会計時に

- `currentSummary`
- `reopenSummary.latestSettledCycle`
- `settlementCycles/{currentCycle}`
- `baselineSnapshot/snapshot`

の更新が抑止されてしまう。

## 今回の方針
reopen は「未会計に戻す」操作として扱う。したがって、親 doc では次を reset する。

- `status = 'open'`
- `currentSummary`
- `postSettlementState`
- `reopenSummary` 更新
- `ops` を初期値へ戻す
- `draftAccountingInput` を初期値へ戻す
- `meta.contentHash = null`

## 期待する効果
1. reopen 後の bill は backend 的にも `会計前` の状態になる
2. 再会計時は必ず `startAccounting` を経由する
3. reopen 前と同一内容で再会計しても `billsOnSettle` が skip せず、`settlementCycles/2` が `settled` 化される
4. `baselineSnapshot/snapshot` が cycle2 配下に新規作成される

## 変更対象
- `functions/src/domains/bills/services/parentSummary.ts`
- `functions/__tests__/helpers/billsApi/parentSummary.reopen.spec.ts`
- `functions/__tests__/callables/reopenAccountedBill.spec.ts`

必要に応じて `13_reopenと再会計確認.md` にも実機確認観点を追記する。
