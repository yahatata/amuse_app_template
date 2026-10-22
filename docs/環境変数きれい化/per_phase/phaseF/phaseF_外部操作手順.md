# phaseF 外部操作手順（GitHub/WIF・リージョン・Secret）

作成日: 2026-04-01

## 1. 目的

phaseF のコード反映後に必要な外部操作を、実行場所つきで順番にまとめる。  
対象は以下。

- GitHub Actions + WIF の有効化
- `asia-northeast1` へのリージョン整合
- Secret Manager `task-endpoints` の更新

## 1.1 用語ルール（この資料で固定）

- `GitHubリポジトリ名`:
  - 例: `yahatata/amuse_app_template`
- `Firebase Project ID（= GCP Project ID）`:
  - 例: `amuse-app-template`
- `project_id`:
  - GitHub Actions の workflow 入力名。入力する値は `Firebase Project ID（= GCP Project ID）`。

本資料では、曖昧な「プロジェクトID」という単独表現は使わず、必ず上記のどちらかで記載する。

## 2. 操作場所の定義

- ローカル端末:
  - あなたの Mac のターミナル（`zsh`）
- GitHub UI:
  - 対象リポジトリの `Settings` / `Actions` 画面
- GCP Console:
  - 対象 `Firebase Project ID（= GCP Project ID）` の IAM / Secret Manager / Cloud Tasks 画面

## 3. 事前準備（ローカル端末）

以下をそのまま実行する。

```bash
cd /Users/yahatayuusei/Documents/GitHub/amuse_app_template

export FIREBASE_PROJECT_ID="amuse-app-template"
export PROJECT_ID="$FIREBASE_PROJECT_ID"
export REGION_NEW="asia-northeast1"
```

`PROJECT_ID` は `gcloud` コマンド例の互換のために残しているが、意味は常に `Firebase Project ID（= GCP Project ID）`。

確認:

```bash
echo "$FIREBASE_PROJECT_ID"
echo "$REGION_NEW"
```

## 4. GitHub Actions + WIF 有効化

### 4.1 `WIF_SERVICE_ACCOUNT` 候補確認（ローカル端末）

目的:

- 既存のサービスアカウント一覧から、デプロイ専用SAが既にあるかを確認する。

実行:

```bash
gcloud iam service-accounts list \
  --project "$PROJECT_ID" \
  --format="table(email,displayName)"
```

判断:

- `github-functions-deployer@${PROJECT_ID}.iam.gserviceaccount.com` がある:
  - それを `WIF_SERVICE_ACCOUNT` に使う。
- ない:
  - 次の 4.2 で作成する。

### 4.2 `github-functions-deployer` 作成（4.1で未存在だった場合）

目的:

- デプロイ専用のサービスアカウントを用意し、既定SAとの責務分離を行う。

実行:

```bash
gcloud iam service-accounts create github-functions-deployer \
  --display-name="GitHub Functions Deployer" \
  --project "$PROJECT_ID"
```

### 4.3 作成/存在確認と `WIF_SERVICE_ACCOUNT` 値の確定（ローカル端末）

目的:

- GitHub Secret `WIF_SERVICE_ACCOUNT` に入れる値を確定する。

実行:

```bash
export DEPLOY_SA_EMAIL="github-functions-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts describe "$DEPLOY_SA_EMAIL" \
  --project "$PROJECT_ID" \
  --format="value(email)"
```

期待:

- `github-functions-deployer@amuse-app-template.iam.gserviceaccount.com` が表示される。

この文字列を、そのまま GitHub Secret `WIF_SERVICE_ACCOUNT` に設定する。

### 4.4 `WIF_PROVIDER` の確認（ローカル端末）

目的:

- GitHub Actions からGCPへログインするための「認証窓口（Provider）」のフル名を取得する。

#### 4.4.1 まず「既存Poolがあるか」を確認する

実行:

```bash
gcloud iam workload-identity-pools list \
  --location=global \
  --project "$PROJECT_ID" \
  --format="table(name,displayName)"
```

判定:

- 1件以上表示される:
  - 4.4.2 に進む（既存Poolを使ってProviderを確認）。
- `Listed 0 items.`:
  - WIF未作成。4.4.A を実行して作成してから 4.4.3 へ進む。

#### 4.4.A Pool/Provider が未作成だった場合の作成手順

実行（変数準備）:

```bash
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export POOL_ID="github-actions-pool"
export PROVIDER_ID="github-actions-provider"
export DEPLOY_SA_EMAIL="github-functions-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
export REPO="$(git config --get remote.origin.url | sed -E 's#(git@github.com:|https://github.com/)##; s#\\.git$##')"
```

実行（Pool作成）:

```bash
gcloud iam workload-identity-pools create "$POOL_ID" \
  --project="$PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions Pool"
```

実行（Provider作成）:

```bash
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_ID" \
  --display-name="GitHub Actions Provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository=='$REPO'"
```

実行（GitHub -> SA 借用権限付与）:

```bash
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${REPO}"
```

補足:

- `REPO` は `owner/repo` 形式（例: `yahatayuusei/amuse_app_template`）。
- この手順完了後、4.4.3 で `WIF_PROVIDER` 実値を取得する。

#### 4.4.2 既存Poolを使う場合のProvider一覧確認

実行（Provider一覧）:

```bash
gcloud iam workload-identity-pools providers list \
  --location=global \
  --workload-identity-pool "<POOL_ID>" \
  --project "$PROJECT_ID" \
  --format="table(name,displayName)"
```

判定:

- 目的の Provider（例: `github-actions-provider`）がある:
  - 4.4.3 へ進む。
- ない:
  - 4.4.A の「Provider作成」だけ実行し、4.4.3 へ進む。

#### 4.4.3 `WIF_PROVIDER` 実値の取得（最終）

実行（`WIF_PROVIDER` の実値取得）:

```bash
gcloud iam workload-identity-pools providers describe "<PROVIDER_ID>" \
  --location=global \
  --workload-identity-pool "<POOL_ID>" \
  --project "$PROJECT_ID" \
  --format="value(name)"
```

期待:

- `projects/767044015900/locations/global/workloadIdentityPools/<POOL_ID>/providers/<PROVIDER_ID>` 形式の値が出る。
- 例（今回）:
  - `projects/767044015900/locations/global/workloadIdentityPools/github-actions-pool/providers/github-actions-provider`

この文字列を、そのまま GitHub Secret `WIF_PROVIDER` に設定する。

### 4.5 GitHub Secrets 登録（GitHub UI）

操作場所:

- GitHub UI -> 対象リポジトリ -> `Settings` -> `Secrets and variables` -> `Actions`

操作:

1. `New repository secret` を押す
2. 次の2件を登録する
- `WIF_SERVICE_ACCOUNT`
  - 値: 4.3 で確認した `github-functions-deployer@...`
- `WIF_PROVIDER`
  - 値: 4.4 で取得した `projects/.../providers/...`

補足:

- `WIF_PROVIDER` は `projects/.../locations/global/workloadIdentityPools/.../providers/...` 形式
- `WIF_SERVICE_ACCOUNT` は `xxx@${PROJECT_ID}.iam.gserviceaccount.com` 形式

### 4.6 WIF 側の権限確認（ローカル端末）

`<...>` をあなたの環境値に置き換えて実行する。

```bash
gcloud iam workload-identity-pools providers describe "<PROVIDER_NAME>" \
  --workload-identity-pool "<POOL_NAME>" \
  --location="global" \
  --project "$PROJECT_ID"
```

```bash
gcloud iam service-accounts get-iam-policy "$DEPLOY_SA_EMAIL" \
  --project "$PROJECT_ID"
```

確認ポイント:

- GitHub リポジトリ principal に `roles/iam.workloadIdentityUser` が付与されている

## 5. Functions デプロイ実行

### 5.1 実行方法A（GitHub Actions推奨）

操作場所:

- GitHub UI -> `Actions` -> `Deploy Firebase Functions`

操作:

1. `Run workflow` を押す
2. `project_id`（= `Firebase Project ID（= GCP Project ID）`）に `amuse-app-template` を選択
3. 実行して成功を確認

### 5.2 実行方法B（ローカル端末）

```bash
cd /Users/yahatayuusei/Documents/GitHub/amuse_app_template
FIREBASE_SKIP_UPDATE_CHECK=true firebase deploy --only functions --project "$PROJECT_ID"
```

## 6. リージョン整合確認（ローカル端末）

### 6.1 新リージョンの関数確認

```bash
gcloud functions list --v2 --regions="$REGION_NEW" --project "$PROJECT_ID" \
  --format="table(name.basename(),state)"
```

### 6.2 旧/新リージョンの全体確認

```bash
gcloud functions list --v2 --regions="us-central1,$REGION_NEW" --project "$PROJECT_ID" \
  --format="table(name.basename(),region,state)"
```

確認ポイント:

- `asia-northeast1` 側の対象関数が `ACTIVE`
- 意図せず `us-central1` 側のみで生きている関数がない

### 6.3 旧リージョン削除の dry-run / バッチ実行

phaseF.1 で追加した比較スクリプトを使う。

dry-run:

```bash
scripts/functions_region_migration_report.sh \
  --project "$PROJECT_ID" \
  --from us-central1 \
  --to "$REGION_NEW"
```

確認:

- `only_in_us-central1.txt`:
  - まだ新リージョンへ未展開の関数
- `in_both.txt`:
  - 旧リージョン削除候補（新リージョンにも同名関数あり）
- `only_in_us-central1.txt` が 0 行の場合:
  - 旧リージョン残件はないため、削除操作は不要

旧リージョン削除（疎通確認後のみ）:

```bash
scripts/functions_region_migration_report.sh \
  --project "$PROJECT_ID" \
  --from us-central1 \
  --to "$REGION_NEW" \
  --apply-delete-old
```

### 6.4 429 回避の分割 deploy（必要時）

Functions 全量 deploy で mutation quota 429 が出る場合は、分割実行を使う。

1. まず dry-run で未展開一覧を取得する。  
2. `only_in_us-central1.txt` を入力に分割 deploy する。  

```bash
scripts/firebase_deploy_functions_in_batches.sh \
  --project "$PROJECT_ID" \
  --functions-file "/tmp/functions-region-migration-<timestamp>/only_in_us-central1.txt" \
  --batch-size 15 \
  --pause-seconds 120
```

補足:

- 実際に使う `only_in_us-central1.txt` は、6.3 の dry-run 出力 `work_dir` 配下のファイルを指定する。
- 2026-04-02 時点の `amuse-app-template` は `us-central1=0` のため、この分割 deploy は再発時の運用手段として保持する。

## 7. Cloud Tasks Queue 整合（ローカル端末）

### 7.1 open/close 用 queue の存在確認と必要時作成

```bash
gcloud tasks queues describe business-date-assessment-queue \
  --location="$REGION_NEW" \
  --project "$PROJECT_ID" >/dev/null 2>&1 || \
gcloud tasks queues create business-date-assessment-queue \
  --location="$REGION_NEW" \
  --project "$PROJECT_ID"
```

### 7.2 リージョン内 queue 一覧確認

```bash
gcloud tasks queues list --location="$REGION_NEW" --project "$PROJECT_ID"
```

### 7.3 旧リージョン queue に残タスクがある場合の移設

`business-date-assessment-queue` に未実行タスクが残っている場合は、削除前に移設する。

旧リージョン残タスク確認:

```bash
gcloud tasks list \
  --queue="business-date-assessment-queue" \
  --location="us-central1" \
  --project "$PROJECT_ID" \
  --format="table(name.basename(),scheduleTime,httpRequest.url)"
```

移設（URL の `-uc.a.run.app` を `-an.a.run.app` へ変換して新 queue に再作成）:

```bash
TMP_JSON="/tmp/us_business_queue_tasks.json"
gcloud tasks list \
  --queue="business-date-assessment-queue" \
  --location="us-central1" \
  --project "$PROJECT_ID" \
  --format=json > "$TMP_JSON"

jq -c '.[] | {id:(.name|split("/")|last), scheduleTime, url:.httpRequest.url, audience:.httpRequest.oidcToken.audience, sa:.httpRequest.oidcToken.serviceAccountEmail}' "$TMP_JSON" | \
while IFS= read -r row; do
  id="$(echo "$row" | jq -r '.id')"
  schedule="$(echo "$row" | jq -r '.scheduleTime')"
  sa="$(echo "$row" | jq -r '.sa')"
  old_url="$(echo "$row" | jq -r '.url')"
  old_aud="$(echo "$row" | jq -r '.audience')"
  new_url="$(echo "$old_url" | sed 's/-uc\\.a\\.run\\.app/-an.a.run.app/g')"
  new_aud="$(echo "$old_aud" | sed 's/-uc\\.a\\.run\\.app/-an.a.run.app/g')"

  gcloud tasks create-http-task "$id" \
    --project "$PROJECT_ID" \
    --location "$REGION_NEW" \
    --queue "business-date-assessment-queue" \
    --url "$new_url" \
    --method POST \
    --schedule-time "$schedule" \
    --oidc-service-account-email "$sa" \
    --oidc-token-audience "$new_aud"
done
```

### 7.4 旧リージョン queue の削除

移設後かつ空を確認後に削除する（phaseF の整理対象）。

```bash
for q in business-date-assessment-queue business-date-assessment-queue-test finalizePayrollRun processPayrollNotifications processStaffPayroll tournament-queue; do
  gcloud tasks queues delete "$q" \
    --location="us-central1" \
    --project "$PROJECT_ID" \
    --quiet
done
```

## 8. `task-endpoints` 更新（ローカル端末）

### 8.1 新URL取得

```bash
CONTROL_HOOK_URL="$(gcloud functions describe controlHookHttp \
  --v2 --region="$REGION_NEW" --project "$PROJECT_ID" \
  --format='value(serviceConfig.uri)')"

CLOSE_ASSESSMENT_URL="$(gcloud functions describe closeAssessmentTask \
  --v2 --region="$REGION_NEW" --project "$PROJECT_ID" \
  --format='value(serviceConfig.uri)')"

OPEN_ASSESSMENT_URL="$(gcloud functions describe openAssessmentTask \
  --v2 --region="$REGION_NEW" --project "$PROJECT_ID" \
  --format='value(serviceConfig.uri)')"
```

確認:

```bash
echo "$CONTROL_HOOK_URL"
echo "$CLOSE_ASSESSMENT_URL"
echo "$OPEN_ASSESSMENT_URL"
```

### 8.2 Secret version 追加

```bash
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

### 8.3 反映確認

```bash
gcloud secrets versions access latest \
  --secret="task-endpoints" \
  --project "$PROJECT_ID"
```

## 9. Functions 実行 SA の Secret 参照権限確認

### 9.1 実行 SA 取得（ローカル端末）

```bash
RUN_SA="$(gcloud functions describe controlHookHttp \
  --v2 --region="$REGION_NEW" --project "$PROJECT_ID" \
  --format='value(serviceConfig.serviceAccountEmail)')"
echo "$RUN_SA"
```

### 9.2 secretAccessor 付与（不足時）

```bash
for s in line-config task-endpoints business-secrets; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:${RUN_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project "$PROJECT_ID"
done
```

## 10. 完了判定チェック

操作場所:

- ローカル端末で実行し、必要に応じて GCP Console でも目視確認する

チェック:

1. `Deploy Firebase Functions` workflow が成功している
2. `gcloud functions list --v2 --regions="us-central1,asia-northeast1"` で新リージョン側が `ACTIVE`
3. `task-endpoints` の3URLが新リージョン実体を指している
4. `business-date-assessment-queue` が `asia-northeast1` に存在する
5. `us-central1` の queue / scheduler job が不要分として整理済み
6. 実運用経路（scheduler / openclose / tournament）の task 起動が成功する
