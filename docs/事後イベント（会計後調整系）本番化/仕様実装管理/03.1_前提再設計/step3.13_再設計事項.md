# step3.13_再設計事項

このファイルでは、step3.12 の確認で整合性が取れていないと分かった箇所について、再設計案を整理する。

主な対象候補:

- `settlementCycles` 配下の baseline 保存粒度
- `adjustments` / `cashActions` の責務分離
- `requiredActionRemainingIncl` と `cashActions.allocations` の更新ルール
- 親 doc の immutable snapshot / effective summary 分離
- 未会計 / 会計後要対応の共通導線と read model
- `analyticsMonthly` の売上系 / cashflow 系の役割分離
