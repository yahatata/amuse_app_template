# Phase4.1: フロー0（事前準備）影響範囲分析

**成果物**: Flow0_IMPACT_ANALYSIS.md  
**参照**: [WORKFLOW.md](./WORKFLOW.md) / [Flow1_DETAILED_SPEC.md](./Flow1_DETAILED_SPEC.md)

---

## 0. 前提・仕様変更の明記

### 0.1 workingStatus を実装しない

| 項目 | 決定 | 理由 |
|------|------|------|
| **workingStatus** | **実装しない** | クエリのためにあるべきフィールドだが、このステータスを用いたクエリを行う機会が多くなく、SSOT を崩すデメリットの方が大きいという判断 |

**影響**: closeStoreTerminal での `workingStatus: 'closed_without_clock_out'` 付与は行わない。workingStatus 用の Firestore インデックスは不要。

### 0.2 確認・判断が必要な項目の回答まとめ

| # | 項目 | 回答 |
|---|------|------|
| 1 | createClockInRecord / updateClockOutRecord の扱い | unused に移管（index.ts 等からの削除、Dart からの削除、本体は unused フォルダに移管しコードは全てコメントアウト） |
| 2 | 既存 attendances の移行方針 | **新規のみ** |
| 3 | attendances 読み取り箇所の洗い出し粒度 | **全件の洗い出しを行う** |
| 4 | 既存データの nightMinutes → nightWorkMinutes 移行方針 | **新規のみ** |

---

## 1. nightMinutes 参照箇所

### 1.1 Functions

| ファイル | 用途 |
|----------|------|
| `functions/src/domains/attendance/callables/clockIn.ts` | 作成時初期値 `nightMinutes: 0` |
| `functions/src/domains/attendance/callables/clockOut.ts` | 退勤時の計算・更新 |
| `functions/src/domains/attendance/callables/createClockInRecord.ts` | 作成時初期値 `nightMinutes: 0`（→ unused 移管） |
| `functions/src/domains/attendance/callables/createManualClockInRecord.ts` | 作成時初期値 `nightMinutes: 0` |
| `functions/src/domains/attendance/callables/updateClockOutRecord.ts` | 退勤時の計算・更新（→ unused 移管） |
| `functions/src/domains/attendance/callables/updateManualClockOutRecord.ts` | 退勤時の計算・更新 |
| `functions/src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts` | パスワード退勤時の計算・更新 |
| `functions/src/domains/attendance/callables/approveAttendanceCorrectionRequest.ts` | 修正申請承認時の再計算・更新 |
| `functions/src/domains/attendance/callables/seedAttendancesDemo.ts` | デモデータ作成 |
| `functions/src/domains/attendance/callables/getAllStaffAttendance.ts` | 返却データに `nightTimeHours: nightMinutes/60` を含める |
| `functions/src/domains/attendance/scheduler/monthlyPayrollTrigger.ts` | 給与計算（`nightTimeHours += nightMinutes/60`） |

### 1.2 Flutter

| ファイル | 用途 |
|----------|------|
| `lib/AttendanceManagement/staff_attendance_detail_page_from_allStaffAttendance.dart` | 表示（`attendance['nightMinutes']`）、集計 |
| `lib/AttendanceManagement/daily_attendance_detail_page_from_staffAttendanceDetail.dart` | 表示（`attendanceData['nightMinutes']`） |
| `lib/AttendanceManagement/admin_attendance_editAndCreate_page.dart` | 編集時の計算・保存（`_calculateNightMinutes`） |
| `lib/AttendanceManagement/all_staff_attendance_page_from_adminHome.dart` | 表示（`item['nightMinutes']`） |
| `lib/AttendanceManagement/shift_detail_page_from_staffAttendanceDetail.dart` | ローカル変数 `nightMinutes`（attendances の nightMinutes とは別の文脈） |

### 1.3 その他

| ファイル | 用途 |
|----------|------|
| `public/staff/index.html` | 表示（`attendance.nightMinutes`） |

---

## 2. createClockInRecord 呼び出し元

### 2.1 洗い出し結果

| 種別 | ファイル | 内容 |
|------|----------|------|
| **Dart** | `lib/AttendanceManagement/attendanceService.dart` | `createClockInRecord` メソッド定義、`httpsCallable('createClockInRecord')` 呼び出し |
| **呼び出し** | （なし） | `attendanceService.createClockInRecord` を呼び出す箇所は**存在しない**（dead code） |

### 2.2 対応方針

- **Functions**: `unused_function_lib` に移管。コードは全てコメントアウト。`domains/attendance/index.ts` から export を削除。
- **Dart**: `attendanceService.dart` から `createClockInRecord` メソッドを削除。

---

## 3. updateClockOutRecord 呼び出し元

### 3.1 洗い出し結果

| 種別 | ファイル | 内容 |
|------|----------|------|
| **Dart** | `lib/AttendanceManagement/attendanceService.dart` | `updateClockOutRecord` メソッド定義、`httpsCallable('updateClockOutRecord')` 呼び出し |
| **呼び出し** | （なし） | `attendanceService.updateClockOutRecord` を呼び出す箇所は**存在しない**（dead code） |

### 3.2 対応方針

- **Functions**: `unused_function_lib` に移管。コードは全てコメントアウト。`domains/attendance/index.ts` から export を削除。
- **Dart**: `attendanceService.dart` から `updateClockOutRecord` メソッドを削除。

---

## 4. totalMinutes 実労働時間前提箇所

### 4.1 Functions

| ファイル | 用途 |
|----------|------|
| `functions/src/domains/attendance/scheduler/monthlyPayrollTrigger.ts` | 給与計算（`workMinutes = totalMinutes`） |
| `functions/src/domains/attendance/callables/getAllStaffAttendance.ts` | 返却データに `totalWorkHours: totalMinutes/60` を含める |
| `functions/src/domains/attendance/callables/approveAttendanceCorrectionRequest.ts` | 修正申請承認時の再計算・更新 |
| `functions/src/domains/attendance/callables/clockOut.ts` | 退勤時の計算・更新 |
| `functions/src/domains/attendance/callables/updateManualClockOutRecord.ts` | 同上 |
| `functions/src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts` | パスワード退勤時の計算・更新 |

### 4.2 Flutter

| ファイル | 用途 |
|----------|------|
| `lib/AttendanceManagement/staff_attendance_detail_page_from_allStaffAttendance.dart` | 表示・集計（`attendance['totalMinutes']`） |
| `lib/AttendanceManagement/daily_attendance_detail_page_from_staffAttendanceDetail.dart` | 表示（`attendanceData['totalMinutes']`） |
| `lib/AttendanceManagement/admin_attendance_editAndCreate_page.dart` | 編集時の計算・保存 |
| `lib/AttendanceManagement/all_staff_attendance_page_from_adminHome.dart` | 表示（`item['totalMinutes']`） |
| `lib/AttendanceManagement/staff_attendance_page_from_terminalHome.dart` | 表示（`d['totalMinutes']`） |

### 4.3 その他

| ファイル | 用途 |
|----------|------|
| `public/staff/index.html` | 表示（`attendance.totalMinutes`） |

---

## 5. attendances 読み取り箇所（breaks 関連影響）

**洗い出し粒度**: 全件（ユーザー回答に基づく）

### 5.1 Functions

| ファイル | 用途 | 新フィールド追加時の影響 |
|----------|------|--------------------------|
| `functions/src/domains/attendance/callables/clockIn.ts` | 作成 | 初期値追加 |
| `functions/src/domains/attendance/callables/clockOut.ts` | 更新 | 休憩自動終了・親再集計 |
| `functions/src/domains/attendance/callables/createManualClockInRecord.ts` | 作成 | 初期値追加 |
| `functions/src/domains/attendance/callables/updateManualClockOutRecord.ts` | 更新 | 同上 |
| `functions/src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts` | 更新 | 同上 |
| `functions/src/domains/attendance/callables/approveAttendanceCorrectionRequest.ts` | 更新 | break 反映・親再集計 |
| `functions/src/domains/attendance/callables/getAllStaffAttendance.ts` | 取得 | 返却フィールド追加 |
| `functions/src/domains/attendance/callables/getStaffAttendance.ts` | 取得 | 同上 |
| `functions/src/domains/attendance/callables/getStaffListForAttendance.ts` | 取得 | 同上 |
| `functions/src/domains/storeMeta/callables/closeStoreTerminal.ts` | 更新 | 休憩中未退勤の扱い |
| `functions/src/domains/storeMeta/services/getUnclockedStaffForClose.ts` | 取得 | 閉店前確認 |
| `functions/src/domains/attendance/callables/seedAttendancesDemo.ts` | 作成 | 新フィールド対応 |
| `functions/src/domains/attendance/scheduler/monthlyPayrollTrigger.ts` | 取得 | totalMinutes/nightMinutes → actualWorkMinutes/nightWorkMinutes |

### 5.2 Flutter

| ファイル | 用途 | 新フィールド追加時の影響 |
|----------|------|--------------------------|
| `lib/AttendanceManagement/staff_attendance_page_from_terminalHome.dart` | stream・表示 | breakMinutes, actualWorkMinutes 表示、休憩操作 UI |
| `lib/AttendanceManagement/admin_attendance_list_page.dart` | stream・表示 | 編集時に breaks 取得 |
| `lib/AttendanceManagement/staff_attendance_detail_page_from_allStaffAttendance.dart` | 表示 | 給与タブ・勤怠表示 |
| `lib/AttendanceManagement/daily_attendance_detail_page_from_staffAttendanceDetail.dart` | 表示 | 勤怠詳細表示 |
| `lib/AttendanceManagement/all_staff_attendance_page_from_adminHome.dart` | getAllStaffAttendance 経由 | actualWorkMinutes, nightWorkMinutes 表示 |
| `lib/AttendanceManagement/admin_attendance_editAndCreate_page.dart` | 直接 Firestore 読書 | Functions 化対象 |
| `lib/AttendanceManagement/attendanceCorrectionRequestsPage.dart` | 修正申請 | breaks 取得対応 |
| `lib/AttendanceManagement/qrScanPage.dart` | 出退勤 | clockIn/clockOut 使用 |
| `lib/Home/unclocked_attendance_list_page.dart` | 未退勤一覧 | パスワード退勤 |

### 5.3 その他

| ファイル | 用途 |
|----------|------|
| `public/staff/index.html` | 勤怠表示・修正申請 |

---

## 6. attendances 型定義箇所

### 6.1 洗い出し結果

| 種別 | 状況 |
|------|------|
| **TypeScript** | 明示的な attendances 用 interface はなし。`doc.data()` や `Map` で扱っている |
| **Dart** | 明示的な attendances 用 class はなし。`Map<String, dynamic>` や `doc.data()` で扱っている |

### 6.2 対応方針

新フィールド追加時は、各参照箇所で `attendance['breakMinutes']` 等の null 安全なアクセスを追加。**型定義**: 現状どおり Map のまま進め、必要になった段階で型を検討する（Flow1 で決定）。

---

## 7. Firestore インデックス検討

| 項目 | 結論 |
|------|------|
| workingStatus 用インデックス | **不要**（workingStatus は実装しない） |
| breaks サブコレ用 | breaks の orderBy, where パターンに応じて Flow1_DETAILED_SPEC で定義 |
| attendances 親の新フィールド | 現状のクエリパターン（date, staffId 等）で不足がなければ追加不要 |

---

## 8. 既存データ移行方針

| 項目 | 決定 |
|------|------|
| **既存 attendances への新フィールド付与** | **新規のみ**。既存ドキュメントには breakMinutes, actualWorkMinutes, nightWorkMinutes 等を付与しない |
| **既存データの nightMinutes → nightWorkMinutes 移行** | **新規のみ**。既存データは nightMinutes のまま（移行・遅延付与は行わない） |

---

## 9. 対応方針（削除・変更時）

### 9.1 既存 attendances について

| 項目 | 方針 |
|------|------|
| 既存 attendances の変更 | **変更不要**。既存ドキュメントに対して新フィールドを付与しない |
| 一時的に nightMinutes で対応 | **不要**。既存データは nightMinutes のまま参照し、新規作成分のみ nightWorkMinutes を使用 |
| 完了要件 | **今回の改修後に作成されるドキュメントに対してのみ正しく動作すること**が完了要件 |

### 9.2 createClockInRecord / updateClockOutRecord 削除時の対応方針

| 作業 | 内容 |
|------|------|
| **Dart** | `lib/AttendanceManagement/attendanceService.dart` から `createClockInRecord` メソッドと `updateClockOutRecord` メソッドを削除 |
| **Functions index** | `functions/src/domains/attendance/index.ts` から `createClockInRecord` と `updateClockOutRecord` の export を削除 |
| **本体** | `functions/src/domains/attendance/callables/createClockInRecord.ts` と `updateClockOutRecord.ts` を `functions/src/unused_function_lib/` に移動。**コード内容は全てコメントアウト**（unused_function_lib の他ファイルと同様の形式） |

### 9.3 unused 移管の形式

`unused_function_lib` の他ファイル（例: `nightlyIntegrityCheck.ts`, `determineAttendanceMode.ts`）と同様に扱う。

- ファイル先頭に `[UNUSED - Phase4.1]` のコメント
- 復元手順の記載
- 実装コードは `// ========== UNUSED_BLOCK_START ==========` ～ `// ========== UNUSED_BLOCK_END ==========` でコメントアウト

---

## 10. 参照: フロー0 ステップと本ドキュメントの対応

| ステップ | 作業内容 | 本ドキュメント |
|----------|----------|----------------|
| 1 | nightMinutes 全参照箇所の洗い出し | セクション 1 |
| 2 | createClockInRecord 呼び出し元の洗い出し | セクション 2 |
| 3 | updateClockOutRecord 呼び出し元の洗い出し | セクション 3 |
| 4 | totalMinutes 実労働時間前提箇所の洗い出し | セクション 4 |
| 5 | attendances 読み取り箇所（breaks 関連）の洗い出し | セクション 5 |
| 6 | attendances 型定義箇所の洗い出し | セクション 6 |
| 7 | Firestore インデックス要否の検討 | セクション 7 |
| 8 | 既存 attendances への新フィールド付与方針 | セクション 8 |
| 9 | 削除・変更時の対応方針 | セクション 9 |
