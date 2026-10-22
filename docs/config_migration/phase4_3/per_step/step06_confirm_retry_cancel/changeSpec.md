# Step 06: 確定・再実行・中止 — changeSpec

**作成日**: 2026-03-22

---

## カバーする仕様セクション

| 仕様書 | セクション | 内容 |
|--------|-----------|------|
| 04_CALLABLE_API_SPEC | §6 | retryFailedStaffTasks |
| 04_CALLABLE_API_SPEC | §7 | cancelPayrollRun |
| 04_CALLABLE_API_SPEC | §8 | confirmPayrollRun |
| 04_CALLABLE_API_SPEC | §11 | attendanceLogs（payroll_confirmed, carry_over_deferred） |
| 05_PROCESS_FLOW_SPEC | §1 | monthlyPayroll.status の confirmed 遷移 |
| 05_PROCESS_FLOW_SPEC | §5 | confirmPayrollRun の処理フロー |
| 05_PROCESS_FLOW_SPEC | §6 | 再計算時の処理 |
| 05_PROCESS_FLOW_SPEC | §7 | attendance 修正時の処理 |
| 03_DATA_MODEL_SPEC | §5-1 | キャリーオーバー基本方針 |
| 03_DATA_MODEL_SPEC | §5-2 | 当月 run 側のデータ |
| 03_DATA_MODEL_SPEC | §5-3 | 元の期間の staffResults への記録 |
| 03_DATA_MODEL_SPEC | §5-4 | キャリーオーバーの処理フロー |

---

## 変更一覧

### 変更 1: confirmPayrollRun Callable 新規作成

**ファイル**: `functions/src/domains/attendance/callables/confirmPayrollRun.ts`

**As-Is**: 存在しない

**To-Be**: admin 権限で呼び出し、以下を順に実行する Callable

1. **入力検証**: paymentPeriodKey / runId / admin 権限 / 未確定チェック
2. **run 特定**: runId 指定時はそのまま、未指定時は `monthlyPayroll.latestRunId` を使用
3. **run.status == "completed" 確認**: `completed_with_errors` は確定不可
4. **staffResults 全件取得** → attendanceItems から全 attendanceId を収集
5. **attendance payrollStatus 更新**: `reflected` に変更、`reflectedPayrollRunId` / `reflectedAt` を設定。400 件ごとにバッチ分割
6. **キャリーオーバー処理**: `isCarryOver == true` の attendanceItems について、元の期間の confirmed 済み staffResults に `deferredAttendances` を追記（`arrayUnion`）
7. **paymentStatus 初期化**: 全 staffResults の `paymentStatus = "unpaid"` に設定
8. **monthlyPayroll 更新**: `status = "confirmed"`, `confirmedAt`, `confirmedByDeviceId`
9. **attendanceLogs 書き込み**: 対象 attendance に `payroll_confirmed` / CO 分に `carry_over_deferred`

**テスタブルロジック抽出**:
- `collectAttendanceIdsFromStaffResults(staffResults, runRef)` — staffResults から attendanceItems を読み取り、通常/CO の attendanceId リストを構築
- `buildDeferredAttendanceEntry(attendanceItem, currentPeriodKey, runId)` — DeferredAttendance 構造体を生成

### 変更 2: retryFailedStaffTasks Callable 新規作成

**ファイル**: `functions/src/domains/attendance/callables/retryFailedStaffTasks.ts`

**As-Is**: 存在しない

**To-Be**: admin 権限で呼び出し、以下を実行する Callable

1. **入力検証**: paymentPeriodKey / runId / admin 権限
2. **run.status == "completed_with_errors" 確認**
3. **staffResults から taskStatus == "failed" の staff を抽出**
4. **各 failed staff**:
   - `taskStatus = "pending"` にリセット
   - `taskError = null` にクリア
   - Cloud Task 再投入
5. **payrollRuns 更新**: `status = "processing"`, `failedStaffCount = 0`
6. **レスポンス**: `{ retriedCount, failedStaffIds }`

### 変更 3: cancelPayrollRun Callable 新規作成

**ファイル**: `functions/src/domains/attendance/callables/cancelPayrollRun.ts`

**As-Is**: 存在しない

**To-Be**: admin 権限で呼び出し、以下を実行する Callable

1. **入力検証**: paymentPeriodKey / runId / admin 権限
2. **run.status が "preparing" or "processing" であること確認**
3. **payrollRuns.status = "cancelled" に更新**
4. 既に投入済みの Cloud Tasks は `processStaffPayroll` 側で status チェックして skip（Step 05 実装済み）

### 変更 4: index.ts 更新

3つの新 Callable のエクスポートを追加。

### 変更 5: テスタブルヘルパー追加

**ファイル**: `functions/src/domains/attendance/helpers/confirmPayrollHelpers.ts`

テスタブルな純粋関数:
- `buildDeferredAttendance(attendanceId, currentPeriodKey, runId, grossPayContribution)` — DeferredAttendance オブジェクト構築
- `groupCarryOverByOriginalPeriod(coItems)` — CO attendanceItems を元期間ごとにグルーピング

---

## テスト計画

### ユニットテスト（Firestore 非依存）

| ID | テスト内容 | 対象 |
|----|-----------|------|
| H-1 | buildDeferredAttendance が正しい構造体を返す | confirmPayrollHelpers |
| H-2 | groupCarryOverByOriginalPeriod が元期間ごとにグルーピングする | confirmPayrollHelpers |
| H-3 | CO なしの場合は空マップを返す | confirmPayrollHelpers |

### ロジック検証テスト

| ID | テスト内容 | 対象 |
|----|-----------|------|
| L-1 | cancelPayrollRun: preparing → cancelled | cancelPayrollRun |
| L-2 | cancelPayrollRun: processing → cancelled | cancelPayrollRun |
| L-3 | cancelPayrollRun: completed → reject (invalid-run-status) | cancelPayrollRun |
| L-4 | retryFailedStaffTasks: completed_with_errors → processing | retryFailedStaffTasks |
| L-5 | retryFailedStaffTasks: completed → reject | retryFailedStaffTasks |
| L-6 | confirmPayrollRun: completed → confirmed | confirmPayrollRun |
| L-7 | confirmPayrollRun: completed_with_errors → reject | confirmPayrollRun |
| L-8 | confirmPayrollRun: already confirmed → reject | confirmPayrollRun |
| L-9 | 400件超のバッチ分割が正しく動作する | confirmPayrollRun |

### 実機確認が必要な項目

| 項目 | 確認内容 |
|------|---------|
| Cloud Tasks 再投入 | retryFailedStaffTasks 後に processStaffPayroll が正しく再実行される |
| キャリーオーバー記録 | 元期間の confirmed staffResults に deferredAttendances が追記される |
| attendanceLogs | payroll_confirmed / carry_over_deferred が正しく書き込まれる |

---

## 実装順序

1. `confirmPayrollHelpers.ts`（テスタブルヘルパー）
2. `confirmPayrollRun.ts`（最も複雑。CO 処理含む）
3. `retryFailedStaffTasks.ts`
4. `cancelPayrollRun.ts`
5. `index.ts` エクスポート追加
6. テストコード作成・実行
