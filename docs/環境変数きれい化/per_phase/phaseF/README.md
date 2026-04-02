# phaseF README

## フェーズ目的

初回リリース前に、以下を To-Be 仕様へ揃える。

- Functions デプロイ経路を GitHub Actions + WIF に統一する
- `us-central1` 残存を `asia-northeast1` へ統一する
- `task-endpoints` と実体リージョンを整合させる
- `fireBase紐付け` 導入時資料を、運用可能なチェックリストへ更新する

用語ルール:

- `GitHubリポジトリ名`: 例 `yahatata/amuse_app_template`
- `Firebase Project ID（= GCP Project ID）`: 例 `amuse-app-template`
- `project_id`: GitHub Actions workflow の入力名（値は Firebase Project ID）

## 参照資料

- `docs/環境変数きれい化/進め方_仕様詳細化とフェーズ設計フロー.md`
- `docs/環境変数きれい化/フェーズ設計_詳細仕様対応表.md`
- このフェーズが担当する詳細仕様書

## 担当仕様範囲

- `docs/環境変数きれい化/仕様書/GitHub_Actions_ToBe_詳細仕様.md`
  - 1〜12 全体
- `docs/環境変数きれい化/仕様書/リージョン移行_ToBe_詳細仕様.md`
  - 1〜12 全体
- `docs/環境変数きれい化/仕様書/Secret_Manager_ToBe_詳細仕様.md`
  - 9.3 CI/CD
  - 10 IAM
  - 11 ローテーション方針の導入時反映
- `docs/環境変数きれい化/仕様書/コード固定_ToBe_詳細仕様.md`
  - 4.1 リージョン方針
  - 9.3 GCP 側削除対象
  - 11 テスト・確認観点のリージョン関連
- `docs/運用時資料/導入時設定/fireBase紐付け/*`

補足:

- GitHub Actions + WIF
- `project_id` choice（値は Firebase Project ID）
- `asia-northeast1` 一括切替
- `task-endpoints` 更新
- 導入時設定資料の適用

## 進め方

各フェーズを進める際は、必ず `docs/環境変数きれい化/進め方_仕様詳細化とフェーズ設計フロー.md` の  
`各フェーズで実施する標準ステップ（確定）` を参照すること。

## changeSpec 作成ルール

以下を基本的に必ず記載する。

- 対象仕様書と対象章
- As-Is 確認結果
- 新規作成するファイル
- 修正するファイル
- 移動するファイル
- 実装方針
- テスト方針
- 外部操作
- リスク
- ロールバック方法

補足:

- ファイルの新規作成や、修正対象ファイルの移動を行う場合は、必ず「どこに」「どのような名前で」作成または移動する予定かを明記する。
- 既に用意されている対象ファイルを修正する場合は、「修正するファイル」にもれなく記載する。
- 実装方針は、必ず一定の具体性を持たせ、修正が必要な箇所について網羅的に触れるように注意する。
- 対象となる仕様書に記載された仕様は、もれなく丁寧に読み込む。
- As-Is の確認も、もれなく丁寧に行い、どのように修正・実装を行うか検討した上で実装方針を作成する。

## ログ / 記録ルール

このフェーズでは、以下を残す。

- 作業ログ
- テスト結果
- ユーザー依頼事項
- フェーズ完了サマリ
- 次フェーズへの伝達事項

ログは、この `phaseF` フォルダ配下にログファイルを作成して残す。

## ユーザーレビュー

- `changeSpec` 作成後にレビュー依頼を行う
- ユーザー承認後に実装へ進む
- テスト結果報告後も必要に応じて承認を得る

## 外部操作の扱い

エージェント側で CLI から実行できることはエージェントが担う。  
GCP / GitHub / Firebase Console 上の外部操作が必須なもののみ、目的・操作手順・確認項目を明記してユーザーへ依頼する。

## Entry条件

- phaseE の完了（旧 scheduler / 旧 env 整理）が確認済み
- schedulerConfig v2 化が完了している
- Secret Manager 3secret 構成（line-config / task-endpoints / business-secrets）が導入済み

## Exit条件

- GitHub Actions workflow（`workflow_dispatch` + `project_id(choice: Firebase Project ID)` + WIF）が追加済み
- コード上の `us-central1` 直書きが解消済み
- 導入時資料（`fireBase紐付け/*`）に phaseF 観点が反映済み
- 外部操作（WIF/IAM/queue/`task-endpoints`）が手順化されている

## ロールバック条件

- リージョン切替後に task 起動が失敗し、業務経路が維持できない場合
- WIF 設定不備でデプロイ経路が塞がる場合
- `task-endpoints` 更新不整合で downstream task が実行不能になる場合

## 完了物

- `phaseF/changeSpec.md`
- `phaseF/phaseF_log.md`
- `phaseF/phaseF_外部操作手順.md`
- `.github/workflows/deploy-functions.yml`
- 更新済み `fireBase紐付け` 運用資料
