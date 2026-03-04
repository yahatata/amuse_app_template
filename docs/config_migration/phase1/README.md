# Phase1 README

## 目的

`storeMeta/config` を使った設定基盤を整備し、Phase2 を安全に実行できる状態を作る。

## スコープ

- 設定取得層（Functions）
- 設定購読/参照層（Flutter、必要最小限）
- 更新経路（管理者 callable / 管理UI経由）設計
- 欠損時挙動・型バリデーション方針

## 参照必須

- `docs/config_migration/tobe_config_architecture.md`
- `docs/config_migration/changeSpec_overview.md`
- `docs/config_migration/CHANGE_RULES.md`

## 進め方（推奨順）

1. `storeMeta/config` スキーマを最終確定
2. 型・許容値・default を決める
3. 取得失敗/欠損時の安全側挙動を決める
4. Functions での最終決定経路を定義
5. Flutter の参照責務を限定（表示/入力補助）
6. 監査ログ更新ルール（Change/Decision）を確定

## Done 条件

- `storeMeta/config` 取得/更新の経路が定義済み
- SSoT 原則（Functions最終決定）に反しない
- Phase2 でID単位移行ができる最小基盤がある

## 失敗しやすいポイント

- Flutter側に確定ロジックを残す
- 欠損時fallbackが多すぎて挙動が読めない
- 更新権限の境界が曖昧

## 最小チェックリスト

- [ ] スキーマと許容値が確定した
- [ ] 更新責務が Functions に寄っている
- [ ] 欠損時挙動が文書化されている
- [ ] ロールバック観点を記載した
