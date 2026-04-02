# 割増率（night / overtime / over60 / legalHoliday）

いずれも **基本賃率 1.0 に「加算する割増分」** として扱う（`01_CALC_SPEC` の定義に準拠）。`executeMonthlyPayroll` 時点の `payrollConfig` が snapshot され、分散計算タスクでも snapshot 値が使われる。

---

## 共通の型・バリデーション

- 型: `number`、**0 以上**（負値は不正でデフォルトへ）。
- 変更の遡及: **なし**（確定済み run は旧 snapshot）。

---

## nightPremiumRate

### 設定の説明

**深夜労働**に対する割増率（基本時給に対する上乗せ分）。

### デフォルト

**`0.25`**（25% 割増相当の係数として計算式に組み込まれる）。

### 影響を受けるファイル一覧

| 種別 | ファイル |
|------|----------|
| ts | `functions/src/domains/attendance/helpers/payrollCalcEngine.ts`（`lateNightPremiumPay`） |
| ts | `payrollRunHelpers.ts`, `processStaffPayroll.ts` |

**注**: 深夜の時間帯そのものは `storeMeta/config` の `attendance.nightWorkStartHour` / `nightWorkEndHour`（SSOT）。割増の「率」だけが `payrollConfig`。

---

## overtimePremiumRate

### 設定の説明

**法定時間外**（かつ月 60 時間以内の枠で扱う部分など、仕様上の時間外）に対する割増率。

### デフォルト

**`0.25`**

---

## over60PremiumRate

### 設定の説明

**月 60 時間超の法定時間外**に対して、`overtimePremiumRate` に **上乗せする追加分**。

### デフォルト

**`0.25`**

---

## legalHolidayPremiumRate

### 設定の説明

**法定休日労働**に対する割増率。`legalHolidayWeekday` が `null` のときは法定休日勤務が発生しないため **実質参照されない**。

### デフォルト

**`0.35`**

---

## その設定により何が変わるのか（まとめ）

- 同じ勤怠・同じ時給でも、**支給額の内訳**（深夜・時間外・休日）が変わる。
- 法令・就業規則に合わせて率を変える場合は、**次回 run 以降**にのみ反映し、過去の確定済み給与は触れない設計。

### 影響を受けるファイル一覧（共通）

| 種別 | ファイル |
|------|----------|
| ts | `functions/src/shared/config/payrollConfigLoader.ts` |
| ts | `functions/src/domains/attendance/helpers/payrollCalcEngine.ts` |
| ts | `functions/src/domains/attendance/helpers/payrollRunHelpers.ts` |
| ts | `functions/src/domains/attendance/tasks/processStaffPayroll.ts` |
| ts | `functions/src/domains/attendance/types/payrollRunTypes.ts` |
| dart | `lib/services/payroll_config_service.dart` |
