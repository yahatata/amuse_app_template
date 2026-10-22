# Phase4.1: 実装段階計画（Flow2 成果物）

**本ドキュメント**: Flow2（実装段階の計画）の成果物。  
**参照**: [WORKFLOW.md](./WORKFLOW.md) / [Flow1_DETAILED_SPEC.md](./Flow1_DETAILED_SPEC.md) / [Flow0_IMPACT_ANALYSIS.md](./Flow0_IMPACT_ANALYSIS.md)

---

## 1. 前提・方針

### 1.1 attendanceLogs の追加タイミング

**案A 採用**: 各段階で、その段階で変更する関数に attendanceLogs を追加する。

### 1.2 論理削除（isDeleted, deletedAt, deletedBy）の実装タイミング

**案A 採用**: フィールド追加を 4.1-B、ロジック実装を 4.1-E で行う。

### 1.3 段階の分割

**案B 採用**: 管理者フォーム Functions 化（4.1-E）と、修正申請・閉店処理（4.1-E2）に分割する。

---

## 2. 段階一覧

| 段階 | 内容 | 依存 | 実機確認 |
|------|------|------|----------|
| **4.1-A** | config 夜間労働時間追加、旧 Callable unused 移管 | なし | 任意 |
| **4.1-B** | attendances 親フィールド追加、nightWorkMinutes 算出、論理削除フィールド追加、attendanceLogs 追加 | A | 任意 |
| **4.1-C** | breaks サブコレ、startBreak / endBreak、attendanceLogs 追加 | B | **推奨** |
| **4.1-D** | 退勤系 Callable の休憩対応 | C | **推奨** |
| **4.1-E** | 管理者フォーム Functions 化、論理削除ロジック、attendanceLogs 追加 | D | **推奨** |
| **4.1-E2** | 修正申請・閉店処理改修、attendanceLogs 追加 | E | **推奨** |
| **4.1-F** | UI 改修、seedAttendancesDemo、monthlyPayrollTrigger、attendanceLogs 追加 | E2 | **推奨** |

---

## 3. 各段階のスコープ

### 4.1-A: config 夜間労働時間追加、旧 Callable unused 移管

| 項目 | 内容 |
|------|------|
| **config** | defaults.ts, configLoader, types に `attendance.nightWorkStartHour`, `attendance.nightWorkEndHour` を追加 |
| **旧 Callable** | createClockInRecord, updateClockOutRecord を unused_function_lib に移管（コード全コメントアウト）。domains/attendance/index.ts から export 削除 |
| **Dart** | attendanceService.dart から createClockInRecord, updateClockOutRecord メソッドを削除 |
| **attendanceLogs** | なし（削除対象のため） |

### 4.1-B: attendances 親フィールド追加、nightWorkMinutes 算出

| 項目 | 内容 |
|------|------|
| **attendances 親フィールド** | breakMinutes, actualWorkMinutes, nightWorkMinutes, isOnBreak, currentBreakStartedAt, breakCount, lastActionType, lastActionAt, lastActionByDeviceId, manualReason, payrollReflectedAt, **isDeleted, deletedAt, deletedBy** を追加（論理削除は初期値のみ。isDeleted: false, deletedAt: null, deletedBy: null） |
| **変更対象** | clockIn, createManualClockInRecord, clockOut, updateManualClockOutRecord, updateUnclockedAttendanceWithAuth, approveAttendanceCorrectionRequest。config から夜間労働時間を取得し、nightWorkMinutes を算出 |
| **attendanceLogs** | 上記 6 関数に attendanceLogs 書き込みを追加 |
| **論理削除ロジック** | 行わない（フィールド追加のみ） |

### 4.1-C: breaks サブコレ、startBreak / endBreak

| 項目 | 内容 |
|------|------|
| **breaks サブコレ** | `attendances/{attendanceId}/breaks/{breakId}` の作成。Firestore インデックス追加 |
| **新規 Callable** | startBreak, endBreak を新規作成 |
| **親再集計ヘルパー** | breaks から breakMinutes, actualWorkMinutes, nightWorkMinutes を再計算するヘルパーを作成 |
| **clockIn / createManualClockInRecord** | 休憩系初期値は B で追加済み。clockOut に退勤時の休憩自動終了の挿入箇所を用意（休憩 doc が存在する場合の処理） |
| **attendanceLogs** | startBreak, endBreak に attendanceLogs 書き込みを追加 |

### 4.1-D: 退勤系 Callable の休憩対応

| 項目 | 内容 |
|------|------|
| **変更対象** | clockOut, updateManualClockOutRecord, updateUnclockedAttendanceWithAuth |
| **処理内容** | 休憩中退勤時: 休憩自動終了 → breaks 反映 → 親再集計ヘルパーで親を更新 → clockOut, actualWorkMinutes, nightWorkMinutes 確定 |
| **attendanceLogs** | B で追加済み。actionType は clock_out, update_manual_clock_out, password_clock_out のまま |

### 4.1-E: 管理者フォーム Functions 化、論理削除ロジック

| 項目 | 内容 |
|------|------|
| **新規 Callable** | createAttendance（管理者用勤怠作成）、updateAttendance（管理者用勤怠編集・break 操作・論理削除含む） |
| **admin_attendance_form_page** | 直接 Firestore 更新をやめ、上記 Callable 経由に変更 |
| **論理削除ロジック** | updateAttendance で論理削除可能。getStaffAttendance で isDeleted: true を除外。getAllStaffAttendance で論理削除を含め、削除された attendance とわかるように返却。LINE 表示も同様 |
| **attendanceLogs** | createAttendance, updateAttendance に attendanceLogs 書き込みを追加 |

### 4.1-E2: 修正申請・閉店処理改修

| 項目 | 内容 |
|------|------|
| **approveAttendanceCorrectionRequest** | break 追加/修正/論理削除の反映、親再集計の追加 |
| **closeStoreTerminal** | 休憩中未退勤の扱いを明確化（workingStatus は実装しない） |
| **attendanceCorrectionRequestsPage** | 修正申請提出時に breaks を取得する対応 |
| **attendanceLogs** | closeStoreTerminal に attendanceLogs 書き込みを追加（approveAttendanceCorrectionRequest は B で追加済み） |

### 4.1-F: UI 改修、seedAttendancesDemo、monthlyPayrollTrigger

| 項目 | 内容 |
|------|------|
| **UI 改修** | staffAttendancePage（休憩表示・休憩操作）、admin_attendance_list_page（休憩集計）、allStaffAttendancePage, staffAttendanceDetailPage, attendanceDetailPage の actualWorkMinutes, nightWorkMinutes 表示、論理削除の表示対応 |
| **seedAttendancesDemo** | 新フィールド・休憩サンプル・論理削除サンプルを追加 |
| **monthlyPayrollTrigger** | totalMinutes/nightMinutes → actualWorkMinutes/nightWorkMinutes。payrollReflectedAt の付与。論理削除除外。対象期間外給与換算時のハイライト表示 |
| **attendanceLogs** | monthlyPayrollTrigger が attendances を更新する場合、attendanceLogs への書き込みを追加。その他漏れがあれば追加 |
| **public/staff/index.html** | 必要に応じて actualWorkMinutes, nightWorkMinutes, 論理削除表示の対応 |

---

## 4. 依存関係

### 4.1 依存関係図

```
4.1-A
  │
  ▼
4.1-B
  │
  ▼
4.1-C
  │
  ▼
4.1-D
  │
  ▼
4.1-E
  │
  ▼
4.1-E2
  │
  ▼
4.1-F
```

※ 全段階が直列依存。並列実行可能な段階はなし。

### 4.2 依存関係一覧

**定義**: 依存先 = その phase の修正を行う**前に**、実際に行った修正を確認する必要がある phase。

| 段階 | 依存先 | 確認すべき修正内容 |
|------|--------|-------------------|
| A | なし | 独立 |
| B | A | config の nightWorkStartHour, nightWorkEndHour の追加。旧 Callable の unused 移管（呼び出し元削除の前提） |
| C | A, B | **A**: config（親再集計ヘルパーで nightWorkMinutes 算出に使用）。**B**: attendances の休憩系フィールド（breakMinutes, isOnBreak 等）、clockOut 等の構造 |
| D | B, C | **B**: clockOut, updateManualClockOutRecord, updateUnclockedAttendanceWithAuth の B による変更内容（同一ファイルを修正するため）。**C**: 親再集計ヘルパー、breaks サブコレ、clockOut の C による挿入箇所 |
| E | B, C, D | **B**: attendances の isDeleted, deletedAt, deletedBy、getStaffAttendance/getAllStaffAttendance の返却構造。**C**: 親再集計ヘルパー（updateAttendance で再利用）。**D**: 退勤系の休憩処理パターン（同様の親再集計呼び出し） |
| E2 | B, C, E | **B**: approveAttendanceCorrectionRequest の B による変更内容（同一ファイルを修正）。**C**: 親再集計ヘルパー（approveAttendanceCorrectionRequest で使用）。**E**: getStaffAttendance の論理削除除外、breaks 取得の有無（修正申請画面で breaks 取得する導線） |
| F | B, C, D, E, E2 | **B**: getStaffAttendance/getAllStaffAttendance の返却フィールド（actualWorkMinutes, nightWorkMinutes 等）。**C**: breaks 構造、休憩表示。**D**: 退勤時の休憩処理。**E**: 論理削除の表示仕様、createAttendance/updateAttendance で作成される attendance 構造。**E2**: approveAttendanceCorrectionRequest の break 反映、closeStoreTerminal の扱い。monthlyPayrollTrigger は B〜E2 の全変更を反映した attendances を扱う |

### 4.3 依存関係マトリクス

行: 依存される段階 / 列: 依存する段階。○ = その phase の実装前に、行の phase の修正内容を確認する必要あり。

|       | A | B | C | D | E | E2 | F |
|-------|---|---|---|---|---|----|---|
| **A** | - | ○ | ○ | - | - | -  | - |
| **B** | - | - | ○ | ○ | ○ | ○  | ○ |
| **C** | - | - | - | ○ | ○ | ○  | ○ |
| **D** | - | - | - | - | ○ | -  | ○ |
| **E** | - | - | - | - | - | ○  | ○ |
| **E2**| - | - | - | - | - | -  | ○ |
| **F** | - | - | - | - | - | -  | - |

※ 例: B 行 C 列の ○ = C の実装前に、B の修正内容を確認する必要あり

---

## 5. 完了条件（各段階）

**目的**: 全段階の完了条件を満たせば、[Flow1_DETAILED_SPEC.md](./Flow1_DETAILED_SPEC.md) の To-Be 仕様を満たす状態となる。

| 段階 | 完了条件 |
|------|----------|
| A | config に夜間労働時間（nightWorkStartHour, nightWorkEndHour）が追加され、旧 Callable（createClockInRecord, updateClockOutRecord）が unused に移管され、Dart から削除されている。既存の出退勤（clockIn/clockOut）が動作する |
| B | 新規作成される attendance に新フィールド（breakMinutes, actualWorkMinutes, nightWorkMinutes, isOnBreak, currentBreakStartedAt, breakCount, lastActionType, lastActionAt, lastActionByDeviceId, manualReason, payrollReflectedAt, isDeleted, deletedAt, deletedBy）が付与される。nightWorkMinutes が config から算出される。該当 6 関数に attendanceLogs が追加されている。getStaffAttendance / getAllStaffAttendance の返却に breakMinutes, actualWorkMinutes, nightWorkMinutes を含める（既存データは nightMinutes のまま） |
| C | startBreak, endBreak が動作し、breaks サブコレ（attendances/{attendanceId}/breaks）に doc が作成される。breaks の論理削除フィールド（isDeleted, deletedAt）を保持。親再集計ヘルパーが動作する。Firestore インデックスが整備されている |
| D | 休憩中に退勤した場合、休憩が自動終了し、breaks に反映した上で親再集計し、actualWorkMinutes, nightWorkMinutes が正しく算出される |
| E | 管理者が createAttendance（staff・日付・clockIn 必須、break・clockOut 任意）、updateAttendance（編集・break 操作・論理削除含む、attendanceId/staffId の変更は不可）で勤怠を作成・編集できる。admin の勤怠作成・編集は直接 Firestore 更新をやめ、上記 Callable 経由とする。break の論理削除時はその時間を休憩と判定しない。getStaffAttendance で論理削除を除外。getAllStaffAttendance で論理削除を含め、削除された attendance とわかるように返却。admin 画面で論理削除操作可能。給与計算では論理削除を対象外とする |
| E2 | 修正申請承認（approveAttendanceCorrectionRequest）で break 追加/修正/論理削除が反映され、親再集計される。closeStoreTerminal で休憩中未退勤の扱いが明確（workingStatus は実装しない）。修正申請提出画面で breaks を取得できる |
| F | UI に休憩表示・休憩操作、actualWorkMinutes・nightWorkMinutes・breakMinutes が表示される。LINE（public/staff/index.html）で actualWorkMinutes, nightWorkMinutes および論理削除の表示が To-Be に沿う。seedAttendancesDemo が新仕様に対応。monthlyPayrollTrigger が新規 attendances は actualWorkMinutes, nightWorkMinutes を使用し、既存 attendances は totalMinutes, nightMinutes を継続使用。payrollReflectedAt を付与、論理削除を対象外とする。対象期間外給与換算時は給与データ表示画面でハイライト表示する。attendanceLogs が対象関数全てで書き込まれる。既存 attendances への新フィールド一括付与・一括移行スクリプト・遅延付与は行っていない（新規のみ） |

---

## 6. 確認方針（実機確認・テスト）

**方針**: 実機確認は **4.1-F に集約**。4.1-C〜E2 では **テストファイル + Firestore エミュレータ** で確認を行う。

| 段階 | 確認方法 |
|------|----------|
| A | 任意（実機 or テスト） |
| B | 任意（実機 or テスト） |
| C | **テスト**: `firebase emulators:exec --only firestore 'cd functions && npm test -- __tests__/config_migration/phase4_1C'` |
| D | **テスト**: 該当 Callable のテストファイル作成・エミュレータ実行 |
| E | **テスト**: 該当 Callable のテストファイル作成・エミュレータ実行 |
| E2 | **テスト**: 該当 Callable のテストファイル作成・エミュレータ実行 |
| F | **実機確認**: UI・休憩操作・給与計算・LINE 表示等を一括確認 |

---

## 7. 段階別参照ファイル

**changeSpec 作成時**: 本セクションの参照ファイルをすべて確認すること。作成物は `docs/phase_X/CHANGESPEC.md`。テンプレートは `docs/stepX/` の該当 step（stepA→phase_A, stepB→phase_B, … stepE2→phase_E2, stepF→phase_F）の stepX_changeSpec.md をコピーして編集する。**依存先確認の共通ルール: 必ず、依存先 step の完了サマリ（stepX_completion_summary.md）を確認し、必要に応じて実コードも確認する。** 段階別参照ファイルの正本は本セクション（Flow2 セクション 7）。WORKFLOW セクション 5 は本セクションを反映している。

各段階の changeSpec 作成時に参照するファイル。WORKFLOW.md セクション 5 の内容を反映し、4.1-E 分割に合わせて更新。

### 4.1-A（stepA → phase_A）

**Flow1 該当**: セクション 4（config 夜間労働時間）

| ファイル | 用途 |
|----------|------|
| `functions/src/shared/config/configLoader.ts` | config 読み取りの現状 |
| `functions/src/shared/config/defaults.ts` | デフォルト値の定義場所 |
| `functions/src/shared/config/types.ts` | 型定義 |
| `functions/src/domains/attendance/callables/createClockInRecord.ts` | 削除対象の現状 |
| `functions/src/domains/attendance/callables/updateClockOutRecord.ts` | 削除対象の現状 |
| `functions/src/domains/attendance/index.ts` | export 削除箇所 |
| `lib/AttendanceManagement/attendanceService.dart` | メソッド削除箇所 |
| `docs/config_migration/phase4_1/Flow0_IMPACT_ANALYSIS.md` | 対応方針 |

### 4.1-B（stepB → phase_B）

**Flow1 該当**: セクション 5（attendances 親フィールド）、セクション 7（既存 Callable の変更概要）

| ファイル | 用途 |
|----------|------|
| `functions/src/domains/attendance/callables/clockIn.ts` | 作成時の初期値 |
| `functions/src/domains/attendance/callables/createManualClockInRecord.ts` | 同上 |
| `functions/src/domains/attendance/callables/clockOut.ts` | 計算ロジック |
| `functions/src/domains/attendance/callables/updateManualClockOutRecord.ts` | 同上 |
| `functions/src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts` | 同上 |
| `functions/src/domains/attendance/callables/approveAttendanceCorrectionRequest.ts` | 同上 |
| `functions/src/domains/attendance/callables/getStaffAttendance.ts` | 返却フィールド |
| `functions/src/domains/attendance/callables/getAllStaffAttendance.ts` | 同上 |
| `docs/config_migration/phase4_1/Flow1_DETAILED_SPEC.md` | 仕様 |
| `docs/config_migration/phase4_1/Flow0_IMPACT_ANALYSIS.md` | 影響範囲 |

### 4.1-C（stepC → phase_C）

**Flow1 該当**: セクション 2（breaks スキーマ）、セクション 6（新規 Callable I/O）

| ファイル | 用途 |
|----------|------|
| `functions/src/domains/attendance/callables/clockIn.ts` | 休憩系初期値 |
| `functions/src/domains/attendance/callables/createManualClockInRecord.ts` | 同上 |
| `functions/src/domains/attendance/callables/clockOut.ts` | 休憩自動終了の挿入箇所 |
| `docs/config_migration/phase4_1/Flow1_DETAILED_SPEC.md` | breaks スキーマ、startBreak/endBreak I/O |

### 4.1-D（stepD → phase_D）

**Flow1 該当**: セクション 7（既存 Callable の変更概要）

| ファイル | 用途 |
|----------|------|
| `functions/src/domains/attendance/callables/clockOut.ts` | 休憩中退勤処理 |
| `functions/src/domains/attendance/callables/updateManualClockOutRecord.ts` | 同上 |
| `functions/src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts` | 同上 |
| `lib/AttendanceManagement/staff_attendance_page_from_terminalHome.dart` | 退勤処理 |
| `lib/AttendanceManagement/qrScanPage.dart` | QR 退勤 |
| `lib/Home/unclocked_attendance_list_page.dart` | パスワード退勤 |
| 4.1-C で作成した親再集計ヘルパー | 再利用。**stepC_completion_summary.md で実装内容を確認すること** |

### 4.1-E（stepE → phase_E）

**Flow1 該当**: セクション 6（新規 Callable I/O）、セクション 7（既存 Callable の変更概要）

| ファイル | 用途 |
|----------|------|
| `lib/AttendanceManagement/admin_attendance_editAndCreate_page.dart` | Functions 化対象 |
| `lib/AttendanceManagement/admin_attendance_list_page.dart` | 編集導線 |
| `functions/src/domains/attendance/callables/getStaffAttendance.ts` | 論理削除除外 |
| `functions/src/domains/attendance/callables/getAllStaffAttendance.ts` | 論理削除表示 |
| `docs/config_migration/phase4_1/Flow1_DETAILED_SPEC.md` | 管理者用 Callable I/O、論理削除の表示・処理範囲 |

### 4.1-E2（stepE2 → phase_E2）

**Flow1 該当**: セクション 7（既存 Callable の変更概要）

| ファイル | 用途 |
|----------|------|
| `functions/src/domains/attendance/callables/approveAttendanceCorrectionRequest.ts` | break 反映・親再集計 |
| `functions/src/domains/storeMeta/callables/closeStoreTerminal.ts` | 休憩中未退勤の扱い |
| `lib/AttendanceManagement/attendanceCorrectionRequestsPage.dart` | breaks 取得 |
| `docs/config_migration/phase4_1/Flow1_DETAILED_SPEC.md` | 仕様 |

### 4.1-F（stepF → phase_F）

**Flow1 該当**: セクション 3（attendanceLogs スキーマ）、セクション 7（既存 Callable の変更概要）

| ファイル | 用途 |
|----------|------|
| `functions/src/domains/attendance/scheduler/monthlyPayrollTrigger.ts` | 給与計算、payrollReflectedAt |
| `functions/src/domains/attendance/callables/seedAttendancesDemo.ts` | デモデータ |
| `lib/AttendanceManagement/staff_attendance_page_from_terminalHome.dart` | 休憩表示・休憩操作 UI |
| `lib/AttendanceManagement/admin_attendance_list_page.dart` | 休憩集計表示 |
| `lib/AttendanceManagement/all_staff_attendance_page_from_adminHome.dart` | 給与計算画面 |
| `lib/AttendanceManagement/staff_attendance_detail_page_from_allStaffAttendance.dart` | 勤怠詳細 |
| `lib/AttendanceManagement/daily_attendance_detail_page_from_staffAttendanceDetail.dart` | 勤怠詳細（日付単位） |
| `public/staff/index.html` | LINE 表示 |
| `docs/config_migration/phase4_1/Flow1_DETAILED_SPEC.md` | attendanceLogs スキーマ、UI 仕様 |
