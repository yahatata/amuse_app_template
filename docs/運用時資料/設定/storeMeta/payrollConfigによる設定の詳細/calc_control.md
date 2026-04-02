# 計算制御（weekStartDay / weeklyLegalLimitMinutes / legalHolidayWeekday / calcVersion）

いずれも **1 回の給与計算 run** 開始時に snapshot され、`payrollRuns` に固定される。変更は **次回 run から** 反映され、過去 run には遡及しない。

---

## weekStartDay

### 設定の説明

**法定週**の開始曜日。週単位の法定労働時間の集計境界に使う（`0` = 日曜 … `6` = 土曜、JavaScript `Date#getDay()` 準拠）。

### 何を設定するのか

整数 `0`〜`6`。デフォルト **`0`（日曜始まり）**。

### その設定により何が変わるのか

- 各勤務日から「その週の週開始日」がどこになるかが変わり、**週の法定時間外**の判定に影響する。
- `attendanceOnWrite` が各勤怠ドキュメントの **`weekStartDate`** を再計算して書き込む。変更後に既存勤怠を触らない限り **過去レコードは古い週開始日のまま**残りうるため、運用で週境界を変える場合はデータへの影響を確認すること。

### 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `functions/src/domains/attendance/triggers/attendanceOnWrite.ts` | 週開始の参照 |
| ts | `functions/src/domains/attendance/helpers/payrollRunHelpers.ts` | snapshot・calc 用オブジェクト組み立て |
| ts | `functions/src/domains/attendance/helpers/payrollCalcEngine.ts` | 計算 |
| ts | `functions/src/domains/attendance/tasks/processStaffPayroll.ts` | run snapshot から計算へ引き渡し |
| dart | `lib/services/payroll_config_service.dart` | 購読 |

---

## weeklyLegalLimitMinutes

### 設定の説明

**1 週あたりの法定労働時間の上限（分）**。通常労働時間の週 40 時間は **`2400`** 分。36 協定等の特例で 44 時間とする場合は **`2640`** などにする。

### 何を設定するのか

正の number（分）。デフォルト **`2400`**。

### その設定により何が変わるのか

上限を超えた分の扱い（法定時間外としての積み上げ）が変わる。店舗の労務実態と法令に合わせて変更する。

### 影響を受けるファイル一覧

`weekStartDay` と同様（`payrollCalcEngine.ts` が中心）。

---

## legalHolidayWeekday

### 設定の説明

**法定休日とみなす曜日**（週 1 日の休日）。`null` のときは **法定休日としての曜日判定を行わない**（全勤務を通常扱いの前提で進める。仕様上も run は正常完了しうる）。

### 何を設定するのか

`null` または `0`〜`6`。デフォルト **`null`**。

### その設定により何が変わるのか

- 設定した曜日に該当する勤務は **法定休日労働** として扱い、**法定休日割増**（`legalHolidayPremiumRate`）が適用される。
- `null` のときは法定休日割増ロジックは実質スキップ（割増率は snapshot に残るが該当勤務が生じない）。

### 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `payrollCalcEngine.ts` | 法定休日判定 |
| ts | `payrollRunHelpers.ts` / `processStaffPayroll.ts` | snapshot 伝播 |

---

## calcVersion

### 設定の説明

計算ロジックの **バージョンラベル**。将来、式の互換や移行識別に使うための予約フィールド。

### 何を設定するのか

空でない string。デフォルト **`"1.0"`**。

### その設定により何が変わるのか

現行コードでは **計算式の分岐には使われず**、run snapshot およびスタッフ結果に **記録される** のが主用途。運用・監査で「どの版の設定で計算したか」を追う。

### 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `payrollRunHelpers.ts` | snapshot |
| ts | `processStaffPayroll.ts` ほか | run データの通過 |
