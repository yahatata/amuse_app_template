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

## 2026-04-02

### 実施（phaseF.1: 全関数リージョン明示化）

- phaseF.1 計画書を作成:
  - `phaseF.1_changeSpec_リージョン明示化.md`
- As-Is再確認:
  - `gcloud functions list --v2 --regions=us-central1,asia-northeast1`
  - 集計結果: `asia-northeast1=24`, `us-central1=145`
- 実装:
  - `functions/src` の関数定義ファイル（`export const ... = onXxx(`）を自動抽出し、
    全 164 ファイルへ `setGlobalOptions({ region: 'asia-northeast1' })` を追加
  - 追加漏れ監査を実施し、`files_missing_global_region=0` を確認
- 検証:
  - `cd functions && npm run build`: 成功
  - `cd functions && npm run lint`: 成功
- バッチ外部操作補助:
  - 追加: `scripts/functions_region_migration_report.sh`
  - dry-run 検証:
    - `--from us-central1 --to asia-northeast1` で比較結果を出力
    - 現時点は `in_both=0`（未再デプロイのため）

### phaseF本流へ戻るための明記

- phaseF.1 は「コード上のリージョン明示化」と「移行バッチ準備」まで完了。
- ここから phaseF 本体へ戻り、次を実施する:
  1. Functions 再デプロイ（WIF/GitHub Actions）
  2. `task-endpoints` 更新
  3. 疎通確認後に `us-central1` 旧関数削除（`functions_region_migration_report.sh --apply-delete-old`）

## 2026-04-02

### 実施（外部操作・障害切り分け）

- GitHub Actions の deploy で `upsert task queue function` / `upsert schedule function` 失敗を確認。
- 切り分けのため、失敗した関数のみをローカルで再 deploy し、コード要因ではないことを確認。
- IAM を確認し、deploy 用 SA（`github-functions-deployer@...`）に `roles/cloudtasks.admin` / `roles/cloudscheduler.admin` が不足していたことを特定。
- 上記 2 ロールを deploy 用 SA へ付与。
- `roles/iam.serviceAccountUser`（`COMPUTE_SA` / `APPSPOT_SA`）付与済みも再確認。
- 再実行で `Deploy complete!` を確認。

### 実施（導入時資料・運用資料の追加更新）

- 新規 Firebase プロジェクト追加時の手順書を追加:
  - `docs/運用時資料/導入時設定/fireBase紐付け/新規Firebaseプロジェクト追加時_デプロイ手順.md`
- `fireBase紐付け` README に新規手順書を追記:
  - `docs/運用時資料/導入時設定/fireBase紐付け/README.md`
- リリースチェックリストに deploy 権限観点（Cloud Tasks / Scheduler / actAs）を追記:
  - `docs/運用時資料/導入時設定/fireBase紐付け/リリース前後チェックリスト.md`
- phaseF ステップ8判定資料を追加:
  - `docs/環境変数きれい化/per_phase/phaseF/step8_運用時資料判定.md`

## 2026-04-02

### 実施（phaseF.1 是正・完了）

- 先行実装（各ファイル `setGlobalOptions`）で deploy 警告
  - `Calling setGlobalOptions twice leads to undefined behavior`
  が大量に発生したため、実装方針を是正。
- `functions/src/index.ts` でのみ `setGlobalOptions({ region: "asia-northeast1" })` を実行する方式へ変更。
- 各関数ファイルへの `setGlobalOptions` 追加を全撤回。
- 追加で分割 deploy スクリプトを作成:
  - `scripts/firebase_deploy_functions_in_batches.sh`

### 検証

- `cd functions && npm run build`: 成功
- `cd functions && npm run lint`: 成功
- `rg -n "setGlobalOptions\\(" functions/src | wc -l`: 1
- `rg -n "us-central1" functions/src`: 0件
- `controlHookHttp(asia-northeast1)` 単体 deploy 成功（2026-04-02）

### リージョン実態確認（外部）

- `scripts/functions_region_migration_report.sh --project amuse-app-template --from us-central1 --to asia-northeast1`
  - `from(us-central1)=0`
  - `to(asia-northeast1)=169`
  - `only_in_us-central1=0`

### 復帰明記

- phaseF.1 は完了。
- phaseF 本体に戻り、`task-endpoints` 整合と実運用疎通最終確認を継続する。

## 2026-04-02

### 実施（phaseF 本流継続: 外部整合最終化）

- リージョン最終確認:
  - `gcloud functions list --v2 --regions=us-central1,asia-northeast1`
  - `asia-northeast1=169`, `us-central1=0`
- `task-endpoints` を実体URLへ更新:
  - 旧値は `us-central1` / `-uc.a.run.app` を参照していたため、最新 `-an.a.run.app` URL で Secret version `2` を追加
- `business-date-assessment-queue` を `asia-northeast1` に作成し `RUNNING` を確認
- 実行 SA（`767044015900-compute@developer.gserviceaccount.com`）へ 3 secret の `secretAccessor` を付与
  - `line-config`
  - `task-endpoints`
  - `business-secrets`
- 旧 `us-central1` queue の残タスク確認:
  - `business-date-assessment-queue` に未実行 7 件を確認
  - 同名・同時刻で `asia-northeast1` queue へ移設（URL/audience を `-an.a.run.app` に変換）
- 旧 `us-central1` queue を整理削除:
  - `business-date-assessment-queue`
  - `business-date-assessment-queue-test`
  - `finalizePayrollRun`
  - `processPayrollNotifications`
  - `processStaffPayroll`
  - `tournament-queue`
- 旧 `us-central1` scheduler jobs を整理削除（参照先関数未存在）:
  - `firebase-schedule-nightlyIntegrityCheck-us-central1`
  - `firebase-schedule-nightlyReconciliationCheck-us-central1`
  - `firebase-schedule-nightlyRecalculateBalanceDue-us-central1`

### 確認結果

- `scripts/functions_region_migration_report.sh --project amuse-app-template --from us-central1 --to asia-northeast1`
  - `from(us-central1)=0`
  - `to(asia-northeast1)=169`
  - `only_in_us-central1=0`
- `gcloud tasks queues list --location=us-central1`: 空
- `gcloud scheduler jobs list --location=us-central1`: 空

## 2026-04-02

### 実施（step8適切性確認）

- `step8_運用時資料判定.md` の判定根拠と成果物を再確認し、標準ステップ8の要件を満たしていることを確認。
- step8 判定書に「反映確認結果」節を追記し、更新済み運用資料の反映内容を明文化。

### 実施（step9: 完了サマリと引き継ぎ）

- phaseF の完了サマリと phaseG への引き継ぎファイルを作成:
  - `phaseF_完了サマリとphaseG引き継ぎ.md`
- `phaseF/README.md` の完了物一覧へ同ファイルを追記。
