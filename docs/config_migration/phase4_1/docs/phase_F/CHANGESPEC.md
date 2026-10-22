# 4.1-F: UI 改修、seedAttendancesDemo、monthlyPayrollTrigger — 変更仕様書（changeSpec）

**対象**: [Flow2_IMPLEMENTATION_PHASES.md](../../Flow2_IMPLEMENTATION_PHASES.md) に基づく実装  
**本 step**: 4.1-F。Flow2 セクション 7「4.1-F」・セクション 4.2・セクション 5 を参照すること。

**最終更新**: 2025-03-04

---

## 0. changeSpec 作成時の共通ルール（全 step で実施）

**目的**: 漏れなく changeSpec を作成するため、以下のタイミングで所定の確認を行う。

| タイミング | 何を | 何のために | 参照先 |
|------------|------|------------|--------|
| **作成開始前** | 依存先の修正内容を確認する | 前段階の変更を理解した上で実装範囲を決めるため | Flow2 セクション 4.2「依存関係一覧」の 4.1-F 行。**stepB〜E2 の完了サマリを確認** |
| **作成開始前** | 本 step の参照ファイル一覧を把握する | 変更対象・AS-IS 確認対象を漏れなく特定するため | Flow2 セクション 7「4.1-F」 |
| **作成中** | 本 step の To-Be 仕様を確認する | 変更内容が仕様と整合するため | Flow1_DETAILED_SPEC.md セクション 3, 7 |
| **作成中** | 本 step の完了条件を確認する | 検証ポイント・チェックリストを完了条件と対応付けるため | Flow2 セクション 5「完了条件」の 4.1-F 行 |

---

## 1. 概要・目的

- **UI 改修**: staffAttendancePage（休憩表示・休憩操作）、admin_attendance_list_page（休憩集計）、allStaffAttendancePage, staffAttendanceDetailPage, attendanceDetailPage の actualWorkMinutes, nightWorkMinutes, breakMinutes 表示、論理削除の表示対応
- **seedAttendancesDemo**: 新フィールド・休憩サンプル・論理削除サンプルを追加
- **monthlyPayrollTrigger**: totalMinutes/nightMinutes → actualWorkMinutes/nightWorkMinutes への切り替え（新規は新フィールド、既存は旧フィールド継続）。payrollReflectedAt の付与。論理削除除外。attendanceLogs への書き込み。対象期間外給与換算時のハイライト表示
- **public/staff/index.html**: actualWorkMinutes, nightWorkMinutes、論理削除表示の対応
- **attendanceLogs**: monthlyPayrollTrigger が attendances を更新する場合に書き込みを追加

**完了条件（Flow2 セクション 5 より）**: UI に休憩表示・休憩操作、actualWorkMinutes・nightWorkMinutes・breakMinutes が表示される。LINE（public/staff/index.html）で actualWorkMinutes, nightWorkMinutes および論理削除の表示が To-Be に沿う。seedAttendancesDemo が新仕様に対応。monthlyPayrollTrigger が新規 attendances は actualWorkMinutes, nightWorkMinutes を使用し、既存 attendances は totalMinutes, nightMinutes を継続使用。payrollReflectedAt を付与、論理削除を対象外とする。対象期間外給与換算時は給与データ表示画面でハイライト表示する。attendanceLogs が対象関数全てで書き込まれる。

---

## 2. 依存先の確認

| 依存先 | 確認すべき修正内容 |
|--------|-------------------|
| 4.1-B | getStaffAttendance/getAllStaffAttendance の返却フィールド（actualWorkMinutes, nightWorkMinutes, breakMinutes, isDeleted）。**stepB_completion_summary.md** |
| 4.1-C | breaks 構造、startBreak/endBreak。**stepC_completion_summary.md** |
| 4.1-D | 退勤時の休憩処理。**stepD_completion_summary.md** |
| 4.1-E | 論理削除の表示仕様、createAttendance/updateAttendance で作成される attendance 構造。**stepE_completion_summary.md** |
| 4.1-E2 | approveAttendanceCorrectionRequest、closeStoreTerminal。**stepE2_completion_summary.md** |

**確認済み**:
- B: getStaffAttendance は actualWorkMinutes, nightWorkMinutes, breakMinutes を返却。isDeleted 除外。getAllStaffAttendance は isDeleted を含めて返却
- C: breaks サブコレ、startBreak/endBreak Callable
- E: 論理削除は updateAttendance の markDeleted。admin_attendance_list_page で「削除済み」表示済み
- E2: 修正申請・閉店処理の改修完了

---

## 3. 対象ファイル一覧

### Functions（TypeScript）

| ファイル | 変更内容 |
|----------|----------|
| `functions/src/domains/attendance/scheduler/monthlyPayrollTrigger.ts` | actualWorkMinutes/nightWorkMinutes 使用（新規は新フィールド、既存は旧フィールド継続）。論理削除除外。payrollReflectedAt 付与。attendanceLogs 書き込み |
| `functions/src/domains/attendance/callables/seedAttendancesDemo.ts` | 新フィールド（breakMinutes, actualWorkMinutes, nightWorkMinutes, isOnBreak 等）、休憩サンプル、論理削除サンプルを追加 |

### Dart（Flutter）

| ファイル | 変更内容 |
|----------|----------|
| `lib/AttendanceManagement/staff_attendance_page_from_terminalHome.dart` | 休憩表示・休憩操作 UI。actualWorkMinutes, nightWorkMinutes, breakMinutes 表示 |
| `lib/AttendanceManagement/admin_attendance_list_page.dart` | 休憩集計表示。actualWorkMinutes, nightWorkMinutes, breakMinutes 表示 |
| `lib/AttendanceManagement/all_staff_attendance_page_from_adminHome.dart` | 論理削除の扱い（一覧での表示）。対象期間外給与換算時のハイライト表示 |
| `lib/AttendanceManagement/staff_attendance_detail_page_from_allStaffAttendance.dart` | totalMinutes/nightMinutes → actualWorkMinutes/nightWorkMinutes。休憩表示。論理削除表示 |
| `lib/AttendanceManagement/daily_attendance_detail_page_from_staffAttendanceDetail.dart` | actualWorkMinutes, nightWorkMinutes, breakMinutes 表示。休憩詳細。論理削除表示 |

### その他

| ファイル | 変更内容 |
|----------|----------|
| `public/staff/index.html` | actualWorkMinutes, nightWorkMinutes 表示（totalMinutes/nightMinutes フォールバック）。論理削除表示 |

---

## 4. 現状（As-Is）

### 4.1 staff_attendance_page_from_terminalHome.dart

- totalMinutes のみ表示（合計分列）。休憩表示・休憩操作なし
- actualWorkMinutes, nightWorkMinutes, breakMinutes は未表示

### 4.2 admin_attendance_list_page.dart

- clockIn, clockOut, staffsFullName を表示。論理削除（isDeleted）は対応済み
- 休憩集計、actualWorkMinutes, nightWorkMinutes, breakMinutes は未表示

### 4.3 all_staff_attendance_page_from_adminHome.dart

- getAllStaffAttendance の totalWorkHours, nightTimeHours を使用（内部で actualWorkMinutes/nightWorkMinutes をフォールバック済み）
- 論理削除の一覧での除外・表示は未対応
- 対象期間外給与換算時のハイライト表示なし

### 4.4 staff_attendance_detail_page_from_allStaffAttendance.dart

- totalMinutes, nightMinutes で勤務時間・深夜時間を表示
- 休憩表示なし。論理削除表示なし

### 4.5 daily_attendance_detail_page_from_staffAttendanceDetail.dart

- totalMinutes, nightMinutes で表示
- 休憩表示なし。論理削除表示なし

### 4.6 monthlyPayrollTrigger.ts

- totalMinutes, nightMinutes を直接参照
- 論理削除（isDeleted: true）の除外なし
- payrollReflectedAt 未使用
- attendanceLogs への書き込みなし

### 4.7 seedAttendancesDemo.ts

- totalMinutes, nightMinutes のみ。breakMinutes, actualWorkMinutes, nightWorkMinutes, isOnBreak 等の新フィールドなし
- 休憩サンプルなし。論理削除サンプルなし

### 4.8 public/staff/index.html

- totalMinutes, nightMinutes で勤務時間・深夜時間を表示
- actualWorkMinutes, nightWorkMinutes のフォールバックなし。論理削除表示なし

---

## 5. 変更後（To-Be）

### 5.1 staff_attendance_page_from_terminalHome.dart

**Flow1 参照**: セクション 7.4

| 変更 | 内容 |
|------|------|
| 休憩表示 | 勤務中（clockOut が null）かつ isOnBreak: true の場合は「休憩中」表示。breaks サブコレの一覧表示（開始〜終了時刻） |
| 休憩操作 | 休憩開始ボタン（startBreak Callable）、休憩終了ボタン（endBreak Callable）。attendanceId を data 属性等で保持 |
| 時間表示 | totalMinutes → actualWorkMinutes（フォールバック: totalMinutes）。nightMinutes → nightWorkMinutes（フォールバック: nightMinutes）。breakMinutes を表示 |
| 論理削除 | getStaffAttendance は既に isDeleted 除外済みのため、一覧には論理削除は表示されない |

### 5.2 admin_attendance_list_page.dart

| 変更 | 内容 |
|------|------|
| 休憩集計 | 各 attendance の breakMinutes を表示。breaks サブコレの件数・合計時間 |
| 時間表示 | actualWorkMinutes, nightWorkMinutes を表示（フォールバック: totalMinutes, nightMinutes） |

### 5.3 all_staff_attendance_page_from_adminHome.dart

| 変更 | 内容 |
|------|------|
| 論理削除 | 論理削除を含めて表示し、削除済みとわかるように表示（getAllStaffAttendance は既に isDeleted 返却済み） |
| ハイライト | 対象期間外給与換算時（payrollReflectedAt が対象期間と異なる場合）、給与データ表示でハイライト表示 |

### 5.4 staff_attendance_detail_page_from_allStaffAttendance.dart

| 変更 | 内容 |
|------|------|
| 時間表示 | totalMinutes → actualWorkMinutes（フォールバック: totalMinutes）。nightMinutes → nightWorkMinutes（フォールバック: nightMinutes） |
| 休憩表示 | breakMinutes、breaks 一覧を表示 |
| 論理削除 | isDeleted: true の attendance を「削除済み」と表示 |

### 5.5 daily_attendance_detail_page_from_staffAttendanceDetail.dart

| 変更 | 内容 |
|------|------|
| 時間表示 | actualWorkMinutes, nightWorkMinutes, breakMinutes を表示 |
| 休憩詳細 | breaks サブコレの一覧表示 |
| 論理削除 | 削除済み attendance の表示 |

### 5.6 monthlyPayrollTrigger.ts

**Flow1 参照**: セクション 7.5

| 変更 | 内容 |
|------|------|
| 時間フィールド | 新規 attendances（actualWorkMinutes, nightWorkMinutes が存在）はそれを使用。既存 attendances（存在しない場合）は totalMinutes, nightMinutes を継続使用 |
| 論理削除 | isDeleted: true の attendance は給与計算対象外 |
| payrollReflectedAt | 給与計算対象にした attendance に付与。形式: `{periodStartStr}-{periodEndStr}`（例: "2025-03-26-2025-04-25"） |
| 未退勤等 | 給与期間締日時点で未退勤の attendance は対象外。payrollReflectedAt を付与せず、次回実行時に再評価 |
| attendanceLogs | 給与計算で attendances を更新（payrollReflectedAt 付与）した場合、actionType: 'monthly_payroll_reflect' で書き込み |

### 5.7 seedAttendancesDemo.ts

| 変更 | 内容 |
|------|------|
| 新フィールド | breakMinutes, actualWorkMinutes, nightWorkMinutes, isOnBreak: false, currentBreakStartedAt: null, breakCount: 0, lastActionType, lastActionAt, lastActionByDeviceId, manualReason: null, payrollReflectedAt: null, isDeleted: false, deletedAt: null, deletedBy: null |
| 休憩サンプル | 退勤済み attendance のうち 1〜2 件に breaks サブコレを追加 |
| 論理削除サンプル | 1 件を isDeleted: true, deletedAt, deletedBy: 'admin' で作成 |

### 5.8 public/staff/index.html

| 変更 | 内容 |
|------|------|
| 時間表示 | actualWorkMinutes（フォールバック: totalMinutes）、nightWorkMinutes（フォールバック: nightMinutes）で表示 |
| 論理削除 | 削除済み attendance とわかるように表示 |

---

## 6. 実装順序

```
Phase 0: 準備
  - 本 changeSpec の確認
  - 依存先（B〜E2）の完了サマリ・実コードの最終確認
  ↓ 【検証: 依存内容の理解】
Phase 1: monthlyPayrollTrigger の改修
  - actualWorkMinutes/nightWorkMinutes 使用、論理削除除外、payrollReflectedAt、attendanceLogs
  ↓ 【検証: Functions ビルド成功、テスト】
Phase 2: seedAttendancesDemo の改修
  - 新フィールド、休憩サンプル、論理削除サンプル
  ↓ 【検証: Functions ビルド成功】
Phase 3: UI 改修（Dart）
  - staffAttendancePage（休憩表示・操作、時間表示）
  - admin_attendance_list_page（休憩集計、時間表示）
  - staffAttendanceDetailPage、attendanceDetailPage（時間表示、休憩、論理削除）
  - allStaffAttendancePage（論理削除表示、ハイライト）
  ↓ 【検証: Flutter ビルド成功】
Phase 4: public/staff/index.html の改修
  - actualWorkMinutes, nightWorkMinutes、論理削除表示
  ↓ 【検証: 動作確認】
Phase 5: テスト作成・エミュレータ実行
  - monthlyPayrollTrigger のテスト
  ↓ 【検証: エミュレータで全テスト成功】
Phase 6: 実機確認
  - UI・休憩操作・給与計算・LINE 表示を一括確認
```

---

## 7. 検証ポイント

| # | 観点 | 方法 |
|---|------|------|
| 1 | monthlyPayrollTrigger が新規/既存で正しいフィールドを使用する | テスト: actualWorkMinutes あり/なしの attendance で検証 |
| 2 | monthlyPayrollTrigger が論理削除を除外する | テストで検証 |
| 3 | payrollReflectedAt が付与される | テストで検証 |
| 4 | attendanceLogs に monthly_payroll_reflect が書き込まれる | テストで検証 |
| 5 | 休憩表示・休憩操作が動作する | 実機確認 |
| 6 | 各画面で actualWorkMinutes, nightWorkMinutes, breakMinutes が表示される | 実機確認 |
| 7 | 論理削除が適切に表示される | 実機確認 |
| 8 | LINE で actualWorkMinutes, nightWorkMinutes、論理削除が表示される | 実機確認 |
| 9 | 対象期間外給与換算時のハイライト表示 | 実機確認 |

---

## 8. チェックリスト

### 実装時

- [ ] monthlyPayrollTrigger: actualWorkMinutes/nightWorkMinutes 使用（新規/既存切り替え）
- [ ] monthlyPayrollTrigger: 論理削除除外
- [ ] monthlyPayrollTrigger: payrollReflectedAt 付与
- [ ] monthlyPayrollTrigger: attendanceLogs 書き込み
- [ ] seedAttendancesDemo: 新フィールド・休憩サンプル・論理削除サンプル
- [ ] staffAttendancePage: 休憩表示・休憩操作、時間表示
- [ ] admin_attendance_list_page: 休憩集計、時間表示
- [ ] staffAttendanceDetailPage, attendanceDetailPage: 時間表示、休憩、論理削除
- [ ] allStaffAttendancePage: 論理削除表示、ハイライト
- [ ] public/staff/index.html: actualWorkMinutes, nightWorkMinutes、論理削除

### 確認時

- [ ] Functions ビルド成功
- [ ] Flutter ビルド成功
- [ ] テストファイル作成・エミュレータ実行
- [ ] 実機確認（UI・休憩・給与・LINE）

---

## 9. ロールバック手順

- monthlyPayrollTrigger: totalMinutes/nightMinutes に戻す。payrollReflectedAt 付与を削除
- seedAttendancesDemo: 旧形式に戻す
- UI: 旧表示に戻す

---

## 10. リスク・注意事項

- 既存 attendances への新フィールド一括付与・一括移行スクリプト・遅延付与は行わない（新規のみ）
- payrollReflectedAt の形式は `{periodStartStr}-{periodEndStr}`（YYYY-MM-DD 形式をハイフン連結）とする
- 対象期間外給与換算時のハイライトは、payrollReflectedAt が表示中の給与期間と異なる場合に表示する
