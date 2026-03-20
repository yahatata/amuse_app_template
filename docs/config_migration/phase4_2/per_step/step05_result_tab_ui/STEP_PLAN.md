# Step05: 計算結果タブ UI

## このステップで実装する内容の概要

- サマリ、staffカード、詳細表示を実装。
- 確定操作・警告ダイアログ・過去結果参照を実装。
- CSV出力（確定前/後を識別）を実装。

## 懸念・確定できていない仕様等（判断が必要）

- 計算結果チェックボタンのチェック内容。
- CSVの列定義（監査向け項目の採否）。
- デフォルト表示対象（計算実行日当月）実装位置の最終決定。

## このステップで実装する内容全体の詳細

- 追加/変更候補:
  - `lib/payroll/widgets/payroll_result_tab.dart`（新規）
  - `lib/payroll/widgets/payroll_staff_card.dart`（新規）
  - `lib/payroll/services/payroll_export_service.dart`（新規）
  - `lib/AttendanceManagement/attendanceService.dart`（結果取得/確定呼び出し）
- 仕様ポイント:
  - 0円staffは非表示
  - 確定時に未対象attendance警告を表示
  - コメントで「表示期間変更の修正点」を明記
- 完了条件:
  - 結果表示->詳細->確定->再取得まで一連動作する。
