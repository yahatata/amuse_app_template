# Step 05: 分散実行 — changeSpec

**作成日**: 2026-03-22

---

## カバーする仕様セクション

| 仕様書 | セクション |
|--------|----------|
| 04_CALLABLE_API_SPEC | 3. executeMonthlyPayroll（run 作成・タスク投入） |
| 04_CALLABLE_API_SPEC | 4. processStaffPayroll |
| 04_CALLABLE_API_SPEC | 5. finalizePayrollRun（手順 1〜7） |
| 04_CALLABLE_API_SPEC | 5-1. generateAnomalyFlags（枠組み） |
| 05_PROCESS_FLOW_SPEC | 1. payroll run のライフサイクル（payrollRuns.status 部分） |
| 05_PROCESS_FLOW_SPEC | 1. payroll run のライフサイクル（monthlyPayroll.status: draft） |
| 05_PROCESS_FLOW_SPEC | 2. executeMonthlyPayroll の処理フロー |
| 05_PROCESS_FLOW_SPEC | 3. processStaffPayroll の処理フロー |
| 05_PROCESS_FLOW_SPEC | 4. finalizePayrollRun の処理フロー |
| 03_DATA_MODEL_SPEC | 2-1. ルートドキュメント（payrollRuns 関連フィールド。status の draft 設定含む） |
| 03_DATA_MODEL_SPEC | 2-2. payrollRuns サブコレクション |
| 03_DATA_MODEL_SPEC | 2-3. staffResults サブコレクション（taskStatus + 計算結果フィールド） |
| 03_DATA_MODEL_SPEC | 2-4. attendanceItems サブコレクション |
| 02_CONFIG_SPEC | 8. payroll run 開始時の snapshot（実書き込み） |
| DISTRIBUTED_EXECUTION_DESIGN.md | 全体 |

> 注: 04_CALLABLE_API_SPEC §3 の「致命的エラー時の failed 通知」と §5 の「手順8: 通知作成」は Step 10（通知）でカバー。本ステップでは通知関連の処理を TODO コメントとして残す。

---

## 変更一覧

### 変更 1: executeMonthlyPayroll Callable

**ファイル**: `functions/src/domains/attendance/callables/executeMonthlyPayroll.ts`（新規）

**処理フロー**:
1. 認証 + admin 権限チェック
2. paymentPeriodKey / attendanceIds のバリデーション
3. monthlyPayroll の confirmed チェック
4. payrollConfig / storeConfig から snapshot 取得
5. attendance 一括取得 + バリデーション（存在、clockOut 有無）
6. 通常/キャリーオーバー分類 + staffId グルーピング
7. payrollRuns ドキュメント作成（status=preparing, snapshot, counts）
8. staff ごとに staffResults 作成（taskStatus=pending, assignedAttendanceIds）
9. staff ごとに Cloud Tasks 投入（`getFunctions().taskQueue("processStaffPayroll").enqueue()`）
10. payrollRuns.status = processing に更新
11. レスポンス返却

**Cloud Tasks 投入方法**: Firebase Admin SDK の `getFunctions().taskQueue()` を使用（`firebase-admin/functions`）。既存の `CloudTasksClient` 直接利用パターンとは異なるが、`onTaskDispatched` と組み合わせる Gen2 標準パターンに準拠。

### 変更 2: processStaffPayroll onTaskDispatched

**ファイル**: `functions/src/domains/attendance/tasks/processStaffPayroll.ts`（新規）

**処理フロー**:
1. payrollRuns.status が cancelled/failed → return
2. staffResults.taskStatus が completed → return（冪等性）
3. taskStatus = processing に更新
4. assignedAttendanceIds / assignedCarryOverAttendanceIds 取得
5. attendance 一括取得
6. payrollRuns から config snapshot 読み取り → CalcConfigInput 構築
7. staffs/{staffId} から時給・氏名取得
8. 月跨ぎ週の参照用 attendance 追加取得
9. キャリーオーバー参照用 attendance 追加取得
10. Step 04 の `calculateStaffPayroll()` + `calculateCarryOverPayroll()` 呼び出し
11. attendanceItems を batch.set() で書き込み
12. トランザクション内で staffResults 更新 + completedStaffCount increment
13. 完了判定 → finalizePayrollRun タスク投入

**失敗時**: トランザクション内で failedStaffCount increment + taskStatus=failed

### 変更 3: finalizePayrollRun onTaskDispatched

**ファイル**: `functions/src/domains/attendance/tasks/finalizePayrollRun.ts`（新規）

**処理フロー**:
1. payrollRuns.status が completed/completed_with_errors → return（冪等性）
2. status = aggregating に更新
3. staffResults 全件読み取り
4. サマリ集計（totalBasePay, totalPremiumPay, totalGrossPay, warningCount）
5. generateAnomalyFlags() 呼び出し（空配列を返すスタブ）
6. payrollRuns 更新（status, finishedAt, totals）
7. monthlyPayroll ルートドキュメント更新（latestRunId, status=draft）
8. TODO: 通知作成（Step 10）

### 変更 4: generateAnomalyFlags スタブ

**ファイル**: `functions/src/domains/attendance/helpers/generateAnomalyFlags.ts`（新規）

初期リリースでは常に空配列を返す。関数シグネチャのみ定義。

### 変更 5: index.ts への export 追加

**ファイル**: `functions/src/domains/attendance/index.ts`（変更）

3 関数を export 追加。

---

## 実装順序

1. `generateAnomalyFlags.ts` 新規作成（スタブ）
2. `executeMonthlyPayroll.ts` 新規作成
3. `processStaffPayroll.ts` 新規作成
4. `finalizePayrollRun.ts` 新規作成
5. `index.ts` への export 追加
6. テストコード作成・実行

---

## テスト計画

**ファイル**: `functions/__tests__/attendance/executeMonthlyPayroll.spec.ts`

Step 05 は Firestore + Cloud Tasks に強く依存するため、テスタブルな部分を抽出してテストする。

### テスタブルなロジックの抽出

| ロジック | 抽出先 | テスト方式 |
|---------|--------|-----------|
| attendance の通常/CO 分類 | `classifyAttendancesForRun()` | 純粋関数テスト |
| staffId グルーピング | `groupByStaffId()` | 純粋関数テスト |
| config snapshot 構築 | `buildRunSnapshot()` | 純粋関数テスト |
| CalcConfigInput 構築 | `buildCalcConfigFromSnapshot()` | 純粋関数テスト |
| サマリ集計 | `aggregateStaffResults()` | 純粋関数テスト |
| generateAnomalyFlags | 直接 | 空配列テスト |
| 完了判定 | `isRunComplete()` | 純粋関数テスト |

### テストケース

| # | テストケース | 期待値 |
|---|---|---|
| E1 | attendance 分類: paymentPeriodKey 一致→通常、不一致→CO | 正しい分類 |
| E2 | staffId グルーピング | 正しいグルーピング |
| E3 | config snapshot 構築: 全 snapshot フィールドが正しくコピー | 全フィールド一致 |
| E4 | CalcConfigInput 構築: snapshot → CalcConfigInput 変換 | 型一致 |
| E5 | サマリ集計: 2 staff の grossPay 合算 | 正しい合計 |
| E6 | サマリ集計: failed staff は集計除外 | failed 分が除外 |
| E7 | generateAnomalyFlags: 常に空 | [] |
| E8 | 完了判定: completed + failed == target → true | true |
| E9 | 完了判定: completed + failed < target → false | false |
| E10 | paymentPeriodKey バリデーション | 正規表現テスト |

> Callable / onTaskDispatched 全体の統合テストはエミュレータで実施。

---

## Step01〜04 との整合性

| 前ステップ成果物 | 本 Step での使用箇所 |
|---|---|
| `PayrollRunSnapshot` 型 (Step01) | executeMonthlyPayroll で payrollRuns に書き込む snapshot |
| `StaffResultSnapshot` 型 (Step01) | processStaffPayroll で staffResults に書き込む snapshot |
| `getPayrollConfig()` (Step01) | executeMonthlyPayroll で snapshot 取得 |
| `PayrollRunStatus` 型 (Step01) | payrollRuns.status の遷移管理 |
| `MonthlyPayrollStatus` 型 (Step01) | monthlyPayroll.status の設定 |
| `PAYROLL_ERRORS` (Step01) | エラーハンドリング |
| `calculateStaffPayroll()` (Step04) | processStaffPayroll 内で計算実行 |
| `calculateCarryOverPayroll()` (Step04) | processStaffPayroll 内でキャリーオーバー計算 |
| `CalcAttendanceInput` 型 (Step04) | attendance → CalcAttendanceInput 変換 |
| `CalcConfigInput` 型 (Step04) | snapshot → CalcConfigInput 変換 |
| `StaffCalcResult` / `AttendanceItemResult` 型 (Step04) | 計算結果の書き込み |
| `getCallerDeviceByUid` / `isActive` | 既存パターンの権限チェック |

---

## 追記: processStaffPayroll トランザクション修正（2026-03-22）

**対象ファイル**: `functions/src/domains/attendance/tasks/processStaffPayroll.ts`

**何をしたか**

- 成功時・失敗時の **`db.runTransaction` 各1箇所**で、`staffResults` / `payrollRuns` の更新（`trx.update`）**のあとに** `trx.get(runRef)` していたため、Firestore の制約違反（**すべての read をすべての write より前に実行すること**）となり、実行時エラー `Firestore transactions require all reads to be executed before all writes` が発生していた。
- **修正内容**: トランザクション冒頭で **`staffResultRef` と `runRef` を両方 `trx.get` してから**のみ `trx.update` を行う。`completedStaffCount` / `failedStaffCount` の `increment` 後に再読みせず、**トランザクション開始時の `payrollRuns` スナップショットから** `finalizePayrollRun` 投入判定用の件数（完了+1 / 失敗+1）を算出して返す。

**なぜ必要か**

- Cloud Tasks から `processStaffPayroll` が呼ばれてもトランザクションが毎回失敗し、**スタッフ計算が完了しない・失敗更新もできない**状態になっていたため。
