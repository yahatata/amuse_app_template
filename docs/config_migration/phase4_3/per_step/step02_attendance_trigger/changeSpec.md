# Step 02: attendance フィールド追加 & onWrite トリガー — changeSpec

**作成日**: 2026-03-22

---

## カバーする仕様セクション

| 仕様書 | セクション |
|--------|----------|
| 03_DATA_MODEL_SPEC | 1-1. 既存フィールド（確認のみ） |
| 03_DATA_MODEL_SPEC | 1-2. 追加フィールド（新規） |
| 03_DATA_MODEL_SPEC | 1-3. 廃止フィールド |
| 03_DATA_MODEL_SPEC | 1-4. attendance に持たせないもの |
| 04_CALLABLE_API_SPEC | 1. attendance 帰属情報付与処理（手順 1〜6） |
| 01_CALC_SPEC | 実装時修正事項（nightWorkMinutes の休憩控除） |

---

## 変更一覧

### 変更 1: attendance onWrite トリガー新規作成

**ファイル**: `functions/src/domains/attendance/triggers/attendanceOnWrite.ts`（新規）

**As-Is**: attendance コレクションに Firestore トリガーは存在しない。帰属情報の管理は `payrollReflectedAt`（文字列）のみで、`monthlyPayrollTrigger` スケジューラーから書き込み。

**To-Be**: attendance の作成・更新時に自動で帰属情報を付与する onWrite トリガーを新設。

```typescript
// attendance onWrite トリガーの処理概要
export const attendanceOnWrite = onDocumentWritten(
  'attendances/{attendanceId}',
  async (event) => {
    // 1. 削除イベントはスキップ
    // 2. config + payrollConfig を取得
    // 3. date から weekday を算出（new Date(date).getDay()）
    // 4. date + payrollConfig.weekStartDay → weekStartDate を算出（Step01 の getWeekStartDate）
    // 5. date + config.payroll.startDay/endDay → paymentPeriodKey を算出（Step01 の getPaymentPeriodKey）
    // 6. 新規作成（before が存在しない）: payrollStatus = "unreflected" をセット
    // 7. 更新（before.payrollStatus === "reflected"）: payrollStatus = "corrected_after_reflection" に遷移
    // 8. 上記フィールドが変更された場合のみ update を実行（無限ループ防止）
  }
);
```

**無限ループ防止**: トリガー自身が書き込むフィールド（weekday, weekStartDate, paymentPeriodKey, payrollStatus）と before の値を比較し、変更がない場合は書き込みをスキップ。

### 変更 2: nightWorkMinutes の休憩控除修正

**ファイル**: `functions/src/domains/attendance/helpers/recalculateAttendanceFromBreaks.ts`（変更）

**As-Is**: `nightWorkMinutes = calculateNightWorkMinutes(clockIn, clockOut, ...)` — 休憩時間を控除していない。

**To-Be**: breaks サブコレクションの各 break について、深夜帯（nightWorkStartHour〜nightWorkEndHour）との重複分を算出し、nightWorkMinutes から控除する。

```typescript
// 修正後の nightWorkMinutes 計算
const grossNightWorkMinutes = calculateNightWorkMinutes(clockIn, clockOut, nightWorkStartHour, nightWorkEndHour);

let nightBreakMinutes = 0;
for (const doc of breaksSnap.docs) {
  const d = doc.data();
  if (d.isDeleted === true) continue;
  const startedAt = d.startedAt as Timestamp;
  const endedAt = d.endedAt as Timestamp | null;
  if (!endedAt) continue;
  nightBreakMinutes += calculateNightWorkMinutes(startedAt, endedAt, nightWorkStartHour, nightWorkEndHour);
}

nightWorkMinutes = Math.max(0, grossNightWorkMinutes - nightBreakMinutes);
```

`nightMinutes` は従来通り拘束ベース（休憩未控除）のまま維持。

### 変更 3: attendance 作成時の新フィールド追加

**対象ファイル**（すべて変更）:
- `functions/src/domains/attendance/callables/clockIn.ts`
- `functions/src/domains/attendance/callables/createAttendance.ts`
- `functions/src/domains/attendance/callables/createManualClockInRecord.ts`
- `functions/src/domains/attendance/callables/seedAttendancesDemo.ts`

**As-Is**: attendance 作成時に `payrollReflectedAt: null` のみセット。`weekday`, `weekStartDate`, `paymentPeriodKey`, `payrollStatus` は存在しない。

**To-Be**: 新フィールドの初期値をセットする。ただし、帰属情報（weekday, weekStartDate, paymentPeriodKey）は onWrite トリガーで算出するため、作成パスでは `payrollStatus: "unreflected"` のみを明示的にセットする。

> onWrite トリガーが weekday/weekStartDate/paymentPeriodKey を算出するため、Callable 側で重複計算は行わない。トリガーが全経路を網羅する（04_CALLABLE_API_SPEC セクション1「トリガー選択の理由」参照）。

```typescript
// 追加フィールド（clockIn.ts の attendanceData に追加）
payrollStatus: 'unreflected',
reflectedPayrollRunId: null,
reflectedAt: null,
// weekday, weekStartDate, paymentPeriodKey は onWrite トリガーで算出
```

`payrollReflectedAt` は互換性のため引き続き `null` で初期化する。

### 変更 4: index.ts への onWrite トリガー export 追加

**ファイル**: `functions/src/domains/attendance/index.ts`（変更）

**To-Be**: `attendanceOnWrite` トリガーの export を追加。

### 変更 5: payrollReflectedAt のフォールバック処理

**ファイル**: `functions/src/domains/attendance/triggers/attendanceOnWrite.ts` 内

**As-Is**: 既存 attendance に `payrollReflectedAt` が文字列で設定されている場合がある。

**To-Be**: onWrite トリガー内で、`payrollStatus` が未設定かつ `payrollReflectedAt` が非 null 文字列の attendance は `payrollStatus = "reflected"` とみなす（移行用フォールバック）。

---

## 実装順序

1. `recalculateAttendanceFromBreaks.ts` の nightWorkMinutes 修正（変更 2）
2. `attendanceOnWrite.ts` 新規作成（変更 1 + 変更 5）
3. attendance 作成 Callable への新フィールド追加（変更 3）
4. `index.ts` への export 追加（変更 4）
5. テストコード作成・実行

---

## テスト計画

### 単体テスト: nightWorkMinutes 休憩控除

**ファイル**: `functions/__tests__/attendance/recalculateNightBreaks.spec.ts`

| # | テストケース | 期待値 |
|---|---|---|
| 1 | 休憩なし（22:00-05:00 勤務） | nightWorkMinutes = grossNightWorkMinutes |
| 2 | 深夜帯に30分休憩（23:00-23:30） | nightWorkMinutes = gross - 30 |
| 3 | 休憩が深夜帯と日中帯にまたがる（21:30-22:30） | nightWorkMinutes = gross - 30（22:00〜22:30 の30分のみ控除） |
| 4 | 複数休憩、一部深夜帯 | 深夜帯重複分の合計が控除される |
| 5 | 休憩が完全に日中帯 | nightWorkMinutes = grossNightWorkMinutes |
| 6 | clockOut なし | nightWorkMinutes = 0（変更なし） |

### 単体テスト: attendanceOnWrite トリガー

**ファイル**: `functions/__tests__/attendance/attendanceOnWrite.spec.ts`

| # | テストケース | 期待値 |
|---|---|---|
| 1 | 新規 attendance 作成（date=2026-03-18, weekStartDay=0） | weekday=3, weekStartDate=2026-03-15, paymentPeriodKey が正しい, payrollStatus=unreflected |
| 2 | 新規 attendance 作成（date=2026-03-15=日曜, weekStartDay=0） | weekday=0, weekStartDate=2026-03-15 |
| 3 | 退勤更新（payrollStatus=unreflected のまま） | payrollStatus=unreflected のまま変化なし |
| 4 | reflected attendance の更新 | payrollStatus → corrected_after_reflection |
| 5 | corrected_after_reflection attendance の再更新 | payrollStatus=corrected_after_reflection のまま |
| 6 | 論理削除（isDeleted=true） | フィールドは保持される（削除イベントではない） |
| 7 | payrollReflectedAt が非 null 文字列の既存 attendance 更新 | payrollStatus=reflected（フォールバック） |
| 8 | トリガーによる自己更新でループしない | 2回目の呼び出しで書き込みが発生しない |
| 9 | startDay=26, endDay=25 の期間設定 | paymentPeriodKey が正しい |
| 10 | endDay=0（月末）の期間設定 | paymentPeriodKey が正しい |

### エミュレータテスト（実機確認項目）

| # | 確認観点 | 操作手順 | 期待値 |
|---|---|---|---|
| 1 | clockIn → フィールド付与 | clockIn Callable で打刻 | weekday, weekStartDate, paymentPeriodKey, payrollStatus=unreflected が設定される |
| 2 | clockOut → nightWorkMinutes | 深夜帯に休憩を含む退勤 | nightWorkMinutes が休憩控除後の値になる |
| 3 | updateAttendance → corrected 遷移 | reflected attendance を編集 | payrollStatus=corrected_after_reflection に遷移 |

---

## Step01 との整合性

| Step01 成果物 | 本 Step での使用箇所 |
|---|---|
| `payrollPeriodUtils.getPaymentPeriodKey()` | attendanceOnWrite トリガー内で paymentPeriodKey 算出 |
| `payrollPeriodUtils.getWeekStartDate()` | attendanceOnWrite トリガー内で weekStartDate 算出 |
| `payrollConfigLoader.getPayrollConfig()` | attendanceOnWrite トリガー内で weekStartDay 取得 |
| `configLoader.getStoreConfig()` | attendanceOnWrite トリガー内で startDay/endDay 取得 |
| `payrollCalcTypes.PayrollStatus` | payrollStatus の型として使用 |
