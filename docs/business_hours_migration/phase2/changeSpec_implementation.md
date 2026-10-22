# Phase2: businessHoursMonthlyMap導入 - 実装詳細仕様書

## 概要

Phase2では、`calcBusinessDate.ts`を改修し、`businessHoursMonthlyMap`を参照して営業時間を取得するように変更する。また、±30分バッファと`OK`/`NONE`/`AMBIGUOUS`の戻り値を実装する。

## 実装タスク

### 1. `calcBusinessDate.ts`の改修

#### 1.1 関数シグネチャの変更

**ファイル**: `functions/src/helpers/billsApi/calcBusinessDate.ts`（修正）

**変更前**:
```typescript
export function calcBusinessDate(nowUtc?: Date): string
```

**変更後**:
```typescript
export type BusinessDateResult = 
  | { status: 'OK'; businessDateKey: string }
  | { status: 'NONE' }
  | { status: 'AMBIGUOUS'; candidates: string[] };

export function calcBusinessDate(nowUtc?: Date): Promise<BusinessDateResult>
```

**変更点**:
- 戻り値を`string`から`BusinessDateResult`に変更
- `async`関数に変更（Firestoreから`businessHoursMonthlyMap`を取得するため）

**戻り値の説明**:
- `status: 'OK'`の場合: `businessDateKey`フィールドに営業日（`YYYY-MM-DD`形式）が含まれます
- `status: 'NONE'`の場合: どの営業日にも属さないため、`businessDateKey`は含まれません
- `status: 'AMBIGUOUS'`の場合: `candidates`フィールドに候補の営業日リスト（`YYYY-MM-DD`形式の文字列配列）が含まれます

#### 1.2 businessHoursMonthlyMapの参照機能

**実装内容**:
1. **コレクション名の確定**: `businessHoursMonthlyMap`コレクションのドキュメントIDは`YYYY-MM`形式（例: `2024-01`）
2. **月跨ぎ対応**:
   - 入力日時が1日の場合は前月分のドキュメントも取得（前月の最終営業日に属する可能性があるため）
   - 入力日時が28-31日の場合は次月のドキュメントも取得（次月の最初の営業日に属する可能性があるため）
3. **daysキーの正規化**: `"1"`/`"01"`の揺れに対応（両方の形式をチェック）

**実装ロジック**:
```typescript
// 1. 入力日時をJSTに変換
const jstDate = convertToJst(nowUtc || new Date());

// 2. 該当月のドキュメントIDを生成（YYYY-MM形式）
const currentMonthKey = formatMonthKey(jstDate);

// 3. 月跨ぎ対応: 前月/次月のドキュメントIDも生成
const prevMonthKey = getPrevMonthKey(currentMonthKey);
const nextMonthKey = getNextMonthKey(currentMonthKey);

// 4. Firestoreから該当月のbusinessHoursMonthlyMapを取得
const currentMonthDoc = await db.collection('businessHoursMonthlyMap').doc(currentMonthKey).get();

// 5. 月跨ぎ対応: 前月/次月のドキュメントも取得（必要に応じて）
const prevMonthDoc = (jstDate.getDate() === 1) 
  ? await db.collection('businessHoursMonthlyMap').doc(prevMonthKey).get()
  : null;
const nextMonthDoc = (jstDate.getDate() >= 28) 
  ? await db.collection('businessHoursMonthlyMap').doc(nextMonthKey).get()
  : null;

// 6. daysマップから該当日のデータを取得（キーは日付の文字列、例: "10", "11"）
const dayKey = normalizeDayKey(String(jstDate.getDate())); // "1" → "1", "01" → "1"
const dayData = getDayData(currentMonthDoc, prevMonthDoc, nextMonthDoc, dayKey, jstDate);
```

#### 1.3 営業日判定ロジック

**実装内容**:
1. **isClosedチェック**: `dayData.isClosed === true`の場合は`NONE`を返す
2. **営業時間ウィンドウの計算**:
   - `openMinute`: 分単位（0-1440、1440=24:00）
   - `closeMinute`: 分単位（0-2880、1440=24:00、2880=48:00）
   - `closeMinute > 1440`の場合は「翌日に伸びる」ことを意味する（例: `1680` = 28:00 = 翌日04:00）
3. **±バッファの適用**:
   - 営業時間の前後にバッファを拡張したウィンドウとして扱う
   - バッファ時間は`globalConstant.dart`の`CALC_BUSINESS_DATE_BUFFER_MINUTES`で設定可能（デフォルト: 30分）
   - 例: 営業時間が20:00-28:00、バッファが30分の場合、19:30-28:30の範囲を拡張ウィンドウとして扱う
4. **候補の列挙**:
   - ±30分拡張ウィンドウに時刻が含まれる営業日候補を列挙
   - 候補数0 → `NONE`、1 → `OK`、2以上 → `AMBIGUOUS`を返す

**実装ロジック**:
```typescript
// 1. 営業時間ウィンドウの計算
const openTime = minutesToTime(dayData.openMinute, jstDate);
const closeTime = minutesToTime(dayData.closeMinute, jstDate);

// 2. ±バッファの適用（globalConstantから取得）
const bufferMinutes = getCalcBusinessDateBufferMinutes(); // globalConstantから取得（デフォルト: 30分）
const bufferedOpenTime = subtractMinutes(openTime, bufferMinutes);
const bufferedCloseTime = addMinutes(closeTime, bufferMinutes);

// 3. 入力日時がどの営業日に属するかを判定
const candidates = findBusinessDateCandidates(
  jstDate,
  bufferedOpenTime,
  bufferedCloseTime,
  currentMonthDoc,
  prevMonthDoc,
  nextMonthDoc
);

// 4. 候補数に応じて戻り値を決定
if (candidates.length === 0) {
  return { status: 'NONE' };
} else if (candidates.length === 1) {
  return { status: 'OK', businessDateKey: candidates[0] };
} else {
  return { status: 'AMBIGUOUS', candidates };
}
```

#### 1.4 ヘルパー関数の実装

**新規作成ファイル**: `functions/src/helpers/billsApi/calcBusinessDateHelpers.ts`（推奨）

**実装する関数**:
- `convertToJst(date: Date): Date` - UTCをJSTに変換
- `formatMonthKey(date: Date): string` - `YYYY-MM`形式の月キーを生成
- `getPrevMonthKey(monthKey: string): string` - 前月の月キーを生成
- `getNextMonthKey(monthKey: string): string` - 次月の月キーを生成
- `normalizeDayKey(dayKey: string): string` - `"1"`/`"01"`の揺れを正規化
- `getDayData(...)`: 該当日のデータを取得（月跨ぎ対応）
- `minutesToTime(minutes: number, baseDate: Date): Date` - 分単位から時刻に変換
- `subtractMinutes(date: Date, minutes: number): Date` - 時刻から分を減算
- `addMinutes(date: Date, minutes: number): Date` - 時刻に分を加算
- `findBusinessDateCandidates(...)`: 営業日候補を列挙
- `getCalcBusinessDateBufferMinutes(): number` - `globalConstant.dart`からバッファ時間（分）を取得（デフォルト: 30分）

**注意事項**:
- `closeMinute > 1440`の場合は翌日に伸びることを考慮
- 月跨ぎ対応（前月の最終営業日、次月の最初の営業日）を考慮

---

### 2. `calcBusinessDate`を使用しているファイルの修正

#### 2.1 `postEventAdjustment.ts`の修正

**ファイル**: `functions/src/helpers/billsApi/postEventAdjustment.ts`（修正）

**修正箇所**: 137行目付近
```typescript
// 修正前
const finalEventBusinessDate = eventBusinessDate || calcBusinessDate();

// 修正後
let finalEventBusinessDate: string;
if (eventBusinessDate) {
  finalEventBusinessDate = eventBusinessDate;
} else {
  const businessDateResult = await calcBusinessDate();
  if (businessDateResult.status === 'NONE') {
    throw new HttpsError(
      'failed-precondition',
      'The event time does not belong to any business day.'
    );
  }
  if (businessDateResult.status === 'AMBIGUOUS') {
    // AMBIGUOUSの場合は、UIでどちらの営業日に属するデータなのかを選択させる
    // リクエストにselectedBusinessDateKeyが含まれている場合はそれを使用
    const selectedBusinessDateKey = request.eventPayload?.selectedBusinessDateKey;
    if (!selectedBusinessDateKey || !businessDateResult.candidates.includes(selectedBusinessDateKey)) {
      throw new HttpsError(
        'failed-precondition',
        `The event time is ambiguous. Please select a business date from candidates: ${businessDateResult.candidates.join(', ')}`,
        { candidates: businessDateResult.candidates }
      );
    }
    finalEventBusinessDate = selectedBusinessDateKey;
  } else {
    // OKの場合
    finalEventBusinessDate = businessDateResult.businessDateKey;
  }
}
```

**注意事項**:
- `calcBusinessDate()`が`NONE`を返す場合はエラーをthrowする
- `calcBusinessDate()`が`AMBIGUOUS`を返す場合は、UIでどちらの営業日に属するデータなのかを選択させる必要がある
  - リクエストに`selectedBusinessDateKey`が含まれている場合はそれを使用
  - 含まれていない場合はエラーをthrowし、UIで選択ダイアログを表示する必要がある
- `calcBusinessDate()`が`OK`を返す場合は`businessDateKey`を使用
- エラーハンドリング: `NONE`の場合は`HttpsError('failed-precondition', ...)`をthrow

#### 2.2 `postEventReopen.ts`の修正（該当する場合）

**ファイル**: `functions/src/helpers/billsApi/postEventReopen.ts`（修正）

**修正内容**: `calcBusinessDate()`の呼び出しを`await calcBusinessDate()`に変更し、戻り値を`BusinessDateResult`として処理

#### 2.3 `postEventRefund.ts`の修正（該当する場合）

**ファイル**: `functions/src/helpers/billsApi/postEventRefund.ts`（修正）

**修正内容**: `calcBusinessDate()`の呼び出しを`await calcBusinessDate()`に変更し、戻り値を`BusinessDateResult`として処理

#### 2.4 その他の`calcBusinessDate`使用箇所

**対象ファイル**:
- `functions/src/analytics/migrateSettledBillsForBusinessDay.ts`（該当する場合）

**修正内容**: `calcBusinessDate()`の呼び出しを`await calcBusinessDate()`に変更し、戻り値を`BusinessDateResult`として処理

---

### 3. `scheduledTournaments`コレクションへの`businessDate`追加

#### 3.1 `createScheduledTournament.ts`の修正

**ファイル**: `functions/src/callables/createScheduledTournament.ts`（修正）

**修正箇所**: 107-140行目付近

**修正内容**:
1. `startAt`から`calcBusinessDate`を使用して`businessDate`を計算
2. `businessDate`フィールドを`scheduledTournamentData`に追加
3. `AMBIGUOUS`/`NONE`時のエラーハンドリング

**実装ロジック**:
```typescript
// startAtから営業日を計算
const startAtTimestamp = Timestamp.fromDate(startAtDate);
const businessDateResult = await calcBusinessDate(startAtDate);

if (businessDateResult.status === 'NONE') {
  throw new HttpsError(
    'failed-precondition',
    `The start time ${startAt} does not belong to any business day.`
  );
}

if (businessDateResult.status === 'AMBIGUOUS') {
  // AMBIGUOUSの場合は、UIでどちらの営業日に属するデータなのかを選択させる
  // リクエストに`selectedBusinessDateKey`が含まれている場合はそれを使用
  // 含まれていない場合はエラーをthrow（UIで選択ダイアログを表示する必要がある）
  const selectedBusinessDateKey = request.data?.selectedBusinessDateKey;
  if (!selectedBusinessDateKey || !businessDateResult.candidates.includes(selectedBusinessDateKey)) {
    throw new HttpsError(
      'failed-precondition',
      `The start time ${startAt} is ambiguous. Please select a business date from candidates: ${businessDateResult.candidates.join(', ')}`,
      { candidates: businessDateResult.candidates }
    );
  }
  businessDate = selectedBusinessDateKey;
} else {
  businessDate = businessDateResult.businessDateKey;
}

// scheduledTournamentDataに追加
const scheduledTournamentData = {
  // ... 既存フィールド
  businessDate, // 追加
  // ...
};
```

**注意事項**:
- Phase2では`AMBIGUOUS`の場合は最初の候補を使用（Phase4でUI選択ダイアログを実装予定）
- `NONE`の場合はエラーをthrow

---

### 4. `attendances`コレクションへの`businessDate`追加（保留）

**保留理由**: attendanceのあるべき姿として、営業日関係なしに実際の日時を格納しておくだけで問題ないのではという検討をしているため。

**対象ファイル**:
- `functions/src/attendance/createClockInRecord.ts` - **修正不要（保留）**
- `functions/src/attendance/createManualClockInRecord.ts` - **修正不要（保留）**
- `functions/src/attendance/updateClockOutRecord.ts` - **修正不要（保留）**

**注意事項**:
- Phase2では`attendances`の修正は行いません
- 将来的に検討が完了した時点で対応を決定します

---

### 5. `attendanceCorrectionRequests`コレクション（保留）

**保留理由**: attendanceのあるべき姿として、営業日関係なしに実際の日時を格納しておくだけで問題ないのではという検討をしているため。

**対象ファイル**:
- `functions/src/attendance/createAttendanceCorrectionRequest.ts` - **修正不要（保留）**

**注意事項**:
- Phase2では`attendanceCorrectionRequests`の修正は行いません
- 将来的に検討が完了した時点で対応を決定します

---

### 6. 型定義の追加（旧4番から移動）

#### 6.1 `BusinessDateResult`型の定義

**ファイル**: `functions/src/attendance/createClockInRecord.ts`（修正）

**修正箇所**: 59-70行目付近

**修正内容**:
1. `clockIn`から`calcBusinessDate`を使用して`businessDate`を計算
2. `date`フィールドを`businessDate`に変更
3. `AMBIGUOUS`/`NONE`時のエラーハンドリング

**実装ロジック**:
```typescript
// clockInから営業日を計算
const clockInTimestamp = admin.firestore.FieldValue.serverTimestamp();
// 注意: serverTimestamp()は実際のTimestampを返さないため、
// 実際の時刻を取得する必要がある（実装時に確認）
const now = new Date();
const businessDateResult = await calcBusinessDate(now);

if (businessDateResult.status === 'NONE') {
  throw new HttpsError(
    'failed-precondition',
    'The clock-in time does not belong to any business day.'
  );
}

if (businessDateResult.status === 'AMBIGUOUS') {
  // Phase2ではAMBIGUOUSの場合は最初の候補を使用（Phase4でUI選択ダイアログを実装）
  logger.warn('calcBusinessDate returned AMBIGUOUS, using first candidate', {
    candidates: businessDateResult.candidates,
    clockIn: now,
  });
  businessDate = businessDateResult.candidates[0];
} else {
  businessDate = businessDateResult.businessDateKey;
}

// 出勤記録を作成
const attendanceData = {
  staffId,
  businessDate, // date → businessDateに変更
  clockIn: admin.firestore.FieldValue.serverTimestamp(),
  // ... 既存フィールド
};
```

#### 4.2 `createManualClockInRecord.ts`の修正

**ファイル**: `functions/src/attendance/createManualClockInRecord.ts`（修正）

**修正内容**: `createClockInRecord.ts`と同様

**注意事項**:
- 手動出勤記録の場合、`clockIn`はリクエストで指定されるため、その時刻から`calcBusinessDate`を計算

#### 4.3 `updateClockOutRecord.ts`の修正（該当する場合）

**ファイル**: `functions/src/attendance/updateClockOutRecord.ts`（修正）

**修正内容**: 
- `businessDate`フィールドの更新が必要な場合は、`clockIn`から再計算
- ただし、既存の`businessDate`を維持する方針も検討（実装時に判断）

#### 4.4 `attendanceCorrectionRequests`は保留

**保留理由**: attendanceのあるべき姿として、営業日関係なしに実際の日時を格納しておくだけで問題ないのではという検討をしているため。

**対象ファイル**:
- `functions/src/attendance/createAttendanceCorrectionRequest.ts` - **修正不要（保留）**

**注意事項**:
- Phase2では`attendanceCorrectionRequests`の修正は行わない
- 将来的に検討が完了した時点で対応を決定

---

**ファイル**: `functions/src/helpers/billsApi/types.ts`（修正、または新規作成）

**実装内容**:
```typescript
export type BusinessDateResult = 
  | { status: 'OK'; businessDateKey: string }
  | { status: 'NONE' }
  | { status: 'AMBIGUOUS'; candidates: string[] };
```

**注意事項**:
- `calcBusinessDate.ts`で定義する場合は、`types.ts`にエクスポートを追加

---

### 7. businessHoursMonthlyMapのコレクション名とデータ構造

#### 6.1 コレクション名

**コレクション名**: `businessHoursMonthlyMap`（確定）

**ドキュメントID**: `YYYY-MM`形式（例: `2024-01`）

#### 6.2 データ構造

```typescript
{
  days: {
    "10": {
      closeMinute: 1440,  // 閉店時刻（分単位、1440=24:00）
      isClosed: false,    // 休業日かどうか
      openMinute: 720,    // 開店時刻（分単位、720=12:00）
      source: "auto",     // データソース
      styleId: "weekendHoliday" | "weekday"  // スタイルID
    },
    "11": { ... },
    // ... 1ヶ月分（1-31日）
  }
}
```

**注意事項**:
- `days`キーは日付の文字列（例: `"10"`, `"11"`）で、`"1"`/`"01"`の揺れがあり得るため、実装ではnormalizeして両対応する必要がある
- `openMinute`: 分単位（0-1440、1440=24:00）
- `closeMinute`: 分単位（0-2880、1440=24:00、2880=48:00）
  - `closeMinute > 1440`の場合は「翌日に伸びる」ことを意味する（例: `1680` = 28:00 = 翌日04:00）
- `isClosed: true`の場合は営業日ではない

---

## 実装順序

1. 型定義の追加（`BusinessDateResult`）
2. ヘルパー関数の実装（`calcBusinessDateHelpers.ts`）
3. `calcBusinessDate.ts`の改修
   - `globalConstant.dart`に`CALC_BUSINESS_DATE_BUFFER_MINUTES`を追加（デフォルト: 30分）
   - Functions側で`globalConstant`からバッファ時間を取得する機能を実装
4. `calcBusinessDate`を使用しているファイルの修正
   - `postEventAdjustment.ts`
   - `postEventReopen.ts`（該当する場合）
   - `postEventRefund.ts`（該当する場合）
   - その他の使用箇所
   - **重要**: `AMBIGUOUS`の場合は、UIでどちらの営業日に属するデータなのかを選択させる
5. `scheduledTournaments`への`businessDate`追加
   - `createScheduledTournament.ts`
   - **重要**: `AMBIGUOUS`の場合は、リクエストに`selectedBusinessDateKey`を含めるか、エラーをthrowしてUIで選択ダイアログを表示
6. テスト実装

---

## テスト観点

### 1. `calcBusinessDate`のテスト

- `businessHoursMonthlyMap`が存在しない場合: エラーをthrow
- `isClosed: true`の場合: `NONE`を返す
- 営業時間内の場合: `OK`を返す
- 営業時間外（バッファ外）の場合: `NONE`を返す
- バッファ内で単一営業日に属する場合: `OK`を返す
- バッファ内で複数営業日に跨る場合: `AMBIGUOUS`を返す
- 月跨ぎ対応: 1日の場合は前月分のドキュメントも確認
- 月跨ぎ対応: 28-31日の場合は次月のドキュメントも確認
- `closeMinute > 1440`の場合（翌日に伸びる）: 正しく判定
- `days`キーの揺れ（`"1"`/`"01"`）: 両方の形式に対応

### 2. `scheduledTournaments`への`businessDate`追加のテスト

- `startAt`から`businessDate`が正しく計算される
- `AMBIGUOUS`の場合: 最初の候補が使用される（Phase4でUI選択ダイアログを実装予定）
- `NONE`の場合: エラーをthrow

### 3. `AMBIGUOUS`時のUI選択のテスト

- `calcBusinessDate`が`AMBIGUOUS`を返した場合、UIでどちらの営業日に属するデータなのかを選択できる
- 選択された営業日が正しく使用される

---

## 参照資料

- [Step0: 最終仕様](../step0_final_spec.md)
- [Step1: コレクション分析](../step1_collection_analysis.md)
- [Step2: 取得・表示ファイルの洗い出し](../step2_query_display_files.md)
- [Step4: 改修実装チェックリスト](../step4_migration_plan_checklist.md)
