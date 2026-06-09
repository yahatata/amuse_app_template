# storeMeta/requiredStaffByTimeSlot（時間帯別必要人数）

R-09 で storeMeta/config から分離した専用ドキュメント。シフトの「必要十分」判定に使用する時間帯別の必要スタッフ数を保持する。

## パス

`storeMeta/requiredStaffByTimeSlot`（単一ドキュメント）

## スキーマ

| フィールド | 型 | 意味 |
|------------|-----|------|
| data | Array<{ startHour, endHour, requiredCount }> | 時間帯別必要人数の配列 |
| updatedAt | Timestamp | 最終更新日時（任意） |

## 初期化

- `initializeStoreConfigCallable` 実行時に、storeMeta/config の補完と合わせて**未存在時のみ**作成される。
- 管理者画面「storeMeta/config 初期セットアップ」ボタンで config（不足フィールド補完）と requiredStaffByTimeSlot（未存在時のみ作成）が実行される。

## 読み取り

- **Functions**: `getRequiredStaffByTimeSlot()`（helpers.ts）が Firestore から直接読み取り。未存在時・読み取り失敗時（リトライ後も失敗）は defaults.ts の `DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT` にフォールバック。
- **Flutter**: `RequiredStaffByTimeSlotService` が snapshot で購読。未存在時は `kDefaultRequiredStaffByTimeSlot` にフォールバック。読み取り失敗時は最後の成功値を維持。

## フォールバック仕様

| 条件 | 戻り値 |
|------|--------|
| ドキュメント未存在 | defaults |
| Firestore 読み取り失敗（リトライ後も失敗） | defaults |
| data が配列でない | defaults |
| data が空配列 `[]` | `[]`（不足判定を行わない） |
| data の全要素が不正 | defaults |

## 中央管理アプリとの関係

`requiredStaffByTimeSlot` は中央管理アプリの Config 同期対象 6 件の 1 つでもある。

用途:

- 中央の設定参照 UI
- 店舗設定の運用確認時の比較材料

店舗側で値を更新したあと、中央側でも新しい値を見たい場合は
`設定 > 店舗 Config 同期` を再実行する。

## 影響を受けるファイル

| 種別 | ファイル | 役割 |
|------|----------|------|
| ts | functions/src/shared/config/defaults.ts | DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT 定義 |
| ts | functions/src/domains/shift/services/helpers.ts | getRequiredStaffByTimeSlot() |
| ts | functions/src/domains/storeMeta/callables/initializeStoreConfigCallable.ts | 初期化時作成 |
| dart | lib/services/store_config_defaults.dart | kDefaultRequiredStaffByTimeSlot 定義 |
| dart | lib/services/required_staff_by_time_slot_service.dart | 購読・latestData 提供 |
| dart | lib/StaffDate/shiftHomePage.dart | RequiredStaffByTimeSlotService 参照 |
| dart | lib/StaffDate/shiftDateDialog.dart | RequiredStaffByTimeSlotService 参照 |
