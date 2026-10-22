# 旧フォルダ別棚卸し：shift

## 1. 対象フォルダの概要

**functions/src/shift** は、シフト・営業時間・募集まわりの **onCall 入口 13 本** と **onSchedule 1 本**、および内部利用の **helpers / businessHoursCore / styles / holidayHelper** からなる。shift/index が 14 の入口を re-export。**ルート index に shift を export する**ことを 08 で確定済み（移行後は `export * from "./domains/shift"` を追加）。staff が shift/helpers を import。

**方針**：**営業日（businessDate）・営業時間の作成・編集**に関わる処理は、shift だけでなく scheduler（weeklyPlanner）や bills 系（calcBusinessDate）などさまざまな処理で参照・利用される。そのためこれらは **shift に格納せず、shared に営業日・営業時間用のフォルダを新設し、その中に格納する**。移行先は **shared/businessHours**（新規カテゴリ。08_意思決定ログに記録）とする。シフト専用の入口・内部モジュールのみ **domains/shift** に残す。

## 2. 棚卸し表

### 2.1 集約・入口（15 ファイル）

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①index.ts | ②— | ③No | ④— | ⑤— | ⑥14 の入口を re-export。ルート index は shift を export していない | ⑦domains/shift（移行先で再構成。営業時間関連 5 は shared/businessHours に移るため、shift 側は 9 入口の集約となる） | ⑧No | ⑨shift の export 集約。移行後は shift 専用 9 本のみ shift に残す |
| ①initBusinessHoursForMonth.ts | ②callable | ③Yes | ④Yes | ⑤businessHoursMonthly（書）, businessHoursMonthlyMap（書）. businessHoursCore 利用 | ⑥アプリ等から onCall。helpers, businessHoursCore 参照 | ⑦**shared/businessHours**（callables 相当。営業日・営業時間の作成。複数処理で利用するため shared に配置） | ⑧No | ⑨月次営業時間初期化。08 にカテゴリ追加を記録 |
| ①initShiftDaysForMonth.ts | ②callable | ③Yes | ④Yes | ⑤businessHoursMonthlyMap（読）, shifts/{ym}/days（書）. businessHoursCore 利用 | ⑥アプリ等から onCall。helpers, businessHoursCore 参照 | ⑦domains/shift/callables | ⑧No | ⑨月次シフト日次ドキュメント作成 |
| ①interimConfirmRequests.ts | ②callable | ③Yes | ④Yes | ⑤shiftRequests（読・書）, shifts（読）, helpers 経由で devices 等 | ⑥アプリ等から onCall。helpers 参照 | ⑦domains/shift/callables | ⑧No | ⑨中間確認リクエスト |
| ①updateDayAssignments.ts | ②callable | ③Yes | ④Yes | ⑤shifts/{ym}/days（書）, shiftRequests（読）. helpers 経由 | ⑥アプリ等から onCall。helpers 参照 | ⑦domains/shift/callables | ⑧No | ⑨日次アサイン更新 |
| ①finalizeDay.ts | ②callable | ③Yes | ④Yes | ⑤shifts/{ym}/days（書）, shiftRequests（書）. helpers 参照 | ⑥アプリ等から onCall。helpers 参照 | ⑦domains/shift/callables | ⑧No | ⑨日確定 |
| ①finalizeMonth.ts | ②callable | ③Yes | ④Yes | ⑤shifts（読・書）, helpers 経由 | ⑥アプリ等から onCall。helpers 参照 | ⑦domains/shift/callables | ⑧No | ⑨月確定 |
| ①setSufficientOverride.ts | ②callable | ③Yes | ④Yes | ⑤shifts（書）. helpers 経由 | ⑥アプリ等から onCall。helpers 参照 | ⑦domains/shift/callables | ⑧No | ⑨充足オーバーライド |
| ①calculateInsufficientDays.ts | ②callable | ③Yes | ④Yes | ⑤shifts（読）. helpers 経由 | ⑥アプリ等から onCall。helpers 参照 | ⑦domains/shift/callables | ⑧No | ⑨不足日数計算 |
| ①createRecruitments.ts | ②callable | ③Yes | ④Yes | ⑤shifts（読）, shiftRecruitments（書）, devices（読）. helpers 参照 | ⑥アプリ等から onCall。helpers 参照 | ⑦domains/shift/callables | ⑧No | ⑨募集作成 |
| ①sendRecruitmentNotification.ts | ②callable | ③Yes | ④Yes | ⑤外部（FCM 等）。helpers（assertAdminDevice）参照 | ⑥アプリ等から onCall。helpers 参照 | ⑦domains/shift/callables | ⑧No | ⑨募集通知送信 |
| ①generateBusinessHoursForMonthFromStyles.ts | ②callable | ③Yes | ④Yes | ⑤businessHoursMonthly, businessHoursMonthlyMap（書）. businessHoursCore, holidayHelper, styles 参照 | ⑥アプリ等から onCall | ⑦**shared/businessHours**（営業時間の作成・編集。複数処理で利用するため shared に配置） | ⑧No | ⑨スタイルから月次営業時間生成 |
| ①generateBusinessHoursForYearFromStyles.ts | ②callable | ③Yes | ④Yes | ⑤同上（年単位）. businessHoursCore, holidayHelper, styles 参照 | ⑥アプリ等から onCall | ⑦**shared/businessHours**（同上） | ⑧No | ⑨スタイルから年次営業時間生成 |
| ①setBusinessHoursManualForDay.ts | ②callable | ③Yes | ④Yes | ⑤businessHoursMonthlyMap（書）. businessHoursCore, styles, helpers 参照 | ⑥アプリ等から onCall | ⑦**shared/businessHours**（営業時間の手動編集。複数処理で利用するため shared に配置） | ⑧No | ⑨指定日の営業時間を手動設定 |
| ①scheduleGenerateNextYearBusinessHours.ts | ②scheduler | ③Yes | ④Yes | ⑤businessHoursMonthly, businessHoursMonthlyMap（書）. businessHoursCore, holidayHelper, styles 参照 | ⑥Cloud Scheduler が定期実行。onSchedule | ⑦**shared/businessHours**（scheduler 相当。翌年営業時間の生成。複数処理で利用するため shared に配置） | ⑧No | ⑨翌年営業時間をスケジュールで生成 |

### 2.2 内部利用（4 ファイル + 型定義）

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①helpers.ts | ②service/repos | ③No | ④No | ⑤devices（読）, staffs（読）, businessHoursMonthlyMap（読）, shifts（読・書）. getYearMonthFromDateKey, assertHourStep, validateWithinBusinessHours, resolveDeviceByInstallationId, assertStaffExists, assertAdminDevice, isInShiftSchedulingPeriod, isInsufficientDaysNotificationSent, isInsufficientDayOrTimeSlot, calculateIsSufficient, checkAndSetAllDaysFinalized 等 | ⑥shift 内の callables 多数、および **staff**（getShifts, updateShiftRequest, createMultipleShifts） | ⑦domains/shift/services または repos | ⑧No | ⑨shift と staff で共有。Firestore 読書あり |
| ①businessHoursCore.ts | ②service/repos | ③No | ④No | ⑤businessHoursMonthly（書）, businessHoursMonthlyMap（書）. upsertBusinessHoursForMonth, syncBusinessHoursToShifts | ⑥上記 5 入口および initShiftDaysForMonth（shift）が参照。移行後は shared/businessHours 内と shift から参照 | ⑦**shared/businessHours**（営業時間の共通書込。営業日・営業時間の作成・編集の核となるため shared に配置） | ⑧No | ⑨営業時間の共通書込・shifts 同期。syncBusinessHoursToShifts は shift が利用 |
| ①styles.ts | ②service | ③No | ④No | ⑤なし（定数定義のみ。Flutter と同期） | ⑥setBusinessHoursManualForDay, scheduleGenerateNextYearBusinessHours, generateBusinessHoursForMonthFromStyles, generateBusinessHoursForYearFromStyles | ⑦**shared/businessHours**（営業時間スタイル定義。営業日・営業時間の作成に利用されるため shared に配置） | ⑧No | ⑨BUSINESS_HOURS_STYLES。Firestore に触らない |
| ①holidayHelper.ts | ②service | ③No | ④No | ⑤なし（japanese-holidays で祝日判定） | ⑥scheduleGenerateNextYearBusinessHours, generateBusinessHoursForMonthFromStyles, generateBusinessHoursForYearFromStyles | ⑦**shared/businessHours**（祝日判定は営業時間スタイル決定に利用。shared に配置） | ⑧No | ⑨determineStyleId, isJapaneseHoliday, getWeekday 等 |
| ①japanese-holidays.d.ts | ②— | ③No | ④— | ⑤なし（型定義） | ⑥holidayHelper が japanese-holidays を利用 | ⑦**shared/businessHours**（型定義として holidayHelper に付随） | ⑧No | ⑨japanese-holidays の型宣言 |

## 3. 追加メモ

- **入口**：initBusinessHoursForMonth, initShiftDaysForMonth, interimConfirmRequests, updateDayAssignments, finalizeDay, finalizeMonth, setSufficientOverride, calculateInsufficientDays, createRecruitments, sendRecruitmentNotification, generateBusinessHoursForMonthFromStyles, generateBusinessHoursForYearFromStyles, setBusinessHoursManualForDay の 13 本は **onCall**、scheduleGenerateNextYearBusinessHours は **onSchedule**。③入口はいずれも Yes。
- **export**：shift/index が上記 14 を re-export。**ルート index は shift を export していない**ため、現状デプロイ時に shift の Cloud Functions が含まれるか要確認。④は shift/index から辿れるかで Yes（入口 14）、内部 4 ファイルは No。
- **移行先の分離**：
  - **shared/businessHours**（新規カテゴリ）：営業日・営業時間の**作成・編集**に関わる処理。scheduler（weeklyPlanner）、bills 系（calcBusinessDate）など複数処理で businessHoursMonthlyMap 等を参照・利用するため、shift に閉じず **shared** に配置する。対象は initBusinessHoursForMonth, generateBusinessHoursForMonthFromStyles, generateBusinessHoursForYearFromStyles, setBusinessHoursManualForDay, scheduleGenerateNextYearBusinessHours の 5 入口と、businessHoursCore, styles, holidayHelper, japanese-holidays.d.ts。01 の shared カテゴリ追加に該当するため **08_意思決定ログに記録**する。
  - **domains/shift**：シフト・募集専用。initShiftDaysForMonth（営業時間を**参照**してシフト日次を作成）, interimConfirmRequests, updateDayAssignments, finalizeDay, finalizeMonth, setSufficientOverride, calculateInsufficientDays, createRecruitments, sendRecruitmentNotification の 9 入口と、helpers（staff と共有）。04 の「shift＝シフト・営業時間・募集」のうち、営業時間の**定義・作成・編集**は shared に分離し、**シフト・募集**のみ shift に残す。
- **staff との関係**：staff（getShifts, updateShiftRequest, createMultipleShifts）が **shift/helpers** を import。移行後も staff から shift の services/repos を参照する形になる。
- **未使用候補**：該当なし。japanese-holidays.d.ts は holidayHelper が利用するライブラリの型定義。

## 4. 次アクション

- **08_意思決定ログ**：**shared/businessHours** を新規カテゴリとして追加する旨を記録する。理由：営業日・営業時間の作成・編集は shift 以外（scheduler/weeklyPlanner、bills/calcBusinessDate 等）でも利用するため、shared に配置する。
- **設計**：**shared/businessHours** の配置は 00_shared に記載済み。**domains/shift** 設計では、残り 9 入口と helpers を callables / services に移す方針。**ルート index に shift を export する**ことを 08 で確定済み。
- **changeSpec**：shared/businessHours 移管時と shift 移管時に、**staff** の shift/helpers への **import パス** を `domains/shift/services` に更新する。営業時間関連の 5 入口と 4 内部ファイルは shared/businessHours への import パスに更新する。ルート index に `export * from "./domains/shift"` を追加する。
- **05_入口一覧**：shift の 9 入口を「shift/callables」、shared/businessHours の 5 入口を「shared/businessHours（callables/scheduler）」として 05 に追加・更新する。
