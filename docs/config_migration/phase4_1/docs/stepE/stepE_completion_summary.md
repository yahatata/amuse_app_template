# 4.1-E 完了サマリ

**対象**: 管理者フォーム Functions 化、論理削除ロジック  
**CHANGESPEC**: [../phase_E/CHANGESPEC.md](../phase_E/CHANGESPEC.md)

---

## 変更後どうなったか（後続 step 参照用）

### 1. 新規 Callable

| 関数 | 引数 | 戻り値 | 権限 |
|------|------|--------|------|
| createAttendance | staffId, staffName, date, clockIn, clockOut?, breaks? | { success, docId, message } | admin のみ |
| updateAttendance | attendanceId, clockIn?, clockOut?, addBreak?, deleteBreakIds?, markDeleted? | { success, message } | admin のみ |

### 2. createAttendance の処理

- staffs から fullName を取得（staffName 未指定時）
- attendances に doc を追加（4.1-B の新フィールド全て設定）
- breaks が渡された場合は breaks サブコレに doc を追加
- recalculateAttendanceFromBreaks を呼んで actualWorkMinutes, nightWorkMinutes を確定
- attendanceLogs に actionType: 'create_attendance' を書き込み

### 3. updateAttendance の処理

- markDeleted: true の場合は isDeleted, deletedAt, deletedBy: 'admin' を設定して終了
- clockIn/clockOut の更新、addBreak、deleteBreakIds を処理
- recalculateAttendanceFromBreaks を呼ぶ
- attendanceLogs に actionType: 'update_attendance' を書き込み

### 4. admin_attendance_editAndCreate_page.dart

- 追加モード: createAttendance Callable を呼ぶ（attendanceService 経由）
- 編集モード: updateAttendance Callable を呼ぶ
- 論理削除ボタン追加（編集時）。強めの警告ダイアログ後に markDeleted: true で updateAttendance を呼ぶ
- 論理削除済み（isDeleted: true）の attendance は編集・論理削除ボタンを無効化

### 5. admin_attendance_list_page.dart

- 各 attendance の isDeleted が true の場合、「削除済み」と表示。タイル色は grey[300]
- 論理削除済みの編集ボタンは無効化（onPressed: null）

### 6. attendanceService.dart

- createAttendance メソッド追加
- updateAttendance メソッド追加

### 7. テストファイル

| ファイル | 内容 |
|----------|------|
| `__tests__/config_migration/phase4_1E/createAttendance.spec.ts` | createAttendance の認証・通常・attendanceLogs |
| `__tests__/config_migration/phase4_1E/updateAttendance.spec.ts` | updateAttendance の認証・通常・論理削除・エラー |

**実行**: `firebase emulators:exec --only firestore 'cd functions && npm test -- __tests__/config_migration/phase4_1E --runInBand'`

---

## 4.1-E2 以降で参照する際のポイント

- createAttendance, updateAttendance は admin ロールのみ
- 論理削除は updateAttendance の markDeleted: true で実行。deletedBy: 'admin'
- getStaffAttendance は既に isDeleted 除外済み（4.1-B）
- getAllStaffAttendance は isDeleted を含めて返却（4.1-B）
