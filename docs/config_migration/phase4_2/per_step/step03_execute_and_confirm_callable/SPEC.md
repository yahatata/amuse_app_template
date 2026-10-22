# Step03: 計算実行・確定 Callable — 仕様確定

**作成日**: 2026-03-20  
**対象 STEP_PLAN**: [per_step/step03_execute_and_confirm_callable/STEP_PLAN.md](./STEP_PLAN.md)  
**ステータス**: 草案（レビュー待ち）

---

## 1. 前ステップとの整合性確認

> 仕様確定の最初に必ず記入する。Step01・Step02 で決定・実装予定の内容と当ステップの仕様が矛盾しないことを確認する。

| 確認項目 | 前ステップの決定内容 | 当ステップへの影響 | 問題なし/要対応 |
|----------|---------------------|-------------------|----------------|
| payrollPeriodUtils | getPayrollPeriod, isDateInPeriod で期間算出 | executeMonthlyPayroll は paymentPeriodKey から periodStart/periodEnd を算出する際に利用 | 問題なし |
| getPayrollConfig | storeMeta/payrollConfig を取得。expectedRange を含む | 異常値チェック（anomalyFlags）で expectedRange を参照 | 問題なし |
| payrollErrors | PERMISSION_DENIED, ALREADY_CONFIRMED, INVALID_PERIOD, NO_ATTENDANCE_SELECTED, PAYROLL_CONFIG_NOT_FOUND が定義済み | 両 Callable で使用 | 問題なし |
| getPayrollCandidates | attendanceIds を選択して返却。UI は Step04 で実装 | executeMonthlyPayroll は UI から渡される attendanceIds を受け取る | 問題なし |
| storeMeta/config | payroll.startDay/endDay で期間算出の SSOT | 期間算出に使用 | 問題なし |
| 01_TOBE 3.6 | 給与計算実行 Callable、attendanceIds、payrollReflectedAt、attendanceLogs | 本ステップで実装 | 問題なし |
| 01_TOBE 7.2 | monthlyPayroll/{paymentPeriodKey}、payrollRuns サブコレクション、status、staffResults | 本ステップで実装 | 問題なし |

---

## 2. 論点と決定内容

### 論点 1: payrollReflectedAt の再計算時クリア方式

| 項目 | 内容 |
|------|------|
| **背景・問題** | 再計算時に、前回 run にのみ含まれていた attendance の payrollReflectedAt をどう扱うか。01_TOBE 3.6 で「前回の run にのみ含まれていた attendance は payrollReflectedAt をクリアする（または上書き）」とある。 |
| **選択肢A** | **厳密差分更新**: 前回 run の attendanceIds を取得し、今回 run に含まれないもののみ payrollReflectedAt をクリア。今回 run の attendance には付与。 |
| **選択肢B** | **上書き運用**: 今回 run の対象 attendance にのみ `{periodStart}-{periodEnd}` を付与。前回 run にのみ含まれていた attendance は、今回付与対象外のためクリア（null にする）。 |
| **採用案** | **選択肢B**（上書き運用） |
| **根拠** | 実装が簡潔。前回 run の attendanceIds を保持する必要があり、runHistory から取得可能。今回 run に含まれる attendance に付与し、前回 run にのみ含まれていた attendance を特定してクリアする。実装時: 前回 run の attendanceIds を runHistory から取得し、今回 run の attendanceIds との差分をクリア対象とする。 |
| **影響ファイル** | executeMonthlyPayroll.ts, runMonthlyPayrollLogic.ts |
| **テスト観点** | 再計算時、前回 run にのみ含まれていた attendance の payrollReflectedAt がクリアされる。今回 run の attendance には付与される。 |
| **決定日** | 2026-03-20 |

---

### 論点 2: status 遷移の最終セット

| 項目 | 内容 |
|------|------|
| **背景・問題** | monthlyPayroll/{paymentPeriodKey} の status フィールドで、どの値を定義するか。01_TOBE 7.2 で「draft（計算中）, confirmed（確定済み）, paid（支払い済み）等」とある。 |
| **採用案** | 本ステップでは **draft**, **confirmed** の 2 状態を実装する。**paid**（支払い済み）は Step06 で追加。**hold**（保留）は Step06 で検討。 |
| **根拠** | 01_TOBE 3.4 で「確定後は当該期間の再計算を行えない」が必須。draft → confirmed の遷移が本ステップの範囲。paid/hold は支払い管理（Step06）の責務。 |
| **status 定義** | `draft`: 計算実行済み・未確定。再計算可能。`confirmed`: 確定済み。再計算不可。 |
| **影響ファイル** | executeMonthlyPayroll.ts, confirmPayrollRun.ts, types.ts（任意） |
| **テスト観点** | 初回計算時は draft。確定後は confirmed。confirmed 時に executeMonthlyPayroll を呼ぶと ALREADY_CONFIRMED。 |
| **決定日** | 2026-03-20 |

---

### 論点 3: run 肥大化時の分割方針（staffResults の分離）

| 項目 | 内容 |
|------|------|
| **背景・問題** | 1 staff あたり 10 attendance × 30 日で 300 を超える attendanceIds が staffResults に含まれる可能性。ドキュメント肥大化の懸念。 |
| **選択肢A** | payrollRuns ドキュメントに staffResults（staff ごとのエントリ + attendanceIds 配列）をそのまま含める。01_TOBE 7.2 の「階層を減らした方が良い」に従う。 |
| **選択肢B** | staffResults を別サブコレクション（例: payrollRuns/{runId}/staffResults/{staffId}）に分離。 |
| **採用案** | **選択肢A**（現状は分離しない） |
| **根拠** | 01_TOBE 7.2 で「階層を減らした方が良い」と明記。実運用で肥大化が問題になった場合、後続で分離を検討する。本ステップではシンプルに payrollRuns ドキュメントに staffResults を格納。 |
| **影響ファイル** | runMonthlyPayrollLogic.ts |
| **テスト観点** | payrollRun に staffResults が正しく保存される。attendanceIds が各 staff エントリに含まれる。 |
| **決定日** | 2026-03-20 |

---

### 論点 4: 異常値チェックの Callable 側実装範囲（GAP-3）

| 項目 | 内容 |
|------|------|
| **背景・問題** | 計算実行時に expectedRange との比較を Callable 側で行うか。anomalyFlags を payrollRun に保存するか、レスポンスに含めるか。 |
| **選択肢A** | Callable 側で expectedRange と計算結果を比較し、anomalyFlags を生成。payrollRun に保存し、レスポンスにも含める。 |
| **選択肢B** | UI 側のみで expectedRange と比較。Callable は anomalyFlags を返さない。 |
| **採用案** | **選択肢A**（Callable 側でフラグ生成 → UI（Step05）で表示） |
| **根拠** | STEP_PLAN の GAP-3 で「Callable側でフラグ生成 → UI（Step05）で表示」の分担として確定。01_TOBE 4.5 で異常値チェックを実装する。expectedRange の min/max と attendanceCount, estimatedAmount, totalHours を比較し、超過・不足をフラグ化。 |
| **anomalyFlags の構造** | `{ attendanceCountOutOfRange?: boolean; estimatedAmountOutOfRange?: boolean; totalHoursOutOfRange?: boolean }` 等。expectedRange の各フィールドが未設定の場合はその項目はチェックしない。 |
| **影響ファイル** | executeMonthlyPayroll.ts, runMonthlyPayrollLogic.ts |
| **テスト観点** | expectedRange を超えた場合に anomalyFlags が true になる。payrollRun に保存され、レスポンスに含まれる。 |
| **決定日** | 2026-03-20 |

---

### 論点 5: Callable のエラーケース定義（GAP-6）

| 項目 | 内容 |
|------|------|
| **背景・問題** | executeMonthlyPayroll, confirmPayrollRun で返すエラーコードを網羅的に定義する。 |
| **採用案** | 下記のエラーケース表で実装する。payrollErrors（Step01）の定数を使用。 |

**executeMonthlyPayroll のエラーケース**:

| エラーコード | 条件 | クライアント側の扱い |
|-------------|------|---------------------|
| `permission-denied` | admin 以外の呼び出し、または認証なし | エラーダイアログ表示 |
| `already-confirmed` | 対象期間（paymentPeriodKey）が確定済みで再計算不可 | エラーダイアログ表示 |
| `invalid-period` | 計算対象期間が特定できない（payroll 設定不正、paymentPeriodKey 不正） | エラーダイアログ表示 |
| `no-attendance-selected` | attendanceIds が空配列 | エラーダイアログ表示 |
| `payroll-config-not-found` | payrollConfig が未設定で paymentDate 等が取得できない | エラーダイアログ表示 |
| `invalid-argument` | 必須パラメータ（paymentPeriodKey, attendanceIds）が不正 | エラーダイアログ表示 |

**confirmPayrollRun のエラーケース**:

| エラーコード | 条件 | クライアント側の扱い |
|-------------|------|---------------------|
| `permission-denied` | admin 以外の呼び出し、または認証なし | エラーダイアログ表示 |
| `already-confirmed` | 対象期間が既に確定済み | エラーダイアログ表示 |
| `invalid-period` | paymentPeriodKey が不正 | エラーダイアログ表示 |
| `payroll-config-not-found` | payrollConfig が未設定 | エラーダイアログ表示 |
| `invalid-argument` | paymentPeriodKey が未指定 | エラーダイアログ表示 |

| **影響ファイル** | executeMonthlyPayroll.ts, confirmPayrollRun.ts |
| **テスト観点** | 各エラーケースがテストで検証されている |
| **決定日** | 2026-03-20 |

---

## 3. このステップの API 契約（Callable）

### executeMonthlyPayroll

**リクエスト**:

```typescript
{
  paymentPeriodKey: string;   // YYYY-MM-DD。支払日キー。monthlyPayroll の docId と一致
  attendanceIds: string[];    // 計算対象とする attendance の docId 配列。Step02 の getPayrollCandidates で取得した group1/2 から選択されたもの
}
```

**レスポンス（成功時）**:

```typescript
{
  runId: string;             // 作成した payrollRun の docId
  paymentPeriodKey: string;
  periodStart: string;       // YYYY-MM-DD
  periodEnd: string;         // YYYY-MM-DD
  calculatedAt: string;      // ISO 8601
  staffCount: number;        // 計算対象 staff 数（0円 staff は含まない）
  totalPay: number;          // 総支給額合計
  anomalyFlags: {
    attendanceCountOutOfRange?: boolean;
    estimatedAmountOutOfRange?: boolean;
    totalHoursOutOfRange?: boolean;
  };
}
```

**冪等性・再実行時の挙動**:

- 非冪等。呼び出すたびに新規 payrollRun が作成される。再計算時は前回 run の attendance の payrollReflectedAt をクリアし、今回 run の attendance に付与する。

---

### confirmPayrollRun

**リクエスト**:

```typescript
{
  paymentPeriodKey: string;  // YYYY-MM-DD。確定対象の期間
  runId?: string;            // 確定する run の docId。未指定時は最新 run を確定
}
```

**レスポンス（成功時）**:

```typescript
{
  paymentPeriodKey: string;
  runId: string;             // 確定した run の docId
  confirmedAt: string;       // ISO 8601
  confirmedByDeviceId: string | null;
}
```

**冪等性・再実行時の挙動**:

- 既に確定済みの場合は ALREADY_CONFIRMED を返す（冪等ではないが、二重確定は拒否）。

---

## 4. このステップで新規作成・変更するファイル一覧

| ファイルパス | 新規/変更 | 内容の概要 |
|------------|----------|-----------|
| `functions/src/domains/attendance/callables/executeMonthlyPayroll.ts` | 新規 | 給与計算実行 Callable。attendanceIds を受け取り payrollRun を作成 |
| `functions/src/domains/attendance/callables/confirmPayrollRun.ts` | 新規 | 確定 Callable。status を confirmed に更新 |
| `functions/src/domains/attendance/helpers/runMonthlyPayrollLogic.ts` | 新規 | 給与計算ロジックの共通化。staff ごとの計算、payrollReflectedAt 更新、attendanceLogs 書き込み |
| `functions/src/domains/attendance/index.ts` | 変更 | executeMonthlyPayroll, confirmPayrollRun の export 追加 |
| `functions/__tests__/domains/attendance/callables/executeMonthlyPayroll.spec.ts` | 新規 | 計算実行 Callable の単体テスト |
| `functions/__tests__/domains/attendance/callables/confirmPayrollRun.spec.ts` | 新規 | 確定 Callable の単体テスト |

---

## 5. 完了条件（仕様確定版）

- [ ] executeMonthlyPayroll が attendanceIds を受け取り、payrollRun を作成する
- [ ] 確定後に同期間の executeMonthlyPayroll を呼ぶと ALREADY_CONFIRMED が返る
- [ ] 0円 staff は staffResults に含めない（attendance 起点で作成するため）
- [ ] 計算実行時に anomalyFlags が生成され、payrollRun に保存され、レスポンスに含まれる
- [ ] payrollReflectedAt が計算対象 attendance に付与される。再計算時は前回 run にのみ含まれていた attendance の payrollReflectedAt がクリアされる
- [ ] attendanceLogs に actionType: 'monthly_payroll_reflect' が書き込まれる
- [ ] 確定時に attendanceLogs に actionType: 'payroll_confirmed' が書き込まれる
- [ ] 主要エラーケース（permission-denied, already-confirmed, invalid-period, no-attendance-selected, payroll-config-not-found）がテストで検証されている

---

## 6. 未決のまま持ち越す項目

| # | 項目 | 持ち越し先 Step | 理由 |
|---|------|----------------|------|
| 1 | expectedRange の閾値・判定ロジックの詳細 | 実装時 | 01_TOBE 9 で「expectedRange の詳細は実装時に詰める」 |
| 2 | 古い payrollRun の削除タイミング | 実装時 | 01_TOBE 7.2 で「要詰め」 |
| 3 | status: paid, hold の追加 | Step06 | 支払い管理の責務 |
| 4 | 確定 run の attendance への payrollReflectedAt 付与 | 実装時 | 01_TOBE 3.6 で「確定時は確定 run の対象 attendance に付与」。計算実行時と確定時の両方で付与するか、確定時のみかは実装時に決定 |

---

## 7. 整合性確認結果

以下を 01_TOBE_DETAILED_SPEC および Step01/02 と照合し、矛盾なし。

- **3.6 給与計算実行 Callable**: attendanceIds 受け取り、payrollRun 作成、payrollReflectedAt、attendanceLogs（monthly_payroll_reflect）
- **3.4 確定後の再計算**: 確定後は再計算不可 → ALREADY_CONFIRMED
- **4.2 staff ごとのカード**: 0円 staff は表示から除外 → staffResults に含めない
- **4.5 異常値チェック・status**: anomalyFlags を payrollRun に保存。status は draft/confirmed
- **7.2 monthlyPayroll コレクション**: paymentPeriodKey、status、runHistory、latestConfirmedRunId、staffResults（attendanceIds 含む）
- **12. attendanceLogs**: 計算実行（monthly_payroll_reflect）と確定（payroll_confirmed）が log として識別可能
- **Step01 payrollErrors**: 全エラーコードが定義済み
- **Step02 getPayrollCandidates**: UI が選択した attendanceIds を executeMonthlyPayroll に渡す
