# Step04: 計算用タブ UI

## このステップで実装する内容の概要

- adminHome から給与計算画面へ遷移。
- 計算可能期間判定により「抽出ボタン」または期間外メッセージを表示。
- 属性表示（折りたたみ/デフォルト閉）と選択UIを実装。

## 懸念・確定できていない仕様等（判断が必要）

- 期間外表示文言の最終文面（現案で確定か）。
- 大量データ時の表示戦略（仮想リスト/ページング）。
- 一括選択の対象範囲（属性1・2のみで固定か）。

## このステップで実装する内容全体の詳細

- 追加/変更候補:
  - `lib/payroll/pages/payroll_calculation_page.dart`（新規）
  - `lib/payroll/widgets/payroll_candidates_panel.dart`（新規）
  - `lib/.../admin_home_page.dart`（メニュー追加）
  - `lib/AttendanceManagement/attendanceService.dart`（Callable呼び出し追加）
- UI要件:
  - 属性3->2->1の順
  - 折りたたみデフォルト
  - 属性1・2は初期チェックON
  - 一括選択/解除
- 完了条件:
  - ボタン押下で抽出データが表示される。
  - Firestore直接書き込みがない。
