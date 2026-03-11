# businessHoursStyles（営業時間スタイル）

## 設定の説明

営業日ごとに適用する営業時間スタイルのマスタ。weekday（平日）、weekendHoliday（週末・祝日）、event（イベント）、allDay（終日）、closed（休業）の 5 種類を定義する。businessHoursMonthlyMap の各日の `styleId` がこのスタイルを参照し、`openMinute` / `closeMinute` / `isClosed` で営業時間を決定する。

## 何を設定するのか

`storeMeta/config` の `businessHoursStyles` オブジェクト。各スタイルは `{ styleId, openMinute, closeMinute, isClosed }` の形式。未指定時は `defaults.ts` / `store_config_defaults.dart` のデフォルト値が使われる。

| スタイル | styleId | 説明 | デフォルト（openMinute / closeMinute / isClosed） |
|----------|---------|------|--------------------------------------------------|
| weekday | weekday | 平日 | 900 / 1500 / false（9:00〜15:00） |
| weekendHoliday | weekendHoliday | 週末・祝日 | 720 / 1500 / false（12:00〜15:00） |
| event | event | イベント | 600 / 1500 / false（10:00〜15:00） |
| allDay | allDay | 終日 | 360 / 1500 / false（6:00〜15:00） |
| closed | closed | 休業日 | 0 / 0 / true |

- **openMinute / closeMinute**: 0〜1440（分）。1440 超は翌日に繰り越し（例: 1500 = 翌日 1:00）。
- **isClosed**: `true` の場合は休業日として扱う。

## 取得失敗時

- **読めるがフィールドが存在しない**: 必ずデフォルト（5 スタイルすべて）を適用。
- **読めない（Firestore 障害等）**: デフォルトを正としてデフォルト処理を行う。

詳細は `docs/運用時資料/設定/取得失敗時の挙動設計.md` を参照。

## 不具合時の対応

1. リトライを必ず行う。
2. A,B（設定値の誤り・運用ミス）: デフォルトで実行＋エラーコード。
3. C,D（コードのバグ・不整合）: デフォルトで実行可能な場合は実行＋エラーコード。それ以外は処理スキップ＋エラーコード＋画面警告。
4. 本設定はオブジェクトのため、部分不正時はマージしてデフォルト補完。常にデフォルトで実行可能。スキップは発生しない想定。
5. エラーコード: `CONFIG_FALLBACK` / `CONFIG_READ_ERROR` をログに出力。詳細は `docs/運用時資料/設定/設定の不具合時の対応.md` を参照。

## 現状持ちうる値

| キー | 型 | 許容値 |
|------|-----|--------|
| weekday / weekendHoliday / event / allDay | object | `{ styleId, openMinute, closeMinute, isClosed }`。openMinute / closeMinute は 0〜2880 程度、60 の倍数推奨 |
| closed | object | `{ styleId: "closed", openMinute: 0, closeMinute: 0, isClosed: true }` |

## その設定により何が変わるのか

- **各スタイルの openMinute / closeMinute**: 営業日編集画面でそのスタイルを選択した日の営業時間が変わる。週次 Planner の開店・閉店認定タスクの投入時刻にも影響する。
- **isClosed**: `closed` スタイルの日は休業として扱われ、開店・閉店認定タスクは投入されない。

## 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `functions/src/shared/businessHours/services/styles.ts` | getBusinessHoursByStyleId で config から取得 |
| ts | `functions/src/shared/config/configLoader.ts` | config 取得・フォールバック・マージ |
| ts | `functions/src/shared/config/defaults.ts` | デフォルト値定義 |
| ts | `functions/src/shared/businessHours/callables/setBusinessHoursManualForDay.ts` | styleId から営業時間取得 |
| ts | `functions/src/shared/businessHours/callables/generateBusinessHoursForMonthFromStyles.ts` | 同上 |
| ts | `functions/src/shared/businessHours/callables/generateBusinessHoursForYearFromStyles.ts` | 同上 |
| ts | `functions/src/shared/businessHours/scheduler/scheduleGenerateNextYearBusinessHours.ts` | 同上 |
| dart | `lib/services/store_config_service.dart` | config パース・getBusinessHoursByStyleId |
| dart | `lib/services/store_config_defaults.dart` | デフォルト値定義 |
| dart | `lib/StaffDate/businessDayEditPage.dart` | 営業日編集画面でスタイル一覧表示・営業時間計算 |
