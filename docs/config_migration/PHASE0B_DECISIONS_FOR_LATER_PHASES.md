# Phase0B 決定事項（Phase1 / Phase2 で必須確認）

**Phase1, Phase2 を実施する前に、本ドキュメントの内容を必ず確認すること。**

作成日: 2026-03-04  
更新: 2026-03-05（Phase1 完了反映）  
更新: 2026-03-05（Phase2 完了反映）

---

## 1. 目的

Phase0B で確定した設計・方針は、Phase1（基盤整備）と Phase2（ID 単位移行）の前提条件となる。  
後続フェーズで矛盾や見落としが生じないよう、本ドキュメントに決定事項を集約する。

---

## 2. 必須確認先

| フェーズ | 着手前に確認すべきドキュメント |
|----------|------------------------------|
| **Phase1** | 本ドキュメント、[phase0B/STOREMETA_CONFIG_SPEC.md](./phase0B/STOREMETA_CONFIG_SPEC.md)、[phase0B/PHASE0B_COMPLETED_AND_DECISIONS.md](./phase0B/PHASE0B_COMPLETED_AND_DECISIONS.md) |
| **Phase2** | 上記に加え、[phase0B/PHASE0B_BEFORE_AFTER_DECISION.md](./phase0B/PHASE0B_BEFORE_AFTER_DECISION.md)、[phase0B/PHASE0B_DEPRECATION_PLAN.md](./phase0B/PHASE0B_DEPRECATION_PLAN.md)、[phase1/PHASE1_ROLLBACK.md](./phase1/PHASE1_ROLLBACK.md) |
| **Phase3 以降** | 上記に加え、[phase1/PHASE1_UPDATE_PATH_DESIGN.md](./phase1/PHASE1_UPDATE_PATH_DESIGN.md) §6（defaults.ts を唯一のソースとする方針） |

---

## 3. 決定事項サマリ

### 3.1 storeMeta/config の構成

| 項目 | 決定内容 |
|------|----------|
| ドキュメント構成 | **単一ドキュメント** `storeMeta/config` |
| パス | 店舗 1 つ = 1 Firebase プロジェクトのため、`storeMeta/config` で店舗単位 |
| R-09 | 曜日ごとの可能性あり。実装時に別ドキュメント分離を検討 |

### 3.2 読み取り優先度

| 優先度 | 取得先 | 備考 |
|--------|--------|------|
| ① | storeMeta/config | 値があればそれを使用 |
| ② | `functions/src/shared/config/defaults.ts` | ① が無い場合 |
| ③ | 各 TS ファイル内の直書き | ② も無い場合の最終フォールバック |

**未設定時はエラーにしない**（新規店舗・新規設定の先行投入に対応）。

### 3.3 デフォルト値集約（Phase1 で defaults.ts 唯一ソースに確定）

- **ファイル**: `functions/src/shared/config/defaults.ts`
- **記載内容**: 各設定のデフォルト値と「何のための設定か」をコメントで記載
- **運用**: デフォルト変更時は defaults.ts のみ更新。各 TS 内の直書きは Phase2 で削除済み（D-0015）

### 3.4 共通 config に入れる項目

- D-10: autoOpenClose（enabled, taskCloseOffsetMinutes, taskOpenOffsetMinutes）
- R-10: businessHoursStyles
- R-11, R-12: billing.paymentPolicy.*, sideGameChipRate
- D-04: linePlan
- CALC_BUSINESS_DATE_BUFFER_MINUTES: businessDay.calcBufferMinutes

### 3.5 共通 config に入れない項目

- **D-06 (STORE_CLOSE_HOUR)**: Phase4 で廃止。storeMeta/config には入れない。

### 3.6 更新経路（Phase1 整備済み）

- 主: 詳細設定ページ（AdminHomePage→詳細設定）から initializeStoreConfigCallable 経由で初期投入
- 副: 開発者による Firebase CLI/Console 投入。詳細は [phase1/PHASE1_UPDATE_PATH_DESIGN.md](./phase1/PHASE1_UPDATE_PATH_DESIGN.md)

### 3.7 Phase0B のスコープ

- **実施**: タスク 1〜4, 7、storeMeta/config 仕様の定義
- **実施しない**: タスク 5（実装）、タスク 6（テスト・検証）→ **Phase2 で実施**

---

## 4. Phase1 で活用するポイント（Phase1 完了 ✅）

- STOREMETA_CONFIG_SPEC のスキーマを基に取得層を実装する
- 読み取り優先度 ①→②→③ を実装に反映する
- 欠損時はエラーにせず、②→③ のフォールバックを行う
- 未存在時・読み取り失敗時ともにデフォルトにフォールバック（D-0020）。フォールバック時は `config_fallback`、読み取り失敗時は `config_read_error` + `config_fallback` のログを出力。詳細は [phase1/PHASE1_FALLBACK_BEHAVIOR.md](./phase1/PHASE1_FALLBACK_BEHAVIOR.md)

---

## 5. Phase2 で活用するポイント（Phase2 完了 ✅）

- PHASE0B_BEFORE_AFTER_DECISION の To-Be SSoT に従って参照を差し替える → **完了**
- PHASE0B_DEPRECATION_PLAN の実施タイミング・互換期間に従う → **完了（旧参照は即削除済み）**
- PHASE0B_REFERENCE_MAP を参照し、漏れなく差し替え対象を特定する

---

## 6. storeMeta/config のデフォルト値：defaults.ts を唯一のソースとする（Phase1 確定）

Phase1 で以下を確定。Phase2, Phase3 以降も厳守すること。

- **defaults.ts**: デフォルト値の定義はこのファイルのみ。重複定義禁止。
- **initializeStoreConfigCallable**: フィールド・デフォルト値を列挙しない。`buildFromDefaults()` の出力をそのまま書き込む。
- 新規フィールド追加時: defaults.ts → configLoader buildFromDefaults() の順で更新。Callable は変更不要。

詳細: [phase1/PHASE1_UPDATE_PATH_DESIGN.md](./phase1/PHASE1_UPDATE_PATH_DESIGN.md) §6
