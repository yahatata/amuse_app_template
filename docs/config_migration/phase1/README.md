# Phase1 README

## 目的

`storeMeta/config` を使った設定基盤を整備し、Phase2 を安全に実行できる状態を作る。

## 着手前の必須確認

**Phase0B の決定事項を必ず確認してから着手すること。**

- [PHASE0B_DECISIONS_FOR_LATER_PHASES.md](../PHASE0B_DECISIONS_FOR_LATER_PHASES.md)
- [phase0B/STOREMETA_CONFIG_SPEC.md](../phase0B/STOREMETA_CONFIG_SPEC.md)
- [phase0B/PHASE0B_COMPLETED_AND_DECISIONS.md](../phase0B/PHASE0B_COMPLETED_AND_DECISIONS.md)

上記に記載の読み取り優先度・欠損時挙動・スキーマを前提に基盤を実装する。

## スコープ

- 設定取得層（Functions）
- 設定購読/参照層（Flutter、必要最小限）
- 更新経路（管理者 callable / 管理UI経由）設計
- 欠損時挙動・型バリデーション方針

## 参照必須

- `docs/config_migration/PHASE0B_DECISIONS_FOR_LATER_PHASES.md`（Phase0B 決定事項）
- [phase1/PHASE1_UPDATE_PATH_DESIGN.md](./PHASE1_UPDATE_PATH_DESIGN.md)（更新経路・Flutter 参照責務）
- [phase1/PHASE1_ROLLBACK.md](./PHASE1_ROLLBACK.md)（ロールバック観点）
- `docs/config_migration/phase0B/STOREMETA_CONFIG_SPEC.md`
- [phase1/PHASE1_FALLBACK_BEHAVIOR.md](./PHASE1_FALLBACK_BEHAVIOR.md)（欠損時挙動・フォールバック時のログ仕様）
- `docs/config_migration/tobe_config_architecture.md`
- `docs/config_migration/changeSpec_overview.md`
- `docs/config_migration/CHANGE_RULES.md`

## タスク一覧

詳細は [TASK_LIST.md](./TASK_LIST.md) を参照。

## 進め方（推奨順）

1. `storeMeta/config` スキーマを最終確定（Task1）
2. 型・許容値・default を決める（Task2）
3. 取得失敗/欠損時の安全側挙動を決める（Task3）
4. Functions 取得層を実装（Task4）
5. 更新経路を設計（Task5）
6. Flutter の参照責務を限定（Task6）
7. ロールバック観点を文書化（Task7）
8. CHANGE_LOG / DECISION_LOG を更新（Task8）

## Done 条件

- `storeMeta/config` 取得/更新の経路が定義済み
- SSoT 原則（Functions最終決定）に反しない
- Phase2 でID単位移行ができる最小基盤がある

## 失敗しやすいポイント

- Flutter側に確定ロジックを残す
- 欠損時fallbackが多すぎて挙動が読めない
- 更新権限の境界が曖昧
- defaults.ts 以外にデフォルト値を重複定義する（Callable 内でフィールドを列挙する）

## 後続 Phase での必須維持事項

- **defaults.ts を唯一のソースとする**: デフォルト値の定義は defaults.ts のみ。新規フィールド追加時は configLoader buildFromDefaults() を更新し、Callable は変更しない。詳細は [PHASE1_UPDATE_PATH_DESIGN.md](./PHASE1_UPDATE_PATH_DESIGN.md) §6。

## 最小チェックリスト

- [x] スキーマと許容値が確定した
- [x] 取得層（①→②→③ フォールバック）が実装された
- [x] 欠損時挙動が文書化されている
- [x] 更新責務が Functions に寄っている
- [x] ロールバック観点を記載した
