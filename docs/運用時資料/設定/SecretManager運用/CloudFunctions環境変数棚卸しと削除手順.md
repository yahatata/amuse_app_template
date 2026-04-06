# Cloud Functions 環境変数棚卸しと削除手順

## 1. 対象

- Cloud Functions v2（Cloud Run service）に残っている旧環境変数の棚卸しと削除。
- 目的は、コードで参照されないキーのみを安全に削除すること。
- 本手順は本線関数を対象にする。`probe*` 関数は保留対象として扱う。

## 2. 前提

- リポジトリ直下で実行する。
- `gcloud`, `jq`, `rg` が利用可能であること。
- 対象プロジェクトへの更新権限があること。

## 3. 使用スクリプト

- `scripts/functions_env_inventory_and_cleanup.sh`

このスクリプトは次を自動実施する。

- デプロイ済み関数の `environmentVariables` 棚卸し
- ソースコード上の env 参照キー抽出
- 差分（削除候補）の作成
- system/runtime 管理キーの除外
- `--apply` 指定時の一括削除

system/runtime 管理キーとして除外するもの:

- `EVENTARC_CLOUD_EVENT_SOURCE`
- `FIREBASE_CONFIG`
- `FUNCTION_SIGNATURE_TYPE`
- `FUNCTION_TARGET`
- `GCLOUD_PROJECT`
- `LOG_EXECUTION_ID`
- `NODE_ENV`

## 4. dry-run（必須）

```bash
cd /Users/yahatayuusei/Documents/GitHub/amuse_app_template

scripts/functions_env_inventory_and_cleanup.sh \
  --project amuse-app-template \
  --regions asia-northeast1 \
  --work-dir /tmp/functions-env-cleanup-check
```

確認ポイント:

- `remove_candidates.filtered.keys` が削除対象キー一覧。
- `remove_candidates.filtered.by_function.tsv` が関数単位の削除候補。
- この段階では変更は発生しない。
- `probe` で始まる関数が削除候補に含まれていないことを確認する。

## 5. 本適用

```bash
cd /Users/yahatayuusei/Documents/GitHub/amuse_app_template

scripts/functions_env_inventory_and_cleanup.sh \
  --project amuse-app-template \
  --regions asia-northeast1 \
  --work-dir /tmp/functions-env-cleanup-apply \
  --apply
```

実行後、`Apply completed: total=... ok=... failed=...` を確認する。

## 6. 最終検証

```bash
cd /Users/yahatayuusei/Documents/GitHub/amuse_app_template

scripts/functions_env_inventory_and_cleanup.sh \
  --project amuse-app-template \
  --regions asia-northeast1 \
  --work-dir /tmp/functions-env-cleanup-final-verify
```

完了判定:

- `filtered_candidate_keys=0`
- `filtered_candidate_rows=0`
- `remove_candidates.filtered.by_function.tsv` に `probe*` が含まれていない

補足:

- `raw_candidate_keys` に system/runtime 管理キーが残るのは正常。

## 7. 障害時の対応

1. `--apply` 実行時に失敗が出た場合は、`apply_failed.tsv` を確認する。
2. 失敗関数だけを再実行する。
3. 再実行後に最終検証を実施し、`filtered_candidate_rows=0` を確認する。

## 8. ロールバック

- 削除したキーが必要だった場合は、対象 service に env を再設定する。
- 変更前の値が必要なため、適用前にキー/値のバックアップを残してから実施する。

## 9. 補足（`us-central1` を含める場合）

- 旧リージョン資産の棚卸しが目的で `--regions us-central1,asia-northeast1` を使う場合でも、
  そのまま `--apply` は実行しない。
- まず dry-run 結果を確認し、`probe*` を除外する運用判断を行ってから適用する。
