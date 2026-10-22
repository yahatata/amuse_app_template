# Phase4.3 実装計画

**作成日**: 2026-03-21
**方式**: 仕様追跡マトリクス方式（全仕様セクションをステップにマッピングし、漏れゼロを保証）

---

## 1. 方針

- ステップは**実装の依存関係**で切る（仕様ファイルの分類とは切り離す）
- 各ステップの changeSpec に「カバーする仕様セクション」を明示する
- 本ドキュメントの追跡マトリクス（セクション4）で全仕様セクションの網羅性を保証する
- 各ステップの完了時に VERIFICATION_LOG.md を作成し、マトリクスの進捗を更新する

---

## 2. ステップ一覧

| Step | 名称 | 依存 | 概要 |
|------|------|------|------|
| 01 | 基盤・設定整備 | — | payrollConfig 型/ローダー/初期化、期間計算ユーティリティ、エラーコード |
| 02 | attendance フィールド追加 & onWrite トリガー | 01 | attendance 新フィールド、帰属情報付与トリガー、nightWorkMinutes 休憩控除修正 |
| 03 | 対象データ抽出 | 01, 02 | getPayrollCandidates Callable（group1/2/3 分類、キャリーオーバー候補） |
| 04 | コア計算エンジン | 01 | 給与計算アルゴリズム（日超過・週超過・月60h超・法定休日・深夜・キャリーオーバー・金額算出） |
| 05 | 分散実行 | 01, 02, 04 | executeMonthlyPayroll + processStaffPayroll + finalizePayrollRun、Cloud Tasks 基盤 |
| 06 | 確定・再実行・中止 | 05 | confirmPayrollRun（キャリーオーバー記録含む）、retryFailedStaffTasks、cancelPayrollRun |
| 07 | 支払い管理 | 06 | registerPaymentStatus、monthlyPayroll.status 自動遷移 |
| 08 | 計算タブ UI | 03, 05 | adminHome メニュー、計算用タブ（属性表示・プレビュー・実行・進捗・エラー） |
| 09 | 計算結果タブ & 支払い管理 UI | 06, 07 | 結果タブ（サマリ・カード・詳細・確定・CSV）、支払い管理 UI |
| 10 | 通知・スケジューラー | 05, 06 | 通知基盤、テンプレート、インライン通知、スケジューラー、Flutter 通知 UI |

**依存関係図**:

```
Step 01 (基盤)
  ├─→ Step 02 (attendance) ─→ Step 03 (candidates)
  ├─→ Step 04 (計算エンジン)
  │       ↓
  └─→ Step 05 (分散実行) ← Step 02, 04
          ↓
      Step 06 (確定等)
          ↓
      Step 07 (支払い)
          ↓
      Step 09 (結果タブUI)
  
  Step 03 + Step 05 → Step 08 (計算タブUI)
  Step 05 + Step 06 → Step 10 (通知)
```

---

## 3. 各ステップの詳細

### Step 01: 基盤・設定整備

**目的**: 後続の全ステップが使う共通基盤を整備する

**カバーする仕様**:

| 仕様書 | セクション |
|--------|----------|
| 02_CONFIG_SPEC | 1. 設定の配置方針 |
| 02_CONFIG_SPEC | 2. storeMeta/config — 既存設定 |
| 02_CONFIG_SPEC | 3. storeMeta/payrollConfig — 既存フィールド |
| 02_CONFIG_SPEC | 4. storeMeta/payrollConfig — 新規追加フィールド |
| 02_CONFIG_SPEC | 5. paymentPeriodKey のフォーマットと決定ロジック |
| 02_CONFIG_SPEC | 6. weekStartDate の決定ロジック |
| 02_CONFIG_SPEC | 7. 計算可能期間の導出 |
| 02_CONFIG_SPEC | 8. payroll run 開始時の snapshot（型定義のみ） |
| 02_CONFIG_SPEC | 9. payrollConfig の管理方針 |
| 01_CALC_SPEC | 1. 用語定義（定数・型のみ） |
| 04_CALLABLE_API_SPEC | 10. エラーコード定義（共通） |

**主な成果物**:
- `payrollPeriodUtils.ts`（paymentPeriodKey / weekStartDate / 計算可能期間の算出）
- `payrollConfig` 型定義・ローダー・初期化（16フィールド + デフォルト値）
- `payrollErrors.ts`（エラーコード12種）
- snapshot 型定義
- Flutter `PayrollConfigService`（payrollConfig 購読）
- 単体テスト（期間計算、weekStartDate 算出、設定ローダー）

**完了条件**:
- paymentPeriodKey が全パターン（endDay≠0 / endDay=0 / 日跨ぎ）で正しく算出される
- weekStartDate が weekStartDay の全曜日設定で正しく算出される
- payrollConfig 未設定時にデフォルト値で動作する
- エラーコード12種が export されている

---

### Step 02: attendance フィールド追加 & onWrite トリガー

**目的**: attendance に帰属情報を自動付与する仕組みを構築する

**カバーする仕様**:

| 仕様書 | セクション |
|--------|----------|
| 03_DATA_MODEL_SPEC | 1-1. 既存フィールド（確認のみ） |
| 03_DATA_MODEL_SPEC | 1-2. 追加フィールド（新規） |
| 03_DATA_MODEL_SPEC | 1-3. 廃止フィールド |
| 03_DATA_MODEL_SPEC | 1-4. attendance に持たせないもの |
| 04_CALLABLE_API_SPEC | 1. attendance 帰属情報付与処理（手順 1〜6） |
| 01_CALC_SPEC | 実装時修正事項（nightWorkMinutes の休憩控除） |

**主な成果物**:
- attendance 新フィールド（weekday, weekStartDate, paymentPeriodKey, payrollStatus, reflectedPayrollRunId, reflectedAt）
- Firestore onWrite トリガー（帰属情報付与 + payrollStatus 遷移）
- `recalculateAttendanceFromBreaks` 修正（nightWorkMinutes の深夜帯休憩控除）
- 既存 payrollReflectedAt フォールバック処理
- エミュレータテスト

**完了条件**:
- attendance 作成時に weekday / weekStartDate / paymentPeriodKey / payrollStatus が自動設定される
- reflected → corrected_after_reflection の遷移が正しく動作する
- nightWorkMinutes が深夜帯の休憩を控除した値になる

---

### Step 03: 対象データ抽出（getPayrollCandidates）

**目的**: 計算対象の attendance を group1/2/3 に分類して返す

**カバーする仕様**:

| 仕様書 | セクション |
|--------|----------|
| 04_CALLABLE_API_SPEC | 2. getPayrollCandidates（全体） |

**主な成果物**:
- `getPayrollCandidates` Callable
- CandidateEntry インターフェース
- 属性判定ロジック（in_period / carry_over / other）
- エミュレータテスト

**完了条件**:
- 期間内・退勤済・未反映 → group1 (in_period)
- 期間外・未反映 → group2 (carry_over)
- 未退勤 / 論理削除 → group3 (other)
- maxCandidatesCount による件数制限が動作する

---

### Step 04: コア計算エンジン

**目的**: 給与計算アルゴリズムを Firestore 非依存の純粋関数モジュールとして実装する

**カバーする仕様**:

| 仕様書 | セクション |
|--------|----------|
| 01_CALC_SPEC | 2. 計算の全体フロー |
| 01_CALC_SPEC | 3. 法定休日の判定 |
| 01_CALC_SPEC | 4. 法定休日の attendance |
| 01_CALC_SPEC | 5. 通常の attendance（コアアルゴリズム） |
| 01_CALC_SPEC | 6. 法定外休日の attendance |
| 01_CALC_SPEC | 7. 月跨ぎ週の処理ルール |
| 01_CALC_SPEC | 8. 月60時間超の計算 |
| 01_CALC_SPEC | 9. 深夜労働 |
| 01_CALC_SPEC | 10. 金額計算式 |
| 01_CALC_SPEC | 11. 重複計上の防止ルール |
| 01_CALC_SPEC | 12. staff 単位の集計値 |
| 01_CALC_SPEC | 13. attendance 明細（attendanceItems）の記録フィールド |
| 01_CALC_SPEC | 13-1. キャリーオーバー計算アルゴリズム |
| 01_CALC_SPEC | 14. 適用範囲と限界 |
| 01_CALC_SPEC | 検証テーブル 1〜6 |

**主な成果物**:
- 計算エンジンモジュール（入力: attendance[] + configSnapshot → 出力: StaffCalcResult + AttendanceItemResult[]）
  - `isLegalHoliday()` — 法定休日判定
  - `calcDailyOvertime()` — 日超過
  - `calcWeeklyOvertime()` — 週超過（weeklyRegularRunning）
  - `calcMonthly60hOver()` — 月60h超
  - `calcAmount()` — 金額算出（round 関数含む）
  - `calcCarryOver()` — キャリーオーバー計算
- 01_CALC_SPEC 検証テーブル 1〜6 を**そのままテストケース**にした単体テスト
- isNonLegalHoliday = false 固定（将来拡張用フィールド維持）

**完了条件**:
- 検証テーブル 1〜6 の全ケースがパスする
- legalHolidayWeekday = null の場合、法定休日が一切判定されない
- 割増率が configSnapshot から正しく読み込まれる
- 端数処理が roundingMethod / roundingPrecision に従う
- キャリーオーバー attendance が元期間のコンテキストで計算される

---

### Step 05: 分散実行（executeMonthlyPayroll + processStaffPayroll + finalizePayrollRun）

**目的**: Cloud Tasks を使った分散給与計算の実行基盤を構築する

**カバーする仕様**:

| 仕様書 | セクション |
|--------|----------|
| 04_CALLABLE_API_SPEC | 3. executeMonthlyPayroll |
| 04_CALLABLE_API_SPEC | 4. processStaffPayroll |
| 04_CALLABLE_API_SPEC | 5. finalizePayrollRun |
| 04_CALLABLE_API_SPEC | 5-1. generateAnomalyFlags（枠組み） |
| 05_PROCESS_FLOW_SPEC | 1. payroll run のライフサイクル（payrollRuns.status 部分） |
| 05_PROCESS_FLOW_SPEC | 2. executeMonthlyPayroll の処理フロー |
| 05_PROCESS_FLOW_SPEC | 3. processStaffPayroll の処理フロー |
| 05_PROCESS_FLOW_SPEC | 4. finalizePayrollRun の処理フロー |
| 03_DATA_MODEL_SPEC | 2-1. ルートドキュメント（payrollRuns 関連フィールド。status の draft 設定含む） |
| 03_DATA_MODEL_SPEC | 2-2. payrollRuns サブコレクション |
| 03_DATA_MODEL_SPEC | 2-3. staffResults サブコレクション（taskStatus + 計算結果フィールド） |
| 03_DATA_MODEL_SPEC | 2-4. attendanceItems サブコレクション |
| 02_CONFIG_SPEC | 8. payroll run 開始時の snapshot（実書き込み） |
| DISTRIBUTED_EXECUTION_DESIGN.md | 全体 |

**主な成果物**:
- `executeMonthlyPayroll` Callable（run 作成 + Cloud Task 投入）
- `processStaffPayroll` onTaskDispatched（Step 04 のエンジン呼び出し + Firestore 書き込み）
- `finalizePayrollRun` onTaskDispatched（サマリ集計 + generateAnomalyFlags 枠組み）
- payrollRuns / staffResults / attendanceItems ドキュメント書き込み
- 冪等性ガード（taskStatus チェック、カウンタ二重加算防止）
- エミュレータテスト（Cloud Tasks のモック含む）

**完了条件**:
- executeMonthlyPayroll が run 作成 → タスク投入 → status "processing" で即レスポンスを返す
- processStaffPayroll が 1 staff 分の計算を実行し staffResults / attendanceItems に書き込む
- completedStaffCount が正しく increment される
- 全 staff 完了後に finalizePayrollRun が投入され、サマリ集計が行われる
- failedStaffCount > 0 → completed_with_errors、== 0 → completed
- 冪等性: 同一タスクの再実行で二重カウントが発生しない

---

### Step 06: 確定・再実行・中止

**目的**: run のライフサイクル管理を完成させる

**カバーする仕様**:

| 仕様書 | セクション |
|--------|----------|
| 04_CALLABLE_API_SPEC | 6. retryFailedStaffTasks |
| 04_CALLABLE_API_SPEC | 7. cancelPayrollRun |
| 04_CALLABLE_API_SPEC | 8. confirmPayrollRun |
| 04_CALLABLE_API_SPEC | 11. attendanceLogs（monthly_payroll_reflect, payroll_confirmed, carry_over_deferred） |
| 05_PROCESS_FLOW_SPEC | 1. payroll run のライフサイクル（monthlyPayroll.status の confirmed 遷移） |
| 05_PROCESS_FLOW_SPEC | 5. confirmPayrollRun の処理フロー |
| 05_PROCESS_FLOW_SPEC | 6. 再計算時の処理 |
| 05_PROCESS_FLOW_SPEC | 7. attendance 修正時の処理 |
| 03_DATA_MODEL_SPEC | 5-1. キャリーオーバー基本方針 |
| 03_DATA_MODEL_SPEC | 5-2. 当月 run 側のデータ |
| 03_DATA_MODEL_SPEC | 5-3. 元の期間の staffResults への記録 |
| 03_DATA_MODEL_SPEC | 5-4. キャリーオーバーの処理フロー |

**主な成果物**:
- `confirmPayrollRun` Callable（payrollStatus reflected 化、paymentStatus 初期化、キャリーオーバー deferredAttendances 追記）
- `retryFailedStaffTasks` Callable
- `cancelPayrollRun` Callable
- attendance onWrite トリガー拡張（corrected_after_reflection 時の通知作成トリガー。通知自体は Step 10 で実装）
- attendanceLogs 書き込み
- バッチ分割（400件ごと）
- エミュレータテスト

**完了条件**:
- confirmPayrollRun で全 attendance が reflected 化される
- キャリーオーバー attendance の元期間 staffResults に deferredAttendances が追記される
- 全 staffResults の paymentStatus が "unpaid" で初期化される
- retryFailedStaffTasks で failed staff のみが再投入される
- cancelPayrollRun で status が cancelled に遷移し、後続タスクが skip される
- confirmed 期間の再計算が拒否される

---

### Step 07: 支払い管理

**目的**: 確定後の支払いステータス管理を実装する

**カバーする仕様**:

| 仕様書 | セクション |
|--------|----------|
| 04_CALLABLE_API_SPEC | 9. registerPaymentStatus |
| 04_CALLABLE_API_SPEC | 11. attendanceLogs（payment_registered, payment_hold） |
| 05_PROCESS_FLOW_SPEC | 8. registerPaymentStatus の処理フロー |
| 05_PROCESS_FLOW_SPEC | 1. payroll run のライフサイクル（monthlyPayroll.status の hold/paid 自動遷移） |
| 03_DATA_MODEL_SPEC | 2-1. ルートドキュメント（paidAt、status 自動遷移ルール） |
| 03_DATA_MODEL_SPEC | 2-3. staffResults サブコレクション（paymentStatus 遷移） |

**主な成果物**:
- `registerPaymentStatus` Callable
- monthlyPayroll.status 自動遷移ロジック（unpaidCount / holdCount 集計）
- paymentStatus 遷移バリデーション（unpaid→paid, unpaid→hold, hold→paid）
- attendanceLogs 書き込み
- エミュレータテスト

**完了条件**:
- 個別 staff の paid / hold 登録が正しく動作する
- 全 staff paid → monthlyPayroll.status = "paid"（paidAt 設定）
- 全 staff paid/hold（hold あり）→ monthlyPayroll.status = "hold"
- paid → * の遷移が拒否される
- 一括登録（entries に全 staff を含む）が正しく動作する

---

### Step 08: 計算タブ UI（Flutter）

**目的**: 管理者が計算対象を選択し、計算を実行する画面を構築する

**カバーする仕様**:

| 仕様書 | セクション |
|--------|----------|
| 06_UI_SPEC | 1. adminHome へのメニュー追加 |
| 06_UI_SPEC | 2. 給与計算画面のタブ構成 |
| 06_UI_SPEC | 3-1. 属性の定義と表示 |
| 06_UI_SPEC | 3-2. 集計プレビュー |
| 06_UI_SPEC | 3-3. 計算対象期間・計算可能期間 |
| 06_UI_SPEC | 3-4. 確定後の再計算 |
| 06_UI_SPEC | 3-5. 対象データの抽出 |
| 06_UI_SPEC | 3-6. 給与計算実行 |
| 06_UI_SPEC | 3-7. 計算進捗表示 |
| 06_UI_SPEC | 3-8. エラー表示・再実行 |
| 05_PROCESS_FLOW_SPEC | 9. 実装責務の分担（Flutter 側の責務） |

**主な成果物**:
- adminHome メニュー追加
- 給与計算画面（2タブ構成）
- 計算用タブ（属性表示、折りたたみ、チェック、プレビュー、期間表示）
- getPayrollCandidates 呼び出し → group1/2/3 表示
- executeMonthlyPayroll 呼び出し → 進捗バー（snapshots リスニング）
- status ごとの表示切替（preparing / processing / aggregating / completed / failed / cancelled）
- エラー表示 + retryFailedStaffTasks / cancelPayrollRun 呼び出し

**完了条件**:
- adminHome から給与計算画面に遷移できる
- getPayrollCandidates の結果が属性別に正しく表示される
- 計算実行後に進捗バーがリアルタイムで更新される
- completed → 結果タブに自動遷移
- completed_with_errors → エラー表示 + 再実行ボタン

---

### Step 09: 計算結果タブ & 支払い管理 UI（Flutter）

**目的**: 計算結果の確認・確定・エクスポート・支払い管理の画面を構築する

**カバーする仕様**:

| 仕様書 | セクション |
|--------|----------|
| 06_UI_SPEC | 4-1. サマリ表示 |
| 06_UI_SPEC | 4-2. staff ごとのカード表示 |
| 06_UI_SPEC | 4-3. staff 詳細画面 |
| 06_UI_SPEC | 4-4. 確定ボタン |
| 06_UI_SPEC | 4-5. 計算結果チェック |
| 06_UI_SPEC | 4-6. CSV エクスポート |
| 06_UI_SPEC | 4-7. 印刷（一旦無視） |
| 06_UI_SPEC | 4-8. 過去の計算結果 |
| 06_UI_SPEC | 5-1. 支払い済み登録 |
| 06_UI_SPEC | 5-2. 支払日翌日以降の警告 |
| 06_UI_SPEC | 5-3. 保留ステータス |
| 06_UI_SPEC | 6. 既存機能との関係 |

**主な成果物**:
- サマリ表示（staffResults から UI 側で集計）
- staff カード一覧（grossPay 表示、割増アイコン、キャリーオーバー表示）
- staff 詳細画面（集計値、金額内訳、attendanceItems 明細）
- 確定ボタン（confirmPayrollRun 呼び出し、completed_with_errors 時は無効化）
- CSV エクスポート（15列定義）
- 過去の計算結果参照
- 支払い管理画面（staff ごとの paid/hold ボタン、一括登録、進捗表示）
- registerPaymentStatus 呼び出し

**完了条件**:
- サマリの totalGrossPay / 時間集計が正しく表示される
- staff カード → 詳細画面の遷移が動作する
- 確定ボタンが completed 時のみ有効
- CSV が 15列で正しく出力される
- 支払い管理で paid / hold の登録が動作する
- monthlyPayroll.status の表示が自動遷移に追従する

---

### Step 10: 通知・スケジューラー

**目的**: 通知基盤とスケジューラーを構築する

**カバーする仕様**:

| 仕様書 | セクション |
|--------|----------|
| 07_NOTIFICATION_SCHEDULER_SPEC | 1-1. 通知先 |
| 07_NOTIFICATION_SCHEDULER_SPEC | 1-2. adminHome での確認 |
| 07_NOTIFICATION_SCHEDULER_SPEC | 1-3. 通知の属性 |
| 07_NOTIFICATION_SCHEDULER_SPEC | 1-4. 表示 |
| 07_NOTIFICATION_SCHEDULER_SPEC | 1-5. コレクション |
| 07_NOTIFICATION_SCHEDULER_SPEC | 1-6. 通知テンプレート |
| 07_NOTIFICATION_SCHEDULER_SPEC | 2-1. スケジューラー経由の通知（定期判定） |
| 07_NOTIFICATION_SCHEDULER_SPEC | 2-2. イベント駆動の通知（インライン） |
| 07_NOTIFICATION_SCHEDULER_SPEC | 3-1. コスト最小化の方針 |
| 07_NOTIFICATION_SCHEDULER_SPEC | 3-2. 実行フロー |
| 07_NOTIFICATION_SCHEDULER_SPEC | 3-3. processPayrollNotifications の処理詳細 |
| 07_NOTIFICATION_SCHEDULER_SPEC | 3-4. 通知の重複抑止（冪等キー） |
| 07_NOTIFICATION_SCHEDULER_SPEC | 4. 既存 monthlyPayrollTrigger の変更 |
| 07_NOTIFICATION_SCHEDULER_SPEC | 5-1. 通知取得 |
| 07_NOTIFICATION_SCHEDULER_SPEC | 5-2. 通知更新 |
| 07_NOTIFICATION_SCHEDULER_SPEC | 5-3. 通知作成（内部のみ） |
| 03_DATA_MODEL_SPEC | 3. 通知コレクション |
| 04_CALLABLE_API_SPEC | 1. attendance 帰属情報付与処理（手順 7: corrected 通知作成） |
| 04_CALLABLE_API_SPEC | 3. executeMonthlyPayroll（致命的エラー時の failed 通知作成） |
| 04_CALLABLE_API_SPEC | 5. finalizePayrollRun（手順 8: completed/completed_with_errors 通知作成） |
| 05_PROCESS_FLOW_SPEC | 4. finalizePayrollRun の処理フロー（手順 8: 通知作成） |
| 05_PROCESS_FLOW_SPEC | 7. attendance 修正時の処理（corrected 通知） |

**主な成果物**:
- `PAYROLL_NOTIFICATION_TEMPLATES` 定数マップ
- `createPayrollNotification()` 共通関数（テンプレート展開 + 冪等キー生成 + doc 作成）
- インライン通知追加（finalizePayrollRun, executeMonthlyPayroll, attendance onWrite トリガー）
- `payrollNotificationScheduler` Cloud Function（Cloud Scheduler → Cloud Task 投入）
- `processPayrollNotifications` onTaskDispatched（5種の通知条件評価）
- Cloud Scheduler 設定（毎日 06:00 JST）
- 既存 monthlyPayrollTrigger の置き換え
- Flutter 通知一覧 UI（adminHome 内。createdAt >= 2ヶ月前フィルタ、未読/既読、フラグ）
- Firestore セキュリティルール（admin のみ通知更新可能）
- エミュレータテスト

**完了条件**:
- 9種の通知が正しいタイミングで作成される
- 冪等キーにより同日の重複通知が防止される
- スケジューラー → Cloud Task → 通知判定のフローが動作する
- schedulerNotificationHour の設定が反映される
- Flutter で通知一覧の取得・既読/フラグ更新が動作する

---

## 4. 仕様追跡マトリクス（正引き + 逆引き）

全仕様セクションが漏れなく実装ステップにマッピングされていることを保証する。

**凡例**: ✅ = 実装完了 / 🔲 = 未実装

### 01_CALC_SPEC

| セクション | 内容 | Step | 状態 |
|-----------|------|------|------|
| 1 | 用語定義 | 01 | ✅ |
| 2 | 計算の全体フロー | 04 | ✅ |
| 3 | 法定休日の判定 | 04 | ✅ |
| 4 | 法定休日の attendance | 04 | ✅ |
| 5 | 通常の attendance（コアアルゴリズム） | 04 | ✅ |
| 6 | 法定外休日の attendance | 04 | ✅ |
| 7 | 月跨ぎ週の処理ルール | 04 | ✅ |
| 8 | 月60時間超の計算 | 04 | ✅ |
| 9 | 深夜労働 | 04 | ✅ |
| 10 | 金額計算式 | 04 | ✅ |
| 11 | 重複計上の防止ルール | 04 | ✅ |
| 12 | staff 単位の集計値 | 04 | ✅ |
| 13 | attendance 明細（attendanceItems）の記録フィールド | 04 | ✅ |
| 13-1 | キャリーオーバー計算アルゴリズム | 04 | ✅ |
| 14 | 適用範囲と限界 | 04 | ✅ |
| 検証1〜6 | 検証テーブル | 04 | ✅ |
| 実装時修正事項 | nightWorkMinutes の休憩控除 | 02 | ✅ |

### 02_CONFIG_SPEC

| セクション | 内容 | Step | 状態 |
|-----------|------|------|------|
| 1 | 設定の配置方針 | 01 | ✅ |
| 2 | storeMeta/config — 既存設定 | 01 | ✅ |
| 3 | storeMeta/payrollConfig — 既存フィールド | 01 | ✅ |
| 4 | storeMeta/payrollConfig — 新規追加フィールド | 01 | ✅ |
| 5 | paymentPeriodKey のフォーマットと決定ロジック | 01 | ✅ |
| 6 | weekStartDate の決定ロジック | 01 | ✅ |
| 7 | 計算可能期間の導出 | 01 | ✅ |
| 8 | payroll run 開始時の snapshot | 01(型)✅, 05(実書込) | ✅ |
| 9 | payrollConfig の管理方針 | 01 | ✅ |

### 03_DATA_MODEL_SPEC

| セクション | 内容 | Step | 状態 |
|-----------|------|------|------|
| 1-1 | 既存フィールド（確認） | 02 | ✅ |
| 1-2 | 追加フィールド（新規） | 02 | ✅ |
| 1-3 | 廃止フィールド | 02 | ✅ |
| 1-4 | attendance に持たせないもの | 02 | ✅ |
| 2-1 | ルートドキュメント（monthlyPayroll） | 05(作成)✅, 06(confirmed)✅, 07(paid/hold)✅ | ✅ |
| 2-2 | payrollRuns サブコレクション | 05 | ✅ |
| 2-3 | staffResults サブコレクション（計算結果） | 05 | ✅ |
| 2-3 | staffResults サブコレクション（paymentStatus） | 06(初期化)✅, 07(更新)✅ | ✅ |
| 2-4 | attendanceItems サブコレクション | 05 | ✅ |
| 3 | 通知コレクション | 10 | ✅ |
| 4 | storeMeta/payrollConfig（参照先: 02） | 01 | ✅ |
| 5-1 | キャリーオーバー基本方針 | 06 | ✅ |
| 5-2 | 当月 run 側のデータ | 06 | ✅ |
| 5-3 | 元の期間の staffResults への記録 | 06 | ✅ |
| 5-4 | キャリーオーバーの処理フロー | 06 | ✅ |

### 04_CALLABLE_API_SPEC

| セクション | 内容 | Step | 状態 |
|-----------|------|------|------|
| 1 | attendance 帰属情報付与処理（手順 1〜6） | 02 | ✅ |
| 1 | attendance 帰属情報付与処理（手順 7: corrected 通知） | 10 | ✅ |
| 2 | getPayrollCandidates | 03 | ✅ |
| 3 | executeMonthlyPayroll（run 作成・タスク投入） | 05 | ✅ |
| 3 | executeMonthlyPayroll（致命的エラー時の failed 通知） | 10 | ✅ |
| 4 | processStaffPayroll | 05 | ✅ |
| 5 | finalizePayrollRun（サマリ集計 手順 1〜7） | 05 | ✅ |
| 5 | finalizePayrollRun（手順 8: 通知作成） | 10 | ✅ |
| 5-1 | generateAnomalyFlags | 05 | ✅ |
| 6 | retryFailedStaffTasks | 06 | ✅ |
| 7 | cancelPayrollRun | 06 | ✅ |
| 8 | confirmPayrollRun | 06 | ✅ |
| 9 | registerPaymentStatus | 07 | ✅ |
| 10 | エラーコード定義（共通） | 01 | ✅ |
| 11 | attendanceLogs（reflect, confirmed, deferred） | 06 | ✅ |
| 11 | attendanceLogs（payment_registered, payment_hold） | 07 | ✅ |

### 05_PROCESS_FLOW_SPEC

| セクション | 内容 | Step | 状態 |
|-----------|------|------|------|
| 1 | payroll run のライフサイクル（payrollRuns.status） | 05 | ✅ |
| 1 | payroll run のライフサイクル（monthlyPayroll.status: draft） | 05 | ✅ |
| 1 | payroll run のライフサイクル（monthlyPayroll.status: confirmed） | 06 | ✅ |
| 1 | payroll run のライフサイクル（monthlyPayroll.status: hold/paid） | 07 | ✅ |
| 2 | executeMonthlyPayroll の処理フロー | 05 | ✅ |
| 3 | processStaffPayroll の処理フロー | 05 | ✅ |
| 4 | finalizePayrollRun の処理フロー（手順 1〜7） | 05 | ✅ |
| 4 | finalizePayrollRun の処理フロー（手順 8: 通知） | 10 | ✅ |
| 5 | confirmPayrollRun の処理フロー | 06 | ✅ |
| 6 | 再計算時の処理 | 06 | ✅ |
| 7 | attendance 修正時の処理（corrected_after_reflection） | 06 | ✅ |
| 7 | attendance 修正時の処理（corrected 通知作成） | 10 | ✅ |
| 8 | registerPaymentStatus の処理フロー | 07 | ✅ |
| 9 | 実装責務の分担（計算タブ — Flutter） | 08 | ✅ |
| 9 | 実装責務の分担（結果タブ — Flutter） | 09 | ✅ |
| 9 | 実装責務の分担（通知 — Functions） | 10 | ✅ |

### 06_UI_SPEC

| セクション | 内容 | Step | 状態 |
|-----------|------|------|------|
| 1 | adminHome へのメニュー追加 | 08 | ✅ |
| 2 | 給与計算画面のタブ構成 | 08 | ✅ |
| 3-1 | 属性の定義と表示 | 08 | ✅ |
| 3-2 | 集計プレビュー | 08 | ✅ |
| 3-3 | 計算対象期間・計算可能期間 | 08 | ✅ |
| 3-4 | 確定後の再計算 | 08 | ✅ |
| 3-5 | 対象データの抽出 | 08 | ✅ |
| 3-6 | 給与計算実行 | 08 | ✅ |
| 3-7 | 計算進捗表示 | 08 | ✅ |
| 3-8 | エラー表示・再実行 | 08 | ✅ |
| 4-1 | サマリ表示 | 09 | ✅ |
| 4-2 | staff ごとのカード表示 | 09 | ✅ |
| 4-3 | staff 詳細画面 | 09 | ✅ |
| 4-4 | 確定ボタン | 09 | ✅ |
| 4-5 | 計算結果チェック | 09 | ✅ |
| 4-6 | CSV エクスポート | 09 | ✅ |
| 4-7 | 印刷 | 09 | ✅（仕様により未実装） |
| 4-8 | 過去の計算結果 | 09 | ✅ |
| 5-1 | 支払い済み登録 | 09 | ✅ |
| 5-2 | 支払日翌日以降の警告 | 09 | ✅ |
| 5-3 | 保留ステータス | 09 | ✅ |
| 6 | 既存機能との関係 | 09 | ✅ |

### 07_NOTIFICATION_SCHEDULER_SPEC

| セクション | 内容 | Step | 状態 |
|-----------|------|------|------|
| 1-1 | 通知先 | 10 | ✅ |
| 1-2 | adminHome での確認 | 10 | ✅ |
| 1-3 | 通知の属性 | 10 | ✅ |
| 1-4 | 表示 | 10 | ✅ |
| 1-5 | コレクション | 10 | ✅ |
| 1-6 | 通知テンプレート | 10 | ✅ |
| 2-1 | スケジューラー経由の通知（定期判定） | 10 | ✅ |
| 2-2 | イベント駆動の通知（インライン） | 10 | ✅ |
| 3-1 | コスト最小化の方針 | 10 | ✅ |
| 3-2 | 実行フロー | 10 | ✅ |
| 3-3 | processPayrollNotifications の処理詳細 | 10 | ✅ |
| 3-4 | 通知の重複抑止（冪等キー） | 10 | ✅ |
| 4 | 既存 monthlyPayrollTrigger の変更 | 10 | ✅ |
| 5-1 | 通知取得 | 10 | ✅ |
| 5-2 | 通知更新 | 10 | ✅ |
| 5-3 | 通知作成（内部のみ） | 10 | ✅ |

---

## 5. 補足事項

### 確定済み事項・懸念事項・改善要素

各仕様書の「確定済み事項一覧」「懸念事項一覧」「改善要素一覧」は仕様セクション内に包含されているため、マトリクスでは仕様セクション単位で追跡する。特に以下に注意:

- **01 確定 #6**: anomalyFlags 枠組み → Step 05 (generateAnomalyFlags) **✅ スタブ実装済み**
- **03 確定 #9**: anomalyFlags 枠組み → Step 05 **✅ スタブ実装済み**
- **04 懸念 #1**: 月跨ぎ週クエリ最適化 → Step 05 **✅ weekStartDate ベースで参照取得実装済み**
- **04 懸念 #3**: startDay/endDay 整合性 → Step 01 で注記、将来 UI で読み取り専用
- **05 懸念 #2**: 参照 attendance 一貫性 → 許容（Step 05 **✅ 実装時に認識済み**）
- **03 改善 #1**: 支払い管理フィールド → **対応済み**（03, 04, 05, 06, 07 に反映済み）

### DISTRIBUTED_EXECUTION_DESIGN.md

本ドキュメントは Step 05 の実装設計の補足資料として参照する。個別セクションのマトリクス追跡は行わない（04, 05 の仕様セクションに内容が包含されているため）。

### changeSpec の作成順序

1. Step 01 から順に changeSpec を作成し、実装 → 検証を繰り返す
2. 各 changeSpec は phase4_2 の形式を踏襲（対象ファイル一覧、As-Is/To-Be、実装順序、検証項目、チェックリスト）
3. 各 changeSpec の冒頭に「カバーする仕様セクション」を本マトリクスから転記する

---

## 6. ディレクトリ構成

```
phase4_3/
├── README.md
├── DISTRIBUTED_EXECUTION_DESIGN.md
├── IMPLEMENTATION_PLAN.md（本ファイル）
├── specs/
│   └── 01〜07（変更なし）
└── per_step/
    ├── step01_foundation/
    │   ├── changeSpec.md
    │   └── VERIFICATION_LOG.md
    ├── step02_attendance_trigger/
    │   ├── changeSpec.md
    │   └── VERIFICATION_LOG.md
    ├── step03_candidates/
    │   ├── changeSpec.md
    │   └── VERIFICATION_LOG.md
    ├── step04_calc_engine/
    │   ├── changeSpec.md
    │   └── VERIFICATION_LOG.md
    ├── step05_distributed_execution/
    │   ├── changeSpec.md
    │   └── VERIFICATION_LOG.md
    ├── step06_confirm_retry_cancel/
    │   ├── changeSpec.md
    │   └── VERIFICATION_LOG.md
    ├── step07_payment_management/
    │   ├── changeSpec.md
    │   └── VERIFICATION_LOG.md
    ├── step08_calc_tab_ui/
    │   ├── changeSpec.md
    │   └── VERIFICATION_LOG.md
    ├── step09_result_tab_ui/
    │   ├── changeSpec.md
    │   └── VERIFICATION_LOG.md
    └── step10_notification_scheduler/
        ├── changeSpec.md
        └── VERIFICATION_LOG.md
```
