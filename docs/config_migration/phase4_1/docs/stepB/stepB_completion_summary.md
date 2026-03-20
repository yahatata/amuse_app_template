# 4.1-B 完了サマリ

**対象**: attendances 親フィールド追加、nightWorkMinutes 算出、attendanceLogs  
**CHANGESPEC**: [../phase_B/CHANGESPEC.md](../phase_B/CHANGESPEC.md)

---

## 変更後どうなったか（後続 step 参照用）

### 1. 新規ヘルパー

| ファイル | 内容 |
|----------|------|
| `functions/src/domains/attendance/helpers/attendanceLogs.ts` | writeAttendanceLog(db, attendanceId, actionType, performedByUid?, performedByDeviceId?) |
| `functions/src/domains/attendance/helpers/nightWorkMinutes.ts` | calculateNightWorkMinutes(clockIn, clockOut, nightWorkStartHour, nightWorkEndHour) |

### 2. attendances 新フィールド（作成時）

breakMinutes: 0, actualWorkMinutes: null, nightWorkMinutes: 0, isOnBreak: false, currentBreakStartedAt: null, breakCount: 0, lastActionType, lastActionAt, lastActionByDeviceId, manualReason: null, payrollReflectedAt: null, isDeleted: false, deletedAt: null, deletedBy: null

### 3. 退勤時更新フィールド

actualWorkMinutes, nightWorkMinutes, lastActionType: 'clock_out', lastActionAt, lastActionByDeviceId。nightWorkMinutes は config.attendance の nightWorkStartHour, nightWorkEndHour から算出（デフォルト 22, 5）。

### 4. attendanceLogs actionType

- clock_in (clockIn)
- create_manual_clock_in (createManualClockInRecord)
- clock_out (clockOut)
- update_manual_clock_out (updateManualClockOutRecord)
- password_clock_out (updateUnclockedAttendanceWithAuth)
- approve_correction_request (approveAttendanceCorrectionRequest)

### 5. getStaffAttendance / getAllStaffAttendance

- getStaffAttendance: isDeleted === true を除外。breakMinutes, actualWorkMinutes, nightWorkMinutes を返却（既存データは totalMinutes/nightMinutes をフォールバック）
- getAllStaffAttendance: breakMinutes, actualWorkMinutes, nightWorkMinutes, isDeleted を返却

---

## 4.1-C 以降で参照する際のポイント

- 親再集計ヘルパー（4.1-C）は breaks から breakMinutes, actualWorkMinutes, nightWorkMinutes を再計算する。4.1-B では休憩なしのため actualWorkMinutes = totalMinutes, nightWorkMinutes = 算出値
- attendanceLogs は attendanceLogs コレクションに追加。storeId は不要
