# 4.1-B: attendances 親フィールド追加、nightWorkMinutes 算出 — 確認結果

**CHANGESPEC**: [CHANGESPEC.md](./CHANGESPEC.md)

---

## 実施日・実施者

| 項目 | 内容 |
|------|------|
| 実施日 | 2025-03-04 |
| 実施者 | （AI 実装） |

---

## 完了条件チェック

| 完了条件 | 結果 | 備考 |
|----------|------|------|
| 新規 attendance に新フィールドが付与される | ✓ | clockIn, createManualClockInRecord で追加 |
| nightWorkMinutes が config から算出される | ✓ | clockOut, updateManualClockOutRecord, updateUnclockedAttendanceWithAuth, approveAttendanceCorrectionRequest で config 参照 |
| 該当 6 関数に attendanceLogs が追加されている | ✓ | clock_in, create_manual_clock_in, clock_out, update_manual_clock_out, password_clock_out, approve_correction_request |
| getStaffAttendance / getAllStaffAttendance の返却に新フィールドを含める | ✓ | breakMinutes, actualWorkMinutes, nightWorkMinutes。既存データは nightMinutes フォールバック |
| getStaffAttendance で論理削除を除外 | ✓ | isDeleted === true をスキップ |

---

## 実機確認結果

| 確認項目 | 結果 | 事象 |
|----------|------|------|
| 実機確認 | 未実施 | 4.1-B は任意のためスキップ |
