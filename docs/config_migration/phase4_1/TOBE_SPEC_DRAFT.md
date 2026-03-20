# Phase4.1: attendances 休憩導入・To-Be 仕様書

**最終更新**: 2025-03-04

---

## 1. 概要・結論

### 1.1 改修の性質

今回の休憩導入は、単に breaks を足すだけでは足りない。**attendances の「意味」と「更新責務」を作り直す改修**となる。

また、休憩に関する修正と、それとは別枠の修正（整合性・責務の整理）の両方がある。

### 1.2 重要な5点

| # | 項目 | 概要 |
|---|------|------|
| 1 | 計算体系の変更 | totalMinutes / nightMinutes から actualWorkMinutes / breakMinutes / nightWorkMinutes への移行 |
| 2 | breaks サブコレ | 休憩詳細は `attendances/{attendanceId}/breaks` で保持。親に集計値を適切なタイミングで反映 |
| 3 | 更新経路の統一 | 休憩・勤務時間再計算は Functions に寄せる。Flutter 直接更新は危険 |
| 4 | 表示の前提変更 | 一覧は親 doc の集計値で可。詳細・修正・承認画面では breaks も扱う |
| 5 | ログ基盤 | attendanceLogs コレクションの追加が必要 |

---

## 2. 決定事項（確定済み）

### 2.1 データモデル

| 項目 | 内容 |
|------|------|
| breaks の配置 | `attendances/{attendanceId}/breaks/{breakId}` サブコレ |
| 休憩の正本 | breaks サブコレ。親 attendances は集計・表示用の派生値を持つ |
| 親への反映 | breaks に変更があった適切なタイミングで、必ず親 doc に再反映する |
| attendanceLogs | 独立コレクションとして追加 |
| **nightMinutes** | **廃止**。`nightWorkMinutes` を新設する。他機能との整合性を丁寧に実装する必要がある |

### 2.2 計算体系

| 項目 | 内容 |
|------|------|
| totalMinutes | 総在席時間（clockIn〜clockOut の差分。休憩控除前）。退勤前は 0 のまま |
| breakMinutes | 確定済み累計休憩時間 |
| actualWorkMinutes | 実勤務時間（休憩控除後） |
| nightWorkMinutes | 深夜労働時間（休憩控除後）。**夜間労働時間の定義（何時以降を深夜とするか）は storeMeta/config の設定から算出する** |
| 給与計算対象 | actualWorkMinutes と nightWorkMinutes を使用 |

### 2.3 既存経路の扱い

| 項目 | 決定 |
|------|------|
| createClockInRecord（旧出勤） | 削除または非推奨化 |
| updateClockOutRecord（旧退勤） | 削除または非推奨化 |

### 2.4 更新責務

| 項目 | 内容 |
|------|------|
| 再計算責務 | Functions 側に寄せる（管理者編集・修正申請承認含む） |
| admin_attendance_form_page | Functions 化（attendance 編集 Callable 新設） |

### 2.5 閉店・未退勤

| 項目 | 決定 |
|------|------|
| 閉店前確認での休憩中表示 | 表示しない |

### 2.6 仕様の変更（workingStatus を実装しない）

| 項目 | 決定 | 理由 |
|------|------|------|
| **workingStatus** | **実装しない** | クエリのためにあるべきフィールドだが、このステータスを用いたクエリを行う機会が多くなく、SSOT を崩すデメリットの方が大きいという判断 |

### 2.7 取得・表示

| 項目 | 決定 |
|------|------|
| getStaffAttendance | 親の集計値のみでOK。**ただし、修正申請を提出する画面では breaks を取得し、修正の申請を提出できる仕様とする** |
| getStaffListForAttendance | （workingStatus は実装しないため、返却対象外） |

### 2.8 デモデータ

| 項目 | 決定 |
|------|------|
| seedAttendancesDemo | 休憩あり・休憩中・論理削除済み break ありも含める |

### 2.9 実装方針（中心5則）

1. 休憩詳細の正本は breaks サブコレ
2. 親 attendances は集計・表示用の派生値を持つ
3. breaks に変更があった適切なタイミングで、必ず親 doc に再反映する
4. 管理者編集や修正申請承認も含め、再計算責務は Functions 側に寄せる
5. 給与計算は actualWorkMinutes と nightWorkMinutes を使う

---

## 3. AS-IS の整理

### 3.1 現在の attendances モデル

- **1勤務1レコード** の単純モデル
- 出勤で作成、退勤で更新
- 閉店時未退勤ならフラグ付与
- 修正申請承認や管理者編集で再更新

### 3.2 現在の主要フィールド

| フィールド | 説明 |
|-----------|------|
| staffId | スタッフID |
| staffsFullName | スタッフ氏名 |
| date | 勤怠日（YYYY-MM-DD） |
| clockIn | 出勤時刻 |
| clockOut | 退勤時刻 |
| closedStoreWithoutClockOut | 閉店時未退勤フラグ |
| closedAt | 閉店時未退勤付与時刻 |
| isManual | 手動打刻か |
| nightMinutes | 深夜時間（22:00〜05:00、休憩未考慮）→ **廃止予定** |
| totalMinutes | 勤務時間（clockIn〜clockOut 差分、休憩未考慮） |
| createdAt, updatedAt | 作成・更新日時 |
| correctedAt, correctedBy, correctionRequestId | 修正申請承認時のみ |

### 3.3 作成経路（AS-IS）

| 経路 | 説明 | To-Be |
|------|------|-------|
| clockIn Callable | QR出勤 | 維持・改修 |
| createManualClockInRecord Callable | 手動出勤 | 維持・改修 |
| createClockInRecord Callable | 旧UI | **削除または非推奨化** |
| admin_attendance_editAndCreate_page.dart | 直接 Firestore add | Functions 化 |
| seedAttendancesDemo Callable | デモデータ | 改修 |
| closeStoreTerminal.ts | 既存未退勤へのフラグ付与 | 改修 |

### 3.4 更新経路（AS-IS）

| 経路 | 説明 | To-Be |
|------|------|-------|
| clockOut Callable | QR退勤 | 維持・改修 |
| updateManualClockOutRecord Callable | 手動退勤 | 維持・改修 |
| updateClockOutRecord Callable | 旧UI退勤 | **削除または非推奨化** |
| updateUnclockedAttendanceWithAuth Callable | 未退勤一覧からパスワード付き退勤 | 維持・改修 |
| approveAttendanceCorrectionRequest Callable | 勤怠修正申請承認 | 維持・改修 |
| admin_attendance_editAndCreate_page.dart | 直接 Firestore update | Functions 化 |
| closeStoreTerminal.ts | closedStoreWithoutClockOut, closedAt 付与 | （workingStatus は実装しないため、変更なし） |

### 3.5 取得経路（AS-IS）

| 経路 | 説明 |
|------|------|
| staff_attendance_page_from_terminalHome.dart | date in [当日, 翌日] の stream |
| admin_attendance_list_page.dart | date == dateKey の stream |
| getStaffAttendance | 期間指定 |
| getAllStaffAttendance | 期間指定 |
| getStaffListForAttendance | 出勤済み/未出勤・退勤待ち判定 |
| getUnclockedStaffForClose | clockOut == null |

---

## 4. To-Be 変更必要箇所

### 4.1 データモデル変更

#### 4.1.1 attendances 親フィールド

| フィールド | 型 | 説明 |
|-----------|-----|------|
| breakMinutes | number | 確定済み累計休憩時間 |
| actualWorkMinutes | number \| null | 実勤務時間（退勤前は null 可） |
| nightWorkMinutes | number | 深夜労働時間（休憩控除後）。**nightMinutes は廃止** |
| isOnBreak | boolean | 休憩中か |
| currentBreakStartedAt | Timestamp \| null | 現在の休憩開始時刻 |
| breakCount | number | 休憩回数 |
| lastActionType | string | clock_in \| clock_out \| break_start \| break_end \| ... |
| lastActionAt | Timestamp | 最終操作時刻 |
| lastActionByDeviceId | string \| null | 最終操作デバイスID |
| manualReason | string \| null | 手動理由（必要に応じて） |

※ **workingStatus は実装しない**（2.6 仕様の変更 参照）

#### 4.1.2 夜間労働時間の定義

- **夜間労働時間の定義（何時以降の労働を深夜労働時間とするか）は storeMeta/config の設定に入れ、そこから算出する仕様とする**
- 現状がそうなっていなければ修正が必要。**確認事項**に含める

#### 4.1.3 breaks サブコレ

- `attendances/{attendanceId}/breaks/{breakId}`
- 休憩開始で doc 作成、終了で更新、削除は論理削除

#### 4.1.4 attendanceLogs

- 独立コレクション
- 全主要操作にログ保存トリガーを追加

### 4.2 作成処理の変更

| 処理 | 必要対応 |
|------|----------|
| clockIn | 休憩系初期値（breakMinutes:0, actualWorkMinutes:null, isOnBreak:false 等）を追加 |
| createManualClockInRecord | 同上 |
| admin_attendance_form_page 新規作成 | Functions 化（attendance 作成 Callable 新設） |
| seedAttendancesDemo | 新フィールド対応。休憩あり・休憩中・論理削除済み break ありのサンプルを含める |

### 4.3 更新処理の変更

| 処理 | 必要対応 |
|------|----------|
| clockOut | 休憩中なら自動終了 → breaks 反映 → 親再集計 → clockOut, actualWorkMinutes, nightWorkMinutes 確定 |
| updateManualClockOutRecord | 同上（clockOut と共通ヘルパー化） |
| updateUnclockedAttendanceWithAuth | 休憩を含めた再計算。閉店時 on_break の扱いを明確化 |
| approveAttendanceCorrectionRequest | break 追加/修正/論理削除反映 → 親再集計 |
| admin_attendance_form_page 更新 | Functions 化（attendance 編集 Callable 新設） |
| closeStoreTerminal | closedStoreWithoutClockOut, closedAt 付与のみ（workingStatus は実装しない） |

### 4.4 新規追加が必要な処理

| 処理 | 責務 |
|------|------|
| startBreak | 休憩開始、break doc 作成、親反映、ログ |
| endBreak | 休憩終了、break doc 更新、親反映、ログ |
| 管理者用 break 追加/修正/論理削除 | 同上 |
| 親再集計ヘルパー | breaks から breakMinutes, actualWorkMinutes, nightWorkMinutes 等を再計算。**夜間労働時間の定義は config から取得** |
| attendanceLogs 書き込みヘルパー | 全主要操作で呼び出し |

### 4.5 取得処理の変更

| 処理 | 必要対応 |
|------|----------|
| staffAttendancePage | breakMinutes, actualWorkMinutes 表示。休憩開始/終了操作追加（workingStatus は実装しないため、isOnBreak 等で状態判定） |
| admin_attendance_list_page | 一覧は親のみ継続。編集時に breaks 取得 |
| getStaffAttendance | 返却に breakMinutes, actualWorkMinutes, nightWorkMinutes 等を含める。**修正申請提出画面では breaks を別途取得し、修正の申請を提出できる仕様とする** |
| getAllStaffAttendance | 同上 |
| getStaffListForAttendance | workingStatus は返さない |
| getUnclockedStaffForClose | 休憩中表示はしない |

### 4.6 集計処理の変更

| 処理 | 必要対応 |
|------|----------|
| monthlyPayrollTrigger | totalMinutes/nightMinutes → actualWorkMinutes/nightWorkMinutes に変更 |

---

## 5. 確認が必要な箇所（現コード確認）

以下は実装前に現コード確認が必要。

| 項目 | 内容 |
|------|------|
| **夜間労働時間の定義** | storeMeta/config に「何時以降を深夜労働時間とするか」の設定があるか。なければ追加が必要 |
| admin_attendance_form_page の編集範囲 | どの画面導線から、どの程度編集可能か、他画面と共通化されているか |
| nightMinutes の利用箇所 | 全コードベースでの参照箇所。nightWorkMinutes への移行対象 |
| totalMinutes が実労働時間として前提化されている箇所 | 給与・表示・集計 |
| allStaffAttendancePage の実表示 | どのフィールドをどう表示しているか |
| 詳細画面群の表示内容 | staffAttendanceDetailPage, attendanceDetailPage 等 |
| 閉店時 未退勤 + 休憩中の競合 | 閉店処理が attendance にどこまで触るか、on_break の扱い |

---

## 6. 確認・判断が必要な項目（ユーザー回答待ち）

**前提**: workingStatus は実装しない（2.6 参照）。以下は workingStatus を除いた、回答が必要な項目。

| # | 項目 | 内容 | 推奨案 |
|---|------|------|--------|
| 1 | createClockInRecord / updateClockOutRecord の扱い | 削除するか、非推奨化（deprecated）のまま残すか | 呼び出し元なしのため削除推奨 |
| 2 | 既存 attendances の移行方針 | 新フィールド（breakMinutes, actualWorkMinutes, nightWorkMinutes 等）を一括スクリプトで付与するか、遅延付与するか、新規作成分のみ付与するか | 要検討 |
| 3 | attendances 読み取り箇所の洗い出し粒度 | 全 attendances 参照箇所を洗い出すか、新フィールド追加の影響が大きい箇所に限定するか | 影響が大きい箇所に限定で十分な場合あり |
| 4 | 既存データの nightMinutes → nightWorkMinutes 移行方針 | 一括移行するか、遅延付与（初回参照時等）するか、新規のみ nightWorkMinutes を使用するか | 要検討 |

---

## 7. 変更一覧（実装・確認対象）

### A. 追加が必要なデータ

- **attendances 親**: breakMinutes, actualWorkMinutes, nightWorkMinutes, isOnBreak, currentBreakStartedAt, breakCount, lastActionType, lastActionAt, lastActionByDeviceId, manualReason（**workingStatus は実装しない**）
- **廃止**: nightMinutes（nightWorkMinutes に移行）
- **storeMeta/config**: 夜間労働時間の定義（何時以降を深夜とするか）※未設定なら追加
- **サブコレ**: attendances/{attendanceId}/breaks
- **独立コレクション**: attendanceLogs

### B. 削除または非推奨化

- createClockInRecord Callable
- updateClockOutRecord Callable

### C. 新規追加が必要な処理

- startBreak, endBreak
- 管理者用 break 追加/修正/論理削除
- 管理者用 attendance 作成/編集 Callable（admin_attendance_form の Functions 化）
- break 再集計ヘルパー
- attendanceLogs 書き込みヘルパー

### D. 既存処理の変更が必要

- **作成系**: clockIn, createManualClockInRecord, admin_attendance_form_page 新規作成, seedAttendancesDemo
- **更新系**: clockOut, updateManualClockOutRecord, updateUnclockedAttendanceWithAuth, approveAttendanceCorrectionRequest, admin_attendance_form_page 更新, closeStoreTerminal
- **取得系**: staffAttendancePage, admin_attendance_list_page, getStaffAttendance, getAllStaffAttendance, getStaffListForAttendance, **修正申請提出画面（breaks 取得対応）**
- **集計系**: monthlyPayrollTrigger
