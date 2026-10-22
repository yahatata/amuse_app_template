# linePlan（LINE プラン種別）

## 設定の説明

LINE 連携の契約プラン種別。`storeMeta/config` に保持する。

**CLN-F2（2026-08-22）:** 旧「シフト要請の確認・辞退」（`confirmShiftRequest` / `#shift?requestId=` / webhook `action=decline`）は **ローカル削除済み**。`linePlan` による当該ゲートは **現行本番コードでは使用しない**（production Function / Hosting 反映は別途）。値自体は config として残置。

## 何を設定するのか

`storeMeta/config` の `linePlan`（string）。未指定時は `defaults.ts` / `store_config_defaults.dart` の `"communication"` が使われる。

| 値 | 意味 |
|----|------|
| `communication` | コミュニケーションプラン（デフォルト） |
| `light` | ライトプラン |
| `standard` | スタンダードプラン |

## 取得失敗時

- **読めるがフィールドが存在しない**: 必ずデフォルト（`"communication"`）を適用。
- **読めない（Firestore 障害等）**: デフォルトを正としてデフォルト処理を行う。

詳細は `docs/運用時資料/設定/取得失敗時の挙動設計.md` を参照。

## 不具合時の対応

1. リトライを必ず行う。
2. A,B（設定値の誤り・運用ミス）: デフォルトで実行＋エラーコード。
3. C,D（コードのバグ・不整合）: デフォルトで実行可能な場合は実行＋エラーコード。それ以外は処理スキップ＋エラーコード＋画面警告。
4. 本設定は string のため常にデフォルトで実行可能。スキップは発生しない想定。
5. エラーコード: `CONFIG_FALLBACK` / `CONFIG_READ_ERROR` をログに出力。詳細は `docs/運用時資料/設定/設定の不具合時の対応.md` を参照。

## 現状持ちうる値

| 値 | 意味 |
|----|------|
| `communication` | デフォルト |
| `light` | ライトプラン |
| `standard` | スタンダードプラン |

**無効値**: 上記以外の値が設定された場合はデフォルトにフォールバック。

## その設定により何が変わるのか

- **現行（CLN-F2 ローカル削除後）:** `linePlan` は config として読み込まれるが、**シフト要請確認/辞退の分岐には使わない**。正式シフトは `submitShiftRequests` → Admin `interimConfirmRequests` → finalize。
- **廃止済み（履歴）:** かつては `communication` で要請確認・辞退を無効化し、`light` / `standard` で `confirmShiftRequest` と webhook decline を有効化していた。`confirmShiftRequest` は production Function 削除済み。Staff LIFF の confirm 経路も Hosting 反映済み。`lineWebhook` の decline 枝も production 単体 deploy 済み。

## 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `functions/src/shared/config/configLoader.ts` | config 取得・フォールバック・getLinePlan |
| ts | `functions/src/shared/config/defaults.ts` | デフォルト値定義 |
| dart | `lib/services/store_config_service.dart` | config パース |
| dart | `lib/services/store_config_defaults.dart` | デフォルト値定義 |
| js | `public/staff/config.js` | linePlan 初期値、loadLinePlanFromFirestore |
| html | `public/staff/index.html` | Firebase 初期化後に loadLinePlanFromFirestore を呼び出し |

**削除済み（CLN-F2）:** `confirmShiftRequest.ts`、staff LIFF の `#shift?requestId` confirm、`lineWebhook` decline 枝、`isShiftRequestEnabled`
