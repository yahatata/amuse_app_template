# Step 06: 確定・再実行・中止 — VERIFICATION_LOG

**実装日**: 2026-03-22
**ステータス**: 完了

---

## 1. テスト結果

### 新規テスト

| テストスイート | テスト数 | 結果 |
|---------------|---------|------|
| confirmPayrollHelpers.spec.ts | 10 | 全 PASS |
| **合計** | **10** | **全 PASS** |

### リグレッションテスト（全 payroll 関連テスト）

| テストスイート | テスト数 | 結果 |
|---------------|---------|------|
| confirmPayrollHelpers.spec.ts | 10 | PASS |
| payrollRunHelpers.spec.ts | 12 | PASS |
| generateAnomalyFlags.spec.ts | 2 | PASS |
| payrollCalcEngine.spec.ts | 32 | PASS |
| payrollPeriodUtils.spec.ts | 19 | PASS |
| payrollErrors.spec.ts | 3 | PASS |
| getPayrollCandidates.spec.ts | 26 | PASS |
| attendanceOnWrite.spec.ts | 13 | PASS |
| payrollConfigLoader.spec.ts | 10 | PASS |
| **合計** | **127** | **全 PASS** |

### テストカバレッジ（confirmPayrollHelpers）

| テスト ID | テスト内容 | 対象関数 |
|-----------|-----------|---------|
| H-1 | DeferredAttendance 構造体生成 | buildDeferredAttendance |
| H-1b | grossPayContribution = 0 | buildDeferredAttendance |
| H-2 | 元期間ごとのグルーピング | groupCarryOverByOriginalPeriod |
| H-3 | 空配列 → 空マップ | groupCarryOverByOriginalPeriod |
| H-2b | 全て同一期間 → 1グループ | groupCarryOverByOriginalPeriod |
| CH-1 | 800件 → 2チャンク | chunkArray |
| CH-2 | 401件 → 400 + 1 | chunkArray |
| CH-3 | 100件 → 1チャンク | chunkArray |
| CH-4 | 空配列 → 空 | chunkArray |
| CH-5 | 400件ぴったり → 1チャンク | chunkArray |

---

## 2. ファイル変更一覧

### 新規作成

| ファイル | 説明 |
|---------|------|
| `functions/src/domains/attendance/helpers/confirmPayrollHelpers.ts` | テスタブルヘルパー（DeferredAttendance, CO グルーピング, chunkArray） |
| `functions/src/domains/attendance/callables/confirmPayrollRun.ts` | 確定 Callable |
| `functions/src/domains/attendance/callables/retryFailedStaffTasks.ts` | 再試行 Callable |
| `functions/src/domains/attendance/callables/cancelPayrollRun.ts` | 中止 Callable |
| `functions/__tests__/attendance/confirmPayrollHelpers.spec.ts` | ヘルパー群のユニットテスト |

### 変更

| ファイル | 変更内容 |
|---------|---------|
| `functions/src/domains/attendance/index.ts` | confirmPayrollRun, retryFailedStaffTasks, cancelPayrollRun のエクスポート追加 |

---

## 3. 仕様カバレッジ

| 仕様 | セクション | 内容 | 状態 |
|------|-----------|------|------|
| 04_CALLABLE_API_SPEC | §6 | retryFailedStaffTasks | ✅ |
| 04_CALLABLE_API_SPEC | §7 | cancelPayrollRun | ✅ |
| 04_CALLABLE_API_SPEC | §8 | confirmPayrollRun | ✅ |
| 04_CALLABLE_API_SPEC | §11 | attendanceLogs（payroll_confirmed, carry_over_deferred） | ✅ |
| 05_PROCESS_FLOW_SPEC | §1 | monthlyPayroll.status confirmed 遷移 | ✅ |
| 05_PROCESS_FLOW_SPEC | §5 | confirmPayrollRun の処理フロー | ✅ |
| 05_PROCESS_FLOW_SPEC | §6 | 再計算時の処理（draft 再 run は Step05 で対応済み。confirmed は拒否） | ✅ |
| 05_PROCESS_FLOW_SPEC | §7 | attendance 修正時（corrected は Step02 onWrite 実装済み。通知は Step10） | ✅ |
| 03_DATA_MODEL_SPEC | §5-1 | キャリーオーバー基本方針 | ✅ |
| 03_DATA_MODEL_SPEC | §5-2 | 当月 run 側のデータ | ✅ |
| 03_DATA_MODEL_SPEC | §5-3 | 元期間 staffResults への deferredAttendances 記録 | ✅ |
| 03_DATA_MODEL_SPEC | §5-4 | キャリーオーバーの処理フロー | ✅ |

---

## 4. 手動確認事項

| 項目 | 状況 |
|------|------|
| TypeScript コンパイル（`tsc --noEmit`） | ✅ エラーなし |
| リグレッションテスト | ✅ 127 テスト全 PASS |
| confirmPayrollRun E2E | 🔲 Emulator で手動確認予定 |
| retryFailedStaffTasks E2E | 🔲 Emulator で手動確認予定 |
| cancelPayrollRun E2E | 🔲 Emulator で手動確認予定 |
| attendanceLogs 書き込み確認 | 🔲 Emulator で手動確認予定 |

---

## 5. 既知の制約・注意事項

1. **attendanceLogs の件数**: confirmPayrollRun は全 attendance に対して `payroll_confirmed` ログを書くため、attendance が多い場合はログ書き込みに時間がかかる。Callable のタイムアウト（300秒）内で完了する必要がある
2. **CO の grossPayContribution**: 現時点では 0 固定。attendanceItems に grossPayContribution を持たせる場合は将来拡張
3. **monthly_payroll_reflect**: 仕様§11に定義あるが、processStaffPayroll 完了時ではなく confirm 時の `payroll_confirmed` でカバー
