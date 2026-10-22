# 4.1-E2: 修正申請・閉店処理改修 — 変更仕様書（changeSpec）

**対象**: [Flow2_IMPLEMENTATION_PHASES.md](../../Flow2_IMPLEMENTATION_PHASES.md) に基づく実装  
**本 step**: 4.1-E2。Flow2 セクション 7「4.1-E2」・セクション 4.2・セクション 5 を参照すること。

**最終更新**: 2025-03-04

---

## 0. changeSpec 作成時の共通ルール（全 step で実施）

**目的**: 漏れなく changeSpec を作成するため、以下のタイミングで所定の確認を行う。

| タイミング | 何を | 何のために | 参照先 |
|------------|------|------------|--------|
| **作成開始前** | 依存先の修正内容を確認する | 前段階の変更を理解した上で実装範囲を決めるため | Flow2 セクション 4.2「依存関係一覧」の該当 step の行 |
| **作成開始前** | 本 step の参照ファイル一覧を把握する | 変更対象・AS-IS 確認対象を漏れなく特定するため | Flow2 セクション 7「段階別参照ファイル」の 4.1-E2 |
| **作成開始前** | 参照ファイルをすべて開き、AS-IS の実装を把握する | 実コードの文脈を確認するため | 上記で把握したファイルの実コード |
| **作成中** | 本 step の To-Be 仕様を確認する | 変更内容が仕様と整合するため | Flow1_DETAILED_SPEC.md セクション 7 |
| **作成中** | 本 step の完了条件を確認する | 検証ポイント・チェックリストを完了条件と対応付けるため | Flow2 セクション 5「完了条件」の 4.1-E2 行 |

---

## 1. 概要・目的

- approveAttendanceCorrectionRequest で break 追加/修正/論理削除の反映、親再集計（recalculateAttendanceFromBreaks）を追加する
- closeStoreTerminal で休憩中未退勤の扱いを明確化する（休憩自動終了後に closedStoreWithoutClockOut を付与。workingStatus は実装しない）
- closeStoreTerminal に attendanceLogs 書き込みを追加する
- 修正申請提出時に breaks を取得できるようにする（attendanceId を申請に含め、承認時に breaks を正しく扱う）

**完了条件（Flow2 セクション 5 より）**: 修正申請承認（approveAttendanceCorrectionRequest）で break 追加/修正/論理削除が反映され、親再集計される。closeStoreTerminal で休憩中未退勤の扱いが明確（workingStatus は実装しない）。修正申請提出画面で breaks を取得できる

---

## 2. 依存先の確認

| 依存先 | 確認すべき修正内容 |
|--------|-------------------|
| 4.1-B | approveAttendanceCorrectionRequest の B による変更内容（attendanceLogs 追加済み）。**stepB_completion_summary.md を確認** |
| 4.1-C | 親再集計ヘルパー（recalculateAttendanceFromBreaks）。**stepC_completion_summary.md を確認** |
| 4.1-E | getStaffAttendance の論理削除除外、breaks 取得の有無。**stepE_completion_summary.md を確認** |

**確認済み**:
- B: approveAttendanceCorrectionRequest は attendanceLogs に approve_correction_request を書き込み済み。totalMinutes, nightMinutes, actualWorkMinutes, nightWorkMinutes を手動計算で更新
- C: recalculateAttendanceFromBreaks(attendanceRef, attendanceData, config) で親を再集計。論理削除された break は休憩時間に含めない
- E: createAttendance, updateAttendance で breaks 操作。getStaffAttendance は isDeleted 除外済み

---

## 3. 対象ファイル一覧

### Functions（TypeScript）

| ファイル | 変更内容 |
|----------|----------|
| `functions/src/domains/attendance/callables/approveAttendanceCorrectionRequest.ts` | recalculateAttendanceFromBreaks を使用。break 追加/修正/論理削除の反映（申請スキーマ拡張時）。endActiveBreaksForClockOut は不要（承認時点で退勤済み想定） |
| `functions/src/domains/storeMeta/callables/closeStoreTerminal.ts` | markUnclockedAndForceEnd で休憩中（isOnBreak: true）の attendance に endActiveBreaksForClockOut 相当の処理を追加。attendanceLogs に close_store_unclocked を書き込み |

### Dart（Flutter）

| ファイル | 変更内容 |
|----------|----------|
| （なし） | attendanceCorrectionRequestsPage は承認・却下の管理画面。提出は public/staff/index.html |

### その他

| ファイル | 変更内容 |
|----------|----------|
| `public/staff/index.html` | 修正申請提出時に attendanceId を formData に含める。breaks 取得は optional（表示・申請に含める場合は Firestore から取得） |
| `functions/src/domains/attendance/callables/createAttendanceCorrectionRequest.ts` | attendanceId をオプションで受け取り、申請に保存 |

---

## 4. 現状（As-Is）

### 4.1 approveAttendanceCorrectionRequest.ts

- attendanceCorrectionRequests の申請を承認
- staffId + date で attendances を検索し、clockIn/clockOut を更新
- totalMinutes, nightMinutes, actualWorkMinutes, nightWorkMinutes を手動計算（calculateTotalMinutes, calculateNightWorkMinutes）
- recalculateAttendanceFromBreaks は使用していない
- break の追加/修正/論理削除の反映はなし
- attendanceLogs は B で追加済み

### 4.2 closeStoreTerminal.ts

- markUnclockedAndForceEnd で clockOut が null の attendances に closedStoreWithoutClockOut: true, closedAt を付与
- 休憩中（isOnBreak: true）の attendance に対する特別処理なし
- attendanceLogs への書き込みなし

### 4.3 public/staff/index.html（修正申請フォーム）

- currentAttendance から clockIn, clockOut を取得。attendanceId は含まれていない（attendanceData に id があれば利用可能）
- createAttendanceCorrectionRequest に date, type, currentClockIn, currentClockOut, newClockIn, newClockOut, reason, staffId, staffName を送信
- breaks の取得・送信はなし

### 4.4 createAttendanceCorrectionRequest.ts

- attendanceId を受け取っていない。staffId, date, type, clockIn/clockOut 等を受け取る

---

## 5. 変更後（To-Be）

### 5.1 approveAttendanceCorrectionRequest.ts

**Flow1 参照**: セクション 7.3

| 変更 | 内容 |
|------|------|
| 親再集計 | clockIn/clockOut 更新後、recalculateAttendanceFromBreaks を呼ぶ。手動の totalMinutes, nightMinutes, actualWorkMinutes, nightWorkMinutes 計算を廃止 |
| break 反映 | 申請に breaks 変更が含まれる場合（将来拡張）、breaks サブコレに反映してから recalculateAttendanceFromBreaks を呼ぶ。本 step では申請スキーマに break 変更がなければ、既存の clockIn/clockOut 更新 + recalculateAttendanceFromBreaks のみ |
| 処理順序 | 1. 申請承認（status: approved） 2. attendance の clockIn/clockOut 更新 3. recalculateAttendanceFromBreaks 呼び出し 4. totalMinutes, nightMinutes の更新（recalculate が actualWorkMinutes, nightWorkMinutes を更新するため、totalMinutes は clockOut - clockIn で算出） 5. writeAttendanceLog |

### 5.2 closeStoreTerminal.ts

**Flow1 参照**: セクション 7（workingStatus は実装しない）

| 変更 | 内容 |
|------|------|
| 休憩中未退勤 | markUnclockedAndForceEnd で、clockOut が null の attendances を処理する前に、isOnBreak: true のものを検出し、endActiveBreaksForClockOut 相当の処理（endedAt: null の break を closedAt で終了、isOnBreak: false に更新）を実行 |
| attendanceLogs | 各 attendance に closedStoreWithoutClockOut を付与した際、attendanceLogs に actionType: 'close_store_unclocked' を書き込み |

### 5.3 public/staff/index.html

| 変更 | 内容 |
|------|------|
| attendanceId | currentAttendance に id がある場合、formData に attendanceId を含める |
| breaks 取得 | 修正申請フォーム表示時、attendanceId があれば attendances/{id}/breaks を取得して表示（optional。4.1-F で UI 改修に含める可能性あり）。本 step では attendanceId の送信のみ |

### 5.4 createAttendanceCorrectionRequest.ts

| 変更 | 内容 |
|------|------|
| attendanceId | オプションで attendanceId を受け取り、申請データに保存。承認時に attendanceId があれば直接参照可能 |

---

## 6. 実装順序

```
Phase 0: 準備
  - 本 changeSpec の確認
  - 依存先（B, C, E）の完了サマリ・実コードの最終確認
  ↓ 【検証: 依存内容の理解】
Phase 1: approveAttendanceCorrectionRequest の親再集計化
  - recalculateAttendanceFromBreaks を呼ぶように変更
  - 手動計算を廃止
  ↓ 【検証: Functions ビルド成功】
Phase 2: closeStoreTerminal の休憩中未退勤対応
  - markUnclockedAndForceEnd で isOnBreak: true の attendance に endActiveBreaksForClockOut 相当の処理を追加
  - attendanceLogs に close_store_unclocked を書き込み
  ↓ 【検証: Functions ビルド成功】
Phase 3: 修正申請に attendanceId を含める
  - createAttendanceCorrectionRequest で attendanceId を受け取る
  - public/staff/index.html で attendanceId を formData に含める
  ↓ 【検証: 動作確認】
Phase 4: テスト作成・エミュレータ実行
  - approveAttendanceCorrectionRequest のテスト更新
  - closeStoreTerminal の休憩中未退勤テスト追加
```

---

## 7. 検証ポイント

| # | 観点 | 方法 |
|---|------|------|
| 1 | approveAttendanceCorrectionRequest で recalculateAttendanceFromBreaks が呼ばれ、actualWorkMinutes, nightWorkMinutes が正しく算出される | テスト: break ありの attendance で修正申請承認後、breakMinutes, actualWorkMinutes を確認 |
| 2 | closeStoreTerminal で休憩中未退勤の attendance に対して break が自動終了する | テスト: isOnBreak: true, endedAt: null の break がある attendance で markUnclockedAndForceEnd 実行後、break の endedAt を確認 |
| 3 | closeStoreTerminal で attendanceLogs に close_store_unclocked が書き込まれる | テストで検証 |
| 4 | 修正申請提出時に attendanceId が含まれる | public/staff/index.html の formData を確認 |

---

## 8. チェックリスト

### 実装時

- [x] approveAttendanceCorrectionRequest: recalculateAttendanceFromBreaks を使用
- [x] closeStoreTerminal: 休憩中未退勤に endActiveBreaksForClockOut 相当の処理を追加
- [x] closeStoreTerminal: attendanceLogs に close_store_unclocked を書き込み
- [x] createAttendanceCorrectionRequest: attendanceId をオプションで受け取る
- [x] public/staff/index.html: formData に attendanceId を含める

### 確認時

- [x] Functions ビルド成功
- [x] テストファイル作成・更新・エミュレータ実行

---

## 9. ロールバック手順

- approveAttendanceCorrectionRequest: 手動計算に戻す
- closeStoreTerminal: 休憩中処理・attendanceLogs を削除
- createAttendanceCorrectionRequest: attendanceId 受け取りを削除
- public/staff/index.html: attendanceId 送信を削除

---

## 10. リスク・注意事項

- workingStatus は実装しない。closeStoreTerminal では closedStoreWithoutClockOut, closedAt の付与のみ
- 申請スキーマに break 追加/修正/論理削除が含まれる場合の反映は、スキーマ拡張後に別途実装。本 step では clockIn/clockOut 更新 + recalculateAttendanceFromBreaks に集約
- endActiveBreaksForClockOut は recalculateAttendanceFromBreaks.ts に定義。closeStoreTerminal から import して使用
