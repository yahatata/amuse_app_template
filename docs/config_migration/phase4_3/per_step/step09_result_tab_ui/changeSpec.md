# Step 09: 計算結果タブ & 支払い管理 UI（Flutter）— changeSpec

**作成日**: 2026-03-22

---

## 1. カバーする仕様

| 仕様書 | セクション | 内容 |
|--------|----------|------|
| 06_UI_SPEC | §4-1 | サマリ表示 |
| 06_UI_SPEC | §4-2 | staff ごとのカード表示 |
| 06_UI_SPEC | §4-3 | staff 詳細画面 |
| 06_UI_SPEC | §4-4 | 確定ボタン |
| 06_UI_SPEC | §4-5 | 計算結果チェック（anomalyFlags） |
| 06_UI_SPEC | §4-6 | CSV エクスポート |
| 06_UI_SPEC | §4-7 | 印刷（一旦無視） |
| 06_UI_SPEC | §4-8 | 過去の計算結果 |
| 06_UI_SPEC | §5-1 | 支払い済み登録 |
| 06_UI_SPEC | §5-2 | 支払日翌日以降の警告 |
| 06_UI_SPEC | §5-3 | 保留ステータス |
| 06_UI_SPEC | §6 | 既存機能との関係 |
| 05_PROCESS_FLOW_SPEC | §9 | 実装責務の分担（結果タブ — Flutter） |

---

## 2. As-Is

- `lib/payroll/payroll_calc_page.dart`: 2タブ構成済み。結果タブはプレースホルダー（`Text('計算結果タブ（Step 09 で実装）')`）
- `lib/payroll/services/payroll_callable_service.dart`: `getPayrollCandidates`, `executeMonthlyPayroll`, `retryFailedStaffTasks`, `cancelPayrollRun` の4メソッド
- `lib/payroll/widgets/calc_tab.dart`: 計算タブ本体。`onCompleted` で `tabController.animateTo(1)` を呼び出し済み
- バックエンド: `confirmPayrollRun`, `registerPaymentStatus` Callable は Step 06/07 で実装済み

---

## 3. To-Be 設計

### 3.1 ファイル構成

```
lib/payroll/
├── payroll_calc_page.dart          ← 変更: ResultTab を import + 接続
├── services/
│   └── payroll_callable_service.dart  ← 変更: confirmPayrollRun, registerPaymentStatus メソッド追加
└── widgets/
    ├── calc_tab.dart               ← 変更なし
    ├── result_tab.dart             ← 新規: 結果タブ本体
    ├── result_summary.dart         ← 新規: サマリ表示
    ├── staff_card.dart             ← 新規: staff カード
    ├── staff_detail_page.dart      ← 新規: staff 詳細画面
    ├── confirm_section.dart        ← 新規: 確定ボタン + 警告
    ├── payment_management.dart     ← 新規: 支払い管理画面
    └── past_results_selector.dart  ← 新規: 過去結果セレクタ
```

### 3.2 PayrollCallableService 拡張

```dart
// 追加メソッド
Future<Map<String, dynamic>> confirmPayrollRun({
  required String paymentPeriodKey,
  String? runId,
}) async { ... }

Future<Map<String, dynamic>> registerPaymentStatus({
  required String paymentPeriodKey,
  required List<Map<String, String>> entries,
}) async { ... }
```

### 3.3 ResultTab（result_tab.dart）

結果タブの本体ウィジェット。

**データソース**: `monthlyPayroll/{paymentPeriodKey}` をリアルタイムリスニング。
`latestRunId` が取得できたら `payrollRuns/{runId}` と `staffResults` をリスニング。

**状態管理**:
- `paymentPeriodKey` は CalcTab と同じロジックで算出（共通化）
- `monthlyPayroll` doc の `snapshots()` で status / latestRunId を監視
- `staffResults` は `latestRunId` 確定後にコレクション query の `snapshots()` で取得

**status による表示制御**:

| payrollRuns.status | 表示内容 |
|---|---|
| `completed` | サマリ + カード一覧 + 確定ボタン有効 |
| `completed_with_errors` | サマリ + 成功 staff のカード一覧 + 警告バナー + 確定ボタン無効 |
| `preparing` / `processing` / `aggregating` | 「計算中です。計算タブをご確認ください」 |
| なし（monthlyPayroll なし or latestRunId なし） | 「計算結果がありません」 |
| `confirmed` / `hold` / `paid`（monthlyPayroll.status） | 確定済み結果表示 + 支払い管理セクション |

**monthlyPayroll.status 表示**:
- `draft`: 確定ボタン表示
- `confirmed`: 「確定済み」+ 支払い管理セクション表示
- `hold`: 「保留あり」+ 支払い管理セクション表示
- `paid`: 「全員支払い済み」表示

### 3.4 ResultSummary（result_summary.dart）

payrollRuns と staffResults からサマリ情報を表示。

| 項目 | ソース |
|------|--------|
| 対象 staff 数 | `payrollRuns.targetStaffCount` |
| 総支給額合計 | `payrollRuns.totalGrossPay` |
| 総実労働時間 | Σ `staffResults.totalActualWorkMinutes`（UI 算出） |
| 総法定時間外労働時間 | Σ `staffResults.totalLegalOvertimeMinutes`（UI 算出） |
| 総法定休日労働時間 | Σ `staffResults.totalLegalHolidayWorkMinutes`（UI 算出） |
| anomalyFlags 警告 | `payrollRuns.anomalyFlags`（空でなければ表示） |

### 3.5 StaffCard（staff_card.dart）

staffResults 1件をカード表示。

**表示項目**:
- `staffNameSnapshot`
- `totalActualWorkMinutes`（時間換算: `Xh Ym`）
- `grossPay`（`¥` フォーマット）
- 割増アイコン: 残業あり（`totalLegalOvertimeMinutes > 0`）、法定休日あり（`totalLegalHolidayWorkMinutes > 0`）、60h超あり（`over60OvertimeMinutes > 0`）
- キャリーオーバー: `carryOverAttendanceCount > 0` の場合 `「CO {count}件 / +¥{carryOverGrossPay}」`

**フィルタ**: `grossPay == 0` の staff は非表示。

**タップ**: `StaffDetailPage` に遷移。

### 3.6 StaffDetailPage（staff_detail_page.dart）

カード押下で表示する詳細画面（`MaterialPageRoute` で push）。

**表示セクション**:
1. 基本情報: `staffNameSnapshot`, `baseHourlyWageSnapshot`
2. 集計値テーブル: `totalActualWorkMinutes`, `totalNightWorkMinutes`, `totalLegalOvertimeMinutes`, `over60OvertimeMinutes`, `totalLegalHolidayWorkMinutes`, `totalNonLegalHolidayWorkMinutes`
3. 金額内訳テーブル: `basePay`, `lateNightPremiumPay`, `overtimePremiumPay`, `over60PremiumPay`, `legalHolidayPremiumPay`, `grossPay`
4. キャリーオーバー情報（`carryOverAttendanceCount > 0` のみ）: 件数 + 支給額
5. warnings（あれば）
6. attendance 明細一覧: `attendanceItems` サブコレクションからフェッチ
   - 日付, 曜日, 実労働時間, 夜間労働時間, 法定時間外, 法定休日フラグ, キャリーオーバーフラグ

### 3.7 ConfirmSection（confirm_section.dart）

**表示条件**: `payrollRuns.status == 'completed'` かつ `monthlyPayroll.status == 'draft'`
- `completed_with_errors`: 確定ボタン無効 + 「一部スタッフの計算が失敗しているため確定できません」メッセージ

**確定時**:
1. 確認ダイアログ表示:
   - 「確定すると再計算できなくなります」
   - group3（対象外）の件数情報（CalcTab から渡す or monthlyPayroll doc に記録されていないため表示省略）
2. `confirmPayrollRun` Callable 呼び出し
3. 成功後: monthlyPayroll.status 変化を snapshots で自動反映

### 3.8 CSV エクスポート

staffResults から 15列の CSV を生成し、端末にダウンロード/共有。

**ヘッダー行**: `# ステータス: 未確定` or `# ステータス: 確定済み`

**15列**: スタッフ名, 時給, 実労働時間(分), 夜間労働時間(分), 法定時間外労働(分), 60h超時間外(分), 法定休日労働(分), 法定外休日労働(分), 基本給, 深夜割増, 残業割増, 60h超割増, 法定休日割増, キャリーオーバー支給額, 総支給額

CSV 文字列は手動生成（固定15列で構造が単純なため外部パッケージ不要）。`share_plus` でシェアシート表示 + `path_provider`（既存依存）でテンポラリファイル保存。

### 3.9 過去結果セレクタ（past_results_selector.dart）

- デフォルト: 当月の `monthlyPayroll` を表示（paymentPeriodKey が当月に該当するもの）
- ドロップダウンまたは月セレクタで過去の `monthlyPayroll` ドキュメントを切り替え
- `monthlyPayroll` コレクションを `orderBy('createdAt', descending: true)` + `limit(12)` で取得

### 3.10 PaymentManagement（payment_management.dart）

**表示条件**: `monthlyPayroll.status` が `confirmed` / `hold` / `paid` の場合

**構成**:
- ヘッダー: 期間 + ステータス表示 + 進捗（`{paidCount}/{totalCount} 支払い済み`）
- 一括支払いボタン: `payrollConfig.bulkPaymentRegistrationEnabled == true` の場合のみ表示
- staff 一覧:
  - `unpaid`: 「支払い済み」「保留」ボタン表示
  - `paid`: 「✓ 支払い済み」ラベル（操作不可）
  - `hold`: 「⏸ 保留中」ラベル +「支払い済み」ボタン

**操作**: `registerPaymentStatus` Callable 呼び出し → snapshots で自動反映

**支払日翌日以降の警告**: `monthlyPayroll.status == 'confirmed'` かつ `DateTime.now()` が `payrollConfig.paymentDate` の翌日以降の場合、警告バナーを表示

### 3.11 印刷（§4-7）

仕様により「一旦無視する」。実装しない。

### 3.12 既存機能との関係（§6）

`all_staff_attendance_page` との併用。既存画面への変更なし。

---

## 4. 変更ファイル一覧

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `lib/payroll/services/payroll_callable_service.dart` | 変更 | `confirmPayrollRun`, `registerPaymentStatus` メソッド追加 |
| `lib/payroll/payroll_calc_page.dart` | 変更 | ResultTab import + プレースホルダー置換 |
| `lib/payroll/widgets/result_tab.dart` | 新規 | 結果タブ本体 |
| `lib/payroll/widgets/result_summary.dart` | 新規 | サマリ表示 |
| `lib/payroll/widgets/staff_card.dart` | 新規 | staff カード |
| `lib/payroll/widgets/staff_detail_page.dart` | 新規 | staff 詳細画面 |
| `lib/payroll/widgets/confirm_section.dart` | 新規 | 確定ボタン + 警告 |
| `lib/payroll/widgets/payment_management.dart` | 新規 | 支払い管理画面 |
| `lib/payroll/widgets/past_results_selector.dart` | 新規 | 過去結果セレクタ |

---

## 5. テスト計画

Flutter UI のため自動テストではなく手動確認。

### 5.1 手動確認項目

| ID | 確認項目 | 関連仕様 |
|----|---------|---------|
| M-1 | 計算完了 → 結果タブ自動遷移 + サマリ表示 | §4-1 |
| M-2 | staff カード一覧表示（grossPay == 0 非表示） | §4-2 |
| M-3 | 割増アイコン表示（残業/法定休日/60h超） | §4-2 |
| M-4 | キャリーオーバー表示（CO > 0 のみ） | §4-2 |
| M-5 | staff カード → 詳細画面遷移 | §4-3 |
| M-6 | 詳細画面: 集計値 + 金額内訳 + attendance 明細 | §4-3 |
| M-7 | 確定ボタン: completed 時のみ有効 | §4-4 |
| M-8 | 確定ボタン: completed_with_errors 時は無効 + メッセージ | §4-4 |
| M-9 | 確定時確認ダイアログ | §4-4 |
| M-10 | anomalyFlags 警告表示（空なら非表示） | §4-5 |
| M-11 | CSV エクスポート: 15列 + ステータスヘッダー | §4-6 |
| M-12 | 過去結果セレクタ: 月切り替え | §4-8 |
| M-13 | 支払い管理: staff ごと paid/hold ボタン | §5-1 |
| M-14 | 支払い管理: 一括支払いボタン（bulkPaymentRegistrationEnabled） | §5-1 |
| M-15 | 支払い管理: monthlyPayroll.status 自動遷移反映 | §5-1 |
| M-16 | 支払日翌日以降の警告表示 | §5-2 |
| M-17 | 保留 staff の表示 + 支払い済みボタン | §5-3 |

### 5.2 静的解析

- `flutter analyze` でエラー・警告 0 を確認

---

## 6. 既存機能への影響

- `payroll_calc_page.dart` のプレースホルダーを `ResultTab` に置換するのみ。CalcTab の動作に影響なし
- `payroll_callable_service.dart` にメソッド追加のみ。既存メソッドは変更なし
- `all_staff_attendance_page` に変更なし（§6 の要件通り）

---

## 7. 設計判断

| # | 項目 | 判断 | 理由 |
|---|------|------|------|
| 1 | paymentPeriodKey の算出 | CalcTab と同じ `_computePeriodKey()` ロジックを ResultTab にも配置（ユーティリティ抽出は将来対応） | 共通関数にすると import パスが増え複雑になるため、まず各タブに同一ロジックを配置。リファクタリングは Step 10 以降で検討 |
| 2 | CSV 出力方式 | 手動で CSV 文字列を生成 → `path_provider` でテンポラリファイル保存 → `share_plus` でシェアシート表示 | 15列固定で構造が単純なため `csv` パッケージは不要。`share_plus`（fluttercommunity.dev 発行）を新規追加。`path_provider` は既存依存 |
| 3 | 支払い管理の表示場所 | 結果タブ内の下部セクション | 別画面にすると遷移が増える。確定後の自然なフローとして同一タブに配置 |
| 4 | 印刷 | 実装しない | 仕様 §4-7 により「一旦無視する」 |
| 5 | 新規パッケージ依存 | `share_plus` のみ追加。`csv` は追加しない | `csv` は unverified uploader のため採用せず、手動生成で対応 |
