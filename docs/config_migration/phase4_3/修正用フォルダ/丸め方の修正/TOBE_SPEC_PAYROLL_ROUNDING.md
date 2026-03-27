# 給与計算 丸め方の修正 — TO-BE仕様書

バージョン: 2026-03-27 初版

---

## 1. 変更の背景と目的

### 1.1 AS-IS の問題

| 問題 | 内容 |
|------|------|
| roundingPrecision の解釈誤り | コードが `Math.pow(10, precision)` を使用しており、`precision=1` → 小数第1位、`precision=100` → `10^100` 乗という意味になっている。Firestore に入っている値 `100` は意図（100円単位）と全く異なる動作をする |
| 丸めの適用タイミング | 各支給項目（basePay、深夜割増等）に個別に丸めを適用し、その合計を grossPay としているため、丸め誤差が項目数ぶん積み上がる |
| 明細の整合性 | basePay + 各割増の合計が grossPay に一致しないケースが生じうる |

### 1.2 変更の目的

- `roundingPrecision` を直感的な「円の単位」として再定義する
- 丸めは最終的な総支給額（grossPay）にのみ1回適用する
- 丸め差分を basePay に吸収させ、「明細の合計 = grossPay」を保証する
- 計算の透明性のため、丸め前の数値も Firestore に保存し、スタッフ詳細画面で確認できるようにする

---

## 2. roundingPrecision の新定義

### 2.1 意味の変更

| 値 | 旧解釈（AS-IS） | 新解釈（TO-BE） |
|----|-----------------|-----------------|
| `1` | 小数第1位で処理 | **1円単位**（123.7円 → 123円） |
| `10` | 小数第10位 ≒ 無意味 | **10円単位**（134円 → 130円） |
| `100` | `10^100` ≒ 無意味 | **100円単位**（3134円 → 3100円） |
| `1000` | - | **1000円単位**（43500円 → 43000円） |

### 2.2 有効値の制約

- `1 / 10 / 100 / 1000` のみ有効（10の冪のみ）
- それ以外の値は `invalid_value` フォールバックとして `1`（1円単位）を使用
- バリデーション条件: `[1, 10, 100, 1000].includes(roundingPrecision)`

### 2.3 新しい丸め式

```
grossPay = roundingMethod( grossPayRaw / roundingPrecision ) * roundingPrecision
```

| roundingMethod | 処理 |
|----------------|------|
| `floor` | 切り捨て |
| `ceil` | 切り上げ |
| `round` | 四捨五入 |

**計算例（roundingMethod = floor）:**

| roundingPrecision | grossPayRaw | grossPay |
|-------------------|-------------|----------|
| 1 | 12.30 | 12 |
| 10 | 134.50 | 130 |
| 100 | 3134.75 | 3100 |
| 1000 | 43500.00 | 43000 |

---

## 3. 計算フロー（TO-BE）

```
Step 1: 各中間項目の計算（丸めなし、小数第2位まで保持）
  basePayRaw              = actualWorkMinutes / 60 * baseHourlyWage
  lateNightPremiumPay     = nightWorkMinutes / 60 * baseHourlyWage * nightPremiumRate
  overtimePremiumPay      = legalOvertimeMinutes / 60 * baseHourlyWage * overtimePremiumRate
  over60PremiumPay        = over60OvertimeMinutes / 60 * baseHourlyWage * over60PremiumRate
  legalHolidayPremiumPay  = legalHolidayWorkMinutes / 60 * baseHourlyWage * legalHolidayPremiumRate

  ※各値は小数第3位を四捨五入して小数第2位まで保持

Step 2: 丸め前総支給額の算出
  grossPayRaw = basePayRaw + lateNightPremiumPay + overtimePremiumPay
              + over60PremiumPay + legalHolidayPremiumPay

Step 3: 丸めの適用（grossPay のみ）
  grossPay = roundingMethod( grossPayRaw / roundingPrecision ) * roundingPrecision
  ※grossPay は整数になる（roundingPrecision が 10 の冪のため）

Step 4: 基本給への丸め差分吸収
  roundingAdjustment = grossPay - grossPayRaw
  basePay = basePayRaw + roundingAdjustment

  ※basePay + lateNightPremiumPay + ... = grossPay が保証される
```

---

## 4. Firestore フィールド変更（staffResults ドキュメント）

### 4.1 新規追加フィールド

| フィールド名 | 型 | 内容 |
|-------------|-----|------|
| `grossPayRaw` | number | 丸め前総支給額（小数第2位まで） |
| `basePayRaw` | number | 丸め前基本給（小数第2位まで） |

### 4.2 意味が変わるフィールド（名前は変わらない）

| フィールド名 | AS-IS | TO-BE |
|-------------|-------|-------|
| `grossPay` | 各項目を個別丸め後の合計（整数） | `roundToUnit(grossPayRaw, unit)` の結果（整数） |
| `basePay` | 個別に丸めた基本給 | `basePayRaw + roundingAdjustment`（丸め差分吸収後、小数第2位まで） |

### 4.3 変わらないフィールド（計算式は同じだが小数精度が変化）

| フィールド名 | 変化点 |
|-------------|--------|
| `lateNightPremiumPay` | 整数 → 小数第2位まで（丸め適用なし） |
| `overtimePremiumPay` | 整数 → 小数第2位まで（丸め適用なし） |
| `over60PremiumPay` | 整数 → 小数第2位まで（丸め適用なし） |
| `legalHolidayPremiumPay` | 整数 → 小数第2位まで（丸め適用なし） |

### 4.4 小数精度のルール

- 中間計算値（各割増・basePayRaw・grossPayRaw）は **小数第3位を四捨五入** し、**小数第2位まで** 保存
- `grossPay` は整数（roundingPrecision が 10 の冪のため、丸め後は必ず整数）
- `basePay` は `basePayRaw + roundingAdjustment` のため小数になり得る。小数第2位まで保存

---

## 5. UI 変更（スタッフ詳細画面）

### 5.1 総支給額の表示

現状：
```
総支給額  ¥56,100
```

変更後：
```
総支給額（丸め前）  ¥56,100.30    ← grossPayRaw（decimal format）
総支給額          ¥56,100       ← grossPay（整数、太字）
```

### 5.2 基本給の表示

現状：
```
基本給  ¥54,000
```

変更後：
```
基本給（丸め前）  ¥54,000.30    ← basePayRaw（decimal format）
基本給          ¥53,999.70    ← basePay（丸め差分吸収後）
  ※ 丸め調整: -0.60
```

- `basePay == basePayRaw` の場合（丸め差分 0）は「丸め前」行を表示しない
- `grossPay == grossPayRaw` の場合（丸め差分 0）は「丸め前」行を表示しない

### 5.3 表示フォーマット

| 値の種類 | フォーマット | 例 |
|---------|------------|-----|
| 整数金額 | `NumberFormat('#,###')` | ¥56,100 |
| 小数金額 | `NumberFormat('#,##0.##')` | ¥56,100.30 |

---

## 6. 制約・注意事項

### 6.1 キャリーオーバー計算

- キャリーオーバー分の計算（`calculateCarryOverPayroll`）も同様に丸めを grossPay にのみ適用
- `carryOverGrossPay` も丸め後の整数として保存
- キャリーオーバーの `grossPayRaw` は staffResults に別途保存しない（grossPay 単体で管理）

### 6.2 集計（finalizePayrollRun）

- `aggregateStaffResults` の `totalBasePay` は `basePay`（丸め吸収後）を合算する
- `totalGrossPay` は `grossPay`（整数）を合算する
- これら集計値は小数を含む可能性があるため、表示時は小数第2位まで対応すること

### 6.3 バリデーション（payrollConfigLoader）

- `roundingPrecision` のバリデーション条件を `> 0` から `[1, 10, 100, 1000] に含まれる` に変更
- 無効値の場合はフォールバックとして `1` を使用（`fb('roundingPrecision', 'invalid_value')` を維持）

### 6.4 既存データとの互換性

- 本変更は **新規実行分から** 適用。既存の staffResults ドキュメントには `grossPayRaw`・`basePayRaw` フィールドが存在しない
- UI 側は `grossPayRaw == null` の場合、`grossPayRaw` 表示行を省略することで旧データにも対応する
- 既存データの grossPay・basePay の再計算は行わない

---

## 7. テスト要件

### 7.1 payrollRoundingUtils のテスト

| ケース | 入力 | 期待値 |
|-------|------|--------|
| floor, unit=1 | 12.30 | 12 |
| ceil, unit=1 | 12.30 | 13 |
| round, unit=1 | 12.50 | 13 |
| floor, unit=10 | 134.99 | 130 |
| ceil, unit=10 | 130.01 | 140 |
| floor, unit=100 | 3134.75 | 3100 |
| floor, unit=1000 | 43500.00 | 43000 |
| truncateTo2Decimals | 12.3456 | 12.35 |
| truncateTo2Decimals | 99.999 | 100.00 |

### 7.2 payrollCalcEngine のテスト（既存テスト更新）

- U8（calcAmount）: 期待値を新仕様に合わせて更新
- U9（roundingMethod の違い）: per-item から grossPay 単体丸めに更新

### 7.3 payrollConfigLoader のテスト

- roundingPrecision=100 → valid（新仕様では有効）
- roundingPrecision=50 → invalid_value → フォールバック 1
- roundingPrecision=0 → invalid_value → フォールバック 1
