# 4.1-B: attendances 親フィールド追加、nightWorkMinutes 算出 — 変更仕様書（changeSpec）

**対象**: [Flow2_IMPLEMENTATION_PHASES.md](../../Flow2_IMPLEMENTATION_PHASES.md) に基づく実装  
**本 step**: 4.1-B。Flow2 セクション 7「4.1-B」・セクション 4.2・セクション 5 を参照すること。

**最終更新**: 2025-03-04

---

## 1. 概要・目的

- attendances 親に新フィールド（breakMinutes, actualWorkMinutes, nightWorkMinutes, isOnBreak, currentBreakStartedAt, breakCount, lastActionType, lastActionAt, lastActionByDeviceId, manualReason, payrollReflectedAt, isDeleted, deletedAt, deletedBy）を追加する
- config から夜間労働時間を取得し、nightWorkMinutes を算出する
- 該当 6 関数に attendanceLogs 書き込みを追加する
- getStaffAttendance / getAllStaffAttendance の返却に breakMinutes, actualWorkMinutes, nightWorkMinutes を含める（既存データは nightMinutes のまま）

**完了条件（Flow2 セクション 5 より）**: 新規作成される attendance に新フィールドが付与され、nightWorkMinutes が config から算出され、該当 6 関数に attendanceLogs が追加されている。getStaffAttendance / getAllStaffAttendance の返却に breakMinutes, actualWorkMinutes, nightWorkMinutes を含める（既存データは nightMinutes のまま）

---

## 2. 依存先の確認

| 依存先 | 確認すべき修正内容 |
|--------|-------------------|
| 4.1-A | config の nightWorkStartHour, nightWorkEndHour の追加。stepA_completion_summary.md を確認 |

---

## 3. 対象ファイル一覧

### Functions（TypeScript）

| ファイル | 変更内容 |
|----------|----------|
| `functions/src/domains/attendance/helpers/attendanceLogs.ts` | 新規。writeAttendanceLog ヘルパー |
| `functions/src/domains/attendance/helpers/nightWorkMinutes.ts` | 新規。calculateNightWorkMinutes ヘルパー |
| `functions/src/domains/attendance/callables/clockIn.ts` | 新フィールド追加、attendanceLogs 書き込み |
| `functions/src/domains/attendance/callables/createManualClockInRecord.ts` | 同上 |
| `functions/src/domains/attendance/callables/clockOut.ts` | config から nightWorkMinutes 算出、新フィールド更新、attendanceLogs |
| `functions/src/domains/attendance/callables/updateManualClockOutRecord.ts` | 同上 |
| `functions/src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts` | 同上 |
| `functions/src/domains/attendance/callables/approveAttendanceCorrectionRequest.ts` | config から nightWorkMinutes 算出、attendanceLogs |
| `functions/src/domains/attendance/callables/getStaffAttendance.ts` | 論理削除除外、breakMinutes/actualWorkMinutes/nightWorkMinutes 返却 |
| `functions/src/domains/attendance/callables/getAllStaffAttendance.ts` | breakMinutes/actualWorkMinutes/nightWorkMinutes 返却、isDeleted 含める |

---

## 4. 実装順序

```
Phase 1: ヘルパー作成（attendanceLogs, nightWorkMinutes）
Phase 2: clockIn, createManualClockInRecord の新フィールド・attendanceLogs
Phase 3: clockOut, updateManualClockOutRecord, updateUnclockedAttendanceWithAuth の nightWorkMinutes・attendanceLogs
Phase 4: approveAttendanceCorrectionRequest の nightWorkMinutes・attendanceLogs
Phase 5: getStaffAttendance, getAllStaffAttendance の返却フィールド
```

---

## 5. 検証ポイント

| # | 観点 | 方法 |
|---|------|------|
| 1 | 新規 attendance に新フィールドが付与される | clockIn で作成し、Firestore で確認 |
| 2 | nightWorkMinutes が config から算出される | clockOut で退勤し、nightWorkMinutes を確認 |
| 3 | attendanceLogs にログが書き込まれる | 各関数実行後、attendanceLogs を確認 |
| 4 | getStaffAttendance で論理削除を除外 | isDeleted: true の doc が返却されないことを確認 |
| 5 | getAllStaffAttendance に breakMinutes, actualWorkMinutes, nightWorkMinutes が含まれる | 返却データを確認 |
