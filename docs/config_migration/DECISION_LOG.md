# DECISION LOG（Lightweight ADR）

## Decision Template

- Decision ID: `D-0001`
- Status: `Proposed` / `Accepted` / `Superseded`
- Date (JST):
- Context:
- Decision:
- Alternatives:
  - A:
  - B:
- Consequences:
  - Positive:
  - Negative:
- Evidence:
  - file/path
  - file/path

---

## D-0001 Secrets は Secret Manager に統一

- Status: Superseded
- Date (JST): 2026-03-04
- Context:
  - `LINE_CHANNEL_ACCESS_TOKEN` が `defineString(default=...)` で平文保持。
  - `QR_SECRET_KEY` が `default-secret-key` fallback を持つ。
- Decision:
  - 機密値は `defineSecret` + Secret Manager へ統一し、default/fallback を禁止。
- Alternatives:
  - A: 現状維持（却下）
  - B: env 変数で運用（機密保護観点で不十分）
- Consequences:
  - Positive: 漏えいリスク低減
  - Negative: デプロイ手順が増える
- Evidence:
  - `functions/src/domains/webhook/callables/lineWebhook.ts`
  - `functions/src/domains/webhook/services/lineMessaging.ts`
  - `functions/src/domains/user/services/qrCodeUtils.ts`
  - Superseded by: `D-0009`

## D-0002 `storeMeta/config` 導入、更新は Functions 経由

- Status: Accepted
- Date (JST): 2026-03-04
- Context:
  - Run-time 設定の候補が分散し、二重管理が発生。
  - `storeMeta/currentBusinessDay` の購読基盤は既に存在。
- Decision:
  - Run-time 設定は `storeMeta/config` に集約。
  - 更新は管理者 callable 等の Functions 経由に限定。
- Alternatives:
  - A: Flutter 直更新（却下）
  - B: env 中心で運用（運用即時性不足）
- Consequences:
  - Positive: 参照元の一元化、運用変更の即時反映
  - Negative: 初期実装コスト増
- Evidence:
  - `lib/services/store_meta_service.dart`
  - `docs/config_audit/store_config_followup_checkpoints.md`

## D-0003 会計/営業日/締め処理は Functions 最終決定

- Status: Accepted
- Date (JST): 2026-03-04
- Context:
  - 正当性が重要な処理でクライアント主導だと整合性事故が起きる。
- Decision:
  - Functions を最終決定者とする SSoT 原則を採用。
- Alternatives:
  - A: クライアント計算を正とする（却下）
- Consequences:
  - Positive: 計算一貫性と監査性が高い
  - Negative: サーバ依存が増える
- Evidence:
  - `functions/src/domains/bills/repos/calcBusinessDate.ts`
  - `functions/src/domains/bills/callables/verifyPaymentSplit.ts`

## D-0004 region は店舗差分ではなく環境差分

- Status: Accepted
- Date (JST): 2026-03-04
- Context:
  - `us-central1` の指定が複数箇所に散在。
- Decision:
  - region は店舗設定から分離し、Deploy 環境差分として統一管理する。
- Alternatives:
  - A: 店舗ごとに region を分ける（原則不採用）
- Consequences:
  - Positive: 運用ルール単純化
  - Negative: 地域要件が強い場合に再設計が必要
- Evidence:
  - `functions/src/**`（`region: 'us-central1'` 多数）
  - `docs/config_audit/store_config_followup_checkpoints.md`

## D-0005 `--dart-define` は現状 docs 記載のみとして扱う

- Status: Accepted
- Date (JST): 2026-03-04
- Context:
  - docs 上に `--dart-define` 記述はあるが、`lib/**` 実コード参照は未確認。
- Decision:
  - 現時点では実装済み設定として扱わない。
  - 採用する場合は別 Decision で対象キー・注入経路・検証方法を明確化する。
- Alternatives:
  - A: docs 記載を実装済みと見なす（却下）
- Consequences:
  - Positive: 誤認防止
  - Negative: 導入時に追加工数
- Evidence:
  - `docs/table_device/tobe_spec.md`
  - `docs/config_audit/store_config_followup_checkpoints.md`

## D-0006 二重管理の掃除を Phase0 先行とする

- Status: Accepted
- Date (JST): 2026-03-04
- Context:
  - 同義設定が残ったまま Run-time 化すると、移行先が増えるだけで複雑化する。
- Decision:
  - Secrets 是正に続き、二重管理解消（SSoT単一化）を先行フェーズで実施する。
- Alternatives:
  - A: Run-time 化を先に進める（却下）
- Consequences:
  - Positive: 無駄な移行を減らせる
  - Negative: 初期フェーズの調査量が増える
- Evidence:
  - `docs/config_audit/store_config_classification.md`
  - `docs/config_audit/store_config_followup_checkpoints.md`

## D-0007 対象は Top10 ではなく classification 全ID

- Status: Accepted
- Date (JST): 2026-03-04
- Context:
  - Top10 は優先度指標であり、対象の限定ではない。
- Decision:
  - 実装管理の母集団は `store_config_classification.md` の全ID（B/D/R）とする。
- Alternatives:
  - A: Top10 のみ移行（却下）
- Consequences:
  - Positive: 対象漏れを防げる
  - Negative: 進捗管理が重くなる
- Evidence:
  - `docs/config_audit/store_config_classification.md`

## D-0008 Run-time 化の着手条件（ゲート）を設ける

- Status: Accepted
- Date (JST): 2026-03-04
- Context:
  - 重複SSoTが残る状態で Run-time 化すると事故率が高い。
- Decision:
  - 対象IDの現SSoT/To-Be SSoTが確定し、重複参照解消の証跡がある場合のみ Run-time 化を許可する。
- Alternatives:
  - A: ゲートなしで移行（却下）
- Consequences:
  - Positive: 移行品質が安定する
  - Negative: 速度はやや低下する
- Evidence:
  - `docs/config_migration/migration_roadmap.md`
  - `docs/config_migration/CHANGE_RULES.md`

## D-0009 Phase0A の Secrets 運用方式は default 削除・環境変数はコマンド/コンソールで設定

- Status: Accepted
- Date (JST): 2026-03-04
- Context:
  - 平文 default/fallback の除去は必須。デプロイで意図しない上書きを防ぐため、env ファイルを正にしたくない。
- Decision:
  - Phase0A では default/fallback を禁止する。
  - **環境変数はコマンドまたはコンソールで登録する。env ファイルは使用しない**（テンプレートリポジトリ完成・リリース開始後は絶対に使用しない）。開発段階ではローカル用に限り .env 等の利用を許容する。
  - 本番/ステージングは未設定時エラーとする。
- Alternatives:
  - A: 直ちに Secret Manager 一択で固定
  - B: env ファイルで運用（却下: 更新時の上書きリスクのため）
- Consequences:
  - Positive: デプロイによる環境変数の意図しない上書きを防げる。Secret Manager 未導入でも Phase0A を前進できる。
  - Negative: Secret Manager に比べると運用セキュリティ機能が弱い。
- Evidence:
  - `docs/config_migration/phase0A/TASK_LIST.md`
  - `docs/config_migration/phase0A/PHASE0A_TARGET_LIST.md`
  - `docs/config_migration/phase0A/DEV_DEBUG_CONFIG_POLICY.md`

## D-0010 パターンA固定（1Repo/店舗別成果物・店舗別デプロイ）

- Status: Accepted
- Date (JST): 2026-03-04
- Context:
  - 店舗ごとに別アプリ（別 applicationId/bundleId）、別 Firebase プロジェクト、別 Functions デプロイを前提に運用する。
- Decision:
  - 運用モデルをパターンA固定とし、店舗追加は設定・対象指定中心で行う。
- Alternatives:
  - A: 店舗ごとにリポジトリ分離
  - B: 単一 Firebase プロジェクト内で全店舗を運用
- Consequences:
  - Positive: テンプレート保守と店舗単位更新を両立できる
  - Negative: flavor/scheme とデプロイ対象管理の運用整備が必要
- Evidence:
  - `docs/config_migration/tobe_config_architecture.md`
  - `docs/config_migration/changeSpec_overview.md`

## D-0011 本番で default-store/default-tenant を禁止

- Status: Accepted
- Date (JST): 2026-03-04
- Context:
  - `default-store/default-tenant` が本番に残ると、店舗識別の誤りを招く。
- Decision:
  - 本番では `storeId` / `tenantId` を Build/Deploy で注入し、default 値の残存を禁止する。
- Alternatives:
  - A: default 値を本番でも許容
- Consequences:
  - Positive: 店舗横断誤動作リスクを低減
  - Negative: 店舗追加手順の厳密化が必要
- Evidence:
  - `docs/config_migration/phase0A/PHASE0A_TARGET_LIST.md`
  - `docs/config_migration/phase0A/PHASE0A_REFERENCE_MAP.md`
  - Phase0A Task6/7 にて本番ガード実装完了（validateStoreTenantForProduction、D-01/D-12 未設定時 throw）

## D-0012 Phase0A Task8（Runbook・具体手順書）を Phase3 で実施する

- Status: Accepted
- Date (JST): 2026-03-04
- Context:
  - Phase0A の Task8 は「ロールバック手順・監視観点の文書化（Runbook）」を想定していた。
  - 本フェーズでは方針・概要の確定に留め、具体手順書・運用 Runbook の作成は Phase3 で一括実施する方が整理しやすい。
- Decision:
  - Phase0A では Task6/7 完了をもって本フェーズ完了とする。
  - ロールバック手順書・監視観点 Runbook・デプロイ前チェックリストの詳細は Phase3 で作成する。
- Alternatives:
  - A: Phase0A 内で Runbook を完成させる（却下: Phase3 の運用手順整備と統合した方が効率的）
- Consequences:
  - Positive: Phase0A の完了を早め、 Phase3 で運用手順を一括整理できる
  - Negative: Phase0A デプロイ〜Phase3 までの間は概要ベースのロールバック手順となる
- Evidence:
  - `docs/config_migration/phase0A/TASK_LIST.md`
  - `docs/config_migration/phase0A/PHASE0A_COMPATIBILITY_ROLLBACK_POLICY.md`
  - `docs/config_migration/phase0A/README.md`

## 作業時差分確認メモ

- 本ドキュメントは新規作成のみ。
- 作業完了時確認:
  - `git diff --name-only`: `docs/table_device/tobe_spec.md`（既存変更）
  - `git status --short`: `M docs/table_device/tobe_spec.md`、`?? docs/config_audit/`、`?? docs/config_migration/`
  - 本タスクでコード変更はなし。
