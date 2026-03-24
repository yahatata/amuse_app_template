# Step 03: 対象データ抽出（getPayrollCandidates）— changeSpec

**作成日**: 2026-03-22

---

## カバーする仕様セクション

| 仕様書 | セクション |
|--------|----------|
| 04_CALLABLE_API_SPEC | 2. getPayrollCandidates（全体） |

---

## 変更一覧

### 変更 1: getPayrollCandidates Callable 新規作成

**ファイル**: `functions/src/domains/attendance/callables/getPayrollCandidates.ts`（新規）

**As-Is**: `getPayrollData` が存在するが、monthlyPayroll コレクションからの読み取りであり、attendance の候補抽出機能はない。

**To-Be**: paymentPeriodKey を受け取り、attendance を group1/2/3 に分類して返す Callable。

```typescript
export const getPayrollCandidates = onCall(async (request: CallableRequest) => {
  // 1. 認証 + admin 権限チェック（既存パターン: device.role === 'admin'）
  // 2. paymentPeriodKey のバリデーション（YYYY-MM-DD_YYYY-MM-DD 形式）
  // 3. payrollConfig を取得（maxCandidatesCount）
  // 4. periodStart / periodEnd を paymentPeriodKey からパース
  //
  // 5. group1: 期間内 + 退勤済 + 非削除 + payrollStatus in [unreflected, corrected_after_reflection]
  //    → attendances where paymentPeriodKey == key, clockOut != null, isDeleted == false,
  //      payrollStatus in ['unreflected', 'corrected_after_reflection']
  //
  // 6. group2: 期間外 + 非削除 + payrollStatus in [unreflected, corrected_after_reflection]
  //    → attendances where paymentPeriodKey != key, clockOut != null, isDeleted == false,
  //      payrollStatus in ['unreflected', 'corrected_after_reflection']
  //    ※ Firestore では != クエリが制約あるため、全 unreflected/corrected を取得し group1 を除外
  //
  // 7. group3: 期間内 + (未退勤 or 論理削除)
  //    → attendances where paymentPeriodKey == key, (clockOut == null or isDeleted == true)
  //
  // 8. 件数制限（maxCandidatesCount）
  // 9. CandidateEntry 形式にマッピングして返却
});
```

**Firestore クエリ戦略**:
- group1: `paymentPeriodKey == key` + `isDeleted == false` + `payrollStatus in ['unreflected', 'corrected_after_reflection']` → clockOut != null をコード側でフィルタ
- group2: `isDeleted == false` + `payrollStatus in ['unreflected', 'corrected_after_reflection']` → `paymentPeriodKey != key` をコード側でフィルタ（group1 のクエリ結果を除外）
- group3: `paymentPeriodKey == key` → コード側で `clockOut == null || isDeleted == true` をフィルタ

> group2 はクエリ最適化の余地があるが、payrollStatus が unreflected/corrected の attendance は通常少量であるため、初期実装ではシンプルな全件取得 + フィルタで対応する。

### 変更 2: index.ts への export 追加

**ファイル**: `functions/src/domains/attendance/index.ts`（変更）

---

## 実装順序

1. `getPayrollCandidates.ts` 新規作成
2. `index.ts` への export 追加
3. テストコード作成・実行

---

## テスト計画

**ファイル**: `functions/__tests__/attendance/getPayrollCandidates.spec.ts`

| # | テストケース | 期待値 |
|---|---|---|
| 1 | 期間内 + 退勤済 + 非削除 + unreflected → group1 | reasonType=in_period |
| 2 | 期間内 + 退勤済 + 非削除 + corrected_after_reflection → group1 | reasonType=in_period |
| 3 | 期間内 + 退勤済 + reflected → group 対象外 | group1/2/3 いずれにも含まれない |
| 4 | 期間外 + 退勤済 + 非削除 + unreflected → group2 | reasonType=carry_over |
| 5 | 期間内 + 未退勤 → group3 | reasonType=other |
| 6 | 期間内 + 論理削除 → group3 | reasonType=other |
| 7 | 期間外 + 論理削除 → 返却対象外 | group1/2/3 いずれにも含まれない |
| 8 | paymentPeriodKey 形式不正 → invalid-argument エラー | HttpsError |
| 9 | admin 以外の呼び出し → permission-denied エラー | HttpsError |
| 10 | maxCandidatesCount による件数制限 | group1+group2+group3 合計が制限内 |
| 11 | CandidateEntry の全フィールドが正しくマッピングされる | 各フィールド検証 |

> テストは Callable のロジック部分を抽出した関数でテストする（Firestore 依存を最小化）。統合テストはエミュレータで実施。

---

## Step01/02 との整合性

| 前ステップ成果物 | 本 Step での使用箇所 |
|---|---|
| `payrollConfigLoader.getPayrollConfig()` | maxCandidatesCount の取得 |
| `payrollCalcTypes.PayrollStatus` | payrollStatus のフィルタ条件 |
| `payrollCalcTypes.CandidateReasonType` | reasonType のマッピング |
| Step02 attendanceOnWrite | attendance に paymentPeriodKey / payrollStatus が設定済みである前提 |
