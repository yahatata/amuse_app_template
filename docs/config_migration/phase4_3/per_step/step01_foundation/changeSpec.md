# Step 01: 基盤・設定整備 — changeSpec

**作成日**: 2026-03-21

---

## カバーする仕様

| 仕様書 | セクション | changeSpec 内の対応箇所 |
|--------|----------|----------------------|
| 02_CONFIG_SPEC | 1. 設定の配置方針 | 変更 1 |
| 02_CONFIG_SPEC | 2. storeMeta/config — 既存設定 | 変更 1（既存参照、変更なし） |
| 02_CONFIG_SPEC | 3. storeMeta/payrollConfig — 既存フィールド | 変更 1 |
| 02_CONFIG_SPEC | 4. storeMeta/payrollConfig — 新規追加フィールド | 変更 1 |
| 02_CONFIG_SPEC | 5. paymentPeriodKey のフォーマットと決定ロジック | 変更 2 |
| 02_CONFIG_SPEC | 6. weekStartDate の決定ロジック | 変更 2 |
| 02_CONFIG_SPEC | 7. 計算可能期間の導出 | 変更 2 |
| 02_CONFIG_SPEC | 8. payroll run 開始時の snapshot（型定義のみ） | 変更 3 |
| 02_CONFIG_SPEC | 9. payrollConfig の管理方針 | 変更 4 |
| 01_CALC_SPEC | 1. 用語定義（定数・型のみ） | 変更 5 |
| 04_CALLABLE_API_SPEC | 10. エラーコード定義（共通） | 変更 6 |

---

## 変更 1: payrollConfig 型定義・デフォルト値・ローダー・初期化

### As-Is

- `storeMeta/config` の型定義: `functions/src/shared/config/types.ts` (`StoreConfig` interface)
- `storeMeta/config` のデフォルト値: `functions/src/shared/config/defaults.ts`
- `storeMeta/config` のローダー: `functions/src/shared/config/configLoader.ts` (`getStoreConfig`, `buildFromDefaults`, `mergeWithDefaults`)
- `storeMeta/payrollConfig` は**存在しない**。給与関連は `StoreConfig.payroll` に `startDay / endDay` のみ
- `storeMeta/schedulerConfig` は独立した型(`schedulerConfigTypes.ts`)・ローダー(`schedulerConfigLoader.ts`)・デフォルトを持つ
- 初期化: `initializeStoreConfigCallable.ts` が `storeMeta/config`, `storeMeta/requiredStaffByTimeSlot`, `storeMeta/schedulerConfig` を初期化

### To-Be

`storeMeta/payrollConfig` を `schedulerConfig` と同じパターンで独立管理する。

#### 1-1. 新規ファイル: `functions/src/shared/config/payrollConfigTypes.ts`

```typescript
export interface PayrollConfig {
  // 既存（phase4_2 から継承）
  paymentDate: string | null;
  bulkPaymentRegistrationEnabled: boolean;
  expectedRange: ExpectedRange | null;
  maxCandidatesCount: number;

  // 計算制御
  weekStartDay: number;
  weeklyLegalLimitMinutes: number;
  legalHolidayWeekday: number | null;
  calcVersion: string;

  // 割増率
  nightPremiumRate: number;
  overtimePremiumRate: number;
  over60PremiumRate: number;
  legalHolidayPremiumRate: number;

  // 端数処理
  roundingMethod: RoundingMethod;
  roundingPrecision: number;

  // 通知・スケジューラー
  schedulerNotificationHour: number;
  reminderStartDaysAfterPeriodEnd: number;
}

export interface ExpectedRange {
  attendanceCountMin?: number;
  attendanceCountMax?: number;
  estimatedAmountMin?: number;
  estimatedAmountMax?: number;
  totalHoursMin?: number;
  totalHoursMax?: number;
}

export type RoundingMethod = 'ceil' | 'floor' | 'round';
```

#### 1-2. 新規ファイル: `functions/src/shared/config/payrollConfigDefaults.ts`

```typescript
export const DEFAULT_PAYROLL_CONFIG_PAYMENT_DATE: string | null = null;
export const DEFAULT_PAYROLL_CONFIG_BULK_PAYMENT_REGISTRATION_ENABLED = false;
export const DEFAULT_PAYROLL_CONFIG_EXPECTED_RANGE = null;
export const DEFAULT_PAYROLL_CONFIG_MAX_CANDIDATES_COUNT = 1000;

export const DEFAULT_PAYROLL_CONFIG_WEEK_START_DAY = 0;
export const DEFAULT_PAYROLL_CONFIG_WEEKLY_LEGAL_LIMIT_MINUTES = 2400;
export const DEFAULT_PAYROLL_CONFIG_LEGAL_HOLIDAY_WEEKDAY: number | null = null;
export const DEFAULT_PAYROLL_CONFIG_CALC_VERSION = '1.0';

export const DEFAULT_PAYROLL_CONFIG_NIGHT_PREMIUM_RATE = 0.25;
export const DEFAULT_PAYROLL_CONFIG_OVERTIME_PREMIUM_RATE = 0.25;
export const DEFAULT_PAYROLL_CONFIG_OVER_60_PREMIUM_RATE = 0.25;
export const DEFAULT_PAYROLL_CONFIG_LEGAL_HOLIDAY_PREMIUM_RATE = 0.35;

export const DEFAULT_PAYROLL_CONFIG_ROUNDING_METHOD = 'floor';
export const DEFAULT_PAYROLL_CONFIG_ROUNDING_PRECISION = 1;

export const DEFAULT_PAYROLL_CONFIG_SCHEDULER_NOTIFICATION_HOUR = 10;
export const DEFAULT_PAYROLL_CONFIG_REMINDER_START_DAYS_AFTER_PERIOD_END = 3;
```

#### 1-3. 新規ファイル: `functions/src/shared/config/payrollConfigLoader.ts`

パターンは `configLoader.ts` と同一:

```typescript
export async function getPayrollConfig(db?: Firestore): Promise<PayrollConfig>
export function buildPayrollConfigFromDefaults(): PayrollConfig
export function mergePayrollConfigWithDefaults(raw: Record<string, unknown>): PayrollConfig
export function mergePayrollConfigForUpsert(
  existing: Record<string, unknown> | undefined,
  defaults: PayrollConfig
): Record<string, unknown>
```

- `storeMeta/payrollConfig` ドキュメントを読み、未存在時はデフォルト返却
- `mergePayrollConfigWithDefaults` は各フィールドの型チェック + フォールバック
- `legalHolidayWeekday` は `number | null` を許容（null が正当値）
- `roundingMethod` は `'ceil' | 'floor' | 'round'` のみ受容
- ログは `CONFIG_ERROR_CODES` を再利用

#### 1-4. 既存ファイル変更: `functions/src/domains/storeMeta/callables/initializeStoreConfigCallable.ts`

`storeMeta/payrollConfig` の初期化処理を追加:

```
As-Is: config, requiredStaffByTimeSlot, schedulerConfig の 3 ドキュメントを初期化
To-Be: config, requiredStaffByTimeSlot, schedulerConfig, payrollConfig の 4 ドキュメントを初期化
```

- 未存在時: `buildPayrollConfigFromDefaults()` で作成
- 既存時: `mergePayrollConfigForUpsert()` で不足フィールドのみ補完

---

## 変更 2: 期間計算ユーティリティ

### As-Is

- `paymentPeriodKey`, `weekStartDate`, 計算可能期間の算出ロジックは**どこにも存在しない**
- `monthlyPayrollTrigger.ts` に期間計算の断片的なコードはあるが、再利用可能な形ではない

### To-Be

#### 新規ファイル: `functions/src/domains/attendance/helpers/payrollPeriodUtils.ts`

```typescript
/**
 * paymentPeriodKey を算出する。
 * attendance.date を基準に、startDay/endDay で定まる期間を特定する。
 *
 * @returns "YYYY-MM-DD_YYYY-MM-DD" 形式（例: "2026-03-26_2026-04-25"）
 */
export function getPaymentPeriodKey(
  date: string,
  startDay: number,
  endDay: number
): string

/**
 * 給与期間の開始日・終了日を算出する。
 *
 * @returns { periodStart: "YYYY-MM-DD", periodEnd: "YYYY-MM-DD" }
 */
export function getPayrollPeriodRange(
  date: string,
  startDay: number,
  endDay: number
): { periodStart: string; periodEnd: string }

/**
 * weekStartDate を算出する。
 * date から直近の過去方向にある weekStartDay 曜日の日付を返す。
 * date 自体が weekStartDay と同じ曜日なら date そのもの。
 *
 * @param date - "YYYY-MM-DD" 形式
 * @param weekStartDay - 0（日曜）〜 6（土曜）
 * @returns "YYYY-MM-DD" 形式
 */
export function getWeekStartDate(
  date: string,
  weekStartDay: number
): string

/**
 * 計算可能期間を算出する。
 * periodEnd の翌日 〜 paymentDate の前日。
 *
 * @returns { calcStart: "YYYY-MM-DD", calcEnd: "YYYY-MM-DD" } | null
 *          paymentDate 未設定時は null（常に計算可能と見なす）
 */
export function getCalculablePeriod(
  periodEnd: string,
  paymentDate: string | null
): { calcStart: string; calcEnd: string } | null
```

**実装の注意点**:
- `endDay = 0` は月末を意味する。月末日は月ごとに異なる（28/29/30/31）
- 日跨ぎ勤務は `date`（出勤日）で判定。`date` の所属期間を返す
- `startDay > endDay` は翌月跨ぎ（例: 26日〜25日）
- 日付操作は UTC ではなく JST 想定（date フィールドは JST の YYYY-MM-DD）

---

## 変更 3: snapshot 型定義

### As-Is

snapshot の型定義は存在しない。

### To-Be

#### 新規ファイル: `functions/src/domains/attendance/types/payrollRunTypes.ts`

```typescript
import type { RoundingMethod } from '../../../shared/config/payrollConfigTypes';

/** payrollRuns ドキュメントの run レベル snapshot フィールド */
export interface PayrollRunSnapshot {
  paymentPeriodKey: string;
  paymentPeriodStart: string;
  paymentPeriodEnd: string;
  weekStartDaySnapshot: number;
  weeklyLegalLimitMinutesSnapshot: number;
  legalHolidayWeekdaySnapshot: number | null;
  nightPremiumRateSnapshot: number;
  overtimePremiumRateSnapshot: number;
  over60PremiumRateSnapshot: number;
  legalHolidayPremiumRateSnapshot: number;
  roundingMethodSnapshot: RoundingMethod;
  roundingPrecisionSnapshot: number;
  calcVersion: string;
}

/** staffResults の staff レベル snapshot フィールド */
export interface StaffResultSnapshot {
  baseHourlyWageSnapshot: number;
  staffNameSnapshot: string;
}
```

型定義のみ。実際の書き込みは Step 05 で実装する。

---

## 変更 4: Flutter PayrollConfigService

### As-Is

- `lib/services/store_config_service.dart` — `storeMeta/config` を購読するシングルトン
- `lib/services/store_config_defaults.dart` — `StoreConfigData` のデフォルト値
- `storeMeta/payrollConfig` の購読は**存在しない**

### To-Be

`StoreConfigService` と同一パターンで `PayrollConfigService` を新規作成する。

#### 4-1. 新規ファイル: `lib/services/payroll_config_defaults.dart`

```dart
const String? kDefaultPayrollConfigPaymentDate = null;
const bool kDefaultPayrollConfigBulkPaymentRegistrationEnabled = false;
const int kDefaultPayrollConfigMaxCandidatesCount = 1000;

const int kDefaultPayrollConfigWeekStartDay = 0;
const int kDefaultPayrollConfigWeeklyLegalLimitMinutes = 2400;
const int? kDefaultPayrollConfigLegalHolidayWeekday = null;
const String kDefaultPayrollConfigCalcVersion = '1.0';

const double kDefaultPayrollConfigNightPremiumRate = 0.25;
const double kDefaultPayrollConfigOvertimePremiumRate = 0.25;
const double kDefaultPayrollConfigOver60PremiumRate = 0.25;
const double kDefaultPayrollConfigLegalHolidayPremiumRate = 0.35;

const String kDefaultPayrollConfigRoundingMethod = 'floor';
const int kDefaultPayrollConfigRoundingPrecision = 1;

const int kDefaultPayrollConfigSchedulerNotificationHour = 10;
const int kDefaultPayrollConfigReminderStartDaysAfterPeriodEnd = 3;
```

#### 4-2. 新規ファイル: `lib/services/payroll_config_service.dart`

```dart
class PayrollConfigData {
  final String? paymentDate;
  final bool bulkPaymentRegistrationEnabled;
  final int maxCandidatesCount;
  final int weekStartDay;
  final int weeklyLegalLimitMinutes;
  final int? legalHolidayWeekday;
  final String calcVersion;
  final double nightPremiumRate;
  final double overtimePremiumRate;
  final double over60PremiumRate;
  final double legalHolidayPremiumRate;
  final String roundingMethod;
  final int roundingPrecision;
  final int schedulerNotificationHour;
  final int reminderStartDaysAfterPeriodEnd;
  // expectedRange は Flutter 側では使用しないため省略可
  // （異常値チェックは Cloud Functions 側で実行）

  // fromMap(), fromDefaults() ファクトリ
}

class PayrollConfigService {
  static final PayrollConfigService _instance = PayrollConfigService._();
  static PayrollConfigService get instance => _instance;

  // storeMeta/payrollConfig を snapshots() で購読
  // StoreConfigService と同じパターン
  Stream<PayrollConfigData> get stream => _streamController.stream;
  PayrollConfigData? get latest => _latestData;
}
```

#### 4-3. 既存ファイル変更: `lib/main.dart`

`PayrollConfigService.instance;` を追加し、アプリ起動時に購読を開始する。

```
As-Is: StoreConfigService.instance; のみ
To-Be: StoreConfigService.instance; + PayrollConfigService.instance;
```

---

## 変更 5: 計算用語・定数

### As-Is

給与計算用の定数・型は存在しない。

### To-Be

#### 新規ファイル: `functions/src/domains/attendance/types/payrollCalcTypes.ts`

```typescript
/** 1日の法定労働時間上限（分） */
export const DAILY_LEGAL_LIMIT_MINUTES = 480;

/** attendance の給与反映ステータス */
export type PayrollStatus = 'unreflected' | 'reflected' | 'corrected_after_reflection';

/** getPayrollCandidates の属性 */
export type CandidateReasonType = 'in_period' | 'carry_over' | 'other';

/** staffResults の支払いステータス */
export type PaymentStatus = 'unpaid' | 'paid' | 'hold';

/** payrollRuns のステータス */
export type PayrollRunStatus =
  | 'preparing'
  | 'processing'
  | 'aggregating'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'cancelled';

/** monthlyPayroll のステータス */
export type MonthlyPayrollStatus = 'draft' | 'confirmed' | 'hold' | 'paid';
```

---

## 変更 6: エラーコード定義

### As-Is

payroll 固有のエラーコードは存在しない。各 Callable は `HttpsError` の組み込みコードを直接使用。

### To-Be

#### 新規ファイル: `functions/src/domains/attendance/helpers/payrollErrors.ts`

```typescript
export const PAYROLL_ERRORS = {
  PERMISSION_DENIED: 'permission-denied',
  ALREADY_CONFIRMED: 'already-confirmed',
  INVALID_PERIOD: 'invalid-period',
  NO_ATTENDANCE_SELECTED: 'no-attendance-selected',
  PAYROLL_CONFIG_NOT_FOUND: 'payroll-config-not-found',
  RUN_NOT_FOUND: 'run-not-found',
  RUN_NOT_COMPLETED: 'run-not-completed',
  INVALID_RUN_STATUS: 'invalid-run-status',
  RUN_CANCELLED: 'run-cancelled',
  NOT_CONFIRMED: 'not-confirmed',
  ALREADY_PAID: 'already-paid',
  STAFF_ALREADY_PAID: 'staff-already-paid',
} as const;

export type PayrollErrorCode = typeof PAYROLL_ERRORS[keyof typeof PAYROLL_ERRORS];
```

---

## 実装順序

1. `payrollConfigTypes.ts` — 型定義（他の全てが依存）
2. `payrollConfigDefaults.ts` — デフォルト値
3. `payrollConfigLoader.ts` — ローダー（型 + デフォルトに依存）
4. `payrollCalcTypes.ts` — 計算用定数・型
5. `payrollRunTypes.ts` — snapshot 型定義（payrollConfigTypes に依存）
6. `payrollErrors.ts` — エラーコード
7. `payrollPeriodUtils.ts` — 期間計算ユーティリティ
8. `initializeStoreConfigCallable.ts` 修正 — payrollConfig 初期化追加
9. `payroll_config_defaults.dart` — Flutter デフォルト値
10. `payroll_config_service.dart` — Flutter 購読サービス
11. `main.dart` 修正 — 購読開始追加

---

## テスト計画

### 単体テスト（Jest）

テストファイル: `functions/__tests__/config/payrollConfigLoader.spec.ts`

| # | テストケース | 検証内容 |
|---|------------|---------|
| 1 | payrollConfig 未存在時にデフォルト値を返す | 全16フィールドがデフォルト値と一致 |
| 2 | payrollConfig 存在時に値をマージ | Firestore 値が優先、未設定フィールドはデフォルト |
| 3 | 不正な roundingMethod でデフォルトにフォールバック | `"invalid"` → `"floor"` |
| 4 | legalHolidayWeekday = null が正当値として扱われる | null のまま保持される |
| 5 | legalHolidayWeekday = 0（日曜）が正当値として扱われる | 0 のまま保持される |
| 6 | 不正な型の値でデフォルトにフォールバック | string の weekStartDay → デフォルト 0 |
| 7 | mergePayrollConfigForUpsert が既存値を上書きしない | 既存フィールドは保持、不足のみ追加 |
| 8 | buildPayrollConfigFromDefaults の全フィールド確認 | 全16フィールドが正しいデフォルトを返す |

テストファイル: `functions/__tests__/attendance/payrollPeriodUtils.spec.ts`

| # | テストケース | 検証内容 |
|---|------------|---------|
| 1 | 通常パターン: startDay=26, endDay=25 | date=2026-03-18 → `"2026-02-26_2026-03-25"` |
| 2 | 期間開始日ちょうど | date=2026-02-26 → `"2026-02-26_2026-03-25"` |
| 3 | 期間終了日ちょうど | date=2026-03-25 → `"2026-02-26_2026-03-25"` |
| 4 | endDay=0（月末） | startDay=1, endDay=0, date=2026-02-15 → `"2026-02-01_2026-02-28"` |
| 5 | 閏年の月末 | startDay=1, endDay=0, date=2028-02-15 → `"2028-02-01_2028-02-29"` |
| 6 | startDay=1, endDay=31 | date=2026-03-15 → `"2026-03-01_2026-03-31"` |
| 7 | weekStartDate: 日曜始まり | weekStartDay=0, date=2026-03-18(水) → `"2026-03-15"` |
| 8 | weekStartDate: 月曜始まり | weekStartDay=1, date=2026-03-18(水) → `"2026-03-16"` |
| 9 | weekStartDate: 当日が開始曜日 | weekStartDay=3, date=2026-03-18(水) → `"2026-03-18"` |
| 10 | weekStartDate: 土曜始まり | weekStartDay=6, date=2026-03-18(水) → `"2026-03-14"` |
| 11 | 計算可能期間: 通常 | periodEnd=2026-03-25, paymentDate=2026-04-25 → `{ calcStart: "2026-03-26", calcEnd: "2026-04-24" }` |
| 12 | 計算可能期間: paymentDate=null | periodEnd=2026-03-25, paymentDate=null → null（常時計算可能） |
| 13 | getPayrollPeriodRange: 年跨ぎ | startDay=26, endDay=25, date=2026-01-10 → `{ periodStart: "2025-12-26", periodEnd: "2026-01-25" }` |
| 14 | getPayrollPeriodRange: endDay=0 の年跨ぎ | startDay=1, endDay=0, date=2026-01-15 → `{ periodStart: "2026-01-01", periodEnd: "2026-01-31" }` |

テストファイル: `functions/__tests__/attendance/payrollErrors.spec.ts`

| # | テストケース | 検証内容 |
|---|------------|---------|
| 1 | 全12エラーコードが export されている | Object.keys の数と値の一致 |

### 実機確認が必要な項目

| # | 確認内容 | 理由 |
|---|---------|------|
| 1 | initializeStoreConfigCallable 実行後に storeMeta/payrollConfig が作成される | エミュレータで確認可能だが、実際の Firebase コンソールでの初期化フローを確認したい |
| 2 | Flutter PayrollConfigService の購読が動作する | Flutter アプリの起動フローに組み込まれるため、実機確認が望ましい |

---

## 変更対象ファイル一覧

### 新規作成（Functions）

| # | ファイルパス | 説明 |
|---|-----------|------|
| 1 | `functions/src/shared/config/payrollConfigTypes.ts` | PayrollConfig 型定義 |
| 2 | `functions/src/shared/config/payrollConfigDefaults.ts` | デフォルト値 |
| 3 | `functions/src/shared/config/payrollConfigLoader.ts` | ローダー |
| 4 | `functions/src/domains/attendance/helpers/payrollPeriodUtils.ts` | 期間計算ユーティリティ |
| 5 | `functions/src/domains/attendance/types/payrollRunTypes.ts` | snapshot 型定義 |
| 6 | `functions/src/domains/attendance/types/payrollCalcTypes.ts` | 計算用定数・型 |
| 7 | `functions/src/domains/attendance/helpers/payrollErrors.ts` | エラーコード |

### 新規作成（Flutter）

| # | ファイルパス | 説明 |
|---|-----------|------|
| 8 | `lib/services/payroll_config_defaults.dart` | デフォルト値 |
| 9 | `lib/services/payroll_config_service.dart` | 購読サービス |

### 既存変更

| # | ファイルパス | 変更内容 |
|---|-----------|---------|
| 10 | `functions/src/domains/storeMeta/callables/initializeStoreConfigCallable.ts` | payrollConfig 初期化追加 |
| 11 | `lib/main.dart` | PayrollConfigService.instance 追加 |

### 新規作成（テスト）

| # | ファイルパス | 説明 |
|---|-----------|------|
| 12 | `functions/__tests__/config/payrollConfigLoader.spec.ts` | payrollConfig ローダーテスト |
| 13 | `functions/__tests__/attendance/payrollPeriodUtils.spec.ts` | 期間計算テスト |
| 14 | `functions/__tests__/attendance/payrollErrors.spec.ts` | エラーコードテスト |
