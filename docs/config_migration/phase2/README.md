# Phase2 README

## 目的

実改修の本体として、Classification 全 ID を To-Be 配置へ段階移行する。

## 重要前提

- Top10 は「優先バッチ」であり、対象全体ではない。
- 母集団は `docs/config_audit/store_config_classification.md` の全 ID（B/D/R）。
- Phase0A/0B/1 のゲートを満たしたものから着手する。

## スコープ

- ID単位での保存先・参照先切替
- 互換期間の運用
- 検証とロールバック整備

## 進め方（ID単位の標準手順）

1. 対象IDを宣言する（Change ID と紐付け）
2. Before（現保存先/参照先）を確定
3. After（To-Be 保存先/参照先）を確定
4. 互換期間・fallback・ロールバックを決める
5. 実装する
6. 検証する
7. `CHANGE_LOG.md` / `DECISION_LOG.md` を更新
8. ID状態を `完了` に更新

## 推奨実行順

- Batch A: Top10（営業日境界、自動開閉店、会計、人員）
- Batch B: 残りRun項目
- Batch C: Deploy項目の整理
- Batch D: Build項目の整備/運用ルール化

## Done 条件

- 全IDに状態（未着手/移行中/完了）がある
- 完了IDは To-Be 配置に揃っている
- SSoT が単一で説明可能

## 失敗しやすいポイント

- Top10完了で全体完了と誤認する
- 互換期間を閉じる前に旧参照を削除する
- ログ更新を後回しにして追跡不能になる

## 最小チェックリスト

- [ ] 対象IDを明示した
- [ ] SSoT Before/After を記録した
- [ ] Gate を通過した
- [ ] 検証結果を記録した
- [ ] ロールバック方法を記録した
