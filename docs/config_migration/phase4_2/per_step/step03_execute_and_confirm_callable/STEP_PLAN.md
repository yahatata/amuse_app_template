# Step03: 計算実行・確定 Callable

## このステップで実装する内容の概要

- 選択 `attendanceIds` を受けて給与計算を実行。
- `monthlyPayroll/{paymentPeriodKey}/payrollRuns/{runId}` へ保存。
- 確定操作で再計算不可にし、正式runを確定。

## 懸念・確定できていない仕様等（判断が必要）

- `payrollReflectedAt` の再計算時クリア方式（厳密差分更新 or 上書き運用）。
- `status` 遷移の最終セット（draft/confirmed/paid/hold 等）。
- run肥大化時の分割方針（必要なら staffResults の分離）。
- **[GAP-3]** 異常値チェックの Callable 側実装範囲: 計算実行時に Callable が `expectedRange` との比較を行い、`anomalyFlags`（フラグ）を payrollRun に保存するか、またはレスポンスに含めて返すか。仕様確定時に「Callable側でフラグ生成 → UI（Step05）で表示」の分担として確定する。
- **[GAP-6]** Callable のエラーケース定義: 下記の主要エラーを仕様確定時に網羅する。

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
- **[GAP-3]** 異常値チェック:
  - `executeMonthlyPayroll` 内で `payrollConfig.expectedRange` と計算結果を比較し、`anomalyFlags` を生成する。
  - `anomalyFlags` は payrollRun ドキュメントに保存し、かつレスポンスにも含めて返す（UI側 Step05 での表示に使用）。
- **[GAP-6]** 主要エラーケース（仕様確定時に網羅して定義する）:
  - `permission-denied`: admin 以外の呼び出し
  - `already-confirmed`: 対象期間が確定済みで再計算不可
  - `invalid-period`: 計算対象期間が特定できない（payroll設定不正）
  - `no-attendance-selected`: attendanceIds が空配列
  - `payroll-config-not-found`: payrollConfig が未設定
- 完了条件:
  - 確定後に同期間再計算を拒否。
  - 0円staffは作成されない（attendance起点）。
  - **[GAP-3]** 計算実行時に `anomalyFlags` が生成され、payrollRun に保存される。
  - **[GAP-6]** 主要エラーケースがテストで検証されている。
