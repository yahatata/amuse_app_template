# tableDevice 実装 — changeSpec

> **目的:** [03_目的.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/残タスク整理/03_テーブルデバイス/03_目的.md:1)  
> **詳細仕様:** [04_実装仕様.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/残タスク整理/03_テーブルデバイス/04_実装仕様.md:1)  
> **正本仕様:** [docs/table_device/tobe_spec.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/table_device/tobe_spec.md:1)

---

## 1. 実装順

実装は次の順で進める。

1. Config / role / データモデル基盤
2. device 登録・device 管理・卓紐付け
3. tournament 既存 callable と論理削除対応
4. 卓専用 Home / Drawer
5. 卓専用 tournament / sideGame 画面
6. 卓デバイス専用 callable
7. tests / docs / 実機確認

この順にする理由:

- `table` role や config がないと、後続 UI / callable が実装できない
- `tournamentDetail` と `tablesSeat.isEnabled` を先に固めないと、卓 Home の判定が安定しない
- 卓専用画面は基盤と callable が揃ってからの方が安全

---

## 2. 新規ファイル

### 2.1 Flutter

| ファイル | 内容 |
|---|---|
| `lib/tableDevice/pages/table_device_home_page.dart` | 卓専用 Home。`tables/{tableId}` を見て遷移先を決める |
| `lib/tableDevice/pages/table_device_table_detail_page.dart` | 卓デバイス版 tournament 卓詳細 |
| `lib/tableDevice/pages/table_device_side_game_page.dart` | 卓デバイス版 sideGame 卓画面 |
| `lib/tableDevice/widgets/table_device_drawer.dart` | 卓専用 Drawer |
| `lib/tableDevice/services/table_device_service.dart` | 卓状態取得・register / unregister 呼び出し・判定補助 |

必要に応じて追加候補:

| ファイル | 用途 |
|---|---|
| `lib/tableDevice/models/table_device_home_state.dart` | Home 判定ロジックを分離する場合の state モデル |

### 2.2 Functions

| ファイル | 内容 |
|---|---|
| `functions/src/table_device/callables/registerTableToTournament.ts` | 卓デバイスからのトーナメント登録 |
| `functions/src/table_device/callables/unregisterTableFromTournament.ts` | 卓デバイスからのトーナメント登録解除 |
| `functions/src/table_device/callables/registerTableToSideGame.ts` | 卓デバイスからの sideGame 登録 |
| `functions/src/table_device/callables/unregisterTableFromSideGame.ts` | 卓デバイスからの sideGame 登録解除 |
| `functions/src/table_device/index.ts` | 上記 export |

### 2.3 テスト

| ファイル | 内容 |
|---|---|
| `test/services/device_service_table_device_test.dart` | `table` ロール / 卓紐付け取得 |
| `test/table_device/table_device_home_state_test.dart` | Home 状態判定 |
| `test/table_device/table_device_unbound_message_test.dart` | 未紐付け案内 |
| `functions/__tests__/callables/registerTableToTournament.spec.ts` | 卓デバイス tournament 登録 |
| `functions/__tests__/callables/unregisterTableFromTournament.tableDevice.spec.ts` | 卓デバイス tournament 解除 |
| `functions/__tests__/callables/registerTableToSideGame.spec.ts` | 卓デバイス sideGame 登録 |
| `functions/__tests__/callables/unregisterTableFromSideGame.spec.ts` | 卓デバイス sideGame 解除 |

---

## 3. 変更ファイル

### 3.1 Flutter 基盤

| ファイル | 変更内容 |
|---|---|
| `lib/models/device.dart` | `DeviceRole.table` を追加 |
| `lib/services/device_options.dart` | `tableDeviceTable` 定数、label / description 追加 |
| `lib/services/device_service.dart` | `isTableDevice()`、`table` ロール対応、`table_device_table` 取得補助追加 |
| `lib/services/store_config_service.dart` | `tableDevice.forceClearPasscode` のパース追加 |
| `lib/services/store_config_defaults.dart` | `tableDevice.forceClearPasscode` のデフォルト追加 |
| `lib/main.dart` | `role == 'table'` で `TableDedicatedHomePage` へ遷移 |

### 3.2 device 登録 / 管理

| ファイル | 変更内容 |
|---|---|
| `lib/pages/device_registration_page.dart` | `role: table` を選択可能にする |
| `lib/pages/device_management_page.dart` | `role: table` 向け卓紐付け編集 UI、`table_device_table` 保存対応 |

### 3.3 tournament / sideGame 既存 UI

| ファイル | 変更内容 |
|---|---|
| `lib/tournament/pages/tournament_select_page.dart` | device 卓絞り込みで `tablesSeat.isEnabled == true` を確認 |
| `lib/tournament/pages/table_select_page.dart` | 論理削除卓を非表示 |
| `lib/tournament/active/widgets/dialogs/remove_table_dialog.dart` | 論理削除済み卓を削除候補から除外 |
| `lib/sideGame/pages/side_game_table_list.dart` | 必要なら共通 helper 抽出。sideGame 開始ロジックと新 callable への寄せ先整理 |
| `lib/sideGame/pages/side_game_table_home.dart` | 卓デバイス版へ移すロジックの参照元として使用。必要に応じて共通化 |

### 3.4 Functions: device / config

| ファイル | 変更内容 |
|---|---|
| `functions/src/shared/devices/callables/registerDevice.ts` | `role: table` を許容 |
| `functions/src/shared/devices/callables/updateDeviceRole.ts` | `role: table` を許容 |
| `functions/src/shared/devices/callables/updateDeviceOptions.ts` | `table_device_table` を許容し、`table` ロール前提の扱いを追加 |
| `functions/src/shared/config/types.ts` | `tableDevice.forceClearPasscode` を追加 |
| `functions/src/shared/config/defaults.ts` | `DEFAULT_TABLE_DEVICE_FORCE_CLEAR_PASSCODE` を追加 |
| `functions/src/shared/config/configLoader.ts` | `tableDevice.forceClearPasscode` のロード / merge 処理を追加 |

### 3.5 Functions: tournament 既存 callable

| ファイル | 変更内容 |
|---|---|
| `functions/src/domains/tournament_activeTournament/callables/addTableToTournament.ts` | `tournamentDetail` 書き込み、`isEnabled: false` 再利用対応 |
| `functions/src/domains/tournament_activeTournament/callables/removeTableFromTournament.ts` | `delete()` をやめ、`isEnabled: false` と `tournamentDetail` クリアへ変更 |
| `functions/src/domains/tournament_activeTournament/callables/endTournament.ts` | 終了時の `tournamentDetail` クリア追加 |

### 3.6 Tests / docs

| ファイル | 変更内容 |
|---|---|
| `test/services/store_config_service_test.dart` | `forceClearPasscode` テスト追加 |
| `test/services/store_config_phase2_test.dart` | config defaults / 上書き追加 |
| `functions/__tests__/callables/addTableToTournament.spec.ts` | `tournamentDetail` / `isEnabled` 再利用の検証追加 |
| `functions/__tests__/callables/removeTableFromTournament.spec.ts` | 論理削除検証追加 |
| `functions/__tests__/callables/endTournament.pendingReview.spec.ts` | `tournamentDetail` クリア検証追加 |
| `functions/__tests__/config_migration/phase2_migration.spec.ts` | config 項目追加 |
| `functions/__tests__/health/systemHealth.spec.ts` | defaults 整合確認追加 |
| `docs/運用時資料/設定/取得失敗時の挙動設計.md` | `tableDeviceRegistrationEnabled` / `forceClearPasscode` 追記 |
| `docs/運用時資料/設定/設定の不具合時の対応.md` | `tableDeviceRegistrationEnabled` / `forceClearPasscode` 追記 |
| `docs/運用時資料/設定/storeMeta/configによる設定の詳細/` | `tableDevice.forceClearPasscode` 説明追加 |

---

## 4. 実装メモ

### 4.1 `tournamentDetail` の更新タイミング

- tournament 登録時: 書く
- tournament 解除時: 消す
- tournament 終了時: 消す
- sideGame 開始時: 元からあれば保持
- sideGame 終了時: あれば `status='tournament'` に戻す

### 4.2 sideGame 開始時の整合

必ず同一トランザクションまたは同等の整合手段で、次を揃える。

- `tables.status = gameName`
- `sideGame.active = true`
- `sideGame.gameName = gameName`

### 4.3 `table` ロールの options

`table` ロールでは、実質 `table_device_table` 以外の option を使わない前提に寄せる。  
`terminal` 向け option を混在させる実装は避ける。

---

## 5. 実装後の実行項目

### 5.1 コンパイル / テスト

- `flutter test`
- `cd functions && npx tsc --noEmit`
- `cd functions && npm test -- --runInBand`

### 5.2 実機確認

確認手順は [04_実装仕様.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/残タスク整理/03_テーブルデバイス/04_実装仕様.md:140) の「実機確認計画」に従う。

### 5.3 ドキュメント更新

- `01_やること整理.md` の完了項目更新
- 必要に応じて `README.md` 更新
- 運用資料更新
