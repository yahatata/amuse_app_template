# Z: 全 ID 横断の必須要件 — Phase2 検証ファイル

**※ 必ず `per_id_TASK4_PROCEDURE.md` を確認しながら進めること。**

バッチ: 横断（全 ID 共通） | 対象層: Functions + Flutter + ドキュメント

---

## 1. 要件（PHASE2_ID_REQUIREMENTS_CHECKLIST より）

### Z-1. 取得失敗時の挙動設計（ID ごと）

| # | 必須作業 | Task 4 確認結果 |
|---|----------|----------------|
| 1 | 各 ID について、storeMeta/config の取得に失敗した場合の挙動を設計する | ✅ 各 per_id で実施済み |
| 2 | Functions: defaults.ts へのフォールバック or 処理失敗のいずれかを選択・実装 | ✅ configLoader で defaults フォールバック実装済み |
| 3 | Flutter: 最後の成功値を維持する仕組みが StoreConfigService に実装済みであることを確認 | ✅ store_config_service.dart L249「最後の成功値を維持」実装確認 |
| 4 | 設計結果を記録する | ⚠ B-06 は未実装のため実装時対応。残タスクを docs/table_device/tobe_spec.md §16 に記載済み |

### Z-2. 切り戻し手順（ID ごと）

| # | 必須作業 | Task 4 確認結果 |
|---|----------|----------------|
| 1 | 各 ID について、問題発生時の切り戻し手順を記録する | ✅ 設定の不具合時の対応.md に記載済み |
| 2 | コードデプロイによる差し替え前状態への復帰手順を含める | ✅ 各設定で「リトライ→エラーコード→必要時コードデプロイ」と記載 |

### Z-3. 旧参照の即削除

| # | 必須作業 | Task 4 確認結果 |
|---|----------|----------------|
| 1 | 差し替え完了した旧 env / 定数 / ハードコードを即削除する | ✅ REQUIREMENTS_GAP_CHECK §1 で確認済み。移行済み定数は削除済み |
| 2 | 旧参照への fallback は実装しない | ✅ PHASE1_ROLLBACK 方針に従い fallback 維持なし |

### Z-4. defaults.ts 唯一ソースの遵守

| # | 必須作業 | Task 4 確認結果 |
|---|----------|----------------|
| 1 | TS ファイル内の直書き（フォールバック優先度③）を Phase2 で削除する | ⚠ configOps.ts の `return 27` は Phase4 スコープ。D06_CONFIGOPS_CLEANUP.md に明記済み |
| 2 | デフォルト値は defaults.ts にのみ定義し、他のファイルで重複定義しない | ✅ config 関連は defaults.ts から import。paymentSplitCalculator は defaults を re-export のみ |

### Z-5. ログ仕様

| # | 必須作業 | Task 4 確認結果 |
|---|----------|----------------|
| 1 | configLoader でフォールバック時に `config_fallback` warn ログを出力 | ✅ configLoader.ts L73, L94, L372。helpers.ts にも実装あり |
| 2 | configLoader で読み取り失敗時に `config_read_error` error ログを出力 | ✅ configLoader.ts L88-89 |
| 3 | 構造化ログ形式を使用 | ✅ code, configKey, fallbackSource, reason 等を object で出力 |

### Z-6. ドキュメント更新

| # | 必須作業 | Task 4 確認結果 |
|---|----------|----------------|
| 1 | CHANGE_LOG にエントリを追加 | ✅ CM-Phase2-001 等あり |
| 2 | 計画外の追加仕様がある場合、DECISION_LOG に記録 | （検証時点で追加確認なし） |
| 3 | ALL_ID_STATUS で全 ID の状態を確定 | ✅ 全 ID に状態付与済み |
| 4 | tobe_config_architecture の読み取り優先度を ①→② のみに更新（③ 削除の反映） | ✅ §8 に「① → ② のみ」「③ は Phase2 で削除済み」と記載。欠損時挙動も ①→② でフォールバック（GAP-2-3 解消済み） |

### Z-7. ゲート通過

| # | 必須作業 | Task 4 確認結果 |
|---|----------|----------------|
| 1 | `npx tsc --noEmit` パス | ✅ パス確認済み |
| 2 | `flutter analyze` エラー 0 | ✅ error レベル 0。info/warning は 1022 件あるが、エラーは 0 |

---

## 2. 実装漏れ・要調査事項（REQUIREMENTS_GAP_CHECK より）

### 確定した漏れ

| # | GAP ID | 内容 | 影響度 |
|---|--------|------|--------|
| 1 | GAP-2-1 | **各 ID の取得失敗時の挙動設計が未記録**: configLoader.ts の実装は全フィールド統一で安全だが、ID ごとの設計記録がない | 中 |
| 2 | GAP-2-2 | **各 ID の切り戻し手順が未記録**: CHANGE_LOG に一括方針はあるが、ID 別の具体手順がない | 中 |
| 3 | GAP-2-3 | **tobe_config_architecture.md の「欠損時挙動」セクションに ③ が残っている**: 「読み取り優先度」セクションでは ①→② のみと正しく記載されているが、「欠損時挙動」セクションで ①→②→③ と記載されており不整合 | 低 |

### 要調査事項

該当なし（横断要件に紐づく個別のテスト失敗はない。個別 ID のファイルに記載済み）

---

## 3. 関連テスト失敗（VERIFICATION_TASK_ORDER より）

特定 ID に帰属しないテスト失敗事象なし（全テスト失敗は CALC_BUFFER または R-11/R-12 に帰属）

---

## 4. Task 4 実施記録

### Z-1 〜 Z-2: 各 ID のファイルで個別に記録する

GAP-2-1・GAP-2-2 については、各 ID の verification ファイル内「取得失敗時の挙動設計」「切り戻し手順」セクションで記録する。

### Z-3: 旧参照の即削除 — 確認結果

REQUIREMENTS_GAP_CHECK §1 で確認済み。移行済み定数は globalConstant から削除済み。旧 env/defineString 参照も差し替え済み。

### Z-4: defaults.ts 唯一ソース — 確認結果

config 関連のデフォルトは defaults.ts から import。⚠ configOps.ts の getStoreCloseHour に `return 27` の直書きあり（検出した問題参照）。

### Z-5: ログ仕様 — 確認結果

config_fallback（warn）、config_read_error（error）を構造化ログで出力済み。

### Z-6: ドキュメント更新 — 確認結果

CHANGE_LOG、ALL_ID_STATUS、tobe_config_architecture 更新済み。

### GAP-2-3: tobe_config_architecture.md 修正

欠損時挙動セクションは「①→② でフォールバック」と記載されており、③ の記載はない。解消済み。

### Z-7: ゲート通過 — 確認結果

tsc --noEmit パス。flutter analyze は error 0（info/warning はあり）。

### テスト要件整理

| 区分 | 内容 |
|------|------|
| Cursor が CL 等で確認するもの | tsc --noEmit、flutter analyze、configLoader のログ出力 |
| テストファイルで確認するもの | configLoader.spec, phase2_migration.spec 等 |
| ユーザーが実機で確認するもの | 横断要件のため個別実機テストは各 ID で実施 |

### テストファイルの確認・修正

既存テストで config_fallback 等のログ検証あり。修正不要。

---

## 検出した問題（対応状況）

以下は検証時に検出した問題とその対応。

| # | 問題 | 対応 |
|---|------|------|
| 1 | **tableDeviceRegistrationEnabled（B-06）が取得失敗時の挙動設計.md に未記載** | **残タスクとして docs/table_device/tobe_spec.md §16 に記載済み**。卓端末機能実装時に対応すること。 |
| 2 | **tableDeviceRegistrationEnabled が設定の不具合時の対応.md に未記載** | 同上。§16 に実装時の残タスクとして記載済み。 |
| 3 | **configOps.ts getStoreCloseHour に `return 27` の直書きあり** | **Phase4 スコープとして docs/config_migration/phase4/D06_CONFIGOPS_CLEANUP.md に明記済み**。STORE_CLOSE_HOUR 廃止時に当該直書きも廃止する。 |
