# Phase0B README

## 前提

- Phase0A Task6/7/9 完了済み（D-01, D-12, D-13 の実装・検証・ログ更新）
- Phase0A Task8（Runbook）は Phase3 で実施する（D-0012）

## 目的

二重管理（重複 SSoT）を先に掃除し、移行先を 1 つに決める。Phase0B のスコープは**設計・方針の決定**に限定し、実装・検証は Phase2 で実施する。

## スコープ（Phase0B で行うこと）

- 同義設定の重複定義を特定
- 各設定の `現 SSoT -> To-Be SSoT` を確定
- 廃止計画（いつ・どこを・どう消すか）を定義
- storeMeta/config 仕様（読み取り優先度・デフォルト値）を定義
- 重複を残したまま Phase2 へ進まないためのゲートを張る

## スコープ外（Phase2 で行うこと）

- 実装（参照差し替え・deprecate マーク）
- テスト・検証

**理由**: storeMeta/config 取得層は Phase1 で整備する。参照差し替えは Phase1 基盤完了後の Phase2 で ID 単位に実施する。

## 参照必須

- `docs/config_migration/tobe_config_architecture.md`
- `docs/config_migration/phase0B/STOREMETA_CONFIG_SPEC.md`
- `docs/config_migration/migration_roadmap.md`
- `docs/config_migration/CHANGE_RULES.md`
- `docs/config_audit/store_config_classification.md`

## Phase1 / Phase2 での必須確認

Phase1, Phase2 を実施する前に、以下を必ず確認すること。

- [PHASE0B_COMPLETED_AND_DECISIONS.md](./PHASE0B_COMPLETED_AND_DECISIONS.md)
- [../PHASE0B_DECISIONS_FOR_LATER_PHASES.md](../PHASE0B_DECISIONS_FOR_LATER_PHASES.md)

## 重点対象

- `STORE_CLOSE_HOUR`（D-06）※Phase4 で廃止方針確定。詳細は [phase4/README.md](../phase4/README.md) 参照
- 会計ポリシー（R-11, R-12）
- `businessHoursStyles` / `requiredStaffByTimeSlot`（R-10, R-09）
- `linePlan`（D-04）

## タスク一覧

詳細は [TASK_LIST.md](./TASK_LIST.md) を参照。タスク 5, 6 は Phase2 スコープ。

## 成果物

| タスク | 成果物 | Phase0B |
|--------|--------|---------|
| 1 | [PHASE0B_TARGET_LIST.md](./PHASE0B_TARGET_LIST.md) | ✅ |
| 2 | [PHASE0B_REFERENCE_MAP.md](./PHASE0B_REFERENCE_MAP.md) | ✅ |
| 3 | [PHASE0B_BEFORE_AFTER_DECISION.md](./PHASE0B_BEFORE_AFTER_DECISION.md) | ✅ |
| 4 | [PHASE0B_DEPRECATION_PLAN.md](./PHASE0B_DEPRECATION_PLAN.md) | ✅ |
| - | [STOREMETA_CONFIG_SPEC.md](./STOREMETA_CONFIG_SPEC.md) | ✅ |
| - | [PHASE0B_COMPLETED_AND_DECISIONS.md](./PHASE0B_COMPLETED_AND_DECISIONS.md) | ✅ |
| 5 | 実装（参照差し替え） | ❌ Phase2 |
| 6 | テスト・検証 | ❌ Phase2 |
| 7 | CHANGE_LOG / DECISION_LOG 更新 | ✅ |

## 進め方（推奨順）

1. 重複設定を ID 単位で一覧化（Task1）
2. 参照箇所を検索・マップ化（Task2）
3. 各 ID で「残す側＝SSoT」を決める（Task3）
4. 廃止計画を定義（Task4）
5. storeMeta/config 仕様を定義
6. CHANGE_LOG / DECISION_LOG を更新（Task7）

## Done 条件（Phase0B）

- 全対象 ID に `現 SSoT / To-Be SSoT` を記録した
- 廃止側の撤去条件・実施タイミングを決めた
- storeMeta/config 仕様（読み取り優先度・デフォルト値）を定義した
- `CHANGE_LOG.md` / `DECISION_LOG.md` を更新した
- Phase1/2 で参照すべき決定事項を文書化した
- 実装・検証は Phase2 で実施することを明確にした

## 失敗しやすいポイント

- 参照元の片側だけ見て判定する
- 同名でも意味が違う値を誤って統合する
- docs-only 値を実装済み扱いする
- Phase0B で実装まで行おうとする（Phase2 の役割）
