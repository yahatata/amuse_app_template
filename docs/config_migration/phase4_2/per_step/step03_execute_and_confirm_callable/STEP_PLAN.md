# Step03: 計算実行・確定 Callable

## このステップで実装する内容の概要

- 選択 `attendanceIds` を受けて給与計算を実行。
- `monthlyPayroll/{paymentPeriodKey}/payrollRuns/{runId}` へ保存。
- 確定操作で再計算不可にし、正式runを確定。

## 懸念・確定できていない仕様等（判断が必要）

- `payrollReflectedAt` の再計算時クリア方式（厳密差分更新 or 上書き運用）。
- `status` 遷移の最終セット（draft/confirmed/paid/hold 等）。
- run肥大化時の分割方針（必要なら staffResults の分離）。

## このステップで実装する内容全体の詳細

- 追加/変更候補:
  - `functions/src/domains/attendance/callables/executeMonthlyPayroll.ts`（新規）
  - `functions/src/domains/attendance/callables/confirmPayrollRun.ts`（新規）
  - `functions/src/domains/attendance/helpers/runMonthlyPayrollLogic.ts`（新規）
  - `functions/src/domains/attendance/index.ts`（export追加）
  - `functions/__tests__/.../executeMonthlyPayroll.spec.ts`（新規）
  - `functions/__tests__/.../confirmPayrollRun.spec.ts`（新規）
- ログ:
  - 計算実行: `monthly_payroll_reflect`
  - 確定: `payroll_confirmed`
- 完了条件:
  - 確定後に同期間再計算を拒否。
  - 0円staffは作成されない（attendance起点）。
