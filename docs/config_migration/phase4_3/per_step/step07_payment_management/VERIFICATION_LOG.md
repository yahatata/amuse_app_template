# Step 07: 支払い管理 — VERIFICATION_LOG

**実装日**: 2026-03-22
**ステータス**: 完了

---

## 1. テスト結果

### 新規テスト

| テストスイート | テスト数 | 結果 |
|---------------|---------|------|
| paymentStatusHelpers.spec.ts | 10 | 全 PASS |
| **合計** | **10** | **全 PASS** |

### リグレッションテスト（全 payroll 関連テスト）

| テストスイート | テスト数 | 結果 |
|---------------|---------|------|
| paymentStatusHelpers.spec.ts | 10 | PASS |
| confirmPayrollHelpers.spec.ts | 10 | PASS |
| payrollRunHelpers.spec.ts | 12 | PASS |
| generateAnomalyFlags.spec.ts | 2 | PASS |
| payrollCalcEngine.spec.ts | 32 | PASS |
| payrollPeriodUtils.spec.ts | 19 | PASS |
| payrollErrors.spec.ts | 3 | PASS |
| getPayrollCandidates.spec.ts | 26 | PASS |
| attendanceOnWrite.spec.ts | 13 | PASS |
| **合計** | **127** | **全 PASS** |

※ recalculateNightBreaks.spec.ts（7件 FAIL）は既知の pre-existing issue

### テストカバレッジ（paymentStatusHelpers）

| テスト ID | テスト内容 | 対象関数 |
|-----------|-----------|---------|
| V-1 | unpaid → paid は allowed | validatePaymentStatusTransition |
| V-2 | unpaid → hold は allowed | validatePaymentStatusTransition |
| V-3 | hold → paid は allowed | validatePaymentStatusTransition |
| V-4 | paid → paid は reject | validatePaymentStatusTransition |
| V-5 | paid → hold は reject | validatePaymentStatusTransition |
| V-6 | hold → hold は skip | validatePaymentStatusTransition |
| D-1 | unpaid=0, hold=0 → "paid" | determineMonthlyPayrollStatus |
| D-2 | unpaid=0, hold=3 → "hold" | determineMonthlyPayrollStatus |
| D-3 | unpaid=2, hold=0 → "confirmed" | determineMonthlyPayrollStatus |
| D-4 | unpaid=1, hold=1 → "confirmed" | determineMonthlyPayrollStatus |

---

## 2. ファイル変更一覧

### 新規作成

| ファイル | 説明 |
|---------|------|
| `functions/src/domains/attendance/helpers/paymentStatusHelpers.ts` | 遷移バリデーション + status 決定ロジック |
| `functions/src/domains/attendance/callables/registerPaymentStatus.ts` | Callable 本体 |
| `functions/__tests__/attendance/paymentStatusHelpers.spec.ts` | ユニットテスト |

### 変更

| ファイル | 変更内容 |
|---------|---------|
| `functions/src/domains/attendance/index.ts` | registerPaymentStatus のエクスポート追加 |

---

## 3. 仕様カバレッジ

| 仕様 | セクション | 内容 | 状態 |
|------|-----------|------|------|
| 04_CALLABLE_API_SPEC | §9 | registerPaymentStatus | ✅ |
| 04_CALLABLE_API_SPEC | §11 | attendanceLogs（payment_registered, payment_hold） | ✅ |
| 05_PROCESS_FLOW_SPEC | §8 | registerPaymentStatus の処理フロー | ✅ |
| 05_PROCESS_FLOW_SPEC | §1 | monthlyPayroll.status の hold/paid 自動遷移 | ✅ |
| 03_DATA_MODEL_SPEC | §2-1 | paidAt、status 自動遷移ルール | ✅ |
| 03_DATA_MODEL_SPEC | §2-3 | paymentStatus 遷移 | ✅ |

---

## 4. 手動確認事項

| 項目 | 状況 |
|------|------|
| TypeScript コンパイル（`tsc --noEmit`） | ✅ エラーなし |
| リグレッションテスト | ✅ 127 テスト全 PASS |
| registerPaymentStatus E2E | 🔲 Emulator で手動確認予定 |
| monthlyPayroll.status 自動遷移 | 🔲 Emulator で手動確認予定 |
| attendanceLogs 書き込み確認 | 🔲 Emulator で手動確認予定 |

---

## 5. 既知の制約・注意事項

1. **staff-already-paid のハンドリング**: paid の staff が entries に含まれた場合はスキップし、他の entries は処理を継続する（partial success）
2. **attendanceLogs の件数**: 各 staff の全 attendance に対してログを書き込むため、大量の staff を一括処理する場合は Callable のタイムアウト（300秒）に注意
3. **monthlyPayroll.status の自動遷移**: registerPaymentStatus 内で集計・更新するため、外部から直接 monthlyPayroll.status を変更する必要はない
