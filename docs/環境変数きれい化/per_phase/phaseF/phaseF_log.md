# phaseF 作業ログ

## 2026-04-01

### 実施（ステップ1〜3）

- phaseF開始。
- `phaseF/README.md` と `進め方_仕様詳細化とフェーズ設計フロー.md` を確認。
- phaseE引き継ぎ（`phaseE_完了サマリとphaseF引き継ぎ.md`）を確認。
- phaseF対象の詳細仕様を再確認:
  - GitHub_Actions_ToBe
  - リージョン移行_ToBe
  - Secret_Manager_ToBe（9.3, 10, 11）
  - コード固定_ToBe（4.1, 9.3, 11）
  - 導入時設定 `fireBase紐付け/*`
- As-Is調査を実施し、以下を確認:
  - `.github/workflows` が未作成
  - `functions/src` に `us-central1` 残存
  - `controlHookHttp` がリージョン未指定
  - `cloudTasksConfig.ts` は `asia-northeast1` 固定済み
- `phaseF/changeSpec.md` を作成（実装計画・外部操作・テスト方針を明記）。
- `phaseF/phaseF_外部操作手順.md` を作成（WIF/IAM/queue/`task-endpoints` の実行順コマンド）。
- `phaseF/phaseF_外部操作手順.md` を更新し、`WIF_SERVICE_ACCOUNT` の候補確認 -> 未存在時作成 -> 確認 -> GitHub Secret 設定の手順を明記。
- `phaseF/phaseF_外部操作手順.md` を更新し、`WIF_PROVIDER` が未存在（`Listed 0 items.`）だった場合の判定 -> 作成 -> 実値確認までを追記。

### 実施（実装着手）

- GitHub Actions workflow を追加:
  - `.github/workflows/deploy-functions.yml`
  - `workflow_dispatch` + `project_id(choice: Firebase Project ID)` + WIF認証 + `firebase deploy --only functions`
- `us-central1` 残存の関数リージョンを `asia-northeast1` に統一:
  - attendance correction 系 callables
  - storeMeta callables
  - `getAvailableTables`
  - `controlHookHttp`（`functions/src/index.ts`）
- コメント上のリージョン記載も `asia-northeast1` へ更新。

### 実施（導入時資料）

- `docs/運用時資料/導入時設定/fireBase紐付け/README.md` を更新し、phaseF対象（WIF/リージョン統一/task-endpoints）を明記。
- `docs/運用時資料/導入時設定/fireBase紐付け/3レイヤー整合_設計方針.md` を更新し、デプロイ層の WIF 前提と `asia-northeast1` 統一観点を追記。
- `docs/運用時資料/導入時設定/fireBase紐付け/リリース前後チェックリスト.md` を更新し、以下のチェック項目を追加:
  - GitHub Actions の `project_id(choice: Firebase Project ID)` / WIF / Secrets
  - `asia-northeast1` 統一確認
  - `task-endpoints` と実体リージョン整合

### テスト・確認

- `cd functions && npm run build`: 成功
- `cd functions && npm run lint`: 成功
- `rg -n "us-central1" functions/src`: 0件（直書き残存なし）

### 進捗メモ

- 次に実施予定:
  - 外部操作（WIF/IAM/Secret更新/queue最終整備）の実行手順を phaseF 内で確定
  - phaseF ステップ8（運用時資料最終判定）とステップ9（完了サマリ）作成
