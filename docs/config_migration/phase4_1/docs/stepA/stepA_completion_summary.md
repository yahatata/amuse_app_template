# 4.1-A 完了サマリ

**対象**: config 夜間労働時間追加、旧 Callable unused 移管  
**CHANGESPEC**: [../phase_A/CHANGESPEC.md](../phase_A/CHANGESPEC.md)  
**VERIFICATION**: [../phase_A/VERIFICATION.md](../phase_A/VERIFICATION.md)

---

## 変更後どうなったか（後続 step 参照用）

### 1. config 夜間労働時間

| ファイル | 変更後 |
|----------|--------|
| `functions/src/shared/config/defaults.ts` | `DEFAULT_NIGHT_WORK_START_HOUR = 22`, `DEFAULT_NIGHT_WORK_END_HOUR = 5` を追加（payroll セクション直後） |
| `functions/src/shared/config/types.ts` | StoreConfig に `attendance?: { nightWorkStartHour?: number; nightWorkEndHour?: number }` を追加 |
| `functions/src/shared/config/configLoader.ts` | buildFromDefaults に `attendance: { nightWorkStartHour, nightWorkEndHour }` を追加。mergeWithDefaults に raw.attendance のマージを追加。mergeConfigForUpsert に attendance の補完を追加 |

**取得方法**: `getStoreConfig()` で取得した config の `config.attendance?.nightWorkStartHour`, `config.attendance?.nightWorkEndHour` で参照。未設定時は defaults にフォールバック（22, 5）。

### 2. 旧 Callable の unused 移管

| ファイル | 変更後 |
|----------|--------|
| `functions/src/domains/attendance/callables/createClockInRecord.ts` | **削除** |
| `functions/src/domains/attendance/callables/updateClockOutRecord.ts` | **削除** |
| `functions/src/unused_function_lib/createClockInRecord.ts` | **新規**。`[UNUSED - Phase4.1]` ヘッダー、実装コードは UNUSED_BLOCK でコメントアウト |
| `functions/src/unused_function_lib/updateClockOutRecord.ts` | **新規**。同上 |
| `functions/src/domains/attendance/index.ts` | createClockInRecord, updateClockOutRecord の export を削除。clockIn, clockOut は継続 export |

### 3. Dart

| ファイル | 変更後 |
|----------|--------|
| `lib/AttendanceManagement/attendanceService.dart` | createClockInRecord メソッド、updateClockOutRecord メソッドを削除。clockIn, clockOut は継続 |

---

## 4.1-B 以降で参照する際のポイント

- **config 夜間労働時間**: `config.attendance?.nightWorkStartHour ?? 22`, `config.attendance?.nightWorkEndHour ?? 5` で取得。4.1-B の nightWorkMinutes 算出で使用
- **出退勤**: clockIn, clockOut を使用。createClockInRecord, updateClockOutRecord は存在しない
