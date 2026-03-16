# Phase3 README

**実施順序**: Phase4 と Phase5 を完了した後に実施する。機能改修を優先し、運用・整理は最後に行う。

---

## 目的

移行後のハードニングと整理を行い、運用を安定化する。

## スコープ

- deprecate 定義の最終掃除
- docs-only 値の扱い整理
- 運用手順・監査ログの定着
- **Phase0A Task8 の成果物**: ロールバック手順・監視観点 Runbook、デプロイ前チェックリスト（D-0012 により Phase3 で実施）

## 前提

- **Phase2 完了済み** ✅: 全移行対象 ID の参照が storeMeta/config → defaults フォールバック構造に切り替わっている。GlobalConstants から移行済み定数は削除済み。
- **Phase4・Phase5 完了済み**: 夜間ジョブ・打刻改修、pointTypes 改修が完了していること。

## 参照必須

- `docs/config_migration/migration_roadmap.md`
- `docs/config_migration/phase1/PHASE1_ROLLBACK.md`（ロールバック観点）
- `docs/config_migration/phase4/README.md`（Phase4 詳細仕様）
- `docs/config_migration/phase5/README.md`（Phase5 詳細仕様）
- `docs/config_migration/changeSpec_overview.md`
- `docs/config_migration/CHANGE_RULES.md`
- `docs/config_migration/CHANGE_LOG.md`
- `docs/config_migration/DECISION_LOG.md`

## 進め方（推奨順）

1. 完了済みIDの残タスクを棚卸し
2. 旧参照（deprecate）を撤去
3. 運用Runbookを更新（Phase0A のロールバック手順・監視観点 Runbook を含む）
4. 監査観点（変更履歴/意思決定）を整備

## Done 条件

- 旧参照が最終的に撤去または期限付き管理される
- 全IDが Build/Deploy/Run のどこかに確定している
- 運用担当が手順書だけで変更を実施できる

## 失敗しやすいポイント

- 実装は終わっているのに運用手順がない
- 旧設定が残り続けて再発する
- decision/change log が更新されず背景が失われる

## 最小チェックリスト

- [ ] deprecate 設定の処理方針が確定した
- [ ] 運用手順を更新した
- [ ] 監査ログを更新した
- [ ] 未処理IDがないことを確認した
