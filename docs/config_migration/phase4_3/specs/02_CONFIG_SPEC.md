# 02: 設定仕様

**ステータス**: 最終確定
**最終更新**: 2026-03-21

---

## 仕様概要

給与計算に必要な設定値の定義と格納場所を定める。既存の `storeMeta/config` の payroll 設定を SSOT として維持しつつ、残業・休日労働計算に必要な新しい設定（割増率、法定休日、端数処理等）を `storeMeta/payrollConfig` に追加する。すべての新規設定は店舗ごとに独立して管理される（1リポジトリ・複数 Firebase プロジェクト構成に対応）。

---

## 仕様詳細

### 1. 設定の配置方針

| 配置先 | 役割 | 変更頻度 |
|--------|------|---------|
| `storeMeta/config` の `payroll` | 給与期間の定義（SSOT）| 原則変更しない |
| `storeMeta/config` の `attendance` | 深夜時間帯の定義 | 原則変更しない |
| `storeMeta/payrollConfig` | 給与計算固有の設定（新規追加含む）| 初期設定後は原則変更しない。変更は次回の給与計算 run から反映される |

### 2. storeMeta/config — 既存設定（変更なし）

#### payroll

| フィールド | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| startDay | number | 26 | 給与期間の開始日 |
| endDay | number | 25 | 給与期間の終了日（0=月末） |

#### attendance

| フィールド | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| nightWorkStartHour | number | 22 | 深夜時間帯の開始時（0-23） |
| nightWorkEndHour | number | 5 | 深夜時間帯の終了時（0-23） |

### 3. storeMeta/payrollConfig — 既存フィールド（phase4_2 から継承）

| フィールド | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| paymentDate | string (YYYY-MM-DD) | — | 支払日。計算可能期間の導出に使用 |
| bulkPaymentRegistrationEnabled | boolean? | false | 一括支払い済み登録の可否 |
| expectedRange | object? | null | 想定範囲（異常値チェック用）。null の場合はチェックなし。運用開始後に実績ベースで設定する |
| expectedRange.attendanceCountMin | number? | — | attendance 件数の下限 |
| expectedRange.attendanceCountMax | number? | — | attendance 件数の上限 |
| expectedRange.estimatedAmountMin | number? | — | 概算金額の下限 |
| expectedRange.estimatedAmountMax | number? | — | 概算金額の上限 |
| expectedRange.totalHoursMin | number? | — | 合計時間の下限 |
| expectedRange.totalHoursMax | number? | — | 合計時間の上限 |
| maxCandidatesCount | number? | 1000 | 対象データ抽出 Callable の返却件数上限 |

### 4. storeMeta/payrollConfig — 新規追加フィールド

#### 計算制御

| フィールド | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| weekStartDay | number | 0 | 法定週の開始曜日（0=日曜〜6=土曜。JavaScript getDay() 準拠） |
| weeklyLegalLimitMinutes | number | 2400 | 週の法定労働時間上限（分）。通常 2400（40h）、特例措置 2640（44h） |
| legalHolidayWeekday | number \| null | null | 法定休日の曜日（0=日曜〜6=土曜）。null の場合は法定休日判定を行わず、全 attendance が通常処理される。給与計算は null でも正常動作する（01_CALC_SPEC セクション3参照） |
| calcVersion | string | `"1.0"` | 計算ロジックのバージョン。将来の互換性管理用 |

#### 割増率

| フィールド | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| nightPremiumRate | number | 0.25 | 深夜割増率。basePay(1.0) に加算する割増分（01_CALC_SPEC セクション10参照） |
| overtimePremiumRate | number | 0.25 | 法定時間外割増率（60h以内）。basePay(1.0) に加算する割増分 |
| over60PremiumRate | number | 0.25 | 月60時間超の追加割増率。overtimePremiumRate に上乗せする追加分 |
| legalHolidayPremiumRate | number | 0.35 | 法定休日割増率。basePay(1.0) に加算する割増分。legalHolidayWeekday = null の場合は使用されない |

#### 端数処理

| フィールド | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| roundingMethod | string | `"floor"` | 端数処理の方式。`"ceil"`（切上げ）/ `"floor"`（切捨て）/ `"round"`（四捨五入） |
| roundingPrecision | number | 1 | 端数処理の適用単位。1 = 1円単位、10 = 10円単位、100 = 100円単位 |

#### 通知・スケジューラー

| フィールド | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| schedulerNotificationHour | number | 10 | スケジューラー通知の配信時刻（0〜23、JST）。リマインド・警告等すべてのスケジューラー経由通知がこの時刻に配信される（07_NOTIFICATION_SCHEDULER_SPEC セクション3参照） |
| reminderStartDaysAfterPeriodEnd | number | 3 | リマインド通知の開始日（periodEnd から何日後にリマインドを開始するか）。計算リマインド・確定リマインド共通（07_NOTIFICATION_SCHEDULER_SPEC セクション2-1参照） |

**端数処理の計算方法**:

```
round(value) = roundingMethod(value / roundingPrecision) * roundingPrecision
```

例:
- `roundingMethod = "floor"`, `roundingPrecision = 1`: Math.floor(12345.6 / 1) × 1 = **12345**
- `roundingMethod = "round"`, `roundingPrecision = 1`: Math.round(12345.6 / 1) × 1 = **12346**
- `roundingMethod = "floor"`, `roundingPrecision = 10`: Math.floor(12345 / 10) × 10 = **12340**
- `roundingMethod = "ceil"`, `roundingPrecision = 100`: Math.ceil(12345 / 100) × 100 = **12400**

01_CALC_SPEC セクション10の金額計算式にて、各項目（basePay, lateNightPremiumPay 等）ごとにこの `round()` を適用する。

### 5. paymentPeriodKey のフォーマットと決定ロジック

**フォーマット**: `{periodStart}_{periodEnd}`（例: `2026-03-26_2026-04-25`）

**決定ロジック**: attendance の `date` フィールド（勤務開始基準日）を基準に、`payroll.startDay / endDay` で定まる期間に当てはめる。

```
attendance.date が payroll 期間 [startDay, endDay] に含まれる
→ その期間の paymentPeriodKey を付与
```

日跨ぎ勤務（例: 23:00出勤 → 翌07:00退勤）の場合、`date` は出勤日（clockIn の日付）が設定されている既存挙動に従う。

**既存データとの混在**: phase4_2 は支払日キー（`2025-03-25`）をフォーマットとして使用していた。移行は行わず、新規分のみ新フォーマット（`_` 区切り）を適用する。フォーマットが明確に異なるため、コード上での区別は容易。

### 6. weekStartDate の決定ロジック

attendance の `date` と `weekStartDay` から算出する。

```
weekStartDate = date から直近の過去方向にある weekStartDay の曜日の日付
               （date 自体が weekStartDay と同じ曜日なら date そのもの）
```

例: weekStartDay=0（日曜）、date=2026-03-18（水曜）→ weekStartDate=2026-03-15（日曜）

### 7. 計算可能期間の導出

計算対象期間と paymentDate から導出する（phase4_2 から継承）。

```
給与期間: startDay 〜 endDay → periodStart 〜 periodEnd
計算可能期間: periodEnd の翌日 〜 paymentDate の前日
```

例: 給与期間 2/26〜3/25、paymentDate 4/25 → 計算可能期間 3/26〜4/24

### 8. payroll run 開始時の snapshot

計算実行時に以下を snapshot として payrollRuns ドキュメントに固定する。設定変更の遡及影響を防ぎ、計算の再現性を保証する。

**run レベルの snapshot**:

| snapshot フィールド | 元の設定 | 型 |
|-------------------|---------|-----|
| paymentPeriodKey | 算出値 | string |
| paymentPeriodStart | 算出値 | string (YYYY-MM-DD) |
| paymentPeriodEnd | 算出値 | string (YYYY-MM-DD) |
| weekStartDaySnapshot | payrollConfig.weekStartDay | number |
| weeklyLegalLimitMinutesSnapshot | payrollConfig.weeklyLegalLimitMinutes | number |
| legalHolidayWeekdaySnapshot | payrollConfig.legalHolidayWeekday | number \| null |
| nightPremiumRateSnapshot | payrollConfig.nightPremiumRate | number |
| overtimePremiumRateSnapshot | payrollConfig.overtimePremiumRate | number |
| over60PremiumRateSnapshot | payrollConfig.over60PremiumRate | number |
| legalHolidayPremiumRateSnapshot | payrollConfig.legalHolidayPremiumRate | number |
| roundingMethodSnapshot | payrollConfig.roundingMethod | string |
| roundingPrecisionSnapshot | payrollConfig.roundingPrecision | number |
| calcVersion | payrollConfig.calcVersion | string |

**staff レベルの snapshot**（staffResults/{staffId} に保存）:

| snapshot フィールド | 元のデータ | 型 |
|-------------------|-----------|-----|
| baseHourlyWageSnapshot | staffs.hourlyWage | number |
| staffNameSnapshot | staffs.fullName | string |

**snapshot の原則**: 給与計算で使用するすべての外部設定値・参照値は、run 実行時に snapshot として固定する。計算後に元の設定や staff 情報が変更されても、snapshot された値が計算結果の根拠として保持される。

### 9. payrollConfig の管理方針

**初期リリース**: Firestore コンソールからの直接編集で運用する。新規 Firebase プロジェクト初期化時にデフォルト値が入った payrollConfig ドキュメントを作成する。

**将来**: 管理画面（Flutter アプリ内の管理者メニュー）から設定変更できる UI を検討する。特に割増率・法定休日の設定は事業場オーナーが変更する可能性があるため、中期的には UI 化が望ましい。ただし、`storeMeta/config` の `payroll.startDay / endDay` は給与期間の SSOT であり、変更すると既存 attendance の帰属期間との整合性が崩れるため、**管理 UI では読み取り専用表示**とし、変更は Firestore コンソールからのみとする。

**設定変更時の挙動**: 計算関連の設定（割増率、端数処理等）は次回の給与計算 run 実行時に snapshot を通じて反映される。過去に confirmed 済みの run は旧設定の snapshot を保持しているため、遡及影響はない。通知・スケジューラー関連の設定（schedulerNotificationHour, reminderStartDaysAfterPeriodEnd）は snapshot 対象外であり、変更は次回のスケジューラー実行から即座に反映される。

---

## 確定済み事項一覧（元・未確定事項）

| # | 項目 | 決定内容 | 決定日 |
|---|------|---------|--------|
| 1 | weekStartDay のデフォルト値 | 0（日曜）。storeMeta/payrollConfig で店舗ごとに変更可能 | 2026-03-21 |
| 2 | weeklyLegalLimitMinutes のデフォルト値 | 2400（40時間）。特例措置対象事業場は 2640 に変更可能。storeMeta/payrollConfig で店舗ごとに変更可能 | 2026-03-21 |
| 3 | legalHolidayWeekday のデフォルト値 | null（法定休日判定なし）。法定休日を設けたい店舗は曜日番号（0〜6）を設定する。storeMeta/payrollConfig で店舗ごとに変更可能 | 2026-03-21 |
| 4 | expectedRange の詳細 | 初期リリースでは null（チェックなし）。運用開始後に実績ベースで設定する | 2026-03-21 |
| 5 | payrollConfig の更新 UI | 初期リリースでは Firestore 直接編集で運用。将来的に管理画面を検討 | 2026-03-21 |
| 6 | 端数処理ルールの設定化 | storeMeta/payrollConfig で設定可能とする。roundingMethod（方式）と roundingPrecision（適用単位）を提供（01_CALC_SPEC で確定済み） | 2026-03-21 |
| 7 | 時給変更日の扱い方式 | 給与計算 run 実行時点の staffs.hourlyWage を snapshot し統一適用する。期間途中の変更は次回 run から反映（01_CALC_SPEC で確定済み） | 2026-03-21 |
| 8 | 通知・スケジューラー設定 | schedulerNotificationHour（デフォルト10、JST）と reminderStartDaysAfterPeriodEnd（デフォルト3）を payrollConfig に追加。snapshot 対象外（計算結果に影響しない運用設定）。07_NOTIFICATION_SCHEDULER_SPEC で確定済み | 2026-03-21 |

---

## 懸念事項一覧（解消済み）

| # | 項目 | 説明 | 解消方針 |
|---|------|------|---------|
| 1 | paymentPeriodKey フォーマット変更 | phase4_2 は支払日キー（`2025-03-25`）、本設計は期間レンジ（`2026-03-26_2026-04-25`）| 移行は行わず新規分のみ新フォーマットを適用。フォーマットが明確に異なる（`_` 区切りの有無）ため混同リスクは低い |
| 2 | 設定変更時の遡及影響 | payrollConfig を途中で変更した場合、過去の計算結果との整合性 | snapshot で保護されるため遡及影響なし。変更は次回 run から反映される。過去の confirmed 済み run は旧設定の snapshot を保持 |
