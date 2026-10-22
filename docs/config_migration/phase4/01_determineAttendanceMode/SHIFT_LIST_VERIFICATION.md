# シフト一覧「該当日のシフトはありません」の原因確認

## 1. 現象

3/15 にシフトデータが Firestore に存在するにもかかわらず、勤怠管理の「シフト一覧」タブで「該当日のシフトはありません」と表示される。

---

## 2. 実際の Firestore データ構造

### 現在の構造（実装・ドキュメントと一致）

```
shifts (コレクション)
  └── 2026-03 (ドキュメント ID = yearMonth)
        └── days (サブコレクション)
              └── 2026-03-15 (ドキュメント ID = dateKey)
                    ├── dateKey: "2026-03-15"
                    ├── yearMonth: "2026-03"
                    ├── assignments: [
                    │     { staffId, staffName, startMinute, endMinute, sourceRequestId }
                    │   ]
                    ├── businessHours: { openMinute, closeMinute, isClosed }
                    ├── isFinalized: false
                    └── ...
```

- トップレベルは `shifts` コレクション
- ドキュメント ID は `yearMonth`（例: `2026-03`）
- 日別データは `shifts/{yearMonth}/days/{dateKey}` のサブコレクション
- 各日ドキュメントに `assignments` 配列でスタッフ割当を保持
- `date` や `status` のような単体フィールドは持たない

---

## 3. シフト一覧タブのクエリ（現状の実装）

`lib/AttendanceManagement/staff_attendance_page_from_terminalHome.dart` の `_ShiftListContent`:

```dart
FirebaseFirestore.instance
    .collection('shifts')           // ← トップレベル shifts を参照
    .where('date', isEqualTo: shiftDate)
    .where('status', isEqualTo: 'approved')
    .snapshots()
```

### このクエリが前提としている構造

- `shifts` はトップレベルのみのフラットなコレクション
- 各ドキュメントに `date` フィールドがある
- 各ドキュメントに `status` フィールドがある（例: `'approved'`）
- 1 ドキュメント = 1 スタッフの 1 シフト

---

## 4. 原因：データモデルの不一致

| 項目 | シフト一覧タブが期待する構造 | 実際の Firestore 構造 |
|------|-----------------------------|------------------------|
| パス | `shifts` 直下のドキュメント | `shifts/{yearMonth}/days/{dateKey}`（サブコレクション） |
| 日付 | `date` フィールド | `dateKey` フィールド（ドキュメント ID も dateKey） |
| 確定状態 | `status: 'approved'` | `status` なし（`isFinalized` や `assignments` の有無で判断） |
| スタッフ割当 | 1 ドキュメント = 1 スタッフ | 1 ドキュメント = 1 日、`assignments` 配列で複数スタッフ |

したがって、現状のクエリでは **存在しないフィールド・存在しない場所** を参照しており、ヒットしない。

---

## 5. 他機能での正しい参照方法

`functions/src/domains/staff/callables/getShifts.ts` などでは、次のように正しく参照している。

```ts
const shiftsDocRef = db.collection("shifts").doc(yearMonth);
const daysSnapshot = await shiftsDocRef.collection("days").get();
// 各 dayDoc: dayDoc.id = dateKey, dayDoc.data().assignments = 割当配列
```

日付ごとのシフトを取得する場合は:

```ts
const yearMonth = dateKey.substring(0, 7);  // "2026-03-15" → "2026-03"
const dayDoc = await db.collection("shifts").doc(yearMonth).collection("days").doc(dateKey).get();
const assignments = dayDoc.data()?.assignments ?? [];
```

---

## 6. getStaffListForAttendance の整合性

`functions/src/domains/attendance/callables/getStaffListForAttendance.ts` も同じ誤ったクエリを使用している:

```ts
const shiftsSnapshot = await admin.firestore()
  .collection('shifts')
  .where('date', '==', shiftDate)
  .where('status', '==', 'approved')
  .get();
```

こちらも実際の構造と一致しておらず、正しくデータを取得できていない可能性が高い。

---

## 7. 結論

| 項目 | 内容 |
|------|------|
| 原因 | シフト一覧タブが想定する Firestore 構造と、実際の `shifts/{yearMonth}/days/{dateKey}` 構造が異なる |
| データ側 | 指定のデータ構造は一貫しており、`shifts/2026-03/days/2026-03-15` に期待どおりのデータが存在する |
| アプリ側 | `shifts` をフラットに扱い、`date` と `status` で検索していることが不整合の原因 |

---

## 8. 修正の方向性

シフト一覧タブでは、次のように取得方法を変更する必要がある。

1. `shiftDate`（例: `"2026-03-15"`）から `yearMonth` を算出（例: `"2026-03"`）
2. `shifts/{yearMonth}/days/{dateKey}` のドキュメントを直接取得
3. 取得したドキュメントの `assignments` からスタッフごとのシフト情報を生成
4. `startMinute` / `endMinute` を `"HH:MM"` 形式に変換して表示

同様のロジックは `getStaffListForAttendance` にも適用する必要がある。

---

## 9. 実施済み修正（2026-03）

`_ShiftListContent` を次のように修正済み。

1. `shiftDate` から `yearMonth` を算出（`shiftDate.substring(0, 7)`）
2. `shifts/{yearMonth}/days/{shiftDate}` のドキュメントを `snapshots()` で購読
3. `assignments` 配列から各スタッフの `staffId`, `staffName`, `startMinute`, `endMinute` を取得
4. `startMinute` / `endMinute` を `_minuteToTime()` で `"HH:MM"` 形式に変換して表示
5. 勤怠状態は従来どおり `attendances` コレクション（`date` = shiftDate）から取得

※ 日付ごとのシフトを取得する別ページは一旦実装しない。
