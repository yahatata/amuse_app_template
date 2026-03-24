# Step 10: 通知・スケジューラー — VERIFICATION_LOG

**実施日**: 2026-03-22

---

## 1. 静的解析結果

### Cloud Functions

| 項目 | 結果 |
|------|------|
| TypeScript コンパイル (`tsc --noEmit`) | **エラー 0** |
| Jest テスト | **48 / 48 PASS** (2 suites) |

### Flutter

| 項目 | 結果 |
|------|------|
| `flutter analyze lib/payroll/ lib/Home/adminHomePage.dart` | **エラー 0 / 警告 0**（既存 `file_names` info のみ） |

---

## 2. テスト詳細

### payrollNotificationHelper.spec.ts（12 テスト）

| # | テスト | 結果 |
|---|--------|------|
| 1 | expandTemplate: 単一パラメータ置換 | ✅ |
| 2 | expandTemplate: 複数パラメータ置換 | ✅ |
| 3 | expandTemplate: 同一パラメータ複数箇所 | ✅ |
| 4 | expandTemplate: 未使用パラメータはそのまま | ✅ |
| 5 | buildSchedulerIdempotencyKey: 正しい冪等キー | ✅ |
| 6 | buildEventIdempotencyKey: runId ベース | ✅ |
| 7 | buildEventIdempotencyKey: attendanceId + timestamp ベース | ✅ |
| 8 | PAYROLL_NOTIFICATION_TEMPLATES: 9種定義 | ✅ |
| 9 | 全テンプレートが type/title/body を持つ（9種 × it.each） | ✅ |
| 10 | payroll_period_start テンプレート展開 | ✅ |
| 11 | payroll_hold_reminder テンプレート展開 | ✅ |

### processPayrollNotifications.spec.ts（36 テスト）

| # | テスト | 結果 |
|---|--------|------|
| 1 | computeActualPaymentDate: null → null | ✅ |
| 2 | computeActualPaymentDate: 翌月の paymentDay | ✅ |
| 3 | computeActualPaymentDate: 12月 → 翌年1月 | ✅ |
| 4 | computeActualPaymentDate: 月末クランプ | ✅ |
| 5 | computeActualPaymentDate: 不正文字列 → null | ✅ |
| 6 | payroll_period_start: periodEnd+1 で通知あり | ✅ |
| 7 | payroll_period_start: periodEnd+2 で通知なし | ✅ |
| 8 | payroll_period_start: latestRunId 存在で通知なし | ✅ |
| 9 | payroll_calc_remind: periodEnd+N で通知あり | ✅ |
| 10 | payroll_calc_remind: periodEnd+(N-1) で通知なし | ✅ |
| 11 | payroll_calc_remind: latestRunId ありで通知なし | ✅ |
| 12 | payroll_calc_remind: 支払日3日前で strong_warning 昇格 | ✅ |
| 13 | payroll_calc_remind: 支払日4日前で warning 維持 | ✅ |
| 14 | payroll_confirm_remind: draft で通知あり | ✅ |
| 15 | payroll_confirm_remind: confirmed で通知なし | ✅ |
| 16 | payroll_confirm_remind: latestRunId なしで通知なし | ✅ |
| 17 | payroll_payment_overdue: 支払日翌日 + confirmed で通知あり | ✅ |
| 18 | payroll_payment_overdue: 支払日当日で通知なし | ✅ |
| 19 | payroll_payment_overdue: paid で通知なし | ✅ |
| 20 | payroll_payment_overdue: hold で通知なし | ✅ |
| 21 | payroll_payment_overdue: paymentDate null で通知なし | ✅ |
| 22 | payroll_hold_reminder: 月曜 + hold + holdCount>0 で通知あり | ✅ |
| 23 | payroll_hold_reminder: 月曜以外で通知なし | ✅ |
| 24 | payroll_hold_reminder: holdCount==0 で通知なし | ✅ |
| 25 | payroll_hold_reminder: status != hold で通知なし | ✅ |
| 26 | 条件不成立: periodEnd+1 より前 → 0 件 | ✅ |
| 27 | 条件不成立: 全完了(paid) → 0 件 | ✅ |
| 28 | 冪等キー: 同日同一 triggerType → 同一 docId | ✅ |
| 29 | 冪等キー: 異なる日 → 異なる docId | ✅ |

---

## 3. 変更ファイル一覧

### 新規（Cloud Functions）

| ファイル | 内容 |
|---------|------|
| `functions/src/domains/attendance/helpers/payrollNotificationTemplates.ts` | 9種の通知テンプレート定数マップ |
| `functions/src/domains/attendance/helpers/payrollNotificationHelper.ts` | `createPayrollNotification()`, `expandTemplate()`, 冪等キー生成関数 |
| `functions/src/domains/attendance/scheduler/payrollNotificationScheduler.ts` | Cloud Scheduler (毎日 06:00 JST) → processPayrollNotifications タスク投入 |
| `functions/src/domains/attendance/tasks/processPayrollNotifications.ts` | 5種のスケジューラー通知条件評価 + 作成。`evaluateScheduledNotifications` を純粋関数として分離 |

### 変更（Cloud Functions）

| ファイル | 変更内容 |
|---------|---------|
| `functions/src/domains/attendance/tasks/finalizePayrollRun.ts` | L121 TODO → `payroll_run_completed` / `payroll_run_completed_with_errors` 通知作成 |
| `functions/src/domains/attendance/callables/executeMonthlyPayroll.ts` | タスクディスパッチ失敗時に `status: 'failed'` + `payroll_run_failed` 通知作成 |
| `functions/src/domains/attendance/triggers/attendanceOnWrite.ts` | `corrected_after_reflection` 検知時に `payroll_attendance_corrected` 通知作成 |
| `functions/src/domains/attendance/index.ts` | `payrollNotificationScheduler`, `processPayrollNotifications` export 追加 |

### 新規（Flutter）

| ファイル | 内容 |
|---------|------|
| `lib/payroll/widgets/notification_list.dart` | 通知一覧画面（フィルター、既読化、フラグトグル、種別アイコン・色） |

### 変更（Flutter）

| ファイル | 変更内容 |
|---------|---------|
| `lib/Home/adminHomePage.dart` | AppBar に通知ベルアイコン + 未読バッジ（StreamBuilder）追加 |

### テストファイル

| ファイル | テスト数 |
|---------|---------|
| `functions/__tests__/attendance/payrollNotificationHelper.spec.ts` | 12 |
| `functions/__tests__/attendance/processPayrollNotifications.spec.ts` | 36 |

---

## 4. 仕様カバレッジ

| 仕様書 | セクション | 状態 |
|--------|----------|------|
| 07_NOTIFICATION_SCHEDULER_SPEC | §1-1 通知先 | ✅ adminHome のみ |
| 07_NOTIFICATION_SCHEDULER_SPEC | §1-2 adminHome での確認 | ✅ createdAt >= 2ヶ月前 |
| 07_NOTIFICATION_SCHEDULER_SPEC | §1-3 通知の属性 | ✅ isRead, isFlagged, type |
| 07_NOTIFICATION_SCHEDULER_SPEC | §1-4 表示 | ✅ フィルター（all/unread/flagged） |
| 07_NOTIFICATION_SCHEDULER_SPEC | §1-5 コレクション | ✅ notifications, operationCategory='payroll' |
| 07_NOTIFICATION_SCHEDULER_SPEC | §1-6 通知テンプレート | ✅ 9種（定数マップ + パラメータ置換） |
| 07_NOTIFICATION_SCHEDULER_SPEC | §2-1 スケジューラー経由 5種 | ✅ evaluateScheduledNotifications |
| 07_NOTIFICATION_SCHEDULER_SPEC | §2-2 イベント駆動 4種 | ✅ finalizePayrollRun, executeMonthlyPayroll, attendanceOnWrite |
| 07_NOTIFICATION_SCHEDULER_SPEC | §3-1 コスト最小化 | ✅ Cloud Scheduler 1つ |
| 07_NOTIFICATION_SCHEDULER_SPEC | §3-2 実行フロー | ✅ Scheduler → Task → Notifications |
| 07_NOTIFICATION_SCHEDULER_SPEC | §3-3 処理詳細 | ✅ 5条件すべて実装 + 36テスト |
| 07_NOTIFICATION_SCHEDULER_SPEC | §3-4 冪等キー | ✅ doc.set() + テスト |
| 07_NOTIFICATION_SCHEDULER_SPEC | §4 既存 trigger | ✅ コード維持、新スケジューラー追加 |
| 07_NOTIFICATION_SCHEDULER_SPEC | §5-1 通知取得 | ✅ Firestore 直接クエリ |
| 07_NOTIFICATION_SCHEDULER_SPEC | §5-2 通知更新 | ✅ Firestore 直接更新 |
| 07_NOTIFICATION_SCHEDULER_SPEC | §5-3 通知作成 | ✅ createPayrollNotification |
| 03_DATA_MODEL_SPEC | §3 通知コレクション | ✅ |
| 04_CALLABLE_API_SPEC | §1 手順7 (corrected) | ✅ |
| 04_CALLABLE_API_SPEC | §3 (failed) | ✅ |
| 04_CALLABLE_API_SPEC | §5 手順8 (finalize) | ✅ |
| 05_PROCESS_FLOW_SPEC | §4 手順8, §7, §9 | ✅ |

---

## 5. 手動確認項目

| ID | 確認項目 | 状態 |
|----|---------|------|
| M-1 | adminHome に通知ベル + 未読バッジ表示 | 🔲 手動確認待ち |
| M-2 | 通知一覧画面: createdAt 降順表示 | 🔲 手動確認待ち |
| M-3 | 通知タップ → 既読化（isRead = true） | 🔲 手動確認待ち |
| M-4 | 通知長押し → フラグ付け/解除（isFlagged トグル） | 🔲 手動確認待ち |
| M-5 | 通知種別に応じたアイコン/色（report=青, warning=橙, strong_warning=深橙, error=赤） | 🔲 手動確認待ち |
| M-6 | フィルター切り替え（すべて/未読のみ/フラグ付き） | 🔲 手動確認待ち |
| M-7 | finalizePayrollRun 完了時に通知が作成される | 🔲 手動確認待ち |
| M-8 | attendance corrected_after_reflection 時に通知が作成される | 🔲 手動確認待ち |
| M-9 | スケジューラー → Cloud Task → 通知判定フロー | 🔲 手動確認待ち |
