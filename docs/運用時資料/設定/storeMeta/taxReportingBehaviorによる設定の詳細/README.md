# storeMeta/taxReportingBehavior による設定の詳細

## この設定の用途

`storeMeta/taxReportingBehavior` は、reporting の日付基準と月帰属ルールを管理する設定です。`analyticsMonthly` が `businessDate` 基準で集計するのに対し、reporting は `settledAt` や cashAction 実行時刻を基準にするため、このドキュメントで振る舞いを切り替えます。

## 初期化方法

このドキュメントは次の方法で作成されます。

1. callable `initReportingConfig` を実行する
2. または script `functions/src/domains/reporting/scripts/initReportingConfig.ts` を実行する

どちらも、未存在時のみ `storeMeta/taxReportingBehavior` と `storeMeta/reportingGroupConfig` を作成します。

## 手動変更する場合の注意

1. 設定変更後も、既存の `reportingEntries` は自動で作り直されません。
2. `reportingMonthly/{YYYYMM}` も自動再集計されません。
3. そのため、設定を手動で変更したら、必ず影響月に対して `rebuildReportingMonthlyCallable` を実行してください。
4. 特に `dateRule` や `reopenPolicy.reportingTreatment` を変えると、月帰属が変わるため再集計が必須です。

## このフォルダのファイル一覧

| ファイル | 内容 |
|---|---|
| `dateRule.md` | settle / cashAction / reopen の日付基準と月帰属ルール |

## 実装上の補足

- 読み取りロジックは `functions/src/domains/reporting/config/taxReportingBehaviorLoader.ts`
- 既定値は `functions/src/domains/reporting/config/defaults.ts`
- 実際の利用先は `functions/src/domains/reporting/services/entryBuilder.ts`
- 読み取り失敗時は defaults にフォールバックします
