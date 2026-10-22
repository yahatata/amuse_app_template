# businessHoursStyles（営業時間スタイル）

> **Deprecated（Phase 3）**  
> 正本は `storeMeta/businessStyles` に移行済みです。  
> `storeMeta/config.businessHoursStyles` は新規作成・補完の対象外です。

## 現行正本

`storeMeta/businessStyles`（version 2）

各 styleId に `openMinute` / `closeMinute` / `isClosed` / `requiredStaffByTimeSlot` を保持します。

## 設定の説明

営業日ごとに適用する営業時間スタイルのマスタ。weekday（平日）、weekendHoliday（週末・祝日）、event（イベント）、allDay（終日）、closed（休業）の 5 種類を定義する。`businessHoursMonthlyMap` の各日の `styleId` がこのスタイルを参照し、営業時間を決定する。

| スタイル | styleId | 説明 | デフォルト（openMinute / closeMinute / isClosed） |
|----------|---------|------|--------------------------------------------------|
| weekday | weekday | 平日 | 900 / 1500 / false（9:00〜15:00） |
| weekendHoliday | weekendHoliday | 週末・祝日 | 720 / 1500 / false（12:00〜15:00） |
| event | event | イベント | 600 / 1500 / false（10:00〜15:00） |
| allDay | allDay | 終日 | 360 / 1500 / false（6:00〜15:00） |
| closed | closed | 休業日 | 0 / 0 / true |

## 読み取り（現行）

- **Functions**: `getBusinessStyles` / `getBusinessHoursByStyleId()`（businessStyles 経由）
- **Flutter**: `BusinessStylesService`

## 書き込み（現行）

- `saveBusinessHoursStyles` → `storeMeta/businessStyles` のみ更新（`requiredStaffByTimeSlot` は保持）
- `initializeStoreConfigCallable` → 未存在時のみ default で作成

## 旧構造（参照のみ）

`storeMeta/config.businessHoursStyles` — Phase 3 以降、config schema / merge 対象外。

## 関連資料

- `docs/運用時資料/設定/storeMeta/requiredStaffByTimeSlot.md`（旧 doc、deprecated）
- `docs/config_migration/phase1/PHASE1_CONFIG_SCHEMA.md`
