# changeSpec: errorKey / service / 運用重要度（基本＋補正）の実装

## 0. 本 changeSpec の位置づけ

- **目的**: `functions` の `logOpsError` 出力に **`errorKey`**・**`service`**・**補正後の運用重要度**（payload 内の **`finalSeverity`**）を載せ、保守運用・モニタの基盤とする。
- **根拠仕様**: `エラーログ重要度判定.md`
- **根拠対応表**: `functionEntry_service_対応表.md`（主表＋「export 外の functionEntry 対応表」）
- **補正表**: 本書 §7.3（ユーザー確定の表をコード化する）

---

## 1. 作成可否・不足事項

### 1.1 この前提情報で changeSpec を作成可能か

**作成可能。** errorKey / service / 基本重要度 / 補正 / 共通判定の入力 / 個別指定第1弾 / `functionEntry` 基準 / `unknown_service` / 対応表（主表＋export 外）まで揃っている。

### 1.2 不足・要確認（致命的ではないもの）

| 項目 | 内容 |
|------|------|
| **会計 Callable** の `FAILED_PRECONDITION` のうち **個別指定に載せる具体ケース**の列挙 | 「意味が変わるものだけ」— 未確定（§17） |
| **モニタアプリ** | 本 changeSpec は **functions のログ出力まで**（閾値・UI・連携タイミングは **別タスク／別 changeSpec**） |

**確定済み（本書他節）**: `HttpsError` コードの payload キーは **`httpsErrorCode`**（§8.3・§11）、requestHash mismatch は **`IDEMPOTENCY_CONFLICT`**（§12.1）、appendItem 系の **`operation` 付与**（§12.2）、会計 Callable の業務エラーを **`logOpsError` に残す**方針（§12.1）。

---

## 2. 新規作成・参照するファイル

| 種別 | パス |
|------|------|
| **本 changeSpec** | `docs/共通化/flutter/04_仕様書/changeSpec_errorKey_service_ログ重要度.md` |
| 参照（更新しない） | `docs/共通化/flutter/04_仕様書/エラーログ重要度判定.md` |
| 参照（更新しない） | `docs/共通化/flutter/04_仕様書/functionEntry_service_対応表.md` |
| 実装時に主に変更 | `functions/src/shared/logging/logOpsError.ts` |
| 実装時に新設想定 | `functions/src/shared/logging/` 配下（例: `inferErrorKey.ts`, `serviceMap.ts`, `severity.ts` 等。実装時にファイル分割は任意） |

---

## 3. 目的

1. 各 ERROR ログに **`errorKey`**（失敗の粗い分類）を付与する。
2. **`service`**（業務領域）を付与し、**service 補正**で運用重要度を調整する。
3. **個別指定**と**共通判定**の二段構えで `errorKey` を決め、**個別指定を優先**する。
4. 既存の `failureType`・`functionEntry`・`context` 等を維持し、**後方互換**を意識する。

---

## 4. スコープ

### 4.1 対象

- `functions/src/**` の `logOpsError` および新設の共通判定・補正・マップ。
- `SERVICE_BY_FUNCTION_ENTRY` の構築（**主表＋ export 外**の全行をカバーすること）。

### 4.2 対象外

- モニタアプリの表示・通知チャネル実装（別タスク）。
- すべての呼び出し点への手動 `errorKey` 付与（**第1弾は §12.3 の functionEntry に限定**）。
- **`createInitialStateDoc`**（`storeMeta/scripts/createInitialStateDoc.ts`）: **本 changeSpec の対象外**とする。スクリプトであり、本番 Cloud Functions のログ基盤の主対象外であること、および本 changeSpec の範囲を濁らせないため。**`SERVICE_BY_FUNCTION_ENTRY` の必須登録や個別指定の対象に含めない**（必要なら将来別 changeSpec）。

---

## 5. 前提 / 仕様書との対応

| 項目 | 参照 |
|------|------|
| errorKey 一覧・定義・基本重要度・補正方針 | `エラーログ重要度判定.md` |
| `functionEntry` → `service` | `functionEntry_service_対応表.md`（**ログに出る文字列基準**；主表＋ export 外） |
| 補正（上げのみ・high まで・表外は据え置き・下げなし） | ユーザー確定の補正表（本書 §7.3） |

---

## 6. 実装対象（成果物）

1. **型**: `ErrorKey`, `Service`, `OpsSeverity`（`low` \| `medium` \| `high`）、`ResolvedService`（§7.1）。
2. **定数**: `BASE_SEVERITY_BY_ERROR_KEY`, `CORRECTION_RULES`, `SERVICE_BY_FUNCTION_ENTRY`（対応表の機械可読化）。
3. **共通判定**: `inferErrorKey(cause: unknown): ErrorKey`（§8）。
4. **service 解決**: `resolveService(functionEntry: string): ResolvedService`（§7.1・§9）。
5. **補正**: `applyServiceCorrection(...)`（§7.3・§10）。
6. **個別指定**: 第1弾マップ（§12）および分岐（`getCurrentBusinessDateKeyOrThrow` の CONFIG vs FAILED_PRECONDITION 等）。
7. **`logOpsError` 拡張**: 上記を組み込み、payload に `errorKey`, `service`, `baseSeverity`, `finalSeverity`、**`httpsErrorCode`**（`cause` が `HttpsError` のとき。§8.3・§11）を出力する。
8. **単体テスト**: 共通判定・補正・未登録 `functionEntry`・個別指定の優先順位。

---

## 7. 追加する型 / 定数 / マップ

### 7.1 型

- `ErrorKey`: 次の union（確定一覧どおり）  
  `INVALID_INPUT` \| `UNAUTHENTICATED` \| `PERMISSION_DENIED` \| `NOT_FOUND` \| `ALREADY_EXISTS` \| `FAILED_PRECONDITION` \| `CONFLICT` \| `DATA_INCONSISTENCY` \| `IDEMPOTENCY_CONFLICT` \| `CONFIG_ERROR` \| `EXTERNAL_SERVICE_ERROR` \| `TIMEOUT` \| `TEMPORARY_UNAVAILABLE` \| `RESOURCE_EXHAUSTED` \| `INTERNAL_ERROR`
- **`Service`**: **正式な業務 service は次の 17 値のみ**の union  
  `accounting` \| `close_process` \| `store` \| `attendance` \| `payroll` \| `staff` \| `shift` \| `business_hours` \| `tournament_schedule` \| `tournament` \| `orders` \| `user` \| `side_game` \| `audit_log` \| `line` \| `analytics` \| `platform`
- **`unknown_service`**: **正式な `Service` には含めない**。`SERVICE_BY_FUNCTION_ENTRY` に **キーが存在しない**（マッピング漏れ）ときにのみ用いる **実装上の特別値**（literal `'unknown_service'`）。ログ payload の `service` に載せ、**マッピング漏れ検知**に使う。
- **`ResolvedService`**: `Service` \| `'unknown_service'` — `resolveService` の戻り値型。補正ロジックへ渡す前に、**`unknown_service` のときは補正を適用しない**（§10）。
- `OpsSeverity`: `low` \| `medium` \| `high`

### 7.2 定数 `BASE_SEVERITY_BY_ERROR_KEY`

ユーザー確定の対応（例: `INVALID_INPUT` → `low`, `DATA_INCONSISTENCY` → `high`）をそのままコード化。

### 7.3 定数 `CORRECTION_RULES`（補正表）

補正対象は **`NOT_FOUND`, `FAILED_PRECONDITION`, `PERMISSION_DENIED`, `EXTERNAL_SERVICE_ERROR`, `TIMEOUT`** のみ。

- 各ルール: `(errorKey, service)` → 効果 **`raise_to_high`**（`baseSeverity` に関わらず **`finalSeverity` は `high`**）。
- 表にない `service` は **補正なし**（`finalSeverity` = `baseSeverity`）。
- **下げ補正は実装しない。**

### 7.4 定数 `SERVICE_BY_FUNCTION_ENTRY`

- **キー**: ログに実際に出力される **`functionEntry` 文字列**（Firebase export 名と一致しない場合あり）。
- **値**: `Service` のみ（マップに登録されたキーは **必ず 17 値のいずれか**）。
- **未登録のキー**: 既定 `service` へのフォールバックは **行わず**、`resolveService` は **`unknown_service`** を返す。ログに `service: 'unknown_service'` を載せ、**マッピング漏れとして検知**する。
- **データソース**: `functionEntry_service_対応表.md` の **主表**および **「export 外の functionEntry 対応表」** を突合し、漏れゼロを目指す。
- **`getPayrollConfig`**（`payrollConfigLoader.ts`）: **`platform`** に寄せる（**確定**）。`getStoreConfig` と同様、**config 失敗は platform 固定** の前提に合わせる。

---

## 8. 共通判定の変更方針

### 8.1 入力（原則）

- **`error.message` は判定に使わない**（確定方針）。
- 主に **`HttpsError.code`**（Firebase Functions v2 は gRPC 名の文字列）、HTTP 応答がある場合は **status**、Google API 由来なら **canonical / gRPC 相当**。
- **`cause` が `HttpsError` でない**場合は型・`name` 等で §13.3 相当の表に寄せる。

### 8.2 代表的なマッピング（仕様 §13.3 をコード化）

- `invalid-argument` → `INVALID_INPUT`
- `unauthenticated` → `UNAUTHENTICATED`
- `permission-denied` → `PERMISSION_DENIED`
- `not-found` → `NOT_FOUND`
- `already-exists` → `ALREADY_EXISTS`
- `failed-precondition` → `FAILED_PRECONDITION`
- `aborted` → `CONFLICT`
- `resource-exhausted` → `RESOURCE_EXHAUSTED`
- `deadline-exceeded` → `TIMEOUT`
- `unavailable` → `TEMPORARY_UNAVAILABLE`
- 不明・未分類 → `INTERNAL_ERROR`

（実装時に表を 1 箇所に集約し、テストで固定する。）

### 8.3 `HttpsError` コードの保持（確定）

- `cause` が `HttpsError` のとき、**gRPC 名相当のコード**（例: `failed-precondition`）は **`jsonPayload` 直下**の専用キー **`httpsErrorCode`** に載せる。
- **汎用の `code`**（既存呼び出しで `context` マージにより payload に出る **`code`** 等）とは **別物**とする。config 系など **独自意味の `code`** と **HttpsError のコード**が混在しないようにする。
- **正規の「HttpsError / gRPC 相当コード」は `httpsErrorCode` を正**とする。既存の `context.code` がある箇所は **当面残りうる**が、**本実装では `httpsErrorCode` に統一して載せる**ことを前提とする（移行・二重出力の扱いは実装時に最小限の後方互換で調整可）。

### 8.4 Fallback

- 判定不能 → `INTERNAL_ERROR`。

---

## 9. service マッピング方針

- **単一のマップ** `SERVICE_BY_FUNCTION_ENTRY` で解決する。
- **確定事項**（対応表と整合）の例:  
  `finalizeUnsettledBillAfterAccounting` → `close_process`, `migrateSettledBillsForBusinessDay` → `analytics`, `getShifts` → `staff`, `getCurrentBusinessDateKeyOrThrow` → `store`, `appendItem` → `orders`, config 系失敗の呼び出し元は **`platform`**（`getStoreConfig`, **`getPayrollConfig`** 等）。
- **export 外**の例: `runEnqueueTournamentTasks`, `runGenerateRecurringTournaments` → `tournament_schedule`（対応表どおり）。

---

## 10. 補正ロジック方針

1. `baseSeverity` = `BASE_SEVERITY_BY_ERROR_KEY[errorKey]`。
2. `errorKey` が補正対象 **5 つ**のいずれか **かつ** `(errorKey, service)` が `CORRECTION_RULES` に該当し、かつ **`service` が正式 `Service`（17 値のいずれか）** の場合、`finalSeverity` = `high`。
3. それ以外は `finalSeverity` = `baseSeverity`。
4. **`service` が `unknown_service` の場合**: **補正は適用しない**（`finalSeverity` = `baseSeverity`）。

---

## 11. logOpsError の変更方針

### 11.1 現状（一次情報）

- ファイル: `functions/src/shared/logging/logOpsError.ts`
- `LogOpsErrorArgs`: `message`, `failureType`, `functionEntry`, `operation?`, `projectId?`, `cause?`, `errorMessage?`, `errorName?`, `context?`
- 出力: `logger.error(message, payload)`、`payload` に上記をマージ

### 11.2 Cloud Logging の `severity` と payload 内の `baseSeverity` / `finalSeverity` の区別（確定）

- **Cloud Logging 標準のログレベル**（`logger.error` に対応するトップレベル **`severity`**）は、引き続き **エラー行として `ERROR`** 等（ランタイム既定）とする。
- **運用重要度の `low` / `medium` / `high`** は、**jsonPayload 内**の **`baseSeverity`**（補正前）および **`finalSeverity`**（補正後）にのみ載せる。
- **混同防止**: `severity` 単独のフィールド名は、`OpsSeverity` の意味では **payload では使わない**（`baseSeverity` / `finalSeverity` で役割を固定）。
- **`service`（ログ出力仕様）**: `jsonPayload` に載せる **`service`** は、**正式 `Service` 17 値のいずれか**、または **`unknown_service`** のいずれかのみである（型定義上の `Service` union と、実際の payload の値は **必ずしも一致しない** — `unknown_service` は正式 `Service` に含めない特別値。§7.1）。
- **`httpsErrorCode`（確定）**: `cause` が `HttpsError` のとき、**payload 直下**に **`httpsErrorCode`** を出力する（§8.3）。**`code`** フィールド（既存の `context` マージによるものを含む）とは役割を分ける。

### 11.3 運用重要度フィールド名（確定）

- **補正前**: `baseSeverity`（`OpsSeverity`）
- **補正後**: **`finalSeverity`**（`OpsSeverity`）
- **理由**: `baseSeverity` と対になること、補正後であることが明確、`severity` 単独より曖昧でないこと。

### 11.4 拡張案

- 任意引数: `errorKey?: ErrorKey`, `service?: Service` — **通常は自動計算**し、個別指定・テスト用にのみ明示。
- 処理順（確定案）:
  1. `errorKey` = 明示 ?? **個別指定**（§12）?? **共通判定**(`cause`)
  2. `service` = 明示 ?? `resolveService(functionEntry)`（未登録は `unknown_service`）
  3. `baseSeverity` = 定数表
  4. `finalSeverity` = 補正適用（§10）
  5. `cause` が `HttpsError` のとき **`httpsErrorCode`** = その `code`（§8.3）
  6. `logger.error` の `payload` に `errorKey`, `service`, `baseSeverity`, `finalSeverity`, **`httpsErrorCode`**（該当時）を追加

### 11.5 後方互換

- 既存キー（`failureType`, `functionEntry`, …）の意味は変えない。
- 新フィールドは **追加のみ**。

---

## 12. 個別指定の第1弾対象

**優先順位**: 個別指定 > 共通判定。

### 12.1 確定方針（ユーザー提示）

- **requestHash mismatch**（冪等キーとリクエスト内容の不一致）: **`IDEMPOTENCY_CONFLICT`** に**個別指定**する（**第1弾確定**）。**appendItem 系**と **`startAccounting`（リポジトリ）**で一貫させる（`HttpsError` が `failed-precondition` でも **個別指定で上書き**）。
- **`getStoreConfig`**: 主候補 **`CONFIG_ERROR`**（読み取り失敗は既存の補助 `code` と整合。運用上の **HttpsError コードは `httpsErrorCode`** と区別。§8.3）。
- **`getCurrentBusinessDateKeyOrThrow`**:  
  - 初期化不足（doc 不在・空）→ **`CONFIG_ERROR`**  
  - 状態未達（非 running 等）→ **`FAILED_PRECONDITION`**  
  （分岐は **コード上の条件**で固定。一次情報: `getCurrentBusinessDateKeyOrThrow.ts`）
- **会計 Callable**（`accounting.ts` の `startAccounting` / `completeAccounting` / `completeAccountingV2`）: **業務エラー（`HttpsError` 含む）も `logOpsError` に残す**方針とする（クライアント返却のみで終わらせず、保守運用ログ基盤に載せる）。**`FAILED_PRECONDITION` のうち、個別指定マップに載せる具体ケースの列挙**は **未確定**（§17。「意味が変わるものだけ」細分化）。

### 12.2 `appendItem` と `appendItemWithOrderProjection`（初期実装・確定）

- **`functionEntry` は `appendItem` のまま維持**する。
- **`operation`（確定）**: **通常の `appendItem` 経路**には **`operation: 'appendItem'`**、**`appendItemWithOrderProjection` 経路**には既存どおり **`operation: 'appendItemWithOrderProjection'`** を付与する。初期実装で **両経路とも `operation` を揃える**。
- **採用理由**: **既存ログの `functionEntry` 文字列との互換性を大きく崩さない**こと。あわせて **Cloud Logging / モニタで `operation` による集計・絞り込みを揃えやすい**こと。
- **第2案（後続検討）**: `functionEntry` 自体を `appendItemWithOrderProjection` に分ける案は **採用しない**（必要なら後から検討）。
- **個別指定マップ**（§12.3）の行は **`appendItem` のみ**とし、**`appendItemWithOrderProjection` 専用の別行は置かない**（個別指定のキーはログ上の `functionEntry` 基準のため。経路は **`operation`** で区別）。

### 12.3 第1弾でマップ化する functionEntry（候補 errorKey）

| functionEntry | service | 候補 errorKey（割当は実装時に条件分岐） |
|---------------|---------|--------------------------------------|
| `appendItem` | orders | `IDEMPOTENCY_CONFLICT`（**requestHash mismatch** は第1弾で個別指定）、`FAILED_PRECONDITION`, `DATA_INCONSISTENCY`, `INTERNAL_ERROR`（**通常 `operation: 'appendItem'`、投影 `operation: 'appendItemWithOrderProjection'`** — §12.2） |
| `startAccounting`（repos ヘルパー） | accounting | `IDEMPOTENCY_CONFLICT`（**requestHash mismatch** は第1弾で個別指定）、`FAILED_PRECONDITION` |
| `startAccounting`, `completeAccounting`, `completeAccountingV2`（accounting Callable） | accounting | `FAILED_PRECONDITION`, `NOT_FOUND`, `DATA_INCONSISTENCY` |
| `getStoreConfig` | platform | `CONFIG_ERROR` |
| `getCurrentBusinessDateKeyOrThrow` | store | `FAILED_PRECONDITION`, `CONFIG_ERROR` |
| `migrateSettledBillsForBusinessDay` | analytics | `DATA_INCONSISTENCY`, `FAILED_PRECONDITION`, `INTERNAL_ERROR` |
| `billsOnSettle` | accounting | `DATA_INCONSISTENCY`, `INTERNAL_ERROR`, `CONFIG_ERROR` |
| `executeMonthlyPayroll` | payroll | `EXTERNAL_SERVICE_ERROR`, `INTERNAL_ERROR`, `FAILED_PRECONDITION` |
| `runEnqueueTournamentTasks` | tournament_schedule | `EXTERNAL_SERVICE_ERROR`, `TIMEOUT`, `INTERNAL_ERROR` |
| `runGenerateRecurringTournaments` | tournament_schedule | `INTERNAL_ERROR`, `FAILED_PRECONDITION`, `EXTERNAL_SERVICE_ERROR` |

---

## 13. 第1弾実装順（推奨）

個別指定の **実装ロールアウト**は、次の順を推奨する（**§12.3 の対象をすべてカバーする前提で、優先度を付けたもの**）。

| 順 | functionEntry（主） | 理由 |
|----|---------------------|------|
| 1 | `getStoreConfig` | 設定・店舗横断の前提を先に固める。 |
| 2 | `getCurrentBusinessDateKeyOrThrow` | 店舗営業日・状態の前提。 |
| 3 | `appendItem` | 会計・注文コアの冪等・不整合。 |
| 4 | `startAccounting`（repos + `accounting` Callable） | 会計フロー。 |
| 5 | `billsOnSettle` | 精算後続。 |
| 6 | `migrateSettledBillsForBusinessDay` | 分析移管。 |
| 7 | `executeMonthlyPayroll` | 給与バッチ。 |
| 8 | `runEnqueueTournamentTasks` | スケジュール投入。 |
| 9 | `runGenerateRecurringTournaments` | 定期生成全体。 |

**趣旨**: まず **設定 / 店舗営業日 / 会計コア** を固め、次に **会計後続・分析移管**、最後に **給与・スケジュール投入系**とする。

---

## 14. unknown から改名された functionEntry 群の扱い

- **undo\***（`undoBulkAddon` 等）: **第1弾個別指定には含めない**（調査結果）。`SERVICE_BY_FUNCTION_ENTRY` には **対応表に従い `tournament`** を付与。
- **`runGenerateRecurringTournaments`**: **第1弾に含める**（§12.3・§13）。
- **`createScheduledTournamentFromRecurrence`**: **後回し**寄り（対応表に `tournament_schedule` あり）。
- **`createInitialStateDoc`**: **本 changeSpec の対象外**（§4.2）。

---

## 15. 段階導入順（推奨・インフラ全体）

1. 型・`BASE_SEVERITY`・`CORRECTION_RULES`・`SERVICE_BY_FUNCTION_ENTRY` の定義（対応表と diff チェック）。
2. `inferErrorKey` + 単体テスト。
3. `resolveService` + **`unknown_service`** のログ確認用テスト。
4. `logOpsError` 統合（payload に `errorKey`, `service`, `baseSeverity`, `finalSeverity`, **`httpsErrorCode`**（該当時）。§8.3・§11）。
5. **会計 Callable**（`accounting.ts`）: 業務エラーを **`logOpsError` に残す**実装（§12.1）を、**第1弾または本実装の範囲で組み込む**。
6. **第1弾個別指定**は **§13 の順**で段階導入（**requestHash mismatch → `IDEMPOTENCY_CONFLICT`** を含む）。
7. ステージングで Cloud Logging サンプル確認。

---

## 16. 検証観点

- **`service`（payload）**: 出力値が **正式 `Service` 17 値のいずれか**、または **`unknown_service`** のみであること（§7.1・§11.2）。
- **`httpsErrorCode`**: `cause` が `HttpsError` のとき **payload 直下**に載り、**汎用 `code`** と役割が分かれていること（§8.3・§11）。
- `HttpsError` 各 `code` → 期待 `errorKey`（共通判定）。**requestHash mismatch** は **`IDEMPOTENCY_CONFLICT`**（個別指定）。
- 補正表どおり `(errorKey, service)` で **`finalSeverity` === `high`**（`service` が正式 17 値のとき）。
- 補正対象外・表外 `service` で **`finalSeverity` === `baseSeverity`**。
- **`service` === `unknown_service`** のとき **補正はかからず** `finalSeverity` === `baseSeverity`。
- **個別指定 > 共通判定**（**requestHash mismatch → `IDEMPOTENCY_CONFLICT`** は appendItem 系・`startAccounting` 系で一貫）。
- `getCurrentBusinessDateKeyOrThrow` の **CONFIG_ERROR / FAILED_PRECONDITION** 分岐。
- **未登録 `functionEntry`** → `unknown_service` がログに出る。
- **会計 Callable**: 業務エラー（`HttpsError` 含む）が **`logOpsError` に記録される**こと（§12.1）。
- **appendItem 系**: **`operation`** が通常 **`appendItem`**、投影 **`appendItemWithOrderProjection`** であること（§12.2）。
- Cloud Logging の **トップレベル `severity`**（ERROR）と **payload の `baseSeverity` / `finalSeverity`** が混同されないこと。
- 既存フィールドが壊れていない（後方互換）。

---

## 17. 人間判断事項 / 要確認事項

実装前〜実装中に **まだ列挙が未確定**のもの:

- **会計 Callable**（`accounting.ts`）の `FAILED_PRECONDITION` のうち、**個別指定マップに載せる具体ケース**（**意味が変わるものだけ**細分化。業務エラーは **`logOpsError` に残す**前提は §12.1 で確定）。

**備考（本 changeSpec の外）**: モニタアプリの閾値・UI・**連携タイミング**は §1.2・§4.2 のとおり別タスクとし、本書では詳細しない。

---

## 18. 要約

本 changeSpec は、`logOpsError` の `jsonPayload` に **`errorKey`**, **`service`**, **`baseSeverity`**, **`finalSeverity`**, **`httpsErrorCode`**（`HttpsError` 時）を追加し、**共通判定・個別指定・service 補正**を実装する。第1弾個別指定の対象は **§12.3**（**requestHash mismatch → `IDEMPOTENCY_CONFLICT`** を含む）、実装順は **§13**。**`createInitialStateDoc` は対象外**。**`getPayrollConfig` は `platform`**。**会計 Callable の業務エラーは `logOpsError` に残す**（§12.1）。

再確認（混同防止）:

1. **Cloud Logging**: トップレベル **`severity`** は従来どおりエラー行として **`ERROR`** 等（§11.2）。
2. **jsonPayload**: 運用重要度は **`baseSeverity`**（補正前）と **`finalSeverity`**（補正後）に載せる（`low` / `medium` / `high`）。
3. **`service`**: **正式 `Service` 17 値**または **`unknown_service`** のみ（§7.1・§11.2）。
4. **`HttpsError` コード**: payload 直下の **`httpsErrorCode`** を正とし、汎用 **`code`** と混同しない（§8.3）。
5. **requestHash mismatch**: **`IDEMPOTENCY_CONFLICT`**（appendItem 系・`startAccounting` 系で一貫。§12.1）。
6. **`appendItem` 系**: **`functionEntry` = `appendItem`** を維持し、**通常 `operation: 'appendItem'`**、**投影 `operation: 'appendItemWithOrderProjection'`**（§12.2）。
7. **会計 Callable**: 業務エラーも **`logOpsError` に残す**前提で設計する（§12.1）。
