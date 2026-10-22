# Step02: 対象データ抽出 Callable

## このステップで実装する内容の概要

- 計算候補 attendances を Functions 側で抽出し、属性1/2/3で返却する。
- UI側は抽出結果をそのまま表示できる形にする。

## 懸念・確定できていない仕様等（判断が必要）

- 属性2/3の最終判定条件（`payrollReflectedAt` 参照方法、未退勤の扱い境界）。
- 論理削除（期間内）を属性3に含める際の表示文言。
- 抽出結果の返却粒度（ページング要否、最大件数）。
- **[GAP-1]** `reasons` フィールドの判定ロジック: 各 attendance に付与する理由種別（`out_of_period` / `not_reflected` / `other`）をどの条件で振り分けるか。仕様確定時に `payrollReflectedAt` の有無・未退勤フラグ・期間内外の組み合わせを判定表として定義する。
- **[GAP-2]** 集計プレビューメタ（件数・合計時間・概算金額）の計算方式: Callable 側で集計して返すか、UI（Flutter）側がレスポンスからローカル集計するかを選択する。Callable 側で計算して返す方が SSOT を維持しやすい（推奨）。

## このステップで実装する内容全体の詳細

- 追加/変更候補:
  - `functions/src/domains/attendance/callables/getPayrollCandidates.ts`（新規）
  - `functions/src/domains/attendance/index.ts`（export追加）
  - `functions/__tests__/.../getPayrollCandidates.spec.ts`（新規）
- 仕様ポイント:
  - 入力: 対象期間の基準キー（または対象月）
  - 出力: `group1`, `group2`, `group3`, `reasons`, 集計プレビュー用メタ
  - **[GAP-1]** `reasons`: 各 attendance エントリに `reasonType: 'out_of_period' | 'not_reflected' | 'other'` および `reasonLabel: string` を付与する。判定ロジックは仕様確定時に表形式で定義する。
  - **[GAP-2]** 集計プレビュー用メタ: `previewMeta: { attendanceCount, estimatedTotalAmount, totalWorkMinutes }` を Callable 側で計算して返す（UI側ローカル計算との比較で決定）。
  - 権限: adminのみ
- 完了条件:
  - 属性順（3->2->1）で返せる。
  - 未来のattendanceは返さない。
  - **[GAP-1]** 各 attendance エントリに `reasonType` が付与されて返却される。
  - **[GAP-2]** `previewMeta` が返却され、件数・概算金額・合計時間が取得できる（計算方式は仕様確定時に決定）。
