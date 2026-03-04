# CHANGE LOG（Config Migration）

本ファイルは設定移行に関する変更履歴テンプレートです。  
実変更時に新しいエントリを先頭へ追加してください。

---

## Entry Template

- Date (JST):
- Change ID: `CM-0001`
- Category: `Secrets` / `storeMeta-config` / `Top10` / `cleanup` / `env-infra` / `docs`
- Classification IDs: `D-06, R-11` など
- SSoT Before/After:
  - Before:
  - After:
- Duplicate Removed: `Yes` / `No`
- Migration Gate Check: `Pass` / `Fail`
- Summary:
  - 
  - 
- Scope: `Flutter` / `Functions` / `Firebase` / `Ops`
- Compatibility: `Breaking` / `Non-breaking`
- Migration Window:
- Rollback:
  - 
  - 
- Verification:
  - 
  - 
- Related PR/Commit:

---

## Phase0A 完了（Task6/7、Task9）

- Date (JST): 2026-03-04
- Change ID: `CM-Phase0A-001`
- Category: `Secrets` / `storeMeta-config`
- Classification IDs: `D-01`, `D-12`, `D-13`
- SSoT Before/After:
  - Before: `LINE_CHANNEL_ACCESS_TOKEN` 平文 default、`QR_SECRET_KEY` fallback、`default-store/default-tenant` 許容
  - After: default/fallback 削除、本番で未設定時 throw、default-store/default-tenant 禁止
- Duplicate Removed: `Yes`
- Migration Gate Check: `Pass`
- Summary:
  - D-01: lineWebhook/lineMessaging から defineString 平文 default 削除、process.env 参照
  - D-12: qrCodeUtils から `default-secret-key` fallback 削除
  - D-13: createScheduledTournament/createTournamentRecurrence/enqueueTournamentTasksCore/generateRecurringTournamentsCore に validateStoreTenantForProduction 適用
  - 共通 helper: `functions/src/shared/runtime.ts` に `isProductionRuntime`, `validateStoreTenantForProduction` を追加
  - Dart: tournament_service/storeId/tenantId を required 化、5 ページで kDevPlaceholderStoreId/TenantId を渡す（create_recurring_tournament_page はデプロイ後に漏れを追加修正）
  - 検証: 手動確認（LINE/QR/トーナメント）完了。既存データは test-store/test-tenant 残存あり、一旦スルー可
  - Task8（Runbook・具体手順書・運用方針の詳細化）は Phase3 で実施する方針を確定
- Scope: `Flutter` / `Functions`
- Compatibility: `Breaking`（本番では LINE_CHANNEL_ACCESS_TOKEN、QR_SECRET_KEY 必須。default-store/tenant 禁止）
- Migration Window: デプロイ後に環境変数設定必須
- Rollback:
  - 環境変数を設定すれば即時復旧可能。コードロールバックは別途。
  - 詳細 Runbook は Phase3 で作成する。
- Verification:
  - Task7 手動確認完了（LINE/QR/トーナメント/既存データ）
  - ユニットテスト・エミュレータテスト通過
  - phase0A_config_migration.spec.ts, check-default-store-tenant.ts で検証
- Related PR/Commit: (to be filled)

---

## Initial Records

- Date (JST): 2026-03-04
- Change ID: `CM-INIT-0001`
- Category: `docs`
- Classification IDs: `N/A (docs整備)`
- SSoT Before/After:
  - Before: N/A
  - After: N/A
- Duplicate Removed: `No`
- Migration Gate Check: `N/A`
- Summary:
  - Config migration 用の運用ドキュメント群（To-Be/Roadmap/Overview/Rules/Logs）を新規作成。
  - 実コード変更は行わず、監査・移行計画の土台を整備。
- Scope: `Docs`
- Compatibility: `Non-breaking`
- Migration Window: N/A
- Rollback:
  - 追加ドキュメントを削除すれば元に戻る。
- Verification:
  - `git diff --name-only` でドキュメント追加のみを確認。
  - `git status --short` で既存変更（`docs/table_device/tobe_spec.md`）以外にコード変更なしを確認。
- Related PR/Commit: (to be filled)

## 作業時差分確認メモ

- 本ドキュメントは新規作成のみ。
- 作業完了時確認:
  - `git diff --name-only`: `docs/table_device/tobe_spec.md`（既存変更）
  - `git status --short`: `M docs/table_device/tobe_spec.md`、`?? docs/config_audit/`、`?? docs/config_migration/`
  - 本タスクでコード変更はなし。
