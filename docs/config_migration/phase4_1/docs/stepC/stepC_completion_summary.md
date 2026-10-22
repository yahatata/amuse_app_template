# 4.1-C 完了サマリ

**対象**: breaks サブコレ、startBreak / endBreak、親再集計ヘルパー  
**CHANGESPEC**: [../phase_C/CHANGESPEC.md](../phase_C/CHANGESPEC.md)

---

## 変更後どうなったか（後続 step 参照用）

### 1. 新規ヘルパー

| ファイル | 内容 |
|----------|------|
| `functions/src/domains/attendance/helpers/recalculateAttendanceFromBreaks.ts` | recalculateAttendanceFromBreaks(attendanceRef, attendanceData, config) → breakMinutes, actualWorkMinutes, nightWorkMinutes を breaks から再計算し親を更新 |

### 2. 新規 Callable

| 関数 | 引数 | 戻り値 |
|------|------|--------|
| startBreak | { attendanceId } | { success, breakId, message } |
| endBreak | { attendanceId, breakId } | { success, message } |

### 3. breaks サブコレ構造

`attendances/{attendanceId}/breaks/{breakId}`

- startedAt, endedAt（休憩中は null）, isDeleted, deletedAt, createdAt, updatedAt

### 4. clockOut 挿入箇所

退勤処理の直前（警告チェックの前）にコメントを追加。4.1-D で休憩自動終了ロジックを実装する。

### 5. attendanceLogs actionType 追加

- start_break (startBreak)
- end_break (endBreak)

### 6. Firestore インデックス

- breaks の `orderBy('startedAt')`: 単一フィールドのため自動インデックスで対応（明示的追加不要）

### 7. テストファイル

| ファイル | 内容 |
|----------|------|
| `__tests__/config_migration/phase4_1C/startBreak.spec.ts` | startBreak の認証・通常・エラーケース |
| `__tests__/config_migration/phase4_1C/endBreak.spec.ts` | endBreak の認証・通常・エラーケース |

**実行**: `firebase emulators:exec --only firestore 'cd functions && npm test -- __tests__/config_migration/phase4_1C --runInBand'`

---

## 4.1-D 以降で参照する際のポイント

- 親再集計ヘルパーは recalculateAttendanceFromBreaks を使用。clockOut, updateManualClockOutRecord, updateUnclockedAttendanceWithAuth で休憩中退勤時に呼び出す
- clockOut の挿入箇所は「【4.1-D 挿入箇所】」で検索可能
- breaks の論理削除ロジックは 4.1-E の updateAttendance で実装
