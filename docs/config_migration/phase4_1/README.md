# Phase4.1: attendances 休憩導入・改修

## 目的

attendances コレクション周りの仕様を整理し、以下を実施する。

1. **休憩機能の導入** — breaks サブコレの追加、休憩開始/終了の処理
2. **計算体系の見直し** — totalMinutes / nightMinutes から actualWorkMinutes / nightWorkMinutes への移行
3. **更新経路の統一** — 管理者フォームの直接 Firestore 更新を Functions 経由に寄せる
4. **監査ログ基盤の追加** — attendanceLogs コレクションの導入

休憩導入に伴う改修と、それとは別枠の修正（整合性・責務の整理）の両方を含む。

---

## ドキュメント構成

| ファイル | 概要 |
|----------|------|
| [Flow1_DETAILED_SPEC.md](./Flow1_DETAILED_SPEC.md) | To-Be 仕様書（正本・Flow1 成果物） |
| [TOBE_SPEC_DRAFT.md](./TOBE_SPEC_DRAFT.md) | 旧 To-Be 仕様書（参照用） |
| [WORKFLOW.md](./WORKFLOW.md) | 全体フロー・各フローで行うこと・具体的な進め方・決定事項の記録先・changeSpec 参照ファイル一覧 |
| [Flow0_IMPACT_ANALYSIS.md](./Flow0_IMPACT_ANALYSIS.md) | 事前準備の成果物（影響範囲・移行方針） |
| [Flow2_IMPLEMENTATION_PHASES.md](./Flow2_IMPLEMENTATION_PHASES.md) | 実装段階の計画成果物（Flow2 成果物） |
| [_templates/](./_templates/) | 共通テンプレート（ルール含む） |
| [docs/stepA/](./docs/stepA/) 〜 [docs/stepF/](./docs/stepF/), [docs/stepE2/](./docs/stepE2/) | 各 step 用 stepX_changeSpec.md, stepX_verification.md。検証完了後は stepX_completion_summary.md を同フォルダに作成 |
| [docs/CHANGESPEC_FILES_PROPOSAL.md](./docs/CHANGESPEC_FILES_PROPOSAL.md) | changeSpec 関連ファイル・フォルダ構成の提案（3.2.5） |
| [docs/phase_A/](./docs/phase_A/) 〜 [docs/phase_F/](./docs/phase_F/), [docs/phase_E2/](./docs/phase_E2/) | 各段階の CHANGESPEC.md, VERIFICATION.md（stepA→phase_A, stepB→phase_B, … stepE2→phase_E2, stepF→phase_F） |

---

## 段階ごとの進め方（3. 段階ごとのループ）

1. **changeSpec 作成**: Flow2 の「段階別参照ファイル」（セクション 7）を確認 → AS-IS 実コード確認 → `docs/phase_X/` フォルダを作成し、`docs/phase_X/CHANGESPEC.md` を作成（該当 step の stepX_changeSpec.md をコピーして編集。stepA→phase_A, stepB→phase_B, … stepE2→phase_E2, stepF→phase_F）
2. **実装**: CHANGESPEC の実装順序に従い実施。チェックリストを随時更新
3. **確認**: 完了条件・検証ポイントに基づき確認。`docs/phase_X/VERIFICATION.md` に結果を記録。検証完了後、該当 step フォルダ内に stepX_completion_summary.md を作成（該当 step の stepX_verification.md をコピーして編集）
4. **マージ**: レビュー後、段階単位で main にマージ

詳細: [WORKFLOW.md](./WORKFLOW.md) セクション 3.3

---

## 次のステップ

1. **0. 事前準備** — Flow0_IMPACT_ANALYSIS.md の作成（完了）
2. **1. 細かい仕様の決定** — Flow1_DETAILED_SPEC.md の作成（完了）
3. **2. 実装段階の計画** — Flow2_IMPLEMENTATION_PHASES.md の作成（完了）
4. **3. 段階ごとのループ** — changeSpec → 実装 → テスト → 実機確認
