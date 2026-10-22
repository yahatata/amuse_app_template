# 営業時間スタイル自動適用機能の実装計画

## 実装の目的

営業時間を営業スタイル（平日/週末祝日/休業日など）に基づいて自動生成し、手動編集も可能にし、年次自動生成を行う機能を実装します。

---

## 実装順序（推奨）

### Phase 1: 基盤準備（スキーマ・モデル拡張）

#### 1.1 Firestoreスキーマの拡張設計
- `businessHoursMonthly/{YYYY-MM}/days/{DD}` に `styleId`, `source` フィールド追加
- `businessHoursMonthlyMap/{YYYY-MM}.days.{DD}` に `styleId`, `source` フィールド追加
- `shifts/{YYYY-MM}/days/{dateKey}.businessHours` に `styleId`, `source` フィールド追加

#### 1.2 Flutter側モデルの拡張
**ファイル**: `lib/StaffDate/shiftHomePage.dart`
- `BusinessHours` クラスに `styleId`, `source` フィールドを追加（オプショナル）
- `copyWith` メソッドも更新

**ファイル**: `lib/StaffDate/shift_repository.dart`
- `_parseBusinessHours` メソッドで `styleId`, `source` を読み取り
- **デフォルト値: `styleId: null`, `source: "auto"`（既存データ用）**
  - ⚠️ **重要**: `source: "manual"` にしないこと。既存データを manual 扱いすると、自動生成で上書きされなくなる

#### 1.3 既存データへの影響確認
- 既存データに `styleId`/`source` がない場合の後方互換性を確保
- 読み取り時は `null` チェックしてデフォルト値を返す
  - `source == null` → `"auto"` 扱い（manual保護の対象外）
  - `styleId == null` → `null` のまま（未知扱いで許容）

---

### Phase 2: 営業スタイル定義・祝日判定（Functions側）

#### 2.1 祝日判定ライブラリの導入
**ファイル**: `functions/package.json`
```json
{
  "dependencies": {
    "japanese-holidays": "^1.0.0"  // または holiday-jp, @holiday-jp/holiday-jp
  }
}
```
- `npm install` を実行

#### 2.2 営業スタイル定義（TS定数）
**ファイル**: `functions/src/shift/styles.ts`（新規作成）

```typescript
/**
 * 営業スタイル定義（globalConstant.dart の参照を避け、Functions側で独立して保持）
 */
export interface BusinessHoursStyle {
  styleId: string;
  openMinute: number;  // 60の倍数であること
  closeMinute: number; // 60の倍数であること（1440以上も許容）
  isClosed: boolean;
}

export const BUSINESS_HOURS_STYLES: Record<string, BusinessHoursStyle> = {
  weekday: {
    styleId: "weekday",
    openMinute: 900,   // 15:00
    closeMinute: 1440, // 24:00
    isClosed: false,
  },
  weekendHoliday: {
    styleId: "weekendHoliday",
    openMinute: 720,   // 12:00
    closeMinute: 1440, // 24:00
    isClosed: false,
  },
  closed: {
    styleId: "closed",
    openMinute: 0,     // 任意だが検証簡略のため0
    closeMinute: 0,    // 任意だが検証簡略のため0
    isClosed: true,
  },
};

/**
 * styleIdから営業時間を取得
 */
export function getBusinessHoursByStyleId(styleId: string): BusinessHoursStyle {
  const style = BUSINESS_HOURS_STYLES[styleId];
  if (!style) {
    throw new Error(`Unknown styleId: ${styleId}`);
  }
  return style;
}

/**
 * 60分刻みかチェック
 */
export function isHourlyIncrement(minutes: number): boolean {
  return minutes % 60 === 0;
}
```

#### 2.3 祝日判定ユーティリティ
**ファイル**: `functions/src/shift/holidayHelper.ts`（新規作成）

```typescript
import * as japaneseHolidays from 'japanese-holidays'; // または選択したライブラリ

/**
 * 日本の祝日かどうかを判定
 * @param date 判定する日付
 * @returns 祝日の場合 true
 */
export function isJapaneseHoliday(date: Date): boolean {
  const holiday = japaneseHolidays.isHoliday(date);
  return holiday !== null;
}

/**
 * 曜日を取得（0=日曜日, 6=土曜日）
 */
export function getWeekday(date: Date): number {
  return date.getDay();
}

/**
 * 平日かどうか（月〜金かつ祝日でない）
 */
export function isWeekday(date: Date): boolean {
  const weekday = getWeekday(date);
  return weekday >= 1 && weekday <= 5 && !isJapaneseHoliday(date);
}

/**
 * 週末または祝日かどうか
 */
export function isWeekendOrHoliday(date: Date): boolean {
  const weekday = getWeekday(date);
  return weekday === 0 || weekday === 6 || isJapaneseHoliday(date);
}

/**
 * 日付から styleId を決定
 * - 平日 → "weekday"
 * - 土日祝 → "weekendHoliday"
 */
export function determineStyleId(date: Date): string {
  if (isWeekday(date)) {
    return "weekday";
  } else {
    return "weekendHoliday";
  }
}
```

---

### Phase 3: 既存Callableの拡張

#### 3.1 `initBusinessHoursForMonth` の拡張
**ファイル**: `functions/src/shift/initBusinessHoursForMonth.ts`

**変更点**:
1. リクエストインターフェースに `styleId`, `source` を追加（オプショナル）
   ```typescript
   interface InitBusinessHoursForMonthRequest {
     yearMonth: string;
     installationId: string;
     days: Array<{
       day: number;
       openMinute: number;
       closeMinute: number;
       isClosed: boolean;
       styleId?: string;    // 追加
       source?: "auto" | "manual";  // 追加
     }>;
   }
   ```

2. ドキュメント保存時に `styleId`, `source` を含める（`createdAt` は新規作成時のみ）
   ```typescript
   // 既存ドキュメントかチェック
   const existingDoc = await dayDocRef.get();
   const dayData: any = {
     dateKey,
     openMinute: day.openMinute,
     closeMinute: day.closeMinute,
     isClosed: day.isClosed,
     styleId: day.styleId || null,  // 追加
     source: day.source || "auto", // 追加（デフォルトはauto）
     updatedAt: now,
   };
   
   // 新規作成時のみ createdAt を設定（更新時は上書きしない）
   if (!existingDoc.exists) {
     dayData.createdAt = now;
   }
   
   batch.set(dayDocRef, dayData, { merge: true });
   ```

3. `daysMap` にも `styleId`, `source` を含める
   ```typescript
   daysMap[dayStr] = {
     openMinute: day.openMinute,
     closeMinute: day.closeMinute,
     isClosed: day.isClosed,
     styleId: day.styleId || null,  // 追加
     source: day.source || "auto", // 追加（デフォルトはauto）
   };
   ```

4. `businessHoursMonthlyMap` の `createdAt` も新規作成時のみ設定
   ```typescript
   const mapDocRef = db.collection("businessHoursMonthlyMap").doc(yearMonth);
   const existingMapDoc = await mapDocRef.get();
   
   const mapData: any = {
     days: daysMap,
     updatedAt: now,
   };
   
   if (!existingMapDoc.exists) {
     mapData.createdAt = now;
   }
   
   batch.set(mapDocRef, mapData, { merge: true });
   ```

5. 60分刻みの検証を追加
   ```typescript
   if (day.openMinute % 60 !== 0 || day.closeMinute % 60 !== 0) {
     throw new HttpsError("invalid-argument", "openMinute and closeMinute must be multiples of 60");
   }
   ```

6. 深夜跨ぎ対応（`closeMinute > 1440` を許可）
   - バリデーション条件を `closeMinute > 1440` まで許可に変更

#### 3.2 `initShiftDaysForMonth` の拡張
**ファイル**: `functions/src/shift/initShiftDaysForMonth.ts`

**変更点**:
1. `businessHoursMonthlyMap` から `styleId`, `source` も取得
   ```typescript
   const daysMap = mapData.days as Record<
     string,
     { 
       openMinute: number; 
       closeMinute: number; 
       isClosed: boolean;
       styleId?: string;        // 追加
       source?: "auto" | "manual";  // 追加
     }
   >;
   ```

2. `shifts` の `businessHours` に `styleId`, `source` も保存
   ```typescript
   businessHours: {
     openMinute: dayData.openMinute,
     closeMinute: dayData.closeMinute,
     isClosed: dayData.isClosed,
     styleId: dayData.styleId || null,  // 追加
     source: dayData.source || "auto", // 追加（デフォルトはauto）
   }
   ```

#### 3.3 `getBusinessHoursFromMap` ヘルパーの拡張
**ファイル**: `functions/src/shift/helpers.ts`

**変更点**:
- 戻り値に `styleId`, `source` を含める
- 既存呼び出し元への影響を確認（後方互換性）

---

### Phase 4: 共通ロジックの抽出（重要）

#### 4.1 共通関数の作成
**ファイル**: `functions/src/shift/businessHoursCore.ts`（新規作成）

**目的**: `initBusinessHoursForMonth` のロジックを純関数として抽出し、Callable間で共有

**実装内容**:
```typescript
/**
 * businessHoursMonthly と businessHoursMonthlyMap を更新する共通ロジック
 * @param db Firestore instance
 * @param yearMonth YYYY-MM形式
 * @param days 営業時間データの配列
 * @returns batch操作を含むPromise（呼び出し側でcommitする）
 */
export async function upsertBusinessHoursForMonth(
  db: FirebaseFirestore.Firestore,
  yearMonth: string,
  days: Array<{
    day: number;
    openMinute: number;
    closeMinute: number;
    isClosed: boolean;
    styleId?: string;
    source?: "auto" | "manual";
  }>
): Promise<FirebaseFirestore.WriteBatch> {
  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();
  
  const daysMap: Record<string, { openMinute: number; closeMinute: number; isClosed: boolean; styleId?: string; source?: "auto" | "manual" }> = {};
  
  for (const day of days) {
    const dayStr = day.day.toString().padStart(2, "0");
    const dateKey = `${yearMonth}-${dayStr}`;
    const dayDocRef = db
      .collection("businessHoursMonthly")
      .doc(yearMonth)
      .collection("days")
      .doc(dayStr);
    
    // 既存ドキュメントかチェック（createdAt保護）
    const existingDoc = await dayDocRef.get();
    const dayData: any = {
      dateKey,
      openMinute: day.openMinute,
      closeMinute: day.closeMinute,
      isClosed: day.isClosed,
      styleId: day.styleId || null,
      source: day.source || "auto",
      updatedAt: now,
    };
    
    if (!existingDoc.exists) {
      dayData.createdAt = now;
    }
    
    batch.set(dayDocRef, dayData, { merge: true });
    
    daysMap[dayStr] = {
      openMinute: day.openMinute,
      closeMinute: day.closeMinute,
      isClosed: day.isClosed,
      styleId: day.styleId || null,
      source: day.source || "auto",
    };
  }
  
  // businessHoursMonthlyMap を更新（createdAt保護）
  const mapDocRef = db.collection("businessHoursMonthlyMap").doc(yearMonth);
  const existingMapDoc = await mapDocRef.get();
  
  const mapData: any = {
    days: daysMap,
    updatedAt: now,
  };
  
  if (!existingMapDoc.exists) {
    mapData.createdAt = now;
  }
  
  batch.set(mapDocRef, mapData, { merge: true });
  
  return batch;
}

/**
 * shifts/{yearMonth}/days/{dateKey} を更新する共通ロジック
 * ⚠️ 重要: businessHours のみ更新し、シフト運用データ（assignments, pendingRequestCount等）は絶対に破壊しない
 * @param db Firestore instance
 * @param yearMonth YYYY-MM形式
 * @returns batch操作を含むPromise（呼び出し側でcommitする）
 */
export async function syncBusinessHoursToShifts(
  db: FirebaseFirestore.Firestore,
  yearMonth: string
): Promise<FirebaseFirestore.WriteBatch> {
  // businessHoursMonthlyMap を取得
  const mapDoc = await db.collection("businessHoursMonthlyMap").doc(yearMonth).get();
  
  if (!mapDoc.exists) {
    throw new HttpsError(
      "failed-precondition",
      `Business hours for ${yearMonth} must be initialized first.`
    );
  }
  
  const mapData = mapDoc.data();
  if (!mapData || !mapData.days) {
    throw new HttpsError("failed-precondition", `Business hours map for ${yearMonth} is empty`);
  }
  
  const daysMap = mapData.days as Record<
    string,
    { 
      openMinute: number; 
      closeMinute: number; 
      isClosed: boolean;
      styleId?: string;
      source?: "auto" | "manual";
    }
  >;
  
  // 年月の日数を計算
  const [year, month] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  
  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();
  
  // 1日から月末まで処理
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = day.toString().padStart(2, "0");
    const dateKey = `${yearMonth}-${dayStr}`;
    
    // 営業時間を取得（デフォルト値）
    const dayData = daysMap[dayStr] || {
      openMinute: 540, // 09:00
      closeMinute: 1320, // 22:00
      isClosed: false,
    };
    
    const dayDocRef = db.collection("shifts").doc(yearMonth).collection("days").doc(dateKey);
    const existingDoc = await dayDocRef.get();
    
    if (existingDoc.exists) {
      // ⚠️ 既存ドキュメント: businessHours のみ更新（他のフィールドは絶対に触らない）
      // assignments, pendingRequestCount, isFinalized, sufficientOverride, isSufficient は保持
      batch.update(dayDocRef, {
        "businessHours": {
          openMinute: dayData.openMinute,
          closeMinute: dayData.closeMinute,
          isClosed: dayData.isClosed,
          styleId: dayData.styleId || null,
          source: dayData.source || "auto",
        },
        updatedAt: now,
      });
    } else {
      // 新規作成: 初期値でドキュメント作成
      batch.set(dayDocRef, {
        yearMonth,
        dateKey,
        businessHours: {
          openMinute: dayData.openMinute,
          closeMinute: dayData.closeMinute,
          isClosed: dayData.isClosed,
          styleId: dayData.styleId || null,
          source: dayData.source || "auto",
        },
        assignments: [],
        pendingRequestCount: 0,
        isFinalized: false,
        sufficientOverride: null,
        isSufficient: false,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  
  return batch;
}
```

**注意点**:
- ⚠️ **重要1**: Callable間で内部呼び出し（HTTP経由）はしない。共通ロジックを純関数として抽出し、直接呼び出す
- ⚠️ **重要2**: `syncBusinessHoursToShifts` では、既存ドキュメントの場合は `batch.update()` で `businessHours` フィールドのみ更新。`assignments`, `pendingRequestCount`, `isFinalized`, `sufficientOverride`, `isSufficient` などのシフト運用データは絶対に更新しない
- 認証チェックは各Callableで行い、共通ロジックでは行わない

---

### Phase 5: 既存Callableのリファクタリング

#### 5.1 `initBusinessHoursForMonth` のリファクタリング
**ファイル**: `functions/src/shift/initBusinessHoursForMonth.ts`

**変更点**:
- `upsertBusinessHoursForMonth` 共通関数を使用するように変更
- 既存のロジックを共通関数に置き換え

---

### Phase 6: 新規Callableの実装（自動生成）

#### 6.1 `generateBusinessHoursForMonthFromStyles`
**ファイル**: `functions/src/shift/generateBusinessHoursForMonthFromStyles.ts`（新規作成）

**実装方針**:
1. 入力: `{ yearMonth, installationId, options?: { forceManualOverwrite?: boolean } }`
2. 認可: `assertAdminDevice`
3. 処理フロー:
   ```
   a) 対象月の全日を列挙（1日〜月末）
   b) 各日について:
      - Date オブジェクトを作成
      - 祝日判定 + 曜日判定で styleId を決定（determineStyleId）
      - styleId から open/close/isClosed を取得（getBusinessHoursByStyleId）
      - businessHoursMonthly/day を取得して source=="manual" かチェック
      - force=false かつ source=="manual" ならスキップ
      - そうでなければ days[] に追加（source="auto" を明示）
   c) upsertBusinessHoursForMonth 共通関数を呼び出し（days[] を渡す）
   d) syncBusinessHoursToShifts 共通関数を呼び出し（shifts に同期）
   ```

**注意点**:
- ⚠️ **重要**: `initBusinessHoursForMonth` Callableを内部呼び出ししない。`upsertBusinessHoursForMonth` 共通関数を直接呼び出す
- `forceManualOverwrite=true` の場合は `source=="manual"` でも上書き

#### 6.2 `generateBusinessHoursForYearFromStyles`
**ファイル**: `functions/src/shift/generateBusinessHoursForYearFromStyles.ts`（新規作成）

**実装方針**:
1. 入力: `{ year: number, installationId, options?: { forceManualOverwrite?: boolean } }`
2. 認可: `assertAdminDevice`
3. 処理フロー:
   ```
   a) 1月〜12月をループ
   b) 各月について generateBusinessHoursForMonthFromStyles と同等のコア処理を実行
      - ⚠️ Callable内部呼び出しはしない。共通ロジック（upsertBusinessHoursForMonth, syncBusinessHoursToShifts）を直接呼び出す
   c) タイムアウト対策: 月ごとにバッチ処理、必要に応じて分割
   ```

**注意点**:
- 12ヶ月分を一度に処理するとタイムアウトする可能性がある
- 月ごとに処理を分割するか、バッチ処理を検討

---

### Phase 7: 新規Callableの実装（手動編集）

#### 7.1 `setBusinessHoursManualForDay`
**ファイル**: `functions/src/shift/setBusinessHoursManualForDay.ts`（新規作成）

**実装方針**:
1. 入力: `{ dateKey, installationId, payload: { styleId, openMinute?, closeMinute?, isClosed? } }`
2. 認可: `assertAdminDevice`
3. 処理フロー:
   ```
   a) payload.styleId から営業時間を取得（getBusinessHoursByStyleId）
      - openMinute/closeMinute/isClosed が指定されていれば上書き
   b) businessHoursMonthly/{yearMonth}/days/{DD} を source="manual" で upsert
      - styleId も保存
   c) businessHoursMonthlyMap を差分更新（days.{DD} だけ merge update）
      - ⚠️ 全データを読み直して再構築する必要はない。該当日のフィールドだけ更新
      - または `upsertBusinessHoursForMonth` 共通関数を使用（該当日のみの配列を渡す）
   d) syncBusinessHoursToShifts 共通関数を呼び出して shifts に同期
   ```

**注意点**:
- `payload.openMinute/closeMinute` が指定されていない場合は `styleId` から取得
- `businessHoursMonthlyMap` の更新は差分更新が推奨（全データ読み直しはコストが高い）

---

### Phase 8: onScheduleトリガーの実装

#### 8.1 `scheduleGenerateNextYearBusinessHours`
**ファイル**: `functions/src/shift/scheduleGenerateNextYearBusinessHours.ts`（新規作成）

**実装方針**:
1. トリガー設定:
   ```typescript
   import { onSchedule } from "firebase-functions/v2/scheduler";
   
   export const scheduleGenerateNextYearBusinessHours = onSchedule({
     schedule: '0 3 1 1 *', // 毎年1月1日 03:00 JST
     timeZone: 'Asia/Tokyo',
   }, async (event) => {
     // 処理
   });
   ```

2. 処理フロー:
   ```
   a) 「翌年」を計算（実行年の次の年）
   b) generateBusinessHoursForYearFromStyles と同等のコア処理を実行
      - ⚠️ Callable内部呼び出しはしない。共通ロジック（upsertBusinessHoursForMonth, syncBusinessHoursToShifts）を直接呼び出す
      - forceManualOverwrite=false（manual保護）
   c) 月ごとに分割処理（タイムアウト回避）
   ```

**注意点**:
- `onSchedule` は `installationId` 認可なし（内部信頼実行）
- `assertAdminDevice` は不要
- タイムアウト対策: 月ごとに分割、必要に応じて Cloud Tasks 等を検討

---

### Phase 9: Functions側のエクスポート・登録

#### 9.1 エクスポートの追加
**ファイル**: `functions/src/shift/index.ts`

```typescript
export { generateBusinessHoursForMonthFromStyles } from './generateBusinessHoursForMonthFromStyles';
export { generateBusinessHoursForYearFromStyles } from './generateBusinessHoursForYearFromStyles';
export { setBusinessHoursManualForDay } from './setBusinessHoursManualForDay';
// scheduleGenerateNextYearBusinessHours は別途エクスポート（scheduler用）
```

#### 9.2 scheduler用のエクスポート
**ファイル**: `functions/src/index.ts` または専用ファイル

```typescript
export { scheduleGenerateNextYearBusinessHours } from './shift/scheduleGenerateNextYearBusinessHours';
```

---

### Phase 10: Flutter側のRepository拡張

#### 10.1 ShiftRepositoryにメソッド追加
**ファイル**: `lib/StaffDate/shift_repository.dart`

```dart
/// スタイルから営業時間を月単位で自動生成
Future<void> generateBusinessHoursForMonthFromStyles({
  required String yearMonth,
  bool forceManualOverwrite = false,
}) async {
  final installationId = await _getInstallationId();
  if (installationId == null) {
    throw Exception('Device not registered. InstallationId not found.');
  }
  
  final callable = _functions.httpsCallable('generateBusinessHoursForMonthFromStyles');
  await callable.call({
    'yearMonth': yearMonth,
    'installationId': installationId,
    'options': {
      'forceManualOverwrite': forceManualOverwrite,
    },
  });
}

/// スタイルから営業時間を年単位で自動生成
Future<void> generateBusinessHoursForYearFromStyles({
  required int year,
  bool forceManualOverwrite = false,
}) async {
  final installationId = await _getInstallationId();
  if (installationId == null) {
    throw Exception('Device not registered. InstallationId not found.');
  }
  
  final callable = _functions.httpsCallable('generateBusinessHoursForYearFromStyles');
  await callable.call({
    'year': year,
    'installationId': installationId,
    'options': {
      'forceManualOverwrite': forceManualOverwrite,
    },
  });
}

/// 特定日の営業時間を手動設定（スタイル選択）
Future<void> setBusinessHoursManualForDay({
  required String dateKey,
  required String styleId,
  int? openMinute,
  int? closeMinute,
  bool? isClosed,
}) async {
  final installationId = await _getInstallationId();
  if (installationId == null) {
    throw Exception('Device not registered. InstallationId not found.');
  }
  
  final callable = _functions.httpsCallable('setBusinessHoursManualForDay');
  await callable.call({
    'dateKey': dateKey,
    'installationId': installationId,
    'payload': {
      'styleId': styleId,
      if (openMinute != null) 'openMinute': openMinute,
      if (closeMinute != null) 'closeMinute': closeMinute,
      if (isClosed != null) 'isClosed': isClosed,
    },
  });
}
```

---

### Phase 11: Flutter側のUI拡張

#### 11.1 BusinessDayEditPageの拡張
**ファイル**: `lib/StaffDate/businessDayEditPage.dart`

**追加機能**:
1. 「当月/次月 自動生成」ボタン
   - `_repository.generateBusinessHoursForMonthFromStyles` を呼び出し
   - 成功後に `_loadBusinessHours()` でデータ再読み込み

2. 「年次 自動生成」ボタン
   - `_repository.generateBusinessHoursForYearFromStyles` を呼び出し
   - 確認ダイアログを表示（12ヶ月分生成するため）

3. 日別編集の拡張
   - styleId選択（weekday/weekendHoliday/closed等）を追加
   - 既存の時間編集は維持
   - 保存時に `_repository.setBusinessHoursManualForDay` を呼び出し

**UIデザイン**:
- 既存の「営業時間を保存」ボタンの上に自動生成ボタンを配置
- 日別編集では、スタイル選択ドロップダウンを追加

---

### Phase 12: テスト・検証

#### 12.1 単体テスト
1. 祝日判定のテスト
2. スタイル決定（平日/週末祝日）のテスト
3. manual保護（`source=="manual"` は上書きしない）のテスト

#### 12.2 統合テスト
1. `generateBusinessHoursForMonthFromStyles` を実行:
   - `businessHoursMonthly/day` と `map` が埋まる
   - `shifts/day` の `businessHours` が同期される
   - `styleId`, `source` が正しく保存される

2. `setBusinessHoursManualForDay` を実行:
   - `source="manual"`, `styleId` が保存される
   - 再度 month自動生成（`force=false`）しても上書きされない

3. `scheduleGenerateNextYearBusinessHours`:
   - 1月実行で翌年12ヶ月が生成される
   - manual保護が効く

4. 深夜跨ぎテスト:
   - `closeMinute>1440` のスタイルを1つ入れて、生成〜同期が壊れない

#### 12.3 エラーハンドリング
- 祝日ライブラリのエラー処理
- `styleId` が存在しない場合のエラー
- `businessHoursMonthlyMap` が存在しない場合のエラー

---

## 実装時の注意事項

### 1. 後方互換性
- 既存データに `styleId`/`source` がない場合も動作するようにする
- 読み取り時は `null` チェックしてデフォルト値を返す
- ⚠️ **重要**: `source == null` → `"auto"` 扱い（`"manual"` ではない）。既存データを manual 扱いすると、自動生成で上書きされなくなる

### 2. タイムアウト対策
- 年次生成（12ヶ月分）は時間がかかるため、月ごとに分割処理
- 必要に応じて Cloud Tasks や Pub/Sub を検討

### 3. データ整合性
- `businessHoursMonthlyMap` は常に `businessHoursMonthly` から再生成する
- `shifts` の `businessHours` は `businessHoursMonthlyMap` から同期する

### 4. manual保護の徹底
- `source=="manual"` は自動生成で上書きしない（`forceManualOverwrite=true` を除く）
- `setBusinessHoursManualForDay` では常に `source="manual"` を設定

### 5. シフト運用データの保護（最重要）
- ⚠️ **絶対ルール**: `syncBusinessHoursToShifts` 関数では、`businessHours` フィールドのみを更新する
- 既存ドキュメントの場合:
  - `batch.update()` で `businessHours` と `updatedAt` のみ更新
  - `assignments`, `pendingRequestCount`, `isFinalized`, `sufficientOverride`, `isSufficient` は**絶対に更新しない**
- 新規ドキュメントの場合のみ、初期値として上記フィールドを設定
- このルールにより、シフト申請・割当・確定などの運用データが営業時間更新で破壊されることを防止

### 5. 60分刻みの検証
- 入力時（`initBusinessHoursForMonth`, `setBusinessHoursManualForDay`）に検証
- スタイル定義も60分刻みであることを保証

---

## デプロイ順序

1. Phase 1-2: モデル・定数定義（既存機能に影響なし）
2. Phase 3: 既存Callable拡張（後方互換性を保持）
3. **Phase 4**: 共通ロジック抽出（重要：Callable内部呼び出しを避けるため）
4. **Phase 5**: 既存Callableのリファクタリング（共通ロジック使用）
5. Phase 6-7: 新規Callable実装（テスト）
6. Phase 8: onScheduleトリガー（テスト実行）
7. Phase 9: エクスポート登録
8. Phase 10-11: Flutter側実装
9. Phase 12: 統合テスト

## ChatGPTが指摘した重要な修正点（反映済み）

### ✅ 修正1: 既存データのデフォルト source="auto"
- 既存データで `source` が無い場合は `"auto"` 扱い
- `source == null` → `"auto"`（`"manual"` ではない）
- manual保護の対象は「明示的に manual と保存された日」に限定

### ✅ 修正2: createdAt を merge で上書きしない
- `createdAt` は新規作成時のみ設定
- 既存ドキュメントの場合は `doc.exists` チェックして分岐
- `businessHoursMonthlyMap` も同様

### ✅ 修正3: Callable内部呼び出しではなく共通ロジック化
- `initBusinessHoursForMonth` のロジックを `upsertBusinessHoursForMonth` 共通関数に抽出
- `initShiftDaysForMonth` のロジックを `syncBusinessHoursToShifts` 共通関数に抽出
- 新規Callableは共通関数を直接呼び出す（Callable間のHTTP呼び出しはしない）

### ✅ 追加修正: businessHoursMonthlyMap の差分更新
- `setBusinessHoursManualForDay` では、該当日のフィールドだけ更新（全データ読み直しを避ける）

---

## 参考資料

- 既存のスキーマ: `docs/business_hours_collections_documentation.md`
- onSchedule例: `functions/src/attendance/monthlyPayrollTrigger.ts`
- 営業時間の管理方法: `functions/src/shift/initBusinessHoursForMonth.ts`