# Phase4.1: changeSpec 関連ファイル・フォルダ構成の提案

**目的**: 3.2.5 に基づき、changeSpec 作成・実装・確認に必要なファイルとフォルダ構成を定義する。

---

## 1. changeSpec を行う上で作成すべきファイルと内容

### 1.1 各段階で作成するファイル

| ファイル | タイミング | 内容 |
|----------|------------|------|
| **CHANGESPEC.md** | 実装開始直前 | その段階の変更仕様。下記 1.2 の構成に従う |
| **VERIFICATION.md** | 実装・確認後 | 実機確認結果、チェックリストの実施記録。下記 2.2 参照 |

### 1.2 CHANGESPEC.md に含めるべき項目

WORKFLOW 6.2 をベースに、実装・確認で使いやすい形に拡張する。

| 項目 | 内容 | 記載の目安 |
|------|------|------------|
| **1. 概要・目的** | その段階で達成すること（1〜3 行）。Flow2 の完了条件への対応を明記 | 必須 |
| **2. 依存先の確認** | 実装前に確認すべき前段階の修正内容（Flow2 4.2 の「確認すべき修正内容」を転記または要約） | 必須 |
| **3. 対象ファイル一覧** | 変更対象のファイルを一覧化。Flow2 の「段階別参照ファイル」をベースに、実際の変更対象を特定 | 必須 |
| **4. 現状（As-Is）** | 各ファイルの現状を簡潔に。該当コードの抜粋（行番号付き）があると実装時に便利 | 推奨 |
| **5. 変更後（To-Be）** | 変更内容を具体的に。Flow1 該当セクションへの参照、変更前後のコード例 | 必須 |
| **6. 実装順序** | タスクの実施順序（依存がある場合）。Phase 単位で分割すると進捗管理しやすい | 必須 |
| **7. 検証ポイント** | 単体テスト・実機確認の観点。Flow2 の完了条件と対応付ける | 必須 |
| **8. チェックリスト** | 実装時・確認時にチェックする項目。完了条件の各項目をチェック可能な形に分解 | 推奨 |
| **9. ロールバック手順** | 問題発生時の戻し方（必要なら） | 任意 |
| **10. リスク・注意事項** | データ移行、インデックス、他段階への影響など | 任意 |

### 1.3 CHANGESPEC 作成時の参照元

| 参照先 | 用途 |
|--------|------|
| Flow2_IMPLEMENTATION_PHASES.md の「段階別参照ファイル」 | 対象ファイルの特定、AS-IS 確認対象 |
| Flow2_IMPLEMENTATION_PHASES.md の「完了条件」 | 検証ポイント・チェックリストの元 |
| Flow2_IMPLEMENTATION_PHASES.md の「依存関係一覧」 | 依存先の確認内容 |
| Flow1_DETAILED_SPEC.md | To-Be 仕様の詳細 |
| Flow0_IMPACT_ANALYSIS.md | 影響範囲・対応方針（該当する場合） |
| phase4/01_determineAttendanceMode/CHANGESPEC.md | 構成の参考テンプレート |

---

## 2. 実装・確認で共通で必要なファイルと内容

### 2.1 全段階で共通して参照するファイル（既存）

| ファイル | 用途 |
|----------|------|
| Flow1_DETAILED_SPEC.md | To-Be 仕様（正本） |
| Flow2_IMPLEMENTATION_PHASES.md | 段階スコープ、完了条件、参照ファイル |
| Flow0_IMPACT_ANALYSIS.md | 影響範囲、移行方針 |
| WORKFLOW.md | 進め方、changeSpec 作成ルール |

### 2.2 各段階で作成・更新するファイル

| ファイル | 用途 |
|----------|------|
| **CHANGESPEC.md** | 変更仕様。実装の指針、レビューの基準 |
| **VERIFICATION.md** | 実機確認結果、チェックリスト実施記録。PR 完了時の証跡 |

### 2.3 VERIFICATION.md に含めるべき項目

| 項目 | 内容 |
|------|------|
| **実施日・実施者** | いつ誰が確認したか |
| **完了条件チェック** | Flow2 の完了条件を満たしているか（Yes/No、備考） |
| **CHANGESPEC チェックリスト** | 全項目の実施結果（✓/✗） |
| **実機確認結果** | 対象段階の場合、手順・結果・事象 |
| **残課題・次段階への引継ぎ** | あれば記載 |

### 2.4 共通テンプレート（新規作成を推奨）

| ファイル | 用途 |
|----------|------|
| **_templates/CHANGESPEC_TEMPLATE.md** | 新規 CHANGESPEC 作成時のひな形。上記 1.2 の構成を埋め込み可能な形で提供 |
| **_templates/VERIFICATION_TEMPLATE.md** | 新規 VERIFICATION 作成時のひな形。2.3 の構成 |

---

## 3. フォルダ構成の提案

### 3.1 推奨フォルダ構成

```
docs/config_migration/phase4_1/
├── README.md
├── WORKFLOW.md
├── Flow0_IMPACT_ANALYSIS.md
├── Flow1_DETAILED_SPEC.md
├── Flow2_IMPLEMENTATION_PHASES.md
├── TOBE_SPEC_DRAFT.md
│
├── _templates/                          # 共通テンプレート（ルール含む）
│   ├── CHANGESPEC_TEMPLATE.md
│   └── VERIFICATION_TEMPLATE.md
│
├── docs/                                # 補足ドキュメント・各 step 用テンプレート
│   ├── CHANGESPEC_FILES_PROPOSAL.md     # 本ファイル
│   ├── stepA/ 〜 stepF/, stepE2/        # 各 step 用テンプレート
│   │   ├── CHANGESPEC_TEMPLATE.md
│   │   └── VERIFICATION_TEMPLATE.md
│   └── ...
│
└── docs/phase_A/ 〜 phase_F/, phase_E2/      # 各段階の実装成果物（実装開始時に作成）
    ├── CHANGESPEC.md                    # 変更仕様（テンプレートをコピーして編集）
    └── VERIFICATION.md                  # 確認結果（実装・確認後に作成）
```

### 3.2 フォルダ命名規則

| 段階 | フォルダ名 |
|------|------------|
| 4.1-A | phase_A |
| 4.1-B | phase_B |
| 4.1-C | phase_C |
| 4.1-D | phase_D |
| 4.1-E | phase_E |
| 4.1-E2 | phase_E2 |
| 4.1-F | phase_F |

※ 既存 WORKFLOW の「docs/phase_A/ 〜 docs/phase_F/（phase_E2 含む）」に合わせる。

### 3.3 段階フォルダの作成タイミング

- **phase_X/** フォルダ: その段階の changeSpec 作成時（実装開始直前）に作成
- **CHANGESPEC.md**: 上記と同時に作成
- **VERIFICATION.md**: 実装・確認完了後に作成（任意だが推奨）

---

## 4. 参照の工夫

### 4.1 README への記載

**phase4_1/README.md** に以下を追記する。

```markdown
## 段階ごとの進め方（3. 段階ごとのループ）

1. **changeSpec 作成**: Flow2 の「段階別参照ファイル」（セクション 7）を確認 → AS-IS 実コード確認 → `docs/phase_X/CHANGESPEC.md` を作成（該当 step の stepX_changeSpec.md をコピーして編集。stepA→phase_A, stepB→phase_B, … stepE2→phase_E2, stepF→phase_F）
2. **実装**: CHANGESPEC の実装順序に従い実施。チェックリストを随時更新
3. **確認**: 完了条件・検証ポイントに基づき確認。`docs/phase_X/VERIFICATION.md` に結果を記録
4. **マージ**: レビュー後、段階単位で main にマージ

詳細: [WORKFLOW.md](./WORKFLOW.md) セクション 3.3
```

### 4.2 各 phase フォルダ内の README（任意）

**docs/phase_X/README.md** を置く場合の例:

```markdown
# 4.1-X: [段階名]

- **CHANGESPEC**: [CHANGESPEC.md](./CHANGESPEC.md)
- **完了条件**: [Flow2_IMPLEMENTATION_PHASES.md](../Flow2_IMPLEMENTATION_PHASES.md) セクション 5 参照
- **依存先**: [Flow2_IMPLEMENTATION_PHASES.md](../Flow2_IMPLEMENTATION_PHASES.md) セクション 4.2 参照
```

### 4.3 Cursor ルールファイルの作成（推奨）

**`.cursor/rules/phase4_1-changespec.mdc`** を新規作成し、AI が changeSpec 作成・実装時に参照するガイドを記載する。

```markdown
---
description: Phase4.1 changeSpec 作成・実装時のガイド
globs: docs/config_migration/phase4_1/**/*
---

# Phase4.1 changeSpec ガイド

## 参照すべきドキュメント

- **仕様**: `docs/config_migration/phase4_1/Flow1_DETAILED_SPEC.md`
- **段階計画**: `docs/config_migration/phase4_1/Flow2_IMPLEMENTATION_PHASES.md`
- **進め方**: `docs/config_migration/phase4_1/WORKFLOW.md`

## changeSpec 作成時

1. Flow2 の「段階別参照ファイル」を確認し、該当段階の参照ファイル一覧を把握する
2. 参照ファイルをすべて開き、AS-IS の実装を把握する
3. Flow1 の該当セクションを確認する
4. `docs/stepX/` の該当 step の stepX_changeSpec.md をコピーし、`docs/phase_X/CHANGESPEC.md` として編集する
5. 完了条件・検証ポイントを Flow2 から転記し、チェック可能な形で記載する

## 実装時

1. CHANGESPEC の実装順序に従う
2. 段階のスコープを超える変更は行わない
3. 各タスク完了ごとにチェックリストを更新する
```

### 4.4 Flow2 への相互参照

**Flow2_IMPLEMENTATION_PHASES.md** の「段階別参照ファイル」セクションの直前に、以下を追記する。

```markdown
**changeSpec 作成時**: 本セクションの参照ファイルをすべて確認すること。作成物は `docs/phase_X/CHANGESPEC.md`。テンプレートは `docs/stepX/` の該当 step の stepX_changeSpec.md をコピーして編集。
```

### 4.5 WORKFLOW への追記

**WORKFLOW.md** のセクション 3.3.1「手順」に、テンプレートの参照を追加する。

```markdown
| 4 | `docs/config_migration/phase4_1/docs/stepX/` の該当 step の stepX_changeSpec.md をコピーし、`docs/phase_X/CHANGESPEC.md` として編集する |
```

---

## 5. 実施順序（3.2.5 の具体化）

| ステップ | 作業内容 |
|----------|----------|
| 1 | `_templates/CHANGESPEC_TEMPLATE.md`、`_templates/VERIFICATION_TEMPLATE.md` を作成 |
| 2 | phase4_1/README.md に「段階ごとの進め方」を追記 |
| 3 | `.cursor/rules/phase4_1-changespec.mdc` を作成 |
| 4 | Flow2_IMPLEMENTATION_PHASES.md に changeSpec 作成時の参照先を追記 |
| 5 | WORKFLOW.md の 3.3.1 にテンプレート参照を追記 |
| 6 | 各段階開始時: docs/phase_X/ フォルダを作成し、CHANGESPEC.md を作成 |

---

## 6. まとめ

| 分類 | ファイル | 配置 |
|------|----------|------|
| **changeSpec 用** | CHANGESPEC.md | docs/phase_X/ |
| **確認記録用** | VERIFICATION.md | docs/phase_X/ |
| **テンプレート** | CHANGESPEC_TEMPLATE.md, VERIFICATION_TEMPLATE.md | _templates/ |
| **参照ガイド** | phase4_1-changespec.mdc | .cursor/rules/ |
| **ナビゲーション** | README 追記、WORKFLOW 追記、Flow2 追記 | 既存ファイル |

これにより、changeSpec 作成 → 実装 → 確認の一連の流れで、何をどこに書くかが明確になり、AI やレビュアーが適切に参照できる。
