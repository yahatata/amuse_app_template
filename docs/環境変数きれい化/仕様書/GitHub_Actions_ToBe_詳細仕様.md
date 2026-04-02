# GitHub Actions To-Be 詳細仕様書

作成日: 2026-03-31  
元仕様: `docs/環境変数きれい化/仕様書/tobe仕様書_全体像.md`  
関連仕様:

- `docs/環境変数きれい化/仕様書/コード固定_ToBe_詳細仕様.md`
- `docs/環境変数きれい化/仕様書/Secret_Manager_ToBe_詳細仕様.md`
- `docs/環境変数きれい化/仕様書/実行環境注入のまま使うもの_ToBe_詳細仕様.md`
- `docs/運用時資料/導入時設定/fireBase紐付け/3レイヤー整合_設計方針.md`
- `docs/運用時資料/導入時設定/fireBase紐付け/リリース前後チェックリスト.md`

## 1. スコープ

本仕様書は、Functions デプロイを GitHub Actions から安全に実行するための設計と運用を確定する。  
対象は以下とする。

- GitHub Actions ワークフロー設計
- 認証方式
- デプロイ用 SA の権限
- Functions 実行 SA と Secret Manager の関係
- 誤プロジェクトデプロイ防止
- 開発時 / 導入時 / 運用時の操作手順
- GitHub / GCP / Firebase Console 上で人手作業が必要な項目

以下は本仕様の対象外とする。

- アプリ本体コードの業務ロジック
- Hosting デプロイ
- App Distribution / Store 配布
- 実装完了後に別途整備する完成版 Runbook

## 2. 基本方針

1. Functions デプロイは GitHub Actions から実行する。
2. デプロイ対象は現時点では `functions` のみとする。
3. 手動トリガー `workflow_dispatch` を採用する。
4. デプロイ先 Firebase Project ID はワークフロー入力 `project_id` の `choice` で選択する。
5. 認証方式は Workload Identity Federation（WIF）で固定する。
6. GitHub Actions 自体には Secret Manager アクセス権を持たせない。
7. Secret Manager は Functions 実行 SA が実行時に読む。
8. 仕様書には、コード変更だけでなく GitHub / GCP / Firebase Console で必要な人手作業も明記する。

## 3. To-Be 全体像

### 3.1 目指す状態

- GitHub Actions から `functions` のみを対象にデプロイできる
- 実行時にデプロイ先 `project_id` を明示的に選択できる
- 誤った Firebase プロジェクトへのデプロイを UI と権限で防げる
- デプロイ時に Secret の値を GitHub Actions 側へ展開しない
- 複数 Firebase プロジェクト運用でも同一リポジトリから安全にデプロイできる

### 3.2 責務分担

| レイヤー | 責務 |
|---|---|
| GitHub Actions | ソース取得、依存解決、Google Cloud 認証、`firebase deploy --only functions` 実行 |
| デプロイ用 SA | デプロイに必要な Google Cloud / Firebase 権限の提供 |
| Functions 実行 SA | 実行時の Secret Manager 参照権限の保持 |
| 開発者 | workflow 作成、選択肢更新、GitHub Secrets 登録、WIF 初期設定、手動実行判断 |

## 4. ワークフロー設計

### 4.1 トリガー

```yaml
on:
  workflow_dispatch:
```

方針:

- 自動デプロイではなく手動実行とする
- 将来的に branch protection や environment protection を併用してよい
- 本仕様書時点では push トリガーや自動本番反映は採用しない

### 4.2 入力値

```yaml
inputs:
  project_id:
    description: 'デプロイ先 Firebase Project ID'
    required: true
    type: choice
    options:
      - amuse-app-template
```

方針:

- `project_id` は `choice` 固定とする
- 存在しないプロジェクト ID を手入力できないようにする
- Firebase プロジェクト追加時は workflow の `options` を更新する

運用上の注意:

- プロジェクト追加時に `options` 更新を忘れると GitHub Actions から選択できない
- `docs/運用時資料/導入時設定/fireBase紐付け` と workflow の選択肢は同期する

### 4.3 実行対象

```yaml
run: npx firebase-tools deploy --only functions --project=${{ github.event.inputs.project_id }} --non-interactive
```

方針:

- 今回の CI/CD 対象は `functions` のみ
- Hosting 等は本仕様書に含めない

## 5. 認証方式

### 5.1 採用方式

本仕様書では Workload Identity Federation（WIF）を正式採用とする。

理由:

- 長期有効な SA キー JSON を GitHub Secrets に置かなくてよい
- 漏えいリスクが低い
- 複数プロジェクト運用時にも拡張しやすい

### 5.2 GitHub Actions 側の前提

```yaml
permissions:
  contents: read
  id-token: write
```

```yaml
- name: Authenticate to Google Cloud
  uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
    service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}
```

### 5.3 GitHub 上で人手作業が必要な項目

以下は GitHub 上で開発者が設定する。

1. GitHub Actions ワークフローファイルを作成 / 更新する
2. GitHub Secrets に以下を登録する
   - `WIF_PROVIDER`
   - `WIF_SERVICE_ACCOUNT`
3. 必要に応じて GitHub Environments を作成する
4. 必要に応じて Required reviewers を設定する

### 5.4 GCP 上で人手作業が必要な項目

以下は GCP 側で開発者が設定する。

1. Workload Identity Pool を作成する
2. GitHub 用の Provider を作成する
3. デプロイ用 SA を作成する
4. GitHub リポジトリに対して impersonation 可能な権限を付与する
5. デプロイ用 SA に必要ロールを付与する

## 6. 権限設計

### 6.1 デプロイ用 SA の権限

| ロール | 用途 |
|---|---|
| `roles/firebase.admin` または `roles/cloudfunctions.admin` | Functions デプロイ |
| `roles/iam.serviceAccountUser` | Functions が使う SA の借用 |
| `roles/storage.admin` または同等の限定権限 | デプロイ時の Cloud Storage 利用 |

方針:

- デプロイ用 SA は Secret Manager を直接読まない
- Secret は Functions 実行時に参照する

### 6.2 Functions 実行 SA の権限

Functions 実行 SA には以下を付与する。

```text
roles/secretmanager.secretAccessor
```

または secret 単位で以下を付与する。

```text
secretmanager.versions.access on projects/<projectId>/secrets/line-config
secretmanager.versions.access on projects/<projectId>/secrets/task-endpoints
secretmanager.versions.access on projects/<projectId>/secrets/business-secrets
```

補足:

- これは `Secret_Manager_ToBe_詳細仕様.md` と整合する前提である
- GitHub Actions の認証設定とは別に、各 Firebase プロジェクトで実施が必要

## 7. ワークフロー詳細

### 7.1 推奨ワークフロー構成

```yaml
name: Deploy Firebase Functions

on:
  workflow_dispatch:
    inputs:
      project_id:
        description: 'デプロイ先 Firebase Project ID'
        required: true
        type: choice
        options:
          - amuse-app-template

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: functions/package-lock.json

      - name: Install dependencies
        run: npm ci
        working-directory: functions

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}

      - name: Deploy to Firebase Functions
        run: npx firebase-tools deploy --only functions --project=${{ github.event.inputs.project_id }} --non-interactive
        working-directory: functions
        env:
          GOOGLE_APPLICATION_CREDENTIALS: ${{ steps.auth.outputs.credentials_file_path }}
```

### 7.2 実装上の注意

1. `firebase-tools` は `functions` 側の依存解決後に利用する
2. `project_id` は CLI 引数 `--project` で明示する
3. デフォルトプロジェクトに依存しない
4. `workflow_dispatch` の `project_id` と、導入時設定資料の Firebase 紐付けが一致していることを前提とする

## 8. 誤プロジェクトデプロイ防止

1. `project_id` を `choice` 型に固定する
2. workflow ログにデプロイ先を表示する
3. 必要に応じて GitHub Environment 保護を使う
4. Functions デプロイを GitHub Actions に集約し、各自のローカル deploy を常用しない

推奨ログ:

```yaml
- name: Echo target project
  run: echo "Deploying to: ${{ github.event.inputs.project_id }}"
```

## 9. 開発時 / 導入時 / 運用時の操作手順

### 9.1 開発時

目的:

- ワークフロー定義と権限設計を整える
- まだ本番的な複数プロジェクト配備はしない

開発者の操作:

1. `.github/workflows/deploy-functions.yml` を作成または更新する
2. `project_id` の `options` に対象プロジェクトを列挙する
3. GCP で WIF 用 Pool / Provider / デプロイ SA を作成する
4. GitHub Secrets に `WIF_PROVIDER` / `WIF_SERVICE_ACCOUNT` を登録する
5. Functions 実行 SA に Secret Manager 権限が必要になる前提を確認する
6. テスト用または開発用プロジェクトに対して手動実行を試す

この段階で必須ではないもの:

- 本番プロジェクト向け Required reviewers
- 複数プロジェクトすべての即時登録

### 9.2 導入時

目的:

- 新しい Firebase プロジェクトを CI/CD 対象に追加する

開発者の操作:

1. 導入先 Firebase / GCP プロジェクトを作成または確定する
2. `docs/運用時資料/導入時設定/fireBase紐付け` に従って、導入時設定を完了する
3. 対象プロジェクト用の Functions 実行 SA / IAM / Secret Manager 設定を行う
4. GitHub Actions の `project_id` `options` に新プロジェクトを追加する
5. 必要なら GitHub Environment を追加する
6. 手動で workflow を実行し、導入先プロジェクトに `functions` がデプロイできることを確認する

この段階で人手作業が必須な箇所:

- GitHub Secrets / Environment の登録
- GCP 側の WIF 設定
- デプロイ用 SA / Functions 実行 SA の IAM 設定

### 9.3 運用時

目的:

- 日常的な Functions デプロイを安全に行う

開発者の操作:

1. 対象ブランチに必要なコード変更を反映する
2. GitHub Actions を手動実行する
3. `project_id` を選択する
4. ログ上で対象プロジェクトを確認する
5. デプロイ完了後、Firebase Console / GCP Console で反映を確認する
6. 必要に応じて動作確認を行う

確認項目:

- 想定プロジェクトへデプロイされていること
- Functions エラーが出ていないこと
- Secret Manager 参照エラーが出ていないこと

## 10. あなたの操作が必須な項目

この仕様は、コード実装だけでは完結しない。以下は必ず人手で実施が必要である。

### 10.1 GitHub 上の操作

- GitHub Secrets 登録
- GitHub Actions workflow の有効化
- `project_id` choice 更新
- 必要に応じた Environment / Required reviewers 設定

### 10.2 GCP / Firebase 上の操作

- WIF Pool / Provider 作成
- デプロイ用 SA 作成
- impersonation 権限付与
- Functions 実行 SA への Secret Manager 権限付与
- 導入先プロジェクトでの初回動作確認

## 11. テスト・確認観点

1. `workflow_dispatch` から対象プロジェクトを選択できること
2. `project_id` 未選択で実行できないこと
3. WIF 認証に成功すること
4. `functions` のみがデプロイ対象になること
5. Secret Manager 権限不足がデプロイ用 SA ではなく Functions 実行 SA 側の論点として整理されていること
6. 導入先プロジェクト追加時に `options` 更新漏れがないこと

## 12. 本仕様書での最終結論

1. Functions デプロイは GitHub Actions の `workflow_dispatch` で行う。
2. デプロイ対象は `functions` のみとする。
3. 認証方式は Workload Identity Federation を正式採用する。
4. GitHub Actions は Secret Manager を直接読まない。
5. GitHub / GCP / Firebase Console での人手作業を前提に、導入時と運用時の手順を明文化する。

## 13. フェーズ対応メモ

- 本仕様書の主実装フェーズは `フェーズ F: 初回リリース前整備` である。
- `4. ワークフロー設計`、`5. 認証方式`、`6. 権限設計`、`7. ワークフロー詳細`、`8. 誤プロジェクトデプロイ防止` はフェーズ F で反映する。
- `9. 開発時 / 導入時 / 運用時の操作手順` と `10. あなたの操作が必須な項目` はフェーズ F の人手作業計画に直接対応する。
- `11. テスト・確認観点` はフェーズ F とフェーズ G の確認項目として扱う。
- 本仕様書の内容は `docs/環境変数きれい化/フェーズ設計_詳細仕様対応表.md` で全体フェーズに割り当て済みであり、未対応章はない。
