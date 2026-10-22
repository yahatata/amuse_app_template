# 01: determineAttendanceMode 改修 — 変更方針の概要

**最終決定日**: 2025-03-04

**決定事項の概要**: [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) の「0. 決定事項一覧」を参照。主な確定内容: 勤怠記録タブは当日+翌日＋別枠（退勤前データ）、status≠running 時は勤怠=lastClosedBusinessDateKey の日付・シフト=翌日、閉店後1時間は通常退勤可、getUnclockedStaffForClose は未退勤をすべて返す。

---

## 1. 目的

- シフトの起票と終了を操作として分離し、閉店時間（STORE_CLOSE_HOUR）に依存しない設計にする
- 日跨ぎ勤務・終了し忘れを、仕組みで抑制し、発生時には検知・修正可能にする

---

## 2. 方針（案）

### 2.1 既存 determineAttendanceMode の扱い

**推奨**: 既存 `determineAttendanceMode` を `unused_function_lib` に移動し、**新規に起票用・終了用の Callable を 2 つ作成**する。

- 既存の「締め時間前後で出勤/退勤を自動判定」するロジックは廃止
- 新 Callable: `clockIn`（起票）、`clockOut`（終了）
- UI から明示的に「出勤」または「退勤」を選択して呼び出す形に統一

### 2.2 新規 Callable

| Callable | 役割 | 主な処理 |
|----------|------|----------|
| `clockIn` | 出勤打刻 | 未退勤の attendance が存在する場合は例外。管理者認証で解消可能 |
| `clockOut` | 退勤打刻 | 勤務中データがない場合はエラー。**経過時間による例外は廃止** |

### 2.3 日跨ぎ・終了し忘れへの対応

- **日跨ぎ**: 起票から終了まで日を跨ぐ場合あり。経過時間による例外は廃止のため、通常の退勤処理で対応
- **終了し忘れ**: 未退勤の attendance がある状態での新規起票を例外とし、管理者認証で解消（先に退勤を促す or 管理画面で対応）

### 2.4 対象ファイル（想定）

- **TS**: `functions/src/domains/attendance/callables/determineAttendanceMode.ts` → unused に移動
- **TS**: 新規 `clockIn.ts`, `clockOut.ts`
- **Dart**: シフト登録 UI に紐づくファイル（`attendanceService.dart`, `qrScanPage.dart` 等）— 出勤/退勤の操作を分離

### 2.5 Phase4 03（閉店処理用整合性チェック）との関係

- **03 で追加する attendance 参照**: 閉店前未退勤スタッフ取得（`clockIn` あり `clockOut` なし、**営業日フィルタなしですべて返す**）、`closedStoreWithoutClockOut`・`closedAt` フラグの付与・参照
- **閉店後猶予**: 閉店処理後 **1時間** 以内は通常フローで退勤可能。閉店前確認画面にその旨を表示
- **01 実施時の確認必須事項**:
  - 03 で追加した attendance の取得ロジック（date, clockIn, clockOut 等）が 01 改修後も正しく動作するか確認すること
  - `closedStoreWithoutClockOut` のデフォルト値付与を attendance 作成時に行う場合、01 の clockIn/clockOut 作成ロジックと整合させること
  - 参照: [03_nightlyIntegrityCheck/SPEC.md](../03_nightlyIntegrityCheck/SPEC.md)

---

## 3. configOps / getStoreCloseHour の廃止

### 3.1 configOps.ts の現状

`functions/src/shared/time/configOps.ts` に定義されている関数:

| 関数 | 役割 | 本番での利用元 |
|------|------|----------------|
| `normalizeStoreCloseHour` | 締め時間の正規化 | determineAttendanceMode のみ |
| `getStoreCloseHour` | 締め時間取得 | determineAttendanceMode のみ |
| `cronFromHourAndMinuteJst` | JST から cron 文字列生成 | getNightlyCronTriplet 経由（nightlyReconciliationCheck: unused） |
| `getNightlyCronTriplet` | 夜間ジョブ用 cron 3 つ | nightlyReconciliationCheck（unused）のみ |

### 3.2 廃止方針

**推奨**: determineAttendanceMode 改修により上記 4 関数の本番利用がなくなるため、**configOps.ts 一式を `unused_function_lib` に移動**する。

- `shared/time/index.ts` から configOps の export を削除
- `shared/time/generateJstDateKey` は `openStore`, `openStoreTerminal` で利用中のため残す
- 他に configOps を参照している本番コードがなければ、configOps.ts を unused に移す

---

## 4. 参照

- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) … 実装計画（順序・Phase4 03 整合性・詳細設計）
- [DETERMINE_ATTENDANCE_MODE.md](../DETERMINE_ATTENDANCE_MODE.md) … 詳細仕様
- [D06_CONFIGOPS_CLEANUP.md](../D06_CONFIGOPS_CLEANUP.md) … configOps 廃止の背景
