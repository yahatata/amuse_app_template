# 旧フォルダ別棚卸し：staff

## 1. 対象フォルダの概要

**functions/src/staff** は、スタッフアカウント・シフト希望まわりの **onCall 入口 5 本** と **onSchedule 1 本**、および **index.ts** の計 7 ファイル。getShifts, createMultipleShifts, updateShiftRequest, confirmShiftRequest, createStaffAccount が onCall、scheduledCleanup が onSchedule。ルート index が `export * from "./staff"` で export。shift/helpers を getShifts, updateShiftRequest, createMultipleShifts が import。04 の「staff＝スタッフアカウント・シフト希望」にそのまま対応する。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①index.ts | ②— | ③No | ④— | ⑤— | ⑥6 関数を re-export | ⑦domains/staff（移行先で再構成） | ⑧No | ⑨staff の export 集約 |
| ①getShifts.ts | ②callable | ③Yes | ④Yes | ⑤shifts（読）, staffs（読）, shiftRequests（読）. shift/helpers（isInsufficientDaysNotificationSent 等）参照 | ⑥アプリ等から onCall。shift/helpers を import | ⑦domains/staff/callables | ⑧No | ⑨シフト一覧取得。shift ドメインのデータを読む |
| ①createMultipleShifts.ts | ②callable | ③Yes | ④Yes | ⑤staffs（読）, shifts/{ym}/days（書）, shiftRequests（書）. shift/helpers 参照 | ⑥アプリ等から onCall。shift/helpers を import | ⑦domains/staff/callables | ⑧No | ⑨複数シフト作成。shift の helpers でバリデーション等 |
| ①updateShiftRequest.ts | ②callable | ③Yes | ④Yes | ⑤staffs（読）, shiftRequests（書）. shift/helpers 参照 | ⑥アプリ等から onCall。shift/helpers を import | ⑦domains/staff/callables | ⑧No | ⑨シフト希望の更新 |
| ①confirmShiftRequest.ts | ②callable | ③Yes | ④Yes | ⑤shiftRequests（読・書） | ⑥アプリ等から onCall | ⑦domains/staff/callables | ⑧No | ⑨シフト希望の確認（承認/却下） |
| ①scheduledCleanup.ts | ②scheduler | ③Yes | ④Yes | ⑤shifts（読・削除）. 却下後 7 日経過したシフトを削除 | ⑥Cloud Scheduler が毎日 2:00 JST で実行。onSchedule | ⑦domains/staff/scheduler | ⑧No | ⑨却下シフトの自動削除。shifts は shift ドメインのデータだが、スタッフ向けクリーンアップとして staff の scheduler に配置 |
| ①createStaffAccount.ts | ②callable | ③Yes | ④Yes | ⑤staffs（書） | ⑥アプリ等から onCall | ⑦domains/staff/callables | ⑧No | ⑨スタッフアカウント作成 |

## 3. 追加メモ

- **入口**：getShifts, createMultipleShifts, updateShiftRequest, confirmShiftRequest, createStaffAccount の 5 本は **onCall**、scheduledCleanup は **onSchedule**。③入口はいずれも Yes。
- **export**：staff/index が 6 関数を re-export し、ルート index が `export * from "./staff"` で export しているため、④export = Yes。
- **移行先**：04 のドメイン一覧「staff＝スタッフアカウント・シフト希望」に一致。**domains/staff/callables**（5 本）、**domains/staff/scheduler**（1 本）に配置する。
- **shift との関係**：getShifts, createMultipleShifts, updateShiftRequest が **shift/helpers** を import（assertStaffExists, assertHourStep, getYearMonthFromDateKey, isInShiftSchedulingPeriod, isInsufficientDaysNotificationSent, isInsufficientDayOrTimeSlot）。移行後も staff から shift の services/repos（helpers の移行先）を参照する形になる。境界は「スタッフアカウント・シフト希望」が staff、「シフト・営業時間・募集」が shift。staff はシフト希望の入力を担い、shift はシフト・営業時間のデータとロジックを提供する。
- **未使用候補**：該当なし。全ファイルが staff/index から export され、ルート index 経由でデプロイ対象となる。

## 4. 次アクション

- **設計**：staff ドメイン設計で、5 callable を **domains/staff/callables**、scheduledCleanup を **domains/staff/scheduler** に移す方針を記載する。**shift/helpers** への import パスを shift の移行先（domains/shift/services 等）に合わせて更新する。
- **changeSpec**：staff 移管時に、ルート index の **import パス** を `domains/staff`（または staff の index）に更新する。shift/helpers を参照している 3 ファイルの import パスを shift の移行先に合わせて更新する。export 名は変更しない（03_設計ルール 4.4）。
- **05_入口一覧**：移行先確定後、staff 配下の 6 入口の配置を「staff/callables」「staff/scheduler」に更新する。
