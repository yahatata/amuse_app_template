# Step01: 基盤・設定整備

## このステップで実装する内容の概要

- 給与期間計算（`payroll.startDay/endDay`）の共通ロジックを整備。
- `payrollConfig` の型・取得・初期化を追加。
- 以降のステップで使う共通前提（SSOT、権限、書き込み経路）を固定。

## 懸念・確定できていない仕様等（判断が必要）

- `payrollConfig` を `storeMeta/payrollConfig` 別docにするか、`storeMeta/config` 拡張にするか。
- `paymentDate` の運用（固定日か都度更新か）の方針。
- 計算可能期間の導出ロジック（端点含む/含まない、JST境界）の最終定義。

## このステップで実装する内容全体の詳細

- 追加/変更候補:
  - `functions/src/domains/attendance/helpers/payrollPeriodUtils.ts`（新規）
  - `functions/src/shared/config/types.ts`（`payrollConfig` 型追加）
  - `functions/src/shared/config/configLoader.ts` or `payrollConfigLoader.ts`（取得ロジック）
  - `functions/src/domains/storeMeta/callables/initializeStoreConfigCallable.ts`（初期化）
  - `functions/__tests__/...`（期間計算・ローダー単体テスト）
- 完了条件:
  - endDay≠0 の期間計算がテストで保証される。
  - `payrollConfig` が未設定時でも安全に既定値で動く。
