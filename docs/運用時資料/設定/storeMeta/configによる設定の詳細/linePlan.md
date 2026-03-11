# linePlan（LINE プラン種別）

## 設定の説明

LINE 連携の契約プラン種別。`communication`（コミュニケーション）の場合はシフト要請機能が無効となり、`light` 以上のプランで有効になる。

## 何を設定するのか

`storeMeta/config` の `linePlan`（string）。未指定時は `defaults.ts` / `store_config_defaults.dart` の `"communication"` が使われる。

| 値 | 意味 |
|----|------|
| `communication` | コミュニケーションplaン（デフォルト）。シフト要請機能無効 |
| `light` | ライトプラン。シフト要請機能有効 |
| `standard` | スタンダードプラン。シフト要請機能有効 |

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
| `communication` | デフォルト。シフト要請機能無効 |
| `light` | シフト要請機能有効 |
| `standard` | シフト要請機能有効 |

**無効値**: 上記以外の値が設定された場合はデフォルトにフォールバック。

## その設定により何が変わるのか

- **communication**: シフト要請の確認・辞退機能が無効。`confirmShiftRequest` は permission-denied を返す。LINE Webhook の postback（辞退ボタン）は「この機能はライトプラン以上で利用可能です」とリプライするのみ。
- **light / standard**: シフト要請の確認・辞退機能が有効。Web staff ページの `isShiftRequestEnabled()` が `true` を返す。

## 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `functions/src/domains/webhook/callables/lineWebhook.ts` | postback 時のシフト辞退制御（linePlan === 'communication' でスキップ） |
| ts | `functions/src/domains/staff/callables/confirmShiftRequest.ts` | 呼び出し時に linePlan === 'communication' なら permission-denied |
| ts | `functions/src/shared/config/configLoader.ts` | config 取得・フォールバック・getLinePlan |
| ts | `functions/src/shared/config/defaults.ts` | デフォルト値定義 |
| dart | `lib/services/store_config_service.dart` | config パース |
| dart | `lib/services/store_config_defaults.dart` | デフォルト値定義 |
| js | `public/staff/config.js` | linePlan 初期値、loadLinePlanFromFirestore、isShiftRequestEnabled |
| html | `public/staff/index.html` | Firebase 初期化後に loadLinePlanFromFirestore を呼び出し |
