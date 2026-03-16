# Phase4 01: determineAttendanceMode 改修 — 実装計画書（改訂版）

**Phase4 03（閉店前確認・未退勤スタッフ）の先行実装を考慮した改修方針**

**最終決定日**: 2025-03-04

---

## 0. 決定事項一覧（本 chat で確定）

| # | 項目 | 決定内容 |
|---|------|----------|
| 1 | **勤怠記録タブの表示対象** | B: `currentBusinessDateKey` の当日 + 翌日。**ただし** `closedStoreWithoutClockOut=false` かつ `clockOut=null` の attendance は「未退勤として登録されていない、退勤前のデータ」として**別枠**で本ページに表示する |
| 2 | **status ≠ running 時の表示日** | **勤怠記録**: `lastClosedBusinessDateKey` の**日付**のデータ（無い場合は当日 JST を基準）。**シフト一覧**: `lastClosedBusinessDateKey` の**翌日**のシフト（無い場合は当日 JST の翌日） |
| 3 | **閉店後猶予時間** | **1時間固定**。閉店前確認画面に「閉店処理後から1時間以内は通常フローでの退勤が可能です」と表示。1時間以内は未退勤扱いではなく、**通常の勤怠処理**として扱う |
| 4 | **getUnclockedStaffForClose の対象** | **A**: 未退勤（`clockIn` あり & `clockOut` null）を**営業日でフィルタせずすべて**返す |
| 5 | **date の扱い** | 閉店処理では `date` は使わない。未退勤 attendance はすべて `closedStoreWithoutClockOut: true` を付与 |
| 6 | **エラー・警告判定** | `date` 不要。`staffId`・`closedStoreWithoutClockOut`・`clockIn`・`clockOut` のみで判定 |
| 7 | **status ≠ running 時の date 登録** | その時点の JST 日付で登録してよい。日付選択 UI は不要 |
| 8 | **タブ構成** | 勤務記録 / シフト一覧 / 未退勤シフト一覧の3タブ |
| 9 | **経過時間による例外** | **廃止**。退勤時の「出勤からの経過時間が一定を超える」による例外は行わない |
| 10 | **lastClosedBusinessDateKey が無い場合** | 当日（JST 基準）を基準とする |

---

## 1. 改修の目的・概要

| 項目 | 内容 |
|------|------|
| **目的** | シフトの起票と終了を操作として分離し、STORE_CLOSE_HOUR に依存しない設計にする |
| **効果** | 日跨ぎ勤務・終了し忘れを仕組みで抑制し、発生時には検知・修正可能にする |

---

## 2. 要件整理（改訂）

### 2.1 廃止するもの

- **既存 determineAttendanceMode**: 締め時間前後で出勤/退勤を自動判定するロジック
- **configOps.ts**: `getStoreCloseHour`, `normalizeStoreCloseHour`, `cronFromHourAndMinuteJst`, `getNightlyCronTriplet`（本番利用がなくなるため unused へ移動）

### 2.2 新規作成するもの

| Callable | 役割 | 主な処理 |
|----------|------|----------|
| **clockIn** | 出勤打刻 | 警告・エラー判定あり（2.3 参照） |
| **clockOut** | 退勤打刻 | 警告・エラー判定あり（2.3 参照） |

### 2.3 例外判定ロジック（警告・エラー分類）

#### clockIn（出勤）

| 種別 | 条件 | 表示メッセージ | 動作 |
|------|------|----------------|------|
| **警告** | そのスタッフに `closedStoreWithoutClockOut === true` の attendance が存在する | 「管理者に確認して、以前の出勤について正しいデータを入力して下さい。」 | **出勤登録は可能**。警告を表示しつつ、ユーザーに「続行可能」であることが分かるようにする |
| **エラー** | そのスタッフに `closedStoreWithoutClockOut === false`（または未設定）かつ `clockIn` に Timestamp が入り、かつ `clockOut === null` の attendance が**全期間で**1 件以上存在する | 「すでに出勤登録がされています。」 | **新規ドキュメント作成不可** |

**補足**:
- エラー対象は**全期間**（当日に限定しない）。閉店時に全期間の attendances を検証し未退勤にフラグを付与するため、このエラーは基本的に当日分との齟齬でのみ発生する想定。
- `closedStoreWithoutClockOut === true` の未退勤（閉店でマーク済み）はエラーに含めず、警告のみで出勤許可。
- `clockIn` の型は Firestore の **Timestamp**（`FieldValue.serverTimestamp()` で格納）。

#### clockOut（退勤）

| 種別 | 条件 | 表示メッセージ | 動作 |
|------|------|----------------|------|
| **警告** | そのスタッフに `closedStoreWithoutClockOut === true` の attendance が存在する | 「管理者に確認して、以前の出勤について正しいデータを入力して下さい。」 | **退勤打刻は可能**。警告を表示しつつ、ユーザーに「続行可能」であることが分かるようにする |
| **エラー** | 対象スタッフの「当日」attendance が存在しない、または存在するが `clockOut === null` のドキュメントがない（すべて退勤済み） | 「勤務中のデータがありません」 | **退勤処理不可** |

**補足**:
- 「当日」の定義は clockIn と同様。
- 退勤対象は `staffId` かつ `date === 当日` かつ `clockOut === null` かつ `clockIn != null` の 1 件。

### 2.4 閉店後一定時間の退勤許可について【確定】

**決定**: 閉店後 **1時間** は通常フローでの退勤を許可する。

| 項目 | 内容 |
|------|------|
| **猶予時間** | **1時間固定**（設定は不要） |
| **実現方式** | `closedStoreWithoutClockOut: true` 付与時に `closedAt: Timestamp` も attendance に付与。退勤時、`now - closedAt < 1時間` なら **通常の clockOut** で処理し、未退勤一覧やパスワード認証は不要 |
| **1時間超過後** | 未退勤一覧から `updateUnclockedAttendanceWithAuth`（パスワード認証）で退勤打刻 |
| **閉店前確認画面** | 「閉店処理後から1時間以内は通常フローでの退勤が可能です」と表示する |

---

## 3. attendance の `date` フィールド統一

### 3.0 date の扱い（セクション0・確定）

| 項目 | 内容 |
|------|------|
| フィールド名 | `date` のまま（変更しない） |
| 格納タイミング | clockIn 実行時の JST 日付（YYYY-MM-DD）を格納 |
| 用途 | ① 表示用（どの日付の attendance として表示するか）② 給与計算（X日〜Y日の勤怠を対象とするか） |
| clockIn / clockOut での利用 | 判定には使わない（エラー・警告は closedStoreWithoutClockOut, clockIn, clockOut で判定） |
| 閉店処理での利用 | 使わない |

### 3.1 フィールド仕様

| 項目 | 内容 |
|------|------|
| **フィールド名** | `date`（これのみ使用。currentBusinessDate は持たせない） |
| **型** | string（YYYY-MM-DD） |
| **意味** | 出勤日としての営業日キー |

### 3.2 値の取得ロジック

| 条件 | 取得元 | 備考 |
|------|--------|------|
| `storeMeta/currentBusinessDay.status === 'running'` | `storeMeta/currentBusinessDay.currentBusinessDateKey` | 開店処理済みが前提。そのまま出勤日として使用 |
| `status !== 'running'` | その時点の JST 日付で登録 | 日付選択 UI は不要 |

### 3.3 status ≠ running 時の画面表示日【確定】

閉店中等（開店処理前または閉店済み）のとき、各タブで表示する日付は以下とする。`lastClosedBusinessDateKey` が存在しない場合（初回開店前など）は、その時点の **当日（JST 基準）** を基準とする。

| タブ | 表示日 |
|------|--------|
| **勤怠記録** | `lastClosedBusinessDateKey` の**日付**のデータ（無い場合は当日 JST） |
| **シフト一覧** | `lastClosedBusinessDateKey` の**翌日**のシフト（無い場合は当日 JST の翌日） |

### 3.4 閉店中等（status が running でない）の出勤登録フロー

1. **表示文言**: 「開店処理前か、適切に開店処理がされていません。管理者に報告して下さい。なお、閉店の状態のまま出勤登録を行う場合は、その時点の日付で登録して下さい」

2. **日付**: その時点の JST 日付で登録。**日付選択 UI は不要**（決定7）。

### 3.5 勤怠記録タブの表示対象【確定】

| 条件 | 表示内容 |
|------|----------|
| **status === running** | `currentBusinessDateKey` の**当日**＋**翌日**の attendance（`date` でクエリ） |
| **status !== running** | 3.3 に従い `lastClosedBusinessDateKey` の日付のデータ |

**別枠表示**: `closedStoreWithoutClockOut === false` かつ `clockOut === null` の attendance は「未退勤として登録されていない、退勤前のデータ」として**別枠**で本ページに表示する。未登録・退勤前のデータを漏れなく一覧できるようにする。

### 3.6 影響範囲（`date` に統一）

| 対象 | 対応 |
|------|------|
| `createClockInRecord` | `date` に営業日を格納。storeMeta から営業日取得 |
| `createManualClockInRecord` | 同上 |
| `clockIn` | `date` に営業日を格納 |
| `getUnclockedStaffForClose` | **営業日フィルタなし**。未退勤（`clockIn` あり & `clockOut` null）を**すべて**返す（決定4） |
| `closeStoreTerminal` (markUnclockedAndForceEnd) | 営業日フィルタなし。未退勤すべてに `closedStoreWithoutClockOut: true` と `closedAt` を付与（決定5） |
| `unclocked_attendance_list_page` (Firestore snapshot) | `orderBy('date', ...)` のまま。`d['date']` を参照 |
| `getStaffListForAttendance` | `where('date', '==', todayString)` |
| `getAllStaffAttendance` | `date` で参照 |
| `approveAttendanceCorrectionRequest` | `date` で参照 |
| **firestore.indexes.json** | 既存の `date` を含むインデックスを継続使用 |

### 3.7 UI 仕様（勤怠管理・スタッフ打刻）

#### 名称・画面構成

- **名称**: 「スタッフ打刻」→「勤怠管理・スタッフ打刻」に変更
- **画面構成**: `tournament_home_page.dart` の ExpansionTile（トーナメント操作）と同様の、下に折りたたみ可能なアクションバーを配置
- **3ボタン**: 出勤登録（QR）、退勤登録（QR）、未退勤データの修正。使用側に合わせる

#### タブ構成（3タブ）

| タブ | 内容 |
|------|------|
| 勤怠記録 | 当日勤怠＋未退勤セクション |
| シフト一覧 | 指定日のシフト一覧＋勤務状態 |
| 未退勤シフト一覧 | 未退勤として登録された勤怠の一覧 |

#### 勤怠記録タブ

- **ヘッダ**: storeMeta/currentBusinessDay を snapshot で監視。AppBar に currentBusinessDateKey を表示（MM/DD(曜日)）。status が running のときのみ「当日」として扱う
- **セクション1「MM/DD(曜日)の勤怠データ」**: date === currentBusinessDateKey の attendances（status=running 時）。翌日の date 分も表示。カラム: staffsFullName, 勤務状況, date, clockIn, clockOut, totalMinutes, createdAt, updatedAt。勤務状況: clockOut===null→「勤務中」（薄い赤）、それ以外→「退勤済み」（薄い緑）。clockOut セル: null は薄い赤・空欄、値ありは薄い緑。各行右に「退勤処理」ボタン（勤務中: 有効、退勤済み: 無効＋グレーアウト、「準備中」ダイアログ）
- **セクション2「未退勤として登録された勤怠」**: closedStoreWithoutClockOut===true の attendances。同上のカラム・行アクション

#### シフト一覧タブ

- **表示日付**: status=running なら currentBusinessDateKey、それ以外は lastClosedBusinessDateKey の翌日
- **カラム**: staffName, 勤務状態（出勤前/勤務中/退勤済み）、開始時刻、終了時刻。勤務状態は attendances の date 一致で判定
- **行アクション**: 各行右に「出勤登録」ボタン。出勤前: 有効（現時点では「準備中」ダイアログ）。勤務中・退勤済み: 無効＋グレーアウト

---

## 4. Phase4 03 との整合性

### 4.1 閉店処理まわりの修正

| 箇所 | 修正内容 |
|------|----------|
| **getUnclockedStaffForClose** | **営業日フィルタなし**。未退勤（`clockIn` あり & `clockOut` null）をすべて返す（決定4） |
| **closeStoreTerminal** (markUnclockedAndForceEnd) | 未退勤 attendance に `closedStoreWithoutClockOut: true` と `closedAt: Timestamp` を付与。営業日フィルタは使わない（決定5） |
| **03_nightlyIntegrityCheck/SPEC.md** | getUnclockedStaffForClose は営業日フィルタなし、closedAt 付与を確定 |

### 4.2 closedStoreWithoutClockOut の扱い

- 新規 attendance 作成時: `closedStoreWithoutClockOut: false` をデフォルトで設定
- 閉店処理時: 未退勤 attendance に `closedStoreWithoutClockOut: true` と `closedAt: Timestamp` を付与

---

## 5. 実装順序

### Phase A: フィールド変更・storeMeta 連携

| 順 | タスク | 対象 | 備考 |
|----|--------|------|------|
| A1 | storeMeta から営業日取得する共通ロジック | repos/getCurrentBusinessDateKeyOrThrow 等 | status が running の場合の currentBusinessDateKey 取得 |
| A2 | createClockInRecord 改修 | createClockInRecord.ts | `date` に営業日を格納。status が running でない場合はその時点の JST 日付を使用（日付選択 UI 不要） |
| A3 | createManualClockInRecord 改修 | 同上 | 同上 |

### Phase B: clockIn / clockOut の新規作成

| 順 | タスク | 対象 | 備考 |
|----|--------|------|------|
| B1 | clockIn Callable 新規作成 | clockIn.ts | 警告: closedStoreWithoutClockOut あり。エラー: 全期間で closedStoreWithoutClockOut!==true の未退勤あり。出力に `warning` / `error` を分離 |
| B2 | clockOut Callable 新規作成 | clockOut.ts | 警告・エラー同上。エラー: 勤務中データなし |
| B3 | attendance/index の export 更新 | domains/attendance/index.ts | clockIn, clockOut を export |

### Phase C: 閉店処理・03 系の修正

| 順 | タスク | 対象 | 備考 |
|----|--------|------|------|
| C1 | getUnclockedStaffForClose | 営業日フィルタ廃止。未退勤をすべて返す | 決定4 |
| C2 | closeStoreTerminal | 未退勤 attendance に closedStoreWithoutClockOut + closedAt 付与 | markUnclockedAndForceEnd 内 |
| C3 | unclocked_attendance_list_page | `date` を参照（orderBy/where とも date を使用） | - |
| C4 | getStaffListForAttendance 等 | `date` でクエリ | その他 attendance 参照箇所 |

### Phase D: アプリ（Dart）改修

| 順 | タスク | 対象 | 備考 |
|----|--------|------|------|
| D1 | 出勤/退勤の操作分離 | qrScanPage.dart, attendanceService.dart | clockIn / clockOut を直接呼ぶ。勤怠管理ページから出勤/退勤を選択して QR ページに遷移 |
| D2 | 警告・エラーの UI 表示 | qrScanPage.dart 等 | 警告時は「続行可能」を明示。エラー時は処理不可を表示 |
| D3 | 閉店中等の出勤登録フロー | 出勤登録 UI | status が running でない場合、その時点の JST 日付で登録。日付選択 UI は不要（決定7） |
| D4 | 手動出退勤画面 | getStaffListForAttendance 呼び出し元 | 手動打刻も clockIn/clockOut を経由する設計。設定で許可/非許可を分岐（今後） |

### Phase E: 既存ロジックの廃止・configOps 整理

| 順 | タスク | 対象 | 備考 |
|----|--------|------|------|
| E1 | determineAttendanceMode を unused に移動 | unused_function_lib/ | export 削除 |
| E2 | configOps の整理 | shared/time/ | analytics 依存解消後に unused へ |
| E3 | firestore.indexes.json | `date` の既存インデックスを継続使用 | 変更なし |

---

## 6. 詳細設計メモ

### 6.1 clockIn の入出力

**入力**: `{ staffId: string, staffName: string }`  
（status が running でない場合は、その時点の JST 日付で自動登録。日付選択 UI は不要）

**出力（通常）**: `{ success: true, docId, message }`

**出力（警告あり・続行可）**: `{ success: true, docId, message, warning: "管理者に確認して、以前の出勤について正しいデータを入力して下さい。" }`

**出力（エラー）**: `{ success: false, code: 'already-clock-in', message: "すでに出勤登録がされています。" }`

### 6.2 clockOut の入出力

**入力**: `{ staffId: string }` または `{ docId: string }`。status が running でない場合も、その時点の JST 日付で対象を判定。

**出力（通常）**: `{ success: true, docId, message }`

**出力（警告あり・続行可）**: `{ success: true, docId, message, warning: "管理者に確認して、以前の出勤について正しいデータを入力して下さい。" }`

**出力（エラー）**: `{ success: false, code: 'no-unclocked-attendance', message: "勤務中のデータがありません" }`

### 6.3 日付の扱い（status ≠ running 時）

- **登録日**: その時点の JST 日付を使用。日付選択プルダウンは不要（決定7）
- **表示日**: 3.3 に従う。`lastClosedBusinessDateKey` が無い場合は当日（JST）を基準

---

## 7. 参照

- [CORRECTIONS_NEEDED.md](./CORRECTIONS_NEEDED.md) … 修正が必要な点の一覧（反映済み）
- [CHANGESPEC.md](./CHANGESPEC.md) … 実装用変更仕様書（実装順序・検証ポイント含む）
- [OVERVIEW.md](./OVERVIEW.md) … 変更方針の概要
- [DETERMINE_ATTENDANCE_MODE.md](../DETERMINE_ATTENDANCE_MODE.md) … 詳細仕様
- [D06_CONFIGOPS_CLEANUP.md](../D06_CONFIGOPS_CLEANUP.md) … configOps 廃止の背景
- [03_nightlyIntegrityCheck/SPEC.md](../03_nightlyIntegrityCheck/SPEC.md) … 閉店前確認・未退勤スタッフ取得の仕様
