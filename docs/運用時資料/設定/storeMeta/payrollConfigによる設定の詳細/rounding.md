# 端数処理（roundingMethod / roundingPrecision）

金額計算の各項目（基本給、深夜割増、時間外など）に対して、**円単位の丸め**を適用する。run 開始時に snapshot される。

---

## roundingMethod

### 設定の説明

端数処理の **方式**。

### 何を設定するのか

次のいずれかの文字列:

| 値 | 意味 |
|----|------|
| `floor` | 切り捨て（既定） |
| `ceil` | 切り上げ |
| `round` | 四捨五入 |

不正値・欠落時は **`floor`** にフォールバック。

### 計算式（概念）

`round(value) = roundingMethod(value / roundingPrecision) * roundingPrecision`  
（`roundingMethod` は上表の意味に対応する数学関数）

### その設定により何が変わるのか

同じ分・同じ時給でも、**合計支給額**が数円〜数十円単位で変わりうる。就業規則・会計方針に合わせて固定すること。

---

## roundingPrecision

### 設定の説明

端数を処理する **円の粒度**。

### 何を設定するのか

**`1` / `10` / `100` / `1000`** のみ有効（それ以外はデフォルトへ）。デフォルト **`1`**（1 円単位）。

### その設定により何が変わるのか

例: `10` にすると 10 円未満がまとめて切り捨て／四捨五入等され、**細かい端数が消える**。レアケースで総額差が大きく見えることがある。

---

## 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `functions/src/domains/attendance/helpers/payrollCalcEngine.ts` | 各項目への適用 |
| ts | `functions/src/domains/attendance/helpers/payrollRunHelpers.ts` | snapshot |
| ts | `functions/src/domains/attendance/tasks/processStaffPayroll.ts` | run から engine へ |
| ts | `functions/src/shared/config/payrollConfigLoader.ts` | 検証（precision は 1/10/100/1000 のみ） |
| dart | `lib/services/payroll_config_service.dart` | 購読（表示・将来 UI 用） |
