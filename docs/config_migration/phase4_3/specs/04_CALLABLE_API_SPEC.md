# 04: Callable API 仕様

**ステータス**: 確定（DISTRIBUTED_EXECUTION_DESIGN.md に基づく分散実行版）
**最終更新**: 2026-03-21

---

## 仕様概要

Cloud Functions の各 Callable / Task のインターフェース定義。給与計算は Cloud Tasks で staff 単位に分散実行する。attendance 確定時の帰属情報付与、対象データ抽出、給与計算実行（オーケストレーション）、staff 単位計算タスク、サマリ集計、確定の各関数を定義する。キャリーオーバー（03_DATA_MODEL_SPEC セクション5参照）にも対応する。

共通原則: **Firestore への書き込みは Functions を経由して行う**。Flutter からの直接書き込みは行わない。

分散実行の詳細設計は **DISTRIBUTED_EXECUTION_DESIGN.md** を参照。

---

## 関数一覧

| 関数名 | 種類 | 呼び出し元 | 責務 |
|--------|------|-----------|------|
| attendance onWrite トリガー | Firestore トリガー | attendance 書き込み時 | 帰属情報付与 |
| `getPayrollCandidates` | Callable | Flutter | 対象データ抽出 |
| `executeMonthlyPayroll` | Callable | Flutter | run 作成・タスク投入 |
| `processStaffPayroll` | onTaskDispatched | Cloud Tasks | 1 staff の計算・保存 |
| `finalizePayrollRun` | onTaskDispatched | processStaffPayroll（最終タスク） | サマリ集計・完了更新 |
| `retryFailedStaffTasks` | Callable | Flutter | 失敗タスク再投入 |
| `cancelPayrollRun` | Callable | Flutter | 実行中 run の中止 |
| `confirmPayrollRun` | Callable | Flutter | 給与確定 |
| `registerPaymentStatus` | Callable | Flutter | 支払い登録・保留 |

---

## 仕様詳細

### 1. attendance 帰属情報付与処理

**実装方式**: attendance 作成/更新時の Firestore onWrite トリガー

**目的**: attendance に weekday, weekStartDate, paymentPeriodKey, payrollStatus を設定する

**処理**:
1. clockIn, date, 店舗設定の weekStartDay を取得
2. weekday を算出（`date` の曜日。0=日曜〜6=土曜）
3. weekStartDate を算出（`date` から直近過去の weekStartDay 曜日。02_CONFIG_SPEC セクション6参照）
4. paymentPeriodKey を算出（`date` を `payroll.startDay / endDay` で期間に当てはめ。02_CONFIG_SPEC セクション5参照）
5. 初回作成: `payrollStatus = "unreflected"`
6. 既に `reflected` の attendance が更新された場合: `payrollStatus = "corrected_after_reflection"`
7. 手順6 の場合、帰属期間の monthlyPayroll.status が `confirmed` であれば payroll_attendance_corrected 通知を作成する（07_NOTIFICATION_SCHEDULER_SPEC セクション2-2参照）

**トリガー選択の理由**: attendance の書き込み経路が多い（clockOut, updateAttendance, approveAttendanceCorrectionRequest 等）ため、個別の Callable に組み込むと漏れが発生しやすい。トリガーなら全経路を網羅できる。

### 2. getPayrollCandidates

**権限**: admin のみ

**リクエスト**:

```typescript
{
  paymentPeriodKey: string;   // 例: "2026-03-26_2026-04-25"
}
```

**レスポンス（成功時）**:

```typescript
{
  periodStart: string;        // YYYY-MM-DD
  periodEnd: string;          // YYYY-MM-DD
  group1: CandidateEntry[];   // 期間内・退勤済・非削除（通常の計上対象）
  group2: CandidateEntry[];   // 期間外・未反映（キャリーオーバー候補）
  group3: CandidateEntry[];   // 期間内・未退勤 or 論理削除（計上不可）
}
```

```typescript
interface CandidateEntry {
  attendanceId: string;
  staffId: string;
  staffName: string;
  date: string;
  weekday: number;            // 0=日曜〜6=土曜
  clockIn: string;            // ISO 8601
  clockOut: string | null;
  actualWorkMinutes: number | null;
  nightWorkMinutes: number | null;
  reasonType: "in_period" | "carry_over" | "other";
  reasonLabel: string;
  isDeleted: boolean;
  payrollStatus: string;
  paymentPeriodKey: string;   // この attendance が本来帰属する期間
}
```

**属性判定ロジック**:

| 条件 | グループ | reasonType |
|------|---------|-----------|
| 期間内 + 退勤済 + 非削除 + payrollStatus in [unreflected, corrected_after_reflection] | group1 | `in_period` |
| 期間外 + 非削除 + payrollStatus in [unreflected, corrected_after_reflection] | group2 | `carry_over` |
| 期間内 + （未退勤 or 論理削除） | group3 | `other` |

**group2 の取得範囲**: 全期間を対象とする。payrollStatus = unreflected / corrected_after_reflection でフィルタするため、反映済み attendance は返らず、結果件数は自然に制限される。

**返却順序**: group3 → group2 → group1

**返却しない attendance**: date > periodEnd（未来の attendance）、期間外で論理削除

**件数制限**: maxCandidatesCount（デフォルト 1000）

**エラー**:

| エラーコード | 条件 |
|-------------|------|
| `permission-denied` | admin 以外 |
| `invalid-argument` | paymentPeriodKey が不正 |
| `payroll-config-not-found` | payrollConfig が未設定 |

### 3. executeMonthlyPayroll

**権限**: admin のみ

**役割**: **run の作成とタスクの投入のみ**。計算処理は行わない。

**リクエスト**:

```typescript
{
  paymentPeriodKey: string;
  attendanceIds: string[];    // 計上対象の attendance ID 配列（group1 + group2 から選択）
}
```

**レスポンス（成功時）**:

```typescript
{
  runId: string;
  paymentPeriodKey: string;
  targetStaffCount: number;
  targetAttendanceCount: number;
  carryOverAttendanceCount: number;
  status: "processing";       // 即座に返却。計算結果は含まない
}
```

**処理概要**:

```
1.  入力検証（権限、期間、attendanceIds 非空）
2.  対象期間が confirmed でないことを確認
3.  設定 snapshot 取得（payrollConfig, storeConfig）→ 02_CONFIG_SPEC セクション8 の全 snapshot
4.  attendanceIds から attendance を一括取得・バリデーション
5.  attendance を通常/キャリーオーバーに分類
    - paymentPeriodKey == currentPeriodKey → 通常
    - paymentPeriodKey != currentPeriodKey → キャリーオーバー
6.  staffId ごとに attendanceIds をグルーピング
7.  payrollRuns ドキュメントを作成:
    - status = "preparing"
    - targetStaffCount, targetAttendanceCount, carryOverAttendanceCount
    - completedStaffCount = 0, failedStaffCount = 0
    - 全 snapshot フィールド
8.  staff ごとに:
    a. staffResults/{staffId} を作成（taskStatus="pending", assignedAttendanceIds, assignedCarryOverAttendanceIds）
    b. Cloud Task を投入（payload: { runId, paymentPeriodKey, staffId }）
9.  payrollRuns.status = "processing" に更新
10. レスポンスを即座に返却
```

**冪等性**: 非冪等。呼び出すたびに新規 payrollRun を作成。再計算時は前回 run の payrollStatus をクリアせず、新しい run が latestRunId として登録される。

**致命的エラー時の処理**: タスク投入中に回復不能なエラーが発生した場合、payrollRuns.status = "failed" に更新し、payroll_run_failed 通知を作成する（07_NOTIFICATION_SCHEDULER_SPEC セクション2-2参照）。

**エラー**:

| エラーコード | 条件 |
|-------------|------|
| `permission-denied` | admin 以外 |
| `already-confirmed` | 対象期間が確定済み |
| `invalid-period` | paymentPeriodKey が不正 |
| `no-attendance-selected` | attendanceIds が空 |
| `payroll-config-not-found` | payrollConfig が未設定 |
| `invalid-argument` | 必須パラメータ不正 |

### 4. processStaffPayroll

**種類**: onTaskDispatched（Cloud Tasks から呼び出し）

**タスクペイロード**:

```typescript
{
  runId: string;
  paymentPeriodKey: string;
  staffId: string;
}
```

**リトライポリシー**:

| 設定 | 値 |
|------|-----|
| maxAttempts | 3 |
| minBackoffSeconds | 10 |
| maxBackoffSeconds | 300 |

**処理概要**:

```
1.  payrollRuns/{runId} を読み取り
    - status が "cancelled" or "failed" → return（無駄な処理を回避）
2.  staffResults/{staffId} を読み取り
    - taskStatus == "completed" → return（冪等性ガード）
3.  staffResults.taskStatus = "processing", taskStartedAt = now
4.  assignedAttendanceIds / assignedCarryOverAttendanceIds を取得
5.  attendance ドキュメントを一括取得
6.  payrollRuns から config snapshot を取得
7.  staffs/{staffId} から時給・氏名を取得（snapshot 用）
8.  通常 attendance: 月跨ぎ週の参照用 attendance を追加取得
9.  キャリーオーバー attendance: 元の期間の attendance を参照用に取得
10. 01_CALC_SPEC のアルゴリズムで計算
    - 通常 attendance → セクション3〜5, 7
    - キャリーオーバー attendance → 元期間参照で残業計算
    - 月60時間超 → セクション8
    - 金額算出 → セクション10
11. attendanceItems を書き込み（batch.set で冪等上書き）【必須】
12. 結果保存 + カウンタ更新（トランザクション）:
    ┌─ transaction ─────────────────────────┐
    │ staffResults/{staffId} を再読み取り    │
    │ if taskStatus == "completed": return   │
    │ staffResults に全計算結果を set         │
    │  - taskStatus = "completed"            │
    │  - taskFinishedAt = now                │
    │ payrollRuns.completedStaffCount += 1   │
    └───────────────────────────────────────┘
13. 完了判定:
    completedStaffCount + failedStaffCount == targetStaffCount?
    → Yes: finalizePayrollRun タスクを投入
```

**失敗時の処理**:

```
catch (error):
  ┌─ transaction ─────────────────────────┐
  │ staffResults/{staffId} を再読み取り    │
  │ if taskStatus == "completed": return   │
  │ if taskStatus == "failed": return      │
  │ staffResults に set:                   │
  │  - taskStatus = "failed"              │
  │  - taskError = error.message          │
  │  - taskFinishedAt = now               │
  │ payrollRuns.failedStaffCount += 1     │
  └───────────────────────────────────────┘

  完了判定:
  → Yes: finalizePayrollRun タスクを投入
```

**冪等性**: トランザクション内で taskStatus を確認し、completed/failed なら skip。カウンタの二重加算を防止。attendanceItems は set() 上書きで安全。

### 5. finalizePayrollRun

**種類**: onTaskDispatched（processStaffPayroll の最終タスクから投入）

**タスクペイロード**:

```typescript
{
  runId: string;
  paymentPeriodKey: string;
}
```

**処理概要**:

```
1. payrollRuns/{runId} を読み取り
   - status が "completed" or "completed_with_errors" → return（冪等性）
2. payrollRuns.status = "aggregating" に更新
3. staffResults を全件読み取り（taskStatus == "completed" のもの）
4. サマリを集計:
   - totalBasePay = Σ staffResults.basePay
   - totalPremiumPay = Σ (lateNightPremiumPay + overtimePremiumPay + over60PremiumPay + legalHolidayPremiumPay)
   - totalGrossPay = Σ staffResults.grossPay
   - warningCount = Σ (status == "warning" の staff 数)
   - completedStaffCount, failedStaffCount を最終確認
5. generateAnomalyFlags を呼び出し（セクション5-1参照）
6. payrollRuns を更新:
   - status = failedStaffCount > 0 ? "completed_with_errors" : "completed"
   - finishedAt = now
   - totalBasePay, totalPremiumPay, totalGrossPay
   - warningCount, anomalyFlags
7. monthlyPayroll ルートドキュメントを更新:
   - latestRunId = runId
   - latestCalculatedAt = now
   - status = "draft"（まだ confirmed でなければ）
8. 通知を作成（07_NOTIFICATION_SCHEDULER_SPEC セクション2-2参照）:
   - status == "completed" → payroll_run_completed 通知
   - status == "completed_with_errors" → payroll_run_completed_with_errors 通知
```

**冪等性**: 全 staffResults を読み直して集計するため、何度実行しても同じ結果。status ガードで多重実行を防止。通知作成も冪等（同一 runId に対して1回のみ作成）。

#### 5-1. generateAnomalyFlags

**枠組みのみ実装。初期リリースでは実質的なチェックは行わない。**

```typescript
/**
 * 計算結果の異常値チェックを行う。
 * 現時点ではチェック内容は未定義のため、常に空のフラグを返す。
 * 運用開始後に実績データを基にチェック内容を追加する。
 *
 * TODO: 以下のようなチェックを運用フィードバックを経て追加予定
 * - expectedRange ベースの件数・金額・時間チェック
 * - staff ごとの異常値検出
 * - 前回 run との差分チェック
 */
function generateAnomalyFlags(
  staffResults: StaffResult[],
  payrollConfig: PayrollConfig
): AnomalyFlags {
  const flags: AnomalyFlags = {};
  // チェック内容は運用開始後に追加する。
  // この関数は finalizePayrollRun から必ず呼び出され、
  // チェックを追加する際はここに実装する。
  return flags;
}
```

### 6. retryFailedStaffTasks

**権限**: admin のみ

**リクエスト**:

```typescript
{
  paymentPeriodKey: string;
  runId: string;
}
```

**レスポンス（成功時）**:

```typescript
{
  retriedCount: number;
  failedStaffIds: string[];
}
```

**処理概要**:

```
1. payrollRuns.status が "completed_with_errors" であることを確認
2. staffResults から taskStatus == "failed" の staff を抽出
3. 各 staff について:
   a. staffResults.taskStatus = "pending" にリセット
   b. staffResults.taskError = null にクリア
   c. Cloud Task を再投入
4. payrollRuns を更新:
   - status = "processing"
   - failedStaffCount = 0
   - completedStaffCount はそのまま（成功済み staff は再計算しない）
```

**エラー**:

| エラーコード | 条件 |
|-------------|------|
| `permission-denied` | admin 以外 |
| `run-not-found` | runId が存在しない |
| `invalid-run-status` | status が completed_with_errors でない |

### 7. cancelPayrollRun

**権限**: admin のみ

**リクエスト**:

```typescript
{
  paymentPeriodKey: string;
  runId: string;
}
```

**レスポンス（成功時）**:

```typescript
{
  runId: string;
  cancelledAt: string;        // ISO 8601
}
```

**処理概要**:

```
1. payrollRuns.status が "preparing" or "processing" であることを確認
2. payrollRuns.status = "cancelled" に更新
3. 既に投入済みのタスクは processStaffPayroll が status == "cancelled" を検知して skip
```

**エラー**:

| エラーコード | 条件 |
|-------------|------|
| `permission-denied` | admin 以外 |
| `run-not-found` | runId が存在しない |
| `invalid-run-status` | status が preparing/processing でない |

### 8. confirmPayrollRun

**権限**: admin のみ

**前提条件**: 対象 run の status が `completed` であること。`completed_with_errors` は確定不可（全 staff 成功が必要）。

**リクエスト**:

```typescript
{
  paymentPeriodKey: string;
  runId?: string;             // 未指定時は最新 run（latestRunId）
}
```

**レスポンス（成功時）**:

```typescript
{
  paymentPeriodKey: string;
  runId: string;
  confirmedAt: string;        // ISO 8601
  confirmedByDeviceId: string | null;
  carryOverCount: number;     // キャリーオーバー件数（0 ならキャリーオーバーなし）
}
```

**処理概要**:

```
1. 入力検証（権限、期間、未確定であること）
2. 対象 run の status == "completed" を確認
3. staffResults を全件取得
4. attendanceItems から全 attendanceId を収集
5. 通常 + キャリーオーバー attendance の payrollStatus を "reflected" に更新
   - reflectedPayrollRunId, reflectedAt を同時に設定
   → 400 件ごとにバッチ分割
6. キャリーオーバーがある場合:
   元の期間の confirmed 済み staffResults に deferredAttendances を追記（arrayUnion）
   （03_DATA_MODEL_SPEC セクション5-3 参照）
   → staff ごとにバッチ分割
7. 全 staffResults の paymentStatus を "unpaid" に初期化
   → 支払い管理の起点。registerPaymentStatus で後から更新する
8. monthlyPayroll の status を "confirmed" に更新
   - confirmedAt, confirmedByDeviceId を設定
9. attendanceLogs に payroll_confirmed を書き込み
```

**冪等性**: 既に確定済みの場合は `already-confirmed` を返す。

**エラー**:

| エラーコード | 条件 |
|-------------|------|
| `permission-denied` | admin 以外 |
| `already-confirmed` | 既に確定済み |
| `invalid-period` | paymentPeriodKey が不正 |
| `run-not-found` | 指定された runId が存在しない |
| `run-not-completed` | run.status が completed でない |
| `invalid-argument` | paymentPeriodKey が未指定 |

### 9. registerPaymentStatus

**権限**: admin のみ

**役割**: staff ごとの支払い済み / 保留登録。全 staff の paymentStatus に基づいて monthlyPayroll.status を自動更新する。

**リクエスト**:

```typescript
{
  paymentPeriodKey: string;
  entries: {
    staffId: string;
    status: "paid" | "hold";
  }[];
}
```

**レスポンス（成功時）**:

```typescript
{
  updatedCount: number;
  monthlyPayrollStatus: string;  // 更新後の monthlyPayroll.status
}
```

**処理概要**:

```
1. 入力検証（権限、paymentPeriodKey）
2. monthlyPayroll を取得
   - status が "confirmed" or "hold" であることを確認
   - status が "paid" → already-paid エラー
   - status が "draft" → not-confirmed エラー
3. confirmed run の runId を取得（monthlyPayroll.latestRunId）
4. 各 entry について（トランザクション内）:
   a. staffResults/{staffId} を読み取り
   b. 遷移バリデーション:
      - unpaid → paid: OK
      - unpaid → hold: OK
      - hold → paid: OK
      - paid → *: reject（ALREADY_PAID）
      - hold → hold: skip（変更なし）
   c. paymentStatus を更新
      - paid の場合: paidAt = now, paidByDeviceId = deviceId
5. 全 staffResults の paymentStatus を集計:
   unpaidCount = paymentStatus == "unpaid" の件数
   holdCount   = paymentStatus == "hold" の件数
6. monthlyPayroll.status を自動更新:
   - unpaidCount == 0 && holdCount == 0 → "paid"（paidAt = now）
   - unpaidCount == 0 && holdCount > 0  → "hold"
   - otherwise → "confirmed"（変更なし）
7. レスポンス返却
```

**一括支払い登録**: entries に全 staff を含めることで一括登録が可能。UI 側で `bulkPaymentRegistrationEnabled`（02_CONFIG_SPEC 参照）により一括ボタンの表示を制御する。Callable 側では entries の件数による制限は行わない。

**冪等性**: 同一 staff に対して同一 status を再送しても副作用なし（paid → paid は reject、hold → hold は skip）。

**エラー**:

| エラーコード | 条件 |
|-------------|------|
| `permission-denied` | admin 以外 |
| `invalid-period` | paymentPeriodKey が不正 |
| `not-confirmed` | monthlyPayroll.status が confirmed / hold でない |
| `already-paid` | monthlyPayroll.status が paid（全員支払い済み） |
| `staff-already-paid` | 個別 staff が既に paid（entries の該当 staff をスキップし、他は処理継続） |
| `run-not-found` | confirmed run が存在しない |

### 10. エラーコード定義（共通）

phase4_2 Step01 で定義済みの payrollErrors を継承し、以下を使用する。

| 定数名 | 値 | 説明 |
|--------|-----|------|
| PERMISSION_DENIED | `"permission-denied"` | 権限不足 |
| ALREADY_CONFIRMED | `"already-confirmed"` | 確定済み期間 |
| INVALID_PERIOD | `"invalid-period"` | 期間不正 |
| NO_ATTENDANCE_SELECTED | `"no-attendance-selected"` | 選択なし |
| PAYROLL_CONFIG_NOT_FOUND | `"payroll-config-not-found"` | 設定未存在 |
| RUN_NOT_FOUND | `"run-not-found"` | run 未存在 |
| RUN_NOT_COMPLETED | `"run-not-completed"` | run 未完了（確定不可） |
| INVALID_RUN_STATUS | `"invalid-run-status"` | run の status が操作に適合しない |
| RUN_CANCELLED | `"run-cancelled"` | run が中止済み |
| NOT_CONFIRMED | `"not-confirmed"` | monthlyPayroll が未確定 |
| ALREADY_PAID | `"already-paid"` | 全員支払い済み |
| STAFF_ALREADY_PAID | `"staff-already-paid"` | 個別 staff が支払い済み |

### 11. attendanceLogs

| actionType | タイミング | 説明 |
|-----------|-----------|------|
| `monthly_payroll_reflect` | processStaffPayroll 完了時 | 計算対象に含まれた |
| `payroll_confirmed` | confirmPayrollRun 実行時 | 確定された |
| `carry_over_deferred` | confirmPayrollRun 実行時 | キャリーオーバーとして他期間で支給された |
| `payment_registered` | registerPaymentStatus 実行時 | staff の支払い済み登録 |
| `payment_hold` | registerPaymentStatus 実行時 | staff の支払い保留登録 |

---

## 確定済み事項一覧

| # | 項目 | 決定内容 | 決定日 |
|---|------|---------|--------|
| 1 | 再計算時の前回 run attendance クリア | クリアしない。confirm 時にのみ reflected 化。新しい run が latestRunId として登録される | 2026-03-21 |
| 2 | 計算結果チェック（anomalyFlags） | 枠組みのみ実装。generateAnomalyFlags 関数を呼び出すが初期リリースでは空フラグを返す。運用開始後に追加 | 2026-03-21 |
| 3 | 確定済み期間の再 run 可否 | 不可。confirmed の不変性を維持 | 2026-03-21 |
| 4 | 遡及訂正の方式 | フラグのみ。corrected_after_reflection としてマークし通知。将来的に confirmed 済み期間の attendance 編集不可の可能性あり | 2026-03-21 |
| 5 | 分散実行方式 | Cloud Tasks で staff 単位に分散。DISTRIBUTED_EXECUTION_DESIGN.md に基づく | 2026-03-21 |
| 6 | 支払い管理方式 | staff ごとの paymentStatus（unpaid/paid/hold）で管理。monthlyPayroll.status は全 staff の paymentStatus に基づいて自動遷移。admin による全体保留操作は提供しない | 2026-03-21 |

---

## 懸念事項一覧

| # | 項目 | 説明 | 状態 |
|---|------|------|------|
| 1 | 月跨ぎ週の参照 attendance 取得のクエリ効率 | weekStartDate を集めてから追加クエリを発行するため、クエリ回数が増える。Cloud Tasks で staff 単位に分離されているため、1タスクあたりの追加クエリは weekStartDate のユニーク数（通常1〜2）に限定される。実装時に staffId + weekStartDate の複合クエリで最適化する | 対応方針確定（実装時に最適化） |
| 2 | executeMonthlyPayroll の実行時間 | Cloud Tasks 分散により**解消**。各タスクは 1 staff 分で数秒。全体のタイムアウトリスクなし | 解消済み |
| 3 | attendance 帰属情報の整合性 | payroll.startDay/endDay は原則変更しない（02_CONFIG_SPEC）。万が一変更時は新規 attendance のみ新期間構造に従い、既存は遡及しない。将来の管理 UI では startDay/endDay を読み取り専用とし、変更は Firestore コンソールからのみとする（02_CONFIG_SPEC セクション9参照） | 対応方針確定（運用ルール + 将来 UI で読み取り専用） |
