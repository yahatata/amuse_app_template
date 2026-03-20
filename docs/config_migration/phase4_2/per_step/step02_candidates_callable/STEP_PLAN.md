# Step02: 対象データ抽出 Callable

## このステップで実装する内容の概要

- 計算候補 attendances を Functions 側で抽出し、属性1/2/3で返却する。
- UI側は抽出結果をそのまま表示できる形にする。

## 懸念・確定できていない仕様等（判断が必要）

- 属性2/3の最終判定条件（`payrollReflectedAt` 参照方法、未退勤の扱い境界）。
- 論理削除（期間内）を属性3に含める際の表示文言。
- 抽出結果の返却粒度（ページング要否、最大件数）。

## このステップで実装する内容全体の詳細

- 追加/変更候補:
  - `functions/src/domains/attendance/callables/getPayrollCandidates.ts`（新規）
  - `functions/src/domains/attendance/index.ts`（export追加）
  - `functions/__tests__/.../getPayrollCandidates.spec.ts`（新規）
- 仕様ポイント:
  - 入力: 対象期間の基準キー（または対象月）
  - 出力: `group1`, `group2`, `group3`, `reasons`, 集計プレビュー用メタ
  - 権限: adminのみ
- 完了条件:
  - 属性順（3->2->1）で返せる。
  - 未来のattendanceは返さない。
