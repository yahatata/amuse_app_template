# fireBase紐付け

このフォルダでは、1 つのリポジトリから複数アプリ / 複数 Firebase プロジェクトへリリースする前提で、
同じ対象 Firebase プロジェクト（Firebase Project ID）を 3 レイヤーで整合して扱うための設計と運用をまとめる。  
親フォルダ `導入時設定` の文脈に合わせ、初回導入時にアプリごとに分ける必要がある設定も扱う。

用語ルール（本フォルダ共通）:

- `GitHubリポジトリ名`: 例 `yahatata/amuse_app_template`
- `Firebase Project ID（= GCP Project ID）`: 例 `amuse-app-template`
- `project_id`: GitHub Actions workflow の入力名（値は Firebase Project ID）

曖昧な「プロジェクトID」という単独表現は使わない。

対象資料:

- `3レイヤー整合_設計方針.md`
- `リリース前後チェックリスト.md`

前者は「どのレイヤーが何を責務として持つか」を整理した設計資料、
後者は「初回導入時 / 通常リリース時 / リリース後確認で何をするか」を整理した運用資料である。

phaseF 反映として、以下もこのフォルダ配下で扱う。

- GitHub Actions `workflow_dispatch` + `project_id(choice: Firebase Project ID)` + WIF での Functions デプロイ運用
- `asia-northeast1` 統一方針（Functions / Cloud Tasks / Cloud Run）
- Secret Manager `task-endpoints` の導入時更新・確認

特に `3レイヤー整合_設計方針.md` では、以下を確認できるようにする。

- 導入時にアプリごとに分ける必要があるもの
- 現状資料で不足していた観点
- Functions 側だけでなく、Web / LIFF / モバイル識別子 / GCP リソースまで含めた導入時設定の全体像
