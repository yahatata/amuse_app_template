# Phase0A README

## 目的

Secrets と危険な fallback を先に是正し、後続フェーズの事故確率を下げる。

## スコープ

- 平文 default を持つ機密設定の除去
- 弱い fallback（`default-*`）の除去
- 機密値は default/fallback なしへ移行（D-0009）。環境変数はコマンドまたはコンソールで設定し、**env ファイルは使用しない**（リリース開始後は絶対に使用しない）

## 参照必須

- `docs/config_migration/tobe_config_architecture.md`
- `docs/config_migration/migration_roadmap.md`
- `docs/config_migration/CHANGE_RULES.md`
- `docs/config_audit/store_config_classification.md`
- `docs/config_audit/store_config_followup_checkpoints.md`

## 重点対象（現時点）

- `functions/src/domains/webhook/callables/lineWebhook.ts`
- `functions/src/domains/webhook/services/lineMessaging.ts`
- `functions/src/domains/user/services/qrCodeUtils.ts`

## タスク一覧

詳細なタスク一覧（サマリ版・詳細版）は [TASK_LIST.md](./TASK_LIST.md) を参照。

## 対象一覧（タスク1 成果物）

Phase 0A で扱う ID（D-01, D-12, D-13）の詳細は [PHASE0A_TARGET_LIST.md](./PHASE0A_TARGET_LIST.md) を参照。

## 参照マップ（タスク2 成果物）

参照箇所・使用経路のマップは [PHASE0A_REFERENCE_MAP.md](./PHASE0A_REFERENCE_MAP.md) を参照。

## Before/After 決定メモ（タスク3 成果物）

各 ID の Before/After と、要確認事項は [PHASE0A_BEFORE_AFTER_DECISION.md](./PHASE0A_BEFORE_AFTER_DECISION.md) を参照。

## 互換期間・ロールバック方針（タスク4 成果物）

互換期間の有無とロールバック手順は [PHASE0A_COMPATIBILITY_ROLLBACK_POLICY.md](./PHASE0A_COMPATIBILITY_ROLLBACK_POLICY.md) を参照。

## 環境変数設定・デプロイ手順（タスク5 成果物）

環境変数はコマンドまたはコンソールで設定し、env ファイルは使用しない。手順は [PHASE0A_PARAMS_DEPLOY_GUIDE.md](./PHASE0A_PARAMS_DEPLOY_GUIDE.md) を参照。

## タスク6 changeSpec

Task6 の実装詳細（Functions + Dart + テスト + 既存データ確認）は [TASK6_CHANGESPEC.md](./TASK6_CHANGESPEC.md) を参照。

## 開発時設定ポリシー

デバッグ時のローカル設定ファイル運用は [DEV_DEBUG_CONFIG_POLICY.md](./DEV_DEBUG_CONFIG_POLICY.md) を参照。

## 進め方（推奨順）

1. 対象キーを列挙（Classification ID 紐付け）
2. 既存参照箇所を全検索して使用経路を確定
3. Before/After（現SSoT/To-Be SSoT）を決定
4. 互換期間の有無を決定（Secrets は原則互換なし）
5. 実装・検証（ロールバック手順・Runbook は Phase3 で作成）
6. `CHANGE_LOG.md` / `DECISION_LOG.md` 更新

## Done 条件

- 機密の平文 default がコード上に残っていない
- 機密 fallback が残っていない
- 失敗時のロールバック手順が 1 ページで説明可能（Phase3 で Runbook 作成時に実施）

## 失敗しやすいポイント

- webhook 側だけ直して service 側に平文が残る
- 環境値未設定で本番停止
- 旧値切り戻し手順が不足

## 最小チェックリスト

- [x] 変更対象に Classification ID を付与した
- [x] 環境変数の設定手順（コマンド/コンソール）を文書化した
- [x] `CHANGE_LOG.md` を更新した
- [ ] 監視/アラート観点を記載した（Phase3 で Runbook 作成時に実施）

---

## Phase0A 完了（2026-03-04）

Task6/7/9 完了。D-01/D-12/D-13 の実装・検証・デプロイ・ログ更新済み。次フェーズは Phase0B。  
※ Task8（Runbook・具体手順書・運用方針の詳細化）は Phase3 で実施する。
