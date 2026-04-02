# 給与計算 丸め方の修正 — AS-IS 確認 & チェンジスペック

バージョン: 2026-03-27 初版

---

## 1. AS-IS 詳細確認

### 1.1 `functions/src/domains/attendance/helpers/payrollRoundingUtils.ts`

```typescript
// AS-IS
export function payrollRound(value, method, precision): number {
  const factor = Math.pow(10, precision);   // ← precision を指数として使用
  const shifted = value * factor;
  switch (method) {
    case 'ceil':  return Math.ceil(shifted)  / factor;
    case 'floor': return Math.floor(shifted) / factor;
    case 'round': return Math.round(shifted) / factor;
  }
}
```

**問題:** `precision=1` → `factor=10` → 小数第1位で処理（正）だが、
Firestoreに入っている `roundingPrecision=100` は `factor=10^100` → 事実上0に丸める誤動作。

---

### 1.2 `functions/src/domains/attendance/helpers/payrollCalcEngine.ts` — `calcAmount`

```typescript
// AS-IS: 各項目に個別に payrollRound を適用
export function calcAmount(totals, config): AmountResult {
  const r = (v) => payrollRound(v, roundingMethod, roundingPrecision);

  const basePay             = r(totals.totalActualWorkMinutes / 60 * baseHourlyWage);
  const lateNightPremiumPay = r(totals.totalNightWorkMinutes / 60 * baseHourlyWage * nightPremiumRate);
  const overtimePremiumPay  = r(totals.totalLegalOvertimeMinutes / 60 * baseHourlyWage * overtimePremiumRate);
  const over60PremiumPay    = r(totals.over60OvertimeMinutes / 60 * baseHourlyWage * over60PremiumRate);
  const legalHolidayPremiumPay = r(totals.totalLegalHolidayWorkMinutes / 60 * baseHourlyWage * legalHolidayPremiumRate);

  const grossPay = basePay + lateNightPremiumPay + overtimePremiumPay + over60PremiumPay + legalHolidayPremiumPay;
  // ↑ grossPay に丸めは適用していない。各項目の丸め後合計

  return { basePay, lateNightPremiumPay, overtimePremiumPay, over60PremiumPay, legalHolidayPremiumPay, grossPay };
}
```

**問題:**
- 丸め誤差が項目数ぶん積み上がる
- grossPayRaw / basePayRaw が存在しない

`AmountResult` インターフェース（同ファイル）にも `grossPayRaw` / `basePayRaw` がない。

---

### 1.3 `functions/src/domains/attendance/types/payrollCalcTypes.ts` — `StaffCalcResult`

```typescript
// AS-IS
export interface StaffCalcResult {
  staffId: string;
  totalActualWorkMinutes: number;
  // ... 省略 ...
  basePay: number;              // ← 個別丸め後
  lateNightPremiumPay: number;  // ← 個別丸め後
  overtimePremiumPay: number;
  over60PremiumPay: number;
  legalHolidayPremiumPay: number;
  grossPay: number;             // ← 各丸め後の合計
  // grossPayRaw / basePayRaw が存在しない
}
```

---

### 1.4 `functions/src/shared/config/payrollConfigLoader.ts` — roundingPrecision バリデーション

```typescript
// AS-IS: 「> 0 の数値」なら有効
if (typeof raw.roundingPrecision === 'number' && raw.roundingPrecision > 0) {
  result.roundingPrecision = raw.roundingPrecision;
  fromConfig.push('roundingPrecision');
} else if (raw.roundingPrecision !== undefined) {
  fb('roundingPrecision', 'invalid_value');
} else {
  fb('roundingPrecision', 'field_missing');
}
```

また同ファイル下部 `buildPayrollConfigFromDefaults` でも同様の条件（`> 0`）を使用。

**問題:** `50` や `3` のような非 10冪値が有効として通る。

---

### 1.5 `functions/src/shared/config/payrollConfigDefaults.ts`

```typescript
// AS-IS
export const DEFAULT_PAYROLL_CONFIG_ROUNDING_PRECISION = 1;
```

デフォルト値 `1` は新仕様でも有効（1円単位）なので変更不要。ただしコメントを更新する。

---

### 1.6 `functions/src/domains/attendance/tasks/processStaffPayroll.ts` — staffResults 書き込み

```typescript
// AS-IS: 書き込みフィールド（抜粋）
trx.update(staffResultRef, {
  basePay:                normalResult.basePay,
  lateNightPremiumPay:    normalResult.lateNightPremiumPay,
  overtimePremiumPay:     normalResult.overtimePremiumPay,
  over60PremiumPay:       normalResult.over60PremiumPay,
  legalHolidayPremiumPay: normalResult.legalHolidayPremiumPay,
  grossPay: normalResult.grossPay + coTotalGrossPay,
  carryOverGrossPay: coTotalGrossPay,
  // grossPayRaw / basePayRaw が存在しない
});
```

---

### 1.7 `functions/src/domains/attendance/helpers/payrollRunHelpers.ts` — `StaffResultForAggregation`

```typescript
// AS-IS
export interface StaffResultForAggregation {
  taskStatus: string;
  status?: string;
  basePay?: number;
  lateNightPremiumPay?: number;
  overtimePremiumPay?: number;
  over60PremiumPay?: number;
  legalHolidayPremiumPay?: number;
  grossPay?: number;
  // grossPayRaw が存在しない（集計には使わないので追加不要だが確認済み）
}
```

集計上 `grossPayRaw` は不要のため変更なし。

---

### 1.8 `functions/__tests__/attendance/payrollCalcEngine.spec.ts` — 影響を受けるテスト

**payrollRound テスト (R1〜R6):** `precision` が指数として使われていることを前提とした値

```
R1: payrollRound(123.456, 'ceil',  0) → 124     ← precision=0 で 1の位 (factor=1)
R2: payrollRound(123.456, 'floor', 0) → 123
R5: payrollRound(1234,    'floor', -1) → 1230   ← precision=-1 で 10の位 (factor=0.1)
```

**calcAmount テスト (U8, U9):** 個別丸め前提

```
U8: basePay = floor(2700/60 * 1200) = 54000    ← per-item rounding
U9: ceilResult.basePay = 1667                   ← per-item rounding
```

---

### 1.9 Flutter — `lib/payroll/widgets/staff_card.dart` — `StaffCardData`

```dart
// AS-IS: すべて int
final int basePay;
final int lateNightPremiumPay;
final int overtimePremiumPay;
final int over60PremiumPay;
final int legalHolidayPremiumPay;
final int grossPay;

// fromFirestore:
basePay: (data['basePay'] as num?)?.toInt() ?? 0,
grossPay: (data['grossPay'] as num?)?.toInt() ?? 0,
// ... 他の項目も .toInt()
// grossPayRaw / basePayRaw が存在しない
```

---

### 1.10 Flutter — `lib/payroll/widgets/staff_detail_page.dart`

```dart
// AS-IS: 表示
_infoRow('基本給',   '¥${yenFormat.format(d.basePay)}');
_infoRow('総支給額', '¥${yenFormat.format(d.grossPay)}', bold: true);
// yenFormat = NumberFormat('#,###') → 整数前提
// 丸め前の値は表示なし
```

---

## 2. チェンジスペック（修正箇所一覧）

### 変更ファイル一覧

| # | ファイル | 変更の種別 |
|---|---------|-----------|
| A | `functions/src/domains/attendance/helpers/payrollRoundingUtils.ts` | 関数シグネチャ・ロジック変更 |
| B | `functions/src/domains/attendance/helpers/payrollCalcEngine.ts` | calcAmount 変更、AmountResult 変更 |
| C | `functions/src/domains/attendance/types/payrollCalcTypes.ts` | StaffCalcResult にフィールド追加 |
| D | `functions/src/shared/config/payrollConfigLoader.ts` | roundingPrecision バリデーション変更（2箇所） |
| E | `functions/src/shared/config/payrollConfigDefaults.ts` | コメント更新 |
| F | `functions/src/domains/attendance/tasks/processStaffPayroll.ts` | staffResults 書き込み追加 |
| G | `functions/__tests__/attendance/payrollCalcEngine.spec.ts` | テスト更新（R1〜R6, U8, U9） |
| H | `lib/payroll/widgets/staff_card.dart` | 型変更・フィールド追加 |
| I | `lib/payroll/widgets/staff_detail_page.dart` | 丸め前表示の追加 |

---

### A. `payrollRoundingUtils.ts`

**変更前:**
```typescript
export function payrollRound(value, method, precision): number {
  const factor = Math.pow(10, precision);
  // ...
}
```

**変更後:**
- `payrollRound` を廃止し、`roundToYenUnit` に置き換え
- `truncateTo2Decimals` ヘルパーを新規追加

```typescript
/**
 * 小数第2位まで保持（小数第3位を四捨五入）
 */
export function truncateTo2Decimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 円の単位で端数処理する。
 *
 * unit: 1=1円単位、10=10円単位、100=100円単位、1000=1000円単位
 * 有効値は 10 の冪のみ（1 / 10 / 100 / 1000）
 */
export function roundToYenUnit(
  value: number,
  method: RoundingMethod,
  unit: number
): number {
  switch (method) {
    case 'ceil':  return Math.ceil(value  / unit) * unit;
    case 'floor': return Math.floor(value / unit) * unit;
    case 'round': return Math.round(value / unit) * unit;
  }
}
```

---

### B. `payrollCalcEngine.ts`

#### B-1. インポート変更

```typescript
// 変更前
import { payrollRound } from './payrollRoundingUtils';

// 変更後
import { roundToYenUnit, truncateTo2Decimals } from './payrollRoundingUtils';
```

#### B-2. `AmountResult` インターフェース

```typescript
// 変更前
export interface AmountResult {
  basePay: number;
  lateNightPremiumPay: number;
  overtimePremiumPay: number;
  over60PremiumPay: number;
  legalHolidayPremiumPay: number;
  grossPay: number;
}

// 変更後
export interface AmountResult {
  basePayRaw: number;             // 新規: 丸め前基本給（小数第2位まで）
  lateNightPremiumPay: number;    // 小数第2位まで（丸めなし）
  overtimePremiumPay: number;
  over60PremiumPay: number;
  legalHolidayPremiumPay: number;
  grossPayRaw: number;            // 新規: 丸め前総支給額（小数第2位まで）
  grossPay: number;               // 丸め後総支給額（整数）
  basePay: number;                // 丸め差分吸収後の基本給（小数第2位まで）
}
```

#### B-3. `calcAmount` 関数本体

```typescript
// 変更前
export function calcAmount(totals, config): AmountResult {
  const { roundingMethod, roundingPrecision, baseHourlyWage } = config;
  const r = (v: number) => payrollRound(v, roundingMethod, roundingPrecision);

  const basePay             = r(totals.totalActualWorkMinutes / 60 * baseHourlyWage);
  const lateNightPremiumPay = r(totals.totalNightWorkMinutes / 60 * baseHourlyWage * config.nightPremiumRate);
  const overtimePremiumPay  = r(totals.totalLegalOvertimeMinutes / 60 * baseHourlyWage * config.overtimePremiumRate);
  const over60PremiumPay    = r(totals.over60OvertimeMinutes / 60 * baseHourlyWage * config.over60PremiumRate);
  const legalHolidayPremiumPay = r(totals.totalLegalHolidayWorkMinutes / 60 * baseHourlyWage * config.legalHolidayPremiumRate);
  const grossPay = basePay + lateNightPremiumPay + overtimePremiumPay + over60PremiumPay + legalHolidayPremiumPay;
  return { basePay, lateNightPremiumPay, overtimePremiumPay, over60PremiumPay, legalHolidayPremiumPay, grossPay };
}

// 変更後（t2d = truncateTo2Decimals）
export function calcAmount(totals, config): AmountResult {
  const { roundingMethod, roundingPrecision, baseHourlyWage } = config;
  const t2d = truncateTo2Decimals;

  // Step 1: 各中間項目（丸めなし、小数第2位まで保持）
  const basePayRaw          = t2d(totals.totalActualWorkMinutes / 60 * baseHourlyWage);
  const lateNightPremiumPay = t2d(totals.totalNightWorkMinutes / 60 * baseHourlyWage * config.nightPremiumRate);
  const overtimePremiumPay  = t2d(totals.totalLegalOvertimeMinutes / 60 * baseHourlyWage * config.overtimePremiumRate);
  const over60PremiumPay    = t2d(totals.over60OvertimeMinutes / 60 * baseHourlyWage * config.over60PremiumRate);
  const legalHolidayPremiumPay = t2d(totals.totalLegalHolidayWorkMinutes / 60 * baseHourlyWage * config.legalHolidayPremiumRate);

  // Step 2: 丸め前総支給額
  const grossPayRaw = t2d(basePayRaw + lateNightPremiumPay + overtimePremiumPay + over60PremiumPay + legalHolidayPremiumPay);

  // Step 3: grossPay に丸めを1回適用
  const grossPay = roundToYenUnit(grossPayRaw, roundingMethod, roundingPrecision);

  // Step 4: 丸め差分を basePay に吸収
  const roundingAdjustment = grossPay - grossPayRaw;
  const basePay = t2d(basePayRaw + roundingAdjustment);

  return { basePayRaw, lateNightPremiumPay, overtimePremiumPay, over60PremiumPay, legalHolidayPremiumPay, grossPayRaw, grossPay, basePay };
}
```

#### B-4. `calculateCarryOverPayroll` の戻り値

キャリーオーバー用の `calcAmount` 呼び出し結果は `grossPay`（丸め後）のみ返す（現状通り）。`grossPayRaw` は carryOver 分には追加しない（要件外）。

---

### C. `payrollCalcTypes.ts` — `StaffCalcResult`

```typescript
// 変更前
export interface StaffCalcResult {
  // ...
  basePay: number;
  // ... 他割増 ...
  grossPay: number;
}

// 変更後（追加のみ）
export interface StaffCalcResult {
  // ...
  basePayRaw: number;    // 追加: 丸め前基本給
  basePay: number;       // 丸め差分吸収後
  // ... 他割増（型は number のまま、意味が小数になる）...
  grossPayRaw: number;   // 追加: 丸め前総支給額
  grossPay: number;      // 丸め後（整数）
}
```

`calculateStaffPayroll` の return 文に `...amounts` でスプレッドしているため、`AmountResult` に `grossPayRaw` と `basePayRaw` が追加されれば自動的に `StaffCalcResult` にも含まれる。ただし、`StaffCalcResult` インターフェース定義に明示的に追加が必要。

---

### D. `payrollConfigLoader.ts` — roundingPrecision バリデーション

**変更箇所 1: `getPayrollConfig` 内（line ~273付近）**

```typescript
// 変更前
if (typeof raw.roundingPrecision === 'number' && raw.roundingPrecision > 0) {

// 変更後
const VALID_ROUNDING_PRECISIONS = [1, 10, 100, 1000];
if (typeof raw.roundingPrecision === 'number' && VALID_ROUNDING_PRECISIONS.includes(raw.roundingPrecision)) {
```

**変更箇所 2: `buildPayrollConfigFromDefaults` 内（line ~350付近）**

```typescript
// 変更前
roundingPrecision: numOrDefault('roundingPrecision', defaults.roundingPrecision),

// 変更後（バリデーション付き）
roundingPrecision: (() => {
  const v = numOrDefault('roundingPrecision', defaults.roundingPrecision);
  return VALID_ROUNDING_PRECISIONS.includes(v) ? v : defaults.roundingPrecision;
})(),
```

※ `VALID_ROUNDING_PRECISIONS` 定数はファイル上部（`VALID_ROUNDING_METHODS` の近く）に配置。

---

### E. `payrollConfigDefaults.ts`

```typescript
// 変更前
// 端数処理
export const DEFAULT_PAYROLL_CONFIG_ROUNDING_METHOD = 'floor';
export const DEFAULT_PAYROLL_CONFIG_ROUNDING_PRECISION = 1;

// 変更後（コメント更新のみ、値は不変）
// 端数処理
export const DEFAULT_PAYROLL_CONFIG_ROUNDING_METHOD = 'floor';
/** 端数処理の円単位。有効値: 1（1円単位）/ 10（10円単位）/ 100（100円単位）/ 1000（1000円単位） */
export const DEFAULT_PAYROLL_CONFIG_ROUNDING_PRECISION = 1;
```

---

### F. `processStaffPayroll.ts` — staffResults 書き込み

```typescript
// 変更前（抜粋）
trx.update(staffResultRef, {
  basePay:                normalResult.basePay,
  lateNightPremiumPay:    normalResult.lateNightPremiumPay,
  overtimePremiumPay:     normalResult.overtimePremiumPay,
  over60PremiumPay:       normalResult.over60PremiumPay,
  legalHolidayPremiumPay: normalResult.legalHolidayPremiumPay,
  grossPay: normalResult.grossPay + coTotalGrossPay,
  carryOverGrossPay: coTotalGrossPay,
  // ...
});

// 変更後: grossPayRaw / basePayRaw を追加
trx.update(staffResultRef, {
  basePayRaw:             normalResult.basePayRaw,           // 追加
  basePay:                normalResult.basePay,
  lateNightPremiumPay:    normalResult.lateNightPremiumPay,
  overtimePremiumPay:     normalResult.overtimePremiumPay,
  over60PremiumPay:       normalResult.over60PremiumPay,
  legalHolidayPremiumPay: normalResult.legalHolidayPremiumPay,
  grossPayRaw:            normalResult.grossPayRaw,          // 追加
  grossPay: normalResult.grossPay + coTotalGrossPay,
  carryOverGrossPay: coTotalGrossPay,
  // ...
});
```

---

### G. `functions/__tests__/attendance/payrollCalcEngine.spec.ts`

#### G-1. `payrollRound` テスト (R1〜R6) → `roundToYenUnit` テストに置き換え

**既存のR1〜R6はすべて削除し、新しいテストケースに差し替える。**

```typescript
// 変更前（削除）
import { payrollRound } from '../../src/domains/attendance/helpers/payrollRoundingUtils';
describe('payrollRound', () => { ... R1〜R6 ... });

// 変更後
import { roundToYenUnit, truncateTo2Decimals } from '../../src/domains/attendance/helpers/payrollRoundingUtils';

describe('roundToYenUnit', () => {
  it('R1: floor unit=1  (12.30 → 12)',   () => expect(roundToYenUnit(12.30, 'floor', 1)).toBe(12));
  it('R2: ceil  unit=1  (12.30 → 13)',   () => expect(roundToYenUnit(12.30, 'ceil',  1)).toBe(13));
  it('R3: round unit=1  (12.50 → 13)',   () => expect(roundToYenUnit(12.50, 'round', 1)).toBe(13));
  it('R4: floor unit=10 (134 → 130)',    () => expect(roundToYenUnit(134,   'floor', 10)).toBe(130));
  it('R5: floor unit=100 (3134 → 3100)', () => expect(roundToYenUnit(3134,  'floor', 100)).toBe(3100));
  it('R6: ceil  unit=100 (3101 → 3200)', () => expect(roundToYenUnit(3101,  'ceil',  100)).toBe(3200));
  it('R7: floor unit=1000 (43500 → 43000)', () => expect(roundToYenUnit(43500, 'floor', 1000)).toBe(43000));
});

describe('truncateTo2Decimals', () => {
  it('T1: 小数第3位を四捨五入', () => expect(truncateTo2Decimals(12.3456)).toBe(12.35));
  it('T2: 繰り上がり',          () => expect(truncateTo2Decimals(99.999)).toBe(100.00));
  it('T3: 整数は不変',           () => expect(truncateTo2Decimals(100)).toBe(100));
});
```

#### G-2. `calcAmount` テスト (U8, U9) の期待値更新

**U8: 各金額項目の計算**

旧: `defaultConfig()` の `roundingPrecision=0` を `roundingPrecision=1`（1円単位）に変更。

```typescript
// 変更前の期待値（per-item rounding）
// basePay = floor(2700/60 * 1200) = floor(54000) = 54000
expect(result.basePay).toBe(54000);

// 変更後の期待値（grossPay に1回だけ丸め）
// basePayRaw = t2d(2700/60 * 1200) = t2d(54000.00) = 54000.00
// lateNightPremiumPay = t2d(120/60 * 1200 * 0.25) = t2d(600.00) = 600.00
// overtimePremiumPay = t2d(300/60 * 1200 * 0.25) = t2d(1500.00) = 1500.00
// grossPayRaw = 54000 + 600 + 1500 = 56100.00
// grossPay = floor(56100.00 / 1) * 1 = 56100
// roundingAdjustment = 56100 - 56100.00 = 0
// basePay = 54000.00 + 0 = 54000.00
expect(result.basePayRaw).toBe(54000.00);
expect(result.basePay).toBe(54000.00);
expect(result.grossPayRaw).toBe(56100.00);
expect(result.grossPay).toBe(56100);
```

**U9: roundingMethod の違い**

```typescript
// 変更前（per-item rounding）
// 100/60 * 1000 = 1666.666...
const ceilResult  = calcAmount(totals, defaultConfig({ baseHourlyWage: 1000, roundingMethod: 'ceil' }));
expect(ceilResult.basePay).toBe(1667);   // per-item ceil

// 変更後（grossPay に1回だけ丸め）
// basePayRaw = t2d(100/60 * 1000) = t2d(1666.666...) = 1666.67
// grossPayRaw = 1666.67（他項目=0）
// grossPay(ceil,unit=1) = ceil(1666.67 / 1) * 1 = 1667
// basePay = 1666.67 + (1667 - 1666.67) = 1666.67 + 0.33 = 1667.00
expect(ceilResult.grossPay).toBe(1667);
expect(ceilResult.basePay).toBe(1667.00);
expect(ceilResult.basePayRaw).toBe(1666.67);

const floorResult = calcAmount(totals, defaultConfig({ baseHourlyWage: 1000, roundingMethod: 'floor' }));
// grossPay(floor,unit=1) = floor(1666.67) = 1666
// basePay = 1666.67 + (1666 - 1666.67) = 1666.67 - 0.67 = 1666.00
expect(floorResult.grossPay).toBe(1666);
expect(floorResult.basePay).toBe(1666.00);
```

また `defaultConfig()` の `roundingPrecision: 0` を `roundingPrecision: 1` に変更（新仕様では `0` は無効値）。

---

### H. `lib/payroll/widgets/staff_card.dart` — `StaffCardData`

#### H-1. フィールド型変更と追加

```dart
// 変更前
final int basePay;
final int lateNightPremiumPay;
final int overtimePremiumPay;
final int over60PremiumPay;
final int legalHolidayPremiumPay;
final int grossPay;
// grossPayRaw / basePayRaw なし

// 変更後
final double basePay;                // int → double（小数第2位まで）
final double lateNightPremiumPay;   // int → double
final double overtimePremiumPay;    // int → double
final double over60PremiumPay;      // int → double
final double legalHolidayPremiumPay; // int → double
final int    grossPay;               // 整数のまま（丸め後）
final double? grossPayRaw;           // 追加（nullable: 旧データ互換）
final double? basePayRaw;            // 追加（nullable: 旧データ互換）
```

#### H-2. コンストラクタ引数の型変更

上記型変更に合わせて `required` パラメータの型を `int` → `double` に変更。`grossPayRaw` / `basePayRaw` は `this.grossPayRaw`, `this.basePayRaw` として任意引数に追加。

#### H-3. `fromFirestore` の変更

```dart
// 変更前
basePay: (data['basePay'] as num?)?.toInt() ?? 0,
lateNightPremiumPay: (data['lateNightPremiumPay'] as num?)?.toInt() ?? 0,
// ...

// 変更後
basePay: (data['basePay'] as num?)?.toDouble() ?? 0.0,
lateNightPremiumPay: (data['lateNightPremiumPay'] as num?)?.toDouble() ?? 0.0,
overtimePremiumPay: (data['overtimePremiumPay'] as num?)?.toDouble() ?? 0.0,
over60PremiumPay: (data['over60PremiumPay'] as num?)?.toDouble() ?? 0.0,
legalHolidayPremiumPay: (data['legalHolidayPremiumPay'] as num?)?.toDouble() ?? 0.0,
grossPay: (data['grossPay'] as num?)?.toInt() ?? 0,     // 整数のまま
grossPayRaw: (data['grossPayRaw'] as num?)?.toDouble(),  // nullable
basePayRaw: (data['basePayRaw'] as num?)?.toDouble(),    // nullable
```

#### H-4. `StaffCard` の金額表示フォーマット

`grossPay` は整数のため `NumberFormat('#,###')` のまま。他の小数フィールドは詳細画面（I）で扱うためカード上は変更なし。

---

### I. `lib/payroll/widgets/staff_detail_page.dart`

#### I-1. `yenDecimalFormat` の追加

```dart
// 追加
final yenDecimalFormat = NumberFormat('#,##0.##');   // 小数第2位まで（末尾ゼロ省略）
```

#### I-2. 「金額内訳」セクションの変更

```dart
// 変更前
_sectionTitle('金額内訳'),
_infoRow('基本給', '¥${yenFormat.format(d.basePay)}'),
_infoRow('深夜割増', '¥${yenFormat.format(d.lateNightPremiumPay)}'),
// ...
const Divider(),
_infoRow('総支給額', '¥${yenFormat.format(d.grossPay)}', bold: true),

// 変更後
_sectionTitle('金額内訳'),
// 基本給: 丸め前を別行で表示（差分がある場合のみ）
if (d.basePayRaw != null && (d.basePayRaw! - d.basePay).abs() > 0.001)
  _infoRow('基本給（丸め前）', '¥${yenDecimalFormat.format(d.basePayRaw!)}',
      subLabel: true),
_infoRow('基本給', '¥${yenDecimalFormat.format(d.basePay)}'),
// 割増項目は小数第2位まで表示
_infoRow('深夜割増',   '¥${yenDecimalFormat.format(d.lateNightPremiumPay)}'),
_infoRow('残業割増',   '¥${yenDecimalFormat.format(d.overtimePremiumPay)}'),
_infoRow('60h超割増',  '¥${yenDecimalFormat.format(d.over60PremiumPay)}'),
_infoRow('法定休日割増','¥${yenDecimalFormat.format(d.legalHolidayPremiumPay)}'),
const Divider(),
// 総支給額: 丸め前を別行で表示（差分がある場合のみ）
if (d.grossPayRaw != null && (d.grossPayRaw! - d.grossPay).abs() > 0.001)
  _infoRow('総支給額（丸め前）', '¥${yenDecimalFormat.format(d.grossPayRaw!)}',
      subLabel: true),
_infoRow('総支給額', '¥${yenFormat.format(d.grossPay)}', bold: true),
```

#### I-3. `_infoRow` に `subLabel` オプション追加

```dart
// 変更後: subLabel=true の場合はグレーで小さく表示
Widget _infoRow(String label, String value, {bool bold = false, bool subLabel = false}) {
  return Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label,
            style: TextStyle(
                color: subLabel ? Colors.grey.shade400 : Colors.grey,
                fontSize: subLabel ? 12 : null)),
        Text(value,
            style: TextStyle(
                fontWeight: bold ? FontWeight.bold : FontWeight.normal,
                color: subLabel ? Colors.grey.shade400 : null,
                fontSize: subLabel ? 12 : null)),
      ],
    ),
  );
}
```

---

## 3. 修正後の整合性チェック

| 観点 | 確認事項 |
|------|---------|
| 計算整合性 | `basePay + lateNightPremiumPay + ... = grossPay` が保証される |
| 旧データ互換 | `grossPayRaw == null` の場合、丸め前行を非表示にする |
| Flutter 型安全 | `grossPay` は `int`、その他金額は `double`、nullable フィールドは `?` |
| テスト網羅 | R1〜R6 を新仕様の roundToYenUnit テストに差し替え、U8/U9 の期待値更新 |
| Config バリデーション | `[1,10,100,1000]` 以外は `fb('roundingPrecision', 'invalid_value')` |
