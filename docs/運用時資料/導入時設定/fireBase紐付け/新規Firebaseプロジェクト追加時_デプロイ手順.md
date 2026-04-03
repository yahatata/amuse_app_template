# 新規 Firebase プロジェクト追加時_デプロイ手順

## 1. 目的

新しい店舗向けに Firebase Project ID を追加するとき、GitHub Actions から Functions を安全にデプロイできる状態を再現可能に作るための手順。

用語ルール:

- `GitHubリポジトリ名`: 例 `yahatayuusei/amuse_app_template`
- `Firebase Project ID（= GCP Project ID）`: 例 `amuse-app-template`
- `project_id`: GitHub Actions workflow の入力名（値は Firebase Project ID）

## 2. 事前準備

```bash
export PROJECT_ID="<NEW_FIREBASE_PROJECT_ID>"
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export REPO="<OWNER/REPO>"
export DEPLOY_SA_EMAIL="github-functions-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
export COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
export APPSPOT_SA="${PROJECT_ID}@appspot.gserviceaccount.com"
```

## 3. GCP 側セットアップ

### 3.1 必要 API を有効化

```bash
gcloud services enable \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  eventarc.googleapis.com \
  pubsub.googleapis.com \
  storage.googleapis.com \
  cloudtasks.googleapis.com \
  cloudscheduler.googleapis.com \
  firebaseextensions.googleapis.com \
  --project "$PROJECT_ID"
```

補足:

- `compute.googleapis.com` は必須ではないが、未有効時は deploy 時に警告が出るため有効化推奨。

### 3.2 デプロイ用 SA 作成（未作成時）

```bash
gcloud iam service-accounts create github-functions-deployer \
  --project "$PROJECT_ID" \
  --display-name "GitHub Functions Deployer"
```

### 3.3 デプロイ用 SA へプロジェクトロール付与

```bash
for role in \
  roles/cloudfunctions.admin \
  roles/cloudtasks.admin \
  roles/cloudscheduler.admin \
  roles/serviceusage.serviceUsageConsumer \
  roles/viewer
do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
    --role="$role"
done
```

### 3.4 `iam.serviceAccountUser`（actAs）付与

```bash
gcloud iam service-accounts add-iam-policy-binding "$COMPUTE_SA" \
  --project "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser"

gcloud iam service-accounts add-iam-policy-binding "$APPSPOT_SA" \
  --project "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser"
```

### 3.5 WIF 設定（Pool / Provider / impersonation）

```bash
export POOL_ID="github-actions-pool"
export PROVIDER_ID="github-actions-provider"

gcloud iam workload-identity-pools create "$POOL_ID" \
  --project="$PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions Pool"

gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_ID" \
  --display-name="GitHub Actions Provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository=='$REPO'"

gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${REPO}"
```

`WIF_PROVIDER` 実値取得:

```bash
gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --location=global \
  --workload-identity-pool="$POOL_ID" \
  --project "$PROJECT_ID" \
  --format='value(name)'
```

## 4. GitHub 側セットアップ

### 4.1 workflow の `project_id` 選択肢を更新

- `.github/workflows/deploy-functions.yml` の `workflow_dispatch.inputs.project_id.options` に新しい Firebase Project ID を追加する。

### 4.2 GitHub Secrets を設定

- `WIF_SERVICE_ACCOUNT`: `github-functions-deployer@<PROJECT_ID>.iam.gserviceaccount.com`
- `WIF_PROVIDER`: `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/<POOL_ID>/providers/<PROVIDER_ID>`

注意:

- 現行 workflow は 1 組の `WIF_PROVIDER` / `WIF_SERVICE_ACCOUNT` を前提にしている。複数 Firebase プロジェクトを恒常運用する場合は、GitHub Environment ごとに同名 Secret を分離する。

## 5. Secret / Queue / リージョン整合

### 5.1 Functions 実行 SA に Secret 参照権限付与

```bash
for s in line-config task-endpoints business-secrets; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project "$PROJECT_ID"
done
```

### 5.2 `asia-northeast1` 側 queue 確認

```bash
gcloud tasks queues list --location="asia-northeast1" --project "$PROJECT_ID"
```

### 5.3 `task-endpoints` 更新

```bash
CONTROL_HOOK_URL="$(gcloud functions describe controlHookHttp \
  --v2 --region="asia-northeast1" --project "$PROJECT_ID" \
  --format='value(serviceConfig.uri)')"

CLOSE_ASSESSMENT_URL="$(gcloud functions describe closeAssessmentTask \
  --v2 --region="asia-northeast1" --project "$PROJECT_ID" \
  --format='value(serviceConfig.uri)')"

OPEN_ASSESSMENT_URL="$(gcloud functions describe openAssessmentTask \
  --v2 --region="asia-northeast1" --project "$PROJECT_ID" \
  --format='value(serviceConfig.uri)')"

TASK_ENDPOINTS_JSON="$(cat <<EOF
{
  "controlHookUrl": "${CONTROL_HOOK_URL}",
  "closeAssessmentUrl": "${CLOSE_ASSESSMENT_URL}",
  "openAssessmentUrl": "${OPEN_ASSESSMENT_URL}"
}
EOF
)"

printf '%s' "$TASK_ENDPOINTS_JSON" | \
  gcloud secrets versions add task-endpoints \
  --data-file=- \
  --project "$PROJECT_ID"
```

## 6. デプロイ実行

GitHub Actions:

1. `Deploy Firebase Functions` を開く
2. `project_id` に対象 Firebase Project ID を選択
3. 実行し、`Deploy complete!` を確認

## 7. 完了判定

```bash
gcloud functions list --v2 --regions="us-central1,asia-northeast1" --project "$PROJECT_ID" \
  --format="table(name.basename(),region,state)"
```

判定:

- `asia-northeast1` 側の対象関数が `ACTIVE`
- `task-endpoints` の3URLが新リージョン実体を参照
- 想定外の `us-central1` 依存が残っていない

## 8. 代表的な失敗と対処観点

- `Caller is missing permission 'iam.serviceaccounts.actAs'`
  - `roles/iam.serviceAccountUser` を deploy SA に付与（`COMPUTE_SA` / `APPSPOT_SA`）
- `Failed to upsert task queue function ...`
  - deploy SA に `roles/cloudtasks.admin` を付与
- `Failed to upsert schedule function ...`
  - deploy SA に `roles/cloudscheduler.admin` を付与
