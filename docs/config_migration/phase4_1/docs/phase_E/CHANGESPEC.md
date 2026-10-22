# 4.1-E: 管理者フォーム Functions 化、論理削除ロジック — 変更仕様書（changeSpec）

**対象**: [Flow2_IMPLEMENTATION_PHASES.md](../../Flow2_IMPLEMENTATION_PHASES.md) に基づく実装  
**本 step**: 4.1-E。Flow2 セクション 7「4.1-E」・セクション 4.2・セクション 5 を参照すること。

**最終更新**: 2025-03-04

---

## 0. changeSpec 作成時の共通ルール（全 step で実施）

**目的**: 漏れなく changeSpec を作成するため、以下のタイミングで所定の確認を行う。

| タイミング | 何を | 何のために | 参照先 |
|------------|------|------------|--------|
| **作成開始前** | 依存先の修正内容を確認する | 前段階の変更を理解した上で実装範囲を決めるため | Flow2 セクション 4.2「依存関係一覧」の該当 step の行。**共通ルール: 必ず、依存先 step の完了サマリを確認し、必要に応じて実コードも確認する** |
| **作成開始前** | 本 step の参照ファイル一覧を把握する | 変更対象・AS-IS 確認対象を漏れなく特定するため | Flow2 セクション 7「段階別参照ファイル」の該当 step（4.1-E） |
| **作成開始前** | 参照ファイルをすべて開き、AS-IS の実装を把握する | grep 結果だけでなく実コードの文脈を確認するため | 上記で把握したファイルの実コード |
| **作成中** | 本 step の To-Be 仕様を確認する | 変更内容が仕様と整合するため | Flow1_DETAILED_SPEC.md セクション 6.3, 6.4, 6.5, 6.6 |
| **作成中** | 本 step の完了条件を確認する | 検証ポイント・チェックリストを完了条件と対応付けるため | Flow2 セクション 5「完了条件」の 4.1-E 行 |
| **作成完了前** | changeSpec のレビューを行う | 自己確認または他者確認で漏れを防ぐため | 本 changeSpec |

---

## 1. 概要・目的

- 管理者用勤怠作成 Callable（createAttendance）を新規作成する
- 管理者用勤怠編集 Callable（updateAttendance）を新規作成する（編集・break 操作・論理削除含む）
- admin_attendance_form_page の直接 Firestore 更新をやめ、上記 Callable 経由に変更する
- 論理削除ロジックを実装する（updateAttendance で論理削除可能、getStaffAttendance で除外、getAllStaffAttendance で削除済みとわかるように返却）
- createAttendance, updateAttendance に attendanceLogs 書き込みを追加する

**完了条件（Flow2 セクション 5 より）**: 管理者が createAttendance（staff・日付・clockIn 必須、break・clockOut 任意）、updateAttendance（編集・break 操作・論理削除含む、attendanceId/staffId の変更は不可）で勤怠を作成・編集できる。admin の勤怠作成・編集は直接 Firestore 更新をやめ、上記 Callable 経由とする。break の論理削除時はその時間を休憩と判定しない。getStaffAttendance で論理削除を除外。getAllStaffAttendance で論理削除を含め、削除された attendance とわかるように返却。admin 画面で論理削除操作可能。給与計算では論理削除を対象外とする（※ monthlyPayrollTrigger の論理削除除外は 4.1-F で実施）

---

## 2. 依存先の確認

| 依存先 | 確認すべき修正内容 |
|--------|-------------------|
| 4.1-B | attendances の isDeleted, deletedAt, deletedBy、getStaffAttendance/getAllStaffAttendance の返却構造。**stepB_completion_summary.md を確認** |
| 4.1-C | 親再集計ヘルパー（recalculateAttendanceFromBreaks）。**stepC_completion_summary.md を確認** |
| 4.1-D | 退勤系の休憩処理パターン（endActiveBreaksForClockOut → recalculateAttendanceFromBreaks）。**stepD_completion_summary.md を確認** |

**確認済み**:
- B: getStaffAttendance は isDeleted 除外済み。getAllStaffAttendance は isDeleted 返却済み。attendances 作成時に isDeleted: false, deletedAt: null, deletedBy: null を設定済み
- C: recalculateAttendanceFromBreaks(attendanceRef, attendanceData, config) で親を再集計。論理削除された break（isDeleted: true）は休憩時間に含めない
- D: 休憩中退勤時は endActiveBreaksForClockOut → recalculateAttendanceFromBreaks の順で処理

---

## 3. 対象ファイル一覧

### Functions（TypeScript）

| ファイル | 変更内容 |
|----------|----------|
| `functions/src/domains/attendance/callables/createAttendance.ts` | 新規。管理者用勤怠作成 Callable |
| `functions/src/domains/attendance/callables/updateAttendance.ts` | 新規。管理者用勤怠編集・break 操作・論理削除 Callable |
| `functions/src/domains/attendance/index.ts` | createAttendance, updateAttendance を export |
| `functions/src/domains/attendance/callables/getAllStaffAttendance.ts` | 論理削除を含め、deletedAt, deletedBy を返却して削除済みとわかるようにする（必要に応じて） |

### Dart（Flutter）

| ファイル | 変更内容 |
|----------|----------|
| `lib/AttendanceManagement/admin_attendance_editAndCreate_page.dart` | 直接 Firestore 更新をやめ、createAttendance / updateAttendance Callable 経由に変更。論理削除ボタン追加（編集時） |
| `lib/AttendanceManagement/admin_attendance_list_page.dart` | 一覧表示時に isDeleted の attendance を「削除済み」とわかるように表示。Firestore 直接 stream は継続（日付絞り込みのため） |

### その他

| ファイル | 変更内容 |
|----------|----------|
| なし |  |

---

## 4. 現状（As-Is）

### 4.1 admin_attendance_editAndCreate_page.dart

- **追加モード**: staff 選択、日付選択、clockIn（必須）、clockOut（任意）を入力し、`FirebaseFirestore.instance.collection('attendances').add(...)` で直接作成
- **編集モード**: attendanceDocId と initialData を受け取り、clockIn, clockOut を編集し、`FirebaseFirestore.instance.collection('attendances').doc(attendanceDocId).update(...)` で直接更新
- **保存データ**: staffId, staffsFullName, date, clockIn, clockOut, totalMinutes, nightMinutes, closedStoreWithoutClockOut: false, isManual: true
- **break**: UI なし。totalMinutes, nightMinutes はクライアントで計算（_calculateNightMinutes は 22〜5 時を深夜として算出）
- **論理削除**: UI なし

### 4.2 admin_attendance_list_page.dart

- Firestore の `attendances` を `where('date', isEqualTo: dateKey)` で stream 購読
- 各 attendance を ListTile で表示。編集ボタンで AdminAttendanceFormPage.edit を開く
- isDeleted の考慮なし

### 4.3 getStaffAttendance.ts

- isDeleted === true を除外済み（4.1-B で実装）
- breakMinutes, actualWorkMinutes, nightWorkMinutes を返却済み

### 4.4 getAllStaffAttendance.ts

- isDeleted を返却済み（attendanceData を spread しているため deletedAt, deletedBy も含まれる）
- 論理削除を含めて返却。削除済みとわかる表示は呼び出し側（UI）の責務

---

## 5. 変更後（To-Be）

### 5.1 createAttendance（新規 Callable）

**Flow1 参照**: セクション 6.3

| 項目 | 内容 |
|------|------|
| **権限** | 呼び出し元 device の role が 'admin' であること |
| **必須引数** | staffId: string, staffName: string（または staffsFullName）, date: string（YYYY-MM-DD）, clockIn: Timestamp |
| **任意引数** | clockOut: Timestamp \| null, breaks?: Array<{ startedAt: Timestamp, endedAt: Timestamp }> |
| **処理** | staffs から fullName を取得（staffName 未指定時）。attendances に doc を追加。4.1-B の新フィールドを全て設定（breakMinutes, actualWorkMinutes, nightWorkMinutes, isOnBreak, currentBreakStartedAt, breakCount, lastActionType, lastActionAt, lastActionByDeviceId, manualReason, payrollReflectedAt, isDeleted: false, deletedAt: null, deletedBy: null）。clockOut がある場合は totalMinutes を算出し、recalculateAttendanceFromBreaks を呼んで actualWorkMinutes, nightWorkMinutes を確定。breaks が渡された場合は breaks サブコレに doc を追加し、recalculateAttendanceFromBreaks を呼ぶ |
| **成功時** | `{ success: true, docId: string, message: string }` |
| **attendanceLogs** | actionType: 'create_attendance' |
| **エラー** | unauthenticated, permission-denied（admin でない）, invalid-argument（必須引数欠損）, not-found（staff が存在しない） |

**date のデフォルト**: 呼び出し元（Dart）で営業日を取得して渡す。storeMeta/currentBusinessDay の status が running なら currentBusinessDateKey、それ以外は JST 当日を YYYY-MM-DD で渡す。

### 5.2 updateAttendance（新規 Callable）

**Flow1 参照**: セクション 6.4, 6.5

| 項目 | 内容 |
|------|------|
| **権限** | 呼び出し元 device の role が 'admin' であること |
| **必須引数** | attendanceId: string |
| **任意引数** | clockIn?: Timestamp, clockOut?: Timestamp \| null, addBreak?: { startedAt: Timestamp, endedAt: Timestamp }, deleteBreakIds?: string[], markDeleted?: boolean |
| **制約** | attendanceId の変更不可。staffId の変更不可 |
| **処理** | attendance を取得。markDeleted が true の場合は isDeleted: true, deletedAt: Timestamp.now(), deletedBy: 'admin' を設定。clockIn/clockOut の更新時は recalculateAttendanceFromBreaks を呼ぶ。addBreak 時は breaks サブコレに doc を追加し、recalculateAttendanceFromBreaks を呼ぶ。deleteBreakIds 時は各 break に isDeleted: true, deletedAt: Timestamp を設定し、recalculateAttendanceFromBreaks を呼ぶ |
| **成功時** | `{ success: true, message: string }` |
| **attendanceLogs** | actionType: 'update_attendance' |
| **エラー** | unauthenticated, permission-denied, invalid-argument, not-found, failed-precondition（既に論理削除済み等） |

**break 論理削除の扱い（Flow1 6.5）**: 論理削除された break の時間は休憩と判定しない。recalculateAttendanceFromBreaks は既に isDeleted: true の break を休憩時間に含めない。

### 5.3 admin_attendance_editAndCreate_page.dart

| 変更 | 内容 |
|------|------|
| 追加モード | FirebaseFirestore add をやめ、createAttendance Callable を呼ぶ。引数: staffId, staffName, date, clockIn, clockOut |
| 編集モード | FirebaseFirestore update をやめ、updateAttendance Callable を呼ぶ。引数: attendanceId, clockIn, clockOut |
| 論理削除 | 編集画面に「論理削除」ボタンを追加。クリック時に強めの警告ダイアログを表示し、確認後に updateAttendance({ attendanceId, markDeleted: true }) を呼ぶ |
| Firebase 参照 | Cloud Functions の createAttendance, updateAttendance を httpsCallable で呼ぶ。attendanceService にメソッドを追加するか、直接 FirebaseFunctions を参照 |

### 5.4 admin_attendance_list_page.dart

| 変更 | 内容 |
|------|------|
| 一覧表示 | 各 attendance の isDeleted が true の場合、「削除済み」等の表示を追加。タイルの色やサブテキストで区別 |
| 編集 | 論理削除済みの attendance は編集不可とするか、編集画面を開いて「復元」や「確認のみ」とするか。本 step では論理削除済みは編集ボタンを無効化するか、編集画面で「削除済みです」と表示する |

### 5.5 getAllStaffAttendance.ts

| 変更 | 内容 |
|------|------|
| 返却 | isDeleted, deletedAt, deletedBy を明示的に含める。既に ...attendanceData で含まれている場合は変更不要。呼び出し側で「削除済み」と表示するために deletedAt または isDeleted があれば十分 |

---

## 6. 実装順序

```
Phase 0: 準備
  - 本 changeSpec の確認
  - 依存先（B, C, D）の完了サマリ・実コードの最終確認
  ↓ 【検証: 依存内容の理解】
Phase 1: createAttendance Callable 作成
  - createAttendance.ts を新規作成
  - index.ts に export 追加
  ↓ 【検証: Functions ビルド成功】
Phase 2: updateAttendance Callable 作成
  - updateAttendance.ts を新規作成（編集・break 操作・論理削除）
  - index.ts に export 追加
  ↓ 【検証: Functions ビルド成功】
Phase 3: admin_attendance_form_page の Callable 化
  - attendanceService に createAttendance, updateAttendance メソッドを追加（または直接 FirebaseFunctions 参照）
  - 追加モード: createAttendance 呼び出しに変更
  - 編集モード: updateAttendance 呼び出しに変更
  - 論理削除ボタン・ダイアログを追加
  ↓ 【検証: Flutter ビルド成功】
Phase 4: admin_attendance_list_page の論理削除表示
  - isDeleted の attendance を「削除済み」と表示
  - 論理削除済みの編集ボタン挙動を決定・実装
  ↓ 【検証: 動作確認】
Phase 5: テスト作成・エミュレータ実行
  - createAttendance.spec.ts, updateAttendance.spec.ts を作成
  - firebase emulators:exec でテスト実行
```

---

## 7. 検証ポイント

| # | 観点 | 方法 |
|---|------|------|
| 1 | createAttendance で勤怠が作成され、新フィールドが正しく設定される | テスト: staffId, date, clockIn を渡し、attendances に doc が作成されることを確認 |
| 2 | updateAttendance で clockIn/clockOut が更新され、recalculateAttendanceFromBreaks が呼ばれる | テスト: clockOut 更新後、actualWorkMinutes, nightWorkMinutes を確認 |
| 3 | updateAttendance で論理削除が可能 | テスト: markDeleted: true で isDeleted, deletedAt, deletedBy が設定されることを確認 |
| 4 | break 論理削除時、その時間が休憩に含まれない | テスト: deleteBreakIds で break を論理削除後、recalculateAttendanceFromBreaks で breakMinutes が減ることを確認 |
| 5 | getStaffAttendance で論理削除を除外 | 既存実装で確認済み |
| 6 | getAllStaffAttendance で論理削除を含め、削除済みとわかる | isDeleted, deletedAt が返ることを確認 |
| 7 | admin フォームが Callable 経由で動作する | 実機またはエミュレータで createAttendance, updateAttendance が呼ばれることを確認 |
| 8 | attendanceLogs に create_attendance, update_attendance が書き込まれる | 各 spec で検証 |

---

## 8. チェックリスト

### 実装時

- [ ] createAttendance Callable 作成
- [ ] updateAttendance Callable 作成（編集・break 操作・論理削除）
- [ ] index.ts に createAttendance, updateAttendance export 追加
- [ ] admin_attendance_form_page: createAttendance, updateAttendance 経由に変更
- [ ] admin_attendance_form_page: 論理削除ボタン・ダイアログ追加
- [ ] admin_attendance_list_page: isDeleted 表示対応
- [ ] attendanceService に createAttendance, updateAttendance メソッド追加（必要に応じて）

### 確認時

- [ ] Functions ビルド成功
- [ ] Flutter ビルド成功
- [ ] テストファイル作成（createAttendance.spec.ts, updateAttendance.spec.ts）
- [ ] エミュレータ起動・テスト実行で確認

---

## 9. ロールバック手順

- **createAttendance / updateAttendance**: 新規 Callable を削除し、index.ts から export を削除
- **admin_attendance_form_page**: 直接 Firestore 更新に戻す
- **admin_attendance_list_page**: isDeleted 表示を削除

---

## 10. リスク・注意事項

- createAttendance は createManualClockInRecord と異なり、任意の日付で作成可能。同じ staffId + date の重複は本 step ではチェックしない（既存 admin フォームも同様）
- updateAttendance の break 操作 UI は 4.1-F で追加する可能性がある。4.1-E では API を用意し、論理削除ボタンのみ UI に追加
- 権限は admin ロールに限定。device が存在し、role === 'admin' であることを確認する
- 給与計算（monthlyPayrollTrigger）の論理削除除外は 4.1-F で実施。4.1-E では updateAttendance で論理削除可能にし、getStaffAttendance で除外するまで
