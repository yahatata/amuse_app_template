# Step 08: 計算タブ UI — VERIFICATION_LOG

**実装日**: 2026-03-22
**ステータス**: 完了

---

## 1. 静的解析

| チェック | 結果 |
|---------|------|
| `flutter analyze` | エラー 0件、警告 0件（既存ファイル名 lint 1件のみ、pre-existing） |

---

## 2. ファイル変更一覧

### 新規作成

| ファイル | 説明 |
|---------|------|
| `lib/payroll/payroll_calc_page.dart` | 給与計算画面（2タブ枠組み） |
| `lib/payroll/widgets/calc_tab.dart` | 計算用タブ本体 |
| `lib/payroll/widgets/candidate_section.dart` | 属性別折りたたみセクション |
| `lib/payroll/widgets/preview_summary.dart` | 集計プレビュー |
| `lib/payroll/widgets/progress_view.dart` | 進捗表示（Firestore リアルタイム） |
| `lib/payroll/widgets/error_view.dart` | エラー表示・再実行 |
| `lib/payroll/services/payroll_callable_service.dart` | Callable 呼び出しサービス |

### 変更

| ファイル | 変更内容 |
|---------|---------|
| `lib/Home/adminHomePage.dart` | 「給与計算」ボタン + import 追加 |

---

## 3. 仕様カバレッジ

| 仕様 | セクション | 内容 | 状態 |
|------|-----------|------|------|
| 06_UI_SPEC | §1 | adminHome メニュー追加 | ✅ |
| 06_UI_SPEC | §2 | 2タブ構成 | ✅ |
| 06_UI_SPEC | §3-1 | 属性定義・表示・チェック | ✅ |
| 06_UI_SPEC | §3-2 | 集計プレビュー | ✅ |
| 06_UI_SPEC | §3-3 | 計算対象期間・計算可能期間 | ✅ |
| 06_UI_SPEC | §3-4 | 確定後の再計算 | ✅ |
| 06_UI_SPEC | §3-5 | 対象データの抽出 | ✅ |
| 06_UI_SPEC | §3-6 | 給与計算実行 | ✅ |
| 06_UI_SPEC | §3-7 | 計算進捗表示 | ✅ |
| 06_UI_SPEC | §3-8 | エラー表示・再実行 | ✅ |
| 05_PROCESS_FLOW_SPEC | §9 | 実装責務の分担（Flutter） | ✅ |

---

## 4. 手動確認事項

| ID | 項目 | 状況 |
|----|------|------|
| M-1 | adminHome → 給与計算遷移 | 🔲 実機確認予定 |
| M-2 | 抽出ボタン表示 | 🔲 |
| M-3 | 属性別セクション表示 | 🔲 |
| M-4 | 属性1チェック外し確認ダイアログ | 🔲 |
| M-5 | 集計プレビュー | 🔲 |
| M-6 | 計算実行→進捗バー | 🔲 |
| M-7 | completed→結果タブ遷移 | 🔲 |
| M-8 | completed_with_errors→エラー表示 | 🔲 |
| M-9 | 中止ボタン | 🔲 |
| M-10 | 確定済み期間メッセージ | 🔲 |
