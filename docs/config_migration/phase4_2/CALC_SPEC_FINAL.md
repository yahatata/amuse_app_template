# 給与計算仕様（確定版）

**作成日**: 2026-03-21
**ステータス**: 確定（OVERTIME_PROPOSAL_REVIEW.md の A-1, A-2 を反映済み）
**前提**: 変形労働時間制を採用しない。法定労働時間は 1日8時間・1週40時間（特例措置対象事業場では1週44時間）。

---

## 1. 用語定義

| 用語 | 定義 |
|------|------|
| actualWorkMinutes | 休憩を除いた実労働時間（分）。attendance の既存フィールド |
| nightWorkMinutes | 深夜時間帯（22:00〜05:00）の実労働時間（分）。休憩控除後の値 |
| dailyLegalLimit | 1日の法定労働時間上限 = 480分（8時間） |
| weeklyLegalLimit | 1週の法定労働時間上限。通常 2400分（40時間）、特例措置 2640分（44時間） |
| 法定休日 | legalHolidayRule に基づいて判定される休日。週1日または4週4日以上 |
| 法定外休日 | 法定休日以外の会社指定休日。法律上の割増義務なし |
| 法定時間外労働 | 1日8時間超 または 1週40時間超の労働。法定休日労働は含まない |
| weekStartDate | その attendance が属する法定週の開始日（YYYY-MM-DD） |

---

## 2. 計算の全体フロー

```
1. 対象 attendance を抽出する
2. staffId ごとにグループ化する
3. 各 staff について:
   a. weekStartDate ごとに attendance をグループ化する
   b. 各週内で安定ソートする
   c. 各 attendance を順に処理する
      - 法定休日判定 → 法定休日処理 or 通常処理
   d. 月60時間超を算出する
   e. 金額を算出する
```

---

## 3. ソート順（週内の処理順序を一意に固定する）

各 weekStartDate グループ内で、以下の順で安定ソートする。

```
1. clockIn ASC
2. createdAt ASC
3. docId ASC
```

---

## 4. 各 attendance の計算（コアアルゴリズム）

### 4-1. 前提: 週ごとに保持する状態変数

各 weekStartDate グループの処理開始時に以下を初期化する。

```
weeklyRegularRunning = 0    // 法定内労働の累計（分）
```

### 4-2. 法定休日の attendance

法定休日と判定された attendance は、残業計算から**完全に除外**する。

```
if (isLegalHoliday(attendance, legalHolidayRule)):
    // 残業計算を行わない
    dailyOverMinutes        = 0
    dailyRegularMinutes     = 0
    weeklyOnlyOverMinutes   = 0
    legalOvertimeMinutes    = 0

    // weeklyRegularRunning に加算しない

    // 法定休日集計に加算
    totalLegalHolidayWorkMinutes += actualWorkMinutes
    totalNightWorkMinutes        += nightWorkMinutes

    // attendanceItem に記録
    isLegalHoliday = true
    → 次の attendance へ
```

**根拠**（労基法）:
- 法定休日労働には1日8時間超の概念が適用されない
- 法定休日労働は週40時間の累計に含めない
- 法定休日労働は月60時間超の算定基礎に含めない

### 4-3. 通常の attendance（法定休日以外）

```
// ── 日の法定時間外 ──
dailyOverMinutes    = max(actualWorkMinutes - dailyLegalLimit, 0)
dailyRegularMinutes = actualWorkMinutes - dailyOverMinutes
                    // = min(actualWorkMinutes, dailyLegalLimit)

// ── 週の法定時間外（法定内累計のみで判定） ──
weeklyRegularBefore = weeklyRegularRunning
weeklyRegularAfter  = weeklyRegularRunning + dailyRegularMinutes

weeklyOnlyOverMinutes =
    max(weeklyRegularAfter  - weeklyLegalLimit, 0)
  - max(weeklyRegularBefore - weeklyLegalLimit, 0)

// ── 当該 attendance の法定時間外 ──
legalOvertimeMinutes = dailyOverMinutes + weeklyOnlyOverMinutes

// ── 状態更新 ──
weeklyRegularRunning = weeklyRegularAfter

// ── 集計に加算（今回計上対象の attendance のみ） ──
totalActualWorkMinutes    += actualWorkMinutes
totalNightWorkMinutes     += nightWorkMinutes
totalLegalOvertimeMinutes += legalOvertimeMinutes
```

### 4-4. 法定外休日の attendance

法定外休日は通常の attendance と**同じ計算ルール**を適用する。

- 1日8時間超は法定時間外として計上する
- 週40時間の累計に含める
- 月60時間超の算定基礎に含める

ただし、`isNonLegalHoliday = true` を記録し、`totalNonLegalHolidayWorkMinutes` に加算する（情報管理用）。

---

## 5. アルゴリズムの正当性検証

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

### 検証4: 月〜土 各7時間 = 週42時間（8時間超の日がない場合）

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

月〜金 各8時間 + 日（法定休日）10時間 = 50時間

法定時間外の正解: 0分（月〜金は8時間ちょうど、週40時間ちょうど。法定休日は除外）
法定休日労働: 600分

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

給与期間: 3/1〜3/31、法定週: 3/29(月)〜4/4(日)

3/29(月) 8h, 3/30(火) 8h, 3/31(水) 9h が計上対象。
4/1(木) 8h, 4/2(金) 8h は**参照専用**（4月の給与期間に帰属）。

週全体: 8+8+9+8+8 = 41時間

| 日 | 帰属 | 実労働 | 日超過 | 法定内 | 法定内累計前 | 法定内累計後 | 純粋週超過 | 法定時間外 | 今回計上 |
|----|------|--------|--------|--------|-------------|-------------|-----------|-----------|---------|
| 3/29 | 3月 | 480 | 0 | 480 | 0 | 480 | 0 | 0 | ○ |
| 3/30 | 3月 | 480 | 0 | 480 | 480 | 960 | 0 | 0 | ○ |
| 3/31 | 3月 | 540 | 60 | 480 | 960 | 1440 | 0 | 60 | ○ |
| 4/1 | 4月 | 480 | 0 | 480 | 1440 | 1920 | 0 | 0 | × |
| 4/2 | 4月 | 480 | 0 | 480 | 1920 | 2400 | 0 | 0 | × |

3月給与への計上: legalOvertimeMinutes = 60分（3/31 の日超過のみ）
4月給与への計上: 0分（4/1, 4/2 は各0）

4月の給与計算時にこの週を再処理する場合:
- 3/29〜3/31 の参照データから weeklyRegularRunning = 1440 の状態で 4/1 から開始
- 4/1, 4/2 はいずれも法定時間外 0

全体の整合性: 週の法定時間外 = max(2400 - 2400, 0) + 60 = 60分。3月に60分計上、4月に0分計上。合計60分。✓

---

## 6. 月60時間超の計算

### 6-1. 算定基礎

staff ごとに、**今回計上対象**分の `legalOvertimeMinutes` を attendance の時系列順で累積する。

**法定休日労働時間はここに含めない。**

### 6-2. 閾値

月60時間 = 3600分

### 6-3. 計算

```
cumulativeOvertime = 0
over60OvertimeMinutes = 0

for each attendance in chronological order (今回計上対象のみ):
    if attendance.isLegalHoliday:
        continue   // 法定休日は算定基礎に含めない

    cumulativeOvertime += attendance.legalOvertimeMinutes

    if cumulativeOvertime > 3600:
        // この attendance で3600を超えた場合
        over60Contribution = min(
            attendance.legalOvertimeMinutes,
            cumulativeOvertime - 3600
        )
        over60OvertimeMinutes += over60Contribution
```

### 6-4. 検証

月の法定時間外が 70時間（4200分）の場合:
- over60OvertimeMinutes = 4200 - 3600 = 600分
- overtimePremiumPay は 4200分全体に 0.25 を適用
- over60PremiumPay は 600分に追加の 0.25 を適用
- 60h以内の部分: 基本1.0 + 時間外0.25 = 1.25倍
- 60h超の部分: 基本1.0 + 時間外0.25 + 追加0.25 = 1.50倍

---

## 7. 深夜労働の計算

### 7-1. 使用フィールド

給与計算には `nightWorkMinutes` を使用する。

| フィールド | 用途 | 休憩控除 |
|-----------|------|---------|
| nightMinutes | 拘束時間帯での深夜分数（表示用） | なし |
| nightWorkMinutes | 実労働時間帯での深夜分数（給与計算用） | **あり** |

### 7-2. 休憩控除の必要性

現在のコードベースの `calculateNightWorkMinutes` は clockIn〜clockOut の間で分カウントしており、休憩時間が深夜帯に重なった場合に控除していない。

給与計算で正しい値を使うには、以下のいずれかの対応が必要:

- **案1**: `calculateNightWorkMinutes` に breaks 情報を渡し、深夜帯の休憩分を控除する
- **案2**: `recalculateAttendanceFromBreaks` の中で nightWorkMinutes を再計算する際に、break 時間帯と深夜帯の重複を控除する

### 7-3. 集計

法定休日の attendance であっても、`nightWorkMinutes` は `totalNightWorkMinutes` に加算する。深夜割増は休日割増と独立して適用される。

---

## 8. 金額計算式

### 8-1. 各項目の計算

```
basePay              = totalActualWorkMinutes        / 60 * baseHourlyWage
lateNightPremiumPay  = totalNightWorkMinutes         / 60 * baseHourlyWage * 0.25
overtimePremiumPay   = totalLegalOvertimeMinutes     / 60 * baseHourlyWage * 0.25
over60PremiumPay     = over60OvertimeMinutes          / 60 * baseHourlyWage * 0.25
legalHolidayPremiumPay = totalLegalHolidayWorkMinutes / 60 * baseHourlyWage * 0.35

grossPay = basePay
         + lateNightPremiumPay
         + overtimePremiumPay
         + over60PremiumPay
         + legalHolidayPremiumPay
```

### 8-2. 加算式モデルの根拠

`basePay` は**全労働時間**（法定休日含む）に対して 1.0倍 を支払う。各 premiumPay は割増率分のみを加算する。

| 区分 | 内訳 | 合計倍率 |
|------|------|---------|
| 通常労働 | basePay(1.0) | 1.00 |
| 法定時間外（60h以内） | basePay(1.0) + overtime(0.25) | 1.25 |
| 法定時間外（60h超） | basePay(1.0) + overtime(0.25) + over60(0.25) | 1.50 |
| 深夜 | basePay(1.0) + night(0.25) | 1.25 |
| 法定休日 | basePay(1.0) + holiday(0.35) | 1.35 |
| 深夜 + 法定時間外（60h以内） | basePay(1.0) + night(0.25) + overtime(0.25) | 1.50 |
| 深夜 + 法定時間外（60h超） | basePay(1.0) + night(0.25) + overtime(0.25) + over60(0.25) | 1.75 |
| 深夜 + 法定休日 | basePay(1.0) + night(0.25) + holiday(0.35) | 1.60 |

### 8-3. totalActualWorkMinutes に含まれるもの

`totalActualWorkMinutes` は **法定休日労働時間を含む全実労働時間** の合計。法定休日の attendance の actualWorkMinutes も basePay の計算基礎に含まれる。

```
totalActualWorkMinutes
  = Σ(通常 attendance の actualWorkMinutes)
  + Σ(法定外休日 attendance の actualWorkMinutes)
  + totalLegalHolidayWorkMinutes
```

### 8-4. 重複計上の防止

| ルール | 対象 |
|--------|------|
| 法定休日労働は法定時間外に含めない | `legalOvertimeMinutes` の算定から除外 |
| 法定休日労働は月60時間超に含めない | `over60OvertimeMinutes` の算定から除外 |
| 日超過と週超過は二重計上しない | 法定内累計（weeklyRegularRunning）で判定 |
| 深夜は他の割増と独立して加算 | 全 attendance の nightWorkMinutes を一律加算 |

---

## 9. 月跨ぎ週の処理ルール

### 9-1. 基本方針

給与計算時に、計上対象 attendance が属する weekStartDate を収集し、その週全体の attendance を staff 単位で参照する。

### 9-2. 参照対象の取得

```
1. 今回計上対象の attendance から、全 weekStartDate を集める
2. 各 weekStartDate に対して、weekStartDate 〜 weekStartDate+6 の attendance を取得
3. 上記には他の paymentPeriodKey に属する attendance も含まれる
```

### 9-3. 計上ルール

- **計上対象**: paymentPeriodKey が今回の期間に一致する attendance のみ
- **参照専用**: 他の期間に属する attendance は weeklyRegularRunning の算出にのみ使用し、集計値・金額には含めない

### 9-4. 処理順

週内の全 attendance（計上対象 + 参照専用）を 4-3 のアルゴリズムで処理するが、集計値への加算は計上対象の attendance に対してのみ行う。

```
for each attendance in week (sorted):
    // 4-2 or 4-3 の計算を実行（weeklyRegularRunning は全 attendance で更新）

    if attendance.paymentPeriodKey == currentPeriodKey
       AND attendance.payrollStatus in [unreflected, corrected_after_reflection]:
        // 集計に加算
        totalActualWorkMinutes    += actualWorkMinutes
        totalLegalOvertimeMinutes += legalOvertimeMinutes
        // ... 他の集計値も同様
```

---

## 10. staff 単位の集計値（確定）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| totalActualWorkMinutes | number | 全実労働時間（法定休日含む） |
| totalNightWorkMinutes | number | 深夜実労働時間（法定休日含む） |
| totalLegalOvertimeMinutes | number | 法定時間外労働時間（法定休日を除く） |
| over60OvertimeMinutes | number | 月60時間超部分（法定休日を除く） |
| totalLegalHolidayWorkMinutes | number | 法定休日労働時間 |
| totalNonLegalHolidayWorkMinutes | number | 法定外休日労働時間（情報管理用。割増なし） |
| basePay | number | 基本賃金 |
| lateNightPremiumPay | number | 深夜割増分 |
| overtimePremiumPay | number | 法定時間外割増分 |
| over60PremiumPay | number | 月60時間超追加割増分 |
| legalHolidayPremiumPay | number | 法定休日割増分 |
| grossPay | number | 総支給額 |

---

## 11. attendance 明細（attendanceItems）の記録フィールド

各 attendance の計算過程を監査目的で記録する。

| フィールド | 型 | 説明 |
|-----------|-----|------|
| attendanceId | string | attendance ID |
| workDate | string | 勤務日 |
| weekday | number | 曜日（0=日曜, 6=土曜。JavaScript getDay() 準拠） |
| weekStartDate | string | 法定週開始日 |
| isLegalHoliday | boolean | 法定休日判定結果 |
| isNonLegalHoliday | boolean | 法定外休日判定結果 |
| actualWorkMinutes | number | 実労働時間 |
| nightWorkMinutes | number | 深夜実労働時間 |
| dailyOverMinutes | number | 1日8時間超分（法定休日なら 0） |
| dailyRegularMinutes | number | 法定内労働分（法定休日なら 0） |
| weeklyRegularBefore | number | 当日前までの法定内累計 |
| weeklyRegularAfter | number | 当日後の法定内累計 |
| weeklyOnlyOverMinutes | number | 純粋な週超過寄与分 |
| legalOvertimeMinutes | number | 当該 attendance の法定時間外 |
| includedInCurrentRun | boolean | 今回計上したか |
| carryOverIncluded | boolean | 過去未反映救済か |

---

## 12. この仕様の適用範囲と限界

### 適用範囲

- 通常の固定労働時間制（1日8時間・1週40時間）の事業場
- 特例措置対象事業場（1週44時間）は weeklyLegalLimit を 2640 に設定することで対応

### 未対応（別途設計が必要）

- 変形労働時間制（1ヶ月単位・1年単位・フレックスタイム制）
- 裁量労働制・みなし労働時間制
- 管理監督者（法定時間外・法定休日の適用除外）
- 年少者の特別ルール
