# 旧フォルダ別棚卸し：attendance

## 1. 対象フォルダの概要

**functions/src/attendance** は、**勤怠・打刻・修正・給与** まわりの Cloud Functions を置くフォルダ。出退勤の打刻（打刻モード判定・出勤・退勤・手動打刻）、勤怠一覧取得、勤怠修正依頼の作成・承認・却下、および月次給与計算の scheduler を提供する。04_新フォルダ構造のドメイン「attendance」にそのまま対応する。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①index.ts | ②— | ③No | ④— | ⑤— | ⑥集約のみ | ⑦domains/attendance（移行先で callables/scheduler 等から再 export して再構成） | ⑧No | ⑨export 集約。移行時に domains/attendance 配下の構成に合わせて再編する |
| ①determineAttendanceMode.ts | ②callable | ③Yes | ④Yes | ⑤staffs（読）, attendances（読）。config/ops 参照 | ⑥アプリ onCall | ⑦domains/attendance/callables | ⑧No | ⑨打刻モード判定（出勤/退勤）。店舗締め時間で日跨ぎ判定 |
| ①createClockInRecord.ts | ②callable | ③Yes | ④Yes | ⑤attendances（書） | ⑥アプリ onCall。lib/devicePermissions 参照 | ⑦domains/attendance/callables | ⑧No | ⑨出勤打刻。staff_entry_exit 権限 |
| ①updateClockOutRecord.ts | ②callable | ③Yes | ④Yes | ⑤attendances（読・書） | ⑥アプリ onCall | ⑦domains/attendance/callables | ⑧No | ⑨退勤打刻 |
| ①getStaffListForAttendance.ts | ②callable | ③Yes | ④Yes | ⑤staffs（読）, shifts（読）, attendances（読） | ⑥アプリ onCall | ⑦domains/attendance/callables | ⑧No | ⑨勤怠用スタッフ一覧（出勤/退勤モードで出し分け） |
| ①createManualClockInRecord.ts | ②callable | ③Yes | ④Yes | ⑤attendances（書） | ⑥アプリ onCall | ⑦domains/attendance/callables | ⑧No | ⑨手動出勤打刻 |
| ①updateManualClockOutRecord.ts | ②callable | ③Yes | ④Yes | ⑤attendances（読・書） | ⑥アプリ onCall | ⑦domains/attendance/callables | ⑧No | ⑨手動退勤打刻 |
| ①getAllStaffAttendance.ts | ②callable | ③Yes | ④Yes | ⑤staffs（読）, attendances（読）, shifts（読） | ⑥アプリ onCall | ⑦domains/attendance/callables | ⑧No | ⑨全スタッフ勤怠一覧 |
| ①getStaffAttendance.ts | ②callable | ③Yes | ④Yes | ⑤attendances（読） | ⑥アプリ onCall | ⑦domains/attendance/callables | ⑧No | ⑨スタッフ別勤怠取得 |
| ①createAttendanceCorrectionRequest.ts | ②callable | ③Yes | ④Yes | ⑤attendanceCorrectionRequests（書） | ⑥アプリ onCall | ⑦domains/attendance/callables | ⑧No | ⑨勤怠修正依頼の作成 |
| ①checkExistingCorrectionRequest.ts | ②callable | ③Yes | ④Yes | ⑤attendanceCorrectionRequests（読） | ⑥アプリ onCall | ⑦domains/attendance/callables | ⑧No | ⑨同一スタッフ・日付の修正依頼重複チェック |
| ①getAttendanceCorrectionRequests.ts | ②callable | ③Yes | ④Yes | ⑤attendanceCorrectionRequests（読） | ⑥アプリ onCall | ⑦domains/attendance/callables | ⑧No | ⑨修正依頼一覧取得 |
| ①approveAttendanceCorrectionRequest.ts | ②callable | ③Yes | ④Yes | ⑤attendanceCorrectionRequests（読・書）, attendances（書） | ⑥アプリ onCall | ⑦domains/attendance/callables | ⑧No | ⑨修正依頼承認（attendances を更新） |
| ①rejectAttendanceCorrectionRequest.ts | ②callable | ③Yes | ④Yes | ⑤attendanceCorrectionRequests（読・書） | ⑥アプリ onCall | ⑦domains/attendance/callables | ⑧No | ⑨修正依頼却下 |
| ①monthlyPayrollTrigger.ts | ②scheduler | ③Yes | ④Yes | ⑤staffs（読）, attendances（読）, monthlyPayroll（書） | ⑥onSchedule（毎月25日 23:59 JST） | ⑦domains/attendance/scheduler | ⑧No | ⑨月次給与計算。前月26日〜今月25日を集計し monthlyPayroll に追加 |

## 3. 追加メモ

- **入口**：callable 13 件・scheduler 1 件の計 14 件。いずれも attendance/index 経由でルート index に export されており、05_入口一覧と整合している。
- **他モジュール参照**：determineAttendanceMode は **config/ops**（getStoreCloseHour, normalizeStoreCloseHour）、createClockInRecord / updateClockOutRecord 等は **lib/devicePermissions**（getCallerDeviceByUid, hasRequiredOption, isActive）を参照。移行後も shared または該当ドメインから参照する形になる。
- **コレクション**：主に **staffs**（読）, **attendances**（読・書）, **shifts**（読）, **attendanceCorrectionRequests**（読・書）, **monthlyPayroll**（書）。他ドメイン（staff, shift）のコレクションを読むが、責務は勤怠・給与であるため移行先は domains/attendance のまま。
- **shared 候補**：なし。勤怠・給与に特化した処理のため、横断カテゴリにはしない。
- **未使用候補**：該当なし。全ファイルが attendance/index から export され、入口として利用されている。

## 4. 次アクション

- **設計**：attendance ドメイン設計（`新フォルダ別_設計/XX_attendance.md`）作成時に、上記の移行先（callables 13 件・scheduler 1 件・index 再構成）を反映する。config/ops・lib/devicePermissions への依存は設計に記載し、移行後パスのみ変更する。
- **changeSpec**：attendance 移管時に、ファイル移動と index の export パス付け替えを記載する。他ドメインからの import は存在しない。
- **05_入口一覧**：移行実施後、各入口の「現在パス」を新パスに更新する。05 には attendance 関連の callables と monthlyPayrollTrigger が「attendance / callables」「attendance / scheduler」として記載済み。
