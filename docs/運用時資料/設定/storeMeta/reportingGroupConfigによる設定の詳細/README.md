# storeMeta/reportingGroupConfig による設定の詳細

## この設定の用途

`storeMeta/reportingGroupConfig` は、将来の複数グループ対応に備えた基盤設定です。型定義上は `groups` 配列を持ち、各 group に次を持てます。

- `key`
- `label`
- `categoryKeys`

現時点では、reporting の主要ビジネスロジックはこの設定に強く依存していません。将来、カテゴリ群をまとめた上位集計や表示グループを導入する際の拡張ポイントとして置かれています。

## 初期化方法

次のどちらかで作成されます。

1. callable `initReportingConfig`
2. script `functions/src/domains/reporting/scripts/initReportingConfig.ts`

初期作成時は `groups: []` の空配列で作られます。

## 現状の参照状況

- 型定義: `functions/src/domains/reporting/types.ts`
- 初期化: `functions/src/domains/reporting/scripts/initReportingConfig.ts`、`functions/src/domains/reporting/callables/initReportingConfig.ts`
- 現時点の主要な settle / cashAction / reopen / rebuild ロジックでは限定的な利用にとどまっています。

つまり、今の本番運用では「必須ロジック」ではなく、「今後の集計グルーピング拡張用の土台」と理解してください。

## 変更時の注意事項

1. 現時点では主要処理の必須入力ではないため、安易に編集しないでください。
2. 将来この設定を参照する集計ロジックが追加された場合、既存 `reportingMonthly` の見え方が変わる可能性があります。
3. グループ仕様を拡張したあとは、`reportingEntries` の解釈ルールと `reportingMonthly` の表示側を合わせて確認してください。
4. 運用ルールとしては、仕様変更時にあわせて関連月を `rebuildReportingMonthlyCallable` で再集計できる状態にしてから適用するのが安全です。
