# Step04: 計算用タブ UI

## このステップで実装する内容の概要

- adminHome から給与計算画面へ遷移。
- 計算可能期間判定により「抽出ボタン」または期間外メッセージを表示。
- 属性表示（折りたたみ/デフォルト閉）と選択UIを実装。

## 懸念・確定できていない仕様等（判断が必要）

- 期間外表示文言の最終文面（現案で確定か）。
- 大量データ時の表示戦略（仮想リスト/ページング）。
- 一括選択の対象範囲（属性1・2のみで固定か）。
- **属性1のチェックマーク**: 原則外せない。外す場合は確認ダイアログを表示し、突破した場合のみ解除可能（Step02 SPEC 論点5 で確定）。
- **[GAP-2]** 集計プレビュー（件数・概算金額・合計時間）のUI表示タイミング: 抽出直後に表示するか、チェックボックス変更のたびに更新するか。また、想定範囲超過警告のUI表現（バナー/インラインテキスト等）。
- **[GAP-4]** `payrollConfig`（paymentDate / bulkPaymentRegistrationEnabled / expectedRange）の管理者設定UIをこのステップに含めるか。選択肢: Step04内に設定セクション追加 / 別途管理設定画面として独立させる。仕様確定時に決定する。

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
  - **[GAP-2]** 集計プレビューパネル（`lib/payroll/widgets/payroll_preview_panel.dart`、新規）: 選択中の attendances の件数・概算金額・合計時間を表示。各属性について「選択件数/全件数」（XX/YY 形式）でサマリを表示。`payrollConfig.expectedRange` を超過した場合は警告表示（赤字バナー or インライン警告）。
  - **[GAP-4]** payrollConfig 設定UI: 仕様確定時の決定に基づき、このステップに含めるかを決定する。
- 完了条件:
  - ボタン押下で抽出データが表示される。
  - Firestore直接書き込みがない。
  - **[GAP-2]** 集計プレビューがチェックボックスの選択状態に連動して更新される。
  - **[GAP-2]** 想定範囲超過時に警告が表示される（あくまで警告。実行は妨げない）。
  - **[GAP-4]** payrollConfig 設定UIの担当ステップが仕様確定で決定されている。
