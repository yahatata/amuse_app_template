# Phase0B タスク一覧

## サマリ版

| # | タスク | 成果物 | Phase0B スコープ |
|---|--------|--------|------------------|
| 1 | 対象 ID 列挙・重複の洗い出し | [PHASE0B_TARGET_LIST.md](./PHASE0B_TARGET_LIST.md) | ✅ 本フェーズ |
| 2 | 既存参照箇所の検索・使用経路の確定 | [PHASE0B_REFERENCE_MAP.md](./PHASE0B_REFERENCE_MAP.md) | ✅ 本フェーズ |
| 3 | Before/After（現 SSoT → To-Be SSoT）の決定 | [PHASE0B_BEFORE_AFTER_DECISION.md](./PHASE0B_BEFORE_AFTER_DECISION.md) | ✅ 本フェーズ |
| 4 | 廃止計画（いつ・どこを・どう消すか）の定義 | [PHASE0B_DEPRECATION_PLAN.md](./PHASE0B_DEPRECATION_PLAN.md) | ✅ 本フェーズ |
| - | storeMeta/config 仕様（読み取り優先度・デフォルト値） | [STOREMETA_CONFIG_SPEC.md](./STOREMETA_CONFIG_SPEC.md) | ✅ 本フェーズ |
| 5 | 実装（SSoT 統一・deprecate マーク） | コード変更・TASK5_CHANGESPEC.md（随時） | ❌ **Phase2 で実施** |
| 6 | テスト・検証 | 検証結果 | ❌ **Phase2 で実施** |
| 7 | CHANGE_LOG / DECISION_LOG 更新 | 更新済みログ | ✅ 本フェーズ |

**※ タスク 5, 6 について**: storeMeta/config 取得層は Phase1 で整備する。参照差し替え・検証は Phase1 基盤完了後の Phase2 で ID 単位に実施する。Phase0B のスコープは「設計・方針の決定」に限定する。

---

## Phase0B 完了タスク（1〜4, 7 + storeMeta/config 仕様）

### タスク 1: 対象 ID 列挙・重複の洗い出し

| 項目 | 内容 |
|------|------|
| 目的 | 二重管理（Dart + TS）されている設定を ID 単位で一覧化する |
| 参照元 | `store_config_classification.md` セクション 4-2 |
| 成果物 | [PHASE0B_TARGET_LIST.md](./PHASE0B_TARGET_LIST.md) |

---

### タスク 2: 既存参照箇所の検索・使用経路の確定

| 項目 | 内容 |
|------|------|
| 目的 | 各キーが Dart/TS 双方でどこで参照されているかを漏れなく把握する |
| 成果物 | [PHASE0B_REFERENCE_MAP.md](./PHASE0B_REFERENCE_MAP.md) |

---

### タスク 3: Before/After（現 SSoT → To-Be SSoT）の決定

| 項目 | 内容 |
|------|------|
| 目的 | 各 ID で「残す側＝SSoT」を決め、廃止側を明確にする |
| 成果物 | [PHASE0B_BEFORE_AFTER_DECISION.md](./PHASE0B_BEFORE_AFTER_DECISION.md) |

---

### タスク 4: 廃止計画の定義

| 項目 | 内容 |
|------|------|
| 目的 | 廃止側の撤去タイミング・互換期間・実施手順を決める |
| 成果物 | [PHASE0B_DEPRECATION_PLAN.md](./PHASE0B_DEPRECATION_PLAN.md) |

---

### storeMeta/config 仕様

| 項目 | 内容 |
|------|------|
| 目的 | 単一ドキュメント方針・読み取り優先度・デフォルト値方針を定義する |
| 成果物 | [STOREMETA_CONFIG_SPEC.md](./STOREMETA_CONFIG_SPEC.md) |

---

### タスク 7: CHANGE_LOG / DECISION_LOG 更新

| 項目 | 内容 |
|------|------|
| 目的 | 決定事項と変更履歴を記録する |
| 成果物 | CHANGE_LOG.md, DECISION_LOG.md |

---

## Phase2 で実施するタスク（5, 6）

### タスク 5: 実装（SSoT 統一・deprecate マーク）

| 項目 | 内容 |
|------|------|
| 目的 | Phase1 基盤を前提に、各 ID の参照を To-Be 側へ差し替える |
| 前提 | Phase1 で storeMeta/config 取得層が整備済みであること |
| 成果物 | コード変更、必要に応じて TASK5_CHANGESPEC.md |

---

### タスク 6: テスト・検証

| 項目 | 内容 |
|------|------|
| 目的 | タスク 5 の実装に対する検証 |
| 前提 | タスク 5 の実装が完了していること |
| 成果物 | 検証結果 |

---

## 最小チェックリスト（Phase0B Done 条件）

- [x] 全対象 ID に `現 SSoT / To-Be SSoT` を記録した
- [x] 廃止側の撤去条件・実施タイミングを決めた
- [x] storeMeta/config 仕様（読み取り優先度・デフォルト値）を定義した
- [x] `CHANGE_LOG.md` / `DECISION_LOG.md` を更新した
- [ ] 実装・検証は Phase2 で実施（Phase0B スコープ外）
- [x] Phase1/2 着手時に参照すべき決定事項を文書化した

---

## Phase1 / Phase2 での必須確認

Phase1, Phase2 を実施する前に、以下を必ず確認すること。

- [PHASE0B_COMPLETED_AND_DECISIONS.md](./PHASE0B_COMPLETED_AND_DECISIONS.md)
- [docs/config_migration/PHASE0B_DECISIONS_FOR_LATER_PHASES.md](../PHASE0B_DECISIONS_FOR_LATER_PHASES.md)
