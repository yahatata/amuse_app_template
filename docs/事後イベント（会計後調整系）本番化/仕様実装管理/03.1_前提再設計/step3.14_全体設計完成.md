# step3.14_全体設計完成

このファイルでは、step3.11 から step3.13 までで固めた内容を、実装に入る前提となる「全体設計」として統合する。

ここで完成させる対象:

- 4 パターン + `reopen` の業務定義
- `bills` / `settlementCycles` / `baselineSnapshot` / `adjustments` / `cashActions` / 未会計の全体構造
- 親 doc の `status` と summary の確定版
- `analyticsMonthly` 更新 matrix の確定版
- 複数 adjustment / cashAction 実行時の整合ルール
