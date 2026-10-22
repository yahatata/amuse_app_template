# Cloud Functions 保守運用 — エラーログ・warning ログ（ドキュメント索引）

共通化（Flutter）の `04_仕様書` から切り離し、**リポジトリ直下の `docs/エラーログ運用/`** に集約しています。直下は **`warning/`**（warning ログ運用）と **`logOps/`**（`logOpsError`・構造化エラーログ運用）の 2 系統のみとし、それぞれの配下にテーマ別サブフォルダを置きます。

## フォルダ構成（直下）

| フォルダ | 内容 |
|----------|------|
| **`warning/`** | `logger.warn` / `logOpsError` との使い分け・warning 整理の実装サマリ |
| **`logOps/`** | 差分仕様・監視・269 件調査・`functionEntry` 対応表・changeSpec・`logOpsError` 実装サマリ A/B |

### `warning/` 配下

| 場所 | ファイル |
|------|----------|
| **`方針/`** | `warningログ方針.md`（判断基準の正本） |
| **`実装サマリ/`** | `warningログ_実装サマリ_20260511.md` |

### `logOps/` 配下

| 場所 | ファイル |
|------|----------|
| **`仕様/`** | `エラーログ拡張仕様書_差分実装版.md`、`エラーログ監視_再試行と相関キー.md`、`メイン完了後の補助処理失敗_初期方針.md` |
| **`調査269件/`** | `エラーログ_context推奨_269件.md`、`エラーログ_context調査_269件.md`、`エラーログ_成功ログ調査_269件.md`、`エラーログ_成功ログ調査_269件_機械集計.md`、`Part2_推奨値_UI操作経路_分析.md`、`_part1_majfreq.json` |
| **`要件/`** | `エラーログ_重要度判定要件定義.md`、`実装ベース精査_function_custom_20260408.md` |
| **`functionEntry/`** | `functionEntry_service_対応表.md`、`functionEntry_業務役割一覧.md` |
| **`changeSpec/`** | `changeSpec_エラーログ拡張.md`（正本） |
| **`実装サマリ/`** | `実装サマリ_エラーログ拡張_20260406.md`、`logOpsError実装サマリA.md`、`logOpsError実装サマリB.md` |

## 関連

- Cursor ルール: `.cursor/rules/cloud-functions-error-logging.mdc`

旧パス `docs/共通化/flutter/04_仕様書/エラーログ拡張/` は README のみ残し、こちらへ誘導します。
