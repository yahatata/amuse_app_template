# 4.1-D 完了サマリ

**対象**: 退勤系 Callable の休憩対応  
**CHANGESPEC**: [../phase_D/CHANGESPEC.md](../phase_D/CHANGESPEC.md)

---

## 変更後どうなったか（後続 step 参照用）

### 1. 新規ヘルパー追加

| ファイル | 内容 |
|----------|------|
| `functions/src/domains/attendance/helpers/recalculateAttendanceFromBreaks.ts` | endActiveBreaksForClockOut(attendanceRef, endTimestamp) を追加。endedAt: null の break を自動終了し、親の isOnBreak, currentBreakStartedAt を更新 |

### 2. 退勤系 3 Callable の変更

| 関数 | 変更内容 |
|------|----------|
| clockOut | 退勤処理前に endActiveBreaksForClockOut を呼び、退勤時刻設定後に recalculateAttendanceFromBreaks で親を更新。totalMinutes, nightMinutes は後続 update で設定 |
| updateManualClockOutRecord | 同上 |
| updateUnclockedAttendanceWithAuth | 同上 |

### 3. 処理フロー

1. adjustedClockOut / resolvedClockOut 算出
2. endActiveBreaksForClockOut（休憩中なら break を終了）
3. clockOut を attendance に設定
4. recalculateAttendanceFromBreaks（breakMinutes, actualWorkMinutes, nightWorkMinutes を算出・更新）
5. totalMinutes, nightMinutes, lastActionType, lastActionAt, lastActionByDeviceId を更新
6. writeAttendanceLog

---

## 4.1-E 以降で参照する際のポイント

- 休憩中退勤時は endActiveBreaksForClockOut → recalculateAttendanceFromBreaks の順で処理
- approveAttendanceCorrectionRequest（4.1-E2）でも同様の親再集計パターンを使用
