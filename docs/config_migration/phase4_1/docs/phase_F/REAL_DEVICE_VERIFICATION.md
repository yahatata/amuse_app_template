# 4.1-F: 実機確認観点 — UI と Functions の切り分け

**CHANGESPEC**: [CHANGESPEC.md](./CHANGESPEC.md)  
**本 step**: 4.1-F。実装・テスト完了後に実機で確認を行う。

---

## 1. 確認観点の切り分け

| 区分 | 確認対象 | 実施方法 |
|------|----------|----------|
| **UI 側** | 画面表示・操作・ユーザー体験 | 実機でアプリを操作し、表示・動作を目視確認 |
| **Functions 側** | ロジック・データ・副作用 | 単体テスト・エミュレータで検証。実機での確認は補足 |

---

## 2. UI 側の確認観点

### 2.1 staff_attendance_page_from_terminalHome（スタッフ勤怠一覧）

| # | 確認観点 | 期待する結果 | 確認方法 |
|---|----------|--------------|----------|
| 1 | 休憩表示 | 勤務中かつ休憩中の場合「休憩中」と表示される | 出勤→休憩開始→表示確認 |
| 2 | 休憩一覧 | breaks の開始〜終了時刻が一覧表示される | 休憩開始→休憩終了→一覧表示確認 |
| 3 | 休憩操作 | 休憩開始ボタンで startBreak が呼ばれ、休憩終了ボタンで endBreak が呼ばれる | ボタン操作→Firestore/ログで確認 |
| 4 | 勤務時間表示 | actualWorkMinutes（フォールバック: totalMinutes）が表示される | 退勤済み attendance の表示確認 |
| 5 | 深夜時間表示 | nightWorkMinutes（フォールバック: nightMinutes）が表示される | 22時以降の勤務で確認 |
| 6 | 休憩時間表示 | breakMinutes が表示される | 休憩ありの attendance で確認 |

### 2.2 admin_attendance_list_page（管理者勤怠一覧）

| # | 確認観点 | 期待する結果 | 確認方法 |
|---|----------|--------------|----------|
| 1 | 休憩集計 | 各 attendance の breakMinutes が表示される | 休憩ありの attendance で確認 |
| 2 | 勤務時間表示 | actualWorkMinutes, nightWorkMinutes が表示される | 一覧表示確認 |
| 3 | 論理削除表示 | 削除済み attendance が「削除済み」と表示され、編集ボタンが無効 | 論理削除済みで確認 |

### 2.3 staff_attendance_detail_page_from_allStaffAttendance（スタッフ勤怠詳細）

| # | 確認観点 | 期待する結果 | 確認方法 |
|---|----------|--------------|----------|
| 1 | 勤務時間表示 | actualWorkMinutes（フォールバック: totalMinutes）が表示される | 勤怠記録タブで確認 |
| 2 | 深夜時間表示 | nightWorkMinutes（フォールバック: nightMinutes）が表示される | 同上 |
| 3 | 休憩表示 | breakMinutes、breaks 一覧が表示される | 休憩ありの attendance で確認 |
| 4 | 論理削除表示 | 削除済み attendance が「削除済み」と表示される | 論理削除済みで確認 |

### 2.4 daily_attendance_detail_page_from_staffAttendanceDetail（勤怠詳細・日付単位）

| # | 確認観点 | 期待する結果 | 確認方法 |
|---|----------|--------------|----------|
| 1 | 勤務時間表示 | actualWorkMinutes, nightWorkMinutes, breakMinutes が表示される | 詳細表示確認 |
| 2 | 休憩詳細 | breaks サブコレの一覧が表示される | 休憩ありで確認 |
| 3 | 論理削除表示 | 削除済み attendance が「削除済み」と表示される | 論理削除済みで確認 |

### 2.5 all_staff_attendance_page_from_adminHome（全スタッフ勤怠・給与）

| # | 確認観点 | 期待する結果 | 確認方法 |
|---|----------|--------------|----------|
| 1 | 論理削除表示 | 削除済み attendance が「削除済み」とわかるように表示される | 論理削除済みで確認 |
| 2 | 対象期間外ハイライト | 対象期間外給与換算時、該当データがハイライト表示される | payrollReflectedAt が異なる期間のデータで確認 |

### 2.6 public/staff/index.html（LINE 表示）

| # | 確認観点 | 期待する結果 | 確認方法 |
|---|----------|--------------|----------|
| 1 | 勤務時間表示 | actualWorkMinutes（フォールバック: totalMinutes）が表示される | LINE でスタッフが確認 |
| 2 | 深夜時間表示 | nightWorkMinutes（フォールバック: nightMinutes）が表示される | 同上 |
| 3 | 論理削除表示 | 削除済み attendance が「削除済み」とわかるように表示される | 同上 |

---

## 3. Functions 側の確認観点（パターンと期待結果）

単体テスト・エミュレータで検証する。実機確認は補足。

### 3.1 monthlyPayrollTrigger — パターンと期待結果一覧

| # | パターン | 入力条件 | 期待する結果 |
|---|----------|----------|--------------|
| 1 | 新規 attendance（actualWorkMinutes あり） | 対象期間内、clockOut あり、actualWorkMinutes: 480, nightWorkMinutes: 60, isDeleted: false | 給与計算に actualWorkMinutes, nightWorkMinutes を使用。payrollReflectedAt に期間識別子を付与。attendanceLogs に monthly_payroll_reflect を書き込み |
| 2 | 既存 attendance（totalMinutes のみ） | 対象期間内、clockOut あり、totalMinutes: 480, nightMinutes: 60, actualWorkMinutes/nightWorkMinutes なし, isDeleted: false | 給与計算に totalMinutes, nightMinutes を使用。payrollReflectedAt を付与 |
| 3 | 論理削除 attendance | 対象期間内、isDeleted: true | 給与計算対象外。payrollReflectedAt を付与しない |
| 4 | 未退勤 attendance | 対象期間内、clockOut: null | 給与計算対象外。payrollReflectedAt を付与しない |
| 5 | 期間外 attendance | clockOut が対象期間外 | 給与計算対象外 |
| 6 | 混合（新規 + 既存） | 同一スタッフに新規 attendance と既存 attendance が混在 | 各 attendance のフィールドに応じて正しい時間を使用 |
| 7 | 論理削除除外後の集計 | 3 件中 1 件が isDeleted: true | 2 件のみ給与計算に含める |

### 3.2 seedAttendancesDemo — パターンと期待結果一覧

| # | パターン | 期待する結果 |
|---|----------|--------------|
| 1 | 勤務中（clockOut: null） | breakMinutes: 0, actualWorkMinutes: null, nightWorkMinutes: 0, isOnBreak: false, isDeleted: false 等の新フィールドが設定される |
| 2 | 退勤済み | totalMinutes, nightMinutes に加え actualWorkMinutes, nightWorkMinutes, breakMinutes が設定される |
| 3 | 休憩サンプル | 退勤済みのうち 1〜2 件に breaks サブコレが作成される |
| 4 | 論理削除サンプル | 1 件が isDeleted: true, deletedAt, deletedBy: 'admin' で作成される |

### 3.3 getStaffAttendance / getAllStaffAttendance（4.1-B で実装済み）

| # | パターン | 期待する結果 |
|---|----------|--------------|
| 1 | actualWorkMinutes あり | actualWorkMinutes を返却 |
| 2 | actualWorkMinutes なし | totalMinutes をフォールバックで返却 |
| 3 | nightWorkMinutes あり | nightWorkMinutes を返却 |
| 4 | nightWorkMinutes なし | nightMinutes をフォールバックで返却 |
| 5 | getStaffAttendance | isDeleted: true を除外 |
| 6 | getAllStaffAttendance | isDeleted を含めて返却 |

---

## 4. 実機確認順序（推奨）

1. **seedAttendancesDemo 実行** — デモデータ投入（休憩・論理削除あり）
2. **staff_attendance_page_from_terminalHome** — 休憩表示・休憩操作、時間表示の確認
3. **admin_attendance_list_page** — 休憩集計、時間表示、論理削除の確認
4. **staff_attendance_detail_page_from_allStaffAttendance / daily_attendance_detail_page_from_staffAttendanceDetail** — 詳細画面の確認
5. **all_staff_attendance_page_from_adminHome** — 給与計算画面、論理削除、ハイライトの確認
6. **public/staff/index.html** — LINE 表示の確認
7. **monthlyPayrollTrigger** — エミュレータでテスト実行後、実機で給与データの整合性を確認

---

## 5. 確認結果記録

| 区分 | 確認日 | 実施者 | 結果 | 備考 |
|------|--------|--------|------|------|
| UI 側 | | | | |
| Functions 側（テスト） | | | | |

