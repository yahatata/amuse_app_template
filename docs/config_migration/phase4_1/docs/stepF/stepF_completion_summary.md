# 4.1-F 完了サマリ

**対象**: UI 改修、seedAttendancesDemo、monthlyPayrollTrigger  
**CHANGESPEC**: [../phase_F/CHANGESPEC.md](../phase_F/CHANGESPEC.md)

---

## 変更後どうなったか（後続 step 参照用）

### 1. monthlyPayrollTrigger

- **時間フィールド**: 新規（actualWorkMinutes, nightWorkMinutes あり）はそれを使用。既存（なし）は totalMinutes, nightMinutes を継続使用
- **論理削除**: isDeleted: true の attendance を給与計算対象外
- **payrollReflectedAt**: 給与計算対象にした attendance に `{periodStartStr}-{periodEndStr}` 形式で付与
- **attendanceLogs**: 各対象 attendance に actionType: 'monthly_payroll_reflect' を書き込み

### 2. seedAttendancesDemo

- **新フィールド**: breakMinutes, actualWorkMinutes, nightWorkMinutes, isOnBreak, currentBreakStartedAt, breakCount, lastActionType, lastActionAt, lastActionByDeviceId, manualReason, payrollReflectedAt, isDeleted, deletedAt, deletedBy
- **休憩サンプル**: 退勤済み 1 件に breaks サブコレ（12:00-13:00）を追加
- **論理削除サンプル**: 1 件を isDeleted: true, deletedAt, deletedBy: 'admin' で作成
- **件数**: 勤務中 4 件 + 退勤済み 3 件 + 論理削除 1 件 = 8 件

### 3. attendanceService

- **startBreak(attendanceId)**: startBreak Callable を呼ぶ
- **endBreak(attendanceId, breakId)**: endBreak Callable を呼ぶ
- **endBreakForAttendance(attendanceId)**: 休憩中 break（endedAt: null）を取得して endBreak を呼ぶ

### 4. staff_attendance_page_from_terminalHome

- **論理削除除外**: Firestore stream の docs を isDeleted != true でフィルタ
- **勤務状況**: 休憩中（isOnBreak）の場合は「休憩中」表示、オレンジ背景
- **実働/休憩列**: actualWorkMinutes ?? totalMinutes と breakMinutes を "実働/休憩" 形式で表示
- **休憩操作**: 勤務中かつ休憩中でない場合に「休憩開始」ボタン。休憩中に「休憩終了」ボタン

### 5. admin_attendance_list_page

- **休憩中表示**: isOnBreak の場合は「休憩中」、オレンジ背景
- **実働・休憩・深夜**: 実働分、休憩分、深夜分を subtitle に追加

### 6. staff_attendance_detail_page_from_allStaffAttendance

- **時間表示**: actualWorkMinutes ?? totalMinutes、nightWorkMinutes ?? nightMinutes を使用
- **_calculateTotalHours / _calculateTotalNightHours**: 同上

### 7. attendanceDetailPage

- **_getWorkHours / _getNightTimeHours**: actualWorkMinutes ?? totalMinutes、nightWorkMinutes ?? nightMinutes を使用

### 8. public/staff/index.html

- **勤務時間・深夜時間**: actualWorkMinutes ?? totalMinutes、nightWorkMinutes ?? nightMinutes で表示
- **論理削除**: isDeleted の場合「削除済み」を表示

### 9. テストファイル

| ファイル | 内容 |
|----------|------|
| `__tests__/config_migration/phase4_1F/monthlyPayrollTrigger.spec.ts` | actualWorkMinutes/totalMinutes 切り替え、論理削除除外、attendanceLogs |

**実行**: `firebase emulators:exec --only firestore 'cd functions && npm test -- phase4_1F --runInBand'`

---

## 未実装・実機確認待ち

- **all_staff_attendance_page_from_adminHome**: 論理削除表示（getAllStaffAttendance は isDeleted 返却済み）、対象期間外給与換算時のハイライト表示
- **staff_attendance_detail_page_from_allStaffAttendance / daily_attendance_detail_page_from_staffAttendanceDetail**: 休憩詳細（breaks 一覧）の表示
- **実機確認**: REAL_DEVICE_VERIFICATION.md に従い実施
