# Step 08: 計算タブ UI（Flutter）— changeSpec

**作成日**: 2026-03-22

---

## 1. カバーする仕様

| 仕様書 | セクション | 内容 |
|--------|----------|------|
| 06_UI_SPEC | §1 | adminHome へのメニュー追加 |
| 06_UI_SPEC | §2 | 給与計算画面のタブ構成 |
| 06_UI_SPEC | §3-1 | 属性の定義と表示 |
| 06_UI_SPEC | §3-2 | 集計プレビュー |
| 06_UI_SPEC | §3-3 | 計算対象期間・計算可能期間 |
| 06_UI_SPEC | §3-4 | 確定後の再計算 |
| 06_UI_SPEC | §3-5 | 対象データの抽出 |
| 06_UI_SPEC | §3-6 | 給与計算実行 |
| 06_UI_SPEC | §3-7 | 計算進捗表示 |
| 06_UI_SPEC | §3-8 | エラー表示・再実行 |
| 05_PROCESS_FLOW_SPEC | §9 | 実装責務の分担（Flutter 側の責務） |

---

## 2. As-Is

- `lib/Home/adminHomePage.dart`: 7ボタンのグリッド表示。`Navigator.push` + `MaterialPageRoute` で遷移
- `lib/services/payroll_config_service.dart`: `PayrollConfigService` シングルトン（Step 01 で作成済み）
- `lib/services/store_config_service.dart`: `StoreConfigService` で `payrollStartDay`/`payrollEndDay` を提供
- `lib/AttendanceManagement/attendanceService.dart`: 既存の `getPayrollData` Callable 呼び出し
- Cloud Functions 側の Callable（Step 03-07 で全て実装済み）:
  - `getPayrollCandidates`
  - `executeMonthlyPayroll`
  - `retryFailedStaffTasks`
  - `cancelPayrollRun`
- 給与計算画面は未実装

---

## 3. To-Be

### 3-1. ファイル構成

```
lib/payroll/
├── payroll_calc_page.dart       # 給与計算画面（2タブ: 計算用 + 結果。結果タブはStep09）
├── widgets/
│   ├── calc_tab.dart            # 計算用タブ本体
│   ├── candidate_section.dart   # 属性別 attendance 折りたたみセクション
│   ├── preview_summary.dart     # 集計プレビュー
│   ├── progress_view.dart       # 計算進捗表示
│   └── error_view.dart          # エラー表示・再実行
└── services/
    └── payroll_callable_service.dart  # Callable 呼び出しサービス
```

### 3-2. adminHomePage 変更

`buttons` リストに「給与計算」ボタンを追加。`PayrollCalcPage` に遷移。

### 3-3. PayrollCallableService

Callable 呼び出しを一元管理するサービスクラス:

```dart
class PayrollCallableService {
  Future<Map<String, dynamic>> getPayrollCandidates(String paymentPeriodKey);
  Future<Map<String, dynamic>> executeMonthlyPayroll({
    required String paymentPeriodKey,
    required List<String> attendanceIds,
    String? deviceId,
  });
  Future<void> retryFailedStaffTasks(String paymentPeriodKey, String runId);
  Future<void> cancelPayrollRun(String paymentPeriodKey, String runId);
}
```

### 3-4. PayrollCalcPage

- `DefaultTabController` による 2 タブ構成（「計算」「結果」）
- `StoreConfigService` から `payrollStartDay`/`payrollEndDay` を取得し期間を算出
- `PayrollConfigService` から `paymentDate` を取得し計算可能期間を判定
- **計算用タブ** → `CalcTab`
- **結果タブ** → Step 09 で実装（ここではプレースホルダー）

### 3-5. CalcTab（計算用タブ）

**状態管理**: `StatefulWidget` + `setState`

**フロー**:
1. **初期状態（idle）**: 「対象データの抽出を開始する」ボタンを表示
   - 計算可能期間外の場合は期間外メッセージを表示しボタン無効化
   - 確定済み期間の場合は「この期間は確定済みです」メッセージ
2. **抽出中（loading）**: スピナー表示
3. **抽出完了（candidates_loaded）**: 属性別セクション + プレビュー + 「計算実行」ボタン
4. **計算中（running）**: 進捗表示（ProgressView）
5. **完了（completed）**: 結果タブに自動遷移
6. **エラー（error）**: ErrorView 表示

### 3-6. CandidateSection（属性別セクション）

- `ExpansionTile` による折りたたみ（デフォルト折り畳み）
- 属性1（in_period）: チェック付き、デフォルト ON。外す場合は確認ダイアログ
- 属性2（carry_over）: チェック付き、デフォルト ON
- 属性3（other）: チェック不可、表示のみ
- 各 attendance に reasonLabel を表示

### 3-7. PreviewSummary（集計プレビュー）

- 選択中 attendance 件数（「属性1: XX/YY件 属性2: XX/YY件」形式）
- 合計時間（選択 attendance の actualWorkMinutes の合計）
- expectedRange チェック（件数・時間が範囲外なら警告表示）

### 3-8. ProgressView（計算進捗）

- `payrollRuns/{runId}` を `snapshots()` でリアルタイムリスニング
- 進捗 = `(completedStaffCount + failedStaffCount) / targetStaffCount`
- `LinearProgressIndicator` + テキスト表示
- status ごとの表示切替（preparing / processing / aggregating / completed / completed_with_errors / failed / cancelled）
- 中止ボタン（preparing / processing 時のみ）

### 3-9. ErrorView（エラー表示）

- `completed_with_errors` 時に表示
- 失敗 staff 一覧（taskStatus == "failed" の staffResults をクエリ）
- 「失敗分を再実行」ボタン → `retryFailedStaffTasks`
- 「詳細を確認」ボタン → 結果タブに遷移

---

## 4. 実装順序

1. `payroll_callable_service.dart` 作成（Callable 呼び出しサービス）
2. `payroll_calc_page.dart` 作成（2タブの枠組み）
3. `candidate_section.dart` 作成（属性別折りたたみセクション）
4. `preview_summary.dart` 作成（集計プレビュー）
5. `calc_tab.dart` 作成（計算用タブ本体: 抽出→選択→プレビュー→実行）
6. `progress_view.dart` 作成（計算進捗表示）
7. `error_view.dart` 作成（エラー表示・再実行）
8. `adminHomePage.dart` にメニュー追加
9. ビルド確認（`flutter analyze`）

---

## 5. テスト計画

Flutter UI のテストは主に手動確認で行う（Widget テストは複雑な Firestore 依存のため省略）。

### 手動確認項目

| ID | 画面/操作 | 期待結果 |
|----|----------|---------|
| M-1 | adminHome → 給与計算 | 給与計算画面に遷移、2タブ表示 |
| M-2 | 計算用タブ初期表示 | 「対象データの抽出を開始する」ボタンが表示 |
| M-3 | 抽出ボタン押下 | getPayrollCandidates 呼び出し → 属性別セクション表示 |
| M-4 | 属性1 折りたたみ開閉 | attendance 一覧が表示/非表示 |
| M-5 | 属性1 チェック外し | 確認ダイアログが表示される |
| M-6 | 集計プレビュー | 件数・時間が表示、expectedRange 外なら警告 |
| M-7 | 計算実行 | executeMonthlyPayroll 呼び出し → 進捗表示に遷移 |
| M-8 | 進捗バー | リアルタイムで更新される |
| M-9 | 中止ボタン | cancelPayrollRun 呼び出し → 「中止されました」表示 |
| M-10 | completed | 結果タブに自動遷移 |
| M-11 | completed_with_errors | エラー表示、失敗 staff 一覧、再実行ボタン |
| M-12 | 再実行ボタン | retryFailedStaffTasks 呼び出し → 進捗表示に戻る |
| M-13 | 確定済み期間 | 「この期間は確定済みです」表示、計算不可 |
| M-14 | 期間外 | 「計算可能期間ではありません」表示 |

---

## 6. 前ステップとの整合性

| 依存 | 確認結果 |
|------|---------|
| getPayrollCandidates（Step 03） | Callable 実装済み。レスポンス: group1/2/3 配列 |
| executeMonthlyPayroll（Step 05） | Callable 実装済み。レスポンス: runId, paymentPeriodKey |
| retryFailedStaffTasks（Step 06） | Callable 実装済み |
| cancelPayrollRun（Step 06） | Callable 実装済み |
| PayrollConfigService（Step 01） | シングルトン作成済み。paymentDate, expectedRange 等を提供 |
| StoreConfigService | 既存。payrollStartDay/payrollEndDay を提供 |
