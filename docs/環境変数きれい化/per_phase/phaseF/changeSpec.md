# phaseF changeSpec（初回リリース前整備）

作成日: 2026-04-01  
ステータス: 実装中

用語ルール:

- `GitHubリポジトリ名`: 例 `yahatata/amuse_app_template`
- `Firebase Project ID（= GCP Project ID）`: 例 `amuse-app-template`
- `project_id`: GitHub Actions workflow の入力名（値は Firebase Project ID）

## 1. 対象仕様書と対象章

### 1.1 GitHub Actions To-Be

- `docs/環境変数きれい化/仕様書/GitHub_Actions_ToBe_詳細仕様.md`
  - 1〜12 全体

### 1.2 リージョン移行 To-Be

- `docs/環境変数きれい化/仕様書/リージョン移行_ToBe_詳細仕様.md`
  - 1〜12 全体

### 1.3 Secret Manager To-Be（phaseF担当）

- `docs/環境変数きれい化/仕様書/Secret_Manager_ToBe_詳細仕様.md`
  - 9.3 CI/CD
  - 10 IAM 前提
  - 11 ローテーション方針の導入時反映

### 1.4 コード固定 To-Be（phaseF担当）

- `docs/環境変数きれい化/仕様書/コード固定_ToBe_詳細仕様.md`
  - 4.1 リージョン方針
  - 9.3 GCP 側削除対象
  - 11 テスト・確認観点のリージョン関連

### 1.5 導入時資料

- `docs/運用時資料/導入時設定/fireBase紐付け/README.md`
- `docs/運用時資料/導入時設定/fireBase紐付け/3レイヤー整合_設計方針.md`
- `docs/運用時資料/導入時設定/fireBase紐付け/リリース前後チェックリスト.md`

## 2. As-Is確認結果

### 2.1 CI/CD

- `.github/workflows` が存在せず、Functions デプロイ用 GitHub Actions workflow が未作成。
- 現状運用はローカル `firebase deploy --only functions --project ...` 実行が中心。

### 2.2 リージョン

- `functions/src` に `region: 'us-central1'` が残存（主に attendance/storeMeta/tournament_activeTournament）。
- `controlHookHttp` はリージョン未指定（デフォルトリージョン依存）。
- `shared/config/cloudTasksConfig.ts` の定数は `asia-northeast1` 固定済み。

### 2.3 GCPリソース（棚卸し時点）

- Functions は `us-central1` 側が多数、`asia-northeast1` 側は scheduler-job 系中心。
- Queue は `tournament-queue` は `asia-northeast1` に存在、`business-date-assessment-queue` 等は `us-central1` 側残存。
- `task-endpoints` は `controlHookUrl` が `us-central1` URL を指す状態が確認済み。

### 2.4 phaseE引き継ぎ

- phaseE で旧関数・旧 env は整理済み。
- phaseF は「WIF付きCI/CD」「リージョン統一」「導入時資料更新」が主対象。

## 3. 新規作成するファイル

- `.github/workflows/deploy-functions.yml`
- `docs/環境変数きれい化/per_phase/phaseF/phaseF_log.md`
- `docs/環境変数きれい化/per_phase/phaseF/phaseF_外部操作手順.md`

## 4. 修正するファイル

### 4.1 リージョン統一（コード）

- `functions/src/index.ts`（`controlHookHttp` の region 明示）
- `functions/src/domains/attendance/callables/*`（`us-central1` -> `asia-northeast1`）
- `functions/src/domains/storeMeta/callables/*`（`us-central1` -> `asia-northeast1`）
- `functions/src/domains/tournament_activeTournament/callables/getAvailableTables.ts`
- `functions/src/domains/user/callables/processVisitByQR.ts`（コメント上のリージョン記載）

### 4.2 フェーズ管理資料

- `docs/環境変数きれい化/per_phase/phaseF/changeSpec.md`（本ファイル）
- `docs/環境変数きれい化/per_phase/phaseF/phaseF_log.md`

### 4.3 導入時資料

- `docs/運用時資料/導入時設定/fireBase紐付け/README.md`
- `docs/運用時資料/導入時設定/fireBase紐付け/3レイヤー整合_設計方針.md`
- `docs/運用時資料/導入時設定/fireBase紐付け/リリース前後チェックリスト.md`

## 5. 移動するファイル

- なし

## 6. 実装方針

### 6.1 GitHub Actions + WIF

- `workflow_dispatch` で `project_id`（Firebase Project ID）を `choice` 入力に固定する。
- `google-github-actions/auth@v2` を使い、`WIF_PROVIDER`/`WIF_SERVICE_ACCOUNT` で認証する。
- `firebase deploy --only functions --project=<Firebase Project ID>` を workflow で実行する。
- workflow 側に Secret Manager 読み取り権限は与えない。

### 6.2 リージョン統一（コード）

- `us-central1` 直書きを `asia-northeast1` へ統一する。
- `controlHookHttp` を `asia-northeast1` へ明示固定する。
- `cloudTasksConfig.ts` の `asia-northeast1` 固定値と実装の整合を取る。

### 6.3 導入時資料更新

- 3レイヤー整合資料・チェックリストに、以下を明示追記する。
  - GitHub Actions の `project_id`（Firebase Project ID）選択と WIF 前提
  - リージョンを `asia-northeast1` で統一する確認手順
  - `task-endpoints` 更新と確認手順

### 6.4 外部操作の扱い

- エージェントで実行可能なコード/資料更新はエージェント側で実施。
- GitHub Secrets 登録、WIF 初期設定、IAM 付与、Secret 実値更新は手順化してユーザー操作として依頼する。

## 7. 必要テストの検討（実施予定）

### 7.1 静的確認

- `rg "us-central1" functions/src` が 0 件になること。
- workflow YAML が `workflow_dispatch` / `project_id(choice: Firebase Project ID)` / WIF auth を含むこと。

### 7.2 ビルド・Lint

- `cd functions && npm run build`
- `cd functions && npm run lint`

### 7.3 追加確認

- `controlHookHttp` の export が `region: "asia-northeast1"` であること。
- 導入時資料のチェックリストに WIF / リージョン / task-endpoints の確認観点が入っていること。

## 8. 外部操作

1. GitHub側
- `WIF_PROVIDER` / `WIF_SERVICE_ACCOUNT` を GitHub Secrets に登録。
- 必要に応じて Environment 保護を設定。

2. GCP側
- Workload Identity Pool/Provider とデプロイ用 SA の紐付け。
- デプロイ用 SA に必要ロール付与。
- Functions 実行 SA に `roles/secretmanager.secretAccessor` を付与（最低3secret）。

3. リージョン移行
- `asia-northeast1` 側 queue の作成/確認。
- 必要に応じて旧 `us-central1` リソースを削除。

4. Secret更新
- `task-endpoints.controlHookUrl`
- `task-endpoints.closeAssessmentUrl`
- `task-endpoints.openAssessmentUrl`

## 9. リスク

- リージョン切替直後に Queue / URL / Function の不整合があると task 実行失敗が起こる。
- WIF 設定漏れがあると GitHub Actions デプロイが失敗する。
- Secret 更新と deploy の順序を誤ると一時的に旧URLを参照する可能性がある。

## 10. ロールバック方法

1. コードロールバック
- region 変更コミットと workflow 追加コミットを戻す。

2. 設定ロールバック
- `task-endpoints` を旧URLへ戻す。
- 旧リージョンの queue/function を一時的に再有効化する。

3. 再確認
- task enqueue から実行まで疎通確認を再実施する。
