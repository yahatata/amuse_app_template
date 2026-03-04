# Phase0B README

## 前提

- Phase0A Task6/7/9 完了済み（D-01, D-12, D-13 の実装・検証・ログ更新）
- Phase0A Task8（Runbook）は Phase3 で実施する（D-0012）

## 目的

二重管理（重複SSoT）を先に掃除し、不要な Run-time 移行を防ぐ。

## スコープ

- 同義設定の重複定義を特定
- 各設定の `現SSoT -> To-Be SSoT` を確定
- 重複を残したまま Phase2 へ進まないためのゲートを張る

## 参照必須

- `docs/config_migration/tobe_config_architecture.md`
- `docs/config_migration/migration_roadmap.md`
- `docs/config_migration/CHANGE_RULES.md`
- `docs/config_audit/store_config_classification.md`

## 重点対象（現時点）

- `STORE_CLOSE_HOUR`（Dart const + Functions env）
- 会計ポリシー（`categoryPaymentMethods`, `POINT_PRIORITY`, 丸め単位）
- `businessHoursStyles` / `requiredStaffByTimeSlot`
- `linePlan`（Dart/Functions/public config）

## 進め方（推奨順）

1. 重複設定を ID 単位で一覧化
2. 各IDで最終決定者（Functions/Build/Deploy）を決める
3. 「残す側」「廃止側」を決める
4. 廃止側の撤去計画（互換期間・期限）を定義
5. Runtime-gate（重複解消証跡）を満たしたIDのみ次へ

## Done 条件

- 主要重複IDで To-Be SSoT が確定している
- 廃止計画（いつ、どこを、どう消すか）が書かれている
- Phase2 で再議論しないための判断根拠が残っている

## 失敗しやすいポイント

- 参照元の片側だけ見て判定する
- 同名でも意味が違う値を誤って統合する
- docs-only 値を実装済み扱いする

## 最小チェックリスト

- [ ] 全対象IDに `現SSoT/To-Be SSoT` を記録した
- [ ] 廃止側の撤去条件を決めた
- [ ] Phase2 着手可否（Gate）を判定した
