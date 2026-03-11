# billing（入店料関連）

entranceFee / entranceFeeDescription / chargeEntranceFeeOnReentry

## パス

`storeMeta/config` の `billing.entranceFee` / `billing.entranceFeeDescription` / `billing.chargeEntranceFeeOnReentry`

## 設定の説明

来店時（QR チェックイン・手動チェックイン）に適用する入店料の設定。

## 何を設定するのか

- **entranceFee**: 入店料の金額（円）。0 も設定可能（無料）
- **entranceFeeDescription**: 入店料の説明文（例: 「入店料」「入場料」）
- **chargeEntranceFeeOnReentry**: 再入店時に入店料を徴収するか

## 現状持ちうる値

| フィールド | 型 | デフォルト | 備考 |
|------------|-----|------------|------|
| entranceFee | number | 1000 | 0 以上 |
| entranceFeeDescription | string | "入店料" | 任意の文字列 |
| chargeEntranceFeeOnReentry | boolean | false | 再入店時課金の有無 |

## その設定により何が変わるのか

- 来店時の入店料表示・請求額
- createBillWithActiveStay 等で extras に記録する入店料レコード
- 再入店時に再度入店料を取るかどうか

## 影響を受けるファイル一覧

| 種別 | ファイル | 役割 |
|------|----------|------|
| ts | functions/src/shared/config/defaults.ts | デフォルト値 |
| ts | functions/src/shared/config/configLoader.ts | マージ・フォールバック |
| ts | functions/src/domains/bills/repos/createBillWithActiveStay.ts | 入店料 extras 作成（引数で受け取る） |
| ts | functions/src/domains/user/callables/manualCheckIn.ts | 手動チェックイン（引数で受け取る） |
| ts | functions/src/domains/user/callables/processVisitByQR.ts | QR チェックイン（引数で受け取る） |
| dart | lib/services/store_config_defaults.dart | kDefaultEntranceFee 等 |
| dart | lib/services/store_config_service.dart | パース・購読 |
| dart | lib/UserRegisterView/userQRCheckInPage.dart | QR チェックイン時に Callable へ渡す |
| dart | lib/UserLogin/UserManualCheckInPage.dart | 手動チェックイン時に Callable へ渡す |
