# sideGameTypes（サイドゲーム種別）

## パス

`storeMeta/config` の `sideGameTypes`

## 設定の説明

サイドゲームとして扱うテーブルステータス（ゲーム種別）の一覧。テーブル一覧での判定や、サイドゲーム用UIの選択肢に使用される。

## 何を設定するのか

- **sideGameTypes**: 文字列の配列。サイドゲームとして扱うゲーム種別名の一覧。
- 空配列の場合はデフォルト値（ブラックジャック、ルーレット、バカラ、アルティメットポーカー）にフォールバックする。

## 取得失敗時

- **読めるがフィールドが存在しない**: 必ずデフォルト（`['ブラックジャック','ルーレット','バカラ','アルティメットポーカー']`）を適用。
- **読めない（Firestore 障害等）**: デフォルトを正としてデフォルト処理を行う。

詳細は `docs/運用時資料/設定/取得失敗時の挙動設計.md` を参照。

## 不具合時の対応

1. リトライを必ず行う。
2. A,B（設定値の誤り・運用ミス）: デフォルトで実行＋エラーコード。
3. C,D（コードのバグ・不整合）: デフォルトで実行可能な場合は実行＋エラーコード。それ以外は処理スキップ＋エラーコード＋画面警告。
4. 本設定は文字列配列のため常にデフォルトで実行可能。スキップは発生しない想定。
5. エラーコード: `CONFIG_FALLBACK` / `CONFIG_READ_ERROR` をログに出力。詳細は `docs/運用時資料/設定/設定の不具合時の対応.md` を参照。

## 現状持ちうる値

| フィールド | 型 | デフォルト | 備考 |
|------------|-----|------------|------|
| sideGameTypes | string[] | ['ブラックジャック','ルーレット','バカラ','アルティメットポーカー'] | 空でない文字列の配列。Firestore のテーブル status や他フィールドと整合する値を使用推奨 |

## その設定により何が変わるのか

- テーブル一覧でサイドゲーム判定（`contains()` による status マッチング）
- サイドゲーム選択ダイアログの選択肢
- テーブルホームのゲーム種別ドロップダウン選択肢

## 影響を受けるファイル一覧

| 種別 | ファイル | 役割 |
|------|----------|------|
| ts | functions/src/shared/config/defaults.ts | デフォルト値 |
| ts | functions/src/shared/config/configLoader.ts | マージ・フォールバック |
| dart | lib/services/store_config_defaults.dart | kDefaultSideGameTypes |
| dart | lib/services/store_config_service.dart | パース・購読 |
| dart | lib/sideGame/pages/side_game_table_list.dart | サイドゲーム判定・ゲーム選択ダイアログ |
| dart | lib/sideGame/pages/side_game_table_home.dart | ゲーム種別ドロップダウン |
