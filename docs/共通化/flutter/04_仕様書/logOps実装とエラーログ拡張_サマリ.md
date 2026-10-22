# logOps 実装とエラーログ拡張 — 実装内容サマリ（1 ファイル）

## 1. この文書の位置付け

- **対象**: 次の 2 つに分散している内容を、**実装の流れと到達点を俯瞰するため**に 1 本にまとめたものです。
  - `docs/共通化/flutter/04_仕様書/logOpsError実装/`（上流・起点）
  - **`docs/エラーログ運用/`**（差分仕様・監視・269 件調査・`functionEntry` 対応表。**索引**: [`README.md`](../../../エラーログ運用/README.md)）
- **詳細の正**: 各個別ドキュメントおよび **`functions/src/shared/logging/logOpsError.ts`**（`logOpsError` / `logOpsSuccess`）、`functionCustomError.ts`、`externalFromCause.ts`、`serviceByFunctionEntry.ts`。
- **開発時ルール**: `.cursor/rules/cloud-functions-error-logging.mdc`（`logOpsError` / `logOpsSuccess`、`context` 相関、成功ログの二重化回避など）。

---

## 2. `logOpsError実装` フォルダで述べていること（上流〜起点）

### 2.1 `保守運用時のエラーログ.md`

| 項目 | 要点 |
|------|------|
| **背景** | 店舗ごとに Firebase プロジェクトが分かれ、障害が分散しやすい → **中央監視への集約**と運用で横断的に扱えるログが必要。 |
| **目的** | 早期検知・原因特定・店舗横断管理。**「残す」だけでなく中央集約後に使える形へ**。 |
| **主対象** | **本リポジトリの Cloud Functions** のエラーログ（業務の中心・統一しやすさ）。クライアント一般エラーは初期の主対象外。 |
| **実装の進め方** | **既存のエラー出力経路を起点**とする（`logger.error` / `console.error` / 未処理例外など **As-is で ERROR になりうる経路**）。全 Callable を最初から棚卸しして「エラーを増やす／減らす」とは切り分ける。 |
| **中央集約** | 初期は **severity ≥ ERROR** を主軸にシンクする考え方（詳細は当該文書・運用設計）。 |

### 2.2 `As-is_エラー出力箇所の洗い出しと分類.md`

| 項目 | 要点 |
|------|------|
| **目的** | 形式統一・`console.error` 置換・changeSpec の**母集団**を決める **材料**（調査日時点の grep 集計）。 |
| **分類 A〜D** | **A**: 既存 `logger.error` の形式統一。**B**: `console.error` 等の置換対象。**C**: `success: false` のみ等の取りこぼし候補。**D**: 触らない候補。 |
| **注意** | 分岐単位の網羅は grep だけでは限界がある旨が記載されている。 |

→ この上流整理を前提に、実装フェーズでは **`functions/` 側で `logOpsError` への統一**などが進んだ（次節）。

---

## 3. `docs/エラーログ運用/` で述べていること（実装仕様・差分・監視）

※旧フォルダ名は **`flutter/04_仕様書/エラーログ拡張/`**。現在の直下は **`warning/`** と **`logOps/`**。`warning/` 配下は **`方針/`**・**`実装サマリ/`**。`logOps/` 配下は **`仕様/`**・**`調査269件/`**・**`要件/`**・**`functionEntry/`**・**`changeSpec/`**・**`実装サマリ/`**（`logOpsError実装サマリA/B`）。

### 3.1 `エラーログ拡張仕様書_差分実装版.md`（実装の柱）

| 項目 | 要点 |
|------|------|
| **位置付け** | 構造化ログ共通化の **As-Is を前提**に、**差分で追加する規約**を定義。モニタアプリ側の重要度判定・分類に必要な材料をログへ載せることが主目的の一つ。 |
| **第1段階（サマリ A）** | 既存 `logger.error` を **`logOpsError` 経由（1 呼び出し = `logger.error` 1 回）**へ。**`functionEntry`、`operation`、`projectId`、`cause`、`context`** 等を payload 化。 |
| **第2段階（サマリ B）** | `functions/src` の **`console.error` を `logOpsError` へ寄せる**（テスト・scripts は対象外など）。完了条件として **`console.error(` が 0 件**・ビルド成功が記載されている。 |
| **分類の主軸** | **`errorSource`**（`function_custom` / `external_api` / `function_common` 等）、**`service`**（**`serviceByFunctionEntry.ts` に `functionEntry` を登録**）、**`functionEntry`**、業務キー付き失敗は **`FunctionCustomError` + `errorKey`**。 |
| **`failureType`** | **過去互換・設計の主軸ではない**（廃止方向の記載あり）。 |
| **静的検証** | 同一 `functionEntry` に複数 `logOpsError` がある場合の **`operation`**: `functions/scripts/verifyLogOpsOperation.cjs`。 |
| **`context`** | payload に **`context`** を載せる境界・機微情報の扱いは仕様書 **§14.3** 等で定義。 |

### 3.2 269 件スコープ・調査・推奨キー

| 文書 | 要点 |
|------|------|
| `エラーログ_context調査_269件.md` / `エラーログ_context推奨_269件.md` | **運用で追う Callable 等のスコープ**における **`context` 推奨キー**と実装方針（診断用フィールドを残しつつ相関キーを追加）。 |
| `エラーログ_成功ログ調査_269件.md` / `エラーログ_成功ログ調査_269件_機械集計.md` | **`logOpsError` はあるが `logOpsSuccess` が無かった経路**の整理と、機械集計での **「error あり・success なし」を 0 にした**等の到達点。 |
| `functionEntry_service_対応表.md` / `functionEntry_業務役割一覧.md` | **`functionEntry` とサービス名・業務上の意味**の対応（運用・検索用）。 |

### 3.3 監視・再試行・相関キー（運用設計）

| 文書 | 要点 |
|------|------|
| `エラーログ監視_再試行と相関キー.md` | **再試行系も監視対象**。1 件の失敗だけでは再試行の成否は判断できないため、**後続の成功・結果確認まで追う**。相関キー・成功ログのフィールド整備。**§7 サマリ**に、**`logOpsSuccess` 追加・`context` 整備・冗長な成功ログの整理・機械検証の結論**がまとまっている。 |
| `エラーログ_重要度判定要件定義.md` | モニタ側の重要度判定の前提（詳細は当該文書）。 |
| `実装ベース精査_function_custom_20260408.md` / `Part2_推奨値_UI操作経路_分析.md` | 精査・UI 経路の分析資料（必要に応じて参照）。 |

### 3.4 機械運用スクリプト（参照のみ）

- **監査・検証**: `functions/scripts/` の `auditLogOpsSuccessCorrelation.cjs`、`verifyLogOpsOperation.cjs` など（運用で採用するものをプロジェクトに合わせて使用）。

---

## 4. 実装の正（コード）

| ファイル | 役割 |
|----------|------|
| `functions/src/shared/logging/logOpsError.ts` | **`logOpsError`**（失敗・`logger.error`）、**`logOpsSuccess`**（成功・`logger.info`・`outcome: success`）、**`truncateForLog`**。 |
| `functions/src/shared/logging/functionCustomError.ts` | 業務キー付きエラーと **`context` マージ**の材料。 |
| `functions/src/shared/logging/externalFromCause.ts` | 外部 API/SDK 由来情報の抽出。 |
| `functions/src/shared/logging/serviceByFunctionEntry.ts` | **`functionEntry` → `service`**（未登録は `unknown_service` 回避のため登録必須）。 |

---

## 5. 参照元フォルダの文書一覧（オリジナル）

### `logOpsError実装/`

| ファイル |
|----------|
| `保守運用時のエラーログ.md` |
| `As-is_エラー出力箇所の洗い出しと分類.md` |

### `docs/エラーログ運用/`（`warning/` と `logOps/`）

| 場所 | ファイル |
|----------|----------|
| **`warning/方針/`** | `warningログ方針.md` |
| **`warning/実装サマリ/`** | `warningログ_実装サマリ_20260511.md` |
| **`logOps/仕様/`** | `エラーログ拡張仕様書_差分実装版.md`、`エラーログ監視_再試行と相関キー.md`、`メイン完了後の補助処理失敗_初期方針.md` |
| **`logOps/調査269件/`** | `エラーログ_context推奨_269件.md`、`エラーログ_context調査_269件.md`、`エラーログ_成功ログ調査_269件.md`、`エラーログ_成功ログ調査_269件_機械集計.md`、`Part2_推奨値_UI操作経路_分析.md`、`_part1_majfreq.json` |
| **`logOps/要件/`** | `エラーログ_重要度判定要件定義.md`、`実装ベース精査_function_custom_20260408.md` |
| **`logOps/functionEntry/`** | `functionEntry_service_対応表.md`、`functionEntry_業務役割一覧.md` |
| **`logOps/changeSpec/`** | `changeSpec_エラーログ拡張.md` |
| **`logOps/実装サマリ/`** | `実装サマリ_エラーログ拡張_20260406.md`、`logOpsError実装サマリA.md`、`logOpsError実装サマリB.md` |

---

## 6. 改訂履歴

| 日付 | 内容 |
|------|------|
| （初版） | `logOpsError実装` と **`docs/エラーログ運用/`**（旧 `エラーログ拡張/`）の実装内容を 1 ファイルにサマリ化。 |
| 2026-05-06 | **`docs/エラーログ運用/`** 直下を **`warning/`** と **`logOps/`** に再編（各サブフォルダは README.md の索引に準拠）。 |
