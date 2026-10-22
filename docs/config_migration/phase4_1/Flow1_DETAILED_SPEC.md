# Phase4.1: To-Be 仕様書（Flow1 成果物）

**本ドキュメント**: Flow1（細かい仕様の決定）の成果物。正本。  
**旧ドキュメント**: [TOBE_SPEC_DRAFT.md](./TOBE_SPEC_DRAFT.md) は参照用。本ドキュメントが正本。

**参照**: [WORKFLOW.md](./WORKFLOW.md) / [Flow0_IMPACT_ANALYSIS.md](./Flow0_IMPACT_ANALYSIS.md)

---

## 1. 概要・方針（確定済み）

### 1.1 改修の性質

attendances の「意味」と「更新責務」を作り直す改修。休憩導入と整合性・責務整理の両方を含む。

### 1.2 重要な5点

| # | 項目 | 概要 |
|---|------|------|
| 1 | 計算体系の変更 | totalMinutes / nightMinutes → actualWorkMinutes / breakMinutes / nightWorkMinutes |
| 2 | breaks サブコレ | 休憩詳細は `attendances/{attendanceId}/breaks` で保持。親に集計値を反映 |
| 3 | 更新経路の統一 | 休憩・勤務時間再計算は Functions に寄せる。**Firestore への書き込みは Function 経由とする** |
| 4 | 表示の前提変更 | 一覧は親 doc の集計値。詳細・修正・承認では breaks も扱う |
| 5 | ログ基盤 | attendanceLogs コレクションの追加 |

### 1.3 仕様変更（workingStatus を実装しない）

workingStatus は実装しない。closeStoreTerminal での workingStatus 付与は行わない。

### 1.4 既存データ移行方針（Flow0 で決定）

- 既存 attendances への新フィールド付与: **新規のみ**
- nightMinutes → nightWorkMinutes: **新規のみ**
- 既存 attendances は変更不要

---

## 2. breaks スキーマ

### 2.1 配置

`attendances/{attendanceId}/breaks/{breakId}`

### 2.2 フィールド一覧

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| startedAt | Timestamp | ○ | 休憩開始時刻 |
| endedAt | Timestamp \| null | - | 休憩終了時刻（休憩中は null） |
| isDeleted | boolean | ○ | 論理削除フラグ。デフォルト: false |
| deletedAt | Timestamp \| null | - | 論理削除日時。デフォルト: null |
| createdAt | Timestamp | ○ | 作成日時 |
| updatedAt | Timestamp | ○ | 更新日時 |

**論理削除**: isDeleted と deletedAt の両方を持つ。論理削除時は isDeleted: true, deletedAt: Timestamp を設定。

**論理削除された break の扱い**: その時間を休憩と判定しない。削除した break の時間が勤務時間に含まれていれば勤務時間とし、含まれていなければ勤務時間としない。

### 2.3 Firestore インデックス

**必須**: 親 attendance に紐づく breaks を `startedAt` 昇順で取得するクエリに対応するインデックス。

---

## 3. attendanceLogs スキーマ

### 3.1 配置

独立コレクション `attendanceLogs/{logId}`（storeId は不要）

### 3.2 フィールド一覧

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| attendanceId | string | ○ | 対象 attendance の docId |
| actionType | string | ○ | どの関数で行われたか識別する値（例: clock_in, clock_out, break_start, break_end, createAttendance, updateAttendance 等） |
| performedAt | Timestamp | ○ | 実行日時 |
| performedByUid | string \| null | - | 実行ユーザー UID。**QR が用いられた時のみ**入る想定 |
| performedByDeviceId | string \| null | - | 実行デバイス ID。**アプリからの操作で書き換えや作成が行われた場合は必須**（LINE からの修正申請以外は入る想定） |

**actionType**: attendance の生成・更新（break サブコレ含む）を行う関数全てでログを残す。actionType 一覧はセクション 3.4 参照。

**ログ表示**: actionType を日本語の操作名称に変換して表示する。日本語への変換はセクション 3.4 の一覧に従う。

### 3.3 クエリパターン（必須）

| パターン | 説明 |
|----------|------|
| attendanceId 指定で時系列取得 | 特定 attendance の操作履歴 |
| 日付範囲指定で時系列取得 | 監査・デバッグ用 |

### 3.4 actionType 一覧（確定）

attendance の生成・更新（break サブコレ含む）を行う関数全てに対応する actionType。ログ表示時は日本語の操作名称に変換する。

**対象関数（Flow2 より）**: 4.1-B（clockIn, createManualClockInRecord, clockOut, updateManualClockOutRecord, updateUnclockedAttendanceWithAuth, approveAttendanceCorrectionRequest）、4.1-C（startBreak, endBreak）、4.1-E（createAttendance, updateAttendance）、4.1-E2（closeStoreTerminal）、4.1-F（monthlyPayrollTrigger）

| actionType | 日本語表示 | 対応関数 |
|------------|------------|----------|
| clock_in | 出勤打刻 | clockIn |
| clock_out | 退勤打刻 | clockOut |
| create_manual_clock_in | 手動出勤登録 | createManualClockInRecord |
| update_manual_clock_out | 手動退勤登録 | updateManualClockOutRecord |
| password_clock_out | パスワード退勤 | updateUnclockedAttendanceWithAuth |
| start_break | 休憩開始 | startBreak |
| end_break | 休憩終了 | endBreak |
| create_attendance | 勤怠作成（管理者） | createAttendance |
| update_attendance | 勤怠更新（管理者） | updateAttendance |
| approve_correction_request | 修正申請承認 | approveAttendanceCorrectionRequest |
| close_store_unclocked | 閉店時未退勤処理 | closeStoreTerminal |
| monthly_payroll_reflect | 給与計算反映 | monthlyPayrollTrigger |

---

## 4. config 夜間労働時間

### 4.1 配置

`storeMeta/config` の `attendance` オブジェクト内

```ts
attendance: {
  nightWorkStartHour: number;  // デフォルト: 22
  nightWorkEndHour: number;    // デフォルト: 5
}
```

### 4.2 追加作業

- **defaults.ts**: `DEFAULT_NIGHT_WORK_START_HOUR = 22`, `DEFAULT_NIGHT_WORK_END_HOUR = 5` を追加
- **configLoader**: buildFromDefaults に attendance のマッピングを追加
- **types.ts**: StoreConfig に `attendance?: { nightWorkStartHour?: number; nightWorkEndHour?: number }` を追加

---

## 5. attendances 親フィールド（To-Be）

### 5.1 新規追加

| フィールド | 型 | 説明 |
|-----------|-----|------|
| breakMinutes | number | 確定済み累計休憩時間 |
| actualWorkMinutes | number \| null | 実勤務時間（退勤前は null） |
| nightWorkMinutes | number | 深夜労働時間（休憩控除後） |
| isOnBreak | boolean | 休憩中か |
| currentBreakStartedAt | Timestamp \| null | 現在の休憩開始時刻 |
| breakCount | number | 休憩回数 |
| lastActionType | string | clock_in \| clock_out \| break_start \| break_end \| ... |
| lastActionAt | Timestamp | 最終操作時刻 |
| lastActionByDeviceId | string \| null | 最終操作デバイス ID |
| manualReason | string \| null | 手動理由 |
| **payrollReflectedAt** | **string \| null** | **給与計算への反映済みを示すフィールド。給与期間識別子を格納。給与計算次にフラグ付けする。給与締日時点で未退勤となった attendances 等、給与計算の対象とできなかったデータを次回給与支給時の対象とするため。対象期間以外の給与を換算するときには事後通知とし、給与データ表示画面でハイライト表示する。** ※ 形式（例: "2025-03" や "20250326-20250425"）は 4.1-F の changeSpec で決定する |
| **isDeleted** | **boolean** | **論理削除フラグ。デフォルト: false** |
| **deletedAt** | **Timestamp \| null** | **論理削除日時。デフォルト: null** |
| **deletedBy** | **string \| null** | **削除実施元の識別。申請による削除か、admin の修正による削除かを識別可能にする（例: "correction_request" \| "admin"）** |

### 5.2 廃止

- nightMinutes → nightWorkMinutes に移行（新規作成分のみ）

---

## 6. 新規 Callable I/O

### 6.1 startBreak

| 項目 | 内容 |
|------|------|
| 引数 | `{ attendanceId: string }`。**UI で attendance を表示する際に attendanceId を必ず持たせる**（同一スタッフの同一日の勤務が複数存在し得るため。表示はしないが data 属性等で持たせる） |
| 成功時 | `{ success: true, breakId: string, message: string }` |
| エラー | already-exists（休憩中）, not-found, permission-denied 等 |

### 6.2 endBreak

| 項目 | 内容 |
|------|------|
| 引数 | `{ attendanceId: string, breakId: string }` |
| 成功時 | `{ success: true, message: string }` |
| エラー | not-found, failed-precondition（既に終了済み）等 |

### 6.3 管理者用 attendance 作成 Callable

| 項目 | 内容 |
|------|------|
| **必須** | staff の選択（氏名を表示した上で選ばせる）、日付の選択（デフォルトはその時点の営業日）、clockIn（開始時間の入力） |
| **任意** | break、clockOut の登録（登録もできるが必須ではない） |

### 6.4 管理者用 attendance 編集 Callable

| 項目 | 内容 |
|------|------|
| 対象 | 対象の attendance を選択して編集可能。論理削除も可能（強めの警告をダイアログで必ず出す） |
| 制約 | 対象となる attendanceId の変更不可。attendance の持つ staff（staffId）の変更不可 |
| 論理削除時 | 給与計算に反映されない。**表示・処理範囲はセクション 6.6 参照** |

### 6.5 管理者用 break 操作

- break に限らず Firestore への書き込みは Function 経由とする
- attendance 編集 Callable に含められるならそれで OK
- break の論理削除: シンプルにその時間を break と判定しない。削除した break の時間が勤務時間に含まれていれば勤務時間とし、含まれていなければ勤務時間としない

### 6.6 attendance 論理削除時の表示・処理範囲

| 取得/画面 | 表示 | 備考 |
|----------|------|------|
| **getStaffAttendance** | **表示しない** | 論理削除（isDeleted: true）を除外 |
| **getAllStaffAttendance** | **表示する** | 削除された attendance とわかるように表示 |
| **LINE でスタッフが確認** | **表示する** | 削除された attendance とわかるように表示 |
| admin 画面 | 表示する | 編集・論理削除操作可能 |

**給与計算**: 論理削除された attendance は対象外。

**フラグ**: isDeleted, deletedAt, deletedBy の 3 つを用意。deletedBy で申請による削除か admin の修正による削除かを識別可能にする。

---

## 7. 既存 Callable の変更概要

### 7.1 clockIn / createManualClockInRecord

休憩系初期値の追加: breakMinutes: 0, actualWorkMinutes: null, isOnBreak: false, currentBreakStartedAt: null, breakCount: 0, lastActionType: 'clock_in', lastActionAt, lastActionByDeviceId 等

### 7.2 clockOut / updateManualClockOutRecord / updateUnclockedAttendanceWithAuth

休憩中退勤時: 休憩自動終了 → breaks 反映 → 親再集計 → clockOut, actualWorkMinutes, nightWorkMinutes 確定。夜間労働時間は config から取得。

### 7.3 approveAttendanceCorrectionRequest

break 追加/修正/論理削除反映 → 親再集計。totalMinutes / nightMinutes → actualWorkMinutes / nightWorkMinutes への変更。

### 7.4 getStaffAttendance / getAllStaffAttendance

返却に breakMinutes, actualWorkMinutes, nightWorkMinutes を含める。既存データは nightMinutes のまま返す（新規のみ nightWorkMinutes）。

**論理削除の扱い**: getStaffAttendance では論理削除を除外して返却。getAllStaffAttendance では論理削除を含めて返却し、削除された attendance とわかるようにする。LINE でスタッフが確認する際も同様に、削除された attendance とわかるように表示する。

### 7.5 monthlyPayrollTrigger

新規 attendances: actualWorkMinutes, nightWorkMinutes を使用。既存 attendances: totalMinutes, nightMinutes を継続使用。論理削除された attendance は対象外。

**payrollReflectedAt**: 給与計算対象にした attendance に付与。未退勤等で対象外になった attendance は付与せず、次回実行時に再評価。

**対象期間外給与換算時**: 事後通知で OK。**必ず給与データの表示を行う画面で、ハイライトして表示する**（店舗責任者への認識を与える）。

---

## 8. 既存データ移行

Flow0 で決定済み: **新規のみ**。一括スクリプト・遅延付与は行わない。

---

## 9. 要判断・検討項目

| # | 項目 | 状態 |
|---|------|------|
| 1 | actionType 日本語表示 | **確定済み**。セクション 3.4 参照 |
