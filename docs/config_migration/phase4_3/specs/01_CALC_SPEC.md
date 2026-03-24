# 01: 計算仕様

**ステータス**: 最終確定
**最終更新**: 2026-03-21
**前提**: 変形労働時間制を採用しない。法定労働時間は 1日8時間・1週40時間（特例措置対象事業場では1週44時間）。

---

## 仕様概要

給与計算のコアアルゴリズムを定義する。残業（法定時間外労働）、深夜労働、法定休日労働、月60時間超の各計算ロジックと金額算出式を含む。各割増率および法定休日の曜日は `storeMeta/payrollConfig` で店舗ごとに設定可能であり、法定休日の設定が未設定（null）であっても給与計算は正常に動作する。

---

## 仕様詳細

### 1. 用語定義

| 用語 | 定義 |
|------|------|
| actualWorkMinutes | 休憩を除いた実労働時間（分）。attendance の既存フィールド |
| nightWorkMinutes | 深夜時間帯の実労働時間（分）。休憩控除後の値。深夜帯は storeMeta/config の nightWorkStartHour〜nightWorkEndHour で定義 |
| dailyLegalLimit | 1日の法定労働時間上限 = 480分（8時間） |
| weeklyLegalLimit | 1週の法定労働時間上限。通常 2400分（40時間）、特例措置 2640分（44時間）。storeMeta/payrollConfig で設定 |
| legalHolidayWeekday | 法定休日の曜日（0=日曜〜6=土曜）。null の場合は法定休日判定を行わない。storeMeta/payrollConfig で設定 |
| 法定外休日 | 法定休日以外の会社指定休日。法律上の割増義務なし |
| 法定時間外労働 | 1日8時間超 または 1週40時間超の労働。法定休日労働は含まない |
| weekStartDate | その attendance が属する法定週の開始日（YYYY-MM-DD） |
| payrollStatus | attendance の給与反映状態。`unreflected`（未反映）/ `reflected`（反映済み）/ `corrected_after_reflection`（反映後修正） |

### 2. 計算の全体フロー

**実行方式**: 各 staff の計算は Cloud Tasks により独立したタスクとして実行される（DISTRIBUTED_EXECUTION_DESIGN.md 参照）。以下のアルゴリズムは processStaffPayroll 内で 1 staff 分に対して適用される。アルゴリズム自体は分散実行の影響を受けない。

```
1. 対象 attendance を抽出する
   - paymentPeriodKey が今回の計算対象期間に一致
   - payrollStatus が unreflected または corrected_after_reflection
2. staffId ごとにグループ化する
3. 各 staff について:
   a. weekStartDate ごとに attendance をグループ化する
   b. 各週について、月跨ぎ参照用の attendance も含めて取得する（セクション7参照）
   c. 各週内で安定ソートする（clockIn ASC → createdAt ASC → docId ASC）
   d. 各 attendance を順に処理する
      - 法定休日判定（セクション3）→ 法定休日処理（セクション4） or 通常処理（セクション5）
      - weeklyRegularRunning は全 attendance で更新する
      - 集計値への加算は計上対象の attendance のみ
   e. 月60時間超を算出する（セクション8）
   f. 金額を算出する（セクション10）
```

**計上対象の判定条件**:

```
isTarget(attendance) =
    attendance.paymentPeriodKey == currentPeriodKey
    AND attendance.payrollStatus in [unreflected, corrected_after_reflection]
```

### 3. 法定休日の判定

`legalHolidayWeekday`（storeMeta/payrollConfig の snapshot）に基づいて判定する。

```
function isLegalHoliday(attendance, legalHolidayWeekday):
    if legalHolidayWeekday == null:
        return false
    return attendance.weekday == legalHolidayWeekday
```

| 入力 | 型 | 説明 |
|------|-----|------|
| attendance.weekday | number | 勤務日の曜日（0=日曜〜6=土曜、JavaScript getDay() 準拠） |
| legalHolidayWeekday | number \| null | 法定休日の曜日。payrollConfig snapshot から取得 |

| 戻り値 | 意味 |
|--------|------|
| true | 法定休日として処理（セクション4） |
| false | 通常 attendance として処理（セクション5） |

**legalHolidayWeekday = null の場合**: 法定休日判定が常に false を返すため、すべての attendance が通常処理（セクション5）を通る。`totalLegalHolidayWorkMinutes` は 0 のまま、`legalHolidayPremiumPay` も 0 となる。給与計算は法定休日を考慮せずに正常に動作する。

### 4. 法定休日の attendance

法定休日と判定された attendance は、残業計算から**完全に除外**する。

```
if (isLegalHoliday(attendance, legalHolidayWeekday)):
    dailyOverMinutes        = 0
    dailyRegularMinutes     = 0
    weeklyOnlyOverMinutes   = 0
    legalOvertimeMinutes    = 0

    // weeklyRegularRunning に加算しない

    // 計上対象のみ集計に加算
    if isTarget(attendance):
        totalActualWorkMinutes       += actualWorkMinutes
        totalLegalHolidayWorkMinutes += actualWorkMinutes
        totalNightWorkMinutes        += nightWorkMinutes

    isLegalHoliday = true
    → 次の attendance へ
```

根拠（労基法）:
- 法定休日労働には1日8時間超の概念が適用されない
- 法定休日労働は週40時間の累計に含めない
- 法定休日労働は月60時間超の算定基礎に含めない

### 5. 通常の attendance（コアアルゴリズム）

週ごとに `weeklyRegularRunning = 0` で初期化する。

```
// ── 日の法定時間外 ──
dailyOverMinutes    = max(actualWorkMinutes - dailyLegalLimit, 0)
dailyRegularMinutes = actualWorkMinutes - dailyOverMinutes

// ── 週の法定時間外（法定内累計のみで判定） ──
weeklyRegularBefore = weeklyRegularRunning
weeklyRegularAfter  = weeklyRegularRunning + dailyRegularMinutes

weeklyOnlyOverMinutes =
    max(weeklyRegularAfter  - weeklyLegalLimit, 0)
  - max(weeklyRegularBefore - weeklyLegalLimit, 0)

// ── 当該 attendance の法定時間外 ──
legalOvertimeMinutes = dailyOverMinutes + weeklyOnlyOverMinutes

// ── 状態更新（全 attendance で実行） ──
weeklyRegularRunning = weeklyRegularAfter

// ── 計上対象のみ集計に加算 ──
if isTarget(attendance):
    totalActualWorkMinutes    += actualWorkMinutes
    totalNightWorkMinutes     += nightWorkMinutes
    totalLegalOvertimeMinutes += legalOvertimeMinutes
```

### 6. 法定外休日の attendance

通常の attendance と**同じ計算ルール**（セクション5）を適用する（8h超・40h超の判定対象）。`isNonLegalHoliday` を記録し、計上対象であれば `totalNonLegalHolidayWorkMinutes` に加算する（情報管理用）。

**初期リリースでの判定**【確定】: `isNonLegalHoliday` は**常に `false`** とする。法定外休日を判定するためのカレンダー機構や設定は初期リリースでは提供しない。フィールド自体は将来拡張用に維持し、attendanceItems に `false` として記録する。`totalNonLegalHolidayWorkMinutes` は初期リリースでは常に 0 となる。

**割増賃金**【確定】: 法定外休日に対する独自の割増賃金は設けない。法定外休日労働は通常の残業判定（日8h超・週40h超）のみが適用される。`totalNonLegalHolidayWorkMinutes` は情報管理・将来拡張用に集計する。

**将来の拡張**:
1. **法定外休日の判定**: `storeMeta/payrollConfig` に `nonLegalHolidayWeekdays: number[]`（法定外休日の曜日リスト。例: `[6]` で土曜を法定外休日とする）を追加し、`isNonLegalHoliday` を動的に判定する。
2. **独自の割増率**: `storeMeta/payrollConfig` に `nonLegalHolidayPremiumRate`（number, 0〜1。例: 0.25 で 25%割増）を追加し、金額計算式に `nonLegalHolidayPremiumPay = round(totalNonLegalHolidayWorkMinutes / 60 * baseHourlyWage * nonLegalHolidayPremiumRate)` を追加する。`totalNonLegalHolidayWorkMinutes` は既に集計しているため、設定追加と金額計算への1項目追加で対応可能。storeMeta は店舗ごとに独立しているため、店舗別の設定にも対応できる。

### 7. 月跨ぎ週の処理ルール

- 計上対象 attendance が属する weekStartDate を収集し、その週全体の attendance を staff 単位で参照する
- 他の paymentPeriodKey に属する attendance は weeklyRegularRunning の算出にのみ使用し、集計値・金額には含めない
- 週内の全 attendance を同一アルゴリズムで処理するが、集計値への加算は計上対象のみ

```
for each attendance in week (sorted):
    // セクション4 or セクション5 の計算を実行
    // （weeklyRegularRunning は全 attendance で更新する）

    if isTarget(attendance):
        // 計上対象 → 集計値に加算
    else:
        // 参照専用 → weeklyRegularRunning の更新のみ
```

### 8. 月60時間超の計算

staff ごとに、今回計上対象分の `legalOvertimeMinutes` を時系列順で累積する。法定休日労働は含めない。

```
cumulativeOvertime = 0
over60OvertimeMinutes = 0

for each attendance in chronological order (今回計上対象のみ):
    if attendance.isLegalHoliday: continue

    cumulativeOvertime += attendance.legalOvertimeMinutes

    if cumulativeOvertime > 3600:
        over60Contribution = min(
            attendance.legalOvertimeMinutes,
            cumulativeOvertime - 3600
        )
        over60OvertimeMinutes += over60Contribution
```

### 9. 深夜労働

給与計算には `nightWorkMinutes`（休憩控除後）を使用する。法定休日の attendance であっても `totalNightWorkMinutes` に加算する。

**nightMinutes と nightWorkMinutes の定義**:

| フィールド | 定義 | 休憩控除 |
|-----------|------|---------|
| nightMinutes | clockIn〜clockOut の間で深夜帯に該当する拘束分数 | なし |
| nightWorkMinutes | 深夜帯の実労働分数（nightMinutes から深夜帯と重複する休憩時間を控除） | **あり** |

**前提条件**: 本計算仕様は `nightWorkMinutes` が休憩控除済みの正しい値であることを前提とする。現在のコードベースでは `recalculateAttendanceFromBreaks` 内の `nightWorkMinutes` 算出に休憩控除が入っていないため、実装ステップで修正が必要（後述の実装時修正事項を参照）。

### 10. 金額計算式

各割増率は `storeMeta/payrollConfig` で店舗ごとに設定可能。設定フィールドの詳細は 02_CONFIG_SPEC を参照。

**割増率の設定値**:

| 設定キー | 説明 | 法定デフォルト値 |
|----------|------|----------------|
| nightPremiumRate | 深夜割増率 | 0.25 |
| overtimePremiumRate | 法定時間外割増率（60h以内） | 0.25 |
| over60PremiumRate | 月60時間超追加割増率 | 0.25 |
| legalHolidayPremiumRate | 法定休日割増率 | 0.35 |

```
basePay              = round(totalActualWorkMinutes        / 60 * baseHourlyWage)
lateNightPremiumPay  = round(totalNightWorkMinutes         / 60 * baseHourlyWage * nightPremiumRate)
overtimePremiumPay   = round(totalLegalOvertimeMinutes     / 60 * baseHourlyWage * overtimePremiumRate)
over60PremiumPay     = round(over60OvertimeMinutes          / 60 * baseHourlyWage * over60PremiumRate)
legalHolidayPremiumPay = round(totalLegalHolidayWorkMinutes / 60 * baseHourlyWage * legalHolidayPremiumRate)

grossPay = basePay + lateNightPremiumPay + overtimePremiumPay
         + over60PremiumPay + legalHolidayPremiumPay
```

`basePay` は全労働時間（法定休日含む）に対して 1.0倍。各 premiumPay は割増率分のみを加算する。

**端数処理**【確定】: 各項目ごとに `round()` を適用する。`round()` の方式（切上げ / 切捨て / 四捨五入）と適用桁（1の位 / 10の位等）は `storeMeta/payrollConfig` で設定可能とする。設定フィールドの詳細は 02_CONFIG_SPEC を参照。

**時給の適用ルール**【確定】: 給与計算を実行したタイミングでの `staffs.hourlyWage` を `baseHourlyWageSnapshot` として取得し、同一 run 内のその staff の全 attendance に同一時給を適用する。期間途中で時給が変更されていた場合でも、run 実行時点の時給で統一される。

**倍率テーブル（デフォルト設定値の場合）**:

| 区分 | 内訳 | 合計倍率 |
|------|------|---------|
| 通常労働 | basePay(1.0) | 1.00 |
| 法定時間外（60h以内） | basePay(1.0) + overtimePremiumRate(0.25) | 1.25 |
| 法定時間外（60h超） | basePay(1.0) + overtimePremiumRate(0.25) + over60PremiumRate(0.25) | 1.50 |
| 深夜 | basePay(1.0) + nightPremiumRate(0.25) | 1.25 |
| 法定休日 | basePay(1.0) + legalHolidayPremiumRate(0.35) | 1.35 |
| 深夜 + 法定時間外（60h以内） | basePay(1.0) + nightPremiumRate(0.25) + overtimePremiumRate(0.25) | 1.50 |
| 深夜 + 法定時間外（60h超） | basePay(1.0) + nightPremiumRate(0.25) + overtimePremiumRate(0.25) + over60PremiumRate(0.25) | 1.75 |
| 深夜 + 法定休日 | basePay(1.0) + nightPremiumRate(0.25) + legalHolidayPremiumRate(0.35) | 1.60 |

**legalHolidayWeekday = null の場合**: 法定休日に該当する attendance が存在しないため、`totalLegalHolidayWorkMinutes = 0` となり `legalHolidayPremiumPay = 0`。`legalHolidayPremiumRate` の設定値は無視される。

### 11. 重複計上の防止ルール

| ルール | 対象 |
|--------|------|
| 法定休日労働は法定時間外に含めない | legalOvertimeMinutes の算定から除外 |
| 法定休日労働は月60時間超に含めない | over60OvertimeMinutes の算定から除外 |
| 日超過と週超過は二重計上しない | 法定内累計（weeklyRegularRunning）で判定 |
| 深夜は他の割増と独立して加算 | 全 attendance の nightWorkMinutes を一律加算 |

### 12. staff 単位の集計値

| フィールド | 説明 |
|-----------|------|
| totalActualWorkMinutes | 全実労働時間（法定休日含む） |
| totalNightWorkMinutes | 深夜実労働時間（法定休日含む） |
| totalLegalOvertimeMinutes | 法定時間外労働時間（法定休日除く） |
| over60OvertimeMinutes | 月60時間超部分（法定休日除く） |
| totalLegalHolidayWorkMinutes | 法定休日労働時間（legalHolidayWeekday = null なら常に 0） |
| totalNonLegalHolidayWorkMinutes | 法定外休日労働時間（情報管理用） |
| basePay / lateNightPremiumPay / overtimePremiumPay / over60PremiumPay / legalHolidayPremiumPay / grossPay | 各金額 |

**totalActualWorkMinutes の内訳**:

```
totalActualWorkMinutes
  = Σ(通常 attendance の actualWorkMinutes)
  + Σ(法定外休日 attendance の actualWorkMinutes)
  + totalLegalHolidayWorkMinutes
```

全区分の actualWorkMinutes を合算するため、`basePay` の計算基礎として法定休日労働分も含まれる。

### 13. attendance 明細（attendanceItems）の記録フィールド

各 attendance の計算過程を監査目的で記録する。給与計算実行時に、staffResults/{staffId}/attendanceItems/{attendanceId} に保存する。

| フィールド | 型 | 説明 |
|-----------|-----|------|
| attendanceId | string | 元の attendance ドキュメント ID |
| attendanceRefPath | string | 元の attendance のフルパス（例: `attendances/abc123`） |
| workDate | string | 勤務日（YYYY-MM-DD） |
| weekday | number | 曜日（0=日曜〜6=土曜。JavaScript getDay() 準拠） |
| weekStartDate | string | 法定週開始日（YYYY-MM-DD） |
| paymentPeriodKey | string | この attendance が本来帰属する給与期間 |
| isCarryOver | boolean | キャリーオーバー（過去未反映の救済計上）か。詳細は 03_DATA_MODEL_SPEC セクション5参照 |
| originalPaymentPeriodKey | string? | キャリーオーバー元の給与期間（isCarryOver=true の場合のみ） |
| includedInCurrentRun | boolean | 今回の run で計上対象としたか |
| actualWorkMinutes | number | 実労働時間 |
| nightWorkMinutes | number | 深夜実労働時間 |
| isLegalHoliday | boolean | 法定休日判定結果 |
| isNonLegalHoliday | boolean | 法定外休日判定結果 |
| dailyOverMinutes | number | 1日8時間超分（法定休日なら 0） |
| dailyRegularMinutes | number | 法定内労働分（法定休日なら 0） |
| weeklyRegularBefore | number | 当日前までの週内法定内累計 |
| weeklyRegularAfter | number | 当日後の週内法定内累計 |
| weeklyOnlyOverMinutes | number | 純粋な週超過寄与分 |
| legalOvertimeMinutes | number | 当該 attendance の法定時間外 |

**キャリーオーバー attendance の計算**: `isCarryOver = true` の attendance は、`originalPaymentPeriodKey` の期間のデータを参照して残業計算を行う。当月の週累計（weeklyRegularRunning）には含めない。詳細は 03_DATA_MODEL_SPEC セクション5参照。

### 13-1. キャリーオーバー計算アルゴリズム

processStaffPayroll 内でキャリーオーバー attendance（`paymentPeriodKey != currentPeriodKey`）を処理する際の具体的なアルゴリズム。通常 attendance（セクション2〜10）とは**別のコンテキスト**で計算を行う。

```
【キャリーオーバー attendance の処理】
対象: assignedCarryOverAttendanceIds に含まれる attendance

1. originalPaymentPeriodKey ごとにキャリーオーバー attendance をグループ化する

2. 各 originalPaymentPeriodKey について:
   a. 元の帰属期間の全 attendance を参照用に取得する
      - staffId が一致し、paymentPeriodKey == originalPaymentPeriodKey の attendance
      - 既に reflected のものも含む（weeklyRegularRunning の算出に必要）
   b. weekStartDate ごとにグループ化する
   c. 各週について、元の期間の全 attendance を含めて
      セクション3〜5 のアルゴリズムを適用する
      - weeklyRegularRunning は元の期間の attendance で構築
      - 法定休日判定（セクション3）→ 法定休日処理（セクション4）or 通常処理（セクション5）
   d. キャリーオーバー対象の attendance のみ集計値に加算
      - isTarget は使用しない（currentPeriodKey と一致しないため）
      - 代わりに「assignedCarryOverAttendanceIds に含まれるか」で計上対象を判定

3. 月60時間超の計算（セクション8）:
   - キャリーオーバー attendance の legalOvertimeMinutes は
     元の期間のコンテキストで算出されたものを使用
   - 当月の通常 attendance の月60時間超とは独立に計算する
     （キャリーオーバー分のみで 60h 超判定。元期間の累計に追加して判定）

4. 金額算出（セクション10）:
   - 当月の run に保存された config snapshot（割増率、端数処理等）を使用する
     （元の期間の snapshot ではない。支給は当月であるため）
   - baseHourlyWageSnapshot も当月 run 時点の時給を適用

5. 結果は当月の staffResults に合算:
   - grossPay にキャリーオーバー分を含む
   - carryOverGrossPay にキャリーオーバー分の金額を分離記録
   - carryOverAttendanceCount にキャリーオーバー件数を記録
```

**当月の通常計算への影響**: キャリーオーバー attendance は当月の weeklyRegularRunning に含めない。通常 attendance とキャリーオーバー attendance は独立して計算し、最終的な staffResults で合算する。

**config の適用**: 割増率・端数処理は**当月の run の snapshot** を使用する。元の期間の設定ではなく、「今回支給する」時点の設定で金額を算出する。これはキャリーオーバーが「過去分を例外として当月に支給する」仕組みであるため。

### 14. 適用範囲と限界

**適用範囲**: 通常の固定労働時間制、特例措置対象事業場

**未対応**: 変形労働時間制、裁量労働制、みなし労働時間制、管理監督者、年少者

---

## 検証テーブル

### 検証1: 月〜金 各9時間（週45時間）

法定時間外の正解: 300分（日超過 5×60 = 300、週超過 45-40 = 5h、重複 = 完全一致 → 純粋週超過 = 0）

| 日 | 実労働 | 日超過 | 法定内 | 法定内累計前 | 法定内累計後 | 純粋週超過 | 法定時間外 |
|----|--------|--------|--------|-------------|-------------|-----------|-----------|
| 月 | 540 | 60 | 480 | 0 | 480 | 0 | 60 |
| 火 | 540 | 60 | 480 | 480 | 960 | 0 | 60 |
| 水 | 540 | 60 | 480 | 960 | 1440 | 0 | 60 |
| 木 | 540 | 60 | 480 | 1440 | 1920 | 0 | 60 |
| 金 | 540 | 60 | 480 | 1920 | 2400 | 0 | 60 |
| **合計** | 2700 | 300 | | | | 0 | **300** ✓ |

### 検証2: 月〜金 各7時間 + 土10時間（週45時間）

法定時間外の正解: 300分（日超過 = 土のみ 120、週超過 = 300、重複 = 120 → 純粋週超過 = 180）

| 日 | 実労働 | 日超過 | 法定内 | 法定内累計前 | 法定内累計後 | 純粋週超過 | 法定時間外 |
|----|--------|--------|--------|-------------|-------------|-----------|-----------|
| 月 | 420 | 0 | 420 | 0 | 420 | 0 | 0 |
| 火 | 420 | 0 | 420 | 420 | 840 | 0 | 0 |
| 水 | 420 | 0 | 420 | 840 | 1260 | 0 | 0 |
| 木 | 420 | 0 | 420 | 1260 | 1680 | 0 | 0 |
| 金 | 420 | 0 | 420 | 1680 | 2100 | 0 | 0 |
| 土 | 600 | 120 | 480 | 2100 | 2580 | 180 | 300 |
| **合計** | 2700 | 120 | | | | 180 | **300** ✓ |

### 検証3: 月10時間 + 火〜金8時間 + 土6時間（週48時間）

法定時間外の正解: 480分（日超過 = 月120、週超過 = 480、重複 = 120 → 純粋週超過 = 360）

| 日 | 実労働 | 日超過 | 法定内 | 法定内累計前 | 法定内累計後 | 純粋週超過 | 法定時間外 |
|----|--------|--------|--------|-------------|-------------|-----------|-----------|
| 月 | 600 | 120 | 480 | 0 | 480 | 0 | 120 |
| 火 | 480 | 0 | 480 | 480 | 960 | 0 | 0 |
| 水 | 480 | 0 | 480 | 960 | 1440 | 0 | 0 |
| 木 | 480 | 0 | 480 | 1440 | 1920 | 0 | 0 |
| 金 | 480 | 0 | 480 | 1920 | 2400 | 0 | 0 |
| 土 | 360 | 0 | 360 | 2400 | 2760 | 360 | 360 |
| **合計** | 2880 | 120 | | | | 360 | **480** ✓ |

### 検証4: 月〜土 各7時間（週42時間）

法定時間外の正解: 120分（日超過 = 0、週超過 = 120、純粋週超過 = 120）

| 日 | 実労働 | 日超過 | 法定内 | 法定内累計前 | 法定内累計後 | 純粋週超過 | 法定時間外 |
|----|--------|--------|--------|-------------|-------------|-----------|-----------|
| 月 | 420 | 0 | 420 | 0 | 420 | 0 | 0 |
| 火 | 420 | 0 | 420 | 420 | 840 | 0 | 0 |
| 水 | 420 | 0 | 420 | 840 | 1260 | 0 | 0 |
| 木 | 420 | 0 | 420 | 1260 | 1680 | 0 | 0 |
| 金 | 420 | 0 | 420 | 1680 | 2100 | 0 | 0 |
| 土 | 420 | 0 | 420 | 2100 | 2520 | 120 | 120 |
| **合計** | 2520 | 0 | | | | 120 | **120** ✓ |

### 検証5: 法定休日を含むケース

月〜金 各8時間 + 日（法定休日）10時間 = 50時間。法定時間外の正解: 0分、法定休日労働: 600分。

| 日 | 法定休日 | 実労働 | 日超過 | 法定内 | 法定内累計前 | 法定内累計後 | 純粋週超過 | 法定時間外 | 休日加算 |
|----|---------|--------|--------|--------|-------------|-------------|-----------|-----------|---------|
| 日 | **○** | 600 | - | - | - | - | - | **0** | **600** |
| 月 | | 480 | 0 | 480 | 0 | 480 | 0 | 0 | |
| 火 | | 480 | 0 | 480 | 480 | 960 | 0 | 0 | |
| 水 | | 480 | 0 | 480 | 960 | 1440 | 0 | 0 | |
| 木 | | 480 | 0 | 480 | 1440 | 1920 | 0 | 0 | |
| 金 | | 480 | 0 | 480 | 1920 | 2400 | 0 | 0 | |
| **合計** | | 3000 | 0 | | | | 0 | **0** ✓ | **600** ✓ |

法定休日の attendance は weeklyRegularRunning に加算されないため、月〜金の累計は 2400 で収まり、週超過は発生しない。

### 検証6: 月跨ぎ週

給与期間: 3/1〜3/31、法定週: 3/29(月)〜4/4(日)。3/29〜3/31 が計上対象、4/1〜4/2 は参照専用。

| 日 | 帰属 | 実労働 | 日超過 | 法定内 | 法定内累計前 | 法定内累計後 | 純粋週超過 | 法定時間外 | 今回計上 |
|----|------|--------|--------|--------|-------------|-------------|-----------|-----------|---------|
| 3/29 | 3月 | 480 | 0 | 480 | 0 | 480 | 0 | 0 | ○ |
| 3/30 | 3月 | 480 | 0 | 480 | 480 | 960 | 0 | 0 | ○ |
| 3/31 | 3月 | 540 | 60 | 480 | 960 | 1440 | 0 | 60 | ○ |
| 4/1 | 4月 | 480 | 0 | 480 | 1440 | 1920 | 0 | 0 | × |
| 4/2 | 4月 | 480 | 0 | 480 | 1920 | 2400 | 0 | 0 | × |

3月給与: legalOvertimeMinutes = 60分。4月給与: 0分。合計60分 ✓

---

## 確定済み事項一覧（元・未確定事項）

| # | 項目 | 決定内容 | 決定日 |
|---|------|---------|--------|
| 1 | 端数処理ルール | 各金額項目ごとに端数処理を適用する。方式（切上げ/切捨て/四捨五入）と適用桁（1の位/10の位等）は `storeMeta/payrollConfig` で店舗ごとに設定可能とする | 2026-03-21 |
| 2 | 時給変更日の扱い | 給与計算 run 実行時点の `staffs.hourlyWage` を snapshot し、同一 run 内の全 attendance に同一時給を適用する。期間途中の変更は次回 run から反映される | 2026-03-21 |
| 3 | 法定外休日の独自割増 | 割増なしで確定。将来の拡張は `storeMeta/payrollConfig` に `nonLegalHolidayPremiumRate` を追加することで対応可能（拡張方法はセクション6に記載済み） | 2026-03-21 |
| 4 | 割増率の設定化 | nightPremiumRate / overtimePremiumRate / over60PremiumRate / legalHolidayPremiumRate を `storeMeta/payrollConfig` で店舗ごとに設定可能とする | 2026-03-21 |
| 5 | 法定休日の判定 | `legalHolidayWeekday`（曜日 number \| null）で設定。null の場合は法定休日判定を行わず、全 attendance が通常処理される。給与計算は法定休日未設定でも正常動作する | 2026-03-21 |
| 6 | 計算結果チェック（anomalyFlags） | `generateAnomalyFlags` 関数を finalizePayrollRun から必ず呼び出す構造とするが、初期リリースでは実質的なチェックは行わない（常に空のフラグを返す）。関数内にコメントでチェック内容は運用開始後に追加する旨を記載。チェックロジックの追加はコード変更のみで対応可能な構造とする | 2026-03-21 |

---

## 実装時修正事項

| # | 項目 | 説明 | 修正箇所 |
|---|------|------|---------|
| 1 | nightWorkMinutes の休憩控除 | 現在のコードベースでは `nightMinutes` と `nightWorkMinutes` が同一値（どちらも休憩未控除）。本計算仕様は `nightWorkMinutes` が休憩控除済みであることを前提とするため、退勤時の再計算処理で修正が必要 | `recalculateAttendanceFromBreaks` 内で、breaks サブコレクションの各 break の `startedAt`〜`endedAt` と深夜帯（nightWorkStartHour〜nightWorkEndHour）の重複分を算出し、`nightWorkMinutes = calculateNightWorkMinutes(clockIn, clockOut) - 深夜帯の休憩分` とする。`nightMinutes` は従来通り拘束ベース（休憩未控除）のまま維持 |
