# Step 04: コア計算エンジン — changeSpec

**作成日**: 2026-03-22

---

## カバーする仕様セクション

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

---

## 設計方針

**Firestore 非依存の純粋関数モジュール**として実装する。入力は attendance 配列 + config snapshot、出力は計算結果（StaffCalcResult + AttendanceItemResult[]）。これにより:

1. Firestore のモックなしで単体テスト可能
2. Step 05（processStaffPayroll）から呼び出す際のインターフェースが明確
3. 検証テーブル 1〜6 をそのままテストデータに変換可能

---

## 変更一覧

### 変更 1: 計算エンジン型定義

**ファイル**: `functions/src/domains/attendance/types/payrollCalcTypes.ts`（変更）

**追加する型**:

```typescript
/** 計算エンジンへの attendance 入力 */
export interface CalcAttendanceInput {
  attendanceId: string;
  staffId: string;
  date: string;
  weekday: number;
  weekStartDate: string;
  paymentPeriodKey: string;
  payrollStatus: PayrollStatus;
  actualWorkMinutes: number;
  nightWorkMinutes: number;
  clockIn: string;         // ソート用（ISO 8601）
  createdAt: string;       // ソート用（ISO 8601）
}

/** 計算エンジンへの config snapshot 入力 */
export interface CalcConfigInput {
  currentPeriodKey: string;
  weeklyLegalLimitMinutes: number;
  legalHolidayWeekday: number | null;
  nightPremiumRate: number;
  overtimePremiumRate: number;
  over60PremiumRate: number;
  legalHolidayPremiumRate: number;
  roundingMethod: RoundingMethod;
  roundingPrecision: number;
  baseHourlyWage: number;
}

/** attendance 明細の計算結果 */
export interface AttendanceItemResult {
  attendanceId: string;
  attendanceRefPath: string;
  workDate: string;
  weekday: number;
  weekStartDate: string;
  paymentPeriodKey: string;
  isCarryOver: boolean;
  originalPaymentPeriodKey: string | null;
  includedInCurrentRun: boolean;
  actualWorkMinutes: number;
  nightWorkMinutes: number;
  isLegalHoliday: boolean;
  isNonLegalHoliday: boolean;
  dailyOverMinutes: number;
  dailyRegularMinutes: number;
  weeklyRegularBefore: number;
  weeklyRegularAfter: number;
  weeklyOnlyOverMinutes: number;
  legalOvertimeMinutes: number;
}

/** staff 単位の集計結果 */
export interface StaffCalcResult {
  staffId: string;
  totalActualWorkMinutes: number;
  totalNightWorkMinutes: number;
  totalLegalOvertimeMinutes: number;
  over60OvertimeMinutes: number;
  totalLegalHolidayWorkMinutes: number;
  totalNonLegalHolidayWorkMinutes: number;
  basePay: number;
  lateNightPremiumPay: number;
  overtimePremiumPay: number;
  over60PremiumPay: number;
  legalHolidayPremiumPay: number;
  grossPay: number;
  attendanceItems: AttendanceItemResult[];
  // キャリーオーバー関連
  carryOverGrossPay: number;
  carryOverAttendanceCount: number;
}
```

### 変更 2: 端数処理ユーティリティ

**ファイル**: `functions/src/domains/attendance/helpers/payrollRoundingUtils.ts`（新規）

```typescript
import type { RoundingMethod } from '../../../shared/config/payrollConfigTypes';

export function payrollRound(
  value: number,
  method: RoundingMethod,
  precision: number
): number {
  const factor = Math.pow(10, precision);
  const shifted = value * factor;
  switch (method) {
    case 'ceil':  return Math.ceil(shifted) / factor;
    case 'floor': return Math.floor(shifted) / factor;
    case 'round': return Math.round(shifted) / factor;
  }
}
```

### 変更 3: コア計算エンジン

**ファイル**: `functions/src/domains/attendance/helpers/payrollCalcEngine.ts`（新規）

**公開関数**:

| 関数 | 仕様セクション | 説明 |
|------|---------------|------|
| `isLegalHoliday(weekday, legalHolidayWeekday)` | 3 | 法定休日判定 |
| `processAttendanceDay(attendance, config, weeklyRegularRunning)` | 4, 5, 6 | 1件の attendance を処理し、明細 + 更新後 weeklyRegularRunning を返す |
| `calcWeek(attendances, config, currentPeriodKey)` | 5, 7 | 1週分の attendance を処理（ソート + 順次処理 + isTarget 判定） |
| `calcOver60(items, config)` | 8 | 月60時間超算出 |
| `calcAmount(totals, config)` | 10 | 金額算出 |
| `calculateStaffPayroll(allAttendances, config)` | 2, 12 | staff 1人分の全計算（週グループ化 → 各週処理 → 月60h → 金額） |
| `calculateCarryOverPayroll(carryOverAttendances, originalPeriodAttendances, config)` | 13-1 | キャリーオーバー計算 |

**処理フロー**（`calculateStaffPayroll`）:

```
1. allAttendances を weekStartDate でグループ化
2. 各週について calcWeek() を呼び出し
   - 週内を安定ソート（clockIn ASC → createdAt ASC → docId ASC）
   - weeklyRegularRunning = 0 で初期化
   - 各 attendance を processAttendanceDay() で処理
   - isTarget のもののみ集計に加算
3. 全週の計上対象 items を時系列順に結合
4. calcOver60() で月60時間超算出
5. calcAmount() で金額算出
6. StaffCalcResult + AttendanceItemResult[] を返却
```

**重複計上防止ルール（セクション11）の実装箇所**:

| ルール | 実装箇所 |
|--------|---------|
| 法定休日は法定時間外に含めない | `processAttendanceDay`: isLegalHoliday → legalOvertimeMinutes=0 |
| 法定休日は月60h超に含めない | `calcOver60`: isLegalHoliday をスキップ |
| 日超過と週超過は二重計上しない | `processAttendanceDay`: weeklyRegularRunning（法定内累計のみ） |
| 深夜は他の割増と独立加算 | `calcAmount`: totalNightWorkMinutes を独立項目として計算 |

### 変更 4: 型の import パス追加

**ファイル**: `functions/src/domains/attendance/types/payrollCalcTypes.ts`（変更）

`RoundingMethod` を import して `CalcConfigInput` 内で使用。

---

## 実装順序

1. `payrollCalcTypes.ts` に型追加
2. `payrollRoundingUtils.ts` 新規作成
3. `payrollCalcEngine.ts` 新規作成
4. テストコード作成・実行

---

## テスト計画

**ファイル**: `functions/__tests__/attendance/payrollCalcEngine.spec.ts`

### 検証テーブルテスト（仕様書から直接変換）

| # | テストケース | 仕様書 | 期待値 |
|---|---|---|---|
| V1 | 月〜金 各9時間（週45時間） | 検証1 | legalOvertimeMinutes=300 |
| V2 | 月〜金 各7時間 + 土10時間 | 検証2 | legalOvertimeMinutes=300 |
| V3 | 月10時間 + 火〜金8時間 + 土6時間 | 検証3 | legalOvertimeMinutes=480 |
| V4 | 月〜土 各7時間（週42時間） | 検証4 | legalOvertimeMinutes=120 |
| V5 | 月〜金 各8時間 + 日（法定休日）10時間 | 検証5 | legalOvertimeMinutes=0, legalHolidayWork=600 |
| V6 | 月跨ぎ週（3/29-3/31 計上, 4/1-4/2 参照） | 検証6 | legalOvertimeMinutes=60 |

### ユニットテスト

| # | テストケース | 期待値 |
|---|---|---|
| U1 | isLegalHoliday: weekday==legalHolidayWeekday → true | true |
| U2 | isLegalHoliday: legalHolidayWeekday=null → false | false |
| U3 | processAttendanceDay: 法定休日 → dailyOver/weeklyOver=0 | 0 |
| U4 | processAttendanceDay: 通常 9h勤務 → dailyOver=60 | 60 |
| U5 | processAttendanceDay: weeklyRegularRunning 更新 | 正しい累計 |
| U6 | calcOver60: 累計3600超の寄与分 | 正しい超過分 |
| U7 | calcOver60: 法定休日をスキップ | 0 |
| U8 | calcAmount: 各金額項目の計算 | 検算一致 |
| U9 | calcAmount: roundingMethod=ceil/floor/round | 正しい端数処理 |
| U10 | isNonLegalHoliday: 常に false | false |
| U11 | 空の attendance → 全集計値 0 | 0 |

### キャリーオーバーテスト

| # | テストケース | 期待値 |
|---|---|---|
| C1 | キャリーオーバー attendance が元期間のコンテキストで計算される | weeklyRegularRunning が元期間で構築 |
| C2 | キャリーオーバー分が carryOverGrossPay に分離記録 | 正しい金額 |
| C3 | 当月 attendance とキャリーオーバーは独立計算 | weeklyRegularRunning が混在しない |

### 端数処理テスト

| # | テストケース | 期待値 |
|---|---|---|
| R1 | payrollRound(123.456, 'ceil', 0) | 124 |
| R2 | payrollRound(123.456, 'floor', 0) | 123 |
| R3 | payrollRound(123.456, 'round', 0) | 123 |
| R4 | payrollRound(123.5, 'round', 0) | 124 |
| R5 | payrollRound(1234, 'floor', -1) | 1230 |

---

## Step01/02/03 との整合性

| 前ステップ成果物 | 本 Step での使用箇所 |
|---|---|
| `PayrollRunSnapshot` 型 (Step01) | `CalcConfigInput` の設計に準拠 |
| `RoundingMethod` 型 (Step01) | `payrollRound()` の引数型 |
| `PayrollStatus` 型 (Step01) | `CalcAttendanceInput.payrollStatus` |
| `DAILY_LEGAL_LIMIT_MINUTES` 定数 (Step01) | `processAttendanceDay` 内で使用 |
| `getWeekStartDate()` (Step01) | 計算エンジンは呼び出さない（入力に含まれる前提） |
| attendance の weekday/weekStartDate/paymentPeriodKey (Step02) | `CalcAttendanceInput` のフィールドとして受け取る |
| isNonLegalHoliday = false 固定 (仕様確定) | `processAttendanceDay` 内でハードコード |
