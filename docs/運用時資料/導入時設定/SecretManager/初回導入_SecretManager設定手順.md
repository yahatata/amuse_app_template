# 初回導入_SecretManager設定手順

## 1. 目的

初回導入時に、Functions が Secret Manager から必要値を読める状態を作る。  
本資料は `line-config` / `task-endpoints` / `business-secrets` の初期投入を対象とする。

## 2. 事前確認

- 対象プロジェクトの `projectId` を確定していること
- `gcloud auth login` 済みであること
- 対象プロジェクトに対する操作権限があること

## 3. Secret 作成（初回のみ）

```bash
PROJECT_ID="<対象projectId>"
gcloud config set project "$PROJECT_ID"

printf '%s' '<line-configのJSON>' \
  | gcloud secrets create line-config --data-file=- 2>/dev/null \
  || printf '%s' '<line-configのJSON>' | gcloud secrets versions add line-config --data-file=-

printf '%s' '<task-endpointsのJSON>' \
  | gcloud secrets create task-endpoints --data-file=- 2>/dev/null \
  || printf '%s' '<task-endpointsのJSON>' | gcloud secrets versions add task-endpoints --data-file=-

printf '%s' '<business-secretsのJSON>' \
  | gcloud secrets create business-secrets --data-file=- 2>/dev/null \
  || printf '%s' '<business-secretsのJSON>' | gcloud secrets versions add business-secrets --data-file=-
```

期待結果:

- 3 secret が存在し、`versions/latest` が参照可能になる。

## 4. Functions 実行 SA への権限付与

```bash
PROJECT_ID="<対象projectId>"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor"
```

期待結果:

- IAM policy に `roles/secretmanager.secretAccessor` が追加される。

## 5. デプロイ後の最低限確認

1. `firebase deploy --only functions --project <対象projectId>` を実施する。
2. Secret 参照対象の代表関数を実行する（LINE/Task URL/QR 系）。
3. Cloud Logging で Secret 取得エラーが出ていないことを確認する。

## 6. 注意事項

- Secret 値そのものはログやドキュメントに残さない。
- 値変更は `versions add` で行い、`latest` 参照を維持する。
- Cloud Console に旧環境変数が残っていても、即削除せず実コード参照と突合してから削除する。
