# テーブルデバイス

## このディレクトリの位置づけ

このディレクトリは、`tableDevice` 機能の残タスク整理用です。  
**仕様の正本は [docs/table_device/tobe_spec.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/table_device/tobe_spec.md:1) とし、本ディレクトリ配下はその仕様を前提に実装を分解・整理するために使います。**

## 現在の前提

- `tableDevice` は**顧客端末ではなく、店舗従業員（ディーラー）が操作する卓専用端末**として扱う
- `role: table` を独立 role として追加する
- `tables/{tableId}` を卓状態の単一参照先とし、`tournamentDetail` を採用する
- サイドゲーム中の `tables.status` は固定値 `sideGame` ではなく、**ゲーム名**を保持する
- `tableDevice` はデバイス登録画面でも登録できる
- 同一卓に複数の `tableDevice` を紐付けることを許容する
- `TABLE_DEVICE_REGISTRATION_ENABLED` と `FORCE_CLEAR_PASSCODE` は `dart-define` ではなく `storeMeta/config` で扱う
- `FORCE_CLEAR_PASSCODE` は強い秘匿情報ではなく、**誤操作防止用**として扱う

## 現在の状態評価

- 仕様: `tobe_spec` を正として整理済み
- 実装: **完了**（PR #131 + rules 本番化 + 卓ページ TN/SG/置きバケ権限）
- 検証: 実機確認済（2026-05-27）、Flutter/Functions 単体テストあり
- 残: 運用時資料（§16）、店舗別 config 調整（着席・履歴取り消し）

## このタスクの本質

単に「卓に置く端末を作る」だけではありません。  
実際には、次を一貫した設計で実装するタスクです。

- `role: table` の追加
- 卓専用 Home / Drawer / 詳細画面の実装
- トーナメント / サイドゲームの卓状態管理
- `storeMeta/config` を使った卓デバイス設定管理
- 既存の tournament / sideGame 実装との差分吸収
- 論理削除や権限制御の整合

## 関連が強いタスク

- `06_config整理とデフォルト方針`
- `05_LIFFトーナメント参加導線`
- `10_UI綺麗化と権限別HOME再設計`
