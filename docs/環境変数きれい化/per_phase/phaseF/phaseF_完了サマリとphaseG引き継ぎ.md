# phaseF 完了サマリと phaseG 引き継ぎ

作成日: 2026-04-02

## 1. phaseF 完了サマリ

### 1.1 実装・外部整備結果

- GitHub Actions の Functions deploy workflow を導入した。
  - `.github/workflows/deploy-functions.yml`
  - `workflow_dispatch` + `project_id(choice)` + WIF 認証で実行可能な形に統一。
- Functions のリージョン運用を `asia-northeast1` に統一した。
  - `functions/src/index.ts` で `setGlobalOptions({ region: "asia-northeast1" })` を単一点設定。
  - 旧方式（関数ファイルごとの `setGlobalOptions`）は撤回済み。
- `task-endpoints` を新リージョン実体 URL へ更新した。
  - `controlHookUrl`
  - `closeAssessmentUrl`
  - `openAssessmentUrl`
- Cloud Tasks / Cloud Scheduler の旧リージョン残件を整理した。
  - `us-central1` queue を削除。
  - `us-central1` scheduler jobs を削除。
  - 旧 `business-date-assessment-queue` に残っていた未実行タスクは `asia-northeast1` 側へ移設。
- 再発防止のため、移行補助スクリプトを整備した。
  - `scripts/functions_region_migration_report.sh`
  - `scripts/firebase_deploy_functions_in_batches.sh`

### 1.2 検証結果

- ローカル検証:
  - `cd functions && npm run build` 成功
  - `cd functions && npm run lint` 成功
  - `rg -n "setGlobalOptions\\(" functions/src` は `index.ts` の1件のみ
  - `rg -n "us-central1" functions/src` は 0 件
- 外部状態検証:
  - Functions: `asia-northeast1=169`, `us-central1=0`
  - Cloud Tasks queue: `asia-northeast1` 側のみ `RUNNING`、`us-central1` は空
  - Cloud Scheduler jobs: `asia-northeast1` 側有効、`us-central1` は空
  - `task-endpoints` の3URLが `-an.a.run.app` を参照

### 1.3 ステップ8結果

- `step8_運用時資料判定.md` のとおり、運用時資料更新を実施済み。
  - 更新: `docs/運用時資料/導入時設定/fireBase紐付け/README.md`
  - 更新: `docs/運用時資料/導入時設定/fireBase紐付け/リリース前後チェックリスト.md`
  - 追加: `docs/運用時資料/導入時設定/fireBase紐付け/新規Firebaseプロジェクト追加時_デプロイ手順.md`

## 2. phaseG への引き継ぎ事項

### 2.1 現時点で整っている前提

- Functions / Queue / Scheduler のリージョンは `asia-northeast1` 側へ統一済み。
- `task-endpoints` は新リージョン実体 URL へ更新済み。
- deploy 経路は GitHub Actions + WIF を前提に運用可能。

### 2.2 phaseG で必ず確認すること

- 全仕様書との最終突合（未反映事項の有無）。
- 最終スモーク（scheduler / openclose / tournament / webhook）を業務導線で再確認。
- 運用資料と実際の外部状態（IAM, Secrets, Queue, Scheduler）の乖離がないかを最終確認。

### 2.3 残課題・留意点

- コード/設定の整備は完了しているが、実業務タイミングでの最終スモーク（特に open/close タスク実行）は phaseG で明示的に実施する。

## 3. phaseF スコープ内の未解決事項

- なし（phaseF スコープ内）。
