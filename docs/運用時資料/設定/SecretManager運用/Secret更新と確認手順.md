# Secret更新と確認手順

## 1. 対象

phaseD で移行した以下 3 secret を対象とする。

- `line-config`
- `task-endpoints`
- `business-secrets`

## 2. 更新手順（通常運用）

```bash
PROJECT_ID="<対象projectId>"
gcloud config set project "$PROJECT_ID"

printf '%s' '<更新後JSON>' | gcloud secrets versions add <secret名> --data-file=-
```

期待結果:

- 新しい version が追加され、`versions/latest` が新 version を指す。

## 3. 更新後確認

### 3.1 Secret 側の確認

```bash
gcloud secrets versions list <secret名> --project "$PROJECT_ID"
```

確認ポイント:

- 新規 version が `ENABLED` で存在すること。

### 3.2 Functions 側の確認

- 更新対象を使う関数を実行する。
- Cloud Logging で `Secret ... required key` や JSON parse 失敗がないことを確認する。

## 4. 障害時の切り分け

1. まず Secret 側の JSON 構造（required key 欠落がないか）を確認する。
2. IAM で実行 SA に `roles/secretmanager.secretAccessor` が残っているか確認する。
3. 対象関数のログで Secret 名とエラー種別を確認する。
4. 必要なら直前の安定 version へ値を戻し、新 version を再作成する。

## 5. 運用ルール

- Secret 値は平文で共有しない。
- 1回の変更で複数 secret を同時更新する場合は、更新順と確認順を事前に決める。
- `line-config` / `task-endpoints` / `business-secrets` 以外の追加は、仕様書更新後に実施する。

## 6. 旧環境変数の扱い

- Cloud Console 上に残る旧環境変数は、コード参照と突合後に削除する。
- 削除対象の確定と一括削除は `CloudFunctions環境変数棚卸しと削除手順.md` を使う。
- 本線運用では `probe*` 関数を除外して判断する。
