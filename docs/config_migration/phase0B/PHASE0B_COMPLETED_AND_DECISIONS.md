# Phase0B 完了サマリと決定事項

作成日: 2026-03-04  
Phase1, Phase2 を実施する際は**本ドキュメントと [PHASE0B_DECISIONS_FOR_LATER_PHASES.md](../PHASE0B_DECISIONS_FOR_LATER_PHASES.md) を必ず確認すること**。

---

## 1. Phase0B のスコープと完了タスク

### Phase0B で行うこと・行わないこと

| 行うこと | 行わないこと |
|----------|--------------|
| 対象 ID の列挙・重複の洗い出し | 実装（参照差し替え・deprecate マーク） |
| 参照箇所の検索・使用経路の確定 | テスト・検証 |
| 現 SSoT → To-Be SSoT の決定 | |
| 廃止計画の定義 | |
| storeMeta/config 仕様の定義 | |
| CHANGE_LOG / DECISION_LOG の更新 | |

**理由**: storeMeta/config 取得層は Phase1 で整備する。参照差し替え・検証は Phase1 基盤完了後の Phase2 で ID 単位に実施する。

### 完了したタスク

| タスク | 成果物 | 状態 |
|--------|--------|------|
| 1. 対象 ID 列挙 | PHASE0B_TARGET_LIST.md | ✅ 完了 |
| 2. 参照箇所の確定 | PHASE0B_REFERENCE_MAP.md | ✅ 完了 |
| 3. Before/After 決定 | PHASE0B_BEFORE_AFTER_DECISION.md | ✅ 完了 |
| 4. 廃止計画定義 | PHASE0B_DEPRECATION_PLAN.md | ✅ 完了 |
| storeMeta/config 仕様 | STOREMETA_CONFIG_SPEC.md | ✅ 完了 |
| 7. ログ更新 | CHANGE_LOG, DECISION_LOG | ✅ 完了 |

---

## 2. 主要な決定事項

### 2.1 To-Be SSoT

- **共通**: Firestore `storeMeta/config`（単一ドキュメント）
- **D-06 (STORE_CLOSE_HOUR)**: storeMeta/config には入れない。Phase4 で廃止。
- **R-09 (requiredStaffByTimeSlot)**: 曜日ごとの可能性あり。実装時に別ドキュメント分離を検討。

### 2.2 読み取り優先度

1. storeMeta/config
2. `functions/src/shared/config/defaults.ts`
3. 各 TS ファイル内の直書き

**未設定時はエラーにしない**（新規店舗・新規設定の先行投入に対応）。

### 2.3 デフォルト値

- **集約ファイル**: `functions/src/shared/config/defaults.ts`
- **運用**: デフォルト変更時は defaults.ts と各 TS 内直書きを両方更新する。

### 2.4 更新経路

- Phase1 で整備: 詳細設定ページ（AdminHomePage→詳細設定）から initializeStoreConfigCallable で初期投入。管理者 callable 経由に統一。
- 開発者による CLI/Console からの投入も可能。詳細は [phase1/PHASE1_UPDATE_PATH_DESIGN.md](../phase1/PHASE1_UPDATE_PATH_DESIGN.md)。

### 2.5 各 ID の To-Be と実施タイミング

| ID | To-Be SSoT | 実施タイミング |
|----|------------|----------------|
| D-06 | 廃止（Phase4） | Phase4 |
| D-10 | storeMeta/config | Phase2 |
| R-09 | storeMeta/config（または別 doc） | Phase2 |
| R-10 | storeMeta/config | Phase2 |
| R-11, R-12 | storeMeta/config | Phase2 |
| D-04 | storeMeta/config | Phase2 |
| CALC_BUSINESS_DATE_BUFFER_MINUTES | storeMeta/config | Phase2 |

---

## 3. 後続フェーズの状態

- **Phase1**: ✅ 完了（取得層・更新経路・Flutter 参照責務・ロールバック観点）
- **Phase2**: ✅ 完了（全 ID 参照差し替え・旧参照削除完了。詳細は [phase2/ALL_ID_STATUS.md](../phase2/ALL_ID_STATUS.md)）

## 4. 参照ドキュメント一覧

| ドキュメント | 内容 |
|--------------|------|
| [PHASE0B_TARGET_LIST.md](./PHASE0B_TARGET_LIST.md) | 対象 ID 一覧 |
| [PHASE0B_REFERENCE_MAP.md](./PHASE0B_REFERENCE_MAP.md) | 参照箇所マップ |
| [PHASE0B_BEFORE_AFTER_DECISION.md](./PHASE0B_BEFORE_AFTER_DECISION.md) | SSoT 決定 |
| [PHASE0B_DEPRECATION_PLAN.md](./PHASE0B_DEPRECATION_PLAN.md) | 廃止計画 |
| [STOREMETA_CONFIG_SPEC.md](./STOREMETA_CONFIG_SPEC.md) | storeMeta/config 仕様 |
| [../PHASE0B_DECISIONS_FOR_LATER_PHASES.md](../PHASE0B_DECISIONS_FOR_LATER_PHASES.md) | Phase1/2 で必須確認する決定事項 |
