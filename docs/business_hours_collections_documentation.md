# 営業日関連コレクションの関係性・作成方法・スキーマ

## 概要

シフト管理システムでは、営業時間（開始時刻・終了時刻・休業日フラグ）を管理するために、以下の3つのコレクション構造を使用しています。

1. **`businessHoursMonthly`** - SSoT（Single Source of Truth）として使用
2. **`businessHoursMonthlyMap`** - キャッシュ/マップとして使用（高速検索用）
3. **`shifts`** - シフト管理情報と一緒に営業時間も保存

---

## 1. businessHoursMonthly コレクション

### 目的
営業時間の**信頼できる唯一の情報源（SSoT）**として機能します。個別の日付ごとにドキュメントとして保存されます。

### 構造

```
businessHoursMonthly/
  └── {YYYY-MM}/             例: "2026-02"
      └── days/
          ├── {DD}           例: "01", "02", ..., "28"（または"29"）
          ├── {DD}
          └── ...
```

### ドキュメントスキーマ

**パス**: `businessHoursMonthly/{YYYY-MM}/days/{DD}`

**例**: `businessHoursMonthly/2026-02/days/17`

| フィールド名 | 型 | 説明 | 例 |
|------------|-----|------|-----|
| `dateKey` | `string` | 日付キー（YYYY-MM-DD形式） | `"2026-02-17"` |
| `openMinute` | `number` | 開店時刻（0:00からの分数） | `540` (09:00) |
| `closeMinute` | `number` | 閉店時刻（0:00からの分数） | `1320` (22:00) |
| `isClosed` | `boolean` | 休業日フラグ | `false` |
| `createdAt` | `Timestamp` | 作成日時 | `Firestore Timestamp` |
| `updatedAt` | `Timestamp` | 更新日時 | `Firestore Timestamp` |

### 作成方法

`initBusinessHoursForMonth` Cloud Function によって作成・更新されます。

**Cloud Function**: `functions/src/shift/initBusinessHoursForMonth.ts`

```typescript
// 入力データの形式
interface InitBusinessHoursForMonthRequest {
  yearMonth: string; // "YYYY-MM" 例: "2026-02"
  installationId: string;
  days: Array<{
    day: number; // 1-31
    openMinute: number;
    closeMinute: number;
    isClosed: boolean;
  }>;
}

// 処理内容
// 1. 各日のドキュメントを businessHoursMonthly/{YYYY-MM}/days/{DD} に upsert
// 2. businessHoursMonthlyMap/{YYYY-MM} を同時に再生成
```

### 使用例

```typescript
// 作成されるドキュメント例
// businessHoursMonthly/2026-02/days/17
{
  dateKey: "2026-02-17",
  openMinute: 540,      // 09:00
  closeMinute: 1320,    // 22:00
  isClosed: false,
  createdAt: Timestamp(...),
  updatedAt: Timestamp(...)
}
```

---

## 2. businessHoursMonthlyMap コレクション

### 目的
営業時間の**キャッシュ/マップ**として機能します。月単位で全日の営業時間を1つのドキュメントにまとめて保存し、高速検索を可能にします。

### 構造

```
businessHoursMonthlyMap/
  ├── {YYYY-MM}        例: "2026-02"
  ├── {YYYY-MM}        例: "2026-03"
  └── ...
```

### ドキュメントスキーマ

**パス**: `businessHoursMonthlyMap/{YYYY-MM}`

**例**: `businessHoursMonthlyMap/2026-02`

| フィールド名 | 型 | 説明 | 例 |
|------------|-----|------|-----|
| `days` | `Map<string, object>` | 日付（"01"〜"31"）をキーとした営業時間マップ | 下記参照 |
| `days.{DD}.openMinute` | `number` | 開店時刻（0:00からの分数） | `540` |
| `days.{DD}.closeMinute` | `number` | 閉店時刻（0:00からの分数） | `1320` |
| `days.{DD}.isClosed` | `boolean` | 休業日フラグ | `false` |
| `createdAt` | `Timestamp` | 作成日時 | `Firestore Timestamp` |
| `updatedAt` | `Timestamp` | 更新日時 | `Firestore Timestamp` |

### 作成方法

`initBusinessHoursForMonth` Cloud Function によって、`businessHoursMonthly` と同時に再生成されます。

```typescript
// businessHoursMonthly の各日を処理しながら、daysMap を構築
const daysMap: Record<string, { openMinute: number; closeMinute: number; isClosed: boolean }> = {};

for (const day of days) {
  const dayStr = day.day.toString().padStart(2, "0"); // "1" -> "01"
  
  // businessHoursMonthly に保存
  // ...
  
  // daysMap に追加
  daysMap[dayStr] = {
    openMinute: day.openMinute,
    closeMinute: day.closeMinute,
    isClosed: day.isClosed,
  };
}

// businessHoursMonthlyMap に一括保存
batch.set(
  db.collection("businessHoursMonthlyMap").doc(yearMonth),
  { days: daysMap, createdAt: now, updatedAt: now },
  { merge: true }
);
```

### 使用例

```typescript
// 作成されるドキュメント例
// businessHoursMonthlyMap/2026-02
{
  days: {
    "01": {
      openMinute: 540,
      closeMinute: 1320,
      isClosed: false
    },
    "02": {
      openMinute: 540,
      closeMinute: 1320,
      isClosed: false
    },
    // ...
    "17": {
      openMinute: 540,
      closeMinute: 1320,
      isClosed: false
    },
    // ...
    "28": {
      openMinute: 540,
      closeMinute: 1320,
      isClosed: false
    }
  },
  createdAt: Timestamp(...),
  updatedAt: Timestamp(...)
}
```

### 読み取り方法

**Flutter側（lib/StaffDate/shift_repository.dart）**:

```dart
Future<Map<String, BusinessHours>> getBusinessHoursForMonth(String yearMonth) async {
  final doc = await _firestore
      .collection('businessHoursMonthlyMap')
      .doc(yearMonth)
      .get();
  
  if (!doc.exists) {
    return {};
  }
  
  final data = doc.data()!;
  final days = data['days'] as Map<String, dynamic>? ?? {};
  final result = <String, BusinessHours>{};
  
  for (final entry in days.entries) {
    final dayStr = entry.key; // "01", "02", ...
    final dayData = entry.value as Map<String, dynamic>;
    final dateKey = '$yearMonth-${dayStr.padLeft(2, '0')}'; // "2026-02-17"
    result[dateKey] = _parseBusinessHours(dayData);
  }
  
  return result;
}
```

**Cloud Functions側（functions/src/shift/helpers.ts）**:

```typescript
export async function getBusinessHoursFromMap(
  yearMonth: string,
  dateKey: string
): Promise<{ openMinute: number; closeMinute: number; isClosed: boolean }> {
  const mapDoc = await db.collection("businessHoursMonthlyMap").doc(yearMonth).get();
  
  if (!mapDoc.exists) {
    throw new HttpsError(
      "failed-precondition",
      `Business hours for ${yearMonth} must be initialized first.`
    );
  }
  
  const daysMap = mapDoc.data()!.days as Record<
    string,
    { openMinute: number; closeMinute: number; isClosed: boolean }
  >;
  
  // dateKeyから日を抽出（例: "2026-02-17" -> "17"）
  const dayStr = dateKey.split("-")[2];
  
  const dayData = daysMap[dayStr];
  if (!dayData) {
    // デフォルト値
    return {
      openMinute: 540,   // 09:00
      closeMinute: 1320, // 22:00
      isClosed: false,
    };
  }
  
  return dayData;
}
```

---

## 3. shifts コレクション

### 目的
シフト管理情報（スタッフ割当、未処理申請数、最終確定フラグなど）と一緒に**営業時間も保存**します。営業時間は `businessHoursMonthlyMap` から取得して設定されます。

### 構造

```
shifts/
  └── {YYYY-MM}/             例: "2026-02"
      └── days/
          ├── {YYYY-MM-DD}   例: "2026-02-01"
          ├── {YYYY-MM-DD}   例: "2026-02-02"
          └── ...
```

### ドキュメントスキーマ

**パス**: `shifts/{YYYY-MM}/days/{YYYY-MM-DD}`

**例**: `shifts/2026-02/days/2026-02-17`

| フィールド名 | 型 | 説明 | 例 |
|------------|-----|------|-----|
| `yearMonth` | `string` | 年月（YYYY-MM形式） | `"2026-02"` |
| `dateKey` | `string` | 日付キー（YYYY-MM-DD形式） | `"2026-02-17"` |
| `businessHours` | `object` | 営業時間情報 | 下記参照 |
| `businessHours.openMinute` | `number` | 開店時刻（0:00からの分数） | `540` |
| `businessHours.closeMinute` | `number` | 閉店時刻（0:00からの分数） | `1320` |
| `businessHours.isClosed` | `boolean` | 休業日フラグ | `false` |
| `assignments` | `Array<object>` | スタッフのシフト割当リスト | 下記参照 |
| `assignments[].staffId` | `string` | スタッフID | `"staff123"` |
| `assignments[].staffName` | `string` | スタッフ名 | `"山田太郎"` |
| `assignments[].startMinute` | `number` | 開始時刻（0:00からの分数） | `540` |
| `assignments[].endMinute` | `number` | 終了時刻（0:00からの分数） | `1080` |
| `assignments[].sourceRequestId` | `string?` | 元の申請ID（オプション） | `"staff123_2026-02-17"` |
| `pendingRequestCount` | `number` | 未処理申請数 | `3` |
| `isFinalized` | `boolean` | 最終確定フラグ | `false` |
| `sufficientOverride` | `boolean?` | 手動充足フラグ（オプション） | `null` |
| `isSufficient` | `boolean` | 自動判定の充足フラグ | `false` |
| `createdAt` | `Timestamp` | 作成日時 | `Firestore Timestamp` |
| `updatedAt` | `Timestamp` | 更新日時 | `Firestore Timestamp` |

### 作成方法

`initShiftDaysForMonth` Cloud Function によって作成・更新されます。

**Cloud Function**: `functions/src/shift/initShiftDaysForMonth.ts`

```typescript
// 入力データの形式
interface InitShiftDaysForMonthRequest {
  yearMonth: string; // "YYYY-MM"
  installationId: string;
}

// 処理内容
// 1. businessHoursMonthlyMap から営業時間を取得
// 2. 1日から月末まで、shifts/{YYYY-MM}/days/{YYYY-MM-DD} を作成または更新
//    - 新規作成: 全フィールドを初期化
//    - 既存更新: businessHours のみ更新（assignments等は保持）
```

### 使用例

```typescript
// 新規作成時のドキュメント例
// shifts/2026-02/days/2026-02-17
{
  yearMonth: "2026-02",
  dateKey: "2026-02-17",
  businessHours: {
    openMinute: 540,      // 09:00
    closeMinute: 1320,    // 22:00
    isClosed: false
  },
  assignments: [],
  pendingRequestCount: 0,
  isFinalized: false,
  sufficientOverride: null,
  isSufficient: false,
  createdAt: Timestamp(...),
  updatedAt: Timestamp(...)
}

// 既存ドキュメント更新時の例
// assignments や pendingRequestCount は保持される
{
  // ...既存フィールドはそのまま...
  businessHours: {
    openMinute: 600,      // 10:00（更新）
    closeMinute: 1320,    // 22:00（更新）
    isClosed: false
  },
  updatedAt: Timestamp(...) // 更新日時のみ更新
}
```

---

## 関係性の図

```
┌─────────────────────────────────────────────────────────────┐
│                    営業時間のデータフロー                       │
└─────────────────────────────────────────────────────────────┘

1. 営業時間の設定・更新
   ↓
   [initBusinessHoursForMonth Cloud Function]
   ↓
   ├─→ businessHoursMonthly/{YYYY-MM}/days/{DD}  (SSoT)
   │   └─ 個別の日付ごとのドキュメント
   │
   └─→ businessHoursMonthlyMap/{YYYY-MM}  (キャッシュ)
       └─ 月単位の全データをまとめたマップ

2. シフト日の初期化
   ↓
   [initShiftDaysForMonth Cloud Function]
   ↓
   businessHoursMonthlyMap/{YYYY-MM} を参照
   ↓
   shifts/{YYYY-MM}/days/{YYYY-MM-DD}
   └─ businessHours フィールドに営業時間を保存

3. 営業時間の読み取り
   ├─ Flutter側: businessHoursMonthlyMap から読み取り（高速）
   └─ Cloud Functions側: businessHoursMonthlyMap または shifts から読み取り
```

---

## データの整合性

### 同期の仕組み

1. **営業時間の更新時**:
   - `initBusinessHoursForMonth` が `businessHoursMonthly` と `businessHoursMonthlyMap` を**同時に**更新（batch書き込み）

2. **シフト日の初期化時**:
   - `initShiftDaysForMonth` が `businessHoursMonthlyMap` を参照して `shifts` に営業時間をコピー

3. **データの不整合を避ける**:
   - `businessHoursMonthly` が SSoT として機能
   - `businessHoursMonthlyMap` は `businessHoursMonthly` から常に再生成される
   - `shifts` の営業時間は `businessHoursMonthlyMap` から取得される

### 注意点

- `businessHoursMonthlyMap` は**手動で編集しない**（常に `initBusinessHoursForMonth` で再生成）
- `shifts` の `businessHours` は `initShiftDaysForMonth` 実行時に更新される
- 営業時間を変更した場合は、必ず `initBusinessHoursForMonth` を実行し、必要に応じて `initShiftDaysForMonth` も実行する

---

## 時刻の表現方法

### 分数形式

すべての時刻は**0:00からの分数**で表現されます。

| 時刻 | 分数 | 計算方法 |
|------|------|----------|
| 00:00 | `0` | `0 * 60 + 0` |
| 09:00 | `540` | `9 * 60 + 0` |
| 12:30 | `750` | `12 * 60 + 30` |
| 22:00 | `1320` | `22 * 60 + 0` |
| 23:59 | `1439` | `23 * 60 + 59` |

### 変換関数（例）

**TypeScript**:
```typescript
// 分数 → HH:MM 文字列
function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

// HH:MM 文字列 → 分数
function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}
```

**Dart**:
```dart
// 分数 → HH:MM 文字列
String formatMinutes(int minutes) {
  final hours = minutes ~/ 60;
  final mins = minutes % 60;
  return '${hours.toString().padLeft(2, '0')}:${mins.toString().padLeft(2, '0')}';
}

// TimeOfDay → 分数
int timeOfDayToMinutes(TimeOfDay time) {
  return time.hour * 60 + time.minute;
}
```

---

## 初期化の手順

### 1. 営業時間の初期化

**Flutter側（lib/StaffDate/businessDayEditPage.dart）**:
```dart
await _repository.initBusinessHoursForMonth(
  yearMonth: '2026-02',
  days: [
    {
      'day': 1,
      'openMinute': 540,    // 09:00
      'closeMinute': 1320,  // 22:00
      'isClosed': false,
    },
    // ...他の日も同様に...
  ],
);
```

**結果**:
- `businessHoursMonthly/2026-02/days/01` が作成/更新される
- `businessHoursMonthlyMap/2026-02` が作成/更新される

### 2. シフト日の初期化

**Flutter側（lib/StaffDate/businessDayEditPage.dart）**:
```dart
await _repository.initShiftDaysForMonth('2026-02');
```

**結果**:
- `businessHoursMonthlyMap/2026-02` を参照
- `shifts/2026-02/days/2026-02-01` 〜 `2026-02-28`（または29）が作成/更新される
- 既存のドキュメントがある場合は `businessHours` のみ更新（`assignments` 等は保持）

---

## まとめ

1. **`businessHoursMonthly`**: SSoTとして個別の日付ごとに保存
2. **`businessHoursMonthlyMap`**: キャッシュとして月単位でまとめて保存（高速検索用）
3. **`shifts`**: シフト管理情報と一緒に営業時間も保存（営業時間は `businessHoursMonthlyMap` から取得）

すべての営業時間の更新は `initBusinessHoursForMonth` を通じて行われ、`businessHoursMonthly` と `businessHoursMonthlyMap` が同時に更新されます。シフト日の初期化時には `businessHoursMonthlyMap` を参照して `shifts` に営業時間をコピーします。